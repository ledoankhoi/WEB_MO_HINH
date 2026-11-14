"""Giữ máy không tự ngủ trong lúc chạy các bước dài (Windows).

Lần chạy đầu của B0/B1 (07/11/2026) bị gián đoạn 68,5 phút vì máy vào Modern Standby (nhật ký Kernel-Power 506/507):
một bước huấn luyện và một yêu cầu MediaWiki kéo dài đúng bằng khoảng ngủ. `SetThreadExecutionState` báo cho Windows là
tiến trình đang cần hệ thống.

Chỉ báo "cần hệ thống" (ES_SYSTEM_REQUIRED) là chưa đủ trên máy Modern Standby: màn hình vẫn tự tắt khi không có thao tác,
và màn hình tắt thì máy vào ngủ chờ, Windows tạm dừng chương trình desktop. Huấn luyện B6 đứng yên gần 14 giờ đêm 13/11 vì vậy.
Nên báo thêm "cần màn hình" (ES_DISPLAY_REQUIRED): màn hình không tự tắt, máy không vào ngủ chờ. Gập màn hình hoặc bấm nút
nguồn thì máy vẫn ngủ. Trên Linux/Colab hàm này không làm gì.
"""

from __future__ import annotations

import sys
from contextlib import contextmanager
from collections.abc import Iterator

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002


@contextmanager
def keep_awake(display: bool = True) -> Iterator[bool]:
    if sys.platform != "win32":
        yield False
        return
    import ctypes

    kernel = ctypes.windll.kernel32
    flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | (ES_DISPLAY_REQUIRED if display else 0)
    ok = bool(kernel.SetThreadExecutionState(flags))
    try:
        yield ok
    finally:
        kernel.SetThreadExecutionState(ES_CONTINUOUS)
