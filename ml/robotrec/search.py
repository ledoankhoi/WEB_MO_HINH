"""Tìm ảnh bằng DuckDuckGo (thư viện ddgs), có cache trên đĩa để chạy lại cho cùng kết quả (B2)."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ImageSearch:
    def __init__(self, cache_dir: Path, delay: float = 2.0, safesearch: str = "moderate", max_retries: int = 4) -> None:
        self.cache_dir = cache_dir
        self.delay = delay
        self.safesearch = safesearch
        self.max_retries = max_retries
        self._last = 0.0
        self.sent = 0
        self.cached = 0
        self.errors = 0

    def _path(self, query: str, page: int) -> Path:
        digest = hashlib.sha1(f"ddg|{self.safesearch}|{query}|{page}".encode("utf-8")).hexdigest()
        return self.cache_dir / digest[:2] / f"{digest}.json"

    def images(self, query: str, page: int = 1) -> list[dict[str, Any]]:
        """Một trang kết quả (khoảng 35 ảnh): mỗi phần tử có image (URL ảnh), url (trang chứa ảnh), title, width, height."""
        path = self._path(query, page)
        if path.exists():
            self.cached += 1
            return json.loads(path.read_text(encoding="utf-8"))["results"]
        from ddgs import DDGS

        delay = self.delay
        for attempt in range(self.max_retries + 1):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            try:
                results = DDGS().images(query, safesearch=self.safesearch, max_results=100, page=page)
                self._last = time.monotonic()
                break
            except Exception as error:  # ddgs ném nhiều loại lỗi (giới hạn tốc độ, hết thời gian, không có kết quả)
                self._last = time.monotonic()
                if "No results" in str(error):
                    results = []
                    break
                self.errors += 1
                if attempt == self.max_retries:
                    return []
                time.sleep(delay * 5)
                delay *= 2
        self.sent += 1
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"fetched_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "query": query, "page": page, "results": results}
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return results
