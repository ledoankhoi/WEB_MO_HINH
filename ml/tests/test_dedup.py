import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.dedup import UnionFind, phash_pairs, popcount64, trimmed_centroid, tukey_outliers  # noqa: E402


def test_popcount_matches_python():
    rng = np.random.default_rng(0)
    values = rng.integers(0, 2**63, size=200, dtype=np.uint64)
    assert popcount64(values).tolist() == [bin(int(v)).count("1") for v in values]


def test_phash_pairs_equals_brute_force():
    rng = np.random.default_rng(1)
    base = rng.integers(0, 2**63, size=60, dtype=np.uint64)
    # Thêm các bản lệch 1–8 bit để chắc chắn có cặp gần nhau
    variants = []
    for value in base[:30]:
        flips = rng.choice(64, size=rng.integers(1, 9), replace=False)
        mask = np.uint64(0)
        for bit in flips:
            mask |= np.uint64(1) << np.uint64(int(bit))
        variants.append(value ^ mask)
    hashes = np.concatenate([base, np.array(variants, dtype=np.uint64)])
    got = {(i, j) for i, j, _ in phash_pairs(hashes, 6)}
    expected = set()
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            if bin(int(hashes[i] ^ hashes[j])).count("1") <= 6:
                expected.add((i, j))
    assert got == expected
    assert expected  # có cặp thật để kiểm tra


def test_union_find_groups():
    uf = UnionFind(6)
    uf.union(0, 3)
    uf.union(3, 5)
    uf.union(1, 2)
    labels = uf.labels()
    assert labels[0] == labels[3] == labels[5]
    assert labels[1] == labels[2]
    assert len(set(labels.tolist())) == 3


def test_tukey_and_trimmed_centroid():
    distances = np.array([0.1, 0.12, 0.11, 0.13, 0.1, 0.9])
    flags, fence = tukey_outliers(distances)
    assert flags.tolist() == [False] * 5 + [True]
    features = np.array([[1, 0], [0.99, 0.14], [0.98, 0.2], [0, 1]] * 5, dtype=float)
    features /= np.linalg.norm(features, axis=1, keepdims=True)
    center = trimmed_centroid(features, trim=0.25)
    assert center[0] > center[1]  # nhóm đông (hướng trục x) quyết định tâm


def test_phash_pairs_big_bucket_matches_brute_force():
    # Nhiều mã chung một khối bit (ảnh nền trắng): xử lý theo lô nhỏ vẫn phải cho đúng kết quả.
    rng = np.random.default_rng(2)
    low = rng.integers(0, 2**9, size=300, dtype=np.uint64)  # 9 bit thấp thay đổi, 55 bit cao giống nhau
    hashes = (np.uint64(0x1234567890ABC) << np.uint64(9)) | low
    got = {(i, j) for i, j, _ in phash_pairs(hashes, 6, chunk=64)}
    expected = {(i, j) for i in range(300) for j in range(i + 1, 300) if bin(int(hashes[i] ^ hashes[j])).count("1") <= 6}
    assert got == expected and len(expected) > 1000


def test_cosine_pairs_equals_brute_force():
    from robotrec.dedup import cosine_pairs

    rng = np.random.default_rng(3)
    base = rng.normal(size=(40, 16)).astype(np.float32)
    near = base[:15] + 0.02 * rng.normal(size=(15, 16)).astype(np.float32)
    features = np.concatenate([base, near])
    features /= np.linalg.norm(features, axis=1, keepdims=True)
    got = {(i, j) for i, j, _ in cosine_pairs(features, 0.95, block=7)}
    sims = features @ features.T
    expected = {(i, j) for i in range(len(features)) for j in range(i + 1, len(features)) if sims[i, j] >= 0.951}
    loose = {(i, j) for i in range(len(features)) for j in range(i + 1, len(features)) if sims[i, j] >= 0.949}
    assert expected <= got <= loose and expected  # sai số fp16 trên GPU chỉ ảnh hưởng sát ngưỡng
