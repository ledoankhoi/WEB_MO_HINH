"""Mô hình nền trên đặc trưng đóng băng (B5): hồi quy logistic bằng L-BFGS, k-NN cô-sin, chỉ số kèm bootstrap."""

from __future__ import annotations

import numpy as np


def _device(device: str | None) -> str:
    import torch

    return device or ("cuda" if torch.cuda.is_available() else "cpu")


def fit_logreg(x: np.ndarray, y: np.ndarray, n_classes: int, c: float, max_iter: int = 2000, device: str | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Hồi quy logistic đa lớp (softmax) có điều chuẩn L2, tối ưu bằng L-BFGS trên toàn bộ dữ liệu.

    Hàm mục tiêu giống `sklearn.linear_model.LogisticRegression(C=c)`: Σ CE(xᵢ, yᵢ) + ‖W‖² / (2c), không phạt hệ số chặn.
    Viết bằng PyTorch để chạy trên GPU (nhanh hơn scikit-learn nhiều lần với 30 nghìn mẫu × 195 lớp); test so khớp với scikit-learn."""
    import torch

    device = _device(device)
    features = torch.from_numpy(np.ascontiguousarray(x, dtype=np.float32)).to(device)
    labels = torch.from_numpy(np.asarray(y, dtype=np.int64)).to(device)
    n = features.shape[0]
    weights = torch.zeros(n_classes, features.shape[1], device=device, requires_grad=True)
    bias = torch.zeros(n_classes, device=device, requires_grad=True)
    optimizer = torch.optim.LBFGS([weights, bias], lr=1.0, max_iter=max_iter, max_eval=int(max_iter * 1.25), history_size=20,
                                  tolerance_grad=1e-6, tolerance_change=1e-10, line_search_fn="strong_wolfe")

    def closure():
        optimizer.zero_grad()
        loss = torch.nn.functional.cross_entropy(features @ weights.T + bias, labels) + weights.pow(2).sum() / (2 * c * n)
        loss.backward()
        return loss

    optimizer.step(closure)
    return weights.detach().cpu().numpy(), bias.detach().cpu().numpy()


def knn_scores(train: np.ndarray, labels: np.ndarray, query: np.ndarray, n_classes: int, k: int, device: str | None = None, block: int = 2048) -> np.ndarray:
    """Điểm từng lớp của k-NN cô-sin: tổng độ giống của các láng giềng thuộc lớp đó trong k láng giềng gần nhất."""
    import torch

    device = _device(device)
    base = torch.from_numpy(np.ascontiguousarray(train, dtype=np.float32)).to(device)
    y = torch.from_numpy(np.asarray(labels, dtype=np.int64)).to(device)
    out = []
    for start in range(0, len(query), block):
        q = torch.from_numpy(np.ascontiguousarray(query[start : start + block], dtype=np.float32)).to(device)
        sims, index = (q @ base.T).topk(k, dim=1)
        scores = torch.zeros(q.shape[0], n_classes, device=device)
        scores.scatter_add_(1, y[index], sims.clamp(min=0))
        out.append(scores.cpu().numpy())
    return np.concatenate(out)


def topk_correct(scores: np.ndarray, y: np.ndarray, k: int) -> np.ndarray:
    """Mảng bool: nhãn đúng có nằm trong k lớp điểm cao nhất không (hoà điểm tính theo thứ tự lớp)."""
    k = min(k, scores.shape[1])
    top = np.argpartition(-scores, k - 1, axis=1)[:, :k]
    return (top == np.asarray(y)[:, None]).any(axis=1)


def macro_f1(pred: np.ndarray, y: np.ndarray, n_classes: int) -> float:
    """Trung bình F1 của các lớp có mặt trong nhãn hoặc trong dự đoán (như scikit-learn)."""
    pred, y = np.asarray(pred), np.asarray(y)
    tp = np.bincount(y[pred == y], minlength=n_classes)
    support = np.bincount(y, minlength=n_classes) + np.bincount(pred, minlength=n_classes)
    present = support > 0
    return float((2 * tp[present] / support[present]).mean())


def metrics_with_ci(scores: np.ndarray, y: np.ndarray, n_classes: int, resamples: int = 1000, seed: int = 0, level: float = 0.95) -> dict[str, tuple[float, float, float]]:
    """top-1, top-5, macro-F1 kèm khoảng tin cậy bootstrap theo phân vị (lấy mẫu lại các ảnh của tập đánh giá)."""
    y = np.asarray(y)
    pred = scores.argmax(1)
    top1, top5 = pred == y, topk_correct(scores, y, 5)
    rng = np.random.default_rng(seed)
    samples = np.empty((resamples, 3))
    for i in range(resamples):
        idx = rng.integers(0, len(y), size=len(y))
        samples[i] = top1[idx].mean(), top5[idx].mean(), macro_f1(pred[idx], y[idx], n_classes)
    alpha = (1 - level) / 2
    low, high = np.quantile(samples, [alpha, 1 - alpha], axis=0)
    point = [float(top1.mean()), float(top5.mean()), macro_f1(pred, y, n_classes)]
    return {name: (point[i], float(low[i]), float(high[i])) for i, name in enumerate(("top1", "top5", "macro_f1"))}
