import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.evaluate import (  # noqa: E402
    answer_outcomes,
    calibration,
    fit_temperature,
    hierarchy,
    ood_metrics,
    ood_scores,
    oscr,
    search_thresholds,
    softmax,
)


def test_temperature_recovers_true_value():
    rng = np.random.default_rng(0)
    logits = rng.normal(size=(20000, 10)) * 3
    probs = softmax(logits, 2.0)
    y = np.array([rng.choice(10, p=p) for p in probs])  # nhãn sinh từ softmax(z / 2): T đúng là 2
    assert fit_temperature(logits, y) == pytest.approx(2.0, abs=0.1)


def test_calibration_metrics_by_hand():
    probs = np.array([[0.9, 0.1], [0.9, 0.1], [0.9, 0.1], [0.9, 0.1]])
    y = np.array([0, 0, 1, 1])  # độ tin 0,9 nhưng chỉ đúng 50%
    result = calibration(probs, y, bins=10)
    assert result["ece"] == pytest.approx(0.4)
    assert result["mce"] == pytest.approx(0.4)
    assert result["nll"] == pytest.approx(-(2 * np.log(0.9) + 2 * np.log(0.1)) / 4)
    assert result["brier"] == pytest.approx((2 * (0.01 + 0.01) + 2 * (0.81 + 0.81)) / 4)
    assert sum(b["count"] for b in result["bins"]) == 4


def test_ood_scores_and_metrics():
    from sklearn.metrics import roc_auc_score

    logits = np.array([[5.0, 0.0, 0.0], [1.0, 1.0, 1.0]])
    scores = ood_scores(logits)
    assert scores["msp"][0] == pytest.approx(np.exp(5) / (np.exp(5) + 2))
    assert scores["maxlogit"].tolist() == [5.0, 1.0]
    assert scores["energy"][1] == pytest.approx(1 + np.log(3))  # −E = T · logsumexp(z / T)
    rng = np.random.default_rng(1)
    known, ood = rng.normal(1, 1, 2000), rng.normal(0, 1, 2000)
    m = ood_metrics(known, ood)
    labels = np.r_[np.ones(2000), np.zeros(2000)]
    assert m["auroc"] == pytest.approx(roc_auc_score(labels, np.r_[known, ood]))
    threshold = np.quantile(known, 0.05)
    assert m["fpr95"] == pytest.approx((ood >= threshold).mean(), abs=0.002)
    perfect = ood_metrics(np.array([2.0, 3.0]), np.array([0.0, 1.0]))
    assert perfect["auroc"] == 1.0 and perfect["fpr95"] == 0.0


def test_oscr_perfect_and_curve():
    fpr, ccr, area = oscr(np.array([3.0, 2.0]), np.array([True, True]), np.array([1.0, 0.0]))
    assert area == pytest.approx(1.0)
    assert fpr[0] == 0 and ccr[-1] == 1.0
    _, _, half = oscr(np.array([3.0, 2.0]), np.array([True, False]), np.array([1.0, 0.0]))
    assert half == pytest.approx(0.5)  # chỉ một nửa ảnh đã biết được phân loại đúng


ROBOTS = [
    {"slug": "tf-optimus-g1", "franchise": "transformers", "character": "Optimus Prime"},
    {"slug": "tf-optimus-movie", "franchise": "transformers", "character": "Optimus Prime"},
    {"slug": "tf-megatron-g1", "franchise": "transformers", "character": "Megatron"},
    {"slug": "gd-rx78", "franchise": "gundam", "character": "RX-78-2 Gundam"},
]


def test_hierarchy_sums_probabilities():
    h = hierarchy(["tf-optimus-g1", "tf-optimus-movie", "tf-megatron-g1", "gd-rx78"], {r["slug"]: r for r in ROBOTS})
    probs = np.array([[0.3, 0.3, 0.1, 0.3]])
    assert h.char_probs(probs).max() == pytest.approx(0.6)
    assert h.franchise_probs(probs).max() == pytest.approx(0.7)
    assert h.char_of("tf-optimus-movie") == h.char_of("tf-optimus-g1") != h.char_of("tf-megatron-g1")
    assert h.char_of("tf-ultra-magnus-unknown", {"franchise": "transformers", "character": "Ultra Magnus"}) == -1


