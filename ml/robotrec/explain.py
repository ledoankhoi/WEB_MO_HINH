"""Giải thích mô hình (B8): Grad-CAM (Selvaraju et al., 2017) cho CNN và ViT của timm, viết trực tiếp bằng hook của PyTorch.

Grad-CAM: lấy bản đồ kích hoạt A^k của một tầng và gradient của điểm lớp c theo nó; trọng số kênh α_k = trung bình không gian của
∂y_c/∂A^k; bản đồ = ReLU(Σ_k α_k A^k), phóng về cỡ ảnh, chuẩn hoá về [0; 1]. Vùng sáng là vùng làm điểm của lớp c tăng.
"""

from __future__ import annotations

from typing import Callable

import numpy as np
import torch


def target_layer(model: torch.nn.Module) -> tuple[torch.nn.Module, Callable | None]:
    """Tầng dùng cho Grad-CAM theo loại mạng của timm, kèm hàm đổi dạng token → bản đồ (với ViT)."""
    if hasattr(model, "blocks") and hasattr(model, "patch_embed"):  # ViT: tầng chuẩn hoá đầu của khối cuối (token còn nhận gradient từ CLS)
        prefix = getattr(model, "num_prefix_tokens", 1)
        grid = model.patch_embed.grid_size

        def reshape(tokens: torch.Tensor) -> torch.Tensor:
            body = tokens[:, prefix:, :]
            return body.reshape(body.shape[0], grid[0], grid[1], body.shape[2]).permute(0, 3, 1, 2)

        return model.blocks[-1].norm1, reshape
    if hasattr(model, "stages"):  # ConvNeXt
        return model.stages[-1], None
    if hasattr(model, "conv_head"):  # EfficientNet
        return model.conv_head, None
    raise ValueError(f"Chưa hỗ trợ Grad-CAM cho {type(model).__name__}")


def gradcam(model: torch.nn.Module, x: torch.Tensor, layer: torch.nn.Module, class_index: int, size: int = 224,
            reshape: Callable | None = None) -> np.ndarray:
    """Bản đồ Grad-CAM (size × size, giá trị 0..1) của một ảnh x (1 × 3 × H × W) cho lớp `class_index`."""
    store: dict[str, torch.Tensor] = {}

    def forward_hook(_, __, output):
        output = output[0] if isinstance(output, tuple) else output
        output.retain_grad()
        store["activation"] = output

    handle = layer.register_forward_hook(forward_hook)
    try:
        model.zero_grad(set_to_none=True)
        with torch.enable_grad():
            x = x.clone().requires_grad_(True)
            logits = model(x)
            logits[0, class_index].backward()
        activation, gradient = store["activation"], store["activation"].grad
        if reshape is not None:
            activation, gradient = reshape(activation), reshape(gradient)
        weights = gradient.mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((weights * activation).sum(dim=1, keepdim=True))
        cam = torch.nn.functional.interpolate(cam, size=(size, size), mode="bilinear", align_corners=False)[0, 0]
        cam = cam - cam.min()
        peak = cam.max()
        return (cam / peak if peak > 0 else cam).detach().cpu().numpy()
    finally:
        handle.remove()
