"""B6, báo cáo: tổng hợp các lần chạy của `b06_huan_luyen.py` thành báo cáo B06 (đường học, so sánh kiến trúc, McNemar).

Đọc `<ROBOTREC_RUNS>/b06/*/` (history.csv, result.json, val_logits.npy, config.json). Chạy được khi mới xong một phần:
báo cáo ghi rõ lần chạy nào chưa xong. Chỉ dùng val; test để dành cho B8.

Chạy: ml/.venv/Scripts/python ml/scripts/b06_bao_cao.py [--smoke]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from b06_huan_luyen import runs_root  # noqa: E402
from robotrec.baselines import macro_f1, topk_correct  # noqa: E402
from robotrec.config import MANIFESTS, config_hash, data_root, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.report import Report  # noqa: E402
from robotrec.stats import holm, mcnemar, mean_std, paired_bootstrap_diff  # noqa: E402

COLORS = {"convnext_tiny": "#c2410c", "efficientnetv2_s": "#0f766e", "vit_b16_clip": "#1d4ed8"}


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def pv(p: float) -> str:
    return "< 0,001" if p < 0.001 else f"{p:.3f}".replace(".", ",")


def ms(values: list[float], digits: int = 2) -> str:
    if len(values) == 1:
        return vn(100 * values[0], digits) + " (1 lần chạy)"
    mean, std = mean_std(values)
    return f"{vn(100 * mean, digits)} ± {vn(100 * std, digits)}"


def complexity(timm_name: str, n_classes: int) -> dict:
    """Số tham số, GFLOPs (một ảnh 224×224, đếm bằng torch.utils.flop_counter; 1 phép nhân-cộng = 2 FLOP), số tầng có trọng số."""
    import timm
    import torch
    from torch.utils.flop_counter import FlopCounterMode

    model = timm.create_model(timm_name, pretrained=False, num_classes=n_classes).eval()
    with torch.no_grad(), FlopCounterMode(display=False) as counter:
        model(torch.zeros(1, 3, 224, 224))
    layers = sum(1 for m in model.modules() if isinstance(m, (torch.nn.Conv2d, torch.nn.Linear)))
    return {"params": sum(p.numel() for p in model.parameters()), "gflops": counter.get_total_flops() / 1e9, "layers": layers}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true", help="tổng hợp các lần chạy thử (b06-chay-thu)")
    args = parser.parse_args()
    cfg = load_config("b06_huan_luyen")
    folder = runs_root() / ("b06-chay-thu" if args.smoke else "b06")
    env = environment()
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    b04 = json.loads((Path(__file__).resolve().parents[1] / "reports" / "B04" / "summary.json").read_text(encoding="utf-8"))
    label_of_key = dict(zip(splits["key"], splits["class"]))

    runs = []
    for arch in cfg["order"]:
        for seed in cfg["seeds"]:
            path = folder / f"{arch}-s{seed}"
            if not (path / "config.json").exists():
                runs.append({"arch": arch, "seed": seed, "status": "chưa chạy"})
                continue
            meta = json.loads((path / "config.json").read_text(encoding="utf-8"))
            history = pd.read_csv(path / "history.csv") if (path / "history.csv").exists() else pd.DataFrame()
            result = json.loads((path / "result.json").read_text(encoding="utf-8")) if (path / "result.json").exists() else None
            entry = {"arch": arch, "seed": seed, "meta": meta, "history": history, "status": "xong" if result and result.get("finished") else "đang chạy", "result": result}
            if entry["status"] == "xong":
                keys = json.loads((path / "val_keys.json").read_text(encoding="utf-8"))
                classes = {slug: i for i, slug in enumerate(meta["classes"])}
                entry["y"] = np.array([classes[label_of_key[k]] for k in keys])
                entry["keys"] = keys
                entry["logits"] = np.load(path / "val_logits.npy")
            runs.append(entry)
    done = [r for r in runs if r["status"] == "xong"]
    if not done:
        raise SystemExit(f"Chưa có lần chạy nào xong trong {folder}")
    n_classes = len(done[0]["meta"]["classes"])
    labels = {a: s["label"] for a, s in cfg["architectures"].items()}
    archs = [a for a in cfg["order"] if any(r["arch"] == a for r in done)]

    report = Report("B06" + ("-chay-thu" if args.smoke else ""), "huan-luyen", "Huấn luyện chính: tinh chỉnh ba kiến trúc (thí nghiệm E2)" + (" — chạy thử" if args.smoke else ""))
    report.section(1)
    report.p(
        "Tinh chỉnh toàn bộ ba mạng đã huấn luyện sẵn (hai CNN và một Transformer) trên tập train của B4 để nhận dạng các lớp robot đã biết; mỗi kiến trúc chạy "
        "3 lần với 3 hạt giống để đo độ dao động. So sánh kiến trúc trên **val** (độ chính xác, kích thước, số phép tính) để chọn mô hình chính (RQ3), và so với "
        "mốc linear probe của B5 (RQ2, bản cuối trên test ở B8)."
    )
    if args.smoke:
        report.p("**Đây là lần chạy thử** trên một phần nhỏ dữ liệu và 2 epoch, chỉ để kiểm tra đường ống và đo tốc độ; các con số không có ý nghĩa về độ chính xác.")
    report.p(f"**Số liệu tạm**: dữ liệu là bản tạm `{b04['dataset_version'][:12]}` của B4 (chưa có nhãn tay của B3).")
    report.section(2)
    report.bullets(
        [
            f"Đầu vào: `b04_splits.csv.gz` (mã `{b04['dataset_version'][:12]}`), tập train ({done[0]['meta']['train_images']} ảnh) và val ({done[0]['meta']['val_images']} ảnh) của {n_classes} lớp đã biết.",
            f"Đầu ra của mỗi lần chạy (ở `{folder}`, không vào git): `best.pt` (trọng số tốt nhất), `history.csv` (số liệu từng epoch), `val_logits.npy`, `config.json`, `result.json`.",
            "Bản tóm tắt vào git: báo cáo này, `ml/reports/B06/summary.json`, hình `ml/reports/B06/*.png`.",
        ]
    )
    report.section(3)
    report.environment(env)
    gpus = sorted({r["meta"]["environment"]["gpu"]["devices"][0]["name"] for r in runs if "meta" in r and r["meta"]["environment"]["gpu"].get("devices")})
    report.p("GPU của các lần chạy: " + (", ".join(gpus) or "không rõ") + ". Bảng môi trường ở trên là của máy sinh báo cáo.")

    report.section(4)
    t = cfg["train"]
    report.bullets(
        [
            "**Kiến trúc** (trọng số của `timm`): " + "; ".join(f"{s['label']} (`{s['timm']}`)" for s in cfg["architectures"].values()) + ". "
            "Đầu phân loại mới (một tầng tuyến tính, số đầu ra bằng số lớp) thay cho đầu cũ.",
            "**Ảnh vào khi huấn luyện**: RandomResizedCrop 224 (tỉ lệ diện tích 0,35–1), lật ngang, RandAugment (2 phép, cường độ 9), ColorJitter 0,3 (độ sáng, tương phản, "
            "bão hoà), RandomErasing (p = 0,25); chuẩn hoá theo mean/std của trọng số gốc. **Val**: thu cạnh ngắn về 256 bằng song tuyến, cắt giữa 224 (giống cách trình duyệt sẽ làm ở B11).",
            f"**Hàm mất mát**: cross-entropy có làm trơn nhãn ε = {t['label_smoothing']}: nhãn đúng nhận 1 − ε + ε/C, mỗi lớp khác ε/C.",
            f"**Lấy mẫu cân bằng lớp**: mỗi epoch rút {done[0]['meta']['train_images']} ảnh có hoàn lại, lớp c được chọn với xác suất tỉ lệ n_c^{t['sampler_power']} "
            "(trọng số mỗi ảnh n_c^−0,5), để lớp đông ảnh không lấn át.",
            f"**Hai pha.** Pha 1 ({t['epochs_head']} epoch): thân mạng đóng băng, chỉ học đầu phân loại, AdamW tốc độ học {t['lr_head']:g}. Pha 2: tinh chỉnh toàn mạng, AdamW "
            f"(β = {t['betas'][0]}, {t['betas'][1]}; weight decay {t['weight_decay']}, không áp cho bias và tham số chuẩn hoá), tốc độ học "
            + "; ".join(f"{s['label']} {s['lr']:g}" + (f" với suy giảm theo tầng {s['layer_decay']}" if s["layer_decay"] else "") for s in cfg["architectures"].values())
            + f". Khởi động tuyến tính {t['warmup_epochs']} epoch rồi giảm theo cosine tới epoch {t['epochs_max']}.",
            "**Suy giảm theo tầng** (ViT): tầng thứ i tính từ đầu ra có tốc độ học lr · 0,75^i, nên tầng gần ảnh (đã học tốt từ CLIP) thay đổi ít, tầng gần đầu ra thay đổi nhiều.",
            f"**Khác**: mỗi bước tối ưu {t['batch_size']} ảnh; GPU dưới 10 GB thì chia thành 2 micro-batch 32 ảnh và cộng dồn gradient. fp16 (AMP), cắt gradient theo chuẩn {t['grad_clip']}, "
            f"cuDNN tất định. Tối đa {t['epochs_max']} epoch; **dừng sớm** khi macro-F1 trên val không tăng {t['patience']} epoch liền; giữ trọng số của epoch có macro-F1 val cao nhất.",
            f"**Hạt giống**: {', '.join(str(s) for s in cfg['seeds'])}. Hạt giống quyết định khởi tạo đầu phân loại, thứ tự lấy mẫu và tăng cường dữ liệu.",
            "**Độ phức tạp**: số tham số; GFLOPs của một ảnh 224×224 đếm bằng `torch.utils.flop_counter` (1 phép nhân-cộng = 2 FLOP; tài liệu gốc của các mạng thường ghi "
            "số phép nhân-cộng, bằng một nửa); số tầng có trọng số (Conv2d và Linear).",
            "**So sánh**: trung bình ± độ lệch chuẩn qua 3 hạt giống; kiểm định McNemar giữa hai kiến trúc tốt nhất trên cùng ảnh val, từng cặp cùng hạt giống, p hiệu chỉnh Holm.",
            "**Khác kế hoạch**: (1) GFLOPs đếm bằng `torch.utils.flop_counter` có sẵn trong PyTorch thay cho `fvcore` (không cần cài thêm); (2) cộng dồn gradient khi GPU nhỏ; "
            "với EfficientNetV2-S (có BatchNorm) thống kê chuẩn hoá vì thế tính trên 32 ảnh thay vì 64.",
        ]
    )
    report.h3("Giải thích bằng lời thường")
    report.bullets(
        [
            "**Tinh chỉnh** (fine-tuning): lấy một mạng đã học nhận biết hàng triệu ảnh đời thường, rồi dạy thêm cho nó phân biệt các robot. Giống một người đã biết vẽ, giờ học thêm vẽ robot.",
            "**Epoch**: một lượt mô hình xem hết tập train. **Đường học**: điểm trên val sau mỗi epoch; đi lên rồi chững lại là bình thường, đi xuống là mô hình bắt đầu học thuộc lòng (quá khớp).",
            "**Hai pha**: lúc đầu chỉ học lớp cuối để không làm hỏng phần đã học sẵn, sau đó mới cho cả mạng học với tốc độ nhỏ.",
            "**Tăng cường dữ liệu**: mỗi lần xem, ảnh bị cắt, lật, đổi màu, che một mảng ngẫu nhiên, để mô hình nhận ra robot dù chụp kiểu gì chứ không thuộc lòng từng ảnh.",
            "**Làm trơn nhãn**: không bắt mô hình chắc chắn 100%, giúp độ tin nó báo ra sát thực tế hơn.",
            "**Ba hạt giống**: chạy lại ba lần với ba cách xáo trộn khác nhau; nếu kết quả gần nhau thì kết luận đáng tin, nếu lệch nhiều thì chênh lệch nhỏ giữa hai kiến trúc chưa nói lên gì.",
        ]
    )

    report.section(5)
    status_rows = []
    for r in runs:
        if r["status"] == "chưa chạy":
            status_rows.append([labels[r["arch"]], r["seed"], r["status"], "—", "—", "—", "—", "—"])
            continue
        h = r["history"]
        best = r["result"]["best"] if r["result"] else (h.loc[h["val_macro_f1"].idxmax()].to_dict() if len(h) else {})
        status_rows.append([labels[r["arch"]], r["seed"], r["status"], len(h), int(best.get("epoch", 0)) if best else "—",
                            vn(100 * best["val_macro_f1"], 2) if best else "—", vn(h["seconds"].sum() / 3600, 2) if len(h) else "—",
                            "có" if r["result"] and r["result"].get("stopped_early") else "không"])
    status_columns = ["Kiến trúc", "Hạt giống", "Trạng thái", "Số epoch đã chạy", "Epoch tốt nhất", "macro-F1 val tốt nhất (%)", "Giờ GPU", "Dừng sớm"]
    report.table(status_rows, status_columns, caption="Bảng 1. Các lần chạy")
    gpu_hours = sum(r["history"]["seconds"].sum() for r in runs if "history" in r and len(r["history"])) / 3600
    report.p(f"Tổng thời gian huấn luyện (cả đánh giá val mỗi epoch): {vn(gpu_hours, 2)} giờ GPU.")

    comp = {a: complexity(cfg["architectures"][a]["timm"], n_classes) for a in archs}
    arch_rows, by_arch = [], {}
    for a in archs:
        seeds_done = [r for r in done if r["arch"] == a]
        top1 = [float((r["logits"].argmax(1) == r["y"]).mean()) for r in seeds_done]
        top5 = [float(topk_correct(r["logits"], r["y"], 5).mean()) for r in seeds_done]
        f1 = [macro_f1(r["logits"].argmax(1), r["y"], n_classes) for r in seeds_done]
        by_arch[a] = {"top1": top1, "top5": top5, "macro_f1": f1, "seeds": [r["seed"] for r in seeds_done]}
        arch_rows.append([labels[a], len(seeds_done), ms(top1), ms(top5), ms(f1), vn(comp[a]["params"] / 1e6), vn(comp[a]["gflops"], 2), comp[a]["layers"],
                          vn(float(np.mean([r["result"]["best"]["epoch"] for r in seeds_done])))])
    arch_columns = ["Kiến trúc", "Số lần chạy xong", "top-1 val (%)", "top-5 val (%)", "macro-F1 val (%)", "Tham số (triệu)", "GFLOPs / ảnh", "Số tầng có trọng số", "Epoch tốt nhất (TB)"]
    report.table(arch_rows, arch_columns, caption="Bảng 2. So sánh kiến trúc trên val (trung bình ± độ lệch chuẩn qua các hạt giống)")

    seed_rows = [[labels[r["arch"]], r["seed"], vn(100 * float((r["logits"].argmax(1) == r["y"]).mean()), 2), vn(100 * float(topk_correct(r["logits"], r["y"], 5).mean()), 2),
                  vn(100 * macro_f1(r["logits"].argmax(1), r["y"], n_classes), 2), r["result"]["best"]["epoch"]] for r in done]
    seed_columns = ["Kiến trúc", "Hạt giống", "top-1 val (%)", "top-5 val (%)", "macro-F1 val (%)", "Epoch tốt nhất"]
    report.table(seed_rows, seed_columns, caption="Bảng 3. Từng lần chạy (trọng số của epoch tốt nhất)")

    # Đường học: trung bình ± độ lệch chuẩn qua các hạt giống
    fig, axes = plt.subplots(1, 3, figsize=(13, 3.4))
    for a in archs:
        histories = [r["history"] for r in runs if r["arch"] == a and "history" in r and len(r["history"])]
        longest = max(len(h) for h in histories)
        for ax, column, scale in ((axes[0], "val_macro_f1", 100), (axes[1], "train_loss", 1), (axes[2], "val_loss", 1)):
            matrix = np.full((len(histories), longest), np.nan)
            for i, h in enumerate(histories):
                matrix[i, : len(h)] = h[column].to_numpy() * scale
            mean = np.nanmean(matrix, axis=0)
            std = np.nanstd(matrix, axis=0, ddof=1) if len(histories) > 1 else np.zeros(longest)
            epochs = np.arange(1, longest + 1)
            ax.plot(epochs, mean, color=COLORS[a], label=labels[a])
            ax.fill_between(epochs, mean - np.nan_to_num(std), mean + np.nan_to_num(std), color=COLORS[a], alpha=0.18)
    for ax, title in zip(axes, ("macro-F1 trên val (%)", "loss trên train (có làm trơn nhãn, ảnh đã tăng cường)", "loss trên val (cross-entropy)")):
        ax.set_title(title, fontsize=9)
        ax.set_xlabel("epoch")
        ax.axvline(cfg["train"]["epochs_head"] + 0.5, color="#94a3b8", linestyle=":", linewidth=1)
    axes[0].legend(fontsize=8)
    fig.tight_layout()
    report.figure(fig, "duong-hoc", "Đường học: đường là trung bình qua các hạt giống, dải là ± 1 độ lệch chuẩn; vạch chấm: hết pha 1 (chỉ học đầu phân loại)")
    plt.close(fig)

    # McNemar giữa hai kiến trúc tốt nhất, từng cặp cùng hạt giống
    ranked = sorted(archs, key=lambda a: -np.mean(by_arch[a]["macro_f1"]))
    compare_rows, compare_p = [], []
    pairs = []
    if len(ranked) >= 2:
        first, second = ranked[0], ranked[1]
        for seed in cfg["seeds"]:
            ra = next((r for r in done if r["arch"] == first and r["seed"] == seed), None)
            rb = next((r for r in done if r["arch"] == second and r["seed"] == seed), None)
            if ra and rb and ra["keys"] == rb["keys"]:
                pairs.append((f"{labels[first]} so với {labels[second]}, hạt giống {seed}", ra["logits"].argmax(1) == ra["y"], rb["logits"].argmax(1) == rb["y"]))
    b05_path = data_root() / "b05" / "eval" / "clip-l14-pred.npz"
    b05_best = None
    if b05_path.exists() and not args.smoke:
        b05 = np.load(b05_path)
        key = next((k for k in b05.files if k.startswith("lp|") and k.endswith("|val")), None)
        if key:
            b05_best = (b05[key], key)
            for seed in cfg["seeds"]:
                ra = next((r for r in done if r["arch"] == ranked[0] and r["seed"] == seed), None)
                if ra:
                    pairs.append((f"{labels[ranked[0]]} (hạt giống {seed}) so với linear probe CLIP ViT-L/14 của B5", ra["logits"].argmax(1) == ra["y"], b05[key] == ra["y"]))
    tests = [mcnemar(a, b) for _, a, b in pairs]
    adjusted = holm([x.p_value for x in tests]) if tests else []
    for (title, a, b), x, p_adj in zip(pairs, tests, adjusted):
        diff = paired_bootstrap_diff(a, b, 1000, seed=0)
        compare_rows.append([title, f"{vn(100 * diff.estimate)} [{vn(100 * diff.low)}; {vn(100 * diff.high)}]", x.b, x.c, pv(x.p_value), pv(p_adj)])
        compare_p.append(p_adj)
    compare_columns = ["So sánh trên val (A so với B)", "Hiệu top-1, điểm % [KTC 95%]", "A đúng, B sai", "A sai, B đúng", "p (McNemar)", "p sau Holm"]
    if compare_rows:
        report.table(compare_rows, compare_columns, caption="Bảng 4. So sánh có kiểm định trên val")

    # Chọn mô hình chính
    choice, reason = ranked[0], "macro-F1 trung bình trên val cao nhất"
    if len(ranked) >= 2:
        lighter = [a for a in ranked[1:] if comp[a]["params"] < comp[ranked[0]]["params"]]
        arch_pairs = [p for p in compare_rows[: len(cfg["seeds"])]] if compare_rows else []
        if lighter and lighter[0] == ranked[1] and arch_pairs and all(float(str(r[5]).replace("< ", "").replace(",", ".")) >= 0.05 for r in arch_pairs):
            choice, reason = ranked[1], f"không kém {labels[ranked[0]]} một cách có ý nghĩa thống kê (mọi cặp cùng hạt giống có p sau Holm ≥ 0,05) mà nhẹ hơn"
    report.p(f"**Mô hình chính đề xuất: {labels[choice]}** ({reason}). Luật chọn: lấy kiến trúc có macro-F1 val trung bình cao nhất; nếu kiến trúc đứng thứ hai nhẹ hơn và "
             "không kém có ý nghĩa thống kê ở mọi cặp cùng hạt giống thì chọn kiến trúc nhẹ hơn, vì mô hình chạy trong trình duyệt (RQ3). Quyết định cuối do chủ dự án duyệt.")

    report.set("dataset_version", b04["dataset_version"])
    report.set("smoke", bool(args.smoke))
    report.set("runs", [{"arch": r["arch"], "seed": r["seed"], "status": r["status"], **({"best": r["result"]["best"], "epochs": r["result"]["epochs"]} if r.get("result") else {})} for r in runs])
    report.set("by_arch", {a: {**by_arch[a], **comp[a]} for a in archs})
    report.set("choice", choice)
    report.set("tables", {
        "Bảng 1. Các lần chạy": {"columns": status_columns, "rows": status_rows},
        "Bảng 2. So sánh kiến trúc trên val": {"columns": arch_columns, "rows": arch_rows},
        "Bảng 3. Từng lần chạy": {"columns": seed_columns, "rows": seed_rows},
        **({"Bảng 4. So sánh có kiểm định trên val": {"columns": compare_columns, "rows": compare_rows}} if compare_rows else {}),
    })

    report.section(6)
    analysis = [f"Đã xong {len(done)}/{len(runs)} lần chạy, tổng {vn(gpu_hours, 2)} giờ GPU."]
    for a in ranked:
        analysis.append(f"{labels[a]}: macro-F1 val {ms(by_arch[a]['macro_f1'])}%, top-1 {ms(by_arch[a]['top1'])}%; {vn(comp[a]['params'] / 1e6)} triệu tham số, {vn(comp[a]['gflops'], 2)} GFLOPs.")
    if b05_best is not None:
        lp_top1 = float((b05_best[0] == done[0]["y"]).mean()) if len(b05_best[0]) == len(done[0]["y"]) else float("nan")
        analysis.append(f"Mốc của B5 (linear probe trên đặc trưng CLIP ViT-L/14 đóng băng) đạt top-1 val {vn(100 * lp_top1, 2)}%; hiệu so với mô hình tinh chỉnh tốt nhất ở bảng 4.")
    for a in archs:
        gaps = [float(r["history"].loc[r["history"]["val_macro_f1"].idxmax(), "train_top1"] - r["result"]["best"]["val_top1"]) for r in done if r["arch"] == a]
        analysis.append(f"{labels[a]}: top-1 trên ảnh train đã tăng cường trừ top-1 val ở epoch tốt nhất = {vn(100 * float(np.mean(gaps)))} điểm (dương lớn là dấu hiệu quá khớp; "
                        "ảnh train bị tăng cường nên khó hơn ảnh val, khoảng này thường nhỏ hơn khoảng thật).")
    report.bullets(analysis)
    report.section(7)
    report.bullets(
        [
            "Số liệu trên bản dữ liệu tạm; ảnh sai nhãn còn sót trong cả train lẫn val.",
            "Mô hình và epoch được chọn theo val nên con số val hơi lạc quan; con số để báo cáo là trên test ở B8 (chỉ chạy một lần).",
            "3 hạt giống là ít để ước lượng độ lệch chuẩn; khoảng dao động thật có thể lớn hơn.",
            "Các siêu tham số (tốc độ học, số epoch, tăng cường) lấy theo kế hoạch, chưa dò; mỗi kiến trúc có thể chưa ở điểm tốt nhất của nó. Ảnh hưởng của từng yếu tố đo ở B7.",
            "Thời gian huấn luyện phụ thuộc GPU (máy này hay Colab) nên chỉ so được giữa các lần chạy trên cùng GPU.",
        ]
    )
    report.section(8)
    report.reproduce(
        ["ml/.venv/Scripts/python ml/scripts/b06_huan_luyen.py --all" + (" --smoke" if args.smoke else ""), "ml/.venv/Scripts/python ml/scripts/b06_bao_cao.py" + (" --smoke" if args.smoke else "")],
        config="ml/configs/b06_huan_luyen.yaml", config_hash=config_hash(cfg), seed=None, dataset_version=f"b04_splits.csv sha256 {b04['dataset_version'][:12]}",
    )
    print(report.write())


if __name__ == "__main__":
    main()
