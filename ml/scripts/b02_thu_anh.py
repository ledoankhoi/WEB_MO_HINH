"""B2. Thu thập ảnh (docs/nhan-dang-robot/00-ke-hoach.md mục 8, B2).

Với mỗi lớp trong robots.json:
1. Ứng viên từ thư viện ảnh trên wiki (trang của robot, trang con /toys của TFWiki, cả hai trang của cặp Power Rangers –
   Super Sentai) và từ DuckDuckGo Images (mẫu truy vấn theo franchise, 3 trang kết quả mỗi truy vấn).
2. Xen kẽ hai nguồn, bỏ URL trùng, tải song song (giới hạn tốc độ theo host, tôn trọng robots.txt) tới khi đủ `target_ok`
   ảnh hoặc hết `max_attempts` URL.
3. Ảnh chuẩn hoá về JPEG cạnh dài 512 px tại ROBOTREC_DATA/images/raw/<lớp>/<sha1[:16]>.jpg.

Ghi (chạy lại được, bỏ qua URL đã thử):
- ROBOTREC_DATA/b02/manifest.csv: mỗi ảnh tải được một dòng; bản nén ml/data/manifests/b02_manifest.csv.gz (vào git).
- ROBOTREC_DATA/b02/attempts.csv: mọi lần thử, kể cả thất bại, kèm lý do.
- Báo cáo B02 (hoặc B02a khi chạy thử).

Chạy: python ml/scripts/b02_thu_anh.py [--pilot] [--classes slug1,slug2] [--report-only]
"""

from __future__ import annotations

import argparse
import csv
import gzip
import random
import re
import shutil
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import json  # noqa: E402

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from robotrec.config import MANIFESTS, config_hash, data_root, file_sha256, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.fetch import USER_AGENT, Fetcher, normalize_image  # noqa: E402
from robotrec.mediawiki import MediaWiki  # noqa: E402
from robotrec.report import Report  # noqa: E402
from robotrec.search import ImageSearch  # noqa: E402
from robotrec.stats import mean_std  # noqa: E402

MANIFEST_FIELDS = ["image_id", "class", "franchise", "source", "query", "url", "page_url", "title", "sha1", "width", "height", "bytes", "file", "downloaded_at"]
ATTEMPT_FIELDS = ["class", "source", "url", "status", "detail", "seconds", "at"]
STATUS_LABEL = {
    "ok": "tải được",
    "http_4xx": "HTTP 4xx (bị từ chối, không còn)",
    "http_5xx": "HTTP 5xx / 429 (máy chủ lỗi, quá tải)",
    "timeout": "hết thời gian",
    "network": "lỗi mạng",
    "not_image": "không phải ảnh",
    "decode_error": "không đọc được ảnh",
    "too_large": "quá 20 MB",
    "too_small": "cạnh ngắn < 32 px",
    "robots": "robots.txt không cho phép",
    "blocked_host": "host trong danh sách không truy cập",
}


# Ứng viên --------------------------------------------------------------------------------------------------------


def wiki_candidates(robot: dict, wikis: dict[str, MediaWiki], cfg: dict) -> list[dict]:
    source_cfg = cfg["sources"]["wiki"]
    # Franchise có wiki ảnh riêng (Transformers: Teletraan I thay cho TFWiki) thì giải tên trang của B1 theo chuyển hướng ở đó.
    image_wiki = cfg.get("image_wikis", {}).get(robot["franchise"])
    key = f"img:{robot['franchise']}" if image_wiki else robot["wiki"]["key"]
    wiki = wikis[key]
    page_base = image_wiki["page_url"] if image_wiki else cfg["_wiki_page_url"][robot["wiki"]["key"]]
    titles = list(robot["wiki"]["titles"])
    for suffix in source_cfg.get("subpages", {}).get(key, []):
        titles += [f"{title}{suffix}" for title in robot["wiki"]["titles"]]
    resolved = [real for real in wiki.resolve(titles).values() if real]
    files: list[tuple[str, str]] = []
    for title in dict.fromkeys(resolved):
        for data in wiki.query_pages({"prop": "images", "titles": title, "imlimit": 500}):
            for page in wiki._pages(data):
                files += [(item["title"], title) for item in page.get("images", [])]
    allowed = tuple(f".{ext}" for ext in source_cfg["extensions"])
    files = [(name, page) for name, page in dict.fromkeys(files) if name.lower().endswith(allowed)]
    urls = wiki.image_urls(name for name, _ in files)
    out = []
    for name, page in files:
        url = urls.get(name)
        if url:
            out.append({"source": "wiki", "query": page, "url": url, "page_url": page_base + page.replace(" ", "_"), "title": name})
    return out[: source_cfg["max_per_class"]]


