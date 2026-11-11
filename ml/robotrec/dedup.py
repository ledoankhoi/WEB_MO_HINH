"""Phát hiện ảnh gần trùng (B3): pHash 64 bit với chỉ mục nhiều phần, cô-sin CLIP theo khối, gom cụm bằng union–find."""

from __future__ import annotations

from collections import defaultdict

import numpy as np


class UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = np.arange(n)

    def find(self, x: int) -> int:
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return int(root)

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)

    def labels(self) -> np.ndarray:
        return np.array([self.find(i) for i in range(len(self.parent))])


def popcount64(values: np.ndarray) -> np.ndarray:
    """Số bit 1 của từng số uint64 (khoảng cách Hamming khi áp lên phép XOR)."""
    v = values.astype(np.uint64)
    v = v - ((v >> np.uint64(1)) & np.uint64(0x5555555555555555))
    v = (v & np.uint64(0x3333333333333333)) + ((v >> np.uint64(2)) & np.uint64(0x3333333333333333))
    v = (v + (v >> np.uint64(4))) & np.uint64(0x0F0F0F0F0F0F0F0F)
    return ((v * np.uint64(0x0101010101010101)) >> np.uint64(56)).astype(np.int64)


def phash_pairs(hashes: np.ndarray, max_distance: int = 6, chunk: int = 2048) -> list[tuple[int, int, int]]:
    """Mọi cặp (i, j, d) có khoảng cách Hamming d ≤ max_distance.

    Chỉ mục nhiều phần: chia 64 bit thành max_distance + 1 khối; hai mã lệch ≤ max_distance bit thì (nguyên lý chuồng bồ câu)
    có ít nhất một khối trùng hoàn toàn. Chỉ so các cặp cùng khối, nên không phải so N² cặp. Khối đông (ảnh nền trắng có
    cùng mẫu bit) được so theo từng lô `chunk` dòng để không cấp phát ma trận M × M."""
    parts = max_distance + 1
    bounds = np.linspace(0, 64, parts + 1).astype(int)
    h = hashes.astype(np.uint64)
    found: dict[tuple[int, int], int] = {}
    for start, end in zip(bounds[:-1], bounds[1:]):
        mask = np.uint64((1 << (end - start)) - 1)
        keys = (h >> np.uint64(start)) & mask
        order = np.argsort(keys, kind="stable")
        sorted_keys = keys[order]
        edges = np.flatnonzero(np.diff(sorted_keys)) + 1
        for members in np.split(order, edges):
            if len(members) < 2:
                continue
            idx = np.sort(members)
            values = h[idx]
            for offset in range(0, len(idx), chunk):
                distance = popcount64(values[offset : offset + chunk, None] ^ values[None, :])
                rows, cols = np.nonzero(distance <= max_distance)
                rows = rows + offset
                keep = rows < cols
                for a, b, d in zip(idx[rows[keep]].tolist(), idx[cols[keep]].tolist(), distance[rows[keep] - offset, cols[keep]].tolist()):
                    found[(a, b)] = d
    return [(i, j, d) for (i, j), d in found.items()]


def cosine_pairs(features: np.ndarray, threshold: float = 0.95, block: int = 2048) -> list[tuple[int, int, float]]:
    """Mọi cặp (i < j) có cô-sin ≥ threshold, tính theo khối trên GPU nếu có (đặc trưng đã chuẩn hoá L2)."""
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    data = torch.from_numpy(features).to(device, dtype=torch.float16 if device == "cuda" else torch.float32)
    pairs: list[tuple[int, int, float]] = []
    n = data.shape[0]
    for start in range(0, n, block):
        sims = data[start : start + block] @ data.T
        rows, cols = torch.nonzero(sims >= threshold, as_tuple=True)
        keep = (rows + start) < cols
        rows, cols = rows[keep], cols[keep]
        values = sims[rows, cols].float().cpu().tolist()
        pairs += list(zip((rows + start).cpu().tolist(), cols.cpu().tolist(), values))
        del sims
    return pairs


def tukey_outliers(distances: np.ndarray, k: float = 1.5) -> tuple[np.ndarray, float]:
    """Cờ ngoại lai d > Q3 + k · IQR và ngưỡng đã dùng."""
    q1, q3 = np.percentile(distances, [25, 75])
    fence = float(q3 + k * (q3 - q1))
    return distances > fence, fence


def trimmed_centroid(features: np.ndarray, trim: float = 0.1) -> np.ndarray:
    """Tâm lớp bền: lấy trung bình, bỏ `trim` phần ảnh xa nhất, lấy trung bình lại, chuẩn hoá L2."""
    center = features.mean(axis=0)
    center /= np.linalg.norm(center) + 1e-12
    distance = 1 - features @ center
    keep = distance <= np.quantile(distance, 1 - trim) if len(features) > 10 else np.ones(len(features), bool)
    center = features[keep].mean(axis=0)
    return center / (np.linalg.norm(center) + 1e-12)