def test_answer_outcomes_by_hand():
    classes = ["tf-optimus-g1", "tf-optimus-movie", "tf-megatron-g1", "gd-rx78"]
    h = hierarchy(classes, {r["slug"]: r for r in ROBOTS})
    probs = np.array([
        [0.9, 0.05, 0.03, 0.02],   # đã biết, lớp 0, chắc chắn: trả lời đúng lớp
        [0.45, 0.45, 0.05, 0.05],  # đã biết, lớp 1, phân vân giữa hai dòng Optimus: trả lời đúng nhân vật
        [0.3, 0.1, 0.3, 0.3],      # đã biết, lớp 3, không chắc gì: từ chối oan
    ])
    known = answer_outcomes(probs, h, (0.8, 0.8, 0.95), kind="known", true_class=np.array([0, 1, 3]))
    assert known["level"].tolist() == [3, 2, 0]
    assert known["correct"].tolist() == [True, True, False]
    assert known["utility"].tolist() == pytest.approx([1.0, 2 / 3, 0.0])
    # Robot lạ: trả lời hẳn một lớp là nhận nhầm; trả lời đúng nhân vật (nhân vật có trong danh mục) là đúng;
    # trả lời một nhân vật cho robot lạ mà nhân vật của nó không có trong danh mục là nhận nhầm.
    optimus = h.char_of("tf-optimus-g1")
    unknown = answer_outcomes(probs[[0, 1, 1]], h, (0.8, 0.8, 0.95), kind="unknown", true_char=np.array([optimus, -1, optimus]),
                              true_franchise=np.array([h.franchise_index["transformers"]] * 3))
    assert unknown["level"].tolist() == [3, 2, 2]
    assert unknown["false_accept"].tolist() == [True, True, False]
    assert unknown["correct"].tolist() == [False, False, True]
    negative = answer_outcomes(probs, h, (0.8, 0.8, 0.95), kind="negative")
    assert negative["false_accept"].tolist() == [True, True, False]


def test_threshold_search_respects_constraint_and_is_optimal():
    rng = np.random.default_rng(3)
    classes = ["tf-optimus-g1", "tf-optimus-movie", "tf-megatron-g1", "gd-rx78"]
    h = hierarchy(classes, {r["slug"]: r for r in ROBOTS})
    known_y = rng.integers(0, 4, 300)
    known_p = softmax(np.eye(4)[known_y] * rng.uniform(0.5, 6, (300, 1)) + rng.normal(0, 1, (300, 4)))
    neg_p = softmax(rng.normal(0, 1.5, (200, 4)))
    unk_p = softmax(rng.normal(0, 1.5, (100, 4)))
    unk_char = np.full(100, -1)
    unk_fr = np.full(100, h.franchise_index["transformers"])
    grid = np.linspace(0, 1, 11)
    best = search_thresholds(known_p, known_y, unk_p, unk_char, unk_fr, neg_p, h, grid=grid, far_max=0.05)
    assert best["far_unknown"] <= 0.05 and best["far_negative"] <= 0.05
    # vét cạn trên cùng lưới: không có bộ ngưỡng nào thoả ràng buộc mà lợi ích cao hơn
    for t1 in grid:
        for t2 in grid:
            for t3 in grid:
                t = (t1, t2, t3)
                fu = answer_outcomes(unk_p, h, t, kind="unknown", true_char=unk_char, true_franchise=unk_fr)["false_accept"].mean()
                fn = answer_outcomes(neg_p, h, t, kind="negative")["false_accept"].mean()
                if fu <= 0.05 and fn <= 0.05:
                    u = answer_outcomes(known_p, h, t, kind="known", true_class=known_y)["utility"].mean()
                    assert u <= best["utility"] + 1e-12