def queries_for(robot: dict, cfg: dict) -> list[str]:
    franchise = robot["franchise"]
    alias = robot["aliases"][0] if robot["aliases"] else ""
    name = robot["name"]
    if franchise == "transformers":
        words = cfg["tf_keywords"].get(robot["group"], {"kw": "", "medium": ""})
        values = {"name": name, "kw": words["kw"], "medium": words["medium"], "alias": alias}
    elif franchise == "sentai":
        series = robot["series"] or ""
        kw = series.split("/")[-1].strip() if "/" in series else (series or "super sentai")
        values = {"name": name, "kw": kw, "alias": alias}
    else:
        values = {"name": name, "kw": "", "alias": alias}
    # Truy vấn bổ sung của riêng lớp (cấu hình `extra_queries`): đặt trước để không bị giới hạn số URL cắt mất.
    queries = [q for q in dict.fromkeys(cfg.get("extra_queries", {}).get(robot.get("slug", ""), [])) if q]
    for template in cfg["queries"][franchise]:
        if "{alias}" in template and not alias:
            continue
        query = re.sub(r"\s+", " ", template.format(**values)).strip()
        if query and query not in queries:
            queries.append(query)
    return queries


def ddg_candidates(robot: dict, search: ImageSearch, cfg: dict) -> list[dict]:
    source_cfg = cfg["sources"]["ddg"]
    limit = source_cfg["max_per_class"] + (cfg.get("extra_url_cap", 0) if robot["slug"] in cfg.get("extra_queries", {}) else 0)
    out = []
    for query in queries_for(robot, cfg):
        # Dừng sớm: đã đủ URL khác nhau thì không gửi thêm truy vấn (lớp phổ biến chỉ cần vài truy vấn đầu).
        if len({item["url"] for item in out}) >= limit:
            break
        for page in range(1, source_cfg["pages"] + 1):
            results = search.images(query, page)
            out += [
                {"source": "ddg", "query": query, "url": item.get("image", ""), "page_url": item.get("url", ""), "title": item.get("title", "")}
                for item in results
                if item.get("image")
            ]
            if len(results) < 20:
                break
    seen: set[str] = set()
    unique = []
    for item in out:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)
    return unique[:limit]


def interleave(*lists: list[dict]) -> list[dict]:
    """Xen kẽ các nguồn để không nguồn nào chiếm hết suất khi dừng sớm; bỏ URL trùng."""
    out, seen = [], set()
    for index in range(max((len(items) for items in lists), default=0)):
        for items in lists:
            if index < len(items) and items[index]["url"] not in seen:
                seen.add(items[index]["url"])
                out.append(items[index])
    return out


# Ghi file --------------------------------------------------------------------------------------------------------


