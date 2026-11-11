"""Đường dẫn và cấu hình.

- `ml/data/manifests/`: danh sách robot, manifest ảnh, chia tập. Nhỏ, có trong git.
- `ml/reports/Bxx/`: số liệu (summary.json) và biểu đồ của từng bước. Có trong git.
- `docs/nhan-dang-robot/bao-cao/`: báo cáo Markdown của từng bước. Có trong git.
- Thư mục dữ liệu nặng (ảnh, checkpoint, ONNX): biến môi trường ROBOTREC_DATA, mặc định `ml/data/store/`
  (bị git bỏ qua). Trên Colab đặt ROBOTREC_DATA=/content/drive/MyDrive/robotica-ml.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import yaml

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
CONFIGS = ML_ROOT / "configs"
MANIFESTS = ML_ROOT / "data" / "manifests"
REPORTS = ML_ROOT / "reports"
DOC_REPORTS = REPO_ROOT / "docs" / "nhan-dang-robot" / "bao-cao"


def data_root() -> Path:
    root = Path(os.environ.get("ROBOTREC_DATA") or ML_ROOT / "data" / "store")
    root.mkdir(parents=True, exist_ok=True)
    return root


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def load_config(name: str | None = None) -> dict[str, Any]:
    """Đọc configs/base.yaml, rồi ghi đè bằng configs/<name>.yaml nếu có."""
    with open(CONFIGS / "base.yaml", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    if name:
        with open(CONFIGS / f"{name}.yaml", encoding="utf-8") as handle:
            config = _merge(config, yaml.safe_load(handle) or {})
    return config


def config_hash(config: dict[str, Any]) -> str:
    """Mã ngắn của cấu hình, ghi vào báo cáo để biết kết quả ứng với cấu hình nào."""
    text = json.dumps(config, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()
