"""Đánh giá toàn diện (B8): hiệu chỉnh độ tin, nhận biết ảnh lạ, độ chính xác theo cấp, luật trả lời theo cấp.

Kế hoạch: docs/nhan-dang-robot/00-ke-hoach.md mục 7.2 (định nghĩa chỉ số) và mục 8, B8.
Quy ước điểm "đã biết": điểm càng cao càng giống ảnh của lớp đã biết (MSP, max-logit, −năng lượng).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Cấp của câu trả lời: 3 = lớp (nhân vật + dòng), 2 = nhân vật, 1 = franchise, 0 = không nhận ra
LEVELS = {3: "lớp", 2: "nhân vật", 1: "franchise", 0: "không nhận ra"}


def softmax(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = np.asarray(logits, dtype=np.float64) / temperature
    z -= z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def logsumexp(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = np.asarray(logits, dtype=np.float64) / temperature
    m = z.max(axis=1)
    return m + np.log(np.exp(z - m[:, None]).sum(axis=1))


def fit_temperature(logits: np.ndarray, y: np.ndarray, max_iter: int = 500) -> float:
    """Temperature scaling (Guo et al., 2017): tìm T > 0 làm nhỏ nhất NLL của softmax(z / T) trên tập val. Tối ưu log T bằng L-BFGS."""
    import torch

    z = torch.as_tensor(np.asarray(logits), dtype=torch.float64)
    target = torch.tensor(np.asarray(y), dtype=torch.long)
    log_t = torch.zeros(1, dtype=torch.float64, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_t], lr=0.5, max_iter=max_iter, line_search_fn="strong_wolfe", tolerance_grad=1e-10, tolerance_change=1e-12)

    def closure():
        optimizer.zero_grad()
        loss = torch.nn.functional.cross_entropy(z / log_t.exp(), target)
        loss.backward()
        return loss

    optimizer.step(closure)
    return float(log_t.detach().exp())


def calibration(probs: np.ndarray, y: np.ndarray, bins: int = 15) -> dict:
    """ECE, MCE (khoảng độ tin chia đều trên (0; 1]), NLL, Brier; kèm số liệu từng khoảng để vẽ biểu đồ độ tin cậy."""
    probs, y = np.asarray(probs, dtype=np.float64), np.asarray(y)
    confidence = probs.max(axis=1)
    correct = probs.argmax(axis=1) == y
    index = np.clip(np.ceil(confidence * bins - 1e-12).astype(int) - 1, 0, bins - 1)
    table, ece, mce = [], 0.0, 0.0
    for b in range(bins):
        mask = index == b
        count = int(mask.sum())
        entry = {"low": b / bins, "high": (b + 1) / bins, "count": count, "accuracy": float(correct[mask].mean()) if count else None,
                 "confidence": float(confidence[mask].mean()) if count else None}
        if count:
            gap = abs(entry["accuracy"] - entry["confidence"])
            ece += count / len(y) * gap
            mce = max(mce, gap)
        table.append(entry)
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(y)), y] = 1.0
    return {"ece": float(ece), "mce": float(mce), "nll": float(-np.log(np.clip(probs[np.arange(len(y)), y], 1e-12, None)).mean()),
            "brier": float(((probs - onehot) ** 2).sum(axis=1).mean()), "accuracy": float(correct.mean()), "bins": table}


def ood_scores(logits: np.ndarray, temperature: float = 1.0) -> dict[str, np.ndarray]:
    """Ba điểm "đã biết" (cao = giống ảnh đã biết): MSP = max softmax(z / T) (Hendrycks & Gimpel, 2017); max-logit;
    −năng lượng = T · log Σ exp(z / T) (Liu et al., 2020; năng lượng E = −T · log Σ exp(z / T))."""
    logits = np.asarray(logits, dtype=np.float64)
    return {"msp": softmax(logits, temperature).max(axis=1), "maxlogit": logits.max(axis=1), "energy": temperature * logsumexp(logits, temperature)}


def ood_metrics(score_known: np.ndarray, score_ood: np.ndarray) -> dict[str, float]:
    """Tách ảnh đã biết (dương) với ảnh lạ theo điểm: AUROC, AUPR-In (đã biết là dương), AUPR-Out (ảnh lạ là dương, điểm đổi dấu),
    FPR@95%TPR (tỉ lệ ảnh lạ bị nhận khi ngưỡng giữ được 95% ảnh đã biết)."""
    from sklearn.metrics import average_precision_score, roc_auc_score

    known, ood = np.asarray(score_known, dtype=np.float64), np.asarray(score_ood, dtype=np.float64)
    labels = np.r_[np.ones(len(known)), np.zeros(len(ood))]
    scores = np.r_[known, ood]
    threshold = np.quantile(known, 0.05)
    return {"auroc": float(roc_auc_score(labels, scores)), "aupr_in": float(average_precision_score(labels, scores)),
            "aupr_out": float(average_precision_score(1 - labels, -scores)), "fpr95": float((ood >= threshold).mean()), "threshold95": float(threshold)}


def oscr(score_known: np.ndarray, correct_known: np.ndarray, score_ood: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Đường OSCR (Dhamija et al., 2018): khi hạ dần ngưỡng, CCR = tỉ lệ ảnh đã biết vừa vượt ngưỡng vừa phân loại đúng,
    FPR = tỉ lệ ảnh lạ vượt ngưỡng. Trả về (FPR, CCR, diện tích dưới đường)."""
    known, ood = np.asarray(score_known, dtype=np.float64), np.asarray(score_ood, dtype=np.float64)
    correct = np.asarray(correct_known, dtype=bool)
    thresholds = np.unique(np.r_[known, ood])[::-1]
    known_correct_sorted = np.sort(known[correct])
    ood_sorted = np.sort(ood)
    ccr = (len(known_correct_sorted) - np.searchsorted(known_correct_sorted, thresholds, side="left")) / len(known)
    fpr = (len(ood_sorted) - np.searchsorted(ood_sorted, thresholds, side="left")) / len(ood)
    fpr, ccr = np.r_[0.0, fpr], np.r_[0.0, ccr]
    return fpr, ccr, float(np.trapezoid(ccr, fpr) if hasattr(np, "trapezoid") else np.trapz(ccr, fpr))


