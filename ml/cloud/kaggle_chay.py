"""Chạy một lô huấn luyện của ROBOTICA trên Kaggle (GPU T4 x2). MẪU: `ml/scripts/dieu_phoi.py` điền danh sách việc và mã commit
(robotrec.cloud.kaggle_script) rồi đẩy lên Kaggle; không chạy trực tiếp file này.

Các bước: lấy mã đúng commit từ GitHub; cài timm đúng phiên bản của máy nhà; tìm ảnh trong bộ dữ liệu riêng tư `robotica-anh-b04`
(chỉ ảnh train và val của B4); tải trước trọng số huấn luyện sẵn; mỗi GPU chạy lần lượt các việc được giao, hai GPU song song.
Kết quả ghi vào /kaggle/working/runs/<b06|b07>/<tên>/ như ở máy nhà; nhật ký từng việc ở /kaggle/working/logs/; tóm tắt ở
/kaggle/working/tom-tat.json. Việc lỗi không dừng việc khác; script luôn kết thúc bình thường để Kaggle lưu kết quả.
"""

import json
import os
import queue
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path

JOBS = json.loads(__JOBS__)
COMMIT = "__COMMIT__"
REPO = "https://github.com/ledoankhoi/WEB_MO_HINH.git"
TIMM_VERSION = "1.0.31"  # trùng requirements.lock.txt của máy nhà
WORK = Path("/kaggle/working")
TMP = Path("/tmp/robotica")
CODE = TMP / "code"
DATA = TMP / "data"
STARTED = time.time()


def say(text: str) -> None:
    print(f"[{(time.time() - STARTED) / 60:6.1f} phút] {text}", flush=True)


def sh(cmd: list, **kw) -> None:
    say("$ " + " ".join(map(str, cmd)))
    subprocess.run(cmd, check=True, **kw)


def get_code() -> None:
    CODE.mkdir(parents=True, exist_ok=True)
    sh(["git", "init", "-q", str(CODE)])
    sh(["git", "-C", str(CODE), "fetch", "-q", "--depth", "1", REPO, COMMIT])
    sh(["git", "-C", str(CODE), "checkout", "-q", "FETCH_HEAD"])


def find_images() -> Path:
    import pandas as pd

    first = pd.read_csv(CODE / "ml" / "data" / "manifests" / "b04_splits.csv.gz", usecols=["file", "split"]).query("split == 'train'")["file"].iloc[0]
    for raw in Path("/kaggle/input").rglob("raw"):
        if raw.is_dir() and (raw / first).exists():
            return raw
    for archive in sorted(Path("/kaggle/input").rglob("*.zip")):  # Kaggle không tự giải nén thì giải nén ở đây
        out = TMP / "images"
        say(f"giải nén {archive}")
        with zipfile.ZipFile(archive) as handle:
            handle.extractall(out)
        if (out / "raw" / first).exists():
            return out / "raw"
    raise SystemExit("Không thấy ảnh: cần gắn bộ dữ liệu robotica-anh-b04 vào notebook")


def main() -> None:
    say(f"{len(JOBS)} việc, mã {COMMIT[:10]}")
    subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv"])
    get_code()
    sh([sys.executable, "-m", "pip", "install", "-q", f"timm=={TIMM_VERSION}"])
    raw = find_images()
    (DATA / "images").mkdir(parents=True, exist_ok=True)
    link = DATA / "images" / "raw"
    if not link.exists():
        link.symlink_to(raw, target_is_directory=True)
    say(f"ảnh ở {raw}")
    env = dict(os.environ, ROBOTREC_DATA=str(DATA), ROBOTREC_RUNS=str(WORK / "runs"), PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    for name in sorted({j["timm"] for j in JOBS if j.get("timm")}):  # tải trước một lần, tránh hai tiến trình cùng tải
        sh([sys.executable, "-c", f"import timm; timm.create_model({name!r}, pretrained=True)"], cwd=CODE, env=env)

    import torch

    gpus = max(1, torch.cuda.device_count())
    workers = max(1, (os.cpu_count() or 2) // gpus)
    say(f"{gpus} GPU, {os.cpu_count()} CPU: mỗi việc {workers} tiến trình đọc ảnh")
    (WORK / "logs").mkdir(parents=True, exist_ok=True)
    todo: "queue.Queue[dict]" = queue.Queue()
    for job in sorted(JOBS, key=lambda j: -(j.get("fraction") or 1.0)):
        todo.put(job)
    results: list[dict] = []

    def run_on(gpu: int) -> None:
        while True:
            try:
                job = todo.get_nowait()
            except queue.Empty:
                return
            started = time.time()
            say(f"GPU {gpu} bắt đầu {job['name']}")
            with open(WORK / "logs" / f"{job['name']}.log", "w", encoding="utf-8") as log:
                proc = subprocess.Popen([sys.executable, *job["args"], "--workers", str(workers)], cwd=CODE, env=dict(env, CUDA_VISIBLE_DEVICES=str(gpu)),
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
                assert proc.stdout is not None
                for line in proc.stdout:
                    log.write(line)
                    log.flush()
                    if line.startswith(("epoch", "===", "Traceback")) or "Error" in line:
                        print(f"[GPU {gpu} | {job['name']}] {line.rstrip()}", flush=True)
                code = proc.wait()
            results.append({"name": job["name"], "gpu": gpu, "exit_code": code, "minutes": round((time.time() - started) / 60, 1)})
            say(f"GPU {gpu} xong {job['name']} (mã thoát {code})")

    threads = [threading.Thread(target=run_on, args=(g,)) for g in range(gpus)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    (WORK / "tom-tat.json").write_text(json.dumps({"commit": COMMIT, "minutes": round((time.time() - STARTED) / 60, 1), "results": results},
                                                  ensure_ascii=False, indent=1), encoding="utf-8")
    say("xong cả lô")


try:
    main()
except Exception as error:  # vẫn lưu tóm tắt để máy nhà biết lô này hỏng ở đâu
    (WORK / "tom-tat.json").write_text(json.dumps({"commit": COMMIT, "error": repr(error)}, ensure_ascii=False), encoding="utf-8")
    raise