class Ledger:
    """manifest.csv và attempts.csv, ghi nối tiếp an toàn giữa các luồng; nạp lại khi chạy tiếp."""

    def __init__(self, folder: Path) -> None:
        folder.mkdir(parents=True, exist_ok=True)
        self.manifest_path = folder / "manifest.csv"
        self.attempts_path = folder / "attempts.csv"
        self.lock = threading.Lock()
        self.manifest = self._read(self.manifest_path)
        self.attempts = self._read(self.attempts_path)
        self.done = {(row["class"], row["url"]) for row in self.attempts}
        # Kết quả theo URL (dùng lại khi cùng URL xuất hiện ở lớp khác).
        self.by_url: dict[str, dict] = {}
        for row in self.manifest:
            self.by_url.setdefault(row["url"], row)
        self.failed = {row["url"]: row for row in self.attempts if row["status"] != "ok"}
        self.ok_count = Counter(row["class"] for row in self.manifest)

    @staticmethod
    def _read(path: Path) -> list[dict]:
        if not path.exists():
            return []
        with open(path, encoding="utf-8", newline="") as handle:
            return list(csv.DictReader(handle))

    def _append(self, path: Path, fields: list[str], row: dict) -> None:
        new = not path.exists()
        with open(path, "a", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fields)
            if new:
                writer.writeheader()
            writer.writerow(row)

    def record(self, attempt: dict, manifest_row: dict | None) -> None:
        with self.lock:
            self._append(self.attempts_path, ATTEMPT_FIELDS, attempt)
            self.attempts.append(attempt)
            self.done.add((attempt["class"], attempt["url"]))
            if manifest_row:
                self._append(self.manifest_path, MANIFEST_FIELDS, manifest_row)
                self.manifest.append(manifest_row)
                self.by_url.setdefault(manifest_row["url"], manifest_row)
                self.ok_count[manifest_row["class"]] += 1
            else:
                self.failed.setdefault(attempt["url"], attempt)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def process(item: dict, robot: dict, fetcher: Fetcher, ledger: Ledger, image_root: Path, cfg: dict) -> str:
    url = item["url"]
    base = {"class": robot["slug"], "source": item["source"], "url": url, "at": now()}
    reused = ledger.by_url.get(url)
    if reused:  # cùng URL đã tải cho lớp khác: dùng lại file, B3 sẽ xử lý trùng giữa các lớp
        row = {**reused, "class": robot["slug"], "franchise": robot["franchise"], "source": item["source"], "query": item["query"],
               "page_url": item["page_url"], "title": item["title"], "downloaded_at": now()}
        ledger.record({**base, "status": "ok", "detail": "dùng lại file của lớp khác", "seconds": 0}, row)
        return "ok"
    if url in ledger.failed:
        failed = ledger.failed[url]
        ledger.record({**base, "status": failed["status"], "detail": "đã thất bại ở lớp khác", "seconds": 0}, None)
        return failed["status"]
    data, result = fetcher.download(url)
    if data is not None:
        result_img = normalize_image(data, image_root / "_tmp" / f"{threading.get_ident()}.jpg", cfg["max_side"], cfg["jpeg_quality"])
        if result_img.status == "ok":
            image_id = result_img.sha1[:16]
            target = image_root / robot["slug"] / f"{image_id}.jpg"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(result_img.path), target)
            result_img.path = target
        result_img.seconds = result.seconds
        result = result_img
    attempt = {**base, "status": result.status, "detail": result.detail, "seconds": round(result.seconds, 2)}
    row = None
    if result.status == "ok":
        row = {
            "image_id": result.sha1[:16], "class": robot["slug"], "franchise": robot["franchise"], "source": item["source"],
            "query": item["query"], "url": url, "page_url": item["page_url"], "title": item["title"], "sha1": result.sha1,
            "width": result.width, "height": result.height, "bytes": result.bytes,
            "file": result.path.relative_to(image_root).as_posix(), "downloaded_at": now(),
        }
    ledger.record(attempt, row)
    return result.status


# Báo cáo ---------------------------------------------------------------------------------------------------------


def sample_grid(manifest: list[dict], robots: list[dict], image_root: Path, slugs: list[str], per_class: int, seed: int) -> plt.Figure:
    rng = random.Random(seed)
    names = {r["slug"]: r["display_name"] for r in robots}
    fig, axes = plt.subplots(len(slugs), per_class, figsize=(per_class * 1.6, len(slugs) * 1.75))
    axes = np.atleast_2d(axes)
    for row, slug in enumerate(slugs):
        rows = [m for m in manifest if m["class"] == slug]
        picks = rng.sample(rows, min(per_class, len(rows)))
        for col in range(per_class):
            ax = axes[row, col]
            ax.axis("off")
            if col < len(picks):
                with Image.open(image_root / picks[col]["file"]) as image:
                    image.thumbnail((200, 200))
                    ax.imshow(image)
                ax.set_title(picks[col]["source"], fontsize=6, color="#475569")
        axes[row, 0].text(-0.08, 0.5, names.get(slug, slug)[:28], transform=axes[row, 0].transAxes, ha="right", va="center", fontsize=8)
    fig.subplots_adjust(left=0.2, wspace=0.05, hspace=0.35)
    return fig


def active_minutes(attempts: list[dict], max_gap: float = 300.0) -> float:
    """Thời gian thật sự có tải: cộng khoảng cách giữa hai lượt thử liên tiếp khi khoảng đó ≤ `max_gap` giây.

    Thời gian đồng hồ của một lần chạy gồm cả lúc máy ngủ hoặc dừng (lần chạy 08/11/2026: 656 phút đồng hồ, khoảng 420 phút
    máy ở Modern Standby), nên không dùng làm thời gian thu thập."""
    times = sorted(datetime.fromisoformat(a["at"]) for a in attempts if a.get("at"))
    gaps = [(b - a).total_seconds() for a, b in zip(times, times[1:])]
    return round(sum(g for g in gaps if g <= max_gap) / 60, 1)


