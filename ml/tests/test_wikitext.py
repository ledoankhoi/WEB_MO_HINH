import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from robotrec.mediawiki import MediaWiki  # noqa: E402
from robotrec.wikitext import description, image_field, infobox, italic_summary, normalize_name, plain, slugify  # noqa: E402

TF = """{{factions|autobot|maximal}}
{{disambigm|Optimus Prime (disambiguation)}}
:''Optimus Prime is the [[Prime (rank)|Autobot leader]] from the [[Generation 1 continuity family]].''
[[File:Optimusg1.jpg|thumb|caption with [[link]]]]
'''Optimus Prime''' is the awe-inspiring [[Prime (rank)|leader]] of the [[Autobot]] forces. Selfless and valiant.<ref>x</ref>

==Fiction==
"""

GUNDAM = """{{Infobox/Mobile Weapon
|image=01. RX-78-2 Gundam.jpg ;Front
Rx-78-2.jpg;Front (Armed)
|english=RX-78-2 Gundam
|type=Suit
|era=Universal Century
}}
The '''RX-78-2 Gundam''' is a prototype mobile suit developed by the Earth Federation during the One Year War.
"""


def test_slug_and_normalize_fold_vietnamese():
    assert slugify("Bộ pháo tay Bumblebee") == "bo-phao-tay-bumblebee"
    assert slugify("transformers Optimus Prime (G1)") == "transformers-optimus-prime-g1"
    assert normalize_name("Đội  Hợp-thể") == "doi hop the"


def test_infobox_and_image_field():
    box = infobox(GUNDAM, ("Infobox/Mobile Weapon",))
    assert box is not None
    assert plain(box["type"]) == "Suit"
    assert image_field(box["image"]) == "01. RX-78-2 Gundam.jpg"
    assert infobox(GUNDAM, ("MegazordInfo",)) is None


def test_tf_summary_and_description():
    assert italic_summary(TF) == "Optimus Prime is the Autobot leader from the Generation 1 continuity family."
    text = description(TF)
    assert text.startswith("Optimus Prime is the awe-inspiring leader of the Autobot forces.")
    assert "<ref" not in text and "File:" not in text


def test_gundam_description():
    assert description(GUNDAM).startswith("The RX-78-2 Gundam is a prototype mobile suit")


def test_sentai_image_core():
    from b01_danh_muc import image_core

    assert image_core("KSZ-Daizyuzin.png") == "daizyuzin"
    assert image_core("HSGa-GaoKing.png") == "gaoking"
    assert image_core("NSK-Muteki Shogun.png") == "muteki shogun"
    assert image_core("Dino Megazord Profile.png") is None


def test_gundam_family_groups_variants_only():
    from b01_danh_muc import gundam_family

    zaku = {gundam_family(t) for t in ["MS-06F Zaku II", "MS-06S Char's Zaku II", "MS-06F-2 Zaku II F2 Type", "MS-06R-1A Zaku II High Mobility Type"]}
    assert zaku == {"ms-06|zaku"}
    assert gundam_family("MS-09R Rick Dom") == gundam_family("MS-09 Dom")
    assert gundam_family("XXXG-01W Wing Gundam") != gundam_family("XXXG-01D Gundam Deathscythe")
    assert gundam_family("GF13-017NJII God Gundam") != gundam_family("GF13-017NJ Shining Gundam")
    assert gundam_family("ZGMF-X10A Freedom Gundam") != gundam_family("ZGMF-X20A Strike Freedom Gundam")
    assert gundam_family("Death Beast") is None


def test_query_pages_follows_both_continuation_styles(tmp_path):
    wiki = MediaWiki("https://example.invalid/api.php", tmp_path)
    answers = {
        None: {"query": {"categorymembers": [{"title": "A"}]}, "query-continue": {"categorymembers": {"cmcontinue": "x"}}},
        "x": {"query": {"categorymembers": [{"title": "B"}]}, "continue": {"cmcontinue": "y", "continue": "-||"}},
        "y": {"query": {"categorymembers": [{"title": "C"}]}},
    }
    wiki.get = lambda params: answers[params.get("cmcontinue")]  # type: ignore[method-assign]
    assert wiki.category_members("Robots") == ["A", "B", "C"]


def test_backlink_count_counts_redirect_links_and_cap(tmp_path):
    wiki = MediaWiki("https://example.invalid/api.php", tmp_path)
    page = {"query": {"backlinks": [{"title": "P1"}, {"title": "Redirect", "redirect": "", "redirlinks": [{"title": "P2"}, {"title": "P3"}]}]}}
    wiki.get = lambda params: page  # type: ignore[method-assign]
    assert wiki.backlink_count("X") == (3, False)
    pages = {"query": {"backlinks": [{"title": "P"}]}, "continue": {"blcontinue": "n"}}
    wiki.get = lambda params: pages  # type: ignore[method-assign]
    assert wiki.backlink_count("X", cap_pages=2) == (2, True)


def test_clean_episode_markers():
    from b01_danh_muc import clean_episode

    assert clean_episode("Mobile Suit Zeta Gundam~1~50") == "Mobile Suit Zeta Gundam"
    assert clean_episode("Mobile Suit Gundam: The Origin (Manga)~4") == "Mobile Suit Gundam: The Origin (Manga)"
    assert clean_episode("Gjallarhorn~Calamity War") == "Gjallarhorn"
    assert clean_episode("Earth Federation Forces") == "Earth Federation Forces"
    assert clean_episode(None) is None
