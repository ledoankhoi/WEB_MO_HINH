"""B4b. Tập âm (far-OOD): ảnh không phải robot, để đo khả năng từ chối ở B8 và làm ảnh âm cho thí nghiệm E7.

- COCO val2017: lấy ngẫu nhiên ảnh từ file chú thích chính thức (có giấy phép từng ảnh), tải từ images.cocodataset.org.
- Đồ chơi, mô hình, xe không phải robot: tìm ảnh qua ddgs (cùng cách B2), tải lịch sự, bỏ ảnh trùng với bộ ảnh robot.
- Chấm điểm "giống robot" bằng CLIP (cùng câu mô tả như B3) để biết ảnh âm nào dễ gây nhầm.
- Chia âm-train / âm-val / âm-test.

Chạy: ml/.venv/Scripts/python ml/scripts/b04b_tap_am.py
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import re
import sys
import threading
import zipfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import requests  # noqa: E402
from PIL import Image  # noqa: E402

from robotrec.config import MANIFESTS, config_hash, data_root, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.fetch import USER_AGENT, Fetcher, normalize_image  # noqa: E402
from robotrec.report import Report  # noqa: E402
from robotrec.search import ImageSearch  # noqa: E402

FIELDS = ["key", "group", "subset", "url", "page_url", "title", "license", "sha1", "width", "height", "file"]
SPLIT_LABEL = {"train": "âm-train", "val": "âm-val", "test": "âm-test"}


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def pct(part: float, whole: float) -> str:
    return (vn(100 * part / whole) + "%") if whole else "—"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def coco_images(cfg: dict, cache: Path) -> tuple[list[dict], dict[int, str]]:
    """Danh sách ảnh và bảng giấy phép của COCO val2017 (tải file chú thích một lần, lưu cache)."""
    target = cache / "coco_instances_val2017_images.json"
    if not target.exists():
        archive = cache / "annotations_trainval2017.zip"
        if not archive.exists():
            print("Tải file chú thích COCO (khoảng 250 MB)...", flush=True)
            with requests.get(cfg["annotations_url"], stream=True, timeout=(15, 120), headers={"User-Agent": USER_AGENT}) as response:
                response.raise_for_status()
                with open(archive.with_suffix(".part"), "wb") as handle:
                    for chunk in response.iter_content(1 << 20):
                        handle.write(chunk)
            archive.with_suffix(".part").replace(archive)
        with zipfile.ZipFile(archive) as z, z.open(cfg["member"]) as member:
            data = json.load(member)
        target.write_text(json.dumps({"images": data["images"], "licenses": data["licenses"]}), encoding="utf-8")
        archive.unlink()
    data = json.loads(target.read_text(encoding="utf-8"))
    return data["images"], {item["id"]: item["name"] for item in data["licenses"]}


def main() -> None:
    cfg = load_config("b04b_tap_am")
    root = data_root()
    image_root = root / "images" / "negatives"
    out_dir = root / "b04b"
    out_dir.mkdir(parents=True, exist_ok=True)
    env = environment()
    rng = np.random.default_rng(cfg["seed"])
    manifest_path = out_dir / "manifest.csv"
    attempts_path = out_dir / "attempts.csv"
    rows: list[dict] = []
    if manifest_path.exists():
        with open(manifest_path, encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
    done_urls = {r["url"] for r in rows}
    tried: set[str] = set()
    if attempts_path.exists():
        with open(attempts_path, encoding="utf-8", newline="") as handle:
            tried = {r["url"] for r in csv.DictReader(handle)}
    lock = threading.Lock()
    status_count: Counter = Counter()
    fetcher = Fetcher(1.0, (8, 15), 2, 20_000_000, True, {"images.cocodataset.org": 0.1})

    def record(row: dict | None, url: str, group: str, status: str) -> None:
        with lock:
            new = not attempts_path.exists()
            with open(attempts_path, "a", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                if new:
                    writer.writerow(["group", "url", "status"])
                writer.writerow([group, url, status])
            tried.add(url)
            status_count[(group, status)] += 1
            if row:
                new = not manifest_path.exists()
                with open(manifest_path, "a", encoding="utf-8", newline="") as handle:
                    writer = csv.DictWriter(handle, FIELDS)
                    if new:
                        writer.writeheader()
                    writer.writerow(row)
                rows.append(row)
                done_urls.add(url)

    def fetch(item: dict) -> None:
        if item["url"] in tried:
            return
        data, result = fetcher.download(item["url"])
        if data is None:
            record(None, item["url"], item["group"], result.status)
            return
        temp = image_root / "_tmp" / f"{threading.get_ident()}.jpg"
        image = normalize_image(data, temp, cfg["max_side"], cfg["jpeg_quality"])
        if image.status != "ok":
            record(None, item["url"], item["group"], image.status)
            return
        target = image_root / item["group"] / slug(item["subset"]) / f"{image.sha1[:16]}.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)
        Path(image.path).replace(target)
        record({"key": f"n-{image.sha1[:16]}", "group": item["group"], "subset": item["subset"], "url": item["url"], "page_url": item["page_url"], "title": item["title"],
                "license": item["license"], "sha1": image.sha1, "width": image.width, "height": image.height, "file": target.relative_to(image_root).as_posix()},
               item["url"], item["group"], "ok")

    # 1. COCO
    images, licenses = coco_images(cfg["coco"], root / "cache")
    order = rng.permutation(len(images))
    have = sum(1 for r in rows if r["group"] == "coco")
    wanted = [images[i] for i in order[: cfg["coco"]["count"] + 40]]
    items = [{"group": "coco", "subset": "coco", "url": im["coco_url"], "page_url": im.get("flickr_url", ""), "title": im["file_name"], "license": licenses.get(im["license"], "")}
             for im in wanted][: cfg["coco"]["count"] + 40]
    if have < cfg["coco"]["count"]:
        print(f"COCO: đã có {have}, tải tiếp...", flush=True)
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(fetch, items[: cfg["coco"]["count"] - have + sum(1 for i in items if i["url"] in tried)]))

    # 2. Đồ chơi, xe không phải robot
    search = ImageSearch(root / "cache" / "ddg", cfg["toys"]["delay"], "moderate")
    for query in cfg["toys"]["queries"]:
        have = sum(1 for r in rows if r["subset"] == query)
        if have >= cfg["toys"]["per_query"]:
            continue
        found = []
        for page in range(1, cfg["toys"]["pages"] + 1):
            found += [{"group": "toy", "subset": query, "url": r.get("image", ""), "page_url": r.get("url", ""), "title": r.get("title", "")[:120], "license": "không rõ"}
                      for r in search.images(query, page) if r.get("image")]
        found = list({f["url"]: f for f in found}.values())
        need = cfg["toys"]["per_query"] - have
        print(f"{query}: có {have}, ứng viên {len(found)}", flush=True)
        with ThreadPoolExecutor(max_workers=8) as pool:
            for start in range(0, len(found), 16):
                if sum(1 for r in rows if r["subset"] == query) >= cfg["toys"]["per_query"]:
                    break
                list(pool.map(fetch, found[start : start + 16]))
        del need

    # 3. Làm sạch: bỏ trùng sha1, bỏ ảnh đã có trong bộ ảnh robot, bỏ ảnh quá nhỏ; cắt về đúng hạn mức
    table = pd.DataFrame(rows).astype({"width": int, "height": int})
    raw_count = len(table)
    with gzip.open(MANIFESTS / "b02_manifest.csv.gz", "rt", encoding="utf-8", newline="") as handle:
        robot_sha = {r["sha1"] for r in csv.DictReader(handle)}
    table["drop"] = ""
    table.loc[table.duplicated("sha1"), "drop"] = "trùng trong tập âm"
    table.loc[table["sha1"].isin(robot_sha), "drop"] = "trùng với ảnh của bộ robot"
    table.loc[(table[["width", "height"]].min(axis=1) < 128) & (table["drop"] == ""), "drop"] = "cạnh ngắn < 128 px"
    clean = table[table["drop"] == ""].copy()
    clean = pd.concat([clean[clean["group"] == "coco"].head(cfg["coco"]["count"])]
                      + [part.head(cfg["toys"]["per_query"]) for _, part in clean[clean["group"] == "toy"].groupby("subset", sort=False)]).reset_index(drop=True)

    # 4. Điểm "giống robot" bằng CLIP (cùng câu mô tả như B3)
    from robotrec.embed import ClipEncoder

    b03 = load_config("b03_lam_sach")
    encoder = ClipEncoder(b03["clip_model"], b03["clip_pretrained"])
    features, ok = encoder.images([image_root / f for f in clean["file"]], b03["batch_size"], b03["loader_workers"], cache=out_dir / "cache")
    positive, negative = b03["relevance_prompts"]["positive"], b03["relevance_prompts"]["negative"]
    clean["p_robot"] = encoder.zero_shot(features, positive + negative)[:, : len(positive)].sum(axis=1).round(4)
    clean = clean[ok].reset_index(drop=True)

    # 5. Chia tập, phân tầng theo nhóm con; ảnh cùng trang nguồn đi chung
    shares = cfg["split"]
    clean["split"] = ""
    for _, part in clean.groupby("subset", sort=True):
        unit = np.where(part["group"] == "toy", part["page_url"].where(part["page_url"] != "", part["url"]), part["url"])
        units = pd.unique(unit)
        rng.shuffle(units)
        cut_a, cut_b = int(round(shares["train"] * len(units))), int(round((shares["train"] + shares["val"]) * len(units)))
        assign = {u: ("train" if i < cut_a else "val" if i < cut_b else "test") for i, u in enumerate(units)}
        clean.loc[part.index, "split"] = [assign[u] for u in unit]
    columns = ["key", "group", "subset", "url", "page_url", "title", "license", "sha1", "width", "height", "file", "p_robot", "split"]
    buffer = io.StringIO()
    clean[columns].to_csv(buffer, index=False, lineterminator="\n")
    payload = buffer.getvalue().encode("utf-8")
    version = hashlib.sha256(payload).hexdigest()
    with gzip.GzipFile(MANIFESTS / "b04b_negatives.csv.gz", "wb", mtime=0) as handle:
        handle.write(payload)

    # Báo cáo ---------------------------------------------------------------------------------------------------------
    report = Report("B04b", "tap-am", "Tập âm: ảnh không phải robot")
    report.section(1)
    report.p(
        "Lập bộ ảnh **không phải robot** để đo mô hình có biết nói \"không nhận ra\" khi khách gửi ảnh chẳng liên quan hay không (RQ5, đánh giá ở B8). "
        "Bộ này bổ sung cho các lớp \"không biết\" của B04: lớp không biết là *robot lạ* (near-OOD, khó), còn tập âm là *vật không phải robot* (far-OOD)."
    )
    report.section(2)
    report.bullets(
        [
            "Đầu vào: file chú thích `instances_val2017.json` của COCO; kết quả tìm ảnh của 16 truy vấn đồ chơi và xe; manifest B2 (để loại ảnh trùng với bộ robot).",
            f"Đầu ra: `ml/data/manifests/b04b_negatives.csv.gz` ({len(clean)} ảnh; mã phiên bản sha256 `{version[:12]}`), ảnh tại `{image_root}` (không vào git).",
        ]
    )
    report.section(3)
    report.environment(env)
    report.section(4)
    report.bullets(
        [
            f"**Nhóm COCO** ({cfg['coco']['count']} ảnh): lấy ngẫu nhiên (hạt giống {cfg['seed']}) trong 5.000 ảnh của COCO val2017, bộ ảnh đời thường chuẩn của ngành "
            "(người, xe, động vật, đồ vật trong nhà). Mỗi ảnh có giấy phép Creative Commons ghi trong file chú thích; cột `license` của manifest giữ thông tin này.",
            f"**Nhóm đồ chơi, mô hình, xe** (tối đa {cfg['toys']['per_query']} ảnh mỗi truy vấn, {len(cfg['toys']['queries'])} truy vấn): tìm qua `ddgs` như B2. Đây là ảnh âm **khó**: "
            "cùng kiểu chụp sản phẩm, cùng nền trắng, có cả thứ trông hơi giống robot (áo giáp, mũ lính, mô hình xe tăng, tượng nhân vật).",
            "Truy vấn: " + "; ".join(f"*{q}*" for q in cfg["toys"]["queries"]) + ".",
            "**Tải và chuẩn hoá** như B2: tôn trọng robots.txt, mỗi host cách nhau 1 giây, thu cạnh dài về 512 px, JPEG chất lượng 90, tên file theo sha1.",
            "**Làm sạch**: bỏ ảnh trùng sha1, bỏ ảnh có sha1 nằm trong bộ ảnh robot của B2, bỏ ảnh có cạnh ngắn dưới 128 px.",
            "**Điểm giống robot**: cùng phép tính p_robot như B3 (CLIP ViT-L/14, cùng các câu mô tả). Ảnh âm có p_robot cao là ảnh dễ làm mô hình nhầm.",
            f"**Chia tập**: âm-train {int(shares['train'] * 100)}% (chỉ dùng cho thí nghiệm outlier exposure E7), âm-val {int(shares['val'] * 100)}% (chọn ngưỡng từ chối), "
            f"âm-test {int(shares['test'] * 100)}% (đo). Chia riêng trong từng truy vấn; các ảnh cùng một trang web nguồn đi chung một tập.",
            "**Khác kế hoạch**: kế hoạch ghi 1.000 ảnh COCO và 500 ảnh đồ chơi, chia đôi val/test. Ở đây lấy gấp đôi để có thêm phần âm-train cho thí nghiệm E7 "
            "(kế hoạch B8 cần \"ảnh âm của tập train\" nhưng B4 chưa dành phần này). Phần val và test vẫn đúng cỡ kế hoạch.",
        ]
    )
    report.h3("Giải thích bằng lời thường")
    report.bullets(
        [
            "Mô hình phân loại luôn chọn một trong các đáp án nó biết. Đưa ảnh con mèo, nó vẫn sẽ trả lời tên một robot nào đó, trừ khi ta dạy nó cách từ chối.",
            "**Tập âm** là bộ đề \"bẫy\": toàn ảnh mà câu trả lời đúng là \"không phải robot nào cả\". Đếm xem mô hình sập bẫy bao nhiêu lần.",
            "Ảnh COCO là bẫy dễ (phong cảnh, bữa ăn, đường phố). Ảnh đồ chơi và xe là bẫy khó: trông giống ảnh sản phẩm robot.",
        ]
    )
    report.section(5)
    group_label = {"coco": "COCO val2017", "toy": "Đồ chơi, mô hình, xe"}
    size_rows = []
    for key, label in group_label.items():
        part = clean[clean["group"] == key]
        size_rows.append([label, len(part)] + [int((part["split"] == s).sum()) for s in SPLIT_LABEL] + [vn(part["p_robot"].median(), 3), pct((part["p_robot"] >= 0.5).sum(), len(part))])
    size_rows.append(["Tổng", len(clean)] + [int((clean["split"] == s).sum()) for s in SPLIT_LABEL] + [vn(clean["p_robot"].median(), 3), pct((clean["p_robot"] >= 0.5).sum(), len(clean))])
    size_columns = ["Nhóm", "Số ảnh"] + list(SPLIT_LABEL.values()) + ["Trung vị p_robot", "Ảnh có p_robot ≥ 0,5"]
    report.table(size_rows, size_columns, caption="Bảng 1. Kích thước tập âm")
    drops = Counter(table["drop"])
    funnel_rows = [["Ảnh tải được", raw_count]] + [[f"Bỏ: {k}", v] for k, v in drops.items() if k] + [["Vượt hạn mức mỗi nhóm hoặc không đọc được", raw_count - sum(v for k, v in drops.items() if k) - len(clean)], ["Còn lại", len(clean)]]
    report.table(funnel_rows, ["Bước", "Số ảnh"], caption="Bảng 2. Làm sạch tập âm")
    query_rows = []
    for query in cfg["toys"]["queries"]:
        part = clean[clean["subset"] == query]
        query_rows.append([query, len(part)] + [int((part["split"] == s).sum()) for s in SPLIT_LABEL] + [vn(part["p_robot"].median(), 3) if len(part) else "—", pct((part["p_robot"] >= 0.5).sum(), len(part))])
    query_columns = ["Truy vấn", "Số ảnh"] + list(SPLIT_LABEL.values()) + ["Trung vị p_robot", "Ảnh có p_robot ≥ 0,5"]
    report.table(query_rows, query_columns, caption="Bảng 3. Nhóm đồ chơi, mô hình, xe theo truy vấn")
    license_rows = [[k, v] for k, v in Counter(clean.loc[clean["group"] == "coco", "license"]).most_common()]
    report.table(license_rows, ["Giấy phép (COCO)", "Số ảnh"], caption="Bảng 4. Giấy phép của ảnh COCO")

    fig, ax = plt.subplots(figsize=(7, 2.8))
    bins = np.linspace(0, 1, 41)
    ax.hist(clean.loc[clean["group"] == "coco", "p_robot"], bins=bins, alpha=0.65, label="COCO", color="#64748b")
    ax.hist(clean.loc[clean["group"] == "toy", "p_robot"], bins=bins, alpha=0.65, label="Đồ chơi, mô hình, xe", color="#c2410c")
    ax.set_xlabel("Điểm giống robot p_robot (CLIP)")
    ax.set_ylabel("Số ảnh")
    ax.set_yscale("log")
    ax.legend(fontsize=8)
    fig.tight_layout()
    report.figure(fig, "p-robot", "Điểm giống robot của ảnh âm (trục dọc thang log): ảnh đồ chơi bị CLIP coi là giống robot nhiều hơn hẳn ảnh COCO")
    plt.close(fig)

    def sheet(part: pd.DataFrame, title: str) -> plt.Figure:
        fig, axes = plt.subplots(3, 8, figsize=(16, 6.6))
        for ax in axes.ravel():
            ax.axis("off")
        for ax, (_, r) in zip(axes.ravel(), part.iterrows()):
            with Image.open(image_root / r["file"]) as image:
                ax.imshow(image.convert("RGB"))
            ax.set_title(f"{r['subset'][:24]}\np_robot {vn(r['p_robot'], 2)}", fontsize=7)
        fig.suptitle(title, fontsize=10)
        fig.tight_layout()
        return fig

    sample = pd.concat([clean[clean["group"] == "coco"].sample(8, random_state=cfg["seed"]),
                        clean[clean["group"] == "toy"].groupby("subset", sort=False).head(1)])
    fig = sheet(sample, "Ảnh mẫu của tập âm: hàng đầu là COCO, hai hàng sau mỗi truy vấn một ảnh")
    report.figure(fig, "mau-anh", "Ảnh mẫu của tập âm")
    plt.close(fig)
    fig = sheet(clean.sort_values("p_robot", ascending=False).head(24), "24 ảnh âm có điểm giống robot cao nhất")
    report.figure(fig, "giong-robot-nhat", "Ảnh âm bị CLIP chấm giống robot nhất: cần xem có lẫn robot thật không")
    plt.close(fig)

    report.set("dataset_version", version)
    report.set("sizes", {s: int((clean["split"] == s).sum()) for s in SPLIT_LABEL})
    report.set("attempts", {f"{g}:{s}": n for (g, s), n in status_count.items()})
    report.set("tables", {
        "Bảng 1. Kích thước tập âm": {"columns": size_columns, "rows": size_rows},
        "Bảng 2. Làm sạch tập âm": {"columns": ["Bước", "Số ảnh"], "rows": funnel_rows},
        "Bảng 3. Theo truy vấn": {"columns": query_columns, "rows": query_rows},
        "Bảng 4. Giấy phép của ảnh COCO": {"columns": ["Giấy phép (COCO)", "Số ảnh"], "rows": license_rows},
    })
    toy, coco = clean[clean["group"] == "toy"], clean[clean["group"] == "coco"]
    report.section(6)
    report.bullets(
        [
            f"Tập âm có {len(clean)} ảnh: {len(coco)} ảnh COCO và {len(toy)} ảnh đồ chơi, mô hình, xe.",
            f"CLIP coi {pct((coco['p_robot'] >= 0.5).sum(), len(coco))} ảnh COCO và {pct((toy['p_robot'] >= 0.5).sum(), len(toy))} ảnh đồ chơi là \"giống robot\" (p_robot ≥ 0,5). "
            "Nghĩa là bộ lọc \"điểm liên quan\" của B3 chỉ loại được ảnh đời thường, không loại được đồ chơi khác: phân biệt robot với đồ chơi khác là việc của mô hình và ngưỡng từ chối ở B8.",
            "Đã mở xem 24 ảnh âm có điểm giống robot cao nhất (hình \"giống robot nhất\"): xe địa hình, xe tăng mô hình, tượng siêu anh hùng, mũ giáp, không có "
            "robot nào của danh mục. Phần còn lại của nhóm đồ chơi chưa được người duyệt từng ảnh, nên vẫn có thể lẫn vài ảnh robot.",
        ]
    )
    report.section(7)
    report.bullets(
        [
            "Nhóm đồ chơi lấy từ tìm kiếm nên có nhiễu và chưa duyệt tay (kế hoạch yêu cầu duyệt tay); nếu lẫn ảnh robot thì tỉ lệ \"chấp nhận nhầm\" đo ở B8 sẽ cao giả.",
            "16 truy vấn không đại diện cho mọi thứ khách có thể gửi (ảnh chụp màn hình, giấy tờ, ảnh tự sướng). COCO bù một phần.",
            "Giấy phép ảnh đồ chơi không rõ; chỉ dùng cho nghiên cứu, không phân phối lại. Ảnh COCO có giấy phép Creative Commons ghi theo từng ảnh.",
        ]
    )
    report.section(8)
    report.reproduce(["ml/.venv/Scripts/python ml/scripts/b04b_tap_am.py"], config="ml/configs/b04b_tap_am.yaml", config_hash=config_hash(cfg), seed=cfg["seed"],
                     dataset_version=f"b04b_negatives.csv sha256 {version[:12]}")
    print(report.write())
    print(json.dumps({"n": len(clean), "sizes": report.summary["sizes"]}, ensure_ascii=False))


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