@dataclass
class Hierarchy:
    """Cây nhãn 3 cấp: lớp (robot + dòng) → nhân vật → franchise. Xác suất của nhân vật (franchise) = tổng xác suất các lớp con."""

    classes: list[str]
    class_char: np.ndarray
    class_franchise: np.ndarray
    char_names: list[str]
    franchise_names: list[str]
    char_key: dict = field(default_factory=dict)
    franchise_index: dict = field(default_factory=dict)
    robots: dict = field(default_factory=dict)

    def char_probs(self, probs: np.ndarray) -> np.ndarray:
        out = np.zeros((len(probs), len(self.char_names)))
        np.add.at(out.T, self.class_char, np.asarray(probs, dtype=np.float64).T)
        return out

    def franchise_probs(self, probs: np.ndarray) -> np.ndarray:
        out = np.zeros((len(probs), len(self.franchise_names)))
        np.add.at(out.T, self.class_franchise, np.asarray(probs, dtype=np.float64).T)
        return out

    def char_of(self, slug: str, robot: dict | None = None) -> int:
        """Chỉ số nhân vật của một lớp; với lớp ngoài danh sách huấn luyện (robot lạ) thì tra theo (franchise, nhân vật), không có thì −1."""
        robot = robot or self.robots.get(slug)
        return int(self.char_key.get((robot["franchise"], robot["character"]), -1))


def hierarchy(classes: list[str], robots: dict[str, dict]) -> Hierarchy:
    char_key: dict[tuple[str, str], int] = {}
    franchise_index: dict[str, int] = {}
    class_char, class_franchise = [], []
    for slug in classes:
        robot = robots[slug]
        key = (robot["franchise"], robot["character"])
        class_char.append(char_key.setdefault(key, len(char_key)))
        class_franchise.append(franchise_index.setdefault(robot["franchise"], len(franchise_index)))
    char_names = [name for (_, name), _ in sorted(char_key.items(), key=lambda kv: kv[1])]
    franchise_names = [name for name, _ in sorted(franchise_index.items(), key=lambda kv: kv[1])]
    return Hierarchy(list(classes), np.array(class_char), np.array(class_franchise), char_names, franchise_names, char_key, franchise_index, robots)


def _levels(pc: np.ndarray, pch: np.ndarray, pf: np.ndarray, t: tuple[float, float, float]) -> np.ndarray:
    level = np.zeros(len(pc), dtype=int)
    level[pf >= t[2]] = 1
    level[pch >= t[1]] = 2
    level[pc >= t[0]] = 3
    return level


