"""Xuất kết quả các bước ra Excel để dễ xem: docs/nhan-dang-robot/bao-cao/ket-qua-cac-buoc.xlsx.

Đọc các file đã sinh (ml/data/manifests, ml/reports/Bxx/summary.json), không chạy lại bước nào. Sheet "Tổng quan" dùng công
thức đếm trên các sheet khác nên tự tính lại khi mở trong Excel.

Chạy: python ml/scripts/export_excel.py
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

from openpyxl import Workbook  # noqa: E402
from openpyxl.comments import Comment  # noqa: E402
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side  # noqa: E402
from openpyxl.utils import get_column_letter  # noqa: E402
from openpyxl.worksheet.worksheet import Worksheet  # noqa: E402

from robotrec.config import DOC_REPORTS, MANIFESTS, REPORTS, load_config  # noqa: E402

OUT = DOC_REPORTS / "ket-qua-cac-buoc.xlsx"
FONT = "Arial"
HEADER_FILL = PatternFill("solid", start_color="334155")
TITLE = Font(name=FONT, size=14, bold=True)
BOLD = Font(name=FONT, size=10, bold=True)
NORMAL = Font(name=FONT, size=10)
NOTE = Font(name=FONT, size=9, italic=True, color="555555")
LINK = Font(name=FONT, size=10, color="1D4ED8", underline="single")
THIN = Border(bottom=Side(style="thin", color="CBD5E1"))


def yes_no(value: Any, yes: str = "Có", no: str = "Không") -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        value = value.strip().lower() in ("true", "1", "có")
    return yes if value else no


def number(value: Any) -> Any:
    if value in (None, ""):
        return None
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        return value
    return int(as_float) if as_float.is_integer() else as_float


def table(ws: Worksheet, headers: list[str], rows: list[list[Any]], widths: dict[str, float] | None = None, wrap: set[str] | None = None,
          links: set[str] | None = None, number_format: dict[str, str] | None = None, start_row: int = 1) -> None:
    """Ghi một bảng: tiêu đề in đậm nền tối, cố định dòng tiêu đề, bật lọc, đặt độ rộng cột."""
    widths, wrap, links, number_format = widths or {}, wrap or set(), links or set(), number_format or {}
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=start_row, column=col, value=header)
        cell.font = Font(name=FONT, size=10, bold=True, color="FFFFFF")
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for r, row in enumerate(rows, start_row + 1):
        for col, (header, value) in enumerate(zip(headers, row), 1):
            cell = ws.cell(row=r, column=col, value=value)
            cell.font = NORMAL
            cell.border = THIN
            cell.alignment = Alignment(vertical="top", wrap_text=header in wrap)
            if header in links and isinstance(value, str) and value.startswith("http"):
                cell.hyperlink = value
                cell.font = LINK
            if header in number_format:
                cell.number_format = number_format[header]
    for col, header in enumerate(headers, 1):
        ws.column_dimensions[get_column_letter(col)].width = widths.get(header, max(10, min(40, len(header) + 4)))
    ws.freeze_panes = ws.cell(row=start_row + 1, column=1)
    ws.auto_filter.ref = f"A{start_row}:{get_column_letter(len(headers))}{start_row + len(rows)}"
    ws.row_dimensions[start_row].height = 30


def main() -> None:
    cfg = load_config("b01_danh_muc")
    group_label = {g["key"]: g["label"] for f in cfg["franchises"] for g in f["groups"]}
    robots = json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]
    b01 = json.loads((REPORTS / "B01" / "summary.json").read_text(encoding="utf-8"))
    b00 = json.loads((REPORTS / "B00" / "summary.json").read_text(encoding="utf-8"))
    with open(MANIFESTS / "store_robot_map.csv", encoding="utf-8") as handle:
        store_map = list(csv.DictReader(handle))
    with open(MANIFESTS / "store_products.csv", encoding="utf-8") as handle:
        slug_of = {row["name"]: row["slug"] for row in csv.DictReader(handle)}
    with open(MANIFESTS / "b01_candidates.csv", encoding="utf-8") as handle:
        candidates = list(csv.DictReader(handle))

    wb = Workbook()
    overview = wb.active
    overview.title = "Tổng quan"

    # Lớp ---------------------------------------------------------------------------------------------------------
    ws = wb.create_sheet("Lớp")
    headers = [
        "STT", "Lớp (tên hiển thị)", "Tên", "Nhân vật", "Franchise", "Nhóm dòng", "Dòng chi tiết", "Phe", "Tên khác",
        "Lý do chọn", "Liên kết đến", "Chạm trần đếm", "Độ dài trang (byte)", "Số sản phẩm cửa hàng", "Sản phẩm cửa hàng",
        "Mô tả (tiếng Anh, từ wiki)", "Ảnh đại diện", "Trang wiki", "Mã lớp", "Thông tin thêm",
    ]
    rows = []
    for index, r in enumerate(robots, 1):
        extra = {k: v for k, v in (r.get("extra") or {}).items() if v}
        rows.append(
            [
                index, r["display_name"], r["name"], r["character"], r["franchise_label"], group_label.get(r["group"], r["group"]),
                r["series"], r["faction"], ", ".join(r["aliases"]) or None, "Cửa hàng" if r["selected_by"] == "store" else "Phổ biến",
                r["popularity"]["backlinks"], yes_no(r["popularity"]["capped"]), r["popularity"]["page_bytes"], len(r["store_products"]),
                ", ".join(r["store_products"]) or None, r["description"], r["image"]["url"], r["wiki"]["url"], r["slug"],
                "; ".join(f"{k}: {', '.join(v) if isinstance(v, list) else v}" for k, v in extra.items()) or None,
            ]
        )
    table(
        ws, headers, rows,
        widths={"STT": 6, "Lớp (tên hiển thị)": 34, "Tên": 24, "Nhân vật": 22, "Franchise": 16, "Nhóm dòng": 26, "Dòng chi tiết": 34,
                "Phe": 22, "Tên khác": 24, "Lý do chọn": 12, "Liên kết đến": 11, "Chạm trần đếm": 9, "Độ dài trang (byte)": 12,
                "Số sản phẩm cửa hàng": 10, "Sản phẩm cửa hàng": 28, "Mô tả (tiếng Anh, từ wiki)": 80, "Ảnh đại diện": 30,
                "Trang wiki": 30, "Mã lớp": 34, "Thông tin thêm": 40},
        wrap={"Mô tả (tiếng Anh, từ wiki)", "Dòng chi tiết", "Thông tin thêm", "Sản phẩm cửa hàng"},
        links={"Ảnh đại diện", "Trang wiki"},
        number_format={"Liên kết đến": "#,##0", "Độ dài trang (byte)": "#,##0"},
    )
    n_classes = len(rows)

    # Ghép sản phẩm -----------------------------------------------------------------------------------------------
    ws = wb.create_sheet("Ghép sản phẩm")
    headers = ["STT", "Sản phẩm", "Mã sản phẩm", "Trang wiki (ghép tay)", "Lớp", "Ghép tự động", "Tự động đúng", "Ghi chú"]
    rows = [
        [i, row["Sản phẩm"], slug_of.get(row["Sản phẩm"]), row["Trang wiki (ghép tay)"], row["Lớp"], row["Ghép tự động"],
         yes_no(row["Tự động đúng"], "Đúng", "Sai"), row["Ghi chú"] or None]
        for i, row in enumerate(store_map, 1)
    ]
    table(ws, headers, rows, widths={"STT": 6, "Sản phẩm": 40, "Mã sản phẩm": 30, "Trang wiki (ghép tay)": 34, "Lớp": 38,
                                      "Ghép tự động": 34, "Tự động đúng": 12, "Ghi chú": 60}, wrap={"Ghi chú"})
    n_products = len(rows)

    # Theo nhóm ---------------------------------------------------------------------------------------------------
    ws = wb.create_sheet("Theo nhóm")
    groups = b01["groups"]
    headers = list(groups[0].keys())
    table(ws, headers, [[number(g.get(h)) for h in headers] for g in groups],
          widths={"Franchise": 24, "Nhóm (dòng)": 40}, number_format={h: "#,##0" for h in headers[2:]})

    # Ứng viên ----------------------------------------------------------------------------------------------------
    ws = wb.create_sheet("Ứng viên")
    labels = {"franchise": "Franchise", "group": "Nhóm dòng", "title": "Trang wiki", "faction": "Phe / nguồn", "page_bytes": "Độ dài trang (byte)",
              "passed": "Qua lọc cấu trúc", "reason": "Lý do loại / ghi chú", "backlinks": "Liên kết đến", "capped": "Chạm trần đếm",
              "partner": "Trang đã gộp", "selected_by": "Được chọn", "rank": "Hạng (ngoài robot cửa hàng)"}
    headers = list(labels.values())
    rows = []
    for c in candidates:
        chosen = {"store": "Cửa hàng", "popularity": "Phổ biến"}.get(c["selected_by"], None)
        rows.append([c["franchise"], group_label.get(c["group"], c["group"]), c["title"], c["faction"] or None, number(c["page_bytes"]),
                     yes_no(c["passed"]), c["reason"] or None, number(c["backlinks"]), yes_no(c["capped"]) if c["backlinks"] else None,
                     c["partner"] or None, chosen, number(c["rank"])])
    table(ws, headers, rows, widths={"Franchise": 13, "Nhóm dòng": 26, "Trang wiki": 40, "Phe / nguồn": 16, "Lý do loại / ghi chú": 50,
                                      "Trang đã gộp": 34, "Được chọn": 11}, wrap={"Lý do loại / ghi chú"},
          number_format={"Độ dài trang (byte)": "#,##0", "Liên kết đến": "#,##0"})

    # Các bảng nhỏ của B1 -----------------------------------------------------------------------------------------
    small = [
        ("Biến thể gộp", b01.get("variants_dropped", []), {"Biến thể bỏ": 42, "Giữ lớp": 36, "Nhóm": 24, "Họ": 18}),
        ("Lý do loại", b01.get("filter_reasons", []), {"Lý do loại": 60}),
        ("Tương quan", b01.get("spearman_length_backlinks", []), {"Franchise": 28}),
    ]
    for name, data, widths in small:
        if data:
            ws = wb.create_sheet(name)
            headers = list(data[0].keys())
            table(ws, headers, [[number(row.get(h)) for h in headers] for row in data], widths=widths)
    if cfg.get("exclude"):
        ws = wb.create_sheet("Loại tay")
        table(ws, ["Trang", "Lý do loại tay"], [[k, v] for k, v in cfg["exclude"].items()], widths={"Trang": 30, "Lý do loại tay": 80})

    # B00 ---------------------------------------------------------------------------------------------------------
    ws = wb.create_sheet("B00 Kiểm tra")
    checks = b00.get("checks", [])
    table(ws, ["Kiểm tra", "Kết quả", "Đạt"], [[c["Kiểm tra"], c["Kết quả"], yes_no(c["Đạt"])] for c in checks],
          widths={"Kiểm tra": 50, "Kết quả": 60, "Đạt": 8})
    speed = b00.get("train_throughput", [])
    if speed:
        ws = wb.create_sheet("B00 Tốc độ GPU")
        headers = [h for h in speed[0].keys() if h != "Ảnh/giây"]
        rows = [[yes_no(row.get(h)) if isinstance(row.get(h), bool) else number(row.get(h)) for h in headers] for row in speed]
        table(ws, headers, rows, widths={"Kiến trúc": 18, "Bố cục bộ nhớ": 15, "Kiểu số": 12, "Ảnh/giây (TB ± ĐLC)": 16, "Thấp nhất – cao nhất": 16})
    best = b00.get("best_train_config", [])
    if best:
        ws = wb.create_sheet("B00 Cấu hình nhanh")
        headers = list(best[0].keys())
        table(ws, headers, [[number(row.get(h)) for h in headers] for row in best], widths={"Kiến trúc": 18, "Cấu hình nhanh nhất": 32})
    network = b00.get("network", [])
    if network:
        ws = wb.create_sheet("B00 Nguồn dữ liệu")
        headers = ["Nguồn", "Dùng ở", "Mã HTTP", "Thời gian (ms)", "Truy cập được"]
        table(ws, headers, [[n.get("Nguồn"), n.get("Dùng ở"), n.get("Mã HTTP"), n.get("Thời gian (ms)"), yes_no(n.get("Truy cập được"))] for n in network],
              widths={"Nguồn": 48, "Dùng ở": 12})

    # B02: thu thập ảnh (ml/reports/B02/summary.json) -----------------------------------------------------------------
    def dict_rows(items: list[dict]) -> tuple[list[str], list[list[Any]]]:
        headers = list(items[0].keys())
        return headers, [[number(item.get(h)) for h in headers] for item in items]

    def stacked(ws: Worksheet, tables: dict[str, dict], widths: list[float]) -> None:
        row = 1
        for caption, data in tables.items():
            ws.cell(row=row, column=1, value=caption).font = BOLD
            row += 1
            for col, header in enumerate(data["columns"], 1):
                cell = ws.cell(row=row, column=col, value=header)
                cell.font = Font(name=FONT, size=10, bold=True, color="FFFFFF")
                cell.fill = HEADER_FILL
            for values in data["rows"]:
                row += 1
                for col, value in enumerate(values, 1):
                    ws.cell(row=row, column=col, value=number(value)).font = NORMAL
            row += 2
        for col, width in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(col)].width = width

    b02_path = REPORTS / "B02" / "summary.json"
    if b02_path.exists():
        b02 = json.loads(b02_path.read_text(encoding="utf-8"))
        tables = {}
        if b02.get("summary"):
            tables["Bảng 2. Tổng quan"] = {"columns": ["Chỉ số", "Giá trị"], "rows": [[k, v] for k, v in b02["summary"].items()]}
        for key, caption in (("by_source", "Bảng 3. Kết quả tải theo nguồn"), ("low_classes", "Bảng 5. Lớp dưới 200 ảnh thô")):
            if b02.get(key):
                headers, rows = dict_rows(b02[key])
                tables[caption] = {"columns": headers, "rows": rows}
        if tables:
            stacked(wb.create_sheet("B02 Thu ảnh"), tables, [46, 18, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14])
        if b02.get("per_class"):
            ws = wb.create_sheet("B02 Ảnh mỗi lớp")
            headers, rows = dict_rows(b02["per_class"])
            table(ws, headers, rows, widths={"Lớp": 52, "Franchise": 28})

    # B02b, B03a: các bảng lấy nguyên từ summary.json của báo cáo ---------------------------------------------------
    for step, title, widths in (("B02b", "B02b Trùng lặp", [52, 16, 40, 16, 22, 18]), ("B03a", "B03a Làm sạch tự động", [52, 28, 16, 16, 18, 18, 22, 20]),
                               ("B04", "B04 Chia tập", [52, 28, 14, 12, 12, 12, 12, 14, 14]), ("B04b", "B04b Tập âm", [44, 12, 12, 12, 12, 18, 22]),
                               ("B05", "B05 Mô hình nền", [46, 20, 16, 22, 22, 22, 14, 14, 14, 14])):
        path = REPORTS / step / "summary.json"
        if path.exists():
            tables = json.loads(path.read_text(encoding="utf-8")).get("tables", {})
            if tables:
                stacked(wb.create_sheet(title), tables, widths)

    # Tổng quan: công thức đếm trên các sheet khác --------------------------------------------------------------
    ws = overview
    ws["A1"] = "Nhận dạng robot từ ảnh: kết quả các bước"
    ws["A1"].font = TITLE
    ws["A2"] = ("Sinh tự động bởi ml/scripts/export_excel.py từ ml/data/manifests và ml/reports. Số trong các bảng dưới là công thức "
                "đếm trên sheet Lớp và Ghép sản phẩm, tự cập nhật khi sửa các sheet đó. Báo cáo đầy đủ: docs/nhan-dang-robot/bao-cao/.")
    ws["A2"].font = NOTE
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A2:E2")
    ws.row_dimensions[2].height = 42

    last = n_classes + 1
    franchise_col = f"'Lớp'!$E$2:$E${last}"
    reason_col = f"'Lớp'!$J$2:$J${last}"
    ws["A4"] = "Số lớp theo franchise"
    ws["A4"].font = BOLD
    for col, header in enumerate(["Franchise", "Tổng lớp", "Chọn vì cửa hàng bán", "Chọn theo độ phổ biến"], 1):
        cell = ws.cell(row=5, column=col, value=header)
        cell.font = Font(name=FONT, size=10, bold=True, color="FFFFFF")
        cell.fill = HEADER_FILL
    franchises = [f["label"] for f in cfg["franchises"]]
    for i, label in enumerate(franchises, 6):
        ws.cell(row=i, column=1, value=label).font = NORMAL
        ws.cell(row=i, column=2, value=f"=COUNTIF({franchise_col},A{i})").font = NORMAL
        ws.cell(row=i, column=3, value=f'=COUNTIFS({franchise_col},A{i},{reason_col},"Cửa hàng")').font = NORMAL
        ws.cell(row=i, column=4, value=f'=COUNTIFS({franchise_col},A{i},{reason_col},"Phổ biến")').font = NORMAL
    total_row = 6 + len(franchises)
    ws.cell(row=total_row, column=1, value="Tổng").font = BOLD
    for col in (2, 3, 4):
        letter = get_column_letter(col)
        ws.cell(row=total_row, column=col, value=f"=SUM({letter}6:{letter}{total_row - 1})").font = BOLD

    row = total_row + 2
    ws.cell(row=row, column=1, value="Ghép sản phẩm cửa hàng").font = BOLD
    plast = n_products + 1
    items = [
        ("Số sản phẩm đang bán", f"=COUNTA('Ghép sản phẩm'!$B$2:$B${plast})", "0"),
        ("Số lớp có sản phẩm", f'=COUNTIF({reason_col},"Cửa hàng")', "0"),
        ("Ghép tự động đúng", f"=COUNTIF('Ghép sản phẩm'!$G$2:$G${plast},\"Đúng\")", "0"),
        ("Tỉ lệ ghép tự động đúng", f"=IF(B{row + 1}=0,0,B{row + 3}/B{row + 1})", "0.0%"),
    ]
    for offset, (label, formula, fmt) in enumerate(items, 1):
        ws.cell(row=row + offset, column=1, value=label).font = NORMAL
        cell = ws.cell(row=row + offset, column=2, value=formula)
        cell.font = NORMAL
        cell.number_format = fmt
    ci = b01.get("store_map", {}).get("auto_ci")
    if ci:
        cell = ws.cell(row=row + 5, column=1, value="Khoảng tin cậy Wilson 95% của tỉ lệ trên")
        cell.font = NORMAL
        value = ws.cell(row=row + 5, column=2, value=f"{ci[0] * 100:.1f}% – {ci[1] * 100:.1f}%")
        value.font = NORMAL
        value.comment = Comment("Tính bằng robotrec.stats.wilson_ci trong ml/scripts/b01_danh_muc.py; nguồn: ml/reports/B01/summary.json.", "export_excel")

    row = row + 7
    ws.cell(row=row, column=1, value="Các sheet").font = BOLD
    guide = [
        ("Lớp", "230 lớp (robot + dòng) với thông tin dùng cho web; lọc theo Franchise, Nhóm dòng, Lý do chọn"),
        ("Ghép sản phẩm", "76 sản phẩm cửa hàng → trang wiki → lớp, kèm kết quả ghép tự động"),
        ("Theo nhóm", "Bảng 1 của báo cáo B01: ứng viên, lọc, số lớp theo từng dòng"),
        ("Ứng viên", "Mọi trang wiki đã xét ở tầng 2, kèm lý do chọn hoặc loại"),
        ("Biến thể gộp / Loại tay / Lý do loại / Tương quan", "Các bảng 3, 9, 10, 2 của báo cáo B01"),
        ("B00 …", "Kiểm tra môi trường, tốc độ GPU, truy cập nguồn dữ liệu (báo cáo B00)"),
        ("B02 Thu ảnh / B02 Ảnh mỗi lớp", "Tổng quan, kết quả tải theo nguồn, số ảnh thô của từng lớp (báo cáo B02)"),
        ("B02b Trùng lặp", "Bản trùng hệt và nhãn mâu thuẫn trong 74 nghìn ảnh thô, kèm ví dụ (báo cáo B02b)"),
        ("B03a Làm sạch tự động", "Phễu lọc, lý do loại, theo nguồn và franchise, số ảnh từng lớp sau lọc tự động (báo cáo B03a)"),
        ("B04 Chia tập", "Kích thước train / val / test, 35 lớp không biết, nhóm ảnh, kiểm tra rò rỉ, số ảnh từng tập của từng lớp (báo cáo B04)"),
        ("B04b Tập âm", "Ảnh không phải robot (COCO, đồ chơi, xe) để đo khả năng từ chối (báo cáo B04b)"),
        ("B05 Mô hình nền", "Zero-shot, linear probe, k-NN trên 5 bộ đặc trưng đóng băng: top-1, top-5, macro-F1 kèm khoảng tin cậy; so sánh McNemar (báo cáo B05)"),
    ]
    for offset, (sheet, text) in enumerate(guide, 1):
        ws.cell(row=row + offset, column=1, value=sheet).font = NORMAL
        ws.cell(row=row + offset, column=2, value=text).font = NORMAL
    ws.column_dimensions["A"].width = 42
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 22
    ws.column_dimensions["D"].width = 22
    ws.column_dimensions["E"].width = 30

    wb.calculation.fullCalcOnLoad = True  # Excel tính lại mọi công thức khi mở
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"Đã ghi {OUT} ({len(wb.sheetnames)} sheet: {', '.join(wb.sheetnames)})")


if __name__ == "__main__":
    main()
