import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.report import Report, markdown_table  # noqa: E402


def test_markdown_table_escapes_and_formats():
    table = markdown_table([{"a": "x|y", "b": 0.123456, "c": True, "d": None}])
    assert "x\\|y" in table
    assert "0.1235" in table
    assert "| có |" in table
    assert "—" in table


def test_report_writes_markdown_summary_and_figure(tmp_path):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    report = Report("B99", "thu", "Báo cáo thử", doc_dir=tmp_path / "docs", data_dir=tmp_path / "reports")
    report.section(1)
    report.p("Mục tiêu thử.")
    report.set("metrics.top1", 0.9)
    fig, ax = plt.subplots()
    ax.plot([0, 1], [0, 1])
    report.figure(fig, "duong", "Đường thử")
    path = report.write()

    text = path.read_text(encoding="utf-8")
    assert text.startswith("# B99. Báo cáo thử")
    assert "## 1. Mục tiêu" in text
    assert "](../reports/B99/duong.png)" in text
    summary = json.loads((tmp_path / "reports" / "B99" / "summary.json").read_text(encoding="utf-8"))
    assert summary["metrics"]["top1"] == 0.9
    assert (tmp_path / "reports" / "B99" / "duong.png").exists()
