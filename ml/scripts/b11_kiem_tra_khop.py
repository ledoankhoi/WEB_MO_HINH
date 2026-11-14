"""B11. Chuẩn bị kiểm tra khớp Python – trình duyệt trên ảnh thật (kế hoạch B11: 20 ảnh, top-1 phải trùng 100%).

Chọn 20 ảnh test (rải đều franchise và miền ảnh, hạt giống cố định), giải mã bằng PIL như lúc huấn luyện rồi ghi điểm ảnh RGB thô
(`img_XX.rgb`) để phía JavaScript đọc đúng cùng điểm ảnh, không lệch do bộ giải mã JPEG khác nhau. Ghi kèm logits của PyTorch (best.pt)
và của ONNX Runtime Python (bản đã đóng gói của B9). Phía web chạy `test/recognition-parity.test.ts` (ONNX Runtime Web, WASM như worker
của trình duyệt) với biến môi trường RECOGNITION_PARITY_DIR trỏ vào thư mục này, rồi ghi `ket-qua-web.json`.

Ảnh chỉ nằm ở thư mục dữ liệu (ROBOTREC_DATA), không vào git.

Chạy: ml/.venv/Scripts/python ml/scripts/b11_kiem_tra_khop.py --run <lần chạy B6> --package <thư mục goi/ của B9>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from robotrec.config import MANIFESTS, data_root  # noqa: E402


def main() -> None:
    import onnxruntime as ort
    import timm
    import torch
    from PIL import Image

    from robotrec.train import transforms_for

    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True, help="thư mục lần chạy B6 (best.pt, config.json)")
    parser.add_argument("--package", required=True, help="thư mục goi/ của B9 (model.partNN.onnx, labels.json, model-card.json)")
    parser.add_argument("--n", type=int, default=20)
    parser.add_argument("--out", help="thư mục ghi (mặc định <ROBOTREC_DATA>/b11/khop)")
    args = parser.parse_args()
    run, package = Path(args.run), Path(args.package)
    out = Path(args.out) if args.out else data_root() / "b11" / "khop"
    out.mkdir(parents=True, exist_ok=True)

    meta = json.loads((run / "config.json").read_text(encoding="utf-8"))
    card = json.loads((package / "model-card.json").read_text(encoding="utf-8"))
    labels = json.loads((package / "labels.json").read_text(encoding="utf-8"))
    assert [label["slug"] for label in labels] == meta["classes"], "labels.json không cùng thứ tự lớp với lần chạy"

    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    test = splits[splits["split"] == "test"]
    # Rải đều theo franchise và miền ảnh, hạt giống cố định
    groups = [g.sample(frac=1, random_state=0) for _, g in test.groupby(["franchise", "domain"], sort=True)]
    picked = []
    while len(picked) < args.n and any(len(g) for g in groups):
        for i, g in enumerate(groups):
            if len(g) and len(picked) < args.n:
                picked.append(g.iloc[0])
                groups[i] = g.iloc[1:]
    rows = pd.DataFrame(picked).reset_index(drop=True)

    model = timm.create_model(meta["timm"], pretrained=False, num_classes=len(meta["classes"]))
    model.load_state_dict(torch.load(run / "best.pt", map_location="cpu", weights_only=True))
    model.eval()
    preprocess = transforms_for(meta["mean"], meta["std"], False, meta["image"]["size"], meta["image"]["resize"])
    onnx_bytes = b"".join((package / part["name"]).read_bytes() for part in card["files"])
    session = ort.InferenceSession(onnx_bytes, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    images = []
    for i, row in rows.iterrows():
        with Image.open(data_root() / "images" / "raw" / row["file"]) as image:
            rgb = image.convert("RGB")
        raw = np.asarray(rgb, dtype=np.uint8)
        (out / f"img_{i:02d}.rgb").write_bytes(raw.tobytes())
        tensor = preprocess(rgb)
        with torch.no_grad():
            logits_torch = model(tensor[None]).double().numpy()[0]
        logits_onnx = session.run(None, {input_name: tensor[None].numpy().astype(np.float32)})[0][0].astype(np.float64)
        images.append({"file": f"img_{i:02d}.rgb", "width": rgb.width, "height": rgb.height, "label": row["class"], "domain": row.get("domain", ""),
                       "logits_torch": [round(float(v), 6) for v in logits_torch], "logits_onnx": [round(float(v), 6) for v in logits_onnx]})
        print(f"{i + 1}/{len(rows)} {row['class']} {rgb.width}×{rgb.height}", flush=True)

    (out / "khop.json").write_text(json.dumps({
        "model": card["id"], "variant": card["variant"], "parts": [str((package / part["name"]).resolve()) for part in card["files"]],
        "input": {"size": card["input"]["size"], "resize": card["input"]["resize_short_side"], "mean": card["input"]["mean"], "std": card["input"]["std"]},
        "images": images,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"Đã ghi {len(images)} ảnh vào {out}. Bước sau: RECOGNITION_PARITY_DIR={out} npx vitest run test/recognition-parity.test.ts")


if __name__ == "__main__":
    main()
