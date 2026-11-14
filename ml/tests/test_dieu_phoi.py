"""Vòng điều phối của ml/scripts/dieu_phoi.py: hàng đợi chung cho máy này và Kaggle, Colab qua thư mục Drive (giả lập)."""

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
    loops = {"n": 0}

    def no_sleep(seconds):  # vòng lặp không kết thúc thì báo lỗi thay vì treo bộ test
        loops["n"] += 1
        if loops["n"] > 500:
            raise RuntimeError("vòng điều phối không kết thúc")

    monkeypatch.setattr(dieu_phoi.time, "sleep", no_sleep)
    args = argparse.Namespace(no_kaggle=False, kaggle_sessions=3, drive=str(tmp_path / "drive"), workers=1)
    d = dieu_phoi.Dieuphoi(args)
    started: list[str] = []

    def start_local(job, log_name):
        started.append(job.name)
        return FakeProc(d.root / job.step / job.name)

    monkeypatch.setattr(d, "start_local", start_local)
    monkeypatch.setattr(d, "kaggle", lambda *cmd: {"error": "chưa đăng nhập"})  # Kaggle không dùng được
    monkeypatch.setattr(d, "pushed_commit", lambda: "abc123")
    return d, started, tmp_path, dieu_phoi


def fake_kaggle(calls: list, status: str, output=None):
    def run(*cmd):
        calls.append(cmd[0])
        if cmd[0] == "dataset-status":
            return {"user": "u", "status": "ready"}
        if cmd[0] == "push":
            return {"url": "https://www.kaggle.com/code/u/x"}
        if cmd[0] == "status":
            return {"status": status}
        if cmd[0] == "output":
            out = Path(cmd[cmd.index("--path") + 1])
            out.mkdir(parents=True, exist_ok=True)
            if output:
                output(out)
            return {"files": 1}
        if cmd[0] == "delete":
            return {"deleted": True}
        return {"error": "?"}

    return run


def test_colab_result_is_copied_and_not_rerun(phoi):
    d, started, tmp, _ = phoi
    finish(tmp / "drive" / "runs" / "b06" / "vit_b16_clip-s43", epochs=30)
    queue, colab = [Job("b06", "efficientnetv2_s", 43)], [Job("b06", "vit_b16_clip", 43)]
    assert d.run_phase("b06", "b06", queue, colab, "b06-train.log") == []
    assert started == ["efficientnetv2_s-s43"]
    assert run_finished(d.root / "b06" / "vit_b16_clip-s43")


def test_local_takes_queue_in_order_when_kaggle_unavailable_and_colab_never_started(phoi, monkeypatch):
    d, started, _, dieu_phoi = phoi
    monkeypatch.setattr(dieu_phoi, "COLAB_START_S", 0)  # hết thời gian ân hạn mà Colab chưa có epoch nào
    queue = [Job("b06", "efficientnetv2_s", 44), Job("b06", "vit_b16_clip", 42)]
    colab = [Job("b06", "vit_b16_clip", 43)]
    assert d.run_phase("b06", "b06", queue, colab, "b06-train.log") == []
    assert started == ["efficientnetv2_s-s44", "vit_b16_clip-s42", "vit_b16_clip-s43"]
    state = json.loads((d.root / "dieu-phoi.json").read_text(encoding="utf-8"))
    assert sorted(state["b06"]["taken"]) == ["efficientnetv2_s-s44", "vit_b16_clip-s42", "vit_b16_clip-s43"]


def test_kaggle_result_is_copied_and_batchnorm_job_stays_local(phoi, monkeypatch):
    d, started, _, _ = phoi
    calls: list[str] = []
    monkeypatch.setattr(d, "kaggle", fake_kaggle(calls, "complete", lambda out: finish(out / "runs" / "b06" / "vit_b16_clip-s42", epochs=30)))
    queue = [Job("b06", "efficientnetv2_s", 44), Job("b06", "vit_b16_clip", 42)]
    assert d.run_phase("b06", "b06", queue, [], "b06-train.log") == []
    assert started == ["efficientnetv2_s-s44"]  # EfficientNetV2-S (BatchNorm) không lên Kaggle
    assert calls.count("push") == 1 and run_finished(d.root / "b06" / "vit_b16_clip-s42")


def test_kaggle_without_gpu_is_retried_later_and_idle_local_takes_over(phoi, monkeypatch):
    d, started, _, _ = phoi
    calls: list[str] = []

    def no_gpu(out):  # script trên Kaggle dừng ngay vì không có GPU
        (out / "tom-tat.json").write_text(json.dumps({"error": "SystemExit('Không có GPU (cần xác minh số điện thoại)')"}), encoding="utf-8")

    monkeypatch.setattr(d, "kaggle", fake_kaggle(calls, "error", no_gpu))
    assert d.run_phase("b06", "b06", [Job("b06", "vit_b16_clip", 42)], [], "b06-train.log") == []
    assert calls.count("push") == 1  # không đẩy lại ngay
    assert started == ["vit_b16_clip-s42"]  # máy này rảnh nên tự làm
    kernels = json.loads((d.root / "dieu-phoi.json").read_text(encoding="utf-8"))["b06"]["kernels"]
    assert kernels["robotica-b06-vit-b16-clip-s42"]["no_gpu"] is True


