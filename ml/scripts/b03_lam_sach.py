"""B3. Làm sạch và kiểm định chất lượng nhãn (docs/nhan-dang-robot/00-ke-hoach.md mục 8, B3).

Giai đoạn `auto` (chạy sau B2):
  1. Kỹ thuật: cạnh ngắn (kích thước gốc) < 128 px, tỉ lệ khung > 3.
  2. Trùng tuyệt đối (cùng sha1): trong một lớp giữ ảnh lớn nhất; nằm ở nhiều lớp thì loại hết (nhãn mâu thuẫn).
  3. Gần trùng: cô-sin CLIP ≥ 0,98, hoặc pHash lệch ≤ 6 bit kèm cô-sin CLIP ≥ 0,90 (ngưỡng 0,95 của kế hoạch nối nhầm các
     robot khác nhau vẽ cùng phong cách, xem báo cáo B03a); gom cụm union–find; cụm nhiều lớp thì loại hết, cụm một lớp giữ
     ảnh lớn nhất.
  4. Điểm liên quan: CLIP ViT-L/14 zero-shot (nhóm câu dương / âm).
  5. Ngoại lai trong lớp: khoảng cách cô-sin tới tâm lớp (trung bình cắt bỏ 10%), quy tắc Tukey.
  6. Miền ảnh: CLIP zero-shot giữa 5 miền.
  Ghi ROBOTREC_DATA/b03/scores.csv và hai trang cho chủ dự án:
  - kiem-dinh-truoc-loc.html: 500 ảnh (sau bước 1–3) gán nhãn tay → chọn ngưỡng t_rel, đo bộ lọc.
  - duyet-tay.html: duyệt từng lớp, ảnh nghi ngờ xếp trước → danh sách ảnh loại.

Giai đoạn `final` (sau khi có kết quả của chủ dự án) được viết ở bước sau.

Chạy: python ml/scripts/b03_lam_sach.py --stage auto
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import numpy as np  # noqa: E402

from robotrec.config import MANIFESTS, data_root, load_config  # noqa: E402

FIELDS = [
    "key", "class", "franchise", "source", "host", "file", "sha1", "width", "height", "status", "reason", "phash", "cluster",
    "p_robot", "outlier_d", "outlier", "domain", "domain_p", "suspicious",
]


def _phash(paths: list[str]) -> list[str]:
    import imagehash
    from PIL import Image

    out = []
    for path in paths:
        try:
            with Image.open(path) as image:
                out.append(str(imagehash.phash(image)))
        except OSError:
            out.append("")
    return out


def phashes(paths: list[Path], workers: int) -> list[str]:
    chunks = [[str(p) for p in paths[i : i + 500]] for i in range(0, len(paths), 500)]
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return [value for chunk in pool.map(_phash, chunks) for value in chunk]


def host_of(url: str) -> str:
    """Tên máy chủ của trang chứa ảnh (bỏ `www.`), để thống kê theo trang nguồn."""
    from urllib.parse import urlparse

    name = (urlparse(url).hostname or "").lower()
    return name[4:] if name.startswith("www.") else name


def stage_auto(cfg: dict, only: set[str] | None = None, out_name: str = "b03") -> None:
    from robotrec.dedup import UnionFind, cosine_pairs, phash_pairs, trimmed_centroid, tukey_outliers
    from robotrec.embed import ClipEncoder
    from robotrec.review_html import write_audit, write_review

    root = data_root()
    image_root = root / "images" / "raw"
    out_dir = root / out_name
    out_dir.mkdir(parents=True, exist_ok=True)
    robots = {r["slug"]: r for r in json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"] if not only or r["slug"] in only}
    with open(root / "b02" / "manifest.csv", encoding="utf-8", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    rows = [
        {"key": f"r{i}", "class": m["class"], "franchise": m["franchise"], "source": m["source"], "host": host_of(m["page_url"] or m["url"]),
         "file": m["file"], "sha1": m["sha1"],
         "width": int(m["width"]), "height": int(m["height"]), "status": "giữ", "reason": ""}
        for i, m in enumerate(manifest)
        if m["class"] in robots
    ]
    started = time.monotonic()
    funnel = [("Ảnh thô (B2)", len(rows))]

    def drop(row: dict, reason: str) -> None:
        row["status"], row["reason"] = "loại", reason

    alive = lambda: [r for r in rows if r["status"] == "giữ"]  # noqa: E731

    # 1. Kỹ thuật
    for row in rows:
        short, long = sorted((row["width"], row["height"]))
        if short < cfg["min_side"]:
            drop(row, "ảnh nhỏ (cạnh ngắn < 128 px)")
        elif long / short > cfg["max_aspect"]:
            drop(row, "tỉ lệ khung > 3")
    funnel.append(("Sau lọc kỹ thuật", len(alive())))

    # 2. Trùng tuyệt đối
    by_sha: dict[str, list[dict]] = defaultdict(list)
    for row in alive():
        by_sha[row["sha1"]].append(row)
    for group in by_sha.values():
        if len({r["class"] for r in group}) > 1:
            for row in group:
                drop(row, "trùng tuyệt đối giữa các lớp")
        else:
            for row in sorted(group, key=lambda r: -r["width"] * r["height"])[1:]:
                drop(row, "trùng tuyệt đối trong lớp")
    funnel.append(("Sau bỏ trùng tuyệt đối", len(alive())))

    # Đặc trưng: pHash và CLIP cho các ảnh còn lại
    live = alive()
    paths = [image_root / r["file"] for r in live]
    print(f"pHash cho {len(paths)} ảnh...", flush=True)
    hashes = phashes(paths, max(1, (os.cpu_count() or 4) - 2))
    print(f"CLIP {cfg['clip_model']}/{cfg['clip_pretrained']} cho {len(paths)} ảnh...", flush=True)
    encoder = ClipEncoder(cfg["clip_model"], cfg["clip_pretrained"])
    features, readable = encoder.images(paths, cfg["batch_size"], cfg["loader_workers"], cache=out_dir / "cache")
    for row, value, ok in zip(live, hashes, readable):
        row["phash"] = value
        if not ok or not value:
            drop(row, "không đọc được ảnh đã lưu")

    # 3. Gần trùng
    index = [i for i, r in enumerate(live) if r["status"] == "giữ"]
    sub_hash = np.array([int(live[i]["phash"], 16) for i in index], dtype=np.uint64)
    sub_feat = features[index]
    uf = UnionFind(len(index))
    # Cặp ứng viên: pHash lệch ≤ phash_max_distance, hoặc cô-sin ≥ clip_pair_floor (ghi lại để phân tích).
    # Cặp được coi là gần trùng (nối cụm) khi: cô-sin ≥ clip_near_duplicate, hoặc pHash gần VÀ cô-sin ≥ phash_min_cosine.
    # Lý do (báo cáo B03a): ở cô-sin 0,95–0,97 phần lớn cặp là hai robot khác nhau vẽ cùng phong cách; pHash gần mà cô-sin thấp
    # là hai ảnh cùng bố cục (hộp, thẻ thông số) nhưng khác nội dung.
    pairs_ph = phash_pairs(sub_hash, cfg["phash_max_distance"])
    pairs_cos = cosine_pairs(sub_feat, cfg["clip_pair_floor"])
    candidates: dict[tuple[int, int], dict] = {}
    for a, b, d in pairs_ph:
        candidates[(a, b)] = {"phash": d, "cos": float(sub_feat[a] @ sub_feat[b])}
    for a, b, v in pairs_cos:
        candidates.setdefault((a, b), {"phash": "", "cos": v})
    used = 0
    for (a, b), info in candidates.items():
        info["used"] = bool(info["cos"] >= cfg["clip_near_duplicate"] or (info["phash"] != "" and info["cos"] >= cfg["phash_min_cosine"]))
        if info["used"]:
            uf.union(a, b)
            used += 1
    labels = uf.labels()
    keys = [live[i]["key"] for i in index]
    with open(out_dir / "pairs.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["a", "b", "phash", "cos", "used"])
        writer.writerows((keys[a], keys[b], info["phash"], round(info["cos"], 4), int(info["used"])) for (a, b), info in candidates.items())
    clusters: dict[int, list[int]] = defaultdict(list)
    for position, label in enumerate(labels):
        clusters[int(label)].append(position)
    for members in clusters.values():
        group = [live[index[m]] for m in members]
        for row in group:
            row["cluster"] = f"c{index[members[0]]}" if len(members) > 1 else ""
        if len(members) < 2:
            continue
        if len({r["class"] for r in group}) > 1:
            for row in group:
                drop(row, "gần trùng giữa các lớp")
        else:
            for row in sorted(group, key=lambda r: -r["width"] * r["height"])[1:]:
                drop(row, "gần trùng trong lớp")
    funnel.append(("Sau bỏ gần trùng", len(alive())))

    # 4–6. Điểm liên quan, ngoại lai, miền (tính cho mọi ảnh đã có đặc trưng)
    positive, negative = cfg["relevance_prompts"]["positive"], cfg["relevance_prompts"]["negative"]
    probs = encoder.zero_shot(features, positive + negative)
    p_robot = probs[:, : len(positive)].sum(axis=1)
    domain_names = list(cfg["domains"].keys())
    domain_probs = encoder.zero_shot(features, list(cfg["domains"].values()))
    position_of = {row["key"]: i for i, row in enumerate(live)}
    for i, row in enumerate(live):
        row["p_robot"] = round(float(p_robot[i]), 4)
        row["domain"] = domain_names[int(domain_probs[i].argmax())]
        row["domain_p"] = round(float(domain_probs[i].max()), 3)
    fences = {}
    for slug in robots:
        members = [r for r in alive() if r["class"] == slug]
        if len(members) < 5:
            continue
        idx = np.array([position_of[r["key"]] for r in members])
        center = trimmed_centroid(features[idx], cfg["outlier_trim"])
        distance = 1 - features[idx] @ center
        flags, fence = tukey_outliers(distance, cfg["outlier_k"])
        fences[slug] = fence
        for row, d, flag in zip(members, distance, flags):
            row["outlier_d"] = round(float(d), 4)
            row["outlier"] = bool(flag)
    for row in alive():
        row["suspicious"] = bool(row.get("p_robot", 1) < cfg["relevance_default"] or row.get("outlier"))

    with open(out_dir / "scores.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    np.save(out_dir / "features_index.npy", np.array([r["key"] for r in live]))

    # Trang cho chủ dự án
    rng = random.Random(cfg["seed"])
    survivors = alive()
    by_class: dict[str, list[dict]] = defaultdict(list)
    for row in survivors:
        by_class[row["class"]].append(row)
    sample: list[dict] = []
    per_class = max(1, cfg["audit_pre_size"] // max(len(by_class), 1))
    for slug in sorted(by_class):
        sample += rng.sample(by_class[slug], min(per_class, len(by_class[slug])))
    chosen = {r["key"] for r in sample}
    rest = [r for r in survivors if r["key"] not in chosen]
    sample += rng.sample(rest, max(0, min(cfg["audit_pre_size"] - len(sample), len(rest))))
    rng.shuffle(sample)

    def item(row: dict) -> dict:
        robot = robots[row["class"]]
        return {"key": row["key"], "src": f"../images/raw/{row['file']}", "name": robot["display_name"], "series": robot["series"],
                "ref": robot["image"]["url"]}

    write_audit(
        out_dir / "kiem-dinh-truoc-loc.html", "b03-kiem-dinh-truoc-loc", "B3 · Kiểm định trước lọc (500 ảnh)",
        "Mỗi ảnh được gán cho robot ghi bên dưới (ảnh nhỏ bên trái là ảnh tham chiếu của robot đó). Chọn: <b>1</b> nếu ảnh đúng là "
        "robot đó (ảnh đồ chơi, ảnh phim, tranh, hộp có thấy robot đều tính); <b>2</b> nếu là một robot khác; <b>3</b> nếu không phải "
        "robot (người, chữ, biểu tượng, xe thường...). Dùng phím 1/2/3, mũi tên để di chuyển. Tiến độ tự lưu trong trình duyệt. "
        "Xong thì bấm <b>Tải kết quả (CSV)</b> và gửi file cho Claude.",
        "Ảnh này có đúng là robot ghi trên không?",
        [("dung", "Đúng robot này"), ("khac", "Robot khác"), ("khong", "Không phải robot")],
        [item(r) for r in sample],
    )
    classes = []
    for slug, robot in robots.items():
        members = sorted(by_class.get(slug, []), key=lambda r: (not r["suspicious"], r.get("p_robot", 1), -r.get("outlier_d", 0)))
        classes.append({
            "slug": slug, "name": robot["display_name"], "series": robot["series"], "ref": robot["image"]["url"],
            "items": [{**item(r), "flag": r["suspicious"],
                       "note": f"liên quan {r.get('p_robot', 0):.2f} · cách tâm {r.get('outlier_d', 0):.2f}" + (" · ngoại lai" if r.get("outlier") else "")}
                      for r in members],
        })
    write_review(
        out_dir / "duyet-tay.html", "b03-duyet-tay", "B3 · Duyệt tay từng lớp",
        "Mỗi trang là một lớp. Mặc định chỉ hiện <b>ảnh nghi ngờ</b> (điểm liên quan thấp hoặc ngoại lai), xếp nghi ngờ nhất trước. "
        "<b>Bấm vào ảnh sai</b> để đánh dấu LOẠI (ảnh robot khác, không phải robot, nhiều robot mà không rõ robot này). Ảnh đúng thì để nguyên. "
        "Bấm <b>Xong, lớp sau</b> để chuyển lớp. Có thể bấm <b>Hiện tất cả ảnh</b> để xem cả lớp. Tiến độ tự lưu; xong thì bấm "
        "<b>Tải kết quả (CSV)</b> và gửi file cho Claude.",
        classes,
    )
    funnel_rows = [{"Bước": name, "Còn lại": count} for name, count in funnel]
    sizes = Counter(len(m) for m in clusters.values() if len(m) > 1)
    multi = [m for m in clusters.values() if len(m) > 1 and len({live[index[x]]["class"] for x in m}) > 1]
    summary = {
        "clusters": {
            "n": sum(sizes.values()),
            "images": sum(k * v for k, v in sizes.items()),
            "largest": max(sizes, default=0),
            "multi_class": len(multi),
            "multi_class_images": sum(len(m) for m in multi),
            "multi_class_largest": max((len(m) for m in multi), default=0),
        },
        "funnel": funnel_rows,
        "reasons": dict(Counter(r["reason"] for r in rows if r["status"] == "loại")),
        "phash_pairs": len(pairs_ph),
        "clip_pairs": len(pairs_cos),
        "candidate_pairs": len(candidates),
        "used_pairs": used,
        "suspicious": sum(1 for r in alive() if r["suspicious"]),
        "outliers": sum(1 for r in alive() if r.get("outlier")),
        "domains": dict(Counter(r.get("domain") for r in alive())),
        "audit_pre": len(sample),
        "seconds": round(time.monotonic() - started, 1),
        "clip": encoder.name,
    }
    (out_dir / "auto_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f"Trang kiểm định: {out_dir / 'kiem-dinh-truoc-loc.html'}\nTrang duyệt tay: {out_dir / 'duyet-tay.html'}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["auto"], default="auto")
    parser.add_argument("--classes", help="chỉ chạy các lớp này (slug, cách nhau bằng dấu phẩy), để thử")
    parser.add_argument("--out-name", default="b03", help="thư mục kết quả trong ROBOTREC_DATA")
    args = parser.parse_args()
    cfg = load_config("b03_lam_sach")
    if args.stage == "auto":
        stage_auto(cfg, set(args.classes.split(",")) if args.classes else None, args.out_name)


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