def write_report(robots: list[dict], selected: list[dict], ledger: Ledger, image_root: Path, cfg: dict, env: dict, stats: dict, pilot: bool) -> Path:
    slugs = {r["slug"] for r in selected}
    manifest = [row for row in ledger.manifest if row["class"] in slugs]
    attempts = [row for row in ledger.attempts if row["class"] in slugs]
    by_class = Counter(row["class"] for row in manifest)
    counts = np.array([by_class.get(r["slug"], 0) for r in selected])
    step, slug, title = ("B02a", "thu-anh-chay-thu", "Thu thập ảnh: chạy thử") if pilot else ("B02", "thu-anh", "Thu thập ảnh")
    report = Report(step, slug, title)

    report.section(1)
    report.p(
        "Thu ảnh thô cho từng lớp của danh mục B1 từ nguồn công khai, đa dạng miền (ảnh chụp đồ chơi và mô hình, ảnh chụp màn hình "
        "phim và hoạt hình, ảnh CGI, tranh vẽ). Ảnh thô còn lẫn ảnh sai và trùng; B3 làm sạch và đo chất lượng nhãn. Đóng góp vào RQ1."
        + (" Đây là lần **chạy thử** trên một số lớp để đo tỉ lệ tải được và kiểm tra nguồn trước khi chạy đủ." if pilot else "")
    )
    report.section(2)
    report.bullets(
        [
            f"Đầu vào: `ml/data/manifests/robots.json` ({len(robots)} lớp); chạy trên {len(selected)} lớp.",
            f"Đầu ra: ảnh JPEG tại `{image_root}` (không vào git, chỉ dùng cho nghiên cứu); `manifest.csv` mỗi ảnh một dòng "
            "(lớp, nguồn, truy vấn, URL ảnh, trang chứa ảnh, sha1 của byte gốc, kích thước gốc); `attempts.csv` mọi lần thử kèm kết quả. "
            "Bản nén của manifest: `ml/data/manifests/b02_manifest.csv.gz`.",
        ]
    )
    report.section(3)
    report.environment(env)
    report.section(4)
    report.bullets(
        [
            "**Nguồn 1, wiki:** ảnh của trang robot (`prop=images`): Gundam lấy từ The Gundam Wiki, Super Sentai / Power Rangers từ RangerWiki "
            "(cả hai trang của cặp đã gộp), Transformers từ **Teletraan I** (transformers.fandom.com) vì TFWiki không dùng được (xem dưới); "
            "tên trang của B1 được giải theo chuyển hướng của Teletraan I, ví dụ *Optimus Prime (G1)* → *Optimus Prime (Primax)*. "
            f"Chỉ lấy file {', '.join(cfg['sources']['wiki']['extensions'])} (bỏ video, tài liệu); tối đa {cfg['sources']['wiki']['max_per_class']} ảnh mỗi lớp.",
            "**Không dùng TFWiki để lấy ảnh:** robots.txt của TFWiki không cho tải thư mục ảnh (lần chạy thử bị chặn 286 URL), và chiều "
            "07/11/2026 máy chủ trả trang *\"Access Denied: temporarily blocked due to excessive traffic\"* sau khoảng 1.500 yêu cầu API của B1 "
            "và lần chạy thử. TFWiki được đưa vào danh sách host không truy cập (`blocked_hosts`); danh mục B1 dùng nội dung đã cache.",
            "**Nguồn 2, tìm ảnh qua thư viện `ddgs`** ở chế độ `auto`: thư viện gọi đồng thời **DuckDuckGo Images và Bing Images** rồi gộp kết quả "
            "(phát hiện khi kiểm tra mã nguồn thư viện; báo cáo gọi chung là \"DuckDuckGo\" nhưng thực chất là hai công cụ). Kết quả Bing qua `ddgs` "
            "khớp truy vấn (ví dụ trang seibertron.com, transformerland.com), khác với lần gọi Bing trực tiếp bị loại ở trên. Công cụ của từng URL suy ra "
            "từ trường `source`: DuckDuckGo để trống, Bing ghi tên miền. Mỗi lớp 6–8 mẫu truy vấn theo franchise (bảng 1), "
            f"{cfg['sources']['ddg']['pages']} trang kết quả mỗi truy vấn (khoảng 35 ảnh mỗi trang), SafeSearch {cfg['sources']['ddg']['safesearch']}, "
            f"cách nhau {cfg['sources']['ddg']['delay']} giây; tối đa {cfg['sources']['ddg']['max_per_class']} URL mỗi lớp: đủ số này thì dừng, không gửi các "
            "truy vấn còn lại (lớp phổ biến chỉ dùng vài mẫu đầu, lớp ít ảnh dùng hết). Kết quả tìm kiếm được cache trên đĩa. Lần chạy đủ đầu tiên "
            "dùng nhịp 1,5 giây và tìm hết mọi mẫu nên bị giới hạn tốc độ 5–7 lần mỗi lớp (khoảng 3 phút mỗi lớp); đã dừng và chạy tiếp với cấu hình này.",
            "**Bing Images bị loại** sau khi thử: truy vấn *Optimus Prime transformers G1 toy* trả về ảnh robot Tesla Optimus ở cả trang tìm "
            "kiếm lẫn API nội bộ, và tham số lật trang không đổi kết quả (105 kết quả nhưng chỉ 35 URL khác nhau). Dùng nguồn này sẽ gắn "
            "nhãn sai hàng loạt. **Flickr** không dùng vì cần khoá API; hai nguồn còn lại đủ số lượng.",
            "**Thứ tự tải:** xen kẽ wiki và DuckDuckGo, bỏ URL trùng trong lớp; dừng khi có "
            f"{cfg['target_ok']} ảnh tải được hoặc đã thử {cfg['max_attempts']} URL. Tải liên tục: luôn giữ {cfg['workers'] * 2} yêu cầu đang chạy, "
            f"lấy URL xen kẽ từ {cfg['active_classes']} lớp đang mở; một luồng riêng tìm ứng viên của các lớp kế tiếp. (Lần chạy thử đầu tải "
            "theo đợt, mỗi đợt chờ ảnh chậm nhất, nên mất 16,7 phút cho 6 lớp.)",
            f"**Tải lịch sự:** {cfg['workers']} luồng; mỗi host cách nhau tối thiểu {cfg['per_host_interval']} giây (CDN ảnh fandom 0,25 giây); "
            "tôn trọng robots.txt; User-Agent ghi rõ mục đích nghiên cứu "
            f"(`{USER_AGENT}`); thời gian chờ {cfg['timeout'][0]} giây kết nối, {cfg['timeout'][1]} giây đọc; thử lại {cfg['retries']} lần khi lỗi mạng, "
            "HTTP 429 hoặc 5xx (backoff mũ), không thử lại khi hết thời gian; bỏ file quá 20 MB.",
            f"**Chuẩn hoá:** Pillow đọc ảnh, lấy khung đầu của ảnh động, ghép nền trắng cho ảnh trong suốt, chuyển RGB, thu cạnh dài về "
            f"{cfg['max_side']} px (LANCZOS), lưu JPEG chất lượng {cfg['jpeg_quality']}. Tên file là 16 ký tự đầu sha1 của byte gốc. "
            "Ảnh có cạnh ngắn dưới 32 px bị bỏ ngay; ngưỡng 128 px của kế hoạch áp ở B3 để phễu lọc đầy đủ.",
            "**Cùng một URL ở hai lớp:** tải một lần, ghi cho cả hai lớp; B3 loại ảnh có nhãn mâu thuẫn.",
        ]
    )
    examples = [r for r in selected][:3]
    report.table([{"Lớp": r["display_name"], "Truy vấn DuckDuckGo": "; ".join(queries_for(r, cfg))} for r in examples], caption="Bảng 1. Ví dụ truy vấn của vài lớp")
    extra = cfg.get("extra_queries") or {}
    if extra:
        names = {r["slug"]: r["display_name"] for r in robots}
        report.p(
            "**Thu bổ sung (11/11/2026).** Sau lần thu đầu, 5 lớp có dưới 200 ảnh thô và hai lớp cùng tên *Thunder Megazord* dùng chung 4 trong 5 "
            "truy vấn (khoảng 80% ảnh của mỗi lớp nằm ở cả hai lớp, sẽ bị B3 loại vì nhãn mâu thuẫn). Các lớp này được tìm thêm bằng truy vấn riêng "
            "(bảng 1b): tên ngắn không kèm mã hiệu, tên dòng phim, tên bản Super Sentai. Truy vấn riêng được gửi trước truy vấn theo mẫu; "
            f"giới hạn URL của các lớp này tăng thêm {cfg.get('extra_url_cap', 0)}; ảnh đã tải ở lần đầu được giữ nguyên."
        )
        report.table(
            [{"Lớp": names.get(slug, slug), "Truy vấn bổ sung": "; ".join(queries), "Mục tiêu ảnh": cfg.get("target_ok_by_class", {}).get(slug, cfg["target_ok"])}
             for slug, queries in extra.items()],
            caption="Bảng 1b. Truy vấn bổ sung của 7 lớp",
        )

    report.section(5)
    total_ok = int(counts.sum())
    mean, std = mean_std(counts.tolist()) if len(counts) else (0.0, 0.0)
    summary = {
        "Số lớp": len(selected),
        "Ảnh tải được": total_ok,
        "Ảnh mỗi lớp: nhỏ nhất": int(counts.min()) if len(counts) else 0,
        "Ảnh mỗi lớp: trung vị": float(np.median(counts)) if len(counts) else 0,
        "Ảnh mỗi lớp: trung bình ± độ lệch chuẩn": f"{mean:.1f} ± {std:.1f}",
        "Ảnh mỗi lớp: lớn nhất": int(counts.max()) if len(counts) else 0,
        "Lớp dưới 200 ảnh": int((counts < 200).sum()),
        "Lượt thử": len(attempts),
        "Thời gian có tải, cộng mọi lần chạy (phút)": active_minutes(attempts),
        "Dung lượng ảnh (MB)": round(sum(p.stat().st_size for s in slugs for p in (image_root / s).glob("*.jpg")) / 1024**2, 1),
    }
    report.table(list(summary.items()), ["Chỉ số", "Giá trị"], caption="Bảng 2. Tổng quan")
    report.set("summary", summary)

    rows = []
    for source in ("wiki", "ddg"):
        tried = [a for a in attempts if a["source"] == source]
        status = Counter(a["status"] for a in tried)
        row = {"Nguồn": {"wiki": "Wiki", "ddg": "DuckDuckGo"}[source], "URL đã thử": len(tried), "Tải được": status.get("ok", 0),
               "Tỉ lệ tải được": f"{status.get('ok', 0) / len(tried) * 100:.1f}%" if tried else "—"}
        for key in STATUS_LABEL:
            if key != "ok":
                row[STATUS_LABEL[key]] = status.get(key, 0)
        rows.append(row)
    report.table(rows, caption="Bảng 3. Kết quả tải theo nguồn")
    report.set("by_source", rows)

    share = Counter((row["class"], row["source"]) for row in manifest)
    wiki_share = np.array([share[(r["slug"], "wiki")] / max(by_class.get(r["slug"], 0), 1) for r in selected])
    report.p(f"Tỉ lệ ảnh từ wiki trong mỗi lớp: trung vị {np.median(wiki_share) * 100:.0f}%, từ {wiki_share.min() * 100:.0f}% tới {wiki_share.max() * 100:.0f}%.")

    by_franchise = defaultdict(list)
    for r in selected:
        by_franchise[r["franchise_label"]].append(by_class.get(r["slug"], 0))
    report.table(
        [{"Franchise": k, "Số lớp": len(v), "Ảnh": sum(v), "Trung vị mỗi lớp": float(np.median(v)), "Nhỏ nhất": min(v), "Lớn nhất": max(v)} for k, v in by_franchise.items()],
        caption="Bảng 4. Theo franchise",
    )

    if len(selected) > 10:
        fig, ax = plt.subplots(figsize=(8, 3.6))
        ax.hist(counts, bins=30, color="#64748b")
        ax.axvline(200, color="#c2410c", linestyle="--", label="ngưỡng 200 ảnh")
        ax.set_xlabel("Số ảnh tải được của một lớp")
        ax.set_ylabel("Số lớp")
        ax.legend(frameon=False)
        ax.spines[["top", "right"]].set_visible(False)
        report.figure(fig, "phan-bo-anh-moi-lop", "Phân bố số ảnh tải được của các lớp")
        plt.close(fig)

    per_class = [{"Lớp": r["display_name"], "Franchise": r["franchise_label"], "Ảnh": by_class.get(r["slug"], 0),
                  "Từ wiki": share[(r["slug"], "wiki")], "Từ DuckDuckGo": share[(r["slug"], "ddg")]} for r in selected]
    low = sorted([row for row in per_class if row["Ảnh"] < 200], key=lambda row: row["Ảnh"])
    if low:
        report.table(low, caption="Bảng 5. Lớp dưới 200 ảnh (cần bổ sung truy vấn hoặc bỏ lớp)")
    report.set("low_classes", low)

    shared_urls = Counter(row["url"] for row in manifest)
    shared_sha = defaultdict(set)
    for row in manifest:
        shared_sha[row["sha1"]].add(row["class"])
    report.p(
        f"URL xuất hiện ở hơn một lớp: {sum(1 for n in shared_urls.values() if n > 1)}. Ảnh giống hệt (cùng sha1) nằm ở hơn một lớp: "
        f"{sum(1 for v in shared_sha.values() if len(v) > 1)}; B3 sẽ loại các ảnh này vì nhãn mâu thuẫn."
    )
    grid_slugs = [r["slug"] for r in selected if by_class.get(r["slug"], 0)][: 6 if pilot else 8]
    if grid_slugs:
        fig = sample_grid(manifest, robots, image_root, grid_slugs, 8, seed=42)
        report.figure(fig, "mau-anh", "Ảnh thô ngẫu nhiên của vài lớp (chưa làm sạch; nhãn nhỏ phía trên là nguồn)")
        plt.close(fig)
    if not pilot:
        report.table(per_class, caption=f"Bảng 6. Số ảnh của {len(per_class)} lớp")
        report.set("per_class", per_class)

    report.section(6)
    analysis = [f"Tổng {total_ok} ảnh thô cho {len(selected)} lớp; trung vị {summary['Ảnh mỗi lớp: trung vị']} ảnh mỗi lớp."]
    for row in rows:
        if row["URL đã thử"]:
            worst = max(((k, v) for k, v in row.items() if k in STATUS_LABEL.values() and k != "tải được"), key=lambda kv: kv[1])
            analysis.append(f"{row['Nguồn']}: tải được {row['Tỉ lệ tải được']} số URL; lỗi nhiều nhất là {worst[0]} ({worst[1]} URL).")
    analysis.append(
        "Đạt tiêu chí của kế hoạch (mọi lớp ≥ 200 ảnh thô)." if not low else f"{len(low)} lớp chưa đạt 200 ảnh thô (bảng 5)."
    )
    report.bullets(analysis)
    report.section(7)
    report.bullets(
        [
            "Ảnh thô chưa làm sạch: còn ảnh sai nhân vật, ảnh có nhiều robot, ảnh hộp, biểu tượng, trùng lặp. Số lượng ở đây là cận trên của số ảnh dùng được.",
            "Kết quả DuckDuckGo phụ thuộc thời điểm và vị trí truy vấn; cache trên đĩa giữ đúng kết quả đã dùng để tái lập.",
            "Ảnh có bản quyền của chủ sở hữu; chỉ dùng để huấn luyện cho nghiên cứu, không đưa lên web hay git, không phân phối lại. "
            "Manifest ghi nguồn từng ảnh.",
            "Ảnh trên wiki thiên về ảnh chụp màn hình phim và ảnh đồ chơi chính hãng chụp nền trắng; ảnh DuckDuckGo đa dạng hơn nhưng nhiễu hơn.",
        ]
    )
    report.section(8)
    report.reproduce(
        ["ml/.venv/Scripts/python ml/scripts/b02_thu_anh.py" + (" --pilot" if pilot else "")],
        config="ml/configs/b02_thu_anh.yaml",
        config_hash=config_hash(cfg),
        seed=42,
        dataset_version=f"robots.json sha256 {file_sha256(MANIFESTS / 'robots.json')[:12]}",
    )
    return report.write()


