"""Thông tin môi trường chạy, in ở đầu mỗi báo cáo (mục 6, phần "Công cụ và môi trường")."""

from __future__ import annotations

import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from importlib import metadata
from typing import Any

from .config import REPO_ROOT

# Thư viện in phiên bản trong báo cáo (chỉ những thư viện đã cài).
TRACKED_PACKAGES = [
    "numpy",
    "pandas",
    "scipy",
    "scikit-learn",
    "matplotlib",
    "torch",
    "torchvision",
    "timm",
    "open_clip_torch",
    "transformers",
    "Pillow",
    "ImageHash",
    "mwparserfromhell",
    "rapidfuzz",
    "requests",
    "ddgs",
    "onnx",
    "onnxruntime",
]


def _run(args: list[str]) -> str | None:
    try:
        return subprocess.run(args, cwd=REPO_ROOT, capture_output=True, text=True, timeout=20, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def git_info() -> dict[str, Any]:
    commit = _run(["git", "rev-parse", "HEAD"])
    status = _run(["git", "status", "--porcelain"])
    return {"commit": commit, "short": commit[:7] if commit else None, "dirty": bool(status)}


def package_versions(names: list[str] | None = None) -> dict[str, str]:
    versions: dict[str, str] = {}
    for name in names or TRACKED_PACKAGES:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            continue
    return versions


def _cpu_name() -> str:
    if sys.platform == "win32":
        name = _run(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"])
        if name:
            return name
    if os.path.exists("/proc/cpuinfo"):
        with open("/proc/cpuinfo", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
    return platform.processor() or platform.machine()


def _ram_gb() -> float | None:
    try:
        if sys.platform == "win32":
            import ctypes

            class MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            status = MemoryStatus()
            status.dwLength = ctypes.sizeof(MemoryStatus)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
            return round(status.ullTotalPhys / 1024**3, 1)
        pages = os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE")
        return round(pages / 1024**3, 1)
    except (AttributeError, OSError, ValueError):
        return None


def gpu_info() -> dict[str, Any]:
    """GPU nhìn từ PyTorch (nếu đã cài) và từ nvidia-smi."""
    info: dict[str, Any] = {"torch_cuda": False, "devices": []}
    try:
        import torch

        info["torch_cuda"] = torch.cuda.is_available()
        info["torch_cuda_version"] = torch.version.cuda
        info["cudnn"] = torch.backends.cudnn.version() if torch.cuda.is_available() else None
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            info["devices"].append(
                {"name": props.name, "memory_gb": round(props.total_memory / 1024**3, 1), "capability": f"{props.major}.{props.minor}"}
            )
    except ImportError:
        pass
    smi = _run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"])
    if smi:
        info["nvidia_smi"] = [line.strip() for line in smi.splitlines() if line.strip()]
    return info


def _os_name() -> str:
    # platform.release() trả "10" cả trên Windows 11; Windows 11 có số build từ 22000.
    if platform.system() == "Windows":
        build = platform.version().split(".")[-1]
        name = "Windows 11" if build.isdigit() and int(build) >= 22000 else f"Windows {platform.release()}"
        return f"{name} (build {platform.version()}, {platform.machine()})"
    return f"{platform.system()} {platform.release()} ({platform.machine()})"


def environment() -> dict[str, Any]:
    return {
        "time_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "os": _os_name(),
        "cpu": _cpu_name(),
        "cpu_count": os.cpu_count(),
        "ram_gb": _ram_gb(),
        "colab": "COLAB_RELEASE_TAG" in os.environ or "google.colab" in sys.modules,
        "gpu": gpu_info(),
        "packages": package_versions(),
        "git": git_info(),
        "data_root_env": os.environ.get("ROBOTREC_DATA"),
    }
