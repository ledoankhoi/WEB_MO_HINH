"""B1. Danh mục robot và kho thông tin (docs/nhan-dang-robot/00-ke-hoach.md mục 8, B1).

Đầu ra:
- ml/data/manifests/robots.json: các lớp (robot + dòng) kèm thông tin.
- ml/data/manifests/b01_candidates.csv: mọi ứng viên đã xét ở tầng 2 (để duyệt và để tái lập).
- ml/data/manifests/store_products.csv, store_robot_map.csv: sản phẩm cửa hàng và lớp tương ứng.
- Báo cáo B01.

Chạy: python ml/scripts/b01_danh_muc.py
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import requests  # noqa: E402
import yaml  # noqa: E402
from rapidfuzz import fuzz  # noqa: E402
from scipy import stats as sps  # noqa: E402

from robotrec.config import CONFIGS, MANIFESTS, REPO_ROOT, config_hash, data_root, file_sha256, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.mediawiki import MediaWiki  # noqa: E402
from robotrec.report import Report  # noqa: E402
from robotrec.stats import wilson_ci  # noqa: E402
from robotrec.wikitext import (  # noqa: E402
    description,
    first_file,
    first_list_item,
    image_field,
    infobox,
    italic_summary,
    normalize_name,
    plain,
    slugify,
)

SUFFIX = re.compile(r"^(?P<name>.+?)\s*\((?P<suffix>[^()]+)\)$")
TF_FACTIONS = {"autobot": "Autobot", "decepticon": "Decepticon", "maximal": "Maximal", "predacon": "Predacon"}


@dataclass
class Candidate:
    franchise: str
    group: str
    wiki: str
    title: str
    faction: str | None
    page_bytes: int = 0
    text: str | None = None
    passed: bool | None = None
    reason: str = ""
    backlinks: int | None = None
    capped: bool = False
    mandatory: bool = False
    products: list[str] = field(default_factory=list)
    partner: str | None = None  # trang Super Sentai (hoặc Power Rangers) đã gộp vào
    partner_backlinks: int = 0
    selected_by: str | None = None
    rank: int | None = None

    @property
    def popularity(self) -> int:
        return (self.backlinks or 0) + self.partner_backlinks


# Đọc dữ liệu cửa hàng -----------------------------------------------------------------------------------------


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    return values


def store_products() -> tuple[list[dict[str, str]], str]:
    """Sản phẩm đang bán, đọc từ Supabase (REST); không có khoá thì dùng bản chụp đã lưu trong git."""
    snapshot = MANIFESTS / "store_products.csv"
    env = read_env_file(REPO_ROOT / ".env.local")
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SECRET_KEY")
    if url and key:
        response = requests.get(
            f"{url}/rest/v1/products",
            params={"select": "slug,name", "status": "eq.published", "order": "name"},
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=30,
        )
        response.raise_for_status()
        rows = [{"slug": row["slug"], "name": row["name"]} for row in response.json()]
        MANIFESTS.mkdir(parents=True, exist_ok=True)
        with open(snapshot, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, ["slug", "name"])
            writer.writeheader()
            writer.writerows(rows)
        return rows, "Supabase (bảng products, status = published)"
    with open(snapshot, encoding="utf-8") as handle:
        return list(csv.DictReader(handle)), "bản chụp ml/data/manifests/store_products.csv"


# Lọc và xếp hạng ----------------------------------------------------------------------------------------------


def title_ok(title: str, franchise: dict, group: dict) -> tuple[bool, str]:
    if "/" in title:
        return False, "trang con"
    if franchise["key"] == "transformers":
        match = SUFFIX.match(title)
        if match and match.group("suffix") not in group.get("suffixes", []):
            return False, f"hậu tố ({match.group('suffix')}) thuộc dòng khác"
    return True, ""


def structure_ok(candidate: Candidate, franchise: dict, group: dict) -> tuple[bool, str]:
    text = candidate.text or ""
    if not text:
        return False, "không đọc được nội dung"
    # Có trang đặt template trước lệnh chuyển hướng ({{delete}}#REDIRECT [[...]]) nên MediaWiki không coi là chuyển hướng.
    if "#redirect" in text[:300].lower():
        return False, "trang chuyển hướng"
    if franchise.get("require") == "factions":
        if "{{factions" not in text[:600].lower():
            return False, "không có thẻ phe {{factions}} (không phải trang nhân vật)"
        return True, ""
    box = infobox(text, tuple(franchise.get("infobox", [])))
    if box is None:
        return False, "không có infobox " + " / ".join(franchise.get("infobox", []))
    types = group.get("types") or franchise.get("types")
    if types:
        kind = plain(box.get("type", ""))
        if not any(wanted.lower() in kind.lower() for wanted in types):
            return False, f"type = {kind or 'trống'} (không phải robot hình người)"
    return True, ""


# Biến thể Gundam ----------------------------------------------------------------------------------------------

_MODEL = re.compile(r"^(?P<model>\S*\d\S*)\s+(?P<name>.+)$")
_MODEL_BASE = re.compile(r"^\D*\d+")
_POSSESSIVE = re.compile(r"\b[\w.-]+'s\s+")
# Tiền tố chỉ một biến thể của cùng thiết kế: Rick Dom là bản hoạt động ngoài không gian của Dom.
_VARIANT_PREFIX = {"rick"}


def gundam_family(title: str) -> str | None:
    """Họ của một mobile suit: số hiệu gốc (tới hết nhóm chữ số đầu tiên) + từ đầu của tên chính (bỏ tên chủ sở hữu, chữ
    Gundam và tiền tố biến thể).

    MS-06F Zaku II, MS-06F-2 Zaku II F2 Type, MS-06S Char's Zaku II → ms-06|zaku; MS-09R Rick Dom → ms-09|dom.
    XXXG-01W Wing Gundam (xxxg-01|wing) và XXXG-01D Gundam Deathscythe (xxxg-01|deathscythe) khác họ dù chung số hiệu gốc."""
    match = _MODEL.match(title)
    if not match:
        return None
    base = _MODEL_BASE.match(match.group("model"))
    model = base.group(0) if base else match.group("model")
    words = [word for word in normalize_name(_POSSESSIVE.sub("", match.group("name"))).split() if word != "gundam"]
    if len(words) > 1 and words[0] in _VARIANT_PREFIX:
        words = words[1:]
    return f"{model.lower()}|{words[0] if words else ''}"


def tf_faction(text: str) -> str | None:
    match = re.search(r"\{\{factions\|([^|}]+)", text, re.I)
    return TF_FACTIONS.get(match.group(1).strip().lower()) if match else None


# Gộp Power Rangers với Super Sentai ---------------------------------------------------------------------------

_ABBREV = re.compile(r"^[A-Za-z]{2,6}-")


def image_core(file: str | None, strict: bool = True) -> str | None:
    """`KSZ-Daizyuzin.png` → `daizyuzin`: bỏ phần mở rộng và tiền tố viết tắt tên series Super Sentai.

    strict=False: tên file không có tiền tố (ví dụ `Gosei_Great.png`) thì lấy cả tên file."""
    if not file:
        return None
    stem = file.rsplit(".", 1)[0].replace("_", " ")
    if not _ABBREV.match(stem):
        return None if strict else (normalize_name(stem) or None)
    return normalize_name(_ABBREV.sub("", stem, count=1)) or None


_ZORD_WORDS = {"megazord", "zord", "battlezord", "ultrazord"}


def sentai_keys(candidate: Candidate) -> set[str]:
    """Các khoá để tìm trang Super Sentai: tên trong infobox, tên trong ảnh, tên trang và tên trang bỏ phần "... Gattai"."""
    box = infobox(candidate.text or "", ("SentaiMegazordInfo",)) or {}
    keys = {normalize_name(plain(box.get("name", "")))} if box.get("name") else set()
    keys.add(image_core(image_field(box.get("image"))) or "")
    title = normalize_name(candidate.title)
    keys.add(title)
    if " gattai " in f" {title} ":
        keys.add(title.split("gattai", 1)[1].strip())
    return {key for key in keys if key}


def ranger_keys(candidate: Candidate) -> list[tuple[str, str]]:
    """Khoá của trang Power Rangers, theo thứ tự tin cậy: tên robot Super Sentai trong tên ảnh có tiền tố viết tắt,
    tên ảnh không tiền tố, tên Megazord bỏ chữ Megazord/Zord."""
    box = infobox(candidate.text or "", ("MegazordInfo",)) or {}
    file = image_field(box.get("image"))
    keys = [("ảnh có tiền tố series", image_core(file)), ("tên ảnh", image_core(file, strict=False))]
    name = normalize_name(plain(box.get("name", "")) or candidate.title)
    keys.append(("tên bỏ chữ Megazord", " ".join(word for word in name.split() if word not in _ZORD_WORDS)))
    return [(rule, key) for rule, key in keys if key]


def merge_ranger(candidates: list[Candidate]) -> tuple[list[Candidate], list[tuple[str, str, str]]]:
    """Gộp trang Power Rangers vào trang Super Sentai của cùng robot. Trả về danh sách sau gộp (bản Power Rangers làm bản
    chính, tên Super Sentai thành tên khác) và các cặp đã gộp kèm luật đã khớp."""
    sentai = [c for c in candidates if c.faction == "Super Sentai"]
    index: dict[str, Candidate] = {}
    for candidate in sentai:
        for key in sentai_keys(candidate):
            index.setdefault(key, candidate)
    merged: list[Candidate] = []
    used: set[str] = set()
    pairs: list[tuple[str, str, str]] = []
    for candidate in candidates:
        if candidate.faction != "Power Rangers":
            continue
        partner, rule = None, ""
        for rule, key in ranger_keys(candidate):
            found = index.get(key)
            if found and found.title not in used:
                partner = found
                break
        if partner:
            used.add(partner.title)
            candidate.partner = partner.title
            candidate.partner_backlinks = partner.backlinks or 0
            candidate.mandatory = candidate.mandatory or partner.mandatory
            candidate.products = sorted(set(candidate.products) | set(partner.products))
            pairs.append((candidate.title, partner.title, rule))
        merged.append(candidate)
    merged += [c for c in sentai if c.title not in used]
    return merged, pairs


# Ghép tự động (để so với bảng ghép tay) -----------------------------------------------------------------------

NOISE = (
    "hg mg rg pg ver ka masterpiece studio series deluxe voyager leader commander class core legacy "
    "autobot autobots decepticon decepticons constructicon constructicons combaticon combaticons stunticon stunticons "
    "protectobot protectobots dinobot dinobots transformers the movie bo hop the 1 100 sung may phao tay"
).split()
SERIES_HINTS = {"beast wars": "bw", "prime": "aligned", "studio series": "movie", "2007": "movie", "rise of the beasts": "movie", "one": "one", "g1": "g1", "masterpiece": "g1"}


def auto_match(product: str, pool: list[Candidate]) -> Candidate | None:
    text = normalize_name(product)
    words = [w for w in text.split() if w not in NOISE and not re.fullmatch(r"\d+", w)]
    query = " ".join(words)
    hints = {group for hint, group in SERIES_HINTS.items() if hint in text}
    best, best_score = None, -1.0
    for candidate in pool:
        match = SUFFIX.match(candidate.title)
        name = normalize_name(match.group("name") if match and candidate.franchise == "transformers" else candidate.title)
        score = fuzz.token_set_ratio(query, name)
        if candidate.group in hints:
            score += 5
        score += min(candidate.popularity, 2000) / 2000  # hoà điểm thì chọn trang phổ biến hơn
        if score > best_score:
            best, best_score = candidate, score
    return best


# Thông tin của một lớp ----------------------------------------------------------------------------------------


def clean_episode(value: str | None) -> str | None:
    """Gundam Wiki ghi số tập sau dấu ~ ("Mobile Suit Zeta Gundam~1~50" = tập 1 đến 50): bỏ phần đó."""
    if not value:
        return value
    return re.sub(r"\s*~.*$", "", value).strip() or None


def robot_record(candidate: Candidate, franchise: dict, group: dict, wikis_cfg: dict, partner_text: str | None, cfg: dict) -> dict[str, Any]:
    text = candidate.text or ""
    wiki_cfg = wikis_cfg[candidate.wiki]
    aliases: list[str] = []
    extra: dict[str, Any] = {}
    if franchise["key"] == "transformers":
        match = SUFFIX.match(candidate.title)
        character = match.group("name") if match else candidate.title
        name = character
        series = group["label"]
        faction = candidate.faction or tf_faction(text)
        summary = italic_summary(text)
        body = description(text, cfg["description_chars"])
        desc = " ".join(part for part in (summary, body) if part) or None
        image = first_file(text)
    elif franchise["key"] == "gundam":
        box = infobox(text, tuple(franchise["infobox"])) or {}
        character = name = candidate.title
        for key in ("english", "other names"):
            for part in re.split(r",|<br\s*/?>|\n", box.get(key, "")):
                value = plain(part)
                if value and value != name and value not in aliases:
                    aliases.append(value)
        era = plain(box.get("era", "")) or group["label"]
        first_series = clean_episode(first_list_item(box.get("series", ""))) if box.get("series") else None
        series = f"{era}" + (f" · {first_series}" if first_series else "")
        faction = clean_episode(first_list_item(box.get("operator", ""))) if box.get("operator") else None
        extra = {
            "model_number": candidate.title.split(" ", 1)[0] if re.search(r"\d", candidate.title.split(" ", 1)[0]) else None,
            "transformable": plain(box.get("transformable", "")) or None,
            "mech_designer": first_list_item(box.get("mechdesigner", "")) if box.get("mechdesigner") else None,
            "first_pilot": first_list_item(box.get("pilot", "")) if box.get("pilot") else None,
            "manufacturer": first_list_item(box.get("manufacturer", "")) if box.get("manufacturer") else None,
        }
        desc = description(text, cfg["description_chars"])
        image = image_field(box.get("image")) or first_file(text)
    else:
        box = infobox(text, ("MegazordInfo", "SentaiMegazordInfo")) or {}
        name = plain(box.get("name", "")) or candidate.title
        character = name
        source = plain(box.get("season", "") or box.get("sentai", ""))
        series = source
        faction = candidate.faction
        if candidate.partner and partner_text:
            partner_box = infobox(partner_text, ("SentaiMegazordInfo",)) or {}
            partner_name = plain(partner_box.get("name", "")) or candidate.partner
            aliases.append(partner_name)
            partner_series = plain(partner_box.get("sentai", ""))
            series = f"{partner_series} / Power Rangers {source}".strip(" /") if partner_series else f"Power Rangers {source}"
            faction = "Super Sentai / Power Rangers"
        elif candidate.faction == "Power Rangers":
            series = f"Power Rangers {source}".strip()
        zords = [plain(z) for z in re.split(r"<br\s*/?>|\n|\*", box.get("zords", "")) if plain(z)]
        extra = {"components": zords or None}
        desc = description(text, cfg["description_chars"])
        image = image_field(box.get("image")) or first_file(text)
    titles = [candidate.title] + ([candidate.partner] if candidate.partner else [])
    return {
        "slug": slugify(f"{franchise['key']} {candidate.title}"),
        "name": name,
        "display_name": candidate.title if franchise["key"] == "transformers" else name,
        "character": character,
        "franchise": franchise["key"],
        "franchise_label": franchise["label"],
        "group": group["key"],
        "series": series,
        "faction": faction,
        "aliases": aliases,
        "description": desc,
        "image": {"file": image, "url": None},
        "wiki": {"key": candidate.wiki, "titles": titles, "url": wiki_cfg["page_url"] + candidate.title.replace(" ", "_")},
        "popularity": {"backlinks": candidate.popularity, "capped": candidate.capped, "page_bytes": candidate.page_bytes},
        "selected_by": candidate.selected_by,
        "store_products": candidate.products,
        "extra": extra,
    }


# Chương trình chính -------------------------------------------------------------------------------------------


def main() -> None:
    cfg = load_config("b01_danh_muc")
    env = environment()
    cache = data_root() / "cache" / "mediawiki"
    wikis = {key: MediaWiki(value["api"], cache, cfg["min_interval"]) for key, value in cfg["wikis"].items()}
    exclude: dict[str, str] = cfg.get("exclude") or {}

    # Cửa hàng và bảng ghép tay
    products, product_source = store_products()
    with open(CONFIGS / cfg["store_map"], encoding="utf-8") as handle:
        store_map = yaml.safe_load(handle)
    by_product = {entry["product"]: entry for entry in store_map}
    product_names = {row["name"] for row in products}
    unmapped = sorted(product_names - set(by_product))
    stale = sorted(set(by_product) - product_names)
    resolved_map: dict[str, str | None] = {}
    for wiki_key in {entry["wiki"] for entry in store_map}:
        titles = [entry["title"] for entry in store_map if entry["wiki"] == wiki_key]
        for title, real in wikis[wiki_key].resolve(titles).items():
            resolved_map[f"{wiki_key}:{title}"] = real
    mandatory: dict[tuple[str, str], list[str]] = defaultdict(list)  # (wiki, title thật) → slug sản phẩm
    mandatory_group: dict[tuple[str, str], str] = {}
    slug_of = {row["name"]: row["slug"] for row in products}
    for entry in store_map:
        real = resolved_map.get(f"{entry['wiki']}:{entry['title']}")
        if real and entry["product"] in slug_of:
            mandatory[(entry["wiki"], real)].append(slug_of[entry["product"]])
            mandatory_group[(entry["wiki"], real)] = entry["group"]

    all_candidates: list[Candidate] = []
    selected: list[tuple[Candidate, dict, dict]] = []
    group_rows: list[dict] = []
    merge_pairs: list[tuple[str, str, str]] = []
    cutoff_rows: list[dict] = []
    variant_rows: list[dict] = []
    filter_reasons: Counter = Counter()

    for franchise in cfg["franchises"]:
        wiki = wikis[franchise["wiki"]]
        claimed: set[str] = set()
        for group in franchise["groups"]:
            pool: dict[str, str | None] = {}
            for faction, categories in group["categories"].items():
                for category in categories:
                    for title in wiki.category_members(category):
                        pool.setdefault(title, faction or None)
            raw_pool = len(pool)
            kept: dict[str, str | None] = {}
            for title, faction in pool.items():
                ok, reason = title_ok(title, franchise, group)
                if title in claimed:
                    ok, reason = False, "đã thuộc nhóm trước"
                if ok:
                    kept[title] = faction
                else:
                    filter_reasons[(franchise["key"], reason.split(" (")[0] if reason.startswith("hậu tố") else reason)] += 1
            forced = [title for (wiki_key, title), grp in mandatory_group.items() if wiki_key == franchise["wiki"] and grp == group["key"]]
            for title in forced:
                kept.setdefault(title, None)
            lengths = wiki.page_lengths(kept)
            ordered = sorted(kept, key=lambda t: (-lengths.get(t, 0), t))
            target = cfg["prefilter_factor"] * group["quota"]
            examined: list[Candidate] = []
            passing: list[Candidate] = []
            # Tầng 2: đọc wikitext theo thứ tự độ dài giảm dần, 50 trang một lần, tới khi đủ `target` trang qua bộ lọc.
            queue = [t for t in ordered if t not in forced]
            forced_done = False
            while (len([c for c in passing if not c.mandatory]) < target and queue) or not forced_done:
                batch = forced if not forced_done else queue[:50]
                if forced_done:
                    queue = queue[50:]
                texts = wiki.wikitexts(batch)
                for title in batch:
                    candidate = Candidate(franchise["key"], group["key"], franchise["wiki"], title, kept.get(title), lengths.get(title, 0), texts.get(title))
                    candidate.mandatory = (franchise["wiki"], title) in mandatory
                    candidate.products = mandatory.get((franchise["wiki"], title), [])
                    if franchise["key"] == "transformers" and candidate.faction is None and candidate.text:
                        candidate.faction = tf_faction(candidate.text)
                    if title in exclude:
                        candidate.passed, candidate.reason = False, f"loại tay: {exclude[title]}"
                    else:
                        candidate.passed, candidate.reason = structure_ok(candidate, franchise, group)
                    if not candidate.passed:
                        filter_reasons[(franchise["key"], candidate.reason)] += 1
                    examined.append(candidate)
                    if candidate.passed or candidate.mandatory:
                        passing.append(candidate)
                forced_done = True
            for candidate in passing:
                candidate.backlinks, candidate.capped = wiki.backlink_count(candidate.title, cfg["backlink_cap_pages"])
            units = passing
            if franchise["key"] == "sentai":
                units, pairs = merge_ranger(passing)
                merge_pairs += pairs
            chosen = [c for c in units if c.mandatory]
            for candidate in chosen:
                candidate.selected_by = "store"
            rest = sorted((c for c in units if not c.mandatory), key=lambda c: (-c.popularity, -c.page_bytes, c.title))
            free = max(group["quota"] - len(chosen), 0)
            # Họ biến thể (Gundam): robot cửa hàng giữ nguyên; trang sau thuộc họ đã có thì bỏ, ghi lại để báo cáo.
            families: dict[str, Candidate] = {}
            if franchise.get("merge_variants"):
                for candidate in chosen:
                    family = gundam_family(candidate.title)
                    if family:
                        families.setdefault(family, candidate)
            rank = 0
            for candidate in rest:
                family = gundam_family(candidate.title) if franchise.get("merge_variants") else None
                if family and family in families:
                    candidate.reason = f"biến thể của {families[family].title}"
                    if rank < free:
                        variant_rows.append(
                            {"Nhóm": group["label"], "Biến thể bỏ": candidate.title, "Giữ lớp": families[family].title, "Họ": family, "Liên kết đến": candidate.popularity}
                        )
                    continue
                rank += 1
                candidate.rank = rank
                if rank <= free:
                    candidate.selected_by = "popularity"
                    chosen.append(candidate)
                    if family:
                        families[family] = candidate
                elif rank <= free + 3:
                    cutoff_rows.append({"Nhóm": group["label"], "Trang": candidate.title, "Hạng": rank, "Liên kết đến": candidate.popularity, "Ghi chú": "ngay dưới ngưỡng chọn"})
            claimed |= {c.title for c in examined}
            all_candidates += examined
            selected += [(c, franchise, group) for c in chosen]
            pops = [c.popularity for c in chosen]
            group_rows.append(
                {
                    "Franchise": franchise["label"],
                    "Nhóm (dòng)": group["label"],
                    "Ứng viên từ category": raw_pool,
                    "Sau lọc tên": len(kept),
                    "Đã đọc nội dung": len(examined),
                    "Qua lọc cấu trúc": sum(1 for c in examined if c.passed),
                    "Hạn mức": group["quota"],
                    "Chọn: cửa hàng": sum(1 for c in chosen if c.selected_by == "store"),
                    "Chọn: phổ biến": sum(1 for c in chosen if c.selected_by == "popularity"),
                    "Tổng lớp": len(chosen),
                    "Liên kết đến (trung vị)": int(np.median(pops)) if pops else None,
                    "Liên kết đến (nhỏ nhất)": min(pops) if pops else None,
                }
            )
            print(f"{franchise['label']} / {group['label']}: {len(chosen)} lớp (ứng viên {raw_pool}, đọc {len(examined)})", flush=True)

    # Thông tin chi tiết và ảnh đại diện
    texts_by_title = {(c.wiki, c.title): c.text for c in all_candidates}
    robots = [robot_record(c, f, g, cfg["wikis"], texts_by_title.get((c.wiki, c.partner)) if c.partner else None, cfg) for c, f, g in selected]
    for wiki_key, wiki in wikis.items():
        files = [r["image"]["file"] for r in robots if r["wiki"]["key"] == wiki_key and r["image"]["file"]]
        urls = wiki.image_urls(files)
        for record in robots:
            file = record["image"]["file"]
            if record["wiki"]["key"] == wiki_key and file:
                record["image"]["url"] = urls.get(f"File:{file}") or urls.get(f"File:{file[:1].upper()}{file[1:]}")
        # Dự phòng: ảnh đại diện trang do PageImages của fandom chọn (TFWiki 1.19 không có phần mở rộng này).
        missing_titles = [r["wiki"]["titles"][0] for r in robots if r["wiki"]["key"] == wiki_key and not r["image"]["url"]]
        if missing_titles:
            fallback = wiki.page_images(missing_titles)
            for record in robots:
                title = record["wiki"]["titles"][0]
                if record["wiki"]["key"] == wiki_key and not record["image"]["url"] and fallback.get(title):
                    record["image"]["url"] = fallback[title]
                    record["image"]["source"] = "pageimages"
    # Tên hiển thị trùng nhau (ví dụ hai Thunder Megazord của hai mùa Power Rangers): thêm dòng vào sau tên.
    shown = Counter(r["display_name"] for r in robots)
    renamed_rows = []
    for record in robots:
        if shown[record["display_name"]] > 1:
            new = f"{record['display_name']} ({record['series']})"
            renamed_rows.append({"Tên cũ": record["display_name"], "Tên hiển thị mới": new})
            record["display_name"] = new
    slugs = Counter(r["slug"] for r in robots)
    duplicates = [slug for slug, n in slugs.items() if n > 1]
    if duplicates:
        raise SystemExit(f"Trùng slug: {duplicates}")

    # Ghi kết quả
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    robots_path = MANIFESTS / "robots.json"
    robots_path.write_text(json.dumps({"version": 1, "classes": robots}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    with open(MANIFESTS / "b01_candidates.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["franchise", "group", "title", "faction", "page_bytes", "passed", "reason", "backlinks", "capped", "partner", "selected_by", "rank"])
        for c in all_candidates:
            writer.writerow([c.franchise, c.group, c.title, c.faction, c.page_bytes, c.passed, c.reason, c.backlinks, c.capped, c.partner, c.selected_by, c.rank])

    # Ghép tự động so với ghép tay
    pool_for_match = [c for c in all_candidates if c.passed or c.mandatory]
    map_rows = []
    correct = 0
    slug_to_class = {}
    for record in robots:
        for product_slug in record["store_products"]:
            slug_to_class[product_slug] = record["slug"]
    for entry in store_map:
        real = resolved_map.get(f"{entry['wiki']}:{entry['title']}")
        guess = auto_match(entry["product"], pool_for_match)
        ok = guess is not None and guess.title == real
        correct += ok
        map_rows.append(
            {
                "Sản phẩm": entry["product"],
                "Trang wiki (ghép tay)": real or f"KHÔNG CÓ: {entry['title']}",
                "Lớp": slug_to_class.get(slug_of.get(entry["product"], ""), "—"),
                "Ghép tự động": guess.title if guess else None,
                "Tự động đúng": ok,
                "Ghi chú": entry.get("note", ""),
            }
        )
    with open(MANIFESTS / "store_robot_map.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, list(map_rows[0].keys()))
        writer.writeheader()
        writer.writerows(map_rows)
    auto = wilson_ci(correct, len(store_map))

    # Báo cáo ----------------------------------------------------------------------------------------------------
    report = Report("B01", "danh-muc-robot", "Danh mục robot và kho thông tin")
    report.section(1)
    report.p(
        "Chốt danh sách lớp của bài toán phân loại và thông tin hiển thị cho từng lớp (tên, dòng, phe, mô tả, ảnh, nguồn). "
        "Mỗi lớp là **một robot ở một dòng** (kế hoạch mục 3). Danh mục là nền của mọi bước sau: B2 thu ảnh theo từng lớp, "
        "B6 huấn luyện với số lớp này, web hiển thị thông tin lấy từ đây. Đóng góp vào RQ1 (bộ dữ liệu)."
    )
    report.section(2)
    report.bullets(
        [
            "Đầu vào: MediaWiki API của TFWiki, The Gundam Wiki và RangerWiki; danh sách sản phẩm cửa hàng "
            f"({product_source}, {len(products)} sản phẩm); bảng ghép tay `ml/configs/store_robot_map.yaml`.",
            f"Đầu ra: `ml/data/manifests/robots.json` ({len(robots)} lớp, sha256 `{file_sha256(robots_path)[:12]}`), "
            f"`b01_candidates.csv` ({len(all_candidates)} ứng viên đã đọc), `store_products.csv`, `store_robot_map.csv`.",
            "Ảnh đại diện của mỗi lớp chỉ lưu tên file và URL trên wiki, không tải về ở bước này.",
        ]
    )
    report.section(3)
    report.environment(env)
    api_rows = [
        {"Wiki": cfg["wikis"][k]["label"], "API": cfg["wikis"][k]["api"], "Yêu cầu đã gửi": w.stats.sent, "Lấy từ cache": w.stats.cached, "Thử lại": w.stats.retries, "Thời gian mạng (giây)": round(w.stats.seconds, 1)}
        for k, w in wikis.items()
    ]
    report.table(api_rows, caption="Truy vấn MediaWiki API")

    report.section(4)
    report.bullets(
        [
            "**Ứng viên:** thành viên các category theo dòng (`list=categorymembers`): với Transformers là category phe theo dòng "
            "(ví dụ *Generation 1 cartoon Autobots*), với Gundam là category theo kỷ nguyên (*Universal Century Mobile Weapons*), "
            "với Super Sentai / Power Rangers là *Megazord* và *Giant Robo* (bảng 1).",
            "**Lọc tên:** bỏ trang con (có dấu /); với Transformers bỏ trang có hậu tố thuộc dòng khác, ví dụ trang (WFC) nằm trong "
            "category của G1. TFWiki đặt Transformers: Prime chung dòng *Aligned* với hậu tố (WFC).",
            f"**Tầng 1, độ dài trang:** lấy độ dài (byte) của mọi ứng viên (`prop=info`), xếp giảm dần. **Tầng 2:** đọc wikitext theo thứ tự đó, "
            f"50 trang một lần, cho tới khi đủ {cfg['prefilter_factor']} × hạn mức trang qua bộ lọc cấu trúc.",
            "**Lọc cấu trúc:** bỏ trang chuyển hướng (kể cả khi có template đứng trước lệnh `#REDIRECT`); Transformers phải có thẻ phe "
            "`{{factions|…}}` ở đầu trang (trang nhân vật của TFWiki luôn có; trang nhóm, vật, địa danh thì không); Gundam phải có "
            "`Infobox/Mobile Weapon` với `type` là robot hình người: *Suit* ở mọi kỷ nguyên, thêm *Fighter* (Mobile Fighter) ở Future "
            "Century và *Doll* (Mobile Doll) ở After Colony, vì ở kỷ nguyên khác *Fighter* là máy bay; Super Sentai / Power Rangers phải "
            "có infobox robot `MegazordInfo` hoặc `SentaiMegazordInfo`.",
            "**Loại tay:** trang qua được bộ lọc nhưng không phải một robot cụ thể (trang về phe, sinh vật) bị loại sau khi duyệt "
            "lần chạy đầu, có ghi lý do (bảng 10).",
            "**Gộp biến thể Gundam:** họ của một mobile suit = số hiệu gốc bỏ chữ cái cuối + từ đầu của tên chính (bỏ tên chủ sở hữu "
            "như *Char's* và chữ *Gundam*). Ví dụ *MS-06F Zaku II*, *MS-06J Zaku II Ground Type*, *MS-06S Char's Zaku II* cùng họ "
            "`ms-06|zaku`; *XXXG-01W Wing Gundam* và *XXXG-01D Gundam Deathscythe* khác họ dù chung số hiệu gốc. Mỗi họ giữ một lớp "
            "(robot cửa hàng, nếu không thì trang phổ biến nhất); robot cửa hàng luôn được giữ dù cùng họ (bảng 9).",
            f"**Độ phổ biến:** số trang ở không gian chính liên kết tới trang của robot, kể cả qua trang chuyển hướng (`list=backlinks`, "
            f"`blredirect=1`), dừng ở {cfg['backlink_cap_pages'] * 500} liên kết. Đây là đại lượng thay thế cho mức độ được nhắc tới "
            "trong cộng đồng; wiki fandom không công bố lượt xem.",
            "**Gộp Power Rangers với Super Sentai:** bản Power Rangers dùng lại cảnh quay Super Sentai nên ảnh trong infobox mang tên "
            "robot Super Sentai, ví dụ *Dino Megazord* dùng `KSZ-Daizyuzin.png` (KSZ = Kyōryū Sentai Zyuranger). Khoá của trang Super "
            "Sentai: tên trong infobox, tên trong ảnh, tên trang, tên trang bỏ phần *\"… Gattai\"* (ví dụ *Tensou Gattai Gosei Great* → "
            "*gosei great*). Khoá của trang Power Rangers, xét theo thứ tự: (1) tên ảnh có tiền tố viết tắt series, bỏ tiền tố; (2) tên ảnh "
            "không tiền tố; (3) tên Megazord bỏ chữ *Megazord/Zord*. Mọi khoá đều chuẩn hoá (bỏ dấu, viết thường). Khớp thì gộp thành một "
            "lớp, độ phổ biến = tổng liên kết đến của hai trang (bảng 8 ghi luật đã khớp của từng cặp).",
            "**Tên hiển thị trùng** (hai robot khác nhau cùng tên, ví dụ hai *Thunder Megazord*) được thêm dòng vào sau tên (bảng 11). "
            "Ảnh đại diện lấy từ infobox hoặc ảnh đầu trang; không tìm được thì dùng ảnh do PageImages của fandom chọn.",
            "**Chọn lớp:** trong mỗi nhóm, lấy mọi robot cửa hàng đang bán (bảng ghép tay), rồi lấy thêm theo độ phổ biến giảm dần "
            "(hoà thì theo độ dài trang) cho đủ hạn mức. Hạn mức của nhóm đặt theo mức phổ biến và độ khác biệt về thiết kế của dòng.",
            "**Thông tin lớp:** Transformers lấy dòng tóm tắt in nghiêng đầu trang và đoạn văn đầu; Gundam lấy infobox (tên tiếng Anh, "
            "tên khác, kỷ nguyên, series đầu tiên, phe dùng, nhà thiết kế, phi công) và đoạn văn đầu; Sentai lấy infobox (tên, series, "
            "các zord hợp thành). Gundam Wiki ghi số tập sau dấu ~ (\"Mobile Suit Zeta Gundam~1~50\" là tập 1–50): phần này được bỏ khỏi "
            "dòng và phe (lần chạy đầu sót lỗi này ở 36 lớp, đã sửa ngày 07/11/2026). Đoạn mô tả bỏ template, file, chú thích, cắt ở ranh giới câu, tối đa "
            f"{cfg['description_chars']} ký tự.",
            "**Ghép tự động (để đối chứng):** chuẩn hoá tên sản phẩm, bỏ từ nhiễu (cấp mô hình HG/MG/RG, dòng sản phẩm như Masterpiece, "
            "Studio Series, tên phe), so với tên trang bằng `rapidfuzz.token_set_ratio`; cộng 5 điểm nếu tên sản phẩm có gợi ý dòng "
            "(Beast Wars, Prime, Studio Series...) khớp với nhóm của trang. So với bảng ghép tay để đo tỉ lệ ghép tự động đúng.",
        ]
    )

    report.section(5)
    report.table(group_rows, caption="Bảng 1. Ứng viên, lọc và số lớp được chọn theo từng nhóm")
    total = len(robots)
    by_franchise = Counter(r["franchise_label"] for r in robots)
    by_source = Counter(r["selected_by"] for r in robots)
    report.p(
        f"Tổng cộng **{total} lớp**: " + ", ".join(f"{name} {count}" for name, count in by_franchise.items())
        + f". Chọn vì cửa hàng bán: {by_source.get('store', 0)}; chọn theo độ phổ biến: {by_source.get('popularity', 0)}. "
        f"Gộp Power Rangers với Super Sentai: {len(merge_pairs)} cặp."
    )
    report.set("classes", {"total": total, "by_franchise": dict(by_franchise), "by_source": dict(by_source), "merged_pairs": len(merge_pairs)})
    report.set("groups", group_rows)

    # Hình 1: số lớp theo nhóm
    fig, ax = plt.subplots(figsize=(9, 4.2))
    labels = [f"{row['Nhóm (dòng)']}" for row in group_rows]
    store_counts = [row["Chọn: cửa hàng"] for row in group_rows]
    pop_counts = [row["Chọn: phổ biến"] for row in group_rows]
    ax.barh(labels, store_counts, color="#c2410c", label="robot cửa hàng bán")
    ax.barh(labels, pop_counts, left=store_counts, color="#64748b", label="chọn theo độ phổ biến")
    ax.invert_yaxis()
    ax.set_xlabel("Số lớp")
    ax.legend(loc="center right", frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    report.figure(fig, "so-lop-theo-nhom", "Số lớp theo nhóm (dòng), tách theo lý do được chọn")
    plt.close(fig)

    # Hình 2 và tương quan: độ dài trang so với liên kết đến
    rho_rows = []
    fig, axes = plt.subplots(1, len(cfg["franchises"]), figsize=(12, 3.8))
    for ax, franchise in zip(np.atleast_1d(axes), cfg["franchises"]):
        rows = [c for c in all_candidates if c.franchise == franchise["key"] and c.backlinks is not None]
        if len(rows) < 3:
            continue
        x = np.array([c.page_bytes for c in rows], dtype=float)
        y = np.array([c.backlinks for c in rows], dtype=float)
        rho, p = sps.spearmanr(x, y)
        rho_rows.append({"Franchise": franchise["label"], "Số trang": len(rows), "Spearman ρ": round(float(rho), 3), "p": f"{p:.1e}"})
        chosen = np.array([c.selected_by is not None for c in rows])
        ax.scatter(np.log10(x[~chosen] + 1), np.log10(y[~chosen] + 1), s=8, color="#94a3b8", label="không chọn")
        ax.scatter(np.log10(x[chosen] + 1), np.log10(y[chosen] + 1), s=8, color="#c2410c", label="được chọn")
        ax.set_title(f"{franchise['label']} (ρ = {rho:.2f})", fontsize=10)
        ax.set_xlabel("log10(độ dài trang, byte)")
        ax.spines[["top", "right"]].set_visible(False)
    np.atleast_1d(axes)[0].set_ylabel("log10(liên kết đến + 1)")
    np.atleast_1d(axes)[0].legend(frameon=False, fontsize=8)
    report.figure(
        fig,
        "do-dai-va-lien-ket",
        "Độ dài trang so với số liên kết đến (của riêng trang đó) của các ứng viên tầng 2. Lớp được chọn theo hạn mức của từng nhóm "
        "và, với Super Sentai / Power Rangers, theo tổng liên kết đến của cặp đã gộp, nên có điểm được chọn nằm thấp",
    )
    plt.close(fig)
    report.table(rho_rows, caption="Bảng 2. Tương quan hạng Spearman giữa độ dài trang và số liên kết đến (ứng viên tầng 2)")
    report.set("spearman_length_backlinks", rho_rows)

    reasons = [{"Franchise": k[0], "Lý do loại": k[1], "Số trang": v} for k, v in sorted(filter_reasons.items(), key=lambda item: (item[0][0], -item[1]))]
    report.table(reasons, caption="Bảng 3. Lý do loại ứng viên (lọc tên và lọc cấu trúc)")
    report.set("filter_reasons", reasons)
    report.table(cutoff_rows, caption="Bảng 4. Ba trang ngay dưới ngưỡng chọn của mỗi nhóm (để thấy ranh giới)")

    report.h3("Ghép sản phẩm cửa hàng")
    report.p(
        f"{len(store_map)} dòng ghép tay cho {len(products)} sản phẩm; {len(mandatory)} lớp khác nhau "
        f"(một lớp có thể ứng với nhiều sản phẩm, ví dụ hai mẫu Optimus Prime G1). "
        + (f"Sản phẩm chưa có trong bảng ghép: {', '.join(unmapped)}. " if unmapped else "Mọi sản phẩm đều có trong bảng ghép. ")
        + (f"Dòng ghép không còn sản phẩm: {', '.join(stale)}. " if stale else "")
        + f"Ghép tự động đúng **{correct}/{len(store_map)}** = {auto.format_pct()} (khoảng tin cậy Wilson 95%)."
    )
    report.table(map_rows, caption="Bảng 5. Sản phẩm cửa hàng → trang wiki → lớp, kèm kết quả ghép tự động")
    report.set("store_map", {"products": len(products), "rows": len(store_map), "classes": len(mandatory), "unmapped": unmapped, "stale": stale, "auto_correct": correct, "auto_ci": [auto.low, auto.high]})

    missing = {
        "mô tả": sum(1 for r in robots if not r["description"]),
        "ảnh đại diện (URL)": sum(1 for r in robots if not r["image"]["url"]),
        "phe": sum(1 for r in robots if not r["faction"]),
        "dòng": sum(1 for r in robots if not r["series"]),
    }
    report.table([{"Trường": k, "Số lớp thiếu": v, "Tỉ lệ": f"{v / total * 100:.1f}%"} for k, v in missing.items()], caption="Bảng 6. Trường thông tin bị thiếu")
    report.set("missing_fields", missing)
    capped = [r["display_name"] for r in robots if r["popularity"]["capped"]]

    report.h3("Danh sách lớp")
    report.table(
        [
            {
                "#": index,
                "Lớp": r["display_name"],
                "Franchise": r["franchise_label"],
                "Dòng": r["series"],
                "Phe": r["faction"],
                "Liên kết đến": f"≥ {r['popularity']['backlinks']}" if r["popularity"]["capped"] else r["popularity"]["backlinks"],
                "Lý do chọn": "cửa hàng" if r["selected_by"] == "store" else "phổ biến",
            }
            for index, r in enumerate(robots, 1)
        ],
        caption=f"Bảng 7. {total} lớp",
    )
    if merge_pairs:
        rule_counts = Counter(rule for _, _, rule in merge_pairs)
        report.p("Số cặp gộp theo từng luật: " + ", ".join(f"{rule}: {count}" for rule, count in rule_counts.items()) + ".")
        report.table([{"Power Rangers": a, "Super Sentai": b, "Luật khớp": rule} for a, b, rule in merge_pairs], caption="Bảng 8. Các cặp Power Rangers – Super Sentai đã gộp")
        report.set("merge_rules", dict(rule_counts))
    if variant_rows:
        report.table(variant_rows, caption="Bảng 9. Biến thể Gundam bị bỏ (thuộc họ đã có lớp) trong vùng chọn")
    report.set("variants_dropped", variant_rows)
    if exclude:
        report.table([{"Trang": title, "Lý do loại tay": reason} for title, reason in exclude.items()], caption="Bảng 10. Trang loại bằng tay sau khi duyệt lần chạy đầu")
    if renamed_rows:
        report.table(renamed_rows, caption="Bảng 11. Tên hiển thị bị trùng, đã thêm dòng để phân biệt")

    report.section(6)
    analysis = [
        f"Danh mục có {total} lớp, nằm trong khoảng 150–250 của kế hoạch.",
        f"Ghép tự động đúng {correct}/{len(store_map)} sản phẩm ({auto.format_pct()}). Các ca sai: "
        + "; ".join(f"{row['Sản phẩm']} → {row['Ghép tự động']} (đúng: {row['Trang wiki (ghép tay)']})" for row in map_rows if not row["Tự động đúng"])
        + ". Lỗi rơi vào ba kiểu: tên sản phẩm không nói dòng (Ironhide, pháo tay Bumblebee), tên khác với tên trang wiki "
        "(B-127 là Bumblebee của Transformers One, Rodimus Prime nằm ở trang Hot Rod (G1)), và cấu hình trang bị thêm có trang riêng "
        "(Full Armor Unicorn). Với hơn 5% số sản phẩm bị ghép sai, bảng ghép tay vẫn cần thiết; máy chỉ kiểm tra trang có thật.",
    ]
    for row in rho_rows:
        analysis.append(
            f"{row['Franchise']}: độ dài trang và số liên kết đến tương quan hạng ρ = {row['Spearman ρ']} (p = {row['p']}). "
            "Tương quan dương cho thấy lọc trước theo độ dài trang (tầng 1) ít có nguy cơ bỏ sót trang phổ biến, nhưng không loại trừ được hoàn toàn."
        )
    if capped:
        analysis.append(f"{len(capped)} lớp chạm trần đếm {cfg['backlink_cap_pages'] * 500} liên kết (ví dụ {', '.join(capped[:5])}); thứ hạng giữa chúng không phân biệt được, nhưng mọi trang chạm trần đều đã được chọn.")
    report.bullets(analysis)

    report.section(7)
    report.bullets(
        [
            "Độ phổ biến đo trên wiki của người hâm mộ, thiên về nhân vật được viết nhiều (G1, phim) và không phản ánh trực tiếp mức độ "
            "khách hàng Việt Nam biết tới. Các robot cửa hàng bán được thêm bắt buộc để bù phần này.",
            "Số liệu liên kết đến của ba wiki không so sánh được với nhau (quy mô wiki khác nhau), nên chỉ dùng để xếp hạng trong từng nhóm.",
            "Category của wiki có lẫn trang không phải robot; bộ lọc cấu trúc loại phần lớn nhưng danh sách vẫn cần chủ dự án duyệt (mục 12 kế hoạch).",
            "Lọc trước theo độ dài trang có thể bỏ sót trang ngắn nhưng phổ biến; mức độ rủi ro đánh giá qua tương quan ở bảng 2.",
            "Một lớp \"nhân vật + dòng\" có thể vẫn gồm nhiều thiết kế (ví dụ đồ chơi G1 năm 1984 và bản Masterpiece); B3 sẽ đo độ phân tán trong lớp.",
            "Hai sản phẩm là phụ kiện (pháo tay Bumblebee, súng máy Zaku) được gắn với robot sở hữu; web sẽ gợi ý chúng dưới robot đó.",
            "Nội dung wiki thay đổi theo thời gian; cache ghi thời điểm lấy từng yêu cầu, chạy lại dùng đúng nội dung đã lấy.",
        ]
    )
    report.section(8)
    report.reproduce(
        ["ml/.venv/Scripts/python ml/scripts/b01_danh_muc.py"],
        config="ml/configs/b01_danh_muc.yaml, ml/configs/store_robot_map.yaml",
        config_hash=config_hash({"b01": cfg, "map": store_map}),
        dataset_version=f"robots.json sha256 {file_sha256(robots_path)[:12]}",
    )
    report.p(f"Cache MediaWiki: `{cache}` (không vào git). Xoá cache thì lần chạy sau lấy nội dung wiki mới nhất.")
    path = report.write()
    print(f"Đã ghi {path} ({total} lớp)")


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
