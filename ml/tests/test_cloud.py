import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from robotrec.cloud import Job, b7_name, copy_run, epochs_done, find_run_dirs, kaggle_script, run_finished, split_b7  # noqa: E402


def make_run(path: Path, finished: bool, epochs: int = 3, last: bool = True) -> Path:
    path.mkdir(parents=True)
    (path / "config.json").write_text("{}", encoding="utf-8")
    (path / "history.csv").write_text("epoch\n" + "".join(f"{i + 1}\n" for i in range(epochs)), encoding="utf-8")
    (path / "best.pt").write_bytes(b"w")
    if last:
        (path / "last.pt").write_bytes(b"ckpt")
    if finished:
        (path / "result.json").write_text(json.dumps({"finished": True}), encoding="utf-8")
    return path


def test_names_match_training_scripts():
    assert Job("b06", "vit_b16_clip", 43).name == "vit_b16_clip-s43"
    assert b7_name("A6", "convnext_tiny", 42, 0.25) == "A6-25-convnext_tiny-s42"
    assert b7_name("A1", "convnext_tiny", 42, None) == "A1-convnext_tiny-s42"
    job = Job("b07", "convnext_tiny", 44, exp="A6", fraction=0.1)
    assert job.name == "A6-10-convnext_tiny-s44"
    assert job.args() == ["ml/scripts/b07_thi_nghiem_phu.py", "--arch", "convnext_tiny", "--exp", "A6", "--seed", "44", "--fraction", "0.1"]
    assert Job("b06", "vit_b16_clip", 42).args() == ["ml/scripts/b06_huan_luyen.py", "--arch", "vit_b16_clip", "--seed", "42"]


def test_copy_skips_checkpoint_and_writes_result_last(tmp_path):
    src = make_run(tmp_path / "may-khac" / "b06" / "vit_b16_clip-s43", finished=True)
    dst = tmp_path / "may-nay" / "b06" / "vit_b16_clip-s43"
    copied = copy_run(src, dst)
    assert copied[-1] == "result.json"  # chỉ coi là xong khi mọi file khác đã chép
    assert not (dst / "last.pt").exists()
    assert run_finished(dst) and epochs_done(dst) == 3
    assert not list(dst.glob("*.tmp"))


def test_copy_never_overwrites_finished_run(tmp_path):
    src = make_run(tmp_path / "a" / "run", finished=True)
    dst = make_run(tmp_path / "b" / "run", finished=True, epochs=5)
    assert copy_run(src, dst) == []
    assert epochs_done(dst) == 5


def test_takeover_copies_checkpoint_of_unfinished_run(tmp_path):
    src = make_run(tmp_path / "drive" / "run", finished=False, epochs=7)
    dst = tmp_path / "local" / "run"
    copied = copy_run(src, dst, with_checkpoint=True)
    assert "last.pt" in copied and not run_finished(dst) and epochs_done(dst) == 7


def test_run_finished_tolerates_partial_file(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    (run / "result.json").write_text('{"finished": tr', encoding="utf-8")  # đang đồng bộ dở
    assert not run_finished(run)


def test_find_run_dirs_handles_nested_download(tmp_path):
    make_run(tmp_path / "kaggle" / "runs" / "b06" / "vit_b16_clip-s42", finished=True)
    make_run(tmp_path / "kaggle" / "runs" / "b06-chay-thu" / "vit_b16_clip-s42", finished=True)
    found = find_run_dirs(tmp_path / "kaggle", "b06")
    assert list(found) == ["vit_b16_clip-s42"] and found["vit_b16_clip-s42"].parent.name == "b06"


def test_split_b7_balances_expected_time():
    full = [Job("b07", "convnext_tiny", 42, exp=e) for e in ("A1", "A2", "A3", "A4")]
    a6 = [Job("b07", "convnext_tiny", s, exp="A6", fraction=f) for f in (0.1, 0.25, 0.5) for s in (42, 43, 44)]
    local, cloud = split_b7(full + a6, cloud_gpus=2)
    assert sorted(j.name for j in local + cloud) == sorted(j.name for j in full + a6)  # không mất, không trùng
    loads = [sum(j.cost for j in local), sum(j.cost for j in cloud) / 2]
    assert max(loads) - min(loads) <= 0.5  # tổng 6,55 đơn vị chia 3 GPU: lệch không quá nửa lần chạy
    assert split_b7(full, cloud_gpus=0) == (full, [])


def test_kaggle_script_embeds_jobs_and_commit():
    template = "JOBS = __JOBS__\nCOMMIT = '__COMMIT__'\n"
    script = kaggle_script(template, [Job("b06", "vit_b16_clip", 42, timm="vit_base_patch16_clip_224.openai")], "abc123")
    namespace: dict = {}
    exec(script, namespace)
    jobs = json.loads(namespace["JOBS"])
    assert namespace["COMMIT"] == "abc123" and jobs[0]["name"] == "vit_b16_clip-s42" and jobs[0]["timm"].endswith("openai")
    with pytest.raises(ValueError):
        kaggle_script("không có chỗ điền", [], "x")
