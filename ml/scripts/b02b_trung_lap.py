"""B02b. Trùng lặp và nhãn mâu thuẫn trong ảnh thô của B02.

Đọc manifest ảnh thô (`ml/data/manifests/b02_manifest.csv.gz`), đo:
- bản trùng hệt (cùng sha1 của byte gốc) trên toàn tập, trong cùng một lớp, theo nguồn và franchise;
- nhãn mâu thuẫn: cùng một ảnh nằm ở từ hai lớp trở lên; phân bố số lớp mỗi nhóm, các nhóm lan rộng nhất;
- hình minh hoạ các ví dụ điển hình (ảnh báo lỗi của máy chủ, logo wiki, ảnh nhóm, hai robot trong một ảnh, trùng tên).

Không tải gì thêm; chỉ đọc manifest và ảnh đã có. Ảnh trùng chưa bị xoá ở bước này (B3 làm sạch).

Chạy: ml/.venv/Scripts/python ml/scripts/b02b_trung_lap.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
from PIL import Image  # noqa: E402

from robotrec.config import MANIFESTS, data_root, file_sha256  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.report import Report  # noqa: E402

FRANCHISE = {"transformers": "Transformers", "gundam": "Gundam", "sentai": "Super Sentai / Power Rangers"}
SOURCE = {"wiki": "Wiki người hâm mộ", "ddg": "Tìm ảnh (ddgs: DuckDuckGo + Bing)"}

# Ví dụ minh hoạ, chọn tay sau khi xem dữ liệu (khớp theo đầu sha1 hoặc tên file ảnh trên wiki).
EXAMPLES = [
    ("file", "6871dfc6d90f37ce", "Ảnh báo lỗi của máy chủ\n(\"THIS IMAGE WAS NOT FOUND\")"),
    ("title", "File:Site-logo.png", "Logo của wiki"),
    ("title", "File:Tvicon.png", "Biểu tượng TV của wiki"),
    ("sha1", "0495af7bf17a", "Bộ Menasor: robot hợp thể\nvà thành viên Motormaster"),
    ("sha1", "3d59a3365d", "Ảnh nhóm nhân vật\nTransformers Animated"),
    ("sha1", "343b673eef", "Ảnh không liên quan (móc khoá\nEtsy) cho \"Defensor\", \"Hot Spot\""),
    ("sha1", "41b66412ac", "Trùng tên: hai robot\n\"Thunder Megazord\""),
]


def pct(part: int, whole: int) -> str:
    return f"{part / whole:.1%}".replace(".", ",") if whole else "—"


def host(url: str) -> str:
    return urlparse(str(url)).hostname or ""


def find_example(m: pd.DataFrame, kind: str, key: str) -> pd.DataFrame:
    if kind == "file":
        rows = m[m["file"].str.contains(key, regex=False)]
    elif kind == "title":
        rows = m[m["title"] == key]
    else:
        rows = m[m["sha1"].str.startswith(key)]
    return m[m["sha1"] == rows.iloc[0]["sha1"]] if len(rows) else rows


def main() -> None:
    env = environment()
    manifest_path = MANIFESTS / "b02_manifest.csv.gz"
    m = pd.read_csv(manifest_path)
    image_root = data_root() / "images" / "raw"
    total = len(m)
    unique = m["sha1"].nunique()
    extra = total - unique
    within = int(m.duplicated(["class", "sha1"]).sum())
    classes_per_sha = m.groupby("sha1")["class"].nunique()
    cross_sha = classes_per_sha[classes_per_sha > 1]
    cross_rows = m[m["sha1"].isin(cross_sha.index)]
    franchise_per_sha = m.groupby("sha1")["franchise"].nunique()

    report = Report("B02b", "trung-lap", "Trùng lặp và nhãn mâu thuẫn trong ảnh thô")
    report.section(1)
    report.p(
        "Đo mức trùng lặp của 74 nghìn ảnh thô thu ở B02 trước khi làm sạch (B3), và giải thích bằng ví dụ thật hai loại lỗi: "
        "**bản trùng hệt** (cùng một file được tải nhiều lần) và **nhãn mâu thuẫn** (cùng một ảnh mang tên nhiều robot khác nhau). "
        "Số liệu này cho biết dữ liệu web nhiễu đến đâu và vì sao phải làm sạch; đóng góp vào RQ1."
    )
    report.section(2)
    report.bullets(
        [
            f"Đầu vào: `ml/data/manifests/b02_manifest.csv.gz` ({total} dòng, mỗi dòng một ảnh: lớp, nguồn, truy vấn, URL, trang chứa ảnh, sha1, kích thước); ảnh gốc ở `{image_root}` (không vào git).",
            "Đầu ra: báo cáo này, `ml/reports/B02b/summary.json`, hình `ml/reports/B02b/*.png`. Không xoá hay sửa ảnh nào.",
        ]
    )
    report.section(3)
    report.environment(env)
    report.section(4)
    report.bullets(
        [
            "**Mã sha1:** mã băm 160 bit của toàn bộ byte file ảnh tải về, như \"dấu vân tay\" của file: hai file cùng mã khi và chỉ khi giống nhau đến từng byte "
            "(xác suất hai file khác nhau trùng mã là không đáng kể). Mã được tính lúc tải ở B02, trên byte gốc trước khi thu nhỏ.",
            "**Bản trùng hệt (bản thừa):** số ảnh trừ số mã sha1 khác nhau. Nếu một file xuất hiện 5 lần thì có 4 bản thừa.",
            "**Trùng trong cùng lớp:** cùng mã sha1 xuất hiện nhiều lần trong một lớp (nhãn vẫn nhất quán, chỉ thừa).",
            "**Nhãn mâu thuẫn:** một mã sha1 xuất hiện ở từ hai lớp trở lên; mỗi mã như vậy là một *nhóm*. Đếm cả số nhóm và số dòng ảnh thuộc các nhóm.",
            "Đây là phép đếm trên toàn bộ tập, không phải mẫu, nên không cần khoảng tin cậy.",
            "Không đo ảnh **gần trùng** (cùng ảnh nhưng đã cắt, đổi cỡ, nén lại): B3 đo bằng pHash. Vì vậy các tỉ lệ ở đây là **cận dưới** của mức trùng thật.",
            "Ví dụ minh hoạ được chọn tay sau khi xem các nhóm trùng lan rộng nhất và mở ảnh gốc.",
        ]
    )

    report.section(5)
    overall = [
        ("Tổng số ảnh tải về", total, "100%"),
        ("Ảnh khác nhau thật sự (số mã sha1)", unique, pct(unique, total)),
        ("Bản trùng hệt (bản thừa)", extra, pct(extra, total)),
        ("— trong đó: thừa ngay trong cùng một lớp", within, pct(within, total)),
        ("Nhóm ảnh nằm ở ≥ 2 lớp (nhãn mâu thuẫn)", len(cross_sha), "—"),
        ("Dòng ảnh thuộc các nhóm nhãn mâu thuẫn", len(cross_rows), pct(len(cross_rows), total)),
        ("Nhóm ảnh nằm ở hai franchise khác nhau", int((franchise_per_sha > 1).sum()), "—"),
    ]
    report.table(overall, ["Chỉ số", "Số", "Tỉ lệ trên tổng ảnh"], caption="Bảng 1. Trùng lặp trên toàn bộ ảnh thô")
    report.set("total", total)
    report.set("unique", unique)
    report.set("extra", extra)
    report.set("within_class_extra", within)
    report.set("conflict_groups", len(cross_sha))
    report.set("conflict_rows", len(cross_rows))

    by_source = []
    for source, label in SOURCE.items():
        part = m[m["source"] == source]
        conflict = part[part["sha1"].isin(cross_sha.index)]
        by_source.append((label, len(part), len(part) - part["sha1"].nunique(), pct(len(part) - part["sha1"].nunique(), len(part)), len(conflict), pct(len(conflict), len(part))))
    report.table(by_source, ["Nguồn", "Ảnh", "Bản thừa", "Tỉ lệ thừa", "Ảnh nhãn mâu thuẫn", "Tỉ lệ mâu thuẫn"], caption="Bảng 2. Theo nguồn")

    by_franchise = []
    for key, label in FRANCHISE.items():
        part = m[m["franchise"] == key]
        conflict = part[part["sha1"].isin(cross_sha.index)]
        by_franchise.append((label, len(part), len(part) - part["sha1"].nunique(), pct(len(part) - part["sha1"].nunique(), len(part)), len(conflict), pct(len(conflict), len(part))))
    report.table(by_franchise, ["Franchise", "Ảnh", "Bản thừa", "Tỉ lệ thừa", "Ảnh nhãn mâu thuẫn", "Tỉ lệ mâu thuẫn"], caption="Bảng 3. Theo franchise")

    spread = cross_sha.value_counts().sort_index()
    buckets = [("2 lớp", int(spread.get(2, 0))), ("3 lớp", int(spread.get(3, 0))), ("4–5 lớp", int(spread[(spread.index >= 4) & (spread.index <= 5)].sum())),
               ("6–10 lớp", int(spread[(spread.index >= 6) & (spread.index <= 10)].sum())), ("11–20 lớp", int(spread[(spread.index >= 11) & (spread.index <= 20)].sum())),
               ("trên 20 lớp", int(spread[spread.index > 20].sum()))]
    report.table(buckets, ["Một ảnh nằm ở", "Số nhóm"], caption="Bảng 4. Nhãn mâu thuẫn: một ảnh nằm ở bao nhiêu lớp")
    fig, ax = plt.subplots(figsize=(7, 3))
    ax.bar([b[0] for b in buckets], [b[1] for b in buckets], color="#1f4fd8")
    ax.set_ylabel("Số nhóm ảnh")
    ax.set_title("Một ảnh trùng nằm ở bao nhiêu lớp")
    for index, (_, value) in enumerate(buckets):
        ax.text(index, value, str(value), ha="center", va="bottom", fontsize=8)
    report.figure(fig, "so-lop-moi-nhom", "Số lớp chứa cùng một ảnh (chỉ tính ảnh nằm ở ≥ 2 lớp)")
    plt.close(fig)

    top = []
    for sha, count in cross_sha.sort_values(ascending=False).head(12).items():
        rows = m[m["sha1"] == sha]
        first = rows.iloc[0]
        top.append(
            (
                count,
                SOURCE[first["source"]].split(" (")[0],
                str(first["title"])[:60],
                f"{first['width']}×{first['height']}",
                host(first["page_url"] if pd.notna(first["page_url"]) else first["url"]),
            )
        )
    report.table(top, ["Số lớp", "Nguồn", "Tiêu đề ảnh hoặc trang", "Kích thước gốc", "Tên miền"], caption="Bảng 5. 12 ảnh nằm ở nhiều lớp nhất")

    # Hình minh hoạ.
    found = [(find_example(m, kind, key), caption) for kind, key, caption in EXAMPLES]
    found = [(rows, caption) for rows, caption in found if len(rows)]
    fig, axes = plt.subplots(1, len(found), figsize=(2.6 * len(found), 3.4))
    examples = []
    for ax, (rows, caption) in zip(axes, found):
        first = rows.iloc[0]
        ax.axis("off")
        with Image.open(image_root / first["file"]) as image:
            image.thumbnail((320, 320))
            ax.imshow(image)
        classes = rows["class"].nunique()
        ax.set_title(f"{caption}\n{len(rows)} lần, {classes} lớp", fontsize=8)
        examples.append((caption.replace("\n", " "), len(rows), classes, ", ".join(sorted(rows["class"].unique())[:4]) + (" …" if classes > 4 else "")))
    fig.subplots_adjust(wspace=0.15)
    report.figure(fig, "vi-du-trung-lap", "Ví dụ thật về bản trùng và nhãn mâu thuẫn (số dưới mỗi ảnh: số lần xuất hiện, số lớp chứa ảnh)")
    plt.close(fig)
    report.table(examples, ["Ví dụ", "Số lần xuất hiện", "Số lớp", "Một số lớp chứa ảnh"], caption="Bảng 6. Các ví dụ trong hình")
    # Các bảng cho export_excel.py (sheet "B02b Trùng lặp").
    report.set(
        "tables",
        {
            "Bảng 1. Trùng lặp trên toàn bộ ảnh thô": {"columns": ["Chỉ số", "Số", "Tỉ lệ trên tổng ảnh"], "rows": [list(r) for r in overall]},
            "Bảng 2. Theo nguồn": {
                "columns": ["Nguồn", "Ảnh", "Bản thừa", "Tỉ lệ thừa", "Ảnh nhãn mâu thuẫn", "Tỉ lệ mâu thuẫn"],
                "rows": [list(r) for r in by_source],
            },
            "Bảng 3. Theo franchise": {
                "columns": ["Franchise", "Ảnh", "Bản thừa", "Tỉ lệ thừa", "Ảnh nhãn mâu thuẫn", "Tỉ lệ mâu thuẫn"],
                "rows": [list(r) for r in by_franchise],
            },
            "Bảng 4. Một ảnh nằm ở bao nhiêu lớp": {"columns": ["Một ảnh nằm ở", "Số nhóm"], "rows": [list(r) for r in buckets]},
            "Bảng 5. 12 ảnh nằm ở nhiều lớp nhất": {"columns": ["Số lớp", "Nguồn", "Tiêu đề", "Kích thước gốc", "Tên miền"], "rows": [list(r) for r in top]},
            "Bảng 6. Các ví dụ trong hình": {"columns": ["Ví dụ", "Số lần xuất hiện", "Số lớp", "Một số lớp chứa ảnh"], "rows": [list(r) for r in examples]},
        },
    )

    report.h3("Giải thích bằng lời thường")
    report.bullets(
        [
            "**Trùng hệt** là bản photo: hai file giống nhau đến từng byte dù đường dẫn hay tên file khác nhau. Xảy ra khi cùng một ảnh được đăng lại ở nhiều trang, "
            "công cụ tìm kiếm trả cùng ảnh cho nhiều truy vấn, hoặc máy chủ trả một ảnh thay thế khi không cho tải trực tiếp. Ví dụ: ở lớp Hound (G1), năm đường dẫn "
            "khác tên file trên seibertron.com tải về đều ra đúng một ảnh báo lỗi \"THIS IMAGE WAS NOT FOUND\": một ảnh rác bị đếm năm lần và mang nhãn Hound.",
            "**Nhãn mâu thuẫn** giống bộ thẻ học từ vựng mà cùng một tấm hình, thẻ này ghi \"chó\", thẻ kia ghi \"mèo\". Nguyên nhân: rác của trang web (logo wiki nằm "
            "trên mọi trang), ảnh nhiều robot (banner bài viết, ảnh rao bán cả lô), hai robot thật sự cùng xuất hiện (ảnh bộ Menasor có cả robot hợp thể lẫn thành viên "
            "Motormaster), hai robot trùng tên (Thunder Megazord của Mighty Morphin và của Ninja Storm), hoặc ảnh chẳng liên quan mà công cụ tìm kiếm trả "
            "cho nhiều truy vấn (một móc khoá hình chiếc ủng rao bán trên Etsy được trả cho cả \"Defensor\" lẫn \"Hot Spot\").",
            "**Vì sao nguy hiểm:** (1) mô hình bị dạy hai đáp án trái ngược cho cùng một ảnh; (2) nếu một bản rơi vào tập huấn luyện, một bản vào tập kiểm tra, mô hình "
            "\"nhớ đáp án\" và độ chính xác đo được cao giả.",
        ]
    )

    report.section(6)
    report.bullets(
        [
            f"{pct(extra, total)} ảnh tải về là bản trùng hệt; chỉ {pct(within, total)} là thừa trong cùng lớp, phần lớn còn lại là ảnh nằm ở nhiều lớp.",
            f"{len(cross_sha)} ảnh có nhãn mâu thuẫn, chiếm {len(cross_rows)} dòng ({pct(len(cross_rows), total)}); đa số chỉ nằm ở 2 lớp "
            f"({buckets[0][1]} nhóm), nhưng có ảnh nằm ở tới {int(cross_sha.max())} lớp: đều là logo, biểu tượng hoặc banner, không phải ảnh robot.",
            "Các nhóm lan rộng nhất (bảng 5) là rác của trang web, nên loại cả nhóm vừa đúng vừa không làm mất ảnh robot có ích.",
            "Nhóm chỉ nằm ở 2 lớp thường là ảnh có thật hai robot hoặc hai robot trùng tên: không tự động biết nhãn nào đúng, nên B3 loại cả nhóm.",
            "Quyết định cho B3: giữ một bản cho trùng trong cùng lớp; loại toàn bộ nhóm nhãn mâu thuẫn; chia tập theo cụm gần trùng (pHash) để không lọt ảnh giống nhau giữa các tập.",
        ]
    )
    report.section(7)
    report.bullets(
        [
            "Chỉ đếm trùng hệt theo byte; ảnh gần trùng (đổi cỡ, cắt, nén lại) chưa được tính, nên mức trùng thật cao hơn (B3 đo bằng pHash).",
            "Loại cả nhóm nhãn mâu thuẫn có thể bỏ cả ảnh mà một nhãn trong nhóm là đúng (ví dụ ảnh bộ Menasor đúng cho lớp Menasor). Chấp nhận vì không có cách tự động phân xử; số ảnh mất được báo ở B3.",
            "Ảnh báo lỗi của máy chủ chỉ bị bắt ở đây khi trùng nhiều lần; các ảnh báo lỗi xuất hiện một lần sẽ được bộ lọc nội dung ở B3 xử lý.",
            "Ảnh có bản quyền của chủ sở hữu; hình minh hoạ chỉ dùng trong báo cáo nghiên cứu, không phân phối lại.",
        ]
    )
    report.section(8)
    report.reproduce(
        ["ml/.venv/Scripts/python ml/scripts/b02b_trung_lap.py"],
        dataset_version=f"b02_manifest.csv.gz sha256 {file_sha256(manifest_path)[:12]}",
    )
    print(report.write())


if __name__ == "__main__":
    main()
