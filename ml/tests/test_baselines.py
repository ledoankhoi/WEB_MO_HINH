import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.baselines import fit_logreg, knn_scores, macro_f1, metrics_with_ci, topk_correct  # noqa: E402


def blobs(seed=0, n=600, classes=6, dim=12):
    rng = np.random.default_rng(seed)
    centers = rng.normal(size=(classes, dim)) * 2
    y = rng.integers(0, classes, size=n)
    x = centers[y] + rng.normal(size=(n, dim))
    x /= np.linalg.norm(x, axis=1, keepdims=True)
    return x.astype(np.float32), y


def test_logreg_matches_sklearn():
    from sklearn.linear_model import LogisticRegression

    x, y = blobs()
    weights, bias = fit_logreg(x[:400], y[:400], 6, c=10.0, max_iter=2000, device="cpu")
    mine = (x[400:] @ weights.T + bias)
    reference = LogisticRegression(C=10.0, max_iter=5000, tol=1e-8).fit(x[:400], y[:400])
    theirs = reference.decision_function(x[400:])
    assert (mine.argmax(1) == theirs.argmax(1)).mean() >= 0.99
    # cùng hàm mục tiêu nên trọng số gần nhau khi cả hai chạy tới hội tụ (tol mặc định 1e-4 của scikit-learn dừng sớm hơn)
    assert np.abs(weights - reference.coef_).max() < 0.02


def test_knn_weighted_vote():
    train = np.array([[1, 0], [1, 0.1], [0, 1], [0.1, 1], [0.2, 1]], dtype=np.float32)
    train /= np.linalg.norm(train, axis=1, keepdims=True)
    labels = np.array([0, 0, 1, 1, 1])
    query = np.array([[1, 0.05], [0.6, 0.8]], dtype=np.float32)
    query /= np.linalg.norm(query, axis=1, keepdims=True)
    scores = knn_scores(train, labels, query, 2, k=3, device="cpu")
    assert scores.shape == (2, 2)
    assert scores.argmax(1).tolist() == [0, 1]
    one = knn_scores(train, labels, query, 2, k=1, device="cpu")
    assert (one > 0).sum(1).tolist() == [1, 1]  # k = 1: chỉ lớp của láng giềng gần nhất có điểm


def test_metrics_match_sklearn():
    from sklearn.metrics import f1_score, top_k_accuracy_score

    rng = np.random.default_rng(1)
    y = rng.integers(0, 7, size=300)
    scores = rng.normal(size=(300, 7))
    scores[np.arange(300), y] += 1.0
    pred = scores.argmax(1)
    assert abs(macro_f1(pred, y, 7) - f1_score(y, pred, average="macro")) < 1e-9
    assert abs(topk_correct(scores, y, 5).mean() - top_k_accuracy_score(y, scores, k=5, labels=np.arange(7))) < 1e-9
    result = metrics_with_ci(scores, y, 7, resamples=200, seed=0)
    assert result["top1"][1] <= result["top1"][0] <= result["top1"][2]
    assert result["top5"][0] >= result["top1"][0]
    assert 0 < result["macro_f1"][2] - result["macro_f1"][1] < 0.2