def test_kaggle_session_stuck_in_queue_is_cancelled_when_local_is_idle(phoi, monkeypatch):
    d, started, _, dieu_phoi = phoi
    calls: list[str] = []
    monkeypatch.setattr(dieu_phoi, "KAGGLE_QUEUED_S", 0)
    monkeypatch.setattr(d, "kaggle", fake_kaggle(calls, "queued"))
    assert d.run_phase("b06", "b06", [Job("b06", "vit_b16_clip", 43)], [], "b06-train.log") == []
    assert "delete" in calls and started == ["vit_b16_clip-s43"]


def test_idle_kaggle_runs_next_step_ahead_while_local_finishes_b6(phoi, monkeypatch):
    d, started, _, _ = phoi
    calls: list[str] = []
    monkeypatch.setattr(d, "kaggle", fake_kaggle(calls, "complete", lambda out: finish(out / "runs" / "b07" / "A1-convnext_tiny-s42", epochs=30)))
    ahead = [Job("b07", "convnext_tiny", 42, exp="A1")]
    assert d.run_phase("b06", "b06", [Job("b06", "efficientnetv2_s", 44)], [], "b06-train.log", speculate=lambda: [j for j in ahead if not run_finished(d.root / "b07" / j.name)]) == []
    assert started == ["efficientnetv2_s-s44"]
    assert calls.count("push") == 1 and run_finished(d.root / "b07" / "A1-convnext_tiny-s42")
    assert "robotica-b07-a1-convnext-tiny-s42" in d.state["b07"]["kernels"]


def test_idle_local_runs_shortest_next_step_job_and_b6_waits_for_it(phoi, monkeypatch):
    d, started, tmp, dieu_phoi = phoi
    # Colab đang chạy ViT 44 (có epoch mới), Kaggle không dùng được: máy này rảnh thì chạy trước việc B7 ngắn nhất
    run = tmp / "drive" / "runs" / "b06" / "vit_b16_clip-s44"
    run.mkdir(parents=True)
    (run / "history.csv").write_text("epoch\n1\n", encoding="utf-8")
    ahead = [Job("b07", "convnext_tiny", 42, exp="A1"), Job("b07", "convnext_tiny", 42, exp="A6", fraction=0.1)]

    def speculate():
        if started and started[-1].startswith("A6"):  # Colab xong ViT 44 trong lúc máy này chạy việc B7
            finish(run, epochs=30)
            (run / "result.json").write_text(json.dumps({"finished": True}), encoding="utf-8")
        busy = set(d.state.get("b07", {}).get("taken", []))
        return [j for j in ahead if not run_finished(d.root / "b07" / j.name) and j.name not in busy]

    assert d.run_phase("b06", "b06", [], [Job("b06", "vit_b16_clip", 44)], "b06-train.log", speculate=speculate) == []
    assert started[0] == "A6-10-convnext_tiny-s42"  # ngắn nhất trước
    assert run_finished(d.root / "b07" / "A6-10-convnext_tiny-s42")  # B6 xong vẫn chờ việc đang chạy, không bỏ dở
    assert "vit_b16_clip-s44" not in d.state["b06"]["taken"]  # Colab còn chạy nên máy này không nhận thay


def test_colab_gets_grace_period_before_local_takes_over(phoi, monkeypatch):
    d, started, _, dieu_phoi = phoi
    monkeypatch.setattr(dieu_phoi, "COLAB_START_S", 3600)
    d.state["b06"] = {"started_at": 0, "taken": []}
    assert d.colab_stalled("b06", "b06", "vit_b16_clip-s44") is False  # vừa giao, chưa có epoch: chờ
    d.state["b06"]["colab_since"]["vit_b16_clip-s44"] -= 4000
    assert d.colab_stalled("b06", "b06", "vit_b16_clip-s44") is True


def test_old_single_kernel_state_is_migrated(phoi):
    d, _, _, _ = phoi
    d.state["b06"] = {"started_at": 0, "taken": [], "kaggle": {"kernel": "robotica-b06", "jobs": ["vit_b16_clip-s42", "vit_b16_clip-s44"], "done": False}}
    assert list(d.active_kernels("b06")) == ["robotica-b06"]
    assert "kaggle" not in d.state["b06"]


def test_taken_over_run_ignores_later_cloud_copy(phoi):
    d, started, tmp, _ = phoi
    d.state["b06"] = {"started_at": 0, "taken": ["vit_b16_clip-s43"]}
    finish(tmp / "drive" / "runs" / "b06" / "vit_b16_clip-s43", epochs=30)  # Colab xong sau khi máy này đã nhận
    d.sync_colab("b06", "b06", ["vit_b16_clip-s43"])
    assert not (d.root / "b06" / "vit_b16_clip-s43").exists()
