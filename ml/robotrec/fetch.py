"""Tải ảnh lịch sự và chuẩn hoá (B2).

- Giới hạn tốc độ theo máy chủ: tối thiểu `per_host_interval` giây giữa hai yêu cầu tới cùng một host, dù chạy nhiều luồng.
- Tôn trọng robots.txt của từng host (đọc một lần, lưu trong bộ nhớ); không đọc được robots.txt thì coi là cho phép.
- Thử lại khi lỗi mạng, HTTP 429 hoặc 5xx, backoff mũ.
- Ảnh: đọc bằng Pillow, lấy khung đầu của ảnh động, ghép nền trắng cho ảnh trong suốt, chuyển RGB, thu cạnh dài về
  `max_side` (LANCZOS), lưu JPEG. sha1 tính trên byte gốc tải về (để phát hiện trùng tuyệt đối ở B3).
"""

from __future__ import annotations

import hashlib
import io
import threading
import time
import urllib.robotparser
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import requests
from PIL import Image, ImageFile, UnidentifiedImageError

ImageFile.LOAD_TRUNCATED_IMAGES = False
Image.MAX_IMAGE_PIXELS = 80_000_000  # ảnh lớn hơn coi như "bom giải nén" và bỏ

USER_AGENT = "Mozilla/5.0 (compatible; RoboticaThesisResearch/0.1; +https://github.com/ledoankhoi/WEB_MO_HINH)"


@dataclass
class FetchResult:
    status: str  # ok | http_4xx | http_5xx | timeout | network | not_image | decode_error | too_large | too_small | robots | blocked_host
    detail: str = ""
    sha1: str | None = None
    width: int | None = None
    height: int | None = None
    bytes: int | None = None
    seconds: float = 0.0
    path: Path | None = None


