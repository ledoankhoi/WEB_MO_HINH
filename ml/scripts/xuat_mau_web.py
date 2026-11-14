"""Sinh bộ ca mẫu để kiểm tra mã nhận dạng của web (src/lib/recognition.ts) cho kết quả giống hệt mã Python của B8.

Dùng đúng hàm `hierarchy`, `softmax` và luật cấp của `robotrec/evaluate.py` trên 195 lớp thật. Logits làm tròn 6 chữ số rồi mới tính,
để hai phía dùng cùng đầu vào; bỏ các ca có xác suất nằm sát ngưỡng (cách dưới 1e-6), vì hàm exp của JavaScript và numpy có thể lệch
ở chữ số cuối.

Chạy: ml/.venv/Scripts/python ml/scripts/xuat_mau_web.py   (ghi test/fixtures/recognition-golden.json)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from robotrec.config import MANIFESTS, REPO_ROOT  # noqa: E402
from robotrec.evaluate import _levels, hierarchy, softmax  # noqa: E402

TEMPERATURE = 0.85
THRESHOLDS = (0.62, 0.55, 0.80)
LEVEL = {3: "class", 2: "character", 1: "franchise", 0: "none"}


def main() -> None:
    robots = {r["slug"]: r for r in json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]}
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", usecols=["class", "split"])
    classes = sorted(splits.loc[splits["split"] == "train", "class"].unique())
    h = hierarchy(classes, robots)
    labels = [{"index": i, "slug": s, "name": robots[s]["display_name"], "character": robots[s]["character"], "franchise": robots[s]["franchise"],
               "series": robots[s]["series"]} for i, s in enumerate(classes)]
    rng = np.random.default_rng(2026)
    same_char = [[i for i in range(len(classes)) if h.class_char[i] == c] for c in range(len(h.char_names))]
    multi = [members for members in same_char if len(members) > 1]
    cases, kinds = [], {0: 0, 1: 0, 2: 0, 3: 0}
    while len(cases) < 48:
        z = rng.normal(0, 1.0, len(classes))
        kind = len(cases) % 4
        if kind == 3:  # một lớp nổi hẳn
            z[rng.integers(len(classes))] += rng.uniform(4, 9)
        elif kind == 2:  # hai dòng của cùng một nhân vật ngang nhau
            members = multi[rng.integers(len(multi))]
            z[members[:2]] += rng.uniform(4, 7)
        elif kind == 1:  # trải đều trên một franchise
            franchise = rng.integers(len(h.franchise_names))
            z[h.class_franchise == franchise] += rng.uniform(2, 4)
        z = np.round(z, 6)
        p = softmax(z[None], TEMPERATURE)[0]
        pc, pch, pf = p.max(), h.char_probs(p[None])[0].max(), h.franchise_probs(p[None])[0].max()
        if min(abs(pc - THRESHOLDS[0]), abs(pch - THRESHOLDS[1]), abs(pf - THRESHOLDS[2])) < 1e-6:
            continue
        level = int(_levels(np.array([pc]), np.array([pch]), np.array([pf]), THRESHOLDS)[0])
        kinds[level] += 1
        cases.append({
            "logits": z.tolist(), "level": LEVEL[level], "classIndex": int(p.argmax()), "characterIndex": int(h.char_probs(p[None])[0].argmax()),
            "franchiseIndex": int(h.franchise_probs(p[None])[0].argmax()), "pClass": float(pc), "pCharacter": float(pch), "pFranchise": float(pf),
            "top5": [int(i) for i in np.argsort(-p, kind="stable")[:5]],
        })
    fixture = {"note": "Sinh bởi ml/scripts/xuat_mau_web.py từ robotrec/evaluate.py; không sửa tay.", "temperature": TEMPERATURE, "thresholds": list(THRESHOLDS),
               "labels": labels, "characters": h.char_names, "franchises": h.franchise_names, "cases": cases}
    out = REPO_ROOT / "test" / "fixtures" / "recognition-golden.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")
    print(out, {LEVEL[k]: v for k, v in kinds.items()})


if __name__ == "__main__":
    main()
