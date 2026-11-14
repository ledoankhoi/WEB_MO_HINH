"""Chạy song song trên nhiều máy (máy này, Google Colab, Kaggle): đặt tên lần chạy, chép kết quả về, chia việc.

Mỗi lần chạy là một thư mục `<ROBOTREC_RUNS>/<b06|b07>/<tên>/` (config.json, history.csv, best.pt, val_logits.npy, result.json;
last.pt trong lúc chạy). Thư mục giống hệt nhau trên mọi máy, nên chép thư mục là đủ để máy này dùng kết quả của máy khác,
và chép cả last.pt thì máy này chạy tiếp được lần chạy dở của máy khác.

Phần gọi Kaggle và vòng lặp điều phối ở `ml/scripts/dieu_phoi.py`; ở đây chỉ có phép tính thuần để kiểm thử được.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path


def b6_name(arch: str, seed: int) -> str:
    return f"{arch}-s{seed}"


def b7_name(exp_id: str, arch: str, seed: int, fraction: float | None) -> str:
    """Giống tên thư mục của `b07_thi_nghiem_phu.run_experiment`."""
    return f"{exp_id}" + (f"-{int(round(100 * fraction))}" if fraction else "") + f"-{arch}-s{seed}"


def run_finished(run_dir: Path) -> bool:
    path = run_dir / "result.json"
    if not path.exists():
        return False
    try:
        return bool(json.loads(path.read_text(encoding="utf-8")).get("finished"))
    except (json.JSONDecodeError, OSError):  # file đang được ghi hoặc đồng bộ dở
        return False


def epochs_done(run_dir: Path) -> int:
    path = run_dir / "history.csv"
    if not path.exists():
        return 0
    try:
        return max(0, len(path.read_text(encoding="utf-8").strip().splitlines()) - 1)
    except OSError:
        return 0


def copy_run(src: Path, dst: Path, with_checkpoint: bool = False) -> list[str]:
    """Chép một lần chạy sang máy này. Không ghi đè lần chạy đã xong ở đích.

    `with_checkpoint`: chép cả last.pt để chạy tiếp ở đây (lần chạy dở trên máy khác). result.json chép sau cùng,
    để thư mục đích chỉ được coi là xong khi mọi file khác đã chép đủ.
    """
    if run_finished(dst):
        return []
    dst.mkdir(parents=True, exist_ok=True)
    copied, last = [], None
    for item in sorted(src.iterdir()):
        if not item.is_file() or item.name.endswith(".tmp"):
            continue
        if item.name == "last.pt" and not with_checkpoint:
            continue
        if item.name == "result.json":
            last = item
            continue
        tmp = dst / (item.name + ".tmp")
        shutil.copyfile(item, tmp)
        tmp.replace(dst / item.name)
        copied.append(item.name)
    if last is not None:
        shutil.copyfile(last, dst / "result.json.tmp")
        (dst / "result.json.tmp").replace(dst / "result.json")
        copied.append("result.json")
    return copied


def find_run_dirs(root: Path, folder: str) -> dict[str, Path]:
    """Mọi thư mục lần chạy dưới `root` có dạng `.../<folder>/<tên>/config.json` (kết quả Kaggle tải về có thể lồng thêm cấp)."""
    found: dict[str, Path] = {}
    for config in sorted(root.rglob("config.json")):
        if config.parent.parent.name == folder:
            found.setdefault(config.parent.name, config.parent)
    return found


@dataclass
class Job:
    """Một lần chạy: B6 (kiến trúc, hạt giống) hoặc B7 (thí nghiệm, kiến trúc, hạt giống, tỉ lệ dữ liệu)."""

    step: str  # "b06" | "b07"
    arch: str
    seed: int
    exp: str | None = None
    fraction: float | None = None
    timm: str | None = None  # tên trọng số timm, để máy trên mây tải trước một lần
    extra: list[str] = field(default_factory=list)

    @property
    def name(self) -> str:
        return b6_name(self.arch, self.seed) if self.step == "b06" else b7_name(self.exp or "", self.arch, self.seed, self.fraction)

    @property
    def cost(self) -> float:
        """Thời gian tương đối (1 = một lần chạy đủ dữ liệu); lần chạy A6 tỉ lệ với lượng ảnh train."""
        return self.fraction or 1.0

    def args(self) -> list[str]:
        if self.step == "b06":
            return ["ml/scripts/b06_huan_luyen.py", "--arch", self.arch, "--seed", str(self.seed), *self.extra]
        return ["ml/scripts/b07_thi_nghiem_phu.py", "--arch", self.arch, "--exp", self.exp or "", "--seed", str(self.seed),
                *(["--fraction", str(self.fraction)] if self.fraction else []), *self.extra]

    def to_json(self) -> dict:
        return {"step": self.step, "arch": self.arch, "seed": self.seed, "exp": self.exp, "fraction": self.fraction, "timm": self.timm,
                "name": self.name, "args": self.args()}


def split_b7(jobs: list[Job], cloud_gpus: int) -> tuple[list[Job], list[Job]]:
    """Chia việc B7 giữa máy này và Kaggle (`cloud_gpus` GPU chạy song song) để hai bên xong gần cùng lúc.

    Tham lam theo thời gian dự kiến: việc nặng trước, mỗi việc giao cho bên sẽ rảnh sớm nhất. Máy này tính là 1 GPU
    cùng tốc độ với một GPU trên mây (đo ở B6: T4 và RTX A2000 Laptop gần nhau khi đọc ảnh là nút thắt).
    Trả (việc của máy này, việc của Kaggle).
    """
    if cloud_gpus <= 0:
        return list(jobs), []
    loads = [0.0] * (1 + cloud_gpus)  # 0 = máy này
    owner: dict[int, int] = {}
    order = sorted(range(len(jobs)), key=lambda i: (-jobs[i].cost, i))
    for i in order:
        target = min(range(len(loads)), key=lambda k: (loads[k], k))
        loads[target] += jobs[i].cost
        owner[i] = target
    local = [jobs[i] for i in range(len(jobs)) if owner[i] == 0]
    cloud = [jobs[i] for i in range(len(jobs)) if owner[i] != 0]
    return local, cloud


def kaggle_script(template: str, jobs: list[Job], commit: str) -> str:
    """Điền danh sách việc và mã commit vào mẫu `ml/cloud/kaggle_chay.py`."""
    if "__JOBS__" not in template or "__COMMIT__" not in template:
        raise ValueError("Mẫu script Kaggle thiếu chỗ điền __JOBS__ hoặc __COMMIT__")
    payload = json.dumps([j.to_json() for j in jobs], ensure_ascii=False)
    return template.replace("__JOBS__", repr(payload)).replace("__COMMIT__", commit)
