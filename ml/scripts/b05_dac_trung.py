"""B5, phần 1: trích đặc trưng của các mạng đóng băng cho mọi ảnh của B4 (lớp đã biết, lớp không biết, tập âm).

Mỗi mạng một file `ROBOTREC_DATA/b05/features/<id>.npz`: features (N × D, float32, chuẩn hoá L2), keys, thời gian, số tham số.
Mạng CLIP lưu thêm vector văn bản của từng lớp cho zero-shot (`text`, theo thứ tự `slugs`).

Chạy: ml/.venv/Scripts/python ml/scripts/b05_dac_trung.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
from torch.utils.data import DataLoader, Dataset  # noqa: E402

from robotrec.config import MANIFESTS, data_root, load_config  # noqa: E402


class Images(Dataset):
    def __init__(self, paths: list[Path], preprocess) -> None:
        self.paths, self.preprocess = paths, preprocess

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int):
        with Image.open(self.paths[index]) as image:
            return self.preprocess(image.convert("RGB"))


def load_backbone(spec: dict, device: str):
    """Trả về (hàm ảnh → đặc trưng, tiền xử lý, hàm văn bản → đặc trưng hoặc None, số tham số của phần ảnh)."""
    if spec["kind"] == "clip":
        import open_clip

        model, _, preprocess = open_clip.create_model_and_transforms(spec["model"], pretrained=spec["pretrained"], device=device)
        model.eval()
        tokenizer = open_clip.get_tokenizer(spec["model"])

        def text(prompts: list[str]) -> torch.Tensor:
            return torch.nn.functional.normalize(model.encode_text(tokenizer(prompts).to(device)).float(), dim=-1)

        return model.encode_image, preprocess, text, sum(p.numel() for p in model.visual.parameters())
    import timm
    from torchvision import transforms

    model = timm.create_model(spec["model"], pretrained=True, num_classes=0, img_size=224).to(device).eval()
    preprocess = transforms.Compose([
        transforms.Resize(256, interpolation=transforms.InterpolationMode.BICUBIC),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
    ])
    return model, preprocess, None, sum(p.numel() for p in model.parameters())


@torch.no_grad()
def main() -> None:
    cfg = load_config("b05_mo_hinh_nen")
    root = data_root()
    out = root / "b05" / "features"
    out.mkdir(parents=True, exist_ok=True)
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    negatives = pd.read_csv(MANIFESTS / "b04b_negatives.csv.gz", dtype=str, keep_default_na=False)
    keys = splits["key"].tolist() + negatives["key"].tolist()
    paths = [root / "images" / "raw" / f for f in splits["file"]] + [root / "images" / "negatives" / f for f in negatives["file"]]
    robots = json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    for spec in cfg["backbones"]:
        target = out / f"{spec['id']}.npz"
        if target.exists():
            print(f"{spec['label']}: đã có", flush=True)
            continue
        encode, preprocess, text, params = load_backbone(spec, device)
        loader = DataLoader(Images(paths, preprocess), batch_size=cfg["batch_size"], num_workers=cfg["loader_workers"], pin_memory=device == "cuda")
        chunks = []
        started = time.monotonic()
        for batch in loader:
            with torch.autocast(device, dtype=torch.float16, enabled=device == "cuda"):
                features = encode(batch.to(device, non_blocking=True))
            chunks.append(torch.nn.functional.normalize(features.float(), dim=-1).cpu().numpy())
        seconds = time.monotonic() - started
        features = np.concatenate(chunks)
        extra = {}
        if text is not None:
            vectors = []
            for robot in robots:
                series = robot["series"] or robot["franchise_label"]
                prompts = [t.format(name=robot["name"], series=series) for t in cfg["zero_shot_templates"]]
                vectors.append(torch.nn.functional.normalize(text(prompts).mean(dim=0), dim=-1).cpu().numpy())
            extra = {"text": np.stack(vectors), "slugs": np.array([r["slug"] for r in robots])}
        np.savez(target, features=features, keys=np.array(keys), seconds=seconds, params=params, **extra)
        print(f"{spec['label']}: {features.shape}, {seconds:.0f} giây, {len(keys) / seconds:.0f} ảnh/giây, {params / 1e6:.1f} triệu tham số", flush=True)
        del encode, loader
        torch.cuda.empty_cache()


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
