import sys
from pathlib import Path

import numpy as np
import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.train import class_balanced_weights, fit, lr_factor, make_param_groups  # noqa: E402


def test_class_balanced_weights_give_sqrt_class_probability():
    labels = np.array([0] * 100 + [1] * 25 + [2] * 4)
    weights = class_balanced_weights(labels, power=0.5)
    per_class = np.array([weights[labels == c].sum() for c in range(3)])
    probability = per_class / per_class.sum()
    expected = np.sqrt([100, 25, 4]) / np.sqrt([100, 25, 4]).sum()
    assert np.allclose(probability, expected)
    assert np.allclose(class_balanced_weights(labels, power=1.0), 1.0)  # power 1: lấy mẫu thường


def test_lr_factor_warmup_then_cosine():
    assert lr_factor(0, 10, 110) == pytest.approx(0.1)
    assert lr_factor(9, 10, 110) == pytest.approx(1.0)
    assert lr_factor(10, 10, 110) == pytest.approx(1.0)
    assert lr_factor(60, 10, 110) == pytest.approx(0.5, abs=0.02)
    assert lr_factor(109, 10, 110) < 0.01
    values = [lr_factor(s, 10, 110) for s in range(10, 110)]
    assert all(a >= b for a, b in zip(values, values[1:]))  # sau khởi động chỉ giảm


def test_layer_decay_scales_learning_rate_by_depth():
    import timm

    model = timm.create_model("vit_tiny_patch16_224", pretrained=False, num_classes=5)
    groups = make_param_groups(model, lr=1e-3, weight_decay=0.05, layer_decay=0.75)
    lr_of = {}
    for group in groups:
        for p in group["params"]:
            lr_of[id(p)] = (group["lr"], group["weight_decay"])
    named = dict(model.named_parameters())
    assert lr_of[id(named["head.weight"])][0] == pytest.approx(1e-3)
    assert lr_of[id(named["patch_embed.proj.weight"])][0] < lr_of[id(named["blocks.11.attn.qkv.weight"])][0] < 1e-3
    assert lr_of[id(named["blocks.0.norm1.weight"])][1] == 0.0  # tham số 1 chiều không phạt trọng số
    assert lr_of[id(named["blocks.0.attn.qkv.weight"])][1] == 0.05
    plain = make_param_groups(model, lr=1e-3, weight_decay=0.05, layer_decay=None)
    assert {g["lr"] for g in plain} == {1e-3}
    assert sum(len(g["params"]) for g in plain) == len(named)


class Tiny(torch.nn.Module):
    def __init__(self, classes=4, dim=8):
        super().__init__()
        self.body = torch.nn.Sequential(torch.nn.Linear(dim, 16), torch.nn.ReLU())
        self.head = torch.nn.Linear(16, classes)

    def forward(self, x):
        return self.head(self.body(x))

    def get_classifier(self):
        return self.head


def toy_data(n, seed, classes=4, dim=8):
    rng = np.random.default_rng(seed)
    y = rng.integers(0, classes, size=n)
    centers = rng.normal(size=(classes, dim)) * 3
    x = (centers[y] + rng.normal(size=(n, dim))).astype(np.float32)
    return torch.utils.data.TensorDataset(torch.from_numpy(x), torch.from_numpy(y)), y


CFG = {"seed": 7, "epochs_head": 1, "epochs_max": 4, "lr_head": 1e-2, "lr": 1e-2, "layer_decay": None, "weight_decay": 0.05, "warmup_epochs": 1,
       "batch_size": 16, "micro_batch": 8, "label_smoothing": 0.1, "sampler_power": 0.5, "grad_clip": 1.0, "patience": 10, "amp": False, "workers": 0}


def run(tmp, epochs, model=None, stop_after=None):
    torch.manual_seed(0)
    model = model or Tiny()
    train, ytrain = toy_data(96, 1)
    val, yval = toy_data(40, 2)
    return model, fit(model, train, ytrain, val, yval, 4, {**CFG, "epochs_max": epochs}, tmp, "cpu", log=lambda *a: None, stop_after_epochs=stop_after)


def test_head_phase_changes_only_classifier(tmp_path):
    torch.manual_seed(0)
    model = Tiny()
    before = {k: v.clone() for k, v in model.state_dict().items()}
    train, ytrain = toy_data(96, 1)
    val, yval = toy_data(40, 2)
    fit(model, train, ytrain, val, yval, 4, {**CFG, "epochs_max": 1}, tmp_path, "cpu", log=lambda *a: None)
    after = model.state_dict()
    assert torch.equal(before["body.0.weight"], after["body.0.weight"])
    assert not torch.equal(before["head.weight"], after["head.weight"])


def test_resume_matches_uninterrupted_run(tmp_path):
    full_model, full = run(tmp_path / "full", 4)
    _, partial = run(tmp_path / "split", 4, stop_after=2)  # giả lập bị ngắt sau 2 epoch
    assert not partial["finished"] and (tmp_path / "split" / "last.pt").exists()
    torch.manual_seed(123)  # khởi tạo khác hẳn: trọng số phải lấy từ last.pt
    resumed_model, resumed = run(tmp_path / "split", 4, model=Tiny())  # chạy tiếp: kết quả phải y hệt lần chạy liền
    for key, value in full_model.state_dict().items():
        assert torch.allclose(value, resumed_model.state_dict()[key], atol=1e-6), key
    assert [round(h["val_loss"], 6) for h in full["history"]] == [round(h["val_loss"], 6) for h in resumed["history"]]
    assert (tmp_path / "split" / "best.pt").exists() and (tmp_path / "split" / "history.csv").exists()
    assert resumed["finished"] and len(resumed["history"]) == 4
    assert resumed["val_logits"].shape == (40, 4)
    assert not (tmp_path / "split" / "last.pt").exists()  # chạy xong thì xoá last.pt
    _, again = run(tmp_path / "split", 4)  # đã xong: không huấn luyện lại
    assert again["finished"] and len(again["history"]) == 4


def test_early_stopping(tmp_path):
    torch.manual_seed(0)
    model = Tiny()
    train, ytrain = toy_data(96, 1)
    val, yval = toy_data(40, 2)
    cfg = {**CFG, "epochs_max": 30, "patience": 2, "lr": 0.0, "lr_head": 0.0}  # tốc độ học 0: không bao giờ tốt lên
    out = fit(model, train, ytrain, val, yval, 4, cfg, tmp_path, "cpu", log=lambda *a: None)
    assert len(out["history"]) == 3 and out["stopped_early"]
