import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.explain import gradcam, target_layer  # noqa: E402


class TinyCNN(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.features = torch.nn.Conv2d(3, 4, 3, padding=1, bias=False)
        torch.nn.init.constant_(self.features.weight, 0.1)
        self.head = torch.nn.Linear(4, 2)
        torch.nn.init.constant_(self.head.weight, 1.0)

    def forward(self, x):
        return self.head(torch.relu(self.features(x)).mean(dim=(2, 3)))


def test_gradcam_highlights_the_active_region():
    model = TinyCNN().eval()
    x = torch.zeros(1, 3, 32, 32)
    x[:, :, :8, :8] = 1.0  # chỉ góc trên bên trái có tín hiệu
    cam = gradcam(model, x, model.features, class_index=0, size=32)
    assert cam.shape == (32, 32)
    assert cam.min() >= 0 and abs(cam.max() - 1.0) < 1e-6
    assert cam[:8, :8].mean() > 5 * cam[16:, 16:].mean()


def test_target_layer_for_timm_models():
    import timm

    convnext = timm.create_model("convnext_atto", pretrained=False, num_classes=3)
    layer, reshape = target_layer(convnext)
    assert layer is convnext.stages[-1] and reshape is None
    vit = timm.create_model("vit_tiny_patch16_224", pretrained=False, num_classes=3).eval()
    layer, reshape = target_layer(vit)
    assert layer is vit.blocks[-1].norm1
    cam = gradcam(vit, torch.rand(1, 3, 224, 224), layer, class_index=1, size=224, reshape=reshape)
    assert cam.shape == (224, 224) and np.isfinite(cam).all()
