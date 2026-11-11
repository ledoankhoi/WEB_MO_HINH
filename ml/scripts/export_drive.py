"""Đưa kế hoạch, báo cáo và bảng kết quả lên Google Drive (qua thư mục đồng bộ của Google Drive cho máy tính).

Tạo trong Drive thư mục "ROBOTICA - Nhận dạng robot":
- Báo cáo/: kế hoạch và báo cáo từng bước, chuyển Markdown → Word (.docx) bằng pandoc, nhúng biểu đồ.
- ket-qua-cac-buoc.xlsx: mọi bảng (sinh bởi export_excel.py; chạy lại trước khi đưa lên).
- Dữ liệu/: robots.json và các file CSV của ml/data/manifests.
- Hình/: biểu đồ PNG của từng bước.

Ảnh huấn luyện (B2 trở đi) không đưa vào đây: chỉ dùng cho nghiên cứu, nằm ở thư mục ROBOTREC_DATA.

Chạy: python ml/scripts/export_drive.py [--dest "G:/My Drive"]
"""

from __future__ import annotations

import argparse
import os
import shutil
import string
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import pypandoc  # noqa: E402

from robotrec.config import DOC_REPORTS, MANIFESTS, ML_ROOT, REPORTS  # noqa: E402

FOLDER = "ROBOTICA - Nhận dạng robot"
PLAN = DOC_REPORTS.parent / "00-ke-hoach.md"
# Tên thư mục gốc của Drive theo ngôn ngữ giao diện.
DRIVE_ROOTS = ["My Drive", "Drive của tôi"]


def find_drive() -> Path | None:
    """Thư mục "My Drive" của Google Drive cho máy tính trên một ổ đĩa bất kỳ."""
    for letter in string.ascii_uppercase:
        for name in DRIVE_ROOTS:
            path = Path(f"{letter}:/{name}")
            try:
                if path.is_dir():
                    return path
            except OSError:
                continue
    return None


def to_docx(source: Path, target: Path) -> None:
    """Markdown → Word. --resource-path để pandoc tìm ảnh theo đường dẫn tương đối của file Markdown."""
    target.parent.mkdir(parents=True, exist_ok=True)
    pypandoc.convert_file(
        str(source),
        "docx",
        format="gfm",
        outputfile=str(target),
        extra_args=[f"--resource-path={source.parent}", "--toc", "--toc-depth=2"],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dest", help="thư mục gốc của Drive (mặc định: tự tìm 'My Drive' trên các ổ đĩa)")
    args = parser.parse_args()
    root = Path(args.dest) if args.dest else find_drive()
    if root is None or not root.is_dir():
        raise SystemExit("Không tìm thấy thư mục Google Drive. Đăng nhập Google Drive cho máy tính rồi chạy lại, hoặc truyền --dest.")
    out = root / FOLDER

    # Bảng Excel mới nhất
    subprocess.run([sys.executable, str(ML_ROOT / "scripts" / "export_excel.py")], check=True)

    written: list[Path] = []
    skipped: list[tuple[Path, str]] = []
    staging = Path(tempfile.mkdtemp(prefix="robotrec-drive-"))

    def publish(source: Path, target: Path) -> None:
        """Chép sang Drive: thử ghi đè; Drive từ chối (file đang mở hoặc đang đồng bộ) thì ghi tên tạm rồi thay thế; vẫn lỗi thì bỏ qua."""
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(source, target)
        except OSError:
            temporary = target.with_name(f".{target.name}.moi")
            try:
                shutil.copy2(source, temporary)
                os.replace(temporary, target)
            except OSError as error:
                temporary.unlink(missing_ok=True)
                skipped.append((target, f"{type(error).__name__}: {error}"))
                return
        written.append(target)

    documents = [PLAN, DOC_REPORTS.parent / "nhat-ky.md"] + sorted(DOC_REPORTS.glob("B*.md"))
    for source in documents:
        local = staging / f"{source.stem}.docx"
        to_docx(source, local)
        publish(local, out / "Báo cáo" / local.name)
    publish(DOC_REPORTS / "ket-qua-cac-buoc.xlsx", out / "ket-qua-cac-buoc.xlsx")
    for source in sorted(MANIFESTS.glob("*")):
        if source.is_file():
            publish(source, out / "Dữ liệu" / source.name)
    for source in sorted(REPORTS.glob("B*/*.png")):
        publish(source, out / "Hình" / source.parent.name / source.name)
    shutil.rmtree(staging, ignore_errors=True)

    print(f"Đã ghi {len(written)} file vào {out}")
    for path in written:
        print(f"  {path.relative_to(out).as_posix()}  ({path.stat().st_size / 1024:.0f} KB)")
    for path, reason in skipped:
        print(f"BỎ QUA (đóng file trên máy hoặc chờ Drive đồng bộ xong rồi chạy lại): {path.relative_to(out).as_posix()} — {reason}")


if __name__ == "__main__":
    main()
