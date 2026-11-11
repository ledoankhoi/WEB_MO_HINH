"""Giữ máy không tự ngủ trong lúc chạy các bước dài (Windows).

Lần chạy đầu của B0/B1 (07/11/2026) bị gián đoạn 68,5 phút vì máy vào Modern Standby (nhật ký Kernel-Power 506/507):
một bước huấn luyện và một yêu cầu MediaWiki kéo dài đúng bằng khoảng ngủ. `SetThreadExecutionState` báo cho Windows là
tiến trình đang cần hệ thống, nên máy không tự ngủ khi không có thao tác. Gập màn hình hoặc bấm nút nguồn thì máy vẫn ngủ.
Trên Linux/Colab hàm này không làm gì.
"""

from __future__ import annotations

import sys
from contextlib import contextmanager
from collections.abc import Iterator

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


@contextmanager
def keep_awake() -> Iterator[bool]:
    if sys.platform != "win32":
        yield False
        return
    import ctypes

    kernel = ctypes.windll.kernel32
    ok = bool(kernel.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED))
    try:
        yield ok
    finally:
        kernel.SetThreadExecutionState(ES_CONTINUOUS)
