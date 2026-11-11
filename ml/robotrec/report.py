"""Bộ sinh báo cáo theo mẫu 8 mục (kế hoạch mục 6).

Mỗi bước tạo một `Report`, thêm nội dung theo từng mục, rồi `write()`:
- `docs/nhan-dang-robot/bao-cao/Bxx-<slug>.md`: báo cáo đọc được, chép vào luận văn.
- `ml/reports/Bxx/summary.json`: số liệu chính (máy đọc), cùng môi trường và thời gian chạy.
- `ml/reports/Bxx/*.png`: biểu đồ, được báo cáo tham chiếu bằng đường dẫn tương đối.
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

from .config import DOC_REPORTS, REPORTS

SECTIONS = [
    "1. Mục tiêu",
    "2. Đầu vào, đầu ra",
    "3. Công cụ và môi trường",
    "4. Phương pháp",
    "5. Kết quả",
    "6. Phân tích",
    "7. Hạn chế và rủi ro",
    "8. Tái lập",
]


def _cell(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "có" if value else "không"
    if isinstance(value, float):
        return f"{value:.4g}"
    return str(value).replace("|", "\\|").replace("\n", " ")


def markdown_table(rows: Sequence[Mapping[str, Any]] | Sequence[Sequence[Any]], columns: Sequence[str] | None = None) -> str:
    """Bảng Markdown từ danh sách dict (cột lấy theo `columns` hoặc khoá của dòng đầu) hoặc danh sách dòng."""
    if not rows:
        return "_(không có dòng nào)_"
    if isinstance(rows[0], Mapping):
        columns = list(columns or rows[0].keys())
        body = [[_cell(row.get(column)) for column in columns] for row in rows]  # type: ignore[union-attr]
    else:
        if columns is None:
            raise ValueError("Cần `columns` khi dòng là danh sách.")
        body = [[_cell(value) for value in row] for row in rows]
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join("---" for _ in columns) + " |"]
    lines += ["| " + " | ".join(row) + " |" for row in body]
    return "\n".join(lines)


class Report:
    def __init__(self, step: str, slug: str, title: str, *, doc_dir: Path = DOC_REPORTS, data_dir: Path = REPORTS) -> None:
        self.step = step
        self.title = title
        self.doc_path = Path(doc_dir) / f"{step}-{slug}.md"
        self.figure_dir = Path(data_dir) / step
        self.summary: dict[str, Any] = {"step": step, "title": title}
        self._blocks: list[str] = []
        self._started = time.perf_counter()

    # Nội dung -------------------------------------------------------------------------------------------------

    def section(self, number: int) -> None:
        """Tiêu đề mục chuẩn 1–8 của mẫu báo cáo."""
        self._blocks.append(f"## {SECTIONS[number - 1]}")

    def h3(self, text: str) -> None:
        self._blocks.append(f"### {text}")

    def p(self, text: str) -> None:
        self._blocks.append(text.strip())

    def bullets(self, items: Iterable[str]) -> None:
        self._blocks.append("\n".join(f"- {item}" for item in items))

    def table(self, rows: Sequence[Mapping[str, Any]] | Sequence[Sequence[Any]], columns: Sequence[str] | None = None, caption: str | None = None) -> None:
        if caption:
            self._blocks.append(f"**{caption}**")
        self._blocks.append(markdown_table(rows, columns))

    def code(self, text: str, language: str = "") -> None:
        self._blocks.append(f"```{language}\n{text.rstrip()}\n```")

    def figure(self, fig: Any, name: str, caption: str) -> Path:
        """Lưu hình matplotlib thành PNG (150 dpi) và chèn vào báo cáo kèm chú thích."""
        self.figure_dir.mkdir(parents=True, exist_ok=True)
        path = self.figure_dir / f"{name}.png"
        fig.savefig(path, dpi=150, bbox_inches="tight")
        relative = os.path.relpath(path, self.doc_path.parent).replace(os.sep, "/")
        self._blocks.append(f"![{caption}]({relative})\n\n*Hình: {caption}*")
        return path

    def set(self, key: str, value: Any) -> None:
        """Ghi một số liệu vào summary.json (khoá có thể lồng bằng dấu chấm, ví dụ `gpu.images_per_s`)."""
        target = self.summary
        *parents, leaf = key.split(".")
        for part in parents:
            target = target.setdefault(part, {})
        target[leaf] = value

    # Các mục tự động ------------------------------------------------------------------------------------------

    def environment(self, env: Mapping[str, Any]) -> None:
        """Bảng môi trường cho mục 3 và lưu đầy đủ vào summary.json."""
        self.summary["environment"] = dict(env)
        gpu = env.get("gpu", {})
        devices = ", ".join(f"{d['name']} ({d['memory_gb']} GB)" for d in gpu.get("devices", [])) or "không có (PyTorch không thấy GPU)"
        git = env.get("git", {})
        rows = [
            ("Thời điểm chạy (UTC)", env.get("time_utc")),
            ("Hệ điều hành", env.get("os")),
            ("Python", env.get("python")),
            ("CPU", f"{env.get('cpu')} ({env.get('cpu_count')} luồng)"),
            ("RAM", f"{env.get('ram_gb')} GB"),
            ("GPU (PyTorch)", devices),
            ("CUDA của PyTorch", gpu.get("torch_cuda_version")),
            ("Driver (nvidia-smi)", "; ".join(gpu.get("nvidia_smi", [])) or None),
            ("Google Colab", env.get("colab")),
            ("Commit git", f"{git.get('short')}{' (có thay đổi chưa commit)' if git.get('dirty') else ''}"),
        ]
        self.table(rows, ["Mục", "Giá trị"], caption="Môi trường")
        packages = env.get("packages", {})
        if packages:
            self.table(sorted(packages.items()), ["Thư viện", "Phiên bản"], caption="Phiên bản thư viện")

    def reproduce(self, commands: Sequence[str], *, config: str | None = None, config_hash: str | None = None, seed: int | None = None, dataset_version: str | None = None) -> None:
        """Mục 8: lệnh chạy lại và các mã định danh."""
        rows = [("Cấu hình", config), ("Mã cấu hình", config_hash), ("Hạt giống", seed), ("Phiên bản dữ liệu", dataset_version)]
        self.table([row for row in rows if row[1] is not None], ["Mục", "Giá trị"])
        self.code("\n".join(commands), "bash")
        self.summary["reproduce"] = {"commands": list(commands), "config": config, "config_hash": config_hash, "seed": seed, "dataset_version": dataset_version}

    # Ghi file -------------------------------------------------------------------------------------------------

    def write(self) -> Path:
        seconds = round(time.perf_counter() - self._started, 1)
        self.summary["duration_s"] = seconds
        header = [
            f"# {self.step}. {self.title}",
            f"Báo cáo sinh tự động bởi `ml/` (mẫu ở `docs/nhan-dang-robot/00-ke-hoach.md` mục 6). "
            f"Thời gian chạy: {seconds} giây. Số liệu máy đọc: `ml/reports/{self.step}/summary.json`.",
        ]
        self.doc_path.parent.mkdir(parents=True, exist_ok=True)
        self.doc_path.write_text("\n\n".join(header + self._blocks) + "\n", encoding="utf-8")
        self.figure_dir.mkdir(parents=True, exist_ok=True)
        (self.figure_dir / "summary.json").write_text(json.dumps(self.summary, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
        return self.doc_path
