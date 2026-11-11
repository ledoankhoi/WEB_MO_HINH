"""Đặc trưng CLIP (open_clip) cho B3 và B5: trích theo lô trên GPU, chuẩn hoá L2, cache ra file .npy."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset


class _Images(Dataset):
    def __init__(self, paths: list[Path], preprocess) -> None:
        self.paths = paths
        self.preprocess = preprocess

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int):
        try:
            with Image.open(self.paths[index]) as image:
                return self.preprocess(image.convert("RGB")), True
        except OSError:
            return torch.zeros(3, 224, 224), False


class ClipEncoder:
    def __init__(self, model: str = "ViT-L-14", pretrained: str = "openai", device: str | None = None) -> None:
        import open_clip

        self.name = f"{model}/{pretrained}"
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(model, pretrained=pretrained, device=self.device)
        self.model.eval()
        self.tokenizer = open_clip.get_tokenizer(model)
        self.logit_scale = float(self.model.logit_scale.exp().item())

    @torch.no_grad()
    def images(self, paths: list[Path], batch_size: int = 64, workers: int = 6, cache: Path | None = None) -> tuple[np.ndarray, np.ndarray]:
        """Trả về (đặc trưng N×D float32 đã chuẩn hoá L2, mảng bool đọc được ảnh). Cache theo danh sách đường dẫn."""
        if cache is not None:
            key = hashlib.sha1(("\n".join(str(p) for p in paths) + self.name).encode("utf-8")).hexdigest()[:16]
            target = cache / f"clip-{self.name.replace('/', '_')}-{key}.npz"
            if target.exists():
                data = np.load(target)
                return data["features"], data["ok"]
        loader = DataLoader(_Images(paths, self.preprocess), batch_size=batch_size, num_workers=workers, pin_memory=self.device == "cuda")
        features, oks = [], []
        for batch, ok in loader:
            with torch.autocast(self.device, dtype=torch.float16, enabled=self.device == "cuda"):
                out = self.model.encode_image(batch.to(self.device, non_blocking=True))
            out = torch.nn.functional.normalize(out.float(), dim=-1)
            features.append(out.cpu().numpy())
            oks.append(ok.numpy())
        result = (np.concatenate(features) if features else np.zeros((0, 0), np.float32)), (np.concatenate(oks) if oks else np.zeros(0, bool))
        if cache is not None:
            cache.mkdir(parents=True, exist_ok=True)
            np.savez(target, features=result[0], ok=result[1])
        return result

    @torch.no_grad()
    def texts(self, prompts: list[str]) -> np.ndarray:
        tokens = self.tokenizer(prompts).to(self.device)
        out = self.model.encode_text(tokens)
        return torch.nn.functional.normalize(out.float(), dim=-1).cpu().numpy()

    def zero_shot(self, features: np.ndarray, prompts: list[str]) -> np.ndarray:
        """Xác suất softmax(logit_scale · cos) trên các câu mô tả, N × số câu."""
        logits = self.logit_scale * features @ self.texts(prompts).T
        logits -= logits.max(axis=1, keepdims=True)
        probs = np.exp(logits)
        return probs / probs.sum(axis=1, keepdims=True)
