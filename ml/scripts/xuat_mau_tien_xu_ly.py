"""Sinh bộ ca mẫu để kiểm tra tiền xử lý ảnh của web (src/lib/recognition-preprocess.ts) cho kết quả giống hệt lúc huấn luyện.

Ảnh mẫu sinh bằng công thức (hoa văn có tần số cao, nhiễu giả ngẫu nhiên) mà phía JavaScript sinh lại được y hệt, nên không cần
đưa ảnh thật vào git. Mỗi ca chạy đúng phép biến đổi val/test của ml/robotrec/train.py (Resize song tuyến của torchvision trên ảnh PIL,
CenterCrop, ToTensor, Normalize) và ghi mã SHA-256 của ảnh 8 bit sau khi cắt, cùng vài giá trị của tensor.

Chạy: ml/.venv/Scripts/python ml/scripts/xuat_mau_tien_xu_ly.py   (ghi test/fixtures/recognition-preprocess.json)
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import numpy as np  # noqa: E402
import PIL  # noqa: E402
import torch  # noqa: E402
import torchvision  # noqa: E402
from PIL import Image  # noqa: E402

from robotrec.config import REPO_ROOT  # noqa: E402
from robotrec.train import transforms_for  # noqa: E402

CLIP_MEAN = (0.48145466, 0.4578275, 0.40821073)
CLIP_STD = (0.26862954, 0.26130258, 0.27577711)
CASES = [  # (rộng, cao, kiểu, hạt giống)
    (97, 61, "pattern", 1),  # nhỏ hơn 256: phóng to
    (300, 260, "noise", 2),
    (640, 360, "pattern", 3),
    (361, 641, "noise", 4),  # cạnh lẻ: thử làm tròn của CenterCrop
    (256, 256, "pattern", 5),
    (1600, 1200, "noise", 6),  # thu nhỏ mạnh: bộ lọc giãn rộng
    (1080, 1920, "pattern", 7),
]


def make_image(width: int, height: int, kind: str, seed: int) -> np.ndarray:
    """Phải khớp với makeImage() trong test/recognition-preprocess.test.ts."""
    if kind == "pattern":
        y, x = np.mgrid[0:height, 0:width].astype(np.int64)
        channels = [((x * x * 3 + y * 7 + c * 85 + ((x * 31) ^ (y * 17)) + seed) & 255) for c in range(3)]
        return np.stack(channels, axis=-1).astype(np.uint8)
    out = np.empty(width * height * 3, dtype=np.uint8)
    state = seed
    for i in range(out.size):  # LCG 32 bit, lấy byte cao
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        out[i] = state >> 24
    return out.reshape(height, width, 3)


def main() -> None:
    preprocess = transforms_for(CLIP_MEAN, CLIP_STD, train=False)
    resize, crop = preprocess.transforms[0], preprocess.transforms[1]
    cases = []
    for width, height, kind, seed in CASES:
        image = Image.fromarray(make_image(width, height, kind, seed), mode="RGB")
        resized = resize(image)
        cropped = np.asarray(crop(resized), dtype=np.uint8)
        tensor: torch.Tensor = preprocess(image)
        flat = tensor.numpy().reshape(-1)
        picks = [0, 1, 777, 50175, 50176, 100351, 100352, flat.size - 1]
        cases.append({
            "width": width, "height": height, "kind": kind, "seed": seed,
            "resized": [resized.width, resized.height],
            "sha256": hashlib.sha256(cropped.tobytes()).hexdigest(),
            "tensor": {"sum": [float(tensor[c].double().sum()) for c in range(3)], "picks": [[i, float(flat[i])] for i in picks]},
        })
    out = {
        "note": "Sinh bởi ml/scripts/xuat_mau_tien_xu_ly.py. Không sửa tay.",
        "versions": {"Pillow": PIL.__version__, "torchvision": torchvision.__version__},
        "input": {"size": 224, "resize": 256, "mean": CLIP_MEAN, "std": CLIP_STD},
        "cases": cases,
    }
    path = REPO_ROOT / "test" / "fixtures" / "recognition-preprocess.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Đã ghi {len(cases)} ca vào {path}")


if __name__ == "__main__":
    main()
