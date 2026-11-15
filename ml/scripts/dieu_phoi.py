"""Điều phối B6 → B7 trên nhiều máy (máy này, Kaggle, tuỳ chọn Google Colab) để rút ngắn thời gian. Chủ dự án duyệt ngày 14/11/2026.

Cách chia việc: hàng đợi chung, việc dài làm trước. Máy này rảnh thì lấy việc kế tiếp; Kaggle còn chỗ (tối đa `--kaggle-sessions`
phiên GPU cùng lúc, mỗi phiên một việc, vì máy Kaggle có 2 GPU nhưng chỉ 4 CPU và đọc ảnh là nút thắt) thì đẩy việc kế tiếp lên.
- B6: các lần chạy còn lại. EfficientNetV2-S (BatchNorm, phụ thuộc cỡ lô) chỉ chạy ở máy này; ViT-B/16 chạy ở đâu cũng được.
  `--colab` giao thêm ViT hạt giống 43 cho Colab (notebook B06_huan_luyen.ipynb, ghi vào Google Drive).
- Xong B6: báo cáo B06, đọc kiến trúc được chọn (ml/reports/B06/summary.json, khoá "choice"), chạy B7 cùng kiểu hàng đợi, báo cáo B07.

Kết quả trên mây được chép về <ROBOTREC_RUNS>/<b06|b07>/ khi lần chạy xong (robotrec.cloud.copy_run): báo cáo đọc như mọi lần chạy khác.
Dự phòng: phiên Kaggle lỗi thì máy này chạy tiếp từ last.pt của phiên đó; Kaggle không cấp GPU (tài khoản chưa xác minh số điện thoại) thì
đẩy lại sau 5 phút; việc phải xếp hàng trên Kaggle quá 10 phút khi máy này đang rảnh thì huỷ phiên đó, máy này làm; Colab không có
epoch mới quá 45 phút khi máy này rảnh thì máy này chạy tiếp. Việc đã giao cho máy này thì kết quả trên mây của nó bị bỏ qua.

Trạng thái ở <ROBOTREC_RUNS>/dieu-phoi.json, nhật ký ở <ROBOTREC_RUNS>/dieu-phoi.log. Chạy lại đúng lệnh là tiếp tục.
  ml/.venv/Scripts/python ml/scripts/dieu_phoi.py
  ml/.venv/Scripts/python ml/scripts/dieu_phoi.py --no-kaggle     # chỉ máy này
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
REPO = ML.parent
sys.path.insert(0, str(ML))
sys.path.insert(0, str(ML / "scripts"))
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]

from b06_huan_luyen import runs_root  # noqa: E402
from robotrec.cloud import Job, b7_name, copy_run, epochs_done, find_run_dirs, kaggle_script, run_finished  # noqa: E402
from robotrec.config import REPORTS, load_config  # noqa: E402

CLOUD_PY = ML / ".venv-cloud" / "Scripts" / "python.exe"
KAGGLE_TOOL = ML / "scripts" / "kaggle_cong_cu.py"
DATASET = "robotica-anh-b04"
POLL_S = 60
CLOUD_CHECK_S = 300
COLAB_STALE_S = 45 * 60
COLAB_START_S = 60 * 60
KAGGLE_RETRY_S = 5 * 60
KAGGLE_QUEUED_S = 10 * 60
SPECULATE_MIN_SEEDS = 1
LOCAL_ONLY_ARCHS = {"efficientnetv2_s"}  # BatchNorm: cỡ lô trên GPU 16 GB khác máy nhà


def kernel_slug(phase: str, job: Job) -> str:
    return f"robotica-{phase}-{job.name}".lower().replace("_", "-")[:50].rstrip("-")


class Dieuphoi:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.root = runs_root()
        self.state_path = self.root / "dieu-phoi.json"
        self.log_path = self.root / "dieu-phoi.log"
        self.state: dict = json.loads(self.state_path.read_text(encoding="utf-8")) if self.state_path.exists() else {}
        self.drive_runs = Path(args.drive) / "runs"
        self.next_cloud_check = 0.0
        self.next_push = 0.0
        self.last_notes: dict[str, str] = {}

    # ---------- ghi chép ----------
    def note(self, text: str) -> None:
        line = f"[{datetime.now():%d/%m %H:%M}] {text}"
        print(line, flush=True)
        with open(self.log_path, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")

    def note_once(self, key: str, text: str) -> None:
        """Ghi nhật ký chỉ khi nội dung đổi (các lần thử lại không làm đầy nhật ký)."""
        if self.last_notes.get(key) != text:
            self.last_notes[key] = text
            self.note(text)

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

    def kernels(self, phase: str) -> dict:
        st = self.state[phase]
        if "kaggle" in st:  # trạng thái cũ: một kernel cho cả bước
            old = st.pop("kaggle")
            st.setdefault("kernels", {})[old["kernel"]] = old
        return st.setdefault("kernels", {})

    def active_kernels(self, phase: str) -> dict:
        if phase not in self.state:
            return {}
        return {slug: info for slug, info in self.kernels(phase).items() if not info.get("done")}

    def sessions_in_use(self) -> int:
        """Giới hạn số phiên GPU là của cả tài khoản: đếm mọi bước."""
        return sum(len(self.active_kernels(phase)) for phase in ("b06", "b07"))

    def push_kaggle(self, phase: str, job: Job) -> bool:
        commit = self.pushed_commit()
        if not commit:
            self.note_once("push", "chưa đẩy được lên Kaggle: commit hiện tại chưa có trên GitHub")
            return False
        ds = self.kaggle("dataset-status", "--slug", DATASET)
        if ds.get("status") != "ready":
            self.note_once("push", f"chưa đẩy được lên Kaggle: bộ ảnh {DATASET} chưa sẵn sàng ({ds.get('status') or ds.get('error')})")
            return False
        user, slug = ds["user"], kernel_slug(phase, job)
        folder = self.root / "kaggle" / phase / slug
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "chay.py").write_text(kaggle_script((ML / "cloud" / "kaggle_chay.py").read_text(encoding="utf-8"), [job], commit), encoding="utf-8")
        meta = {"id": f"{user}/{slug}", "title": slug, "code_file": "chay.py", "language": "python", "kernel_type": "script", "is_private": True,
                "enable_gpu": True, "enable_internet": True, "machine_shape": "NvidiaTeslaT4", "dataset_sources": [f"{user}/{DATASET}"],
                "competition_sources": [], "kernel_sources": [], "model_sources": []}
        (folder / "kernel-metadata.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
        result = self.kaggle("push", "--folder", str(folder))
        if result.get("error"):
            self.note_once("push", f"đẩy {job.name} lên Kaggle lỗi: {result['error']}")
            return False
        self.kernels(phase)[slug] = {"kernel": slug, "jobs": [job.name], "pushed_at": time.time(), "url": result.get("url"),
                                     "version": result.get("version"), "commit": commit, "done": False}
        self.save()
        self.note(f"đã đẩy {job.name} lên Kaggle: {result.get('url')}")
        return True

    def sync_kaggle(self, phase: str, folder: str) -> tuple[list[str], list[str]]:
        """Kiểm tra các phiên Kaggle. Phiên kết thúc: tải kết quả, chép lần chạy đã xong.
        Trả (việc chưa xong để máy này chạy tiếp, việc đẩy lại vì Kaggle không cấp GPU)."""
        failed: list[str] = []
        no_gpu: list[str] = []
        for slug, info in list(self.active_kernels(phase).items()):
            result = self.kaggle("status", "--kernel", slug)
            status = result.get("status")
            if status and status != info.get("last_status"):
                info["last_status"] = status
                if status == "running":
                    info.setdefault("running_at", time.time())
                self.save()
                self.note(f"Kaggle {slug}: {status}" + (f" ({result['message']})" if result.get("message") else ""))
            if status not in ("complete", "error", "cancel"):
                continue
            out = self.root / "kaggle" / phase / slug / "ket-qua"
            download = self.kaggle("output", "--kernel", slug, "--path", str(out))
            if download.get("error"):
                self.note_once(f"download-{slug}", f"tải kết quả Kaggle {slug} lỗi, thử lại sau: {download['error']}")
                continue
            summary = out / "tom-tat.json"
            error = json.loads(summary.read_text(encoding="utf-8")).get("error", "") if summary.exists() else ""
            info["done"] = True
            if "GPU" in error:  # tài khoản chưa xác minh số điện thoại: Kaggle chạy không có GPU, script dừng ngay
                info["no_gpu"] = True
                no_gpu += [n for n in info["jobs"] if n not in self.state[phase]["taken"]]
                self.note("Kaggle chạy không có GPU: cần xác minh số điện thoại (kaggle.com → Settings → Phone verification). "
                          f"Thử đẩy lại sau {KAGGLE_RETRY_S // 60} phút; máy này rảnh trước thì tự làm.")
                self.save()
                continue
            found = find_run_dirs(out, folder)
            for name in info["jobs"]:
                if name in self.state[phase]["taken"] or info.get("cancelled"):
                    continue
                src, dst = found.get(name), self.root / folder / name
                if src is not None and run_finished(src):
                    copy_run(src, dst)
                    self.note(f"đã chép {name} từ Kaggle ({epochs_done(src)} epoch)")
                else:
                    if src is not None:
                        copy_run(src, dst, with_checkpoint=True)
                    failed.append(name)
                    self.note(f"{name} chưa xong trên Kaggle ({epochs_done(src) if src else 0} epoch): máy này chạy tiếp")
            info["failed"] = failed
            self.save()
        return failed, no_gpu

    def cancel_kaggle(self, phase: str, slug: str) -> bool:
        result = self.kaggle("delete", "--kernel", slug)
        if result.get("error"):
            self.note_once(f"delete-{slug}", f"huỷ phiên Kaggle {slug} lỗi: {result['error']}")
            return False
        self.kernels(phase)[slug].update(done=True, cancelled=True)
        self.save()
        return True

    # ---------- Colab (qua Google Drive) ----------
    def sync_colab(self, phase: str, folder: str, names: list[str]) -> None:
        for name in names:
            if name in self.state[phase]["taken"]:
                continue
            src, dst = self.drive_runs / folder / name, self.root / folder / name
            if not run_finished(dst) and run_finished(src):
                copy_run(src, dst)
                self.note(f"đã chép {name} từ Colab ({epochs_done(src)} epoch)")

    def colab_stalled(self, phase: str, folder: str, name: str) -> bool:
        """Chỉ hỏi khi máy này đã rảnh. Colab chưa có epoch nào sau COLAB_START_S kể từ lúc giao (giải nén ảnh, tải mô hình, epoch đầu),
        hoặc không có epoch mới quá COLAB_STALE_S, thì coi như đứng."""
        history = self.drive_runs / folder / name / "history.csv"
        if not history.exists():
            since = self.state[phase].setdefault("colab_since", {}).setdefault(name, time.time())
            return time.time() - since > COLAB_START_S
        return time.time() - history.stat().st_mtime > COLAB_STALE_S

    # ---------- máy này ----------
    def start_local(self, job: Job, log_name: str) -> subprocess.Popen:
        log = open(self.root / log_name, "a", encoding="utf-8")
        self.note(f"máy này bắt đầu {job.name}")
        return subprocess.Popen([sys.executable, *job.args(), "--workers", str(self.args.workers)], cwd=REPO, stdout=log, stderr=subprocess.STDOUT,
                                env=dict(os.environ, PYTHONIOENCODING="utf-8"))

    def take(self, phase: str, job: Job, reason: str) -> None:
        if job.name not in self.state[phase]["taken"]:
            self.state[phase]["taken"].append(job.name)
            self.save()
        self.note(f"máy này nhận {job.name}: {reason}")

    def run_phase(self, phase: str, folder: str, jobs_in_order: list[Job], colab: list[Job], log_name: str,
                  speculate: Callable[[], list[Job]] | None = None) -> list[str]:
        """Chạy tới khi mọi lần chạy của bước xong. `jobs_in_order`: hàng đợi chung (máy này và Kaggle), việc dài trước.
        `speculate`: khi Kaggle còn chỗ mà bước này không còn việc để đẩy, lấy việc của bước sau (B7) để chạy trước.
        Trả tên các lần chạy hỏng hẳn (rỗng nếu ổn)."""
        st = self.state.setdefault(phase, {"started_at": time.time(), "taken": []})
        jobs = {j.name: j for j in jobs_in_order + colab}
        failures: dict[str, int] = {}
        proc: subprocess.Popen | None = None
        current: Job | None = None
        use_kaggle = not self.args.no_kaggle
        self.note(f"{phase}: hàng đợi {[j.name for j in jobs_in_order]}" + (f", Colab {[j.name for j in colab]}" if colab else "")
                  + f"; Kaggle tối đa {self.args.kaggle_sessions if use_kaggle else 0} phiên")
        for j in colab:  # mốc tính thời gian ân hạn của Colab
            st.setdefault("colab_since", {}).setdefault(j.name, time.time())
        self.save()

        def in_cloud(name: str) -> bool:
            return any(name in info["jobs"] for info in self.active_kernels(phase).values())

        def waiting() -> list[Job]:  # việc trong hàng đợi chưa ai nhận
            return [j for j in jobs_in_order if not run_finished(self.root / folder / j.name) and j.name not in st["taken"] and not in_cloud(j.name)]

        while True:
            now = time.time()
            if now >= self.next_cloud_check:
                self.next_cloud_check = now + CLOUD_CHECK_S
                self.sync_colab(phase, folder, [j.name for j in colab])
                failed, no_gpu = self.sync_kaggle(phase, folder)
                for name in failed:
                    if name in jobs:
                        self.take(phase, jobs[name], "Kaggle không chạy xong")
                if no_gpu:
                    self.next_push = now + KAGGLE_RETRY_S
                if speculate is not None and "b07" in self.state:  # việc B7 chạy trước: chép kết quả; việc hỏng để B7 làm lại
                    self.sync_kaggle("b07", "b07")
                if use_kaggle and now >= self.next_push:
                    pushable = lambda js: [j for j in js if j.arch not in LOCAL_ONLY_ARCHS and "--micro-batch" not in j.extra and not j.local]  # noqa: E731
                    for job in pushable(waiting()):
                        if self.sessions_in_use() >= self.args.kaggle_sessions:
                            break
                        if not self.push_kaggle(phase, job):
                            self.next_push = now + KAGGLE_RETRY_S
                            break
                    else:
                        if speculate is not None and self.sessions_in_use() < self.args.kaggle_sessions:
                            for job in pushable(speculate()):
                                if self.sessions_in_use() >= self.args.kaggle_sessions:
                                    break
                                self.state.setdefault("b07", {"started_at": time.time(), "taken": []})
                                if not self.push_kaggle("b07", job):
                                    self.next_push = now + KAGGLE_RETRY_S
                                    break
            if proc is not None and proc.poll() is not None:
                assert current is not None
                if run_finished(self.root / current.step / current.name):
                    self.note(f"máy này xong {current.name}")
                else:
                    failures[current.name] = failures.get(current.name, 0) + 1
                    self.note(f"{current.name} dừng ở máy này (mã thoát {proc.returncode}, lần {failures[current.name]}); xem {log_name}")
                proc = current = None
            missing = [n for n in jobs if not run_finished(self.root / folder / n)]
            if not missing:
                if proc is not None:  # máy này đang chạy trước một việc của bước sau: chờ xong, không bỏ dở
                    self.note_once(f"wait-{phase}", f"{phase}: đủ {len(jobs)} lần chạy; chờ máy này xong {current.name if current else ''} (việc chạy trước)")
                    time.sleep(POLL_S)
                    continue
                self.note(f"{phase}: đủ {len(jobs)} lần chạy")
                return []
            if proc is None:
                job = next((jobs[n] for n in st["taken"] if n in jobs and not run_finished(self.root / folder / n) and failures.get(n, 0) < 2), None)
                if job is None:
                    job = next((j for j in waiting() if failures.get(j.name, 0) < 2), None)
                    if job is not None:
                        self.take(phase, job, "máy này rảnh, lấy việc kế tiếp trong hàng đợi")
                if job is None:  # việc đang xếp hàng trên Kaggle quá lâu: huỷ phiên, máy này làm
                    for slug, info in list(self.active_kernels(phase).items()):
                        if info.get("last_status") in (None, "queued") and now - info["pushed_at"] > KAGGLE_QUEUED_S and self.cancel_kaggle(phase, slug):
                            job = jobs[info["jobs"][0]]
                            self.take(phase, job, f"phiên Kaggle {slug} xếp hàng quá {KAGGLE_QUEUED_S // 60} phút, đã huỷ")
                            break
                if job is None:
                    for j in colab:
                        if j.name not in st["taken"] and not run_finished(self.root / folder / j.name) and self.colab_stalled(phase, folder, j.name):
                            src = self.drive_runs / folder / j.name
                            if src.exists():
                                copy_run(src, self.root / folder / j.name, with_checkpoint=True)
                            self.take(phase, j, f"Colab {'đứng yên' if src.exists() else 'chưa bắt đầu'} (đã có {epochs_done(src)} epoch)")
                            job = j
                            break
                spec_job = None
                if job is None and speculate is not None:  # máy này rảnh: chạy trước việc B7 ngắn nhất (chờ ít nhất nếu B6 xong giữa chừng)
                    taken7 = set(self.state.get("b07", {}).get("taken", []))
                    spec_job = next((j for j in sorted(speculate(), key=lambda j: j.cost) if j.name not in taken7 and failures.get(j.name, 0) < 2), None)
                    if spec_job is not None:
                        self.state.setdefault("b07", {"started_at": time.time(), "taken": []})
                        self.take("b07", spec_job, "máy này rảnh, chạy trước việc của B7")
                if job is not None:
                    proc, current = self.start_local(job, log_name), job
                elif spec_job is not None:
                    proc, current = self.start_local(spec_job, "b07-train.log"), spec_job
                elif all(failures.get(n, 0) >= 2 for n in missing) and not self.active_kernels(phase) and not waiting():
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


def longest_first(jobs: list[Job]) -> list[Job]:
    return sorted(jobs, key=lambda j: -j.cost)


def b7_jobs(arch: str, cfg6: dict, cfg7: dict) -> list[Job]:
    from b07_thi_nghiem_phu import jobs_for

    # BatchNorm phụ thuộc cỡ lô: EfficientNetV2-S giữ micro-batch 32 như B6 (và chỉ chạy ở máy này); ConvNeXt, ViT (LayerNorm) để máy tự chọn
    extra = ["--micro-batch", "32"] if arch in LOCAL_ONLY_ARCHS else []
    return longest_first([Job("b07", arch, s, exp=e, fraction=f, timm=cfg7["experiments"][e].get("timm", {}).get(arch, cfg6["architectures"][arch]["timm"]),
                              extra=extra) for exp in cfg7["order"] for e, s, f in jobs_for(exp, arch, cfg7)])


def make_speculator(d: Dieuphoi, cfg6: dict, cfg7: dict) -> Callable[[], list[Job]]:
    """Việc B7 để Kaggle chạy trước khi B6 chưa xong hẳn (phiên Kaggle rảnh trong lúc máy này chạy lần cuối của B6).
    Đoán kiến trúc bằng chính luật chọn của B06 khi mỗi kiến trúc đã có ít nhất SPECULATE_MIN_SEEDS hạt giống; kết quả cuối khác
    thì các phiên này bị huỷ (chỉ tốn hạn mức Kaggle)."""
    cache: dict = {"arch": d.state.get("b07", {}).get("speculative_arch"), "jobs": None}

    def speculate() -> list[Job]:
        if cache["arch"] is None:
            done = {a: sum(run_finished(d.root / "b06" / f"{a}-s{s}") for s in cfg6["seeds"]) for a in cfg6["order"]}
            if min(done.values()) < SPECULATE_MIN_SEEDS or d.run_script("ml/scripts/b06_bao_cao.py", log_name="b06-train.log"):
                return []
            cache["arch"] = json.loads((REPORTS / "B06" / "summary.json").read_text(encoding="utf-8"))["choice"]
            d.state.setdefault("b07", {"started_at": time.time(), "taken": []})["speculative_arch"] = cache["arch"]
            d.save()
            d.note(f"Đoán trước kiến trúc của B6 theo luật B06 trên {sum(done.values())}/9 lần chạy: {cache['arch']}. "
                   "Phiên Kaggle rảnh sẽ chạy trước việc B7 của kiến trúc này.")
        if cache["jobs"] is None:
            cache["jobs"] = b7_jobs(cache["arch"], cfg6, cfg7)
        busy = {n for info in d.active_kernels("b07").values() for n in info["jobs"]} | set(d.state.get("b07", {}).get("taken", []))
        return [j for j in cache["jobs"] if not run_finished(d.root / "b07" / j.name) and j.name not in busy]

    return speculate


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-kaggle", action="store_true", help="không dùng Kaggle (mọi việc ở máy này)")
    parser.add_argument("--kaggle-sessions", type=int, default=3, help="số phiên GPU Kaggle chạy cùng lúc (mỗi phiên một việc)")
    parser.add_argument("--colab", nargs="*", default=[], metavar="TEN", help="các lần chạy B6 giao cho Colab, ví dụ vit_b16_clip-s44")
    parser.add_argument("--no-speculate", action="store_true", help="không cho Kaggle chạy trước việc B7 khi B6 chưa xong hẳn")
    parser.add_argument("--drive", default="G:/My Drive/robotica-ml", help="thư mục robotica-ml trên Google Drive của máy này")
    parser.add_argument("--workers", type=int, default=4, help="số tiến trình đọc ảnh khi chạy ở máy này")
    args = parser.parse_args()
    d = Dieuphoi(args)

    cfg6 = load_config("b06_huan_luyen")
    jobs6 = [Job("b06", a, s, timm=cfg6["architectures"][a]["timm"]) for a in cfg6["order"] for s in cfg6["seeds"]]
    todo6 = [j for j in jobs6 if not run_finished(d.root / "b06" / j.name)]
    colab6 = [j for j in todo6 if j.name in args.colab]
    queue6 = [j for j in todo6 if j not in colab6]  # thứ tự của cấu hình: CNN trước (chỉ máy này), ViT sau
    cfg7 = load_config("b07_thi_nghiem_phu")
    speculate = None if args.no_speculate or args.no_kaggle else make_speculator(d, cfg6, cfg7)
    if d.run_phase("b06", "b06", queue6, colab6, "b06-train.log", speculate=speculate):
        return
    if d.run_script("ml/scripts/b06_bao_cao.py", log_name="b06-train.log"):
        return
    choice = json.loads((REPORTS / "B06" / "summary.json").read_text(encoding="utf-8"))["choice"]
    d.note(f"B6 xong. Kiến trúc được chọn theo luật của B06: {choice}")

    jobs7 = b7_jobs(choice, cfg6, cfg7)
    names7 = {j.name for j in jobs7}
    if "b07" in d.state:  # việc B7 chạy trước cho kiến trúc khác (đoán sai): huỷ phiên còn chạy
        for slug, info in list(d.active_kernels("b07").items()):
            if not set(info["jobs"]) <= names7 and d.cancel_kaggle("b07", slug):
                d.note(f"huỷ phiên Kaggle {slug}: việc B7 chạy trước cho kiến trúc khác với kiến trúc được chọn")
    todo7 = [j for j in jobs7 if not run_finished(d.root / "b07" / j.name)]
    if d.run_phase("b07", "b07", todo7, [], "b07-train.log"):
        return
    if d.run_script("ml/scripts/b07_bao_cao.py", "--arch", choice, log_name="b07-train.log"):
        return
    final = cfg7.get("final")
    if not final:
        d.note("B7 xong: báo cáo B07 đã sinh. Bước sau (B8) cần chốt cấu hình cuối, làm trong phiên có người theo dõi.")
        return
    jobs_f = final_jobs(d, choice, cfg6, cfg7, final)
    todo_f = [j for j in jobs_f if not run_finished(d.root / "b07" / j.name)]
    if d.run_phase("b07", "b07", todo_f, [], "cuoi-train.log"):
        return
    d.note(f"Huấn luyện mô hình cuối xong: {[j.name for j in jobs_f]}. Bước sau: B8, B9 trên cấu hình cuối, làm trong phiên có người theo dõi.")


def final_jobs(d: Dieuphoi, arch: str, cfg6: dict, cfg7: dict, final: dict) -> list[Job]:
    """Bước huấn luyện mô hình cuối (khoá `final` của configs/b07_thi_nghiem_phu.yaml): cấu hình cuối trên mọi hạt giống, cộng các
    lần chạy chỉ làm ở máy này (E7). Hạt giống 42 trùng cấu hình với một thí nghiệm của B7 (`reuse_seed42`) thì chép lần chạy đó."""
    from b07_thi_nghiem_phu import jobs_for

    def timm_of(exp: str) -> str:
        return cfg7["experiments"][exp].get("timm", {}).get(arch, cfg6["architectures"][arch]["timm"])

    exp = final["experiment"]
    jobs = [Job("b07", arch, s, exp=e, fraction=f, timm=timm_of(e)) for e, s, f in jobs_for(exp, arch, cfg7)]
    reuse = final.get("reuse_seed42")
    if reuse:
        src, dst = d.root / "b07" / b7_name(reuse, arch, 42, None), d.root / "b07" / b7_name(exp, arch, 42, None)
        if run_finished(src) and not run_finished(dst):
            copy_run(src, dst)
            (dst / "nguon.txt").write_text(f"Chép từ {src.name}: cùng cấu hình huấn luyện, cùng hạt giống (dieu_phoi.py, {time.strftime('%d/%m/%Y %H:%M')}).\n",
                                           encoding="utf-8")
            d.note(f"{dst.name}: chép từ {src.name} (cùng cấu hình, cùng hạt giống)")
    local = [Job("b07", arch, s, exp=e, fraction=f, timm=timm_of(e), local=True) for e in final.get("local", []) for e, s, f in jobs_for(e, arch, cfg7)]
    return longest_first(jobs) + local  # việc chạy được trên Kaggle đứng trước để Kaggle nhận, máy này nhận việc chỉ chạy ở đây


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