def answer_outcomes(probs: np.ndarray, h: Hierarchy, t: tuple[float, float, float], kind: str, true_class: np.ndarray | None = None,
                    true_char: np.ndarray | None = None, true_franchise: np.ndarray | None = None) -> dict[str, np.ndarray]:
    """Luật trả lời theo cấp (kế hoạch B8): p(lớp) ≥ t₁ → trả lời lớp; ngược lại p(nhân vật) ≥ t₂ → nhân vật; ngược lại
    p(franchise) ≥ t₃ → franchise; còn lại → "không nhận ra".

    - kind = "known" (ảnh của lớp đã biết): đúng khi đúng ở cấp đã trả lời; lợi ích = số cấp nói đúng / 3 (lớp 1, nhân vật 2/3, franchise 1/3);
      từ chối là "từ chối oan".
    - kind = "unknown" (robot lạ): trả lời một lớp luôn là nhận nhầm; trả lời nhân vật đúng (nếu nhân vật có trong danh mục) hoặc franchise đúng,
      hoặc từ chối, là đúng.
    - kind = "negative" (không phải robot): chỉ từ chối là đúng.
    """
    probs = np.asarray(probs, dtype=np.float64)
    char_p, fr_p = h.char_probs(probs), h.franchise_probs(probs)
    pred_class, pred_char, pred_fr = probs.argmax(1), char_p.argmax(1), fr_p.argmax(1)
    level = _levels(probs.max(1), char_p.max(1), fr_p.max(1), t)
    out = {"level": level, "pred_class": pred_class, "pred_char": pred_char, "pred_franchise": pred_fr, "reject": level == 0}
    if kind == "known":
        true_class = np.asarray(true_class)
        ok = np.select([level == 3, level == 2, level == 1], [pred_class == true_class, pred_char == h.class_char[true_class],
                                                              pred_fr == h.class_franchise[true_class]], default=False)
        out.update(correct=ok, utility=np.where(ok, level / 3.0, 0.0), wrong=(level > 0) & ~ok)
    elif kind == "unknown":
        true_char, true_franchise = np.asarray(true_char), np.asarray(true_franchise)
        ok = np.select([level == 3, level == 2, level == 1, level == 0], [False, (pred_char == true_char) & (true_char >= 0), pred_fr == true_franchise, True])
        out.update(correct=ok.astype(bool), false_accept=(level > 0) & ~ok.astype(bool))
    elif kind == "negative":
        out.update(correct=level == 0, false_accept=level > 0)
    else:
        raise ValueError(kind)
    return out


def _level_values(probs, h, kind, **truth):
    """Giá trị của từng ảnh ở mỗi cấp (cột 3, 2, 1) và ba độ tin, để tìm ngưỡng nhanh."""
    probs = np.asarray(probs, dtype=np.float64)
    char_p, fr_p = h.char_probs(probs), h.franchise_probs(probs)
    pc, pch, pf = probs.max(1), char_p.max(1), fr_p.max(1)
    pred_class, pred_char, pred_fr = probs.argmax(1), char_p.argmax(1), fr_p.argmax(1)
    if kind == "known":
        y = np.asarray(truth["true_class"])
        values = np.stack([(pred_class == y) * 1.0, (pred_char == h.class_char[y]) * (2 / 3), (pred_fr == h.class_franchise[y]) * (1 / 3)], axis=1)
    elif kind == "unknown":
        tc, tf = np.asarray(truth["true_char"]), np.asarray(truth["true_franchise"])
        values = np.stack([np.ones(len(pc)), (~((pred_char == tc) & (tc >= 0))) * 1.0, (pred_fr != tf) * 1.0], axis=1)
    else:
        values = np.ones((len(pc), 3))
    return pc, pch, pf, values


def search_thresholds(known_p, known_y, unknown_p, unknown_char, unknown_franchise, negative_p, h: Hierarchy, grid=None, far_max: float = 0.05) -> dict:
    """Chọn (t₁, t₂, t₃) trên lưới: lợi ích trung bình trên ảnh đã biết lớn nhất, với ràng buộc tỉ lệ nhận nhầm robot lạ ≤ far_max VÀ
    tỉ lệ nhận nhầm ảnh không phải robot ≤ far_max. Hoà thì chọn bộ có tổng tỉ lệ nhận nhầm nhỏ hơn. Lưới luôn có thêm giá trị 1,01
    (không bao giờ trả lời ở cấp đó)."""
    grid = np.unique(np.r_[np.linspace(0, 1, 51) if grid is None else np.asarray(grid, dtype=np.float64), 1.01])
    sets = {
        "known": _level_values(known_p, h, "known", true_class=known_y),
        "unknown": _level_values(unknown_p, h, "unknown", true_char=unknown_char, true_franchise=unknown_franchise),
        "negative": _level_values(negative_p, h, "negative"),
    }
    prepared = {}
    for name, (pc, pch, pf, values) in sets.items():
        prepared[name] = (pc, pch, pf, values, len(pc))
    best, best_key = None, None
    for t1 in grid:
        for t2 in grid:
            totals = {}
            for name, (pc, pch, pf, values, n) in prepared.items():
                m3 = pc >= t1
                m2 = ~m3 & (pch >= t2)
                rest = ~m3 & ~m2
                base = values[m3, 0].sum() + values[m2, 1].sum()
                pf_rest, v_rest = pf[rest], values[rest, 2]
                order = np.argsort(pf_rest)
                pf_sorted, cum = pf_rest[order], np.r_[np.cumsum(v_rest[order][::-1])[::-1], 0.0]
                start = np.searchsorted(pf_sorted, grid, side="left")
                totals[name] = (base + cum[start]) / n
            ok = (totals["unknown"] <= far_max + 1e-12) & (totals["negative"] <= far_max + 1e-12)
            for i in np.flatnonzero(ok):
                key = (round(totals["known"][i], 12), -round(totals["unknown"][i] + totals["negative"][i], 12))
                if best_key is None or key > best_key:
                    best_key = key
                    best = {"t": (float(t1), float(t2), float(grid[i])), "utility": float(totals["known"][i]),
                            "far_unknown": float(totals["unknown"][i]), "far_negative": float(totals["negative"][i])}
    return best
