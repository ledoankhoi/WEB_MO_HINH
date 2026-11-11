import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.stats import accuracy_ci, holm, mcnemar, mean_std, paired_bootstrap_diff, wilson_ci  # noqa: E402


def test_wilson_known_value():
    # 95/100: tâm 0,9333, bán kính 0,0451 → [0,8882; 0,9785]
    interval = wilson_ci(95, 100)
    assert interval.estimate == pytest.approx(0.95)
    assert interval.low == pytest.approx(0.8882, abs=5e-4)
    assert interval.high == pytest.approx(0.9785, abs=5e-4)


def test_wilson_bounds_at_extremes():
    assert wilson_ci(0, 10).low == 0.0
    assert wilson_ci(10, 10).high == 1.0
    assert wilson_ci(10, 10).low < 1.0
    with pytest.raises(ValueError):
        wilson_ci(11, 10)


def test_mean_std_uses_sample_std():
    mean, std = mean_std([1.0, 2.0, 3.0])
    assert mean == pytest.approx(2.0)
    assert std == pytest.approx(1.0)
    assert mean_std([5.0]) == (5.0, 0.0)


def test_bootstrap_is_reproducible_and_brackets_estimate():
    rng = np.random.default_rng(1)
    correct = rng.random(500) < 0.8
    a = accuracy_ci(correct, resamples=500, seed=7)
    b = accuracy_ci(correct, resamples=500, seed=7)
    assert a == b
    assert a.low <= a.estimate <= a.high
    assert a.high - a.low < 0.1


def test_paired_diff_zero_for_identical_models():
    correct = [True, False, True, True]
    diff = paired_bootstrap_diff(correct, correct, resamples=200)
    assert diff.estimate == 0.0 and diff.low == 0.0 and diff.high == 0.0


def test_mcnemar_exact_and_chi2():
    # 10 cặp lệch, tất cả nghiêng về A: nhị thức chính xác, p = 2 · 0,5¹⁰
    a = [True] * 10 + [True] * 5
    b = [False] * 10 + [True] * 5
    result = mcnemar(a, b)
    assert (result.b, result.c) == (10, 0)
    assert result.method == "nhị thức chính xác"
    assert result.p_value == pytest.approx(2 * 0.5**10)
    # 40 cặp lệch: χ² = (|30 − 10| − 1)² / 40 = 9,025
    a = [True] * 30 + [False] * 10
    b = [False] * 30 + [True] * 10
    result = mcnemar(a, b)
    assert result.statistic == pytest.approx(9.025)
    assert result.p_value < 0.01


def test_holm_keeps_order_and_is_monotone():
    adjusted = holm([0.01, 0.04, 0.03])
    assert adjusted == pytest.approx([0.03, 0.06, 0.06])