# Đường ống tải ---------------------------------------------------------------------------------------------------


def run_pipeline(selected: list[dict], wikis: dict, search: ImageSearch, fetcher: Fetcher, ledger: Ledger, image_root: Path, cfg: dict, started: float) -> None:
    """Tải liên tục: luôn giữ đủ việc cho các luồng, lấy URL xen kẽ từ `active_classes` lớp đang mở; một luồng riêng tìm
    ứng viên của các lớp kế tiếp. Lớp xong khi đủ `target_ok` ảnh, hết `max_attempts` URL hoặc hết ứng viên."""
    window = cfg["workers"] * 2
    target_of = lambda slug: cfg.get("target_ok_by_class", {}).get(slug, cfg["target_ok"])  # noqa: E731
    attempts_of = lambda slug: cfg.get("max_attempts_by_class", {}).get(slug, cfg["max_attempts"])  # noqa: E731

    def candidates(robot: dict) -> list[dict]:
        return interleave(wiki_candidates(robot, wikis, cfg), ddg_candidates(robot, search, cfg))

    with ThreadPoolExecutor(max_workers=1) as searcher, ThreadPoolExecutor(max_workers=cfg["workers"]) as pool:
        upcoming = [searcher.submit(candidates, robot) for robot in selected]  # chạy tuần tự trong một luồng
        next_index = 0
        active: list[dict] = []
        in_flight: dict = {}
        finished = 0
        while next_index < len(selected) or active:
            # Mở thêm lớp khi còn chỗ (chỉ chờ kết quả tìm kiếm khi không còn lớp nào đang tải).
            while len(active) < cfg["active_classes"] and next_index < len(selected) and (not active or upcoming[next_index].done()):
                robot = selected[next_index]
                items = upcoming[next_index].result()
                next_index += 1
                active.append({
                    "robot": robot,
                    "items": [item for item in items if (robot["slug"], item["url"]) not in ledger.done],
                    "found": len(items),
                    "tried": sum(1 for a in ledger.attempts if a["class"] == robot["slug"]),
                    "pending": 0,
                })
            # Giao việc xen kẽ giữa các lớp đang mở.
            progress = True
            while len(in_flight) < window and progress:
                progress = False
                for state in active:
                    slug = state["robot"]["slug"]
                    if (state["items"] and ledger.ok_count[slug] + state["pending"] < target_of(slug) and state["tried"] < attempts_of(slug)
                            and len(in_flight) < window):
                        item = state["items"].pop(0)
                        state["tried"] += 1
                        state["pending"] += 1
                        in_flight[pool.submit(process, item, state["robot"], fetcher, ledger, image_root, cfg)] = state
                        progress = True
            if in_flight:
                done, _ = wait(list(in_flight), timeout=5, return_when=FIRST_COMPLETED)
                for job in done:
                    state = in_flight.pop(job)
                    state["pending"] -= 1
                    job.result()
            # Đóng các lớp đã xong.
            for state in list(active):
                slug = state["robot"]["slug"]
                exhausted = not state["items"] or ledger.ok_count[slug] >= target_of(slug) or state["tried"] >= attempts_of(slug)
                if exhausted and state["pending"] == 0:
                    active.remove(state)
                    finished += 1
                    print(
                        f"[{finished}/{len(selected)}] {state['robot']['display_name']}: {ledger.ok_count[slug]} ảnh (ứng viên {state['found']}, "
                        f"đã thử {state['tried']}) | {(time.monotonic() - started) / 60:.1f} phút | DDG gửi {search.sent}, cache {search.cached}, lỗi {search.errors}",
                        flush=True,
                    )


