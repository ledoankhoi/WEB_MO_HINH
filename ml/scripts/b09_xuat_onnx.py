"""B9. Xuất mô hình sang ONNX, nén, kiểm tra khớp với PyTorch, đóng gói cho trình duyệt (thí nghiệm E8).

1. Xuất ONNX (opset 17, batch động), kiểm tra bằng onnx.checker.
2. Các bản: fp32, fp16, int8 động (MatMul/Gemm), int8 tĩnh QDQ (hiệu chỉnh bằng ảnh train, MinMax và Entropy).
3. Mỗi bản: kích thước, top-1 / macro-F1 / ECE trên test, tỉ lệ top-1 trùng với PyTorch, chênh logits lớn nhất,
   thời gian suy luận một ảnh trên CPU bằng ONNX Runtime (trung vị và p95 qua 100 lần; 1 luồng như worker của web, và 4 luồng).
4. Chọn bản nhỏ nhất đạt tiêu chí (top-1 trùng ≥ 99%, top-1 giảm ≤ 1 điểm), cắt thành các phần ≤ 45 MB (Storage giới hạn 50 MB/file),
   ghi labels.json và model-card.json. Chưa tải lên Supabase (việc đó làm ở B10 khi chủ dự án duyệt).

Chạy:  ml/.venv/Scripts/python ml/scripts/b09_xuat_onnx.py --run <thư mục lần chạy B6>
       ml/.venv/Scripts/python ml/scripts/b09_xuat_onnx.py --smoke      # chạy thử với mô hình chạy thử của B6
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from robotrec.baselines import macro_f1  # noqa: E402
from robotrec.config import MANIFESTS, REPORTS, data_root  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.evaluate import calibration, fit_temperature, softmax  # noqa: E402
from robotrec.report import Report  # noqa: E402

PART_BYTES = 45 * 1024 * 1024


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_onnx(model, path: Path) -> str:
    """Xuất bằng bộ xuất TorchScript (ổn định với timm); lỗi thì thử bộ xuất dynamo. Trả về tên bộ xuất đã dùng."""
    import onnx
    import torch

    dummy = torch.zeros(1, 3, 224, 224)
    try:
        torch.onnx.export(model, (dummy,), str(path), opset_version=17, input_names=["pixel_values"], output_names=["logits"],
                          dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}}, dynamo=False)
        used = "TorchScript (dynamo=False)"
    except Exception as error:  # noqa: BLE001
        print(f"Bộ xuất TorchScript lỗi ({type(error).__name__}: {error}); thử dynamo", flush=True)
        batch = torch.export.Dim("batch", min=1, max=256)
        torch.onnx.export(model, (dummy,), str(path), opset_version=18, input_names=["pixel_values"], output_names=["logits"],
                          dynamic_shapes={"x": {0: batch}}, dynamo=True)
        used = "dynamo"
    onnx.checker.check_model(str(path), full_check=True)
    return used


class Calibration:
    """Bộ đọc dữ liệu hiệu chỉnh cho quantize_static: từng ảnh train đã qua đúng tiền xử lý của val/test."""

    def __init__(self, images: np.ndarray) -> None:
        self.images, self.index = images, 0

    def get_next(self):
        if self.index >= len(self.images):
            return None
        item = {"pixel_values": self.images[self.index : self.index + 1]}
        self.index += 1
        return item

    def rewind(self) -> None:
        self.index = 0


def load_tensors(rows: pd.DataFrame, meta: dict) -> np.ndarray:
    import torch

    from robotrec.train import ImageFiles, transforms_for

    dataset = ImageFiles([data_root() / "images" / "raw" / f for f in rows["file"]], np.zeros(len(rows), dtype=int),
                         transforms_for(meta["mean"], meta["std"], False, meta["image"]["size"], meta["image"]["resize"]))
    loader = torch.utils.data.DataLoader(dataset, batch_size=64, num_workers=4)
    return np.concatenate([x.numpy() for x, _ in loader]).astype(np.float32)


def ort_logits(path: Path, images: np.ndarray, threads: int = 0, batch: int = 32) -> np.ndarray:
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    if threads:
        options.intra_op_num_threads = threads
    session = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
    return np.concatenate([session.run(None, {"pixel_values": images[i : i + batch]})[0] for i in range(0, len(images), batch)]).astype(np.float64)


def latency(path: Path, image: np.ndarray, threads: int, runs: int = 100, warmup: int = 10) -> tuple[float, float]:
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
    feed = {"pixel_values": image[None]}
    for _ in range(warmup):
        session.run(None, feed)
    times = []
    for _ in range(runs):
        started = time.perf_counter()
        session.run(None, feed)
        times.append(1000 * (time.perf_counter() - started))
    return float(np.median(times)), float(np.quantile(times, 0.95))


def main() -> None:
    import torch

    parser = argparse.ArgumentParser()
    parser.add_argument("--run", help="thư mục lần chạy B6 (có best.pt, config.json)")
    parser.add_argument("--smoke", action="store_true", help="dùng mô hình chạy thử của B6, đánh giá trên một phần nhỏ")
    parser.add_argument("--limit", type=int, help="số ảnh val/test tối đa (để thử nhanh)")
    parser.add_argument("--calib", type=int, default=500, help="số ảnh train để hiệu chỉnh int8 tĩnh")
    args = parser.parse_args()
    from b06_huan_luyen import runs_root

    run = Path(args.run) if args.run else runs_root() / "b06-chay-thu" / "convnext_tiny-s42"
    if args.smoke:
        args.limit = args.limit or 512
        args.calib = min(args.calib, 100)
    meta = json.loads((run / "config.json").read_text(encoding="utf-8"))
    import timm

    model = timm.create_model(meta["timm"], pretrained=False, num_classes=len(meta["classes"]))
    model.load_state_dict(torch.load(run / "best.pt", map_location="cpu", weights_only=True))
    model.eval()
    b04 = json.loads((REPORTS / "B04" / "summary.json").read_text(encoding="utf-8"))
    model_id = f"robotrec-{meta['arch'].replace('_', '-')}-{b04['dataset_version'][:8]}-s{meta['seed']}" + ("-thu" if args.smoke else "")
    out = data_root() / "b09" / model_id
    out.mkdir(parents=True, exist_ok=True)
    env = environment()
    started_all = time.monotonic()

    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    classes = meta["classes"]
    index = {slug: i for i, slug in enumerate(classes)}
    rows = {}
    for name in ("val", "test"):
        part = splits[splits["split"] == name].reset_index(drop=True)
        if args.limit and args.limit < len(part):
            part = part.sample(args.limit, random_state=0).reset_index(drop=True)
        part["label"] = part["class"].map(index)
        rows[name] = part
    calib_rows = splits[splits["split"] == "train"].sample(args.calib, random_state=0).reset_index(drop=True)
    print("Đọc ảnh val, test, hiệu chỉnh...", flush=True)
    images = {name: load_tensors(part, meta) for name, part in rows.items()}
    calib_images = load_tensors(calib_rows, meta)
    y = {name: part["label"].to_numpy() for name, part in rows.items()}

    with torch.no_grad():
        reference = {name: torch.cat([model(torch.from_numpy(images[name][i : i + 64])) for i in range(0, len(images[name]), 64)]).double().numpy() for name in images}
    temperature = fit_temperature(reference["val"], y["val"])

    print("Xuất ONNX...", flush=True)
    fp32 = out / "fp32.onnx"
    exporter = export_onnx(model, fp32)
    from onnxruntime.quantization import CalibrationMethod, QuantFormat, QuantType, quantize_dynamic, quantize_static
    from onnxruntime.quantization.shape_inference import quant_pre_process
    from onnxruntime.transformers.float16 import convert_float_to_float16
    import onnx

    pre = out / "fp32-pre.onnx"
    quant_pre_process(str(fp32), str(pre))
    variants = {"fp32": fp32}
    fp16 = out / "fp16.onnx"
    onnx.save(convert_float_to_float16(onnx.load(str(fp32)), keep_io_types=True), str(fp16))
    variants["fp16"] = fp16
    dynamic = out / "int8-dynamic.onnx"
    quantize_dynamic(str(pre), str(dynamic), weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul", "Gemm"])
    variants["int8-dynamic"] = dynamic
    for method, label in ((CalibrationMethod.MinMax, "minmax"), (CalibrationMethod.Entropy, "entropy")):
        path = out / f"int8-static-{label}.onnx"
        try:
            quantize_static(str(pre), str(path), Calibration(calib_images), quant_format=QuantFormat.QDQ, per_channel=True,
                            activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8, calibrate_method=method,
                            op_types_to_quantize=["Conv", "MatMul", "Gemm"])
            variants[f"int8-static-{label}"] = path
        except Exception as error:  # noqa: BLE001
            print(f"int8 tĩnh ({label}) lỗi: {type(error).__name__}: {error}", flush=True)

    print("Đánh giá từng bản...", flush=True)
    ref_test = reference["test"]
    ref_pred = ref_test.argmax(1)
    results = {}
    for name, path in variants.items():
        logits = ort_logits(path, images["test"])
        pred = logits.argmax(1)
        lat1 = latency(path, images["test"][0], 1)
        lat4 = latency(path, images["test"][0], 4)
        results[name] = {
            "mb": path.stat().st_size / 1024**2, "top1": float((pred == y["test"]).mean()), "macro_f1": macro_f1(pred, y["test"], len(classes)),
            "ece": calibration(softmax(logits, temperature), y["test"])["ece"], "agree": float((pred == ref_pred).mean()),
            "max_diff": float(np.abs(logits - ref_test).max()), "lat1": lat1, "lat4": lat4,
        }
        print(f"  {name}: {results[name]['mb']:.1f} MB, top-1 {100 * results[name]['top1']:.2f}%, trùng {100 * results[name]['agree']:.2f}%, "
              f"1 luồng {lat1[0]:.1f} ms", flush=True)
    torch_top1 = float((ref_pred == y["test"]).mean())
    ok = {n: r for n, r in results.items() if r["agree"] >= 0.99 and torch_top1 - r["top1"] <= 0.01}
    chosen = min(ok, key=lambda n: results[n]["mb"]) if ok else "fp32"

    # Đóng gói bản được chọn
    package = out / "goi"
    package.mkdir(exist_ok=True)
    for old in package.glob("model.part*.onnx"):
        old.unlink()
    data = variants[chosen].read_bytes()
    parts = []
    for i in range(0, len(data), PART_BYTES):
        part = package / f"model.part{len(parts):02d}.onnx"
        part.write_bytes(data[i : i + PART_BYTES])
        parts.append({"name": part.name, "bytes": part.stat().st_size, "sha256": sha256(part)})
    robots = {r["slug"]: r for r in json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]}
    labels = [{"index": i, "slug": slug, "name": robots[slug]["display_name"], "character": robots[slug]["character"], "franchise": robots[slug]["franchise"],
               "series": robots[slug]["series"]} for i, slug in enumerate(classes)]
    (package / "labels.json").write_text(json.dumps(labels, ensure_ascii=False, indent=1), encoding="utf-8")
    b08 = REPORTS / "B08" / "summary.json"
    thresholds = None
    if b08.exists() and not args.smoke:
        b08_summary = json.loads(b08.read_text(encoding="utf-8"))
        seeds = [m for m in b08_summary.get("models", [])]
        position = next((i for i, m in enumerate(seeds) if f"hạt giống {meta['seed']}" in m), None)
        if position is not None:
            thresholds = b08_summary["rule"][position]["0.05"]["t"]
            temperature = b08_summary["temperature"][position]
    card = {
        "id": model_id, "label": f"{meta['label']} (hạt giống {meta['seed']})", "arch": meta["arch"], "timm": meta["timm"], "dataset_version": b04["dataset_version"],
        "classes": len(classes), "input": {"name": "pixel_values", "layout": "NCHW", "size": meta["image"]["size"], "resize_short_side": meta["image"]["resize"],
                                             "interpolation": "bilinear", "crop": "center", "scale": "0..1 rồi chuẩn hoá", "mean": meta["mean"], "std": meta["std"]},
        "output": {"name": "logits", "probabilities": "softmax(logits / temperature)"}, "temperature": temperature, "thresholds": thresholds,
        "variant": chosen, "files": parts, "mb": round(len(data) / 1024**2, 2), "metrics": {k: results[chosen][k] for k in ("top1", "macro_f1", "ece", "agree")},
        "smoke": bool(args.smoke), "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (package / "model-card.json").write_text(json.dumps(card, ensure_ascii=False, indent=1), encoding="utf-8")

    # Báo cáo
    report = Report("B09" + ("-chay-thu" if args.smoke else ""), "xuat-onnx", "Xuất và nén mô hình cho trình duyệt (thí nghiệm E8)" + (" — chạy thử" if args.smoke else ""))
    report.section(1)
    report.p("Đưa mô hình đã huấn luyện về dạng chạy được trong trình duyệt của khách (ONNX Runtime Web), nhỏ nhất có thể mà vẫn giữ độ chính xác; trả lời phần "
             "\"kích thước và tốc độ\" của RQ3.")
    if args.smoke:
        report.p(f"**Đây là lần chạy thử** với mô hình chạy thử của B6 (học trên 1.536 ảnh, 2 epoch) và {args.limit} ảnh val/test: chỉ để kiểm tra đường ống; "
                 "độ chính xác không có ý nghĩa, kích thước và thời gian thì có.")
    report.section(2)
    report.bullets([
        f"Đầu vào: `{run}` (best.pt, config.json); {len(rows['test'])} ảnh test, {len(rows['val'])} ảnh val (để chọn nhiệt độ T), {len(calib_rows)} ảnh train để hiệu chỉnh int8 tĩnh.",
        f"Đầu ra (ở `{out}`, không vào git): các file `.onnx`, thư mục `goi/` gồm {len(parts)} phần `model.partNN.onnx`, `labels.json`, `model-card.json`. "
        "Bản sao `model-card.json` và `labels.json` vào git ở `ml/reports/" + report.step + "/`.",
    ])
    report.section(3)
    report.environment(env)
    report.p("Thời gian suy luận đo trên CPU của máy này" + (" trong lúc GPU đang huấn luyện B6 (CPU bị chia sẻ, thời gian chỉ để tham khảo)" if args.smoke else "") + ".")
    report.section(4)
    report.bullets([
        f"**Xuất**: `torch.onnx.export`, bộ xuất {exporter}, opset 17, đầu vào `pixel_values` (N × 3 × 224 × 224), đầu ra `logits`, kích thước batch động; kiểm tra bằng `onnx.checker` (full_check).",
        "**fp16**: đổi trọng số và phép tính sang số thực 16 bit (`onnxruntime.transformers.float16`), giữ đầu vào và đầu ra fp32.",
        "**int8 động**: trọng số các phép MatMul/Gemm lưu 8 bit, kích hoạt lượng tử hoá lúc chạy (`quantize_dynamic`, QInt8). Đây là kiểu nén của mô hình CLIP đang chạy trên web.",
        f"**int8 tĩnh (QDQ)**: cả trọng số (theo từng kênh) và kích hoạt lưu 8 bit; khoảng giá trị của kích hoạt đo trên {len(calib_rows)} ảnh train theo hai cách: MinMax (lấy nhỏ nhất, lớn nhất) "
        "và Entropy (chọn ngưỡng cắt làm ít mất thông tin nhất). Trước khi nén chạy `quant_pre_process` (suy luận kích thước, gộp phép). "
        "Chỉ lượng tử hoá các phép Conv, MatMul, Gemm: lần chạy thử ngày 12/11 với cấu hình mặc định (lượng tử hoá cả các phép cộng phần dư và nhân "
        "hệ số tầng của ConvNeXt) làm logits lệch tới 5,3 và top-1 chỉ trùng PyTorch 1,6%; giới hạn như trên giảm độ lệch lớn nhất xuống 1,3.",
        "**So khớp**: chạy từng bản bằng ONNX Runtime (CPU) trên cùng ảnh test đã tiền xử lý như PyTorch; báo tỉ lệ ảnh có top-1 trùng với PyTorch và chênh logits lớn nhất.",
        f"**Thời gian**: một ảnh (batch 1), bỏ 10 lần đầu, đo 100 lần; trung vị và phân vị 95%. 1 luồng giống worker của web (`numThreads = 1`), 4 luồng để tham khảo.",
        "**Chọn bản**: bản nhỏ nhất có top-1 trùng PyTorch ≥ 99% và top-1 giảm không quá 1 điểm (tiêu chí B9 của kế hoạch).",
        f"**Đóng gói**: cắt file thành các phần ≤ 45 MB (Supabase Storage gói miễn phí giới hạn 50 MB/file); worker của web ghép lại theo thứ tự. "
        "`model-card.json` ghi mã mô hình, kiến trúc, phiên bản dữ liệu, cách tiền xử lý, nhiệt độ T, ngưỡng t₁–t₃ của B8, mã sha256 từng phần.",
    ])
    report.h3("Giải thích bằng lời thường")
    report.bullets([
        "**ONNX** là định dạng chung để chở mô hình từ PyTorch (nơi huấn luyện) sang trình duyệt (nơi chạy cho khách).",
        "**Nén 8 bit** giống lưu ảnh JPEG thay vì ảnh gốc: mỗi con số trong mô hình dùng 1 byte thay vì 4 byte, file nhỏ khoảng 4 lần, kết quả gần như không đổi. "
        "Phải đo lại để chắc \"gần như\" là bao nhiêu.",
        "**Cắt thành nhiều phần** vì nơi lưu file của web chỉ nhận file dưới 50 MB; trình duyệt tải từng phần rồi nối lại.",
    ])
    report.section(5)
    table = [[name, vn(r["mb"]), vn(100 * r["top1"], 2), vn(100 * r["macro_f1"], 2), vn(r["ece"], 3), vn(100 * r["agree"], 2), vn(r["max_diff"], 4),
              f"{vn(r['lat1'][0])} / {vn(r['lat1'][1])}", f"{vn(r['lat4'][0])} / {vn(r['lat4'][1])}", "**chọn**" if name == chosen else ""] for name, r in results.items()]
    columns = ["Bản", "Kích thước (MB)", "top-1 test (%)", "macro-F1 (%)", "ECE (sau T)", "top-1 trùng PyTorch (%)", "Chênh logits lớn nhất", "ms/ảnh, 1 luồng (trung vị / p95)",
               "ms/ảnh, 4 luồng", ""]
    report.table(table, columns, caption=f"Bảng 1. Các bản xuất (PyTorch fp32: top-1 {vn(100 * torch_top1, 2)}%)")
    report.table([[p["name"], vn(p["bytes"] / 1024**2, 2), p["sha256"][:16]] for p in parts], ["Phần", "MB", "sha256 (16 ký tự đầu)"], caption=f"Bảng 2. Gói của bản {chosen}")
    report.set("results", results)
    report.set("chosen", chosen)
    report.set("model_card", card)
    report.set("tables", {"Bảng 1. Các bản xuất": {"columns": columns[:-1], "rows": [row[:-1] for row in table]}})
    report.section(6)
    r = results[chosen]
    report.bullets([
        f"Bản được chọn: **{chosen}**, {vn(r['mb'])} MB ({len(parts)} phần), top-1 trùng PyTorch {vn(100 * r['agree'], 2)}%, top-1 {vn(100 * r['top1'], 2)}% so với "
        f"{vn(100 * torch_top1, 2)}% của PyTorch; một ảnh mất {vn(r['lat1'][0])} ms (1 luồng, CPU máy này).",
        f"So với fp32 ({vn(results['fp32']['mb'])} MB), bản được chọn nhỏ hơn {vn(results['fp32']['mb'] / r['mb'])} lần." if chosen != "fp32" else "Không bản nén nào đạt tiêu chí nên giữ fp32.",
        "fp16 trên CPU thường không nhanh hơn fp32 vì nhiều phép không có bản 16 bit trên CPU (ONNX Runtime chèn phép đổi kiểu); fp16 chỉ có lợi trên GPU (WebGPU).",
    ])
    report.section(7)
    report.bullets([
        "Thời gian đo bằng ONNX Runtime bản Python trên CPU máy tính; trong trình duyệt (WASM) chậm hơn, trên điện thoại chậm hơn nữa. Số đo thật trên trình duyệt làm ở B11.",
        "Tiền xử lý ở trình duyệt (thu nhỏ bằng canvas) có thể khác Pillow một chút; B11 kiểm tra khớp Python và trình duyệt trên 20 ảnh mẫu.",
        "int8 tĩnh phụ thuộc ảnh hiệu chỉnh; ảnh khách gửi khác miền có thể làm sai số lượng tử lớn hơn.",
    ])
    report.section(8)
    report.reproduce([f"ml/.venv/Scripts/python ml/scripts/b09_xuat_onnx.py --run \"{run}\"" + (" --smoke" if args.smoke else "")], seed=0,
                     dataset_version=f"b04_splits.csv sha256 {b04['dataset_version'][:12]}")
    path = report.write()
    for name in ("model-card.json", "labels.json"):
        (REPORTS / report.step / name).write_text((package / name).read_text(encoding="utf-8"), encoding="utf-8")
    print(path, f"| {(time.monotonic() - started_all) / 60:.1f} phút")


if __name__ == "__main__":
    main()
