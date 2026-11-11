"""Cố định hạt giống để chạy lại cho cùng kết quả (kế hoạch B0, mục 7.1)."""

from __future__ import annotations

import os
import random


def set_seed(seed: int, deterministic: bool = True) -> None:
    """Đặt hạt giống cho random, numpy và torch (nếu đã cài).

    `deterministic=True` bật cuDNN tất định và tắt benchmark: chậm hơn một chút nhưng cùng hạt giống cho cùng
    kết quả trên cùng phần cứng. Khác GPU hoặc khác phiên bản thư viện vẫn có thể lệch nhỏ, nên phương sai giữa
    các lần chạy được đo bằng nhiều hạt giống chứ không dựa vào một lần chạy.
    """
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    try:
        import numpy as np

        np.random.seed(seed)
    except ImportError:
        pass
    try:
        import torch
    except ImportError:
        return
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    if deterministic:
        os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
        torch.use_deterministic_algorithms(True, warn_only=True)
