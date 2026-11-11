"""B03a. Báo cáo phần làm sạch tự động của B3 (đọc kết quả của `b03_lam_sach.py --stage auto`).

Không tính lại đặc trưng: chỉ đọc `ROBOTREC_DATA/b03/scores.csv`, `pairs.csv`, `auto_summary.json` rồi lập bảng, vẽ hình và viết
báo cáo 8 mục. Phần còn lại của B3 (chủ dự án chấm tay, chọn ngưỡng, đo độ chính xác nhãn) viết ở báo cáo B03 sau khi có nhãn tay.

Chạy: ml/.venv/Scripts/python ml/scripts/b03a_bao_cao.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from PIL import Image  # noqa: E402

from robotrec.config import MANIFESTS, config_hash, data_root, file_sha256, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.report import Report  # noqa: E402

FRANCHISE = {"transformers": "Transformers", "gundam": "Gundam", "sentai": "Super Sentai / Power Rangers"}
SOURCE = {"wiki": "Wiki người hâm mộ", "ddg": "Tìm ảnh (ddgs: DuckDuckGo + Bing)"}
REASON_ORDER = [
    "ảnh nhỏ (cạnh ngắn < 128 px)", "tỉ lệ khung > 3", "trùng tuyệt đối giữa các lớp", "trùng tuyệt đối trong lớp",
    "không đọc được ảnh đã lưu", "gần trùng giữa các lớp", "gần trùng trong lớp",
]
REASON_NOTE = {
    "ảnh nhỏ (cạnh ngắn < 128 px)": "Ảnh gốc quá nhỏ (biểu tượng, ảnh thu nhỏ): không đủ chi tiết để nhận ra robot",
    "tỉ lệ khung > 3": "Ảnh quá dài hoặc quá dẹt (banner, dải logo)",
    "trùng tuyệt đối giữa các lớp": "Cùng một file nằm ở từ hai lớp trở lên: nhãn mâu thuẫn, loại cả nhóm (báo cáo B02b)",
    "trùng tuyệt đối trong lớp": "Cùng một file lặp lại trong một lớp: giữ một bản",
    "không đọc được ảnh đã lưu": "File ảnh trên đĩa hỏng",
    "gần trùng giữa các lớp": "Cụm ảnh gần giống nhau có ảnh của từ hai lớp trở lên: nhãn mâu thuẫn, loại cả cụm",
    "gần trùng trong lớp": "Cụm ảnh gần giống nhau trong một lớp: giữ ảnh có độ phân giải gốc lớn nhất",
}


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def pct(part: float, whole: float, digits: int = 1) -> str:
    return (vn(100 * part / whole, digits) + "%") if whole else "—"


def grid(image_root: Path, items: list[tuple[str, str]], columns: int, title: str, size: float = 1.9) -> plt.Figure:
    rows = max(1, -(-len(items) // columns))
    fig, axes = plt.subplots(rows, columns, figsize=(columns * size, rows * (size + 0.45)))
    axes = np.atleast_2d(axes)
    for ax in axes.ravel():
        ax.axis("off")
    for ax, (file, caption) in zip(axes.ravel(), items):
        try:
            with Image.open(image_root / file) as image:
                ax.imshow(image.convert("RGB"))
        except OSError:
            pass
        ax.set_title(caption, fontsize=6.5)
    fig.suptitle(title, fontsize=10)
    fig.tight_layout()
    return fig


def main() -> None:
    cfg = load_config("b03_lam_sach")
    root = data_root()
    out = root / "b03"
    image_root = root / "images" / "raw"
    env = environment()
    robots = json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]
    name_of = {r["slug"]: r["display_name"] for r in robots}
    s = pd.read_csv(out / "scores.csv", dtype={"reason": str, "cluster": str, "phash": str}, keep_default_na=False, na_values=[""])
    s["reason"] = s["reason"].fillna("")
    s["keep"] = s["status"] == "giữ"
    s["suspicious"] = s["suspicious"].astype(str).str.lower() == "true"
    s["outlier"] = s["outlier"].astype(str).str.lower() == "true"
    auto = json.loads((out / "auto_summary.json").read_text(encoding="utf-8"))
    # Lần chạy đủ đầu tiên theo luật gần trùng của kế hoạch (giữ lại để so sánh và lấy thời gian tính đặc trưng).
    old = json.loads((root / "b03_luat_cu" / "auto_summary.json").read_text(encoding="utf-8"))
    pairs = pd.read_csv(out / "pairs.csv")
    pairs["has_phash"] = pairs["phash"].notna()
    pairs["used"] = pairs["used"].astype(bool)
    class_of = dict(zip(s["key"], s["class"]))
    file_of = dict(zip(s["key"], s["file"]))
    pairs["same"] = pairs["a"].map(class_of) == pairs["b"].map(class_of)
    total = len(s)
    kept = s[s["keep"]]

    report = Report("B03a", "lam-sach-tu-dong", "Làm sạch tự động ảnh thô (phần máy của B3)")

    # 1 ---------------------------------------------------------------------------------------------------------------
    report.section(1)
    report.p(
        "Lọc bằng máy toàn bộ ảnh thô của B2 trước khi con người kiểm định: bỏ ảnh quá nhỏ hoặc méo, bỏ bản trùng và ảnh gần trùng, "
        "loại ảnh có nhãn mâu thuẫn; chấm cho mỗi ảnh còn lại một **điểm liên quan** (có phải ảnh robot không), một cờ **ngoại lai** "
        "(có khác hẳn các ảnh cùng lớp không) và một **miền ảnh** (đồ chơi, hoạt hình, CGI, tranh vẽ, hộp). Bước này **chưa** đo độ "
        "chính xác nhãn: con số đó chỉ có sau khi chủ dự án chấm tay hai mẫu do bước này sinh ra (báo cáo B03). Đóng góp vào RQ1."
    )
    # 2 ---------------------------------------------------------------------------------------------------------------
    report.section(2)
    manifest_gz = MANIFESTS / "b02_manifest.csv.gz"
    report.bullets(
        [
            f"Đầu vào: manifest ảnh thô của B2 ({total} dòng, {s['class'].nunique()} lớp; bản nén `ml/data/manifests/b02_manifest.csv.gz`), "
            f"ảnh tại `{image_root}` (không vào git), danh mục `robots.json`.",
            f"Đầu ra (ở `{out}`, không vào git vì gắn với ảnh): `scores.csv` mỗi dòng manifest một dòng (giữ hay loại, lý do, pHash, cụm, "
            "điểm liên quan, khoảng cách tới tâm lớp, cờ ngoại lai, miền ảnh, cờ nghi ngờ, tên máy chủ nguồn); `pairs.csv` mọi cặp ảnh gần trùng; "
            "`kiem-dinh-truoc-loc.html` (500 ảnh cho chủ dự án chấm) và `duyet-tay.html` (duyệt từng lớp).",
            "Bản tóm tắt vào git: báo cáo này, `ml/reports/B03a/summary.json`, hình `ml/reports/B03a/*.png`, "
            "`ml/data/manifests/b03a_scores.csv.gz` (bản nén của `scores.csv`).",
            "Không xoá file ảnh nào: \"loại\" chỉ là đánh dấu trong `scores.csv`.",
        ]
    )
    # 3 ---------------------------------------------------------------------------------------------------------------
    report.section(3)
    report.environment(env)
    report.p(
        f"Thời gian chạy phần tự động: {vn(old['seconds'] / 60)} phút cho lần đầu (pHash của {old['funnel'][2]['Còn lại']} ảnh trên CPU, đặc trưng "
        f"{auto['clip']} trên GPU ở fp16, tìm cặp gần trùng, sinh hai trang duyệt); chạy lại với luật gần trùng đã sửa mất {vn(auto['seconds'], 0)} giây "
        "vì đặc trưng đã lưu cache."
    )

    # 4 ---------------------------------------------------------------------------------------------------------------
    report.section(4)
    report.p("Phễu lọc chạy theo thứ tự dưới đây; ảnh bị loại ở bước trước không vào bước sau.")
    report.bullets(
        [
            f"**Bước 1, lọc kỹ thuật.** Loại ảnh có cạnh ngắn của ảnh *gốc* dưới {cfg['min_side']} px, hoặc tỉ lệ cạnh dài / cạnh ngắn trên "
            f"{cfg['max_aspect']:g}. Kích thước gốc đã ghi trong manifest lúc tải.",
            "**Bước 2, trùng tuyệt đối.** Hai file cùng mã sha1 là giống nhau từng byte. Cùng mã trong một lớp: giữ một bản. Cùng mã ở từ hai "
            "lớp trở lên: loại hết, vì không biết nhãn nào đúng (báo cáo B02b).",
            f"**Bước 3, gần trùng.** Hai ảnh được nối với nhau khi **cô-sin đặc trưng CLIP ≥ {vn(cfg['clip_near_duplicate'], 2)}**, hoặc khi "
            f"**pHash lệch không quá {cfg['phash_max_distance']} bit và cô-sin CLIP ≥ {vn(cfg['phash_min_cosine'], 2)}**. Các ảnh nối với nhau (trực tiếp hoặc "
            "qua ảnh trung gian) gom thành một cụm bằng cấu trúc union–find. Cụm chỉ gồm ảnh một lớp: giữ ảnh có số điểm ảnh gốc lớn nhất. "
            "Cụm có ảnh của từ hai lớp: loại cả cụm (nhãn mâu thuẫn).",
            "**Luật này khác kế hoạch, có chủ đích.** Kế hoạch ghi \"pHash lệch ≤ 6 bit *hoặc* cô-sin ≥ 0,95\". Lần chạy đủ đầu tiên theo luật đó "
            f"gom được một cụm {old['clusters']['largest']} ảnh của 134 lớp và loại {old['reasons'].get('gần trùng giữa các lớp', 0)} ảnh vì \"gần trùng giữa các lớp\". "
            "Mở ảnh ra xem (hình \"Cặp chỉ CLIP thấy\" bên dưới) thì ở mức cô-sin 0,95–0,97 phần lớn cặp là **hai robot khác nhau vẽ cùng phong cách** "
            "(tranh hồ sơ Gundam nền trắng, ảnh hộp cùng bố cục), không phải bản sao; ngược lại, cặp có pHash gần mà cô-sin dưới 0,90 là hai ảnh "
            "cùng bố cục nhưng khác nội dung (thẻ thông số, bìa hộp). Vì gom cụm theo liên kết đơn, vài cặp nối nhầm đủ để kéo hàng nghìn ảnh thành một cụm. "
            "Hai ngưỡng mới được chọn bằng cách xem mẫu cặp ở từng khoảng điểm (bảng 6, bảng 6b và các hình cặp ảnh), chưa phải hiệu chỉnh trên tập cặp có nhãn.",
            "**pHash (perceptual hash)**: thu ảnh về 32×32 mức xám, biến đổi cô-sin rời rạc (DCT), lấy 8×8 hệ số tần số thấp, mỗi hệ số thành 1 bit "
            "(lớn hơn trung vị hay không), được mã 64 bit. Hai ảnh trông giống nhau (đổi cỡ, nén lại, đổi sáng nhẹ) cho hai mã lệch nhau vài bit. "
            "Số bit lệch là **khoảng cách Hamming**: d(a, b) = popcount(a XOR b). Để không phải so mọi cặp, 64 bit được chia thành "
            f"{cfg['phash_max_distance'] + 1} khối: hai mã lệch ≤ {cfg['phash_max_distance']} bit thì chắc chắn có một khối trùng hẳn (nguyên lý chuồng bồ câu), "
            "nên chỉ cần so các ảnh chung khối.",
            f"**Đặc trưng CLIP**: mạng {auto['clip']} (open_clip) biến mỗi ảnh thành một vector 768 chiều, chuẩn hoá về độ dài 1. Độ giống của hai "
            "ảnh là **cô-sin** = tích vô hướng của hai vector, từ −1 tới 1. pHash bắt được bản sao bị đổi cỡ hay nén lại; CLIP bắt thêm bản bị cắt, "
            "thêm viền, thêm chữ, lật màu. Cô-sin của mọi cặp được tính theo khối trên GPU.",
            "**Bước 4, điểm liên quan.** CLIP so ảnh với hai nhóm câu mô tả bằng tiếng Anh: "
            f"nhóm dương ({len(cfg['relevance_prompts']['positive'])} câu, ví dụ *\"{cfg['relevance_prompts']['positive'][1]}\"*) và nhóm âm "
            f"({len(cfg['relevance_prompts']['negative'])} câu, ví dụ *\"{cfg['relevance_prompts']['negative'][3]}\"*). Xác suất của từng câu là "
            "softmax(100 · cô-sin(ảnh, câu)); **điểm liên quan p_robot = tổng xác suất các câu dương**. Điểm gần 1: ảnh giống ảnh robot; gần 0: "
            "giống người, chữ, logo, phong cảnh. Cách này gọi là phân loại *zero-shot*: không cần huấn luyện thêm.",
            f"**Bước 5, ngoại lai trong lớp.** Với mỗi lớp: tính tâm lớp là trung bình các vector, bỏ {int(cfg['outlier_trim'] * 100)}% ảnh xa tâm nhất rồi "
            "tính lại (trung bình cắt bỏ, để ảnh sai không kéo lệch tâm). Khoảng cách của ảnh tới tâm là d = 1 − cô-sin. Ảnh là ngoại lai khi "
            f"d > Q3 + {cfg['outlier_k']} · IQR (quy tắc Tukey; Q1, Q3 là tứ phân vị của d trong lớp, IQR = Q3 − Q1).",
            "**Bước 6, miền ảnh.** CLIP zero-shot giữa 5 câu mô tả, lấy câu có xác suất cao nhất: " + "; ".join(cfg["domains"].keys()) + ".",
            f"**Ảnh nghi ngờ** = còn giữ sau bước 1–3 và (p_robot < {cfg['relevance_default']} hoặc là ngoại lai). Ở bước này ảnh nghi ngờ **chưa bị loại**: "
            f"ngưỡng {cfg['relevance_default']} chỉ là tạm thời để xếp ảnh cho người duyệt; ngưỡng chính thức t_rel được chọn trên mẫu 500 ảnh có nhãn tay.",
            f"**Mẫu kiểm định trước lọc**: {auto['audit_pre']} ảnh lấy ngẫu nhiên (hạt giống {cfg['seed']}) từ ảnh còn lại sau bước 1–3, mỗi lớp ít nhất "
            f"{max(1, cfg['audit_pre_size'] // s['class'].nunique())} ảnh, phần còn lại lấy ngẫu nhiên trên toàn tập.",
        ]
    )
    report.h3("Giải thích bằng lời thường")
    report.bullets(
        [
            "**Phễu lọc** giống sàng gạo nhiều tầng: tầng đầu loại hạt quá nhỏ, tầng sau loại hạt trùng, tầng cuối đánh dấu hạt đáng ngờ để người xem lại.",
            "**pHash** như một bản phác thảo 64 nét của bức ảnh: hai ảnh chụp lại, đổi cỡ của cùng một hình có phác thảo gần như y hệt, dù file khác nhau từng byte.",
            "**Đặc trưng CLIP** như toạ độ của ảnh trên một tấm bản đồ ý nghĩa: ảnh cùng nội dung nằm gần nhau. Cô-sin 0,95 trở lên nghĩa là gần như cùng một ảnh.",
            "**Union–find** là cách gom nhóm bạn bè: A giống B, B giống C thì A, B, C chung một nhóm, dù A và C chưa chắc giống nhau trực tiếp.",
            "**Điểm liên quan** là câu trả lời của CLIP cho câu hỏi \"ảnh này giống ảnh robot hay giống thứ khác?\", đổi thành số từ 0 tới 1.",
            "**Ngoại lai** là ảnh đứng tách khỏi đám đông của lớp: nếu hầu hết ảnh của lớp Grimlock là khủng long máy màu xám vàng thì một ảnh ô tô đỏ sẽ nằm xa tâm.",
            "Vì sao không để máy loại luôn ảnh nghi ngờ: máy có thể sai (ảnh hộp, tranh vẽ, dạng xe của Transformers dễ bị chấm thấp). Luận văn cần "
            "**đo** máy đúng bao nhiêu trước khi tin, nên phải có mẫu do người chấm.",
        ]
    )

    # 5 ---------------------------------------------------------------------------------------------------------------
    report.section(5)
    funnel = auto["funnel"]
    rows, previous = [], None
    for step in funnel:
        count = step["Còn lại"]
        rows.append([step["Bước"], count, "—" if previous is None else previous - count, pct(count, total)])
        previous = count
    report.table(rows, ["Bước", "Còn lại", "Bị loại ở bước này", "Còn lại so với ảnh thô"], caption="Bảng 1. Phễu lọc")
    report.set("total", total)
    report.set("kept", len(kept))
    report.set("funnel", funnel)

    fig, ax = plt.subplots(figsize=(7, 2.8))
    ax.barh([r[0] for r in rows][::-1], [r[1] for r in rows][::-1], color="#c2410c")
    for i, r in enumerate(rows[::-1]):
        ax.text(r[1], i, f" {r[1]}", va="center", fontsize=8)
    ax.set_xlabel("Số ảnh còn lại")
    ax.set_xlim(0, total * 1.12)
    fig.tight_layout()
    report.figure(fig, "pheu-loc", "Số ảnh còn lại sau từng bước lọc")
    plt.close(fig)

    reasons = Counter(s.loc[~s["keep"], "reason"])
    report.table(
        [[r, reasons.get(r, 0), pct(reasons.get(r, 0), total), REASON_NOTE.get(r, "")] for r in REASON_ORDER if reasons.get(r)],
        ["Lý do loại", "Số ảnh", "Tỉ lệ trên ảnh thô", "Giải thích"], caption="Bảng 2. Lý do loại",
    )
    report.set("reasons", dict(reasons))

    def breakdown(column: str, labels: dict[str, str]) -> list[list]:
        out_rows = []
        for key, label in labels.items():
            part = s[s[column] == key]
            keep = part[part["keep"]]
            out_rows.append([
                label, len(part), len(keep), pct(len(keep), len(part)),
                pct(part["reason"].str.startswith("trùng tuyệt đối").sum(), len(part)),
                pct(part["reason"].str.startswith("gần trùng").sum(), len(part)),
                pct(keep["suspicious"].sum(), len(keep)),
                vn(keep["p_robot"].median(), 2),
            ])
        return out_rows

    columns = ["Nhóm", "Ảnh thô", "Còn lại", "Tỉ lệ còn lại", "Loại vì trùng tuyệt đối", "Loại vì gần trùng", "Nghi ngờ (trong ảnh còn lại)", "Trung vị điểm liên quan"]
    by_source = breakdown("source", SOURCE)
    by_franchise = breakdown("franchise", FRANCHISE)
    report.table(by_source, columns, caption="Bảng 3. Theo nguồn ảnh")
    report.table(by_franchise, columns, caption="Bảng 4. Theo franchise")

    # Cụm gần trùng
    clusters = s[s["cluster"].notna() & (s["cluster"] != "")].groupby("cluster")
    size = clusters.size()
    n_class = clusters["class"].nunique()
    bins = [("2 ảnh", 2, 2), ("3–5 ảnh", 3, 5), ("6–10 ảnh", 6, 10), ("11–50 ảnh", 11, 50), ("trên 50 ảnh", 51, 10**9)]
    report.table(
        [[label, int(((size >= lo) & (size <= hi)).sum()), int(size[(size >= lo) & (size <= hi)].sum()),
          int(((size >= lo) & (size <= hi) & (n_class > 1)).sum())] for label, lo, hi in bins]
        + [["Tổng", len(size), int(size.sum()), int((n_class > 1).sum())]],
        ["Cỡ cụm", "Số cụm", "Số ảnh trong các cụm", "Trong đó cụm có ảnh của ≥ 2 lớp"], caption="Bảng 5. Cụm ảnh gần trùng",
    )
    def band(mask: pd.Series, label: str, used: str) -> list:
        part = pairs[mask]
        return [label, len(part), int(part["same"].sum()), int((~part["same"]).sum()), pct((~part["same"]).sum(), len(part)), used]

    c, hp = pairs["cos"], pairs["has_phash"]
    band_rows = [
        band(hp & (c >= 0.95), "pHash lệch ≤ 6 bit, cô-sin ≥ 0,95", "có"),
        band(hp & (c >= cfg["phash_min_cosine"]) & (c < 0.95), "pHash lệch ≤ 6 bit, cô-sin 0,90–0,95", "có"),
        band(hp & (c >= 0.80) & (c < cfg["phash_min_cosine"]), "pHash lệch ≤ 6 bit, cô-sin 0,80–0,90", "không"),
        band(hp & (c < 0.80), "pHash lệch ≤ 6 bit, cô-sin dưới 0,80", "không"),
        band(~hp & (c >= 0.99), "Chỉ CLIP, cô-sin ≥ 0,99", "có"),
        band(~hp & (c >= cfg["clip_near_duplicate"]) & (c < 0.99), "Chỉ CLIP, cô-sin 0,98–0,99", "có"),
        band(~hp & (c >= 0.97) & (c < cfg["clip_near_duplicate"]), "Chỉ CLIP, cô-sin 0,97–0,98", "không"),
        band(~hp & (c >= 0.96) & (c < 0.97), "Chỉ CLIP, cô-sin 0,96–0,97", "không"),
        band(~hp & (c >= 0.95) & (c < 0.96), "Chỉ CLIP, cô-sin 0,95–0,96", "không"),
    ]
    band_columns = ["Nhóm cặp ảnh", "Số cặp", "Cùng lớp", "Khác lớp", "Tỉ lệ khác lớp", "Coi là gần trùng"]
    report.table(band_rows, band_columns, caption="Bảng 6. Cặp ảnh ứng viên theo khoảng điểm (tỉ lệ khác lớp cao là dấu hiệu nối nhầm)")
    compare_rows = [
        ["Số cặp được coi là gần trùng", old["phash_pairs"] + old["clip_pairs"], int(pairs["used"].sum())],
        ["Số cụm", old["clusters"]["n"], auto["clusters"]["n"]],
        ["Cụm lớn nhất (ảnh)", old["clusters"]["largest"], auto["clusters"]["largest"]],
        ["Cụm có ảnh của ≥ 2 lớp", old["clusters"]["multi_class"], auto["clusters"]["multi_class"]],
        ["Ảnh loại vì gần trùng giữa các lớp", old["reasons"].get("gần trùng giữa các lớp", 0), reasons.get("gần trùng giữa các lớp", 0)],
        ["Ảnh loại vì gần trùng trong lớp", old["reasons"].get("gần trùng trong lớp", 0), reasons.get("gần trùng trong lớp", 0)],
        ["Ảnh còn lại sau bước 3", old["funnel"][3]["Còn lại"], auto["funnel"][3]["Còn lại"]],
    ]
    compare_columns = ["Chỉ số", "Luật của kế hoạch (pHash ≤ 6 hoặc cô-sin ≥ 0,95)", "Luật đã sửa (báo cáo này)"]
    report.table(compare_rows, compare_columns, caption="Bảng 6b. Hai luật gần trùng trên cùng dữ liệu")
    report.p("Số cặp ở cột luật của kế hoạch đếm riêng cặp pHash và cặp CLIP nên một cặp thoả cả hai được tính hai lần.")

    def pair_sheet(groups: list[tuple[str, pd.DataFrame]], title: str, per_row: int = 4) -> plt.Figure:
        fig, axes = plt.subplots(len(groups), per_row * 2, figsize=(per_row * 4.1, len(groups) * 2.45))
        axes = np.atleast_2d(axes)
        for ax in axes.ravel():
            ax.axis("off")
        for i, (label, part) in enumerate(groups):
            chosen = part.sample(min(per_row, len(part)), random_state=cfg["seed"]) if len(part) else part
            for j, (_, r) in enumerate(chosen.iterrows()):
                for k, key in enumerate((r["a"], r["b"])):
                    ax = axes[i][2 * j + k]
                    try:
                        with Image.open(image_root / file_of[key]) as image:
                            ax.imshow(image.convert("RGB"))
                    except OSError:
                        pass
                    ax.set_title(f"{name_of[class_of[key]][:24]}\ncô-sin {vn(r['cos'], 3)}", fontsize=6.5)
            axes[i][0].text(-0.08, 0.5, label, transform=axes[i][0].transAxes, ha="right", va="center", fontsize=8)
        fig.suptitle(title, fontsize=10)
        fig.tight_layout()
        return fig

    cos_bands = ((0.95, 0.96), (0.96, 0.97), (0.97, 0.98), (0.98, 1.01))
    cross = pairs[~pairs["has_phash"] & ~pairs["same"]]
    fig = pair_sheet(
        [(f"{vn(lo, 2)}–{vn(min(hi, 1), 2)}\n{int(((cross['cos'] >= lo) & (cross['cos'] < hi)).sum())} cặp", cross[(cross["cos"] >= lo) & (cross["cos"] < hi)])
         for lo, hi in cos_bands],
        "Cặp chỉ CLIP thấy, hai ảnh thuộc hai lớp khác nhau (mỗi hàng một khoảng cô-sin; hai ảnh cạnh nhau là một cặp)",
    )
    report.figure(fig, "cap-clip-khac-lop", "Cặp chỉ CLIP thấy, khác lớp: dưới 0,97 hầu hết là hai robot khác nhau cùng phong cách vẽ; từ 0,98 phần lớn là cùng một ảnh, nhưng vẫn còn cặp robot khác nhau dùng chung khung vẽ (ví dụ Nemo và GM II)")
    plt.close(fig)
    within = pairs[~pairs["has_phash"] & pairs["same"]]
    fig = pair_sheet(
        [(f"{vn(lo, 2)}–{vn(min(hi, 1), 2)}\n{int(((within['cos'] >= lo) & (within['cos'] < hi)).sum())} cặp", within[(within["cos"] >= lo) & (within["cos"] < hi)])
         for lo, hi in cos_bands],
        "Cặp chỉ CLIP thấy, hai ảnh cùng một lớp",
    )
    report.figure(fig, "cap-clip-cung-lop", "Cặp chỉ CLIP thấy, cùng lớp: dưới 0,97 thường là hai ảnh chụp khác nhau của cùng một mô hình (đều có ích cho huấn luyện)")
    plt.close(fig)
    with_hash = pairs[pairs["has_phash"]]
    fig = pair_sheet(
        [(f"cô-sin {label}\n{int(mask.sum())} cặp", with_hash[mask]) for label, mask in (
            ("dưới 0,80", with_hash["cos"] < 0.80), ("0,80–0,90", (with_hash["cos"] >= 0.80) & (with_hash["cos"] < 0.90)),
            ("0,90–0,95", (with_hash["cos"] >= 0.90) & (with_hash["cos"] < 0.95)), ("từ 0,95", with_hash["cos"] >= 0.95))],
        "Cặp có pHash lệch ≤ 6 bit, xếp theo cô-sin CLIP",
    )
    report.figure(fig, "cap-phash", "Cặp pHash gần nhau: cô-sin thấp là hai ảnh cùng bố cục nhưng khác nội dung; cô-sin cao là bản sao thật")
    plt.close(fig)
    kinds = {
        "phash_va_clip": int((pairs["used"] & hp).sum()),
        "chi_clip": int((pairs["used"] & ~hp).sum()),
        "khong_dung": int((~pairs["used"]).sum()),
    }
    report.set("clusters", {"n": int(len(size)), "images": int(size.sum()), "largest": int(size.max()) if len(size) else 0,
                            "multi_class": int((n_class > 1).sum()), "largest_multi_class": int(size[n_class > 1].max()) if (n_class > 1).any() else 0})
    report.set("pairs", dict(kinds))

    # Mỗi lớp
    per = s.groupby("class").agg(tho=("keep", "size"), con=("keep", "sum")).reindex([r["slug"] for r in robots]).fillna(0).astype(int)
    per["nghi"] = kept[kept["suspicious"]].groupby("class").size().reindex(per.index).fillna(0).astype(int)
    per["chac"] = per["con"] - per["nghi"]
    values = per["con"]
    stats_rows = [
        ["Ảnh còn lại (mọi lớp)", int(values.sum())],
        ["Mỗi lớp: nhỏ nhất", int(values.min())],
        ["Mỗi lớp: trung vị", vn(values.median())],
        ["Mỗi lớp: trung bình ± độ lệch chuẩn", f"{vn(values.mean())} ± {vn(values.std(ddof=1))}"],
        ["Mỗi lớp: lớn nhất", int(values.max())],
        ["Tỉ lệ mất cân bằng (lớn nhất / nhỏ nhất)", vn(values.max() / max(values.min(), 1), 2)],
        ["Số lớp dưới 100 ảnh (ngưỡng tối thiểu của kế hoạch)", int((values < 100).sum())],
        ["Số lớp dưới 150 ảnh (mục tiêu của kế hoạch)", int((values < 150).sum())],
        ["Số lớp dưới 100 ảnh nếu bỏ hết ảnh nghi ngờ", int((per["chac"] < 100).sum())],
        ["Số lớp dưới 150 ảnh nếu bỏ hết ảnh nghi ngờ", int((per["chac"] < 150).sum())],
    ]
    report.table(stats_rows, ["Chỉ số", "Giá trị"], caption="Bảng 7. Số ảnh mỗi lớp sau lọc tự động (trước khi người duyệt)")
    report.set("per_class", {"min": int(values.min()), "median": float(values.median()), "mean": float(values.mean()), "std": float(values.std(ddof=1)),
                             "max": int(values.max()), "below_100": int((values < 100).sum()), "below_150": int((values < 150).sum()),
                             "below_100_without_suspicious": int((per["chac"] < 100).sum()), "below_150_without_suspicious": int((per["chac"] < 150).sum())})

    fig, ax = plt.subplots(figsize=(7.5, 3))
    upper = max(per["tho"].max(), 1)
    edges = np.arange(0, upper + 26, 25)
    ax.hist(per["tho"], bins=edges, alpha=0.45, label="Ảnh thô (B2)", color="#64748b")
    ax.hist(per["con"], bins=edges, alpha=0.75, label="Sau lọc tự động", color="#c2410c")
    ax.axvline(100, color="#b91c1c", linestyle="--", linewidth=1)
    ax.axvline(150, color="#15803d", linestyle="--", linewidth=1)
    ax.set_xlabel("Số ảnh của lớp (đường đỏ: tối thiểu 100; đường xanh: mục tiêu 150)")
    ax.set_ylabel("Số lớp")
    ax.legend()
    fig.tight_layout()
    report.figure(fig, "anh-moi-lop", "Phân bố số ảnh mỗi lớp trước và sau lọc tự động")
    plt.close(fig)

    low = per[per["con"] < 150].sort_values("con")
    if len(low):
        report.table(
            [[name_of[slug], FRANCHISE[slug.split("-")[0]], int(r["tho"]), int(r["con"]), int(r["nghi"]), pct(r["tho"] - r["con"], r["tho"])] for slug, r in low.iterrows()],
            ["Lớp", "Franchise", "Ảnh thô", "Còn lại", "Trong đó nghi ngờ", "Tỉ lệ bị loại"], caption="Bảng 8. Các lớp dưới 150 ảnh sau lọc tự động",
        )

    # Điểm liên quan, ngoại lai
    rel = kept["p_robot"]
    report.table(
        [
            ["Ảnh còn lại sau bước 1–3", len(kept), "100%"],
            [f"Điểm liên quan dưới {vn(cfg['relevance_default'])}", int((rel < cfg["relevance_default"]).sum()), pct((rel < cfg["relevance_default"]).sum(), len(kept))],
            ["Ngoại lai trong lớp (Tukey)", int(kept["outlier"].sum()), pct(kept["outlier"].sum(), len(kept))],
            ["Vừa điểm thấp vừa ngoại lai", int(((rel < cfg["relevance_default"]) & kept["outlier"]).sum()), pct(((rel < cfg["relevance_default"]) & kept["outlier"]).sum(), len(kept))],
            ["Nghi ngờ (ít nhất một trong hai)", int(kept["suspicious"].sum()), pct(kept["suspicious"].sum(), len(kept))],
        ],
        ["Nhóm", "Số ảnh", "Tỉ lệ"], caption="Bảng 9. Ảnh nghi ngờ (chưa loại, chờ người duyệt)",
    )
    report.set("suspicious", int(kept["suspicious"].sum()))
    report.set("outliers", int(kept["outlier"].sum()))
    report.set("low_relevance", int((rel < cfg["relevance_default"]).sum()))

    fig, axes = plt.subplots(1, 2, figsize=(8.5, 2.9))
    axes[0].hist(rel, bins=40, color="#c2410c")
    axes[0].axvline(cfg["relevance_default"], color="#0f172a", linestyle="--", linewidth=1)
    axes[0].set_xlabel("Điểm liên quan p_robot (đường đứt: ngưỡng tạm 0,5)")
    axes[0].set_ylabel("Số ảnh")
    axes[0].set_yscale("log")
    axes[1].hist(kept["outlier_d"].dropna(), bins=40, color="#64748b")
    axes[1].set_xlabel("Khoảng cách tới tâm lớp d = 1 − cô-sin")
    fig.tight_layout()
    report.figure(fig, "diem-lien-quan", "Phân bố điểm liên quan (trục dọc theo thang log) và khoảng cách tới tâm lớp")
    plt.close(fig)

    domains = Counter(kept["domain"])
    domain_rows = []
    for name in cfg["domains"]:
        part = kept[kept["domain"] == name]
        domain_rows.append([name, len(part), pct(len(part), len(kept)), pct((part["source"] == "wiki").sum(), len(part)), pct(part["suspicious"].sum(), len(part))])
    report.table(domain_rows, ["Miền ảnh (CLIP gán)", "Số ảnh", "Tỉ lệ", "Trong đó từ wiki", "Tỉ lệ nghi ngờ"], caption="Bảng 10. Miền ảnh của các ảnh còn lại (chưa kiểm định)")
    report.set("domains", dict(domains))

    hosts = kept[kept["source"] == "ddg"].groupby("host").agg(n=("keep", "size"), nghi=("suspicious", "mean"), rel=("p_robot", "median"))
    raw_hosts = s[s["source"] == "ddg"].groupby("host").size()
    top = hosts.sort_values("n", ascending=False).head(15)
    report.table(
        [[h, int(raw_hosts[h]), int(r["n"]), pct(r["n"], raw_hosts[h]), pct(r["nghi"], 1), vn(r["rel"], 2)] for h, r in top.iterrows()],
        ["Trang nguồn", "Ảnh thô", "Còn lại", "Tỉ lệ còn lại", "Tỉ lệ nghi ngờ", "Trung vị điểm liên quan"],
        caption="Bảng 11. 15 trang nguồn nhiều ảnh nhất (ảnh tìm kiếm)",
    )

    # Hình ví dụ
    rng = np.random.default_rng(cfg["seed"])
    lowest = kept.sort_values("p_robot").head(12)
    fig = grid(image_root, [(r["file"], f"{name_of[r['class']][:26]}\np_robot {vn(r['p_robot'], 2)}") for _, r in lowest.iterrows()], 6,
               "12 ảnh có điểm liên quan thấp nhất (nhãn phía trên là lớp được gán)")
    report.figure(fig, "diem-thap-nhat", "Ảnh có điểm liên quan thấp nhất: phần lớn không phải ảnh robot")
    plt.close(fig)
    outl = kept[kept["outlier"] & (kept["p_robot"] >= cfg["relevance_default"])].sort_values("outlier_d", ascending=False)
    pick = outl.groupby("class").head(1).head(12)
    fig = grid(image_root, [(r["file"], f"{name_of[r['class']][:26]}\ncách tâm {vn(r['outlier_d'], 2)}") for _, r in pick.iterrows()], 6,
               "Ảnh ngoại lai xa tâm lớp nhất của 12 lớp, trong số ảnh có điểm liên quan từ 0,5 trở lên")
    report.figure(fig, "ngoai-lai", "Ảnh ngoại lai có điểm liên quan cao: nhiều ảnh không phải robot (đồ chơi khác, can dầu, người) lọt qua điểm liên quan nhưng bị cờ ngoại lai bắt")
    plt.close(fig)
    big = size[(n_class == 1) & (size >= 4)]
    if len(big):
        chosen = rng.choice(big.index.to_numpy(), size=min(3, len(big)), replace=False)
        items = []
        for cid in chosen:
            members = s[s["cluster"] == cid].head(4)
            items += [(r["file"], f"{name_of[r['class']][:22]}\n{'GIỮ' if r['keep'] else 'loại'} · {r['width']}×{r['height']}") for _, r in members.iterrows()]
        fig = grid(image_root, items, 4, "Ba cụm gần trùng trong một lớp (mỗi hàng một cụm): giữ ảnh có độ phân giải gốc lớn nhất")
        report.figure(fig, "cum-gan-trung", "Ví dụ cụm ảnh gần trùng trong cùng một lớp")
        plt.close(fig)
    multi = size[n_class > 1].sort_values(ascending=False)
    if len(multi):
        items = []
        for cid in multi.index[:3]:
            members = s[s["cluster"] == cid].drop_duplicates("class").head(4)
            items += [(r["file"], f"{name_of[r['class']][:26]}\ncụm {int(size[cid])} ảnh, {int(n_class[cid])} lớp") for _, r in members.iterrows()]
            items += [("", "")] * (4 - len(members))
        fig = grid(image_root, items, 4, "Ba cụm gần trùng lớn nhất có ảnh của nhiều lớp (mỗi hàng một cụm, mỗi ảnh một lớp): loại cả cụm")
        report.figure(fig, "cum-nhieu-lop", "Ví dụ cụm ảnh gần trùng nằm ở nhiều lớp")
        plt.close(fig)

    table = [[name_of[slug], FRANCHISE[slug.split("-")[0]], int(r["tho"]), int(r["con"]), int(r["nghi"]), pct(r["tho"] - r["con"], r["tho"])] for slug, r in per.iterrows()]
    report.table(table, ["Lớp", "Franchise", "Ảnh thô", "Còn lại", "Trong đó nghi ngờ", "Tỉ lệ bị loại"], caption=f"Bảng 12. Số ảnh của {len(per)} lớp")

    summary_tables = {
        "Bảng 1. Phễu lọc": {"columns": ["Bước", "Còn lại", "Bị loại ở bước này", "Còn lại so với ảnh thô"], "rows": rows},
        "Bảng 2. Lý do loại": {"columns": ["Lý do loại", "Số ảnh", "Tỉ lệ trên ảnh thô"], "rows": [[r, reasons.get(r, 0), pct(reasons.get(r, 0), total)] for r in REASON_ORDER if reasons.get(r)]},
        "Bảng 3. Theo nguồn ảnh": {"columns": columns, "rows": by_source},
        "Bảng 4. Theo franchise": {"columns": columns, "rows": by_franchise},
        "Bảng 6. Cặp ảnh ứng viên theo khoảng điểm": {"columns": band_columns, "rows": band_rows},
        "Bảng 6b. Hai luật gần trùng trên cùng dữ liệu": {"columns": compare_columns, "rows": compare_rows},
        "Bảng 7. Số ảnh mỗi lớp sau lọc tự động": {"columns": ["Chỉ số", "Giá trị"], "rows": stats_rows},
        "Bảng 10. Miền ảnh": {"columns": ["Miền ảnh (CLIP gán)", "Số ảnh", "Tỉ lệ", "Trong đó từ wiki", "Tỉ lệ nghi ngờ"], "rows": domain_rows},
        "Bảng 12. Số ảnh từng lớp": {"columns": ["Lớp", "Franchise", "Ảnh thô", "Còn lại", "Trong đó nghi ngờ", "Tỉ lệ bị loại"], "rows": table},
    }
    report.set("tables", summary_tables)

    # 6 ---------------------------------------------------------------------------------------------------------------
    report.section(6)
    dup_exact = sum(v for k, v in reasons.items() if k.startswith("trùng tuyệt đối"))
    dup_near = sum(v for k, v in reasons.items() if k.startswith("gần trùng"))
    conflict = reasons.get("trùng tuyệt đối giữa các lớp", 0) + reasons.get("gần trùng giữa các lớp", 0)
    report.bullets(
        [
            f"Từ {total} ảnh thô còn {len(kept)} ảnh ({pct(len(kept), total)}). Trùng tuyệt đối làm mất {pct(dup_exact, total)}, gần trùng thêm "
            f"{pct(dup_near, total)}, lọc kỹ thuật {pct(reasons.get(REASON_ORDER[0], 0) + reasons.get(REASON_ORDER[1], 0), total)}.",
            f"Ảnh bị loại vì nhãn mâu thuẫn (cùng ảnh hoặc ảnh gần giống nằm ở nhiều lớp): {conflict} ảnh, {pct(conflict, total)} ảnh thô. Đây là cái giá "
            "của luật \"không tự phân xử\": mất cả những ảnh mà một trong các nhãn là đúng.",
            f"Trong {len(pairs)} cặp ứng viên, {int(pairs['used'].sum())} cặp được coi là gần trùng: {kinds['phash_va_clip']} cặp có cả pHash gần lẫn cô-sin cao, "
            f"{kinds['chi_clip']} cặp chỉ nhờ cô-sin ≥ {vn(cfg['clip_near_duplicate'], 2)}; {kinds['khong_dung']} cặp bị bỏ qua vì là robot khác nhau cùng phong cách hoặc "
            "cùng bố cục khác nội dung (bảng 6).",
            f"Đổi luật gần trùng giữ lại thêm {auto['funnel'][3]['Còn lại'] - old['funnel'][3]['Còn lại']} ảnh so với luật của kế hoạch, và cụm lớn nhất giảm từ "
            f"{old['clusters']['largest']} xuống {auto['clusters']['largest']} ảnh (bảng 6b). Tỉ lệ khác lớp ở bảng 6 là thước đo gián tiếp: bản sao thật hiếm khi "
            "mang hai nhãn, nên nhóm cặp nào có tỉ lệ khác lớp cao bất thường thì nhóm đó nhiều cặp nối nhầm.",
            f"Sau lọc tự động mỗi lớp còn {int(values.min())}–{int(values.max())} ảnh, trung vị {vn(values.median())}; "
            f"{int((values < 100).sum())} lớp dưới mức tối thiểu 100 và {int((values < 150).sum())} lớp dưới mục tiêu 150 (bảng 8).",
            f"{int(kept['suspicious'].sum())} ảnh ({pct(kept['suspicious'].sum(), len(kept))}) bị đánh dấu nghi ngờ. Đây là **cận trên** của số ảnh người duyệt "
            "cần xem kỹ, không phải số ảnh sai: độ đúng của cờ này được đo bằng mẫu 500 ảnh.",
            "Điểm liên quan và miền ảnh là kết quả của CLIP zero-shot, chưa được kiểm định; không dùng các cột này làm kết luận cho tới khi có nhãn tay.",
            "Hai cờ nghi ngờ bổ sung cho nhau: điểm liên quan bắt ảnh chữ, logo, trang truyện, giao diện web (hình \"điểm thấp nhất\"); cờ ngoại lai bắt "
            "thêm ảnh mà CLIP vẫn cho là \"đồ chơi\" nhưng chẳng liên quan tới lớp (can dầu nhớt, đồ chơi trẻ em khác, ảnh người; hình \"ngoại lai\"). "
            f"Chỉ {int(((rel < cfg['relevance_default']) & kept['outlier']).sum())} ảnh bị cả hai cờ cùng đánh dấu.",
            f"Sau khi sửa luật vẫn còn {reasons.get('gần trùng giữa các lớp', 0)} ảnh ({pct(reasons.get('gần trùng giữa các lớp', 0), total)}) bị loại vì gần trùng giữa các lớp. "
            "Một phần là bản sao thật mang hai nhãn (ảnh hộp Lfrith ở hai lớp Lfrith), một phần là các robot khác nhau dùng chung khung vẽ "
            "(hình \"cụm nhiều lớp\"). Mất mát này nhỏ và được chấp nhận.",
            "Lớp ít ảnh nhất sau lọc tự động là " + name_of[values.idxmin()] + f" ({int(values.min())} ảnh): dưới mức tối thiểu 100 trước cả khi người duyệt loại thêm. "
            "Lớp này cần thu thêm ảnh hoặc bỏ lớp; quyết định sau khi có kết quả duyệt tay.",
        ]
    )
    report.h3("Việc của chủ dự án sau bước này")
    report.bullets(
        [
            f"**Trang 1, kiểm định trước lọc** (`{out / 'kiem-dinh-truoc-loc.html'}`): {auto['audit_pre']} ảnh, mỗi ảnh chọn một trong ba đáp án "
            "(đúng robot này / robot khác / không phải robot), dùng phím 1, 2, 3. Ước tính 40–60 phút. Kết quả cho ra **độ chính xác nhãn của ảnh thô "
            "sau khi bỏ trùng** (kèm khoảng tin cậy Wilson 95%) và dùng để chọn ngưỡng t_rel, đo precision và recall của hai cờ nghi ngờ.",
            f"**Trang 2, duyệt tay từng lớp** (`{out / 'duyet-tay.html'}`): mỗi lớp hiện các ảnh nghi ngờ trước ({int(kept['suspicious'].sum())} ảnh trên toàn tập), "
            "bấm vào ảnh sai để loại. Ước tính 3–5 giờ, có thể làm nhiều buổi vì tiến độ tự lưu trong trình duyệt.",
            "Cả hai trang mở bằng trình duyệt trên máy này (ảnh nằm ở máy, không đưa lên Drive). Làm xong mỗi trang bấm **Tải kết quả (CSV)** và gửi file lại.",
            "Sau khi có hai file CSV: chốt ngưỡng, áp danh sách loại, lấy mẫu 1.000 ảnh cuối để đo độ chính xác nhãn của bộ dữ liệu sạch (tiêu chí ≥ 95%), viết báo cáo B03.",
        ]
    )
    # 7 ---------------------------------------------------------------------------------------------------------------
    report.section(7)
    report.bullets(
        [
            "Chưa có nhãn tay nên chưa có độ chính xác nhãn, chưa có precision và recall của bộ lọc; ngưỡng t_rel = 0,5 là tạm thời.",
            "Gom cụm theo liên kết đơn (A giống B, B giống C thì chung cụm) có thể nối dài thành cụm lớn; đây là nguyên nhân của cụm 2.701 ảnh ở lần chạy đầu. "
            "Với luật đã sửa cụm lớn nhất còn vài chục ảnh (bảng 5), nhưng rủi ro này vẫn cần theo dõi khi đổi dữ liệu.",
            "Hai ngưỡng cô-sin (0,98 và 0,90 khi có pHash gần) chọn bằng mắt trên mẫu cặp ở từng khoảng điểm, chưa hiệu chỉnh trên tập cặp có nhãn trùng / không trùng; "
            "ảnh gần trùng còn sót (cô-sin 0,95–0,98) sẽ được gom chung nhóm khi chia tập ở B4 để không rò rỉ giữa train và test.",
            "Các robot cùng khuôn chỉ khác màu (Starscream, Thundercracker, Skywarp) cho ảnh rất giống nhau; ảnh của chúng có thể bị coi là gần trùng giữa các lớp và bị loại.",
            "Tâm lớp giả định ảnh đúng chiếm đa số trong lớp. Lớp có nhiều ảnh sai (hai robot trùng tên) thì tâm bị lệch và cờ ngoại lai kém tin cậy.",
            "Robot có hai dạng (xe và robot) tạo hai cụm trong một lớp; ảnh dạng xe dễ bị coi là ngoại lai hoặc bị chấm điểm liên quan thấp.",
            "CLIP được huấn luyện trên ảnh và chữ tiếng Anh trên mạng nên có thiên lệch riêng; miền ảnh gán tự động sẽ được đo trên 200 ảnh có nhãn tay.",
            "Ảnh có bản quyền của chủ sở hữu; hình minh hoạ chỉ dùng trong báo cáo nghiên cứu, không phân phối lại.",
        ]
    )
    # 8 ---------------------------------------------------------------------------------------------------------------
    report.section(8)
    report.reproduce(
        ["ml/.venv/Scripts/python ml/scripts/b03_lam_sach.py --stage auto", "ml/.venv/Scripts/python ml/scripts/b03a_bao_cao.py"],
        config="ml/configs/b03_lam_sach.yaml", config_hash=config_hash(cfg), seed=cfg["seed"],
        dataset_version=f"b02_manifest.csv.gz sha256 {file_sha256(manifest_gz)[:12]}",
    )
    s.drop(columns=["keep"]).to_csv(MANIFESTS / "b03a_scores.csv.gz", index=False, compression="gzip")
    print(report.write())


if __name__ == "__main__":
    main()
