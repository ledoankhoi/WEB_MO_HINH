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
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

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


def training_notebook() -> nbformat.NotebookNode:
    """B6 trên Colab: ảnh giải nén ra đĩa của máy Colab (đọc nhanh), checkpoint ghi vào Drive (phiên bị ngắt không mất)."""
    cells = [
        new_markdown_cell(
            "# B6. Huấn luyện chính trên Google Colab\n\n"
            "Notebook sinh tự động bởi `ml/scripts/make_notebooks.py`. Kế hoạch: `docs/nhan-dang-robot/00-ke-hoach.md`, mục B6.\n\n"
            "**Trước khi chạy**\n"
            "1. Runtime → Change runtime type → **T4 GPU** → Save.\n"
            "2. Trong Google Drive phải có thư mục `robotica-ml` chứa `images-raw.zip` (ảnh của bộ dữ liệu).\n\n"
            "**Cách chạy**: Runtime → Run all, rồi **để nguyên tab này mở** (Colab miễn phí ngắt khi đóng tab hoặc lâu không tương tác). "
            "Colab chỉ làm phần việc được giao trong ô `ARCH, SEEDS` (mặc định ViT-B/16 hạt giống 43, khoảng 3 giờ); máy nhà và Kaggle làm phần còn lại "
            "(`ml/scripts/dieu_phoi.py` tự chép kết quả từ Drive về máy nhà). Đừng đổi sang `--all`: sẽ chạy trùng việc của máy khác.\n\n"
            "Mỗi epoch lưu checkpoint vào Drive `robotica-ml/runs/b06/`. **Nếu Colab ngắt giữa chừng**: mở lại notebook, Run all lần nữa, "
            "việc huấn luyện chạy tiếp từ epoch đã xong. Nếu không chạy lại được, máy nhà tự chạy tiếp từ checkpoint trên Drive.\n\n"
            "Ảnh chỉ dùng cho nghiên cứu, không chia sẻ notebook kèm dữ liệu."
        ),
        new_code_cell(
            "from google.colab import drive\n"
            "drive.mount('/content/drive')\n"
            "import os\n"
            "DRIVE = '/content/drive/MyDrive/robotica-ml'\n"
            "assert os.path.exists(f'{DRIVE}/images-raw.zip'), 'Không thấy robotica-ml/images-raw.zip trong Google Drive'\n"
            "os.environ['ROBOTREC_DATA'] = '/content/data'      # ảnh giải nén ra đĩa của máy Colab: đọc nhanh hơn đọc thẳng từ Drive\n"
            "os.environ['ROBOTREC_RUNS'] = f'{DRIVE}/runs'      # checkpoint và kết quả: ghi vào Drive\n"
            "os.makedirs(os.environ['ROBOTREC_RUNS'], exist_ok=True)\n"
            "!nvidia-smi --query-gpu=name,memory.total --format=csv"
        ),
        new_code_cell(
            f"!test -d /content/WEB_MO_HINH || git clone --depth 1 {REPO} /content/WEB_MO_HINH\n"
            "!git -C /content/WEB_MO_HINH pull --ff-only\n"
            "%cd /content/WEB_MO_HINH\n"
            "!git log -1 --format='Mã đang dùng: %h %s'\n"
            "# Colab có sẵn PyTorch, torchvision, numpy, pandas, scipy, matplotlib; chỉ cần thêm timm (ghim đúng phiên bản đã dùng ở máy)\n"
            "!pip install -q timm==1.0.31\n"
            "!python -c \"import torch, timm; print('torch', torch.__version__, '| timm', timm.__version__, '| GPU', torch.cuda.is_available())\""
        ),
        new_code_cell(
            "# Giải nén ảnh (khoảng 3 GB, vài phút; chỉ làm một lần mỗi phiên Colab)\n"
            "if not os.path.exists('/content/data/images/raw'):\n"
            "    os.makedirs('/content/data/images', exist_ok=True)\n"
            "    !unzip -q {DRIVE}/images-raw.zip -d /content/data/images\n"
            "!python -c \"import pandas as pd, os; s=pd.read_csv('ml/data/manifests/b04_splits.csv.gz'); "
            "miss=[f for f in s.file if not os.path.exists('/content/data/images/raw/'+f)]; print('ảnh của bộ chia tập:', len(s), '| thiếu:', len(miss))\""
        ),
        new_code_cell(
            "# Phần việc của máy Colab này (chia việc: ml/scripts/dieu_phoi.py). Chạy tiếp được nếu bị ngắt; lần chạy đã xong được bỏ qua.\n"
            "ARCH, SEEDS = 'vit_b16_clip', [43]\n"
            "for seed in SEEDS:\n"
            "    !python ml/scripts/b06_huan_luyen.py --arch {ARCH} --seed {seed}"
        ),
        new_code_cell(
            "# Kết quả (máy nhà tự chép từ Drive về và làm báo cáo B06)\n"
            "import json\n"
            "for seed in SEEDS:\n"
            "    path = f\"{os.environ['ROBOTREC_RUNS']}/b06/{ARCH}-s{seed}/result.json\"\n"
            "    if os.path.exists(path):\n"
            "        best = json.load(open(path, encoding='utf-8'))['best']\n"
            "        print(f\"{ARCH} hạt giống {seed}: xong, epoch tốt nhất {best['epoch']}, val top-1 {100 * best['val_top1']:.2f}%, macro-F1 {100 * best['val_macro_f1']:.2f}%\")\n"
            "    else:\n"
            "        print(f'{ARCH} hạt giống {seed}: chưa xong')"
        ),
    ]
    nb = new_notebook(cells=cells)
    nb.metadata["accelerator"] = "GPU"
    nb.metadata["colab"] = {"provenance": [], "gpuType": "T4"}
    nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3"}
    return nb


def main() -> None:
    out = ML_ROOT / "notebooks"
    out.mkdir(exist_ok=True)
    for step, name, title, script, gpu, slug in STEPS:
        path = out / f"{name}.ipynb"
        nbformat.write(notebook(step, title, script, gpu, slug), path)
        print(f"Đã ghi {path.relative_to(ML_ROOT.parent).as_posix()}")
    path = out / "B06_huan_luyen.ipynb"
    nbformat.write(training_notebook(), path)
    print(f"Đã ghi {path.relative_to(ML_ROOT.parent).as_posix()}")


if __name__ == "__main__":
    main()
