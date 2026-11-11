import hashlib
import io
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from robotrec.fetch import normalize_image  # noqa: E402


def png_bytes(size, mode="RGBA", color=(255, 0, 0, 0)):
    buffer = io.BytesIO()
    Image.new(mode, size, color).save(buffer, "PNG")
    return buffer.getvalue()


def test_normalize_transparent_png_to_white_jpeg(tmp_path):
    data = png_bytes((1200, 600))
    result = normalize_image(data, tmp_path / "a.jpg", max_side=512)
    assert result.status == "ok"
    assert result.sha1 == hashlib.sha1(data).hexdigest()
    assert (result.width, result.height) == (1200, 600)
    with Image.open(tmp_path / "a.jpg") as image:
        assert image.mode == "RGB"
        assert max(image.size) == 512
        assert image.getpixel((10, 10))[0] > 250  # nền trong suốt thành trắng


def test_normalize_rejects_small_and_broken(tmp_path):
    assert normalize_image(png_bytes((20, 400), "RGB", (0, 0, 0)), tmp_path / "s.jpg").status == "too_small"
    assert normalize_image(b"not an image at all", tmp_path / "b.jpg").status == "decode_error"


def test_interleave_alternates_and_dedupes():
    from b02_thu_anh import interleave

    wiki = [{"url": "a"}, {"url": "b"}, {"url": "c"}]
    ddg = [{"url": "x"}, {"url": "a"}]
    assert [item["url"] for item in interleave(wiki, ddg)] == ["a", "x", "b", "c"]


def test_queries_follow_franchise_templates():
    from b02_thu_anh import queries_for

    cfg = {
        "queries": {"transformers": ["{name} transformers {kw}", "{name} transformers {kw} {medium}"], "sentai": ["{name}", "{alias} super sentai"]},
        "tf_keywords": {"g1": {"kw": "G1", "medium": "cartoon"}},
    }
    tf = {"franchise": "transformers", "group": "g1", "name": "Groove", "aliases": [], "series": "Generation 1"}
    assert queries_for(tf, cfg) == ["Groove transformers G1", "Groove transformers G1 cartoon"]
    sentai = {"franchise": "sentai", "group": "sentai", "name": "Dino Megazord", "aliases": [], "series": "x"}
    assert queries_for(sentai, cfg) == ["Dino Megazord"]  # không có tên khác thì bỏ mẫu có {alias}


def test_extra_queries_come_first_and_are_not_repeated():
    from b02_thu_anh import queries_for

    cfg = {
        "queries": {"sentai": ["{name}", "{name} toy"]},
        "extra_queries": {"sentai-thunder-megazord-ninja-storm": ["Gouraijin Hurricaneger", "Thunder Megazord toy"]},
    }
    robot = {"slug": "sentai-thunder-megazord-ninja-storm", "franchise": "sentai", "group": "sentai", "name": "Thunder Megazord", "aliases": [], "series": "x"}
    assert queries_for(robot, cfg) == ["Gouraijin Hurricaneger", "Thunder Megazord toy", "Thunder Megazord"]
    other = {**robot, "slug": "sentai-khac"}
    assert queries_for(other, cfg) == ["Thunder Megazord", "Thunder Megazord toy"]
