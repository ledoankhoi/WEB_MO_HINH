"""Thống kê dùng chung (kế hoạch mục 7.1).

- `mean_std`: trung bình ± độ lệch chuẩn qua các lần chạy (hạt giống, fold).
- `wilson_ci`: khoảng tin cậy Wilson cho một tỉ lệ (mẫu nhỏ, tỉ lệ gần 0 hoặc 1 vẫn đúng).
- `bootstrap_ci`: khoảng tin cậy bootstrap theo phân vị cho một chỉ số tính trên tập test.
- `paired_bootstrap_diff`: hiệu của hai mô hình trên cùng tập test, kèm khoảng tin cậy.
- `mcnemar`: kiểm định McNemar cho hai bộ dự đoán ghép cặp.
- `holm`: hiệu chỉnh Holm–Bonferroni khi so sánh nhiều cặp.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np
from scipy import stats as sps


@dataclass(frozen=True)
class Interval:
    estimate: float
    low: float
    high: float
    level: float = 0.95

    def format(self, digits: int = 3) -> str:
        """Ví dụ `0.950 [0.888; 0.979]`."""
        return f"{self.estimate:.{digits}f} [{self.low:.{digits}f}; {self.high:.{digits}f}]"

    def format_pct(self, decimals: int = 1) -> str:
        """Ví dụ `95.0% [88.8; 97.9]`."""
        return f"{self.estimate * 100:.{decimals}f}% [{self.low * 100:.{decimals}f}; {self.high * 100:.{decimals}f}]"


def mean_std(values: Sequence[float]) -> tuple[float, float]:
    """Trung bình và độ lệch chuẩn mẫu (ddof = 1). Một giá trị thì độ lệch chuẩn = 0."""
    array = np.asarray(values, dtype=float)
    if array.size == 0:
        raise ValueError("Cần ít nhất một giá trị.")
    return float(array.mean()), float(array.std(ddof=1)) if array.size > 1 else 0.0


def _z(level: float) -> float:
    return float(sps.norm.ppf(0.5 + level / 2))


def wilson_ci(successes: int, total: int, level: float = 0.95) -> Interval:
    """Khoảng Wilson: tâm (p̂ + z²/2n)/(1 + z²/n), bán kính z·√(p̂(1−p̂)/n + z²/4n²)/(1 + z²/n)."""
    if total <= 0:
        raise ValueError("total phải dương.")
    if not 0 <= successes <= total:
        raise ValueError("successes phải nằm trong [0; total].")
    z = _z(level)
    p = successes / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    # Ở hai đầu (0/n, n/n) cận tương ứng đúng bằng 0 hoặc 1; gán thẳng để tránh sai số làm tròn.
    low = 0.0 if successes == 0 else max(0.0, center - half)
    high = 1.0 if successes == total else min(1.0, center + half)
    return Interval(p, low, high, level)


def bootstrap_ci(
    metric: Callable[[np.ndarray], float],
    n: int,
    resamples: int = 1000,
    level: float = 0.95,
    seed: int = 0,
) -> Interval:
    """Bootstrap theo phân vị: lấy mẫu có hoàn lại n chỉ số (mảng `indices`), tính `metric(indices)`.

    `metric` nhận mảng chỉ số của các mẫu test và trả về giá trị chỉ số (ví dụ độ chính xác trên các mẫu đó).
    """
    rng = np.random.default_rng(seed)
    estimate = float(metric(np.arange(n)))
    values = np.empty(resamples)
    for index in range(resamples):
        values[index] = metric(rng.integers(0, n, size=n))
    alpha = (1 - level) / 2
    low, high = np.quantile(values, [alpha, 1 - alpha])
    return Interval(estimate, float(low), float(high), level)


def accuracy_ci(correct: Sequence[bool], resamples: int = 1000, level: float = 0.95, seed: int = 0) -> Interval:
    array = np.asarray(correct, dtype=float)
    return bootstrap_ci(lambda idx: float(array[idx].mean()), array.size, resamples, level, seed)


def paired_bootstrap_diff(
    correct_a: Sequence[bool], correct_b: Sequence[bool], resamples: int = 1000, level: float = 0.95, seed: int = 0
) -> Interval:
    """Hiệu độ chính xác (A − B) trên cùng tập test; cùng một mẫu bootstrap cho cả hai mô hình."""
    a = np.asarray(correct_a, dtype=float)
    b = np.asarray(correct_b, dtype=float)
    if a.shape != b.shape:
        raise ValueError("Hai bộ dự đoán phải cùng số mẫu.")
    diff = a - b
    return bootstrap_ci(lambda idx: float(diff[idx].mean()), diff.size, resamples, level, seed)


@dataclass(frozen=True)
class McNemar:
    b: int  # A đúng, B sai
    c: int  # A sai, B đúng
    statistic: float
    p_value: float
    method: str


def mcnemar(correct_a: Sequence[bool], correct_b: Sequence[bool]) -> McNemar:
    """Kiểm định McNemar. Ít cặp lệch (b + c < 25) thì dùng kiểm định nhị thức chính xác, ngược lại dùng
    χ² có hiệu chỉnh liên tục: (|b − c| − 1)² / (b + c), 1 bậc tự do."""
    a = np.asarray(correct_a, dtype=bool)
    b_arr = np.asarray(correct_b, dtype=bool)
    if a.shape != b_arr.shape:
        raise ValueError("Hai bộ dự đoán phải cùng số mẫu.")
    b = int(np.sum(a & ~b_arr))
    c = int(np.sum(~a & b_arr))
    if b + c == 0:
        return McNemar(b, c, 0.0, 1.0, "không có cặp lệch")
    if b + c < 25:
        p = float(sps.binomtest(min(b, c), b + c, 0.5).pvalue)
        return McNemar(b, c, float(min(b, c)), p, "nhị thức chính xác")
    statistic = (abs(b - c) - 1) ** 2 / (b + c)
    return McNemar(b, c, float(statistic), float(sps.chi2.sf(statistic, 1)), "χ² hiệu chỉnh liên tục")


def holm(p_values: Sequence[float]) -> list[float]:
    """Giá trị p đã hiệu chỉnh Holm–Bonferroni, giữ thứ tự đầu vào."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    adjusted = [0.0] * m
    running = 0.0
    for rank, index in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p_values[index]))
        adjusted[index] = running
    return adjusted
