"""Điều phối B6 → B7 trên ba máy (máy này, Google Colab, Kaggle) để rút ngắn thời gian. Chủ dự án duyệt ngày 14/11/2026.

Chia việc
- B6 (các lần chạy còn lại): máy này EfficientNetV2-S hạt giống 43, 44; Colab ViT-B/16 hạt giống 43 (notebook B06_huan_luyen.ipynb,
  ghi vào Google Drive); Kaggle ViT-B/16 hạt giống 42, 44 song song trên 2 GPU T4 (script sinh từ ml/cloud/kaggle_chay.py).
- Xong B6: báo cáo B06, đọc kiến trúc được chọn (ml/reports/B06/summary.json, khoá "choice"), chia việc B7 giữa máy này và Kaggle
  (robotrec.cloud.split_b7) để hai bên xong gần cùng lúc, xong thì báo cáo B07. Colab không nhận việc B7 vì cần người bấm.

Kết quả trên mây được chép về <ROBOTREC_RUNS>/<b06|b07>/ khi lần chạy xong (robotrec.cloud.copy_run): báo cáo đọc như mọi lần chạy khác.
Dự phòng: Kaggle báo lỗi, hoặc chưa đẩy được việc lên Kaggle khi máy này đã rảnh; Colab chưa có epoch nào hoặc không có epoch mới quá
45 phút khi máy này đã rảnh. Khi đó máy này chạy thay, chép last.pt về để chạy tiếp nếu có. Lần chạy đã giao cho máy này thì
kết quả trên mây của nó bị bỏ qua (không có hai bản của cùng một lần chạy).

Trạng thái ở <ROBOTREC_RUNS>/dieu-phoi.json, nhật ký ở <ROBOTREC_RUNS>/dieu-phoi.log. Chạy lại đúng lệnh là tiếp tục.
  ml/.venv/Scripts/python ml/scripts/dieu_phoi.py
  ml/.venv/Scripts/python ml/scripts/dieu_phoi.py --no-kaggle --no-colab     # chỉ máy này
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
REPO = ML.parent
sys.path.insert(0, str(ML))
sys.path.insert(0, str(ML / "scripts"))
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]

from b06_huan_luyen import runs_root  # noqa: E402
from robotrec.cloud import Job, copy_run, epochs_done, find_run_dirs, kaggle_script, run_finished, split_b7  # noqa: E402
from robotrec.config import REPORTS, load_config  # noqa: E402

CLOUD_PY = ML / ".venv-cloud" / "Scripts" / "python.exe"
KAGGLE_TOOL = ML / "scripts" / "kaggle_cong_cu.py"
DATASET = "robotica-anh-b04"
POLL_S = 60
CLOUD_CHECK_S = 300
COLAB_STALE_S = 45 * 60
B6_PLAN = {"colab": ["vit_b16_clip-s43"], "kaggle": ["vit_b16_clip-s42", "vit_b16_clip-s44"]}  # còn lại: máy này


class Dieuphoi:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.root = runs_root()
        self.state_path = self.root / "dieu-phoi.json"
        self.log_path = self.root / "dieu-phoi.log"
        self.state: dict = json.loads(self.state_path.read_text(encoding="utf-8")) if self.state_path.exists() else {}
        self.drive_runs = Path(args.drive) / "runs"
        self.next_cloud_check = 0.0

    # ---------- ghi chép ----------
    def note(self, text: str) -> None:
        line = f"[{datetime.now():%d/%m %H:%M}] {text}"
        print(line, flush=True)
        with open(self.log_path, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")

    def save(self) -> None:
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.state_path)

    # ---------- Kaggle ----------
    def kaggle(self, *cmd: str) -> dict:
        if self.args.no_kaggle:
            return {"error": "đã tắt Kaggle (--no-kaggle)"}
        if not CLOUD_PY.exists():
            return {"error": f"chưa có {CLOUD_PY}"}
        try:
            proc = subprocess.run([str(CLOUD_PY), str(KAGGLE_TOOL), *cmd], capture_output=True, text=True, encoding="utf-8", errors="replace",
                                  timeout=3 * 3600, cwd=REPO)
        except subprocess.TimeoutExpired:
            return {"error": "quá thời gian chờ Kaggle"}
        lines = proc.stdout.strip().splitlines()
        try:
            return json.loads(lines[-1]) if lines else {"error": proc.stderr[-400:]}
        except json.JSONDecodeError:
            return {"error": (proc.stderr or proc.stdout)[-400:]}

    def pushed_commit(self) -> str | None:
        """Commit hiện tại, nếu đã có trên GitHub (máy trên mây lấy mã từ đó)."""
        head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=REPO).stdout.strip()
        remote = subprocess.run(["git", "branch", "-r", "--contains", head], capture_output=True, text=True, cwd=REPO).stdout
        return head if "origin/" in remote else None

    def push_kaggle(self, phase: str, jobs: list[Job]) -> bool:
        commit = self.pushed_commit()
        if not commit:
            self.note("chưa đẩy được lên Kaggle: commit hiện tại chưa có trên GitHub")
            return False
        ds = self.kaggle("dataset-status", "--slug", DATASET)
        if ds.get("status") != "ready":
            self.note(f"chưa đẩy được lên Kaggle: bộ ảnh {DATASET} chưa sẵn sàng ({ds.get('status') or ds.get('error')})")
            return False
        user, slug = ds["user"], f"robotica-{phase}"
        folder = self.root / "kaggle" / phase
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "chay.py").write_text(kaggle_script((ML / "cloud" / "kaggle_chay.py").read_text(encoding="utf-8"), jobs, commit), encoding="utf-8")
        meta = {"id": f"{user}/{slug}", "title": slug, "code_file": "chay.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4", "dataset_sources": [f"{user}/{DATASET}"],
                "competition_sources": [], "kernel_sources": [], "model_sources": []}
        (folder / "kernel-metadata.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
        result = self.kaggle("push", "--folder", str(folder))
        if result.get("error"):
            self.note(f"đẩy lên Kaggle lỗi: {result['error']}")
            return False
        self.state[phase]["kaggle"] = {"kernel": slug, "jobs": [j.name for j in jobs], "pushed_at": time.time(), "url": result.get("url"),
                                       "version": result.get("version"), "commit": commit, "done": False}
        self.save()
        self.note(f"đã đẩy {len(jobs)} việc lên Kaggle ({', '.join(j.name for j in jobs)}): {result.get('url')}")
        return True

    def sync_kaggle(self, phase: str, folder: str) -> list[str]:
        """Khi lô Kaggle kết thúc: tải kết quả, chép lần chạy đã xong; trả tên các lần chạy chưa xong (để máy này chạy thay)."""
        info = self.state[phase].get("kaggle")
        if not info or info.get("done"):
            return []
        result = self.kaggle("status", "--kernel", info["kernel"])
        status = result.get("status")
        if status and status != info.get("last_status"):
            info["last_status"] = status
            self.save()
            self.note(f"Kaggle {info['kernel']}: {status}" + (f" ({result['message']})" if result.get("message") else ""))
        if status not in ("complete", "error", "cancel"):
            return []
        out = self.root / "kaggle" / phase / "ket-qua"
        download = self.kaggle("output", "--kernel", info["kernel"], "--path", str(out))
        if download.get("error"):
            self.note(f"tải kết quả Kaggle lỗi, thử lại sau: {download['error']}")
            return []
        found, failed = find_run_dirs(out, folder), []
        for name in info["jobs"]:
            src, dst = found.get(name), self.root / folder / name
            if name in self.state[phase]["taken"]:
                continue
            if src is not None and run_finished(src):
                copy_run(src, dst)
                self.note(f"đã chép {name} từ Kaggle ({epochs_done(src)} epoch)")
            else:
                if src is not None:
                    copy_run(src, dst, with_checkpoint=True)
                failed.append(name)
                self.note(f"{name} chưa xong trên Kaggle ({epochs_done(src) if src else 0} epoch): máy này chạy tiếp")
        info.update(done=True, failed=failed)
        self.save()
        return failed

    # ---------- Colab (qua Google Drive) ----------
    def sync_colab(self, phase: str, folder: str, names: list[str]) -> None:
        for name in names:
            if name in self.state[phase]["taken"]:
                continue
            src, dst = self.drive_runs / folder / name, self.root / folder / name
            if not run_finished(dst) and run_finished(src):
                copy_run(src, dst)
                self.note(f"đã chép {name} từ Colab ({epochs_done(src)} epoch)")

    def colab_stalled(self, folder: str, name: str) -> bool:
        history = self.drive_runs / folder / name / "history.csv"
        if not history.exists():
            return True  # chỉ hỏi khi máy này đã rảnh: Colab chưa có epoch nào thì máy này làm luôn
        return time.time() - history.stat().st_mtime > COLAB_STALE_S

    # ---------- máy này ----------
    def start_local(self, job: Job, log_name: str) -> subprocess.Popen:
        log = open(self.root / log_name, "a", encoding="utf-8")
        self.note(f"máy này bắt đầu {job.name}")
        return subprocess.Popen([sys.executable, *job.args(), "--workers", str(self.args.workers)], cwd=REPO, stdout=log, stderr=subprocess.STDOUT,
                                env=dict(os.environ, PYTHONIOENCODING="utf-8"))

    def take(self, phase: str, job: Job, queue: list[Job], reason: str) -> None:
        self.state[phase]["taken"].append(job.name)
        self.save()
        queue.append(job)
        self.note(f"máy này nhận {job.name}: {reason}")

    def run_phase(self, phase: str, folder: str, local: list[Job], colab: list[Job], kaggle: list[Job], log_name: str) -> list[str]:
        """Chạy tới khi mọi lần chạy của bước xong. Trả tên các lần chạy hỏng hẳn (rỗng nếu ổn)."""
        st = self.state.setdefault(phase, {"started_at": time.time(), "taken": []})
        jobs = {j.name: j for j in local + colab + kaggle}
        queue = [j for j in local]
        queue += [jobs[n] for n in st["taken"] if n in jobs and jobs[n] not in queue]
        pending_kaggle = [] if (st.get("kaggle") or not kaggle) else list(kaggle)
        failures: dict[str, int] = {}
        proc: subprocess.Popen | None = None
        current: Job | None = None
        self.note(f"{phase}: máy này {[j.name for j in local]}, Colab {[j.name for j in colab]}, Kaggle {[j.name for j in kaggle]}")
        while True:
            now = time.time()
            if now >= self.next_cloud_check:
                self.next_cloud_check = now + CLOUD_CHECK_S
                if pending_kaggle:
                    left = [j for j in pending_kaggle if j.name not in st["taken"] and not run_finished(self.root / folder / j.name)]
                    if not left or self.push_kaggle(phase, left):
                        pending_kaggle = []
                self.sync_colab(phase, folder, [j.name for j in colab])
                for name in self.sync_kaggle(phase, folder):
                    if name not in st["taken"]:
                        self.take(phase, jobs[name], queue, "Kaggle không chạy xong")
            if proc is not None and proc.poll() is not None:
                assert current is not None
                if run_finished(self.root / folder / current.name):
                    self.note(f"máy này xong {current.name}")
                else:
                    failures[current.name] = failures.get(current.name, 0) + 1
                    self.note(f"{current.name} dừng ở máy này (mã thoát {proc.returncode}, lần {failures[current.name]}); xem {log_name}")
                proc = current = None
            missing = [n for n in jobs if not run_finished(self.root / folder / n)]
            if not missing:
                self.note(f"{phase}: đủ {len(jobs)} lần chạy")
                return []
            if proc is None:
                job = next((j for j in queue if not run_finished(self.root / folder / j.name) and failures.get(j.name, 0) < 2), None)
                if job is None and pending_kaggle:  # máy này rảnh mà chưa đẩy được lên Kaggle: làm luôn
                    job = next((j for j in pending_kaggle if j.name not in st["taken"]), None)
                    if job is not None:
                        pending_kaggle.remove(job)
                        self.take(phase, job, queue, "chưa đẩy được lên Kaggle")
                if job is None:
                    for j in colab:
                        if j.name not in st["taken"] and not run_finished(self.root / folder / j.name) and self.colab_stalled(folder, j.name):
                            src = self.drive_runs / folder / j.name
                            if src.exists():
                                copy_run(src, self.root / folder / j.name, with_checkpoint=True)
                            self.take(phase, j, queue, f"Colab {'đứng yên' if src.exists() else 'chưa bắt đầu'} (đã có {epochs_done(src)} epoch)")
                            job = j
                            break
                if job is not None:
                    proc, current = self.start_local(job, log_name), job
                elif all(failures.get(n, 0) >= 2 for n in missing if n in st["taken"] or jobs[n] in local) and \
                        all(n in st["taken"] or jobs[n] in local for n in missing):
                    self.note(f"{phase}: dừng, các lần chạy hỏng hẳn: {missing}")
                    return missing
            time.sleep(POLL_S)

    def run_script(self, *args: str, log_name: str) -> int:
        self.note("chạy " + " ".join(args))
        with open(self.root / log_name, "a", encoding="utf-8") as log:
            code = subprocess.run([sys.executable, *args], cwd=REPO, stdout=log, stderr=subprocess.STDOUT,
                                  env=dict(os.environ, PYTHONIOENCODING="utf-8")).returncode
        if code:
            self.note(f"LỖI: {' '.join(args)} (mã thoát {code}), xem {log_name}")
        return code


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-kaggle", action="store_true", help="không dùng Kaggle (việc của Kaggle về máy này)")
    parser.add_argument("--no-colab", action="store_true", help="không chờ Colab (việc của Colab về máy này)")
    parser.add_argument("--drive", default="G:/My Drive/robotica-ml", help="thư mục robotica-ml trên Google Drive của máy này")
    parser.add_argument("--workers", type=int, default=4, help="số tiến trình đọc ảnh khi chạy ở máy này")
    args = parser.parse_args()
    d = Dieuphoi(args)

    cfg6 = load_config("b06_huan_luyen")
    jobs6 = [Job("b06", a, s, timm=cfg6["architectures"][a]["timm"]) for a in cfg6["order"] for s in cfg6["seeds"]]
    todo6 = [j for j in jobs6 if not run_finished(d.root / "b06" / j.name)]
    colab6 = [] if args.no_colab else [j for j in todo6 if j.name in B6_PLAN["colab"]]
    kaggle6 = [] if args.no_kaggle else [j for j in todo6 if j.name in B6_PLAN["kaggle"]]
    local6 = [j for j in todo6 if j not in colab6 and j not in kaggle6]
    if d.run_phase("b06", "b06", local6, colab6, kaggle6, "b06-train.log"):
        return
    if d.run_script("ml/scripts/b06_bao_cao.py", log_name="b06-train.log"):
        return
    choice = json.loads((REPORTS / "B06" / "summary.json").read_text(encoding="utf-8"))["choice"]
    d.note(f"B6 xong. Kiến trúc được chọn theo luật của B06: {choice}")

    from b07_thi_nghiem_phu import jobs_for

    cfg7 = load_config("b07_thi_nghiem_phu")
    # BatchNorm phụ thuộc cỡ lô: EfficientNetV2-S giữ micro-batch 32 như B6 ở máy nhà; ConvNeXt và ViT (LayerNorm) để máy tự chọn
    extra = ["--micro-batch", "32"] if choice == "efficientnetv2_s" else []
    jobs7 = [Job("b07", choice, s, exp=e, fraction=f, timm=cfg7["experiments"][e].get("timm", {}).get(choice, cfg6["architectures"][choice]["timm"]),
                 extra=extra) for exp in cfg7["order"] for e, s, f in jobs_for(exp, choice, cfg7)]
    todo7 = [j for j in jobs7 if not run_finished(d.root / "b07" / j.name)]
    if "b07" in d.state and d.state["b07"].get("split"):  # chạy lại: giữ nguyên cách chia lần trước
        kaggle_names = set(d.state["b07"]["split"]["kaggle"])
        local7, kaggle7 = [j for j in todo7 if j.name not in kaggle_names], [j for j in todo7 if j.name in kaggle_names]
    else:
        local7, kaggle7 = split_b7(todo7, 0 if args.no_kaggle else 2)
        d.state.setdefault("b07", {"started_at": time.time(), "taken": []})["split"] = {"local": [j.name for j in local7], "kaggle": [j.name for j in kaggle7]}
        d.save()
    if d.run_phase("b07", "b07", local7, [], kaggle7, "b07-train.log"):
        return
    if d.run_script("ml/scripts/b07_bao_cao.py", "--arch", choice, log_name="b07-train.log"):
        return
    d.note("B7 xong: báo cáo B07 đã sinh. Bước sau (B8) cần chốt cấu hình cuối, làm trong phiên có người theo dõi.")


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
