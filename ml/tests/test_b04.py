import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from b04_chia_tap import choose_unknown, quotas  # noqa: E402


def test_quotas_sum_and_proportion():
    assert quotas({"transformers": 110, "gundam": 70, "sentai": 50}, 35) == {"transformers": 17, "gundam": 11, "sentai": 7}


def make_robots():
    robots = []
    for franchise, n in (("transformers", 20), ("gundam", 12), ("sentai", 8)):
        for i in range(n):
            robots.append({"slug": f"{franchise}-{i}", "franchise": franchise, "selected_by": "store" if i < n // 2 else "popularity"})
    return robots


def test_unknown_classes_exclude_store_and_force_small_classes():
    robots = make_robots()
    per_class = {r["slug"]: 200 for r in robots}
    per_class["sentai-7"] = 50  # thiếu ảnh: bị ép vào nhóm không biết
    cfg = {"seed": 42, "unknown_fraction": 0.15, "min_images_per_class": 100}
    unknown, forced = choose_unknown(robots, per_class, cfg)
    assert forced == ["sentai-7"] and "sentai-7" in unknown
    assert len(unknown) == 6  # ceil(0.15 * 40)
    stores = {r["slug"] for r in robots if r["selected_by"] == "store"}
    assert not stores & set(unknown)
    counts = sorted(list(unknown.values()).count(s) for s in ("unknown_val", "unknown_test"))
    assert counts == [3, 3]
    assert choose_unknown(robots, per_class, cfg)[0] == unknown  # tất định theo hạt giống