class Fetcher:
    def __init__(self, per_host_interval: float = 1.0, timeout: tuple[float, float] = (10, 20), retries: int = 2,
                 max_bytes: int = 20_000_000, respect_robots: bool = True, host_intervals: dict[str, float] | None = None,
                 blocked_hosts: list[str] | None = None) -> None:
        self.per_host_interval = per_host_interval
        self.host_intervals = host_intervals or {}
        self.blocked_hosts = set(blocked_hosts or [])
        self._robot_locks: dict[str, threading.Lock] = {}
        self.timeout = timeout
        self.retries = retries
        self.max_bytes = max_bytes
        self.respect_robots = respect_robots
        self._local = threading.local()
        self._host_lock = threading.Lock()
        self._host_next: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._robots_lock = threading.Lock()

    def _session(self) -> requests.Session:
        if not hasattr(self._local, "session"):
            session = requests.Session()
            session.headers["User-Agent"] = USER_AGENT
            session.headers["Accept"] = "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5"
            self._local.session = session
        return self._local.session

    def _wait_host(self, host: str) -> None:
        """Giữ chỗ một khe thời gian cho host rồi ngủ tới khe đó (các luồng khác lấy khe kế tiếp)."""
        with self._host_lock:
            now = time.monotonic()
            slot = max(now, self._host_next.get(host, 0.0))
            self._host_next[host] = slot + self.host_intervals.get(host, self.per_host_interval)
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)

    def allowed(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        parts = urlsplit(url)
        base = f"{parts.scheme}://{parts.netloc}"
        # Mỗi host một khoá: host chậm chỉ chặn các luồng cùng host, không chặn cả bộ tải.
        with self._robots_lock:
            lock = self._robot_locks.setdefault(base, threading.Lock())
        with lock:
            if base not in self._robots:
                parser: urllib.robotparser.RobotFileParser | None = None
                try:
                    self._wait_host(parts.netloc)
                    response = self._session().get(f"{base}/robots.txt", timeout=(5, 10))
                    if response.status_code == 200:
                        parser = urllib.robotparser.RobotFileParser()
                        parser.parse(response.text.splitlines())
                except requests.RequestException:
                    parser = None
                self._robots[base] = parser
            parser = self._robots[base]
        return parser is None or parser.can_fetch(USER_AGENT, url)

    def download(self, url: str) -> tuple[bytes | None, FetchResult]:
        started = time.monotonic()
        if not url.startswith(("http://", "https://")):
            return None, FetchResult("network", "URL không hợp lệ")
        host = urlsplit(url).netloc.lower()
        if host in self.blocked_hosts or any(host.endswith(f".{blocked}") for blocked in self.blocked_hosts):
            return None, FetchResult("blocked_host", "host trong danh sách không truy cập")
        if not self.allowed(url):
            return None, FetchResult("robots", "robots.txt không cho phép", seconds=time.monotonic() - started)
        host = urlsplit(url).netloc
        delay = 2.0
        for attempt in range(self.retries + 1):
            self._wait_host(host)
            try:
                response = self._session().get(url, timeout=self.timeout, stream=True)
                code = response.status_code
                if code == 429 or code >= 500:
                    response.close()
                    if attempt < self.retries:
                        time.sleep(delay)
                        delay *= 2
                        continue
                    return None, FetchResult("http_5xx" if code >= 500 else "http_4xx", f"HTTP {code}", seconds=time.monotonic() - started)
                if code >= 400:
                    response.close()
                    return None, FetchResult("http_4xx", f"HTTP {code}", seconds=time.monotonic() - started)
                kind = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
                if kind and not kind.startswith("image/") and kind not in ("application/octet-stream", "binary/octet-stream"):
                    response.close()
                    return None, FetchResult("not_image", kind, seconds=time.monotonic() - started)
                chunks, size = [], 0
                for chunk in response.iter_content(65536):
                    chunks.append(chunk)
                    size += len(chunk)
                    if size > self.max_bytes:
                        response.close()
                        return None, FetchResult("too_large", f"> {self.max_bytes} byte", seconds=time.monotonic() - started)
                    if time.monotonic() - started > 2 * sum(self.timeout):
                        response.close()
                        raise requests.Timeout("quá thời gian tổng")
                return b"".join(chunks), FetchResult("ok", seconds=time.monotonic() - started)
            except requests.Timeout:
                # Máy chủ đã chậm tới mức hết thời gian thì thử lại hầu như cũng hết thời gian: bỏ luôn để không giữ luồng tải.
                return None, FetchResult("timeout", seconds=time.monotonic() - started)
            except requests.RequestException as error:
                status = "network"
                detail = type(error).__name__
            if attempt < self.retries:
                time.sleep(delay)
                delay *= 2
                continue
            return None, FetchResult(status, detail if status == "network" else "", seconds=time.monotonic() - started)
        return None, FetchResult("network", "hết lượt thử", seconds=time.monotonic() - started)


def normalize_image(data: bytes, target: Path, max_side: int = 512, quality: int = 90, min_side: int = 32) -> FetchResult:
    """Byte ảnh → JPEG RGB cạnh dài ≤ max_side tại `target` (đặt tên theo sha1 của byte gốc)."""
    sha1 = hashlib.sha1(data).hexdigest()
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.seek(0)
            width, height = image.size
            if min(width, height) < min_side:
                return FetchResult("too_small", f"{width}×{height}", sha1=sha1, width=width, height=height, bytes=len(data))
            frame = image.convert("RGBA") if image.mode in ("RGBA", "LA", "P", "PA") else image.convert("RGB")
            if frame.mode == "RGBA":
                background = Image.new("RGB", frame.size, (255, 255, 255))
                background.paste(frame, mask=frame.split()[-1])
                frame = background
            frame.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            target.parent.mkdir(parents=True, exist_ok=True)
            frame.save(target, "JPEG", quality=quality, optimize=True)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        return FetchResult("decode_error", type(error).__name__, sha1=sha1, bytes=len(data))
    return FetchResult("ok", sha1=sha1, width=width, height=height, bytes=len(data), path=target)
