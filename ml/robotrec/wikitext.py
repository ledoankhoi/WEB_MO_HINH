"""Xử lý wikitext: tách infobox, lấy đoạn mô tả, tên file ảnh, chuẩn hoá tên để so khớp."""

from __future__ import annotations

import re
import unicodedata

import mwparserfromhell

_SLUG = re.compile(r"[^a-z0-9]+")
_SPACES = re.compile(r"\s+")


def ascii_fold(text: str) -> str:
    """Bỏ dấu (kể cả tiếng Việt, chữ đ) và ký tự không phải ASCII."""
    text = text.replace("đ", "d").replace("Đ", "D")
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def slugify(text: str) -> str:
    return _SLUG.sub("-", ascii_fold(text).lower()).strip("-")


def normalize_name(text: str) -> str:
    """Tên để so khớp: bỏ dấu, viết thường, chỉ giữ chữ và số, gộp khoảng trắng."""
    return _SPACES.sub(" ", _SLUG.sub(" ", ascii_fold(text).lower())).strip()


def infobox(wikitext: str, names: tuple[str, ...]) -> dict[str, str] | None:
    """Tham số của template đầu tiên có tên thuộc `names` (so không phân biệt hoa thường), giá trị là wikitext thô."""
    wanted = {name.lower() for name in names}
    code = mwparserfromhell.parse(wikitext)
    for template in code.filter_templates(recursive=False):
        if str(template.name).strip().lower() in wanted:
            return {str(param.name).strip(): str(param.value).strip() for param in template.params}
    return None


def plain(value: str) -> str:
    """Wikitext → chữ thường: bỏ template, thẻ, liên kết file; giữ chữ của liên kết."""
    code = mwparserfromhell.parse(value)
    for template in code.filter_templates(recursive=False):
        try:
            code.remove(template)
        except ValueError:
            pass
    text = code.strip_code(normalize=True, collapse=True)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("'''", "").replace("''", "")
    return _SPACES.sub(" ", text).strip()


def first_list_item(value: str) -> str | None:
    """Mục đầu tiên của một trường infobox nhiều giá trị (cách nhau bằng dấu phẩy, <br>, xuống dòng, dấu *)."""
    text = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    for part in re.split(r"[\n,*]", plain_keep_lines(text)):
        part = re.sub(r"\[[^\]]*\]", "", part).strip(" ;:-")
        if part:
            return part
    return None


def plain_keep_lines(value: str) -> str:
    code = mwparserfromhell.parse(value)
    return code.strip_code(normalize=True, collapse=False)


_FILE_LINK = re.compile(r"\[\[\s*(?:File|Image)\s*:\s*([^|\]]+)", re.I)


def first_file(wikitext: str) -> str | None:
    match = _FILE_LINK.search(wikitext)
    return match.group(1).strip() if match else None


def image_field(value: str | None) -> str | None:
    """Tên file từ trường `image` của infobox (có thể kèm ';Nhãn', nhiều dòng, hoặc [[File:..]])."""
    if not value:
        return None
    linked = first_file(value)
    if linked:
        return linked
    first = value.strip().splitlines()[0].split(";")[0].split("|")[0].strip()
    return first or None


def description(wikitext: str, max_chars: int = 600) -> str | None:
    """Đoạn mô tả: đoạn văn xuôi đầu tiên đủ dài (sau khi bỏ template, file, tiêu đề), cắt ở ranh giới câu."""
    code = mwparserfromhell.parse(wikitext)
    for template in code.filter_templates(recursive=False):
        try:
            code.remove(template)
        except ValueError:
            pass
    text = str(code)
    # Liên kết file/category, kể cả khi chú thích có liên kết lồng một cấp: [[File:a.jpg|thumb|xem [[B]]]]
    text = re.sub(r"\[\[\s*(?:File|Image|Category)\s*:(?:[^\[\]]|\[\[[^\[\]]*\]\])*\]\]", "", text, flags=re.I)
    text = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", text, flags=re.I | re.S)
    text = re.sub(r"<tabber>.*?</tabber>", "", text, flags=re.I | re.S)
    for block in re.split(r"\n\s*\n|\n(?===)", text):
        # Bỏ từng dòng không phải văn xuôi (tiêu đề, bảng, danh sách, thụt lề, thẻ) nhưng giữ các dòng còn lại của khối:
        # ở TFWiki dòng tóm tắt ":''…''", ảnh và đoạn văn đầu nằm liền nhau trong cùng một khối.
        lines = [line for line in block.strip().splitlines() if line.strip() and not line.lstrip().startswith(("=", "{|", "|", "!", "*", "#", ":", ";", "<", "}"))]
        if not lines:
            continue
        prose = plain("\n".join(lines))
        if len(prose) >= 60:
            return _truncate(prose, max_chars)
    return None


def italic_summary(wikitext: str) -> str | None:
    """Dòng tóm tắt in nghiêng đầu trang kiểu TFWiki: `:''X is the Autobot leader from the ... family.''`."""
    for line in wikitext.splitlines()[:15]:
        line = line.strip()
        if line.startswith(":''") and len(line) > 10:
            return plain(line.lstrip(":"))
    return None


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return (cut[: end + 1] if end > max_chars // 3 else cut.rsplit(" ", 1)[0] + "…").strip()
