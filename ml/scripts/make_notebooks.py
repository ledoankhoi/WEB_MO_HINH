"""Sinh notebook Colab cho từng bước (ml/notebooks/Bxx_*.ipynb).

Notebook chỉ là lớp vỏ: gắn Google Drive, lấy mã từ GitHub, cài thư viện, chạy đúng script của bước đó rồi hiện
báo cáo. Mọi logic nằm trong `ml/scripts/` và `ml/robotrec/`, nên chạy trên Colab hay ở máy đều dùng cùng mã.

Chạy: python ml/scripts/make_notebooks.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.config import ML_ROOT  # noqa: E402

REPO = "https://github.com/ledoankhoi/WEB_MO_HINH.git"

# (mã bước, tên file, tiêu đề, script, cần GPU, slug báo cáo)
STEPS = [
    ("B00", "B00_moi_truong", "B0. Môi trường và khung báo cáo", "b00_moi_truong.py", True, "moi-truong"),
    ("B01", "B01_danh_muc_robot", "B1. Danh mục robot và kho thông tin", "b01_danh_muc.py", False, "danh-muc-robot"),
]


def notebook(step: str, title: str, script: str, gpu: bool, slug: str) -> nbformat.NotebookNode:
    cells = [
        new_markdown_cell(
            f"# {title}\n\n"
            f"Notebook sinh tự động bởi `ml/scripts/make_notebooks.py`. Kế hoạch: `docs/nhan-dang-robot/00-ke-hoach.md`.\n\n"
            + ("**Cần GPU:** Runtime → Change runtime type → T4 GPU.\n\n" if gpu else "")
            + "Ảnh và checkpoint lưu ở Google Drive `MyDrive/robotica-ml/`. Báo cáo của bước được chép vào "
            "`MyDrive/robotica-ml/reports/` để đưa về repo."
        ),
        new_code_cell(
            "from google.colab import drive\n"
            "drive.mount('/content/drive')\n"
            "import os\n"
            "os.environ['ROBOTREC_DATA'] = '/content/drive/MyDrive/robotica-ml'\n"
            "os.makedirs(os.environ['ROBOTREC_DATA'], exist_ok=True)"
        ),
        new_code_cell(
            f"!test -d /content/WEB_MO_HINH || git clone --depth 1 {REPO} /content/WEB_MO_HINH\n"
            "!git -C /content/WEB_MO_HINH pull --ff-only\n"
            "%cd /content/WEB_MO_HINH\n"
            "!pip install -q -r ml/requirements.in"
        ),
        new_code_cell(f"!python ml/scripts/{script}"),
        new_code_cell(
            "import shutil\n"
            f"out = os.path.join(os.environ['ROBOTREC_DATA'], 'reports', '{step}')\n"
            "shutil.rmtree(out, ignore_errors=True)\n"
            f"shutil.copytree('ml/reports/{step}', out)\n"
            f"shutil.copy('docs/nhan-dang-robot/bao-cao/{step}-{slug}.md', out)\n"
            "print('Đã chép báo cáo vào', out)"
        ),
        new_code_cell(
            "from IPython.display import Markdown, display\n"
            f"display(Markdown(open('docs/nhan-dang-robot/bao-cao/{step}-{slug}.md', encoding='utf-8').read()))"
        ),
    ]
    nb = new_notebook(cells=cells)
    nb.metadata["accelerator"] = "GPU" if gpu else "None"
    nb.metadata["colab"] = {"provenance": []}
    nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3"}
    return nb


def main() -> None:
    out = ML_ROOT / "notebooks"
    out.mkdir(exist_ok=True)
    for step, name, title, script, gpu, slug in STEPS:
        path = out / f"{name}.ipynb"
        nbformat.write(notebook(step, title, script, gpu, slug), path)
        print(f"Đã ghi {path.relative_to(ML_ROOT.parent).as_posix()}")


if __name__ == "__main__":
    main()
