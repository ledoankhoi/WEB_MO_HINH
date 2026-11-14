"""Vòng điều phối của ml/scripts/dieu_phoi.py, giả lập máy này, Colab (thư mục Drive) và Kaggle (không đẩy được)."""

import argparse
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from robotrec.cloud import Job, run_finished  # noqa: E402


def finish(run_dir: Path, epochs: int = 2) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.json").write_text("{}", encoding="utf-8")
    (run_dir / "history.csv").write_text("epoch\n" + "".join(f"{i + 1}\n" for i in range(epochs)), encoding="utf-8")
    (run_dir / "result.json").write_text(json.dumps({"finished": True}), encoding="utf-8")


class FakeProc:
    def __init__(self, run_dir: Path) -> None:
        self.run_dir, self.returncode = run_dir, None

    def poll(self):
        finish(self.run_dir)
        self.returncode = 0
        return 0


@pytest.fixture
def phoi(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBOTREC_RUNS", str(tmp_path / "runs"))
    import dieu_phoi

    monkeypatch.setattr(dieu_phoi, "POLL_S", 0)
    monkeypatch.setattr(dieu_phoi, "CLOUD_CHECK_S", 0)
    monkeypatch.setattr(dieu_phoi.time, "sleep", lambda s: None)
    args = argparse.Namespace(no_kaggle=False, no_colab=False, drive=str(tmp_path / "drive"), workers=1)
    d = dieu_phoi.Dieuphoi(args)
    started: list[str] = []

    def start_local(job, log_name):
        started.append(job.name)
        return FakeProc(d.root / "b06" / job.name)

    monkeypatch.setattr(d, "start_local", start_local)
    monkeypatch.setattr(d, "kaggle", lambda *cmd: {"error": "chưa đăng nhập"})  # Kaggle không dùng được
    return d, started, tmp_path


def test_colab_result_is_copied_and_not_rerun(phoi):
    d, started, tmp = phoi
    finish(tmp / "drive" / "runs" / "b06" / "vit_b16_clip-s43", epochs=30)
    local, colab = [Job("b06", "efficientnetv2_s", 43)], [Job("b06", "vit_b16_clip", 43)]
    assert d.run_phase("b06", "b06", local, colab, [], "b06-train.log") == []
    assert started == ["efficientnetv2_s-s43"]
    assert run_finished(d.root / "b06" / "vit_b16_clip-s43")


def test_local_takes_over_when_colab_never_started_and_kaggle_unavailable(phoi):
    d, started, _ = phoi
    local = [Job("b06", "efficientnetv2_s", 44)]
    colab = [Job("b06", "vit_b16_clip", 43)]
    kaggle = [Job("b06", "vit_b16_clip", 42)]
    assert d.run_phase("b06", "b06", local, colab, kaggle, "b06-train.log") == []
    assert started[0] == "efficientnetv2_s-s44"  # việc của máy này trước
    assert sorted(started[1:]) == ["vit_b16_clip-s42", "vit_b16_clip-s43"]
    state = json.loads((d.root / "dieu-phoi.json").read_text(encoding="utf-8"))
    assert sorted(state["b06"]["taken"]) == ["vit_b16_clip-s42", "vit_b16_clip-s43"]


def test_taken_over_run_ignores_later_cloud_copy(phoi):
    d, started, tmp = phoi
    colab = [Job("b06", "vit_b16_clip", 43)]
    d.state["b06"] = {"started_at": 0, "taken": ["vit_b16_clip-s43"]}
    finish(tmp / "drive" / "runs" / "b06" / "vit_b16_clip-s43", epochs=30)  # Colab xong sau khi máy này đã nhận
    d.sync_colab("b06", "b06", ["vit_b16_clip-s43"])
    assert not (d.root / "b06" / "vit_b16_clip-s43").exists()