# Chương trình chính -------------------------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", action="store_true", help="chỉ chạy các lớp trong pilot của cấu hình")
    parser.add_argument("--classes", help="danh sách slug, cách nhau bằng dấu phẩy")
    parser.add_argument("--report-only", action="store_true", help="không tải, chỉ sinh báo cáo từ manifest hiện có")
    args = parser.parse_args()

    cfg = load_config("b02_thu_anh")
    b01 = load_config("b01_danh_muc")
    cfg["_wiki_page_url"] = {key: value["page_url"] for key, value in b01["wikis"].items()}
    env = environment()
    robots = json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]
    if args.classes:
        wanted = args.classes.split(",")
    elif args.pilot:
        wanted = cfg["pilot"]
    else:
        wanted = [r["slug"] for r in robots]
    by_slug = {r["slug"]: r for r in robots}
    missing = [slug for slug in wanted if slug not in by_slug]
    if missing:
        raise SystemExit(f"Không có lớp: {missing}")
    selected = [by_slug[slug] for slug in wanted]

    root = data_root()
    image_root = root / "images" / "raw"
    ledger = Ledger(root / "b02")
    wikis = {key: MediaWiki(value["api"], root / "cache" / "mediawiki", 0.4) for key, value in b01["wikis"].items()}
    for franchise, value in (cfg.get("image_wikis") or {}).items():
        wikis[f"img:{franchise}"] = MediaWiki(value["api"], root / "cache" / "mediawiki", 0.4)
    search = ImageSearch(root / "cache" / "ddg", cfg["sources"]["ddg"]["delay"], cfg["sources"]["ddg"]["safesearch"])
    fetcher = Fetcher(cfg["per_host_interval"], tuple(cfg["timeout"]), cfg["retries"], cfg["max_bytes"], cfg["respect_robots_txt"],
                      cfg.get("host_intervals"), cfg.get("blocked_hosts"))

    started = time.monotonic()
    if not args.report_only:
        run_pipeline(selected, wikis, search, fetcher, ledger, image_root, cfg, started)
        shutil.rmtree(image_root / "_tmp", ignore_errors=True)

    # Bản nén của manifest vào git
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    with gzip.open(MANIFESTS / "b02_manifest.csv.gz", "wt", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, MANIFEST_FIELDS)
        writer.writeheader()
        writer.writerows(ledger.manifest)
    path = write_report(robots, selected, ledger, image_root, cfg, env, {"seconds": time.monotonic() - started}, args.pilot)
    print(f"Đã ghi {path}")


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
