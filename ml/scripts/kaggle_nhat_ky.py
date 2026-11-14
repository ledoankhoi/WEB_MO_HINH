"""In nhật ký của lần chạy Kaggle đang chạy (hoặc vừa xong) trong tối đa N giây, dạng UTF-8. Chạy bằng ml/.venv-cloud.

  ml/.venv-cloud/Scripts/python ml/scripts/kaggle_nhat_ky.py robotica-b06 [giây]
"""

from __future__ import annotations

import sys
import threading

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def main() -> None:
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    kernel = f"{api.get_config_value(api.CONFIG_NAME_USER)}/{sys.argv[1]}"
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 60
    lines: list[str] = []

    def follow() -> None:
        try:
            for event in api.kernels_logs_stream(kernel):
                text = str(event.get("data", ""))
                if text:
                    lines.append(text.rstrip("\n"))
        except Exception as error:  # noqa: BLE001
            lines.append(f"(lỗi đọc nhật ký: {error})")

    thread = threading.Thread(target=follow, daemon=True)
    thread.start()
    thread.join(seconds)
    print("\n".join(lines[-40:]) if lines else "(chưa có dòng nhật ký nào)")


if __name__ == "__main__":
    main()
