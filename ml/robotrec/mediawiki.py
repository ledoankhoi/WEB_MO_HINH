"""Truy vấn MediaWiki API (TFWiki 1.19, fandom 1.43) cho B1 và B2.

- Cache trên đĩa: cùng một yêu cầu chỉ gửi một lần; chạy lại cho cùng kết quả. Cache ghi cả thời điểm lấy.
- Lịch sự với máy chủ: tối thiểu `min_interval` giây giữa hai yêu cầu tới cùng một wiki; thử lại theo backoff mũ khi
  lỗi mạng, 429 hoặc 5xx.
- Hỗ trợ cả hai kiểu phân trang: `query-continue` (MediaWiki cũ) và `continue` (từ 1.21).
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

USER_AGENT = "RoboticaThesisResearch/0.1 (robot recognition dataset; github.com/ledoankhoi/WEB_MO_HINH)"


@dataclass
class RequestStats:
    sent: int = 0
    cached: int = 0
    retries: int = 0
    seconds: float = 0.0


@dataclass
class MediaWiki:
    api: str
    cache_dir: Path
    min_interval: float = 0.5
    timeout: float = 30.0
    max_retries: int = 5
    stats: RequestStats = field(default_factory=RequestStats)
    _last: float = 0.0
    _session: requests.Session | None = None

    # Tầng thấp -----------------------------------------------------------------------------------------------

    def _cache_path(self, params: dict[str, Any]) -> Path:
        key = json.dumps({"api": self.api, **params}, sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
        return self.cache_dir / digest[:2] / f"{digest}.json"

    def get(self, params: dict[str, Any]) -> dict[str, Any]:
        params = {**params, "format": "json"}
        path = self._cache_path(params)
        if path.exists():
            self.stats.cached += 1
            return json.loads(path.read_text(encoding="utf-8"))["response"]
        if self._session is None:
            self._session = requests.Session()
            self._session.headers["User-Agent"] = USER_AGENT
        delay = 2.0
        for attempt in range(self.max_retries + 1):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            started = time.monotonic()
            try:
                # `timeout` của requests chỉ giới hạn từng lần chờ dữ liệu; máy chủ trả từng chút một vẫn có thể giữ kết nối
                # rất lâu (đã gặp một yêu cầu treo 69 phút ở lần chạy đầu của B1). Đọc theo khối và tự cắt khi quá hạn tổng.
                response = self._session.get(self.api, params=params, timeout=(10, self.timeout), stream=True)
                chunks: list[bytes] = []
                for chunk in response.iter_content(65536):
                    chunks.append(chunk)
                    if time.monotonic() - started > 2 * self.timeout:
                        response.close()
                        raise requests.Timeout(f"quá {2 * self.timeout:.0f} giây")
                self._last = time.monotonic()
                self.stats.seconds += self._last - started
                if response.status_code == 429 or response.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {response.status_code}")
                response.raise_for_status()
                data = json.loads(b"".join(chunks).decode(response.encoding or "utf-8"))
                break
            except (requests.RequestException, ValueError):
                self._last = time.monotonic()
                if attempt == self.max_retries:
                    raise
                self.stats.retries += 1
                time.sleep(delay)
                delay *= 2
        self.stats.sent += 1
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"fetched_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "params": params, "response": data}
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return data

    def query_pages(self, params: dict[str, Any], max_pages: int | None = None) -> Iterator[dict[str, Any]]:
        """Lặp qua mọi trang kết quả của một truy vấn `action=query`, theo cả hai kiểu phân trang."""
        params = {"action": "query", **params}
        pages = 0
        extra: dict[str, Any] = {}
        while True:
            data = self.get({**params, **extra})
            if "error" in data:
                raise RuntimeError(f"{self.api}: {data['error']}")
            yield data
            pages += 1
            if max_pages is not None and pages >= max_pages:
                return
            if "continue" in data:
                extra = dict(data["continue"])
            elif "query-continue" in data:
                extra = {}
                for module in data["query-continue"].values():
                    extra.update(module)
            else:
                return

    # Tầng cao ------------------------------------------------------------------------------------------------

    def category_members(self, category: str, namespace: int = 0) -> list[str]:
        titles: list[str] = []
        for data in self.query_pages(
            {"list": "categorymembers", "cmtitle": f"Category:{category}", "cmnamespace": namespace, "cmlimit": 500, "cmtype": "page"}
        ):
            titles += [item["title"] for item in data.get("query", {}).get("categorymembers", [])]
        return titles

    def _pages(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        pages = data.get("query", {}).get("pages", {})
        return list(pages.values()) if isinstance(pages, dict) else list(pages)

    def resolve(self, titles: Iterable[str]) -> dict[str, str | None]:
        """Tên trang → tên trang thật sau khi chuẩn hoá và theo chuyển hướng; trang không có → None."""
        result: dict[str, str | None] = {}
        for batch in _batches(list(dict.fromkeys(titles)), 50):
            data = self.get({"action": "query", "titles": "|".join(batch), "redirects": 1})
            query = data.get("query", {})
            mapping = {title: title for title in batch}
            for item in query.get("normalized", []):
                for title, current in mapping.items():
                    if current == item["from"]:
                        mapping[title] = item["to"]
            for item in query.get("redirects", []):
                for title, current in mapping.items():
                    if current == item["from"]:
                        mapping[title] = item["to"]
            missing = {page["title"] for page in self._pages(data) if "missing" in page or "invalid" in page}
            for title, current in mapping.items():
                result[title] = None if current in missing else current
        return result

    def page_lengths(self, titles: Iterable[str]) -> dict[str, int]:
        lengths: dict[str, int] = {}
        for batch in _batches(list(dict.fromkeys(titles)), 50):
            data = self.get({"action": "query", "prop": "info", "titles": "|".join(batch)})
            for page in self._pages(data):
                if "missing" not in page and "length" in page:
                    lengths[page["title"]] = int(page["length"])
        return lengths

    def wikitexts(self, titles: Iterable[str]) -> dict[str, str]:
        texts: dict[str, str] = {}
        for batch in _batches(list(dict.fromkeys(titles)), 50):
            data = self.get({"action": "query", "prop": "revisions", "rvprop": "content", "titles": "|".join(batch)})
            for page in self._pages(data):
                revisions = page.get("revisions") or []
                if not revisions:
                    continue
                revision = revisions[0]
                text = revision.get("*")
                if text is None and "slots" in revision:
                    slot = revision["slots"].get("main", {})
                    text = slot.get("*", slot.get("content"))
                if text is not None:
                    texts[page["title"]] = text
        return texts

    def page_categories(self, titles: Iterable[str]) -> dict[str, list[str]]:
        categories: dict[str, list[str]] = {}
        for batch in _batches(list(dict.fromkeys(titles)), 50):
            for data in self.query_pages({"prop": "categories", "titles": "|".join(batch), "cllimit": 500}):
                for page in self._pages(data):
                    names = [item["title"].split(":", 1)[1] for item in page.get("categories", [])]
                    categories.setdefault(page["title"], []).extend(names)
        return categories

    def backlink_count(self, title: str, cap_pages: int = 4) -> tuple[int, bool]:
        """Số trang ở không gian chính liên kết tới `title`, kể cả qua trang chuyển hướng.

        Dừng sau `cap_pages` trang kết quả (500 liên kết mỗi trang); trả về (số đếm, có bị chặn trần không).
        """
        count = 0
        pages = 0
        capped = False
        # blredirect=1: trang chuyển hướng tới `title` được liệt kê (có cờ "redirect") kèm các trang liên kết tới nó
        # trong "redirlinks". Đếm trang thường + mọi redirlinks; bản thân trang chuyển hướng không tính.
        for data in self.query_pages(
            {"list": "backlinks", "bltitle": title, "blnamespace": 0, "bllimit": 500, "blredirect": 1},
            max_pages=cap_pages,
        ):
            pages += 1
            for item in data.get("query", {}).get("backlinks", []):
                if "redirect" not in item:
                    count += 1
                count += len(item.get("redirlinks", []))
            if pages >= cap_pages and ("continue" in data or "query-continue" in data):
                capped = True
        return count, capped

    def image_urls(self, files: Iterable[str]) -> dict[str, str]:
        urls: dict[str, str] = {}
        names = [name if name.startswith("File:") else f"File:{name}" for name in files]
        for batch in _batches(list(dict.fromkeys(names)), 50):
            data = self.get({"action": "query", "prop": "imageinfo", "iiprop": "url", "titles": "|".join(batch), "redirects": 1})
            query = data.get("query", {})
            back = {item["to"]: item["from"] for item in query.get("normalized", [])}
            for page in self._pages(data):
                info = page.get("imageinfo") or []
                if info:
                    urls[back.get(page["title"], page["title"])] = info[0]["url"]
                    urls[page["title"]] = info[0]["url"]
        return urls

    def page_images(self, titles: Iterable[str]) -> dict[str, str]:
        """Ảnh đại diện trang (phần mở rộng PageImages, có trên fandom). Wiki không có phần mở rộng thì trả về rỗng."""
        urls: dict[str, str] = {}
        for batch in _batches(list(dict.fromkeys(titles)), 50):
            data = self.get({"action": "query", "prop": "pageimages", "piprop": "original", "titles": "|".join(batch)})
            for page in self._pages(data):
                original = page.get("original") or {}
                if original.get("source"):
                    urls[page["title"]] = original["source"]
        return urls

    def search(self, text: str, limit: int = 5) -> list[str]:
        data = self.get({"action": "query", "list": "search", "srsearch": text, "srlimit": limit, "srnamespace": 0})
        return [item["title"] for item in data.get("query", {}).get("search", [])]


def _batches(items: list[str], size: int) -> Iterator[list[str]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]
