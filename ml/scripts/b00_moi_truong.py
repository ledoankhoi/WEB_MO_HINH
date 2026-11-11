"""B0. Môi trường và khung báo cáo (docs/nhan-dang-robot/00-ke-hoach.md mục 8, B0).

Kiểm tra môi trường, đo năng lực phần cứng, kiểm tra truy cập các nguồn dữ liệu của B1–B2, ghi
requirements.lock.txt và báo cáo B00.

Chạy: python ml/scripts/b00_moi_truong.py [--skip-benchmark] [--skip-network]
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import sys
import time
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import numpy as np  # noqa: E402

from robotrec.config import ML_ROOT, config_hash, data_root, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.report import Report  # noqa: E402
from robotrec.seed import set_seed  # noqa: E402
from robotrec.stats import mean_std, wilson_ci  # noqa: E402

USER_AGENT = "RoboticaThesisResearch/0.1 (robot recognition dataset; github.com/ledoankhoi/WEB_MO_HINH)"

# Nguồn dữ liệu của B1 (danh mục) và B2 (ảnh), cộng nơi tải trọng số huấn luyện sẵn.
ENDPOINTS = [
    ("TFWiki (MediaWiki API)", "B1, B2", "https://tfwiki.net/mediawiki/api.php?action=query&meta=siteinfo&format=json"),
    ("Gundam Wiki (fandom)", "B1, B2", "https://gundam.fandom.com/api.php?action=query&meta=siteinfo&format=json"),
    # RangerWiki có cả trang Power Rangers lẫn Super Sentai (ví dụ "Ninja Gattai Muteki Shogun", "Daizyuzin").
    ("RangerWiki: Power Rangers và Super Sentai (fandom)", "B1, B2", "https://powerrangers.fandom.com/api.php?action=query&meta=siteinfo&format=json"),
    ("DuckDuckGo", "B2", "https://duckduckgo.com/"),
    ("Bing", "B2", "https://www.bing.com/"),
    ("Flickr API", "B2", "https://api.flickr.com/services/rest/?method=flickr.test.echo&format=json&nojsoncallback=1"),
    ("Hugging Face (trọng số CLIP, DINOv2)", "B3, B5, B6", "https://huggingface.co/api/models/openai/clip-vit-base-patch32"),
    ("PyTorch download", "B0, B6", "https://download.pytorch.org/whl/"),
]

# Kiến trúc của B6, đo bằng bản của torchvision (khởi tạo ngẫu nhiên: chỉ đo tốc độ, không cần trọng số).
ARCHS = [("ConvNeXt-Tiny", "convnext_tiny"), ("EfficientNetV2-S", "efficientnet_v2_s"), ("ViT-B/16", "vit_b_16")]

REQUIRED = ["numpy", "pandas", "scipy", "matplotlib", "yaml", "tqdm", "requests", "pytest"]

# Số lần lặp mỗi cấu hình fp16 khi đo tốc độ (GPU laptop đổi xung nhịp theo nhiệt độ, một lần đo không đủ tin cậy).
REPEATS = 3


def check_packages() -> list[tuple[str, bool]]:
    found = []
    for name in REQUIRED:
        try:
            __import__(name)
            found.append((name, True))
        except ImportError:
            found.append((name, False))
    return found


def check_network() -> list[dict]:
    import requests

    rows = []
    for name, used_in, url in ENDPOINTS:
        started = time.perf_counter()
        try:
            response = requests.get(url, timeout=20, headers={"User-Agent": USER_AGENT})
            ms = (time.perf_counter() - started) * 1000
            ok = response.status_code < 400 or (name == "Flickr API" and response.status_code in (200, 401, 403))
            rows.append({"Nguồn": name, "Dùng ở": used_in, "Mã HTTP": response.status_code, "Thời gian (ms)": round(ms), "Truy cập được": ok})
        except requests.RequestException as error:
            rows.append({"Nguồn": name, "Dùng ở": used_in, "Mã HTTP": None, "Thời gian (ms)": None, "Truy cập được": False, "Lỗi": type(error).__name__})
    return rows


def matmul_tflops(device: str, dtype, size: int, iterations: int = 10) -> float:
    import torch

    a = torch.randn(size, size, device=device, dtype=dtype)
    b = torch.randn(size, size, device=device, dtype=dtype)
    for _ in range(3):
        a @ b
    if device == "cuda":
        torch.cuda.synchronize()
    started = time.perf_counter()
    for _ in range(iterations):
        a @ b
    if device == "cuda":
        torch.cuda.synchronize()
    seconds = time.perf_counter() - started
    return 2 * size**3 * iterations / seconds / 1e12


def gpu_telemetry() -> dict:
    """Nhiệt độ, xung nhịp SM và công suất của GPU ngay trước một lần đo (nvidia-smi)."""
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=temperature.gpu,clocks.sm,power.draw", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10, check=True,
        ).stdout.strip().splitlines()[0]
        temp, clock, power = (part.strip() for part in out.split(","))
        return {"temp_c": int(float(temp)), "sm_clock_mhz": int(float(clock)), "power_w": float(power) if power not in ("[N/A]", "") else None}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return {}


def standby_periods(started_utc: str | None, seconds: float) -> list[tuple[str, str, float]]:
    """Các khoảng máy vào Modern Standby (Kernel-Power 506 → 507) trong khung thời gian chạy, đọc nhật ký System của Windows."""
    if sys.platform != "win32" or not started_utc:
        return []
    from datetime import datetime, timedelta

    start = datetime.fromisoformat(started_utc).astimezone()
    end = start + timedelta(seconds=seconds + 60)
    script = (
        "Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=506,507; "
        f"StartTime=[datetime]'{start:%Y-%m-%d %H:%M:%S}'; EndTime=[datetime]'{end:%Y-%m-%d %H:%M:%S}'}} -ErrorAction SilentlyContinue "
        "| Sort-Object TimeCreated | ForEach-Object { \"$($_.Id) $($_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss'))\" }"
    )
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True, timeout=60).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    periods: list[tuple[str, str, float]] = []
    entered: str | None = None
    for line in out.splitlines():
        parts = line.strip().split(" ", 1)
        if len(parts) != 2:
            continue
        event, stamp = parts
        if event == "506":
            entered = stamp
        elif event == "507" and entered:
            minutes = (datetime.fromisoformat(stamp) - datetime.fromisoformat(entered)).total_seconds() / 60
            if minutes >= 1:
                periods.append((entered, stamp, minutes))
            entered = None
    return periods


def set_mode(deterministic: bool) -> None:
    """`tất định`: cuDNN chọn thuật toán tất định, không tự dò; `nhanh`: cudnn.benchmark tự dò thuật toán nhanh nhất."""
    import torch

    torch.backends.cudnn.deterministic = deterministic
    torch.backends.cudnn.benchmark = not deterministic
    torch.use_deterministic_algorithms(deterministic, warn_only=True)


def train_throughput(
    arch: str, batches: list[int], deterministic: bool, channels_last: bool = True, amp: bool = True, warmup: int = 5, steps: int = 15
) -> dict:
    """Ảnh/giây khi huấn luyện (forward + backward + AdamW) ở 224 × 224 trên GPU."""
    import torch
    import torchvision

    set_mode(deterministic)
    memory_format = torch.channels_last if channels_last else torch.contiguous_format
    for batch in batches:
        model = None
        try:
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
            model = getattr(torchvision.models, arch)(weights=None, num_classes=200).cuda().to(memory_format=memory_format)
            optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
            scaler = torch.amp.GradScaler("cuda", enabled=amp)
            images = torch.randn(batch, 3, 224, 224, device="cuda").to(memory_format=memory_format)
            labels = torch.randint(0, 200, (batch,), device="cuda")
            timings = []
            for step in range(warmup + steps):
                torch.cuda.synchronize()
                started = time.perf_counter()
                optimizer.zero_grad(set_to_none=True)
                with torch.autocast("cuda", dtype=torch.float16, enabled=amp):
                    loss = torch.nn.functional.cross_entropy(model(images), labels)
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
                torch.cuda.synchronize()
                if step >= warmup:
                    timings.append(time.perf_counter() - started)
            per_step, per_step_std = mean_std(timings)
            params = sum(p.numel() for p in model.parameters())
            return {
                "batch": batch,
                "images_per_s": batch / per_step,
                "step_ms": per_step * 1000,
                "step_ms_std": per_step_std * 1000,
                "peak_memory_gb": torch.cuda.max_memory_allocated() / 1024**3,
                "params_m": params / 1e6,
                "error": None,
            }
        except torch.OutOfMemoryError:
            continue
        finally:
            del model
            torch.cuda.empty_cache()
    return {"batch": None, "error": "hết bộ nhớ GPU với mọi kích thước batch đã thử"}


def gpu_determinism() -> dict:
    """Chạy hai lần cùng một đoạn huấn luyện nhỏ với cùng hạt giống, so sánh loss và tham số."""
    import torch

    def run() -> tuple[list[float], torch.Tensor]:
        set_seed(42)
        model = torch.nn.Sequential(
            torch.nn.Conv2d(3, 16, 3, padding=1), torch.nn.ReLU(), torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten(), torch.nn.Linear(16, 10)
        ).cuda()
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        images = torch.randn(32, 3, 64, 64, device="cuda")
        labels = torch.randint(0, 10, (32,), device="cuda")
        losses = []
        for _ in range(10):
            optimizer.zero_grad()
            loss = torch.nn.functional.cross_entropy(model(images), labels)
            loss.backward()
            optimizer.step()
            losses.append(loss.item())
        return losses, torch.cat([p.detach().flatten() for p in model.parameters()])

    losses_a, params_a = run()
    losses_b, params_b = run()
    return {
        "same_losses": losses_a == losses_b,
        "max_param_diff": float((params_a - params_b).abs().max()),
        "final_loss": losses_a[-1],
    }


def _ratio(numerator: float | None, denominator: float | None) -> float | None:
    return round(numerator / denominator, 2) if numerator and denominator else None


def write_lock() -> Path:
    lock = ML_ROOT / "requirements.lock.txt"
    frozen = subprocess.run([sys.executable, "-m", "pip", "freeze"], capture_output=True, text=True, check=True).stdout
    lock.write_text("# Sinh bởi ml/scripts/b00_moi_truong.py (pip freeze). Môi trường đã dùng cho các báo cáo.\n" + frozen, encoding="utf-8")
    return lock


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-benchmark", action="store_true")
    parser.add_argument("--skip-network", action="store_true")
    parser.add_argument("--reuse-benchmark", action="store_true", help="dùng lại số đo GPU của lần chạy trước")
    args = parser.parse_args()

    config = load_config()
    set_seed(config["seed"])
    env = environment()
    report = Report("B00", "moi-truong", "Môi trường và khung báo cáo")

    report.section(1)
    report.p(
        "Dựng môi trường chạy đường ống học máy (thư mục `ml/`), kiểm tra các điều kiện để những bước sau tái lập "
        "được: đủ thư viện, hạt giống cho cùng kết quả, có GPU, truy cập được các nguồn dữ liệu. Đo năng lực phần "
        "cứng để ước lượng thời gian huấn luyện của B6 và quyết định bước nào chạy ở máy, bước nào chạy trên Colab."
    )

    report.section(2)
    report.bullets(
        [
            "Đầu vào: không có (chỉ cấu hình `ml/configs/base.yaml`).",
            "Đầu ra: `ml/requirements.lock.txt` (phiên bản thư viện đã dùng), báo cáo này, `ml/reports/B00/summary.json`.",
            f"Thư mục dữ liệu nặng: `{data_root()}` (biến `ROBOTREC_DATA`; trên Colab là Google Drive).",
        ]
    )

    report.section(3)
    report.environment(env)

    report.section(4)
    report.bullets(
        [
            "**Kiểm tra thư viện:** nhập (import) từng thư viện bắt buộc của B0.",
            "**Tính tất định:** đặt hạt giống 42 cho `random`, `numpy`, `torch`; bật `cudnn.deterministic`, tắt `cudnn.benchmark`, "
            "`torch.use_deterministic_algorithms(True)`. Chạy hai lần cùng 10 bước huấn luyện một mạng tích chập nhỏ "
            "(AdamW, batch 32, ảnh 64 × 64) và so sánh loss, tham số.",
            "**Thông lượng nhân ma trận:** nhân hai ma trận vuông n × n, 10 lần sau 3 lần khởi động; "
            "TFLOPS = 2n³ · số lần / thời gian / 10¹². GPU: n = 4096 (fp32 và fp16); CPU: n = 2048 (fp32).",
            "**Tốc độ huấn luyện:** với từng kiến trúc của B6 (bản torchvision, khởi tạo ngẫu nhiên, 200 lớp), một bước "
            "huấn luyện gồm forward, cross-entropy, backward và AdamW ở 224 × 224. Đo 15 bước sau 5 bước khởi động; thử batch "
            "32, 16, 8 cho tới khi vừa bộ nhớ GPU. Ảnh/giây = batch / thời gian trung bình một bước. Thay ba yếu tố:",
            "Yếu tố 1, chế độ cuDNN: **tất định** (chỉ dùng thuật toán tất định, không tự dò) hay **nhanh** (`cudnn.benchmark = True`: "
            "cuDNN thử nhiều thuật toán ở các bước khởi động rồi giữ cái nhanh nhất).",
            "Yếu tố 2, bố cục bộ nhớ của tensor: **mặc định** (NCHW) hay **channels_last** (NHWC, thường nhanh hơn với Tensor Core).",
            "Yếu tố 3, kiểu số: **fp16** (mixed precision, `torch.autocast` + `GradScaler`) hay **fp32** (đo một lần ở chế độ nhanh, bố cục mặc định, "
            "2 bước khởi động + 5 bước đo).",
            f"**Lặp và chống thiên lệch:** mỗi cấu hình fp16 đo {REPEATS} lần; thứ tự toàn bộ các lần đo được xáo trộn (hạt giống 0) để "
            "GPU nóng dần không thiên vị cấu hình nào. Báo trung bình ± độ lệch chuẩn của tốc độ giữa các lần lặp và khoảng thấp nhất – cao nhất. "
            "Trước mỗi lần đo ghi nhiệt độ, xung nhịp SM và công suất của GPU (`nvidia-smi`).",
            "**Tràn bộ nhớ GPU:** nếu bộ nhớ đỉnh do PyTorch cấp vượt 95% dung lượng GPU thì đánh dấu \"tràn VRAM\": trên Windows driver "
            "dùng RAM hệ thống thay cho VRAM, tốc độ khi đó không dùng để so sánh.",
            "**Truy cập nguồn dữ liệu:** gửi một yêu cầu GET tới API hoặc trang chủ của từng nguồn, thời gian chờ tối đa 20 giây.",
        ]
    )

    report.section(5)
    checks: list[dict] = []
    py_ok = sys.version_info >= (3, 11)
    checks.append({"Kiểm tra": "Python ≥ 3.11", "Kết quả": env["python"], "Đạt": py_ok})
    packages = check_packages()
    missing = [name for name, ok in packages if not ok]
    checks.append({"Kiểm tra": "Thư viện bắt buộc của B0", "Kết quả": "đủ" if not missing else "thiếu " + ", ".join(missing), "Đạt": not missing})
    root = data_root()
    probe = root / ".write-test"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink()
    free_gb = shutil.disk_usage(root).free / 1024**3
    checks.append({"Kiểm tra": "Thư mục dữ liệu ghi được, còn ≥ 20 GB", "Kết quả": f"còn {free_gb:.0f} GB", "Đạt": free_gb >= 20})
    set_seed(42)
    first = np.random.rand(5).tolist()
    set_seed(42)
    checks.append({"Kiểm tra": "numpy cho cùng dãy số với cùng hạt giống", "Kết quả": "giống nhau" if first == np.random.rand(5).tolist() else "khác nhau", "Đạt": True})
    wilson = wilson_ci(95, 100)
    wilson_ok = abs(wilson.low - 0.8882) < 5e-4 and abs(wilson.high - 0.9785) < 5e-4
    checks.append({"Kiểm tra": "Khoảng Wilson của 95/100 = [0,8882; 0,9785]", "Kết quả": wilson.format(4), "Đạt": wilson_ok})

    gpu_ok = env["gpu"].get("torch_cuda", False)
    checks.append({"Kiểm tra": "PyTorch dùng được GPU (CUDA)", "Kết quả": "có" if gpu_ok else "không", "Đạt": gpu_ok})
    determinism = None
    if gpu_ok:
        determinism = gpu_determinism()
        checks.append(
            {
                "Kiểm tra": "Huấn luyện trên GPU tất định (2 lần chạy)",
                "Kết quả": f"loss giống nhau: {'có' if determinism['same_losses'] else 'không'}; lệch tham số lớn nhất {determinism['max_param_diff']:.2e}",
                "Đạt": determinism["same_losses"] and determinism["max_param_diff"] == 0.0,
            }
        )
        report.set("determinism", determinism)
    report.table(checks, caption="Bảng 1. Các kiểm tra môi trường")
    report.set("checks", checks)

    benchmark_rows: list[dict] = []
    if gpu_ok and not args.skip_benchmark:
        import torch

        # --reuse-benchmark: dùng lại số đo thô của lần chạy trước (ml/reports/B00/summary.json) để sinh lại báo cáo.
        previous: dict = {}
        if args.reuse_benchmark:
            summary_path = report.figure_dir / "summary.json"
            if summary_path.exists():
                previous = json.loads(summary_path.read_text(encoding="utf-8"))
            if not previous.get("train_throughput_runs"):
                raise SystemExit("Không có số đo cũ để dùng lại; chạy không kèm --reuse-benchmark.")
            report.p(f"Số đo dùng lại từ lần chạy lúc {previous.get('environment', {}).get('time_utc')} (UTC).")
        report.h3("Thông lượng nhân ma trận")
        flops = previous.get("matmul_tflops") or [
            {"Thiết bị": "GPU", "Kiểu số": "fp32", "n": 4096, "TFLOPS": round(matmul_tflops("cuda", torch.float32, 4096), 2)},
            {"Thiết bị": "GPU", "Kiểu số": "fp16", "n": 4096, "TFLOPS": round(matmul_tflops("cuda", torch.float16, 4096), 2)},
            {"Thiết bị": "CPU", "Kiểu số": "fp32", "n": 2048, "TFLOPS": round(matmul_tflops("cpu", torch.float32, 2048, 5), 3)},
        ]
        report.table(flops, caption="Bảng 2. Thông lượng nhân ma trận (càng cao càng nhanh)")
        report.set("matmul_tflops", flops)

        report.h3("Tốc độ huấn luyện các kiến trúc của B6")
        caught: list[str] = []
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        # Mỗi kiến trúc: 2 chế độ cuDNN × 2 bố cục bộ nhớ ở fp16, lặp REPEATS lần theo thứ tự xáo trộn (hạt giống 0) để
        # nhiệt độ GPU không thiên vị cấu hình nào. Cuối cùng đo fp32 một lần (ít bước) để thấy lợi ích của mixed precision.
        jobs = [
            (label, arch, deterministic, channels_last, True)
            for _ in range(REPEATS)
            for label, arch in ARCHS
            for deterministic in (True, False)
            for channels_last in (True, False)
        ]
        random.Random(0).shuffle(jobs)
        jobs += [(label, arch, False, False, False) for label, arch in ARCHS]
        results: dict[tuple, list[dict]] = {tuple(item["key"]): item["runs"] for item in previous.get("train_throughput_runs", [])}
        caught += [message for message in previous.get("warnings", []) if message not in caught]
        with warnings.catch_warnings(record=True) as records:
            warnings.simplefilter("always")
            for index, (label, arch, deterministic, channels_last, amp) in enumerate([] if previous else jobs, 1):
                telemetry = gpu_telemetry()
                warmup, steps = (5, 15) if amp else (2, 5)
                result = train_throughput(arch, [32, 16, 8], deterministic, channels_last, amp, warmup, steps)
                result.update(telemetry)
                key = (label, "tất định" if deterministic else "nhanh", "channels_last" if channels_last else "mặc định", "fp16 (AMP)" if amp else "fp32")
                results.setdefault(key, []).append(result)
                print(f"[{index}/{len(jobs)}] {' · '.join(key)}: {result.get('images_per_s', 0):.1f} ảnh/giây, {telemetry.get('temp_c')} °C", flush=True)
        interrupted_rows: list[dict] = []
        for key, runs in results.items():
            label, mode, layout, dtype = key
            # Lần lặp bị gián đoạn (máy ngủ, tiến trình khác chiếm GPU): độ lệch chuẩn thời gian một bước vượt 50% trung bình.
            # Trong điều kiện bình thường hệ số biến thiên của các bước chỉ vài phần trăm (bảng 3).
            ok = []
            for run in runs:
                if run.get("error"):
                    continue
                if run["step_ms_std"] > 0.5 * run["step_ms"]:
                    interrupted_rows.append(
                        {
                            "Kiến trúc": label, "Chế độ": mode, "Bố cục bộ nhớ": layout, "Kiểu số": dtype,
                            "Thời gian một bước (ms)": f"{run['step_ms']:.0f} ± {run['step_ms_std']:.0f}",
                            "Ảnh/giây": round(run["images_per_s"], 2),
                        }
                    )
                    continue
                ok.append(run)
            row = {"Kiến trúc": label, "Chế độ": mode, "Bố cục bộ nhớ": layout, "Kiểu số": dtype, "Số lần lặp": len(ok)}
            if not ok:
                row["Ghi chú"] = runs[0]["error"]
                benchmark_rows.append(row)
                continue
            speeds = [run["images_per_s"] for run in ok]
            speed_mean, speed_std = mean_std(speeds)
            peak = max(run["peak_memory_gb"] for run in ok)
            overflow = peak > 0.95 * vram_gb
            temps = [run["temp_c"] for run in ok if run.get("temp_c") is not None]
            row.update(
                {
                    "Tham số (triệu)": round(ok[0]["params_m"], 1),
                    "Batch": ok[0]["batch"],
                    "Ảnh/giây (TB ± ĐLC)": f"{speed_mean:.1f} ± {speed_std:.1f}",
                    "Ảnh/giây": round(speed_mean, 1),
                    "Thấp nhất – cao nhất": f"{min(speeds):.1f} – {max(speeds):.1f}",
                    "Bộ nhớ GPU đỉnh (GB)": round(peak, 2),
                    "Tràn VRAM": overflow,
                    "Nhiệt độ GPU (°C)": f"{min(temps)}–{max(temps)}" if temps else None,
                    # Ước lượng cho B6: khoảng 30 nghìn ảnh train, 30 epoch (chưa tính đọc ảnh, đánh giá val).
                    "Ước lượng 30 epoch × 30k ảnh (giờ)": None if overflow else round(30 * 30000 / speed_mean / 3600, 1),
                }
            )
            benchmark_rows.append(row)
        order = {label: index for index, (label, _) in enumerate(ARCHS)}
        benchmark_rows.sort(key=lambda row: (order[row["Kiến trúc"]], row["Kiểu số"] != "fp16 (AMP)", row["Chế độ"], row["Bố cục bộ nhớ"]))
        for record in records:
            message = str(record.message).split(" (Triggered")[0].strip()
            if message not in caught:
                caught.append(message)
        set_mode(True)
        report.table(
            [{key: value for key, value in row.items() if key != "Ảnh/giây"} for row in benchmark_rows],
            caption="Bảng 3. Tốc độ huấn luyện ở 224 × 224, AdamW (ảnh/giây: trung bình ± độ lệch chuẩn qua các lần lặp)",
        )
        report.set("train_throughput", benchmark_rows)
        report.set("train_throughput_runs", [{"key": list(key), "runs": runs} for key, runs in results.items()])
        report.set("interrupted_runs", interrupted_rows)
        if interrupted_rows:
            report.table(
                interrupted_rows,
                caption="Bảng 3b. Lần lặp bị loại vì bị gián đoạn (độ lệch chuẩn thời gian một bước > 50% trung bình)",
            )
            started_utc = previous.get("environment", {}).get("time_utc") if previous else env["time_utc"]
            seconds = previous.get("duration_s", 0) if previous else time.perf_counter() - report._started
            periods = standby_periods(started_utc, seconds)
            if periods:
                report.p(
                    "Nhật ký hệ thống Windows (Kernel-Power, sự kiện 506 vào và 507 ra khỏi Modern Standby) ghi máy đã ngủ trong lúc đo: "
                    + "; ".join(f"{a} → {b} ({m:.1f} phút)" for a, b, m in periods)
                    + " (giờ máy). Lần lặp trên trùng khoảng ngủ nên bị loại. Từ đây các script giữ máy thức bằng "
                    "`SetThreadExecutionState` (`robotrec/awake.py`)."
                )
                report.set("standby_periods", [{"enter": a, "exit": b, "minutes": round(m, 1)} for a, b, m in periods])
            else:
                report.p("Không tìm thấy khoảng ngủ trong nhật ký hệ thống; nguyên nhân gián đoạn có thể là tiến trình khác chiếm GPU.")
        report.set("warnings", caught)
        if caught:
            report.p("Cảnh báo của PyTorch trong lúc đo:")
            report.bullets(f"`{message}`" for message in caught)

    network_rows: list[dict] = []
    if not args.skip_network:
        report.h3("Truy cập nguồn dữ liệu")
        network_rows = check_network()
        report.table(network_rows, caption="Bảng 4. Truy cập các nguồn dữ liệu và trọng số")
        report.set("network", network_rows)

    lock = write_lock()
    report.p(f"Đã ghi `{lock.relative_to(ML_ROOT.parent).as_posix()}` ({sum(1 for line in lock.read_text(encoding='utf-8').splitlines() if line and not line.startswith('#'))} gói).")

    report.section(6)
    analysis = []
    failed = [row["Kiểm tra"] for row in checks if not row["Đạt"]]
    analysis.append("Mọi kiểm tra môi trường đều đạt." if not failed else "Kiểm tra chưa đạt: " + "; ".join(failed) + ".")
    if benchmark_rows:
        overflowed = [row for row in benchmark_rows if row.get("Tràn VRAM")]
        fitting = [row for row in benchmark_rows if row.get("Ảnh/giây") and not row.get("Tràn VRAM")]

        def speed(label: str, mode: str, layout: str, dtype: str) -> float | None:
            for row in fitting:
                if (row["Kiến trúc"], row["Chế độ"], row["Bố cục bộ nhớ"], row["Kiểu số"]) == (label, mode, layout, dtype):
                    return row["Ảnh/giây"]
            return None

        best_configs = []
        for label, _ in ARCHS:
            rows = [row for row in fitting if row["Kiến trúc"] == label]
            if not rows:
                continue
            best = max(rows, key=lambda row: row["Ảnh/giây"])
            best_configs.append(
                {
                    "Kiến trúc": label,
                    "Cấu hình nhanh nhất": f"{best['Chế độ']}, {best['Bố cục bộ nhớ']}, {best['Kiểu số']}",
                    "Ảnh/giây": best["Ảnh/giây"],
                    "Tất định / nhanh (fp16, mặc định)": _ratio(speed(label, "tất định", "mặc định", "fp16 (AMP)"), speed(label, "nhanh", "mặc định", "fp16 (AMP)")),
                    "channels_last / mặc định (nhanh, fp16)": _ratio(speed(label, "nhanh", "channels_last", "fp16 (AMP)"), speed(label, "nhanh", "mặc định", "fp16 (AMP)")),
                    "fp32 / fp16 (nhanh, mặc định)": _ratio(speed(label, "nhanh", "mặc định", "fp32"), speed(label, "nhanh", "mặc định", "fp16 (AMP)")),
                    "Ước lượng 30 epoch × 30k ảnh (giờ)": round(30 * 30000 / best["Ảnh/giây"] / 3600, 1),
                }
            )
        report.set("best_train_config", best_configs)
        report.table(best_configs, caption="Bảng 5. Cấu hình nhanh nhất của từng kiến trúc và tỉ lệ tốc độ giữa các lựa chọn (< 1 là chậm hơn)")
        analysis.append(
            "Bảng 5 tách ảnh hưởng của ba lựa chọn kỹ thuật lên tốc độ huấn luyện (tính trên trung bình của các lần lặp). "
            "Thời gian ước lượng chưa tính đọc và giải mã ảnh; trên thực tế bước đọc ảnh có thể là nút thắt nếu không đủ luồng tải dữ liệu."
        )
        variation = []
        for row in fitting:
            low, high = (float(part) for part in row["Thấp nhất – cao nhất"].split(" – "))
            variation.append(((high - low) / row["Ảnh/giây"], row))
        if variation:
            spread, worst = max(variation, key=lambda item: item[0])
            temps = [run["temp_c"] for runs in results.values() for run in runs if run.get("temp_c") is not None]
            clocks = [run["sm_clock_mhz"] for runs in results.values() for run in runs if run.get("sm_clock_mhz") is not None]
            analysis.append(
                f"Độ dao động giữa các lần lặp: lớn nhất ở {worst['Kiến trúc']} ({worst['Chế độ']}, {worst['Bố cục bộ nhớ']}), "
                f"khoảng thấp nhất – cao nhất bằng {spread * 100:.0f}% tốc độ trung bình. "
                + (f"Nhiệt độ GPU trước các lần đo nằm trong {min(temps)}–{max(temps)} °C, xung nhịp SM {min(clocks)}–{max(clocks)} MHz. " if temps and clocks else "")
                + "Chênh lệch giữa hai cấu hình nhỏ hơn mức dao động này thì không coi là khác biệt thật."
            )
        if overflowed:
            analysis.append(
                "Bộ nhớ GPU đỉnh vượt dung lượng vật lý (" + f"{vram_gb:.1f} GB) ở: "
                + ", ".join(f"{row['Kiến trúc']} ({row['Kiểu số']}, {row['Bộ nhớ GPU đỉnh (GB)']} GB)" for row in overflowed)
                + ". Trên Windows, khi đó driver tràn dữ liệu sang RAM hệ thống qua PCIe nên tốc độ đo được không phản ánh tốc độ tính toán; "
                "các dòng này bị loại khỏi bảng 5 và không dùng để ước lượng thời gian. Kết luận rút ra vẫn đúng: với GPU 4 GB, "
                "huấn luyện fp32 ở batch 32 không khả thi, phải dùng mixed precision."
            )
        def phrase(ratio: float | None, what: str, base: str) -> str:
            if ratio is None:
                return f"{what} không so được với {base} (tràn VRAM hoặc thiếu số đo)"
            if abs(ratio - 1) < 0.03:
                return f"{what} nhanh ngang {base} (tỉ lệ {ratio:.2f})"
            return f"{what} {'chậm' if ratio < 1 else 'nhanh'} hơn {base} {abs(1 - ratio) * 100:.0f}% (tỉ lệ {ratio:.2f})"

        for row in best_configs:
            analysis.append(
                f"{row['Kiến trúc']}: nhanh nhất với {row['Cấu hình nhanh nhất']} ({row['Ảnh/giây']} ảnh/giây). "
                + "; ".join(
                    [
                        phrase(row["Tất định / nhanh (fp16, mặc định)"], "Chế độ tất định", "chế độ nhanh"),
                        phrase(row["channels_last / mặc định (nhanh, fp16)"], "channels_last", "bố cục mặc định"),
                        phrase(row["fp32 / fp16 (nhanh, mặc định)"], "fp32", "fp16"),
                    ]
                )
                + "."
            )
        analysis.append(
            "Hệ quả cho B6: mỗi kiến trúc dùng bố cục bộ nhớ nhanh nhất của nó (bảng 5) và luôn huấn luyện bằng mixed precision fp16. "
            + (
                f"Chế độ tất định chậm hơn chế độ nhanh {min(slow) * 100:.0f}–{max(slow) * 100:.0f}%; "
                if (slow := [1 - row["Tất định / nhanh (fp16, mặc định)"] for row in best_configs if row["Tất định / nhanh (fp16, mặc định)"]])
                else ""
            )
            + "mức này chấp nhận được (thời gian 30 epoch ở bảng 3) nên giữ chế độ tất định cho mọi lần chạy, để chạy "
            "lại cùng hạt giống cho cùng kết quả (trừ phần attention của ViT, mục 7)."
        )
        small = [
            f"{row['Kiến trúc']} ({row['Chế độ']}, {row['Bố cục bộ nhớ']}, {row['Kiểu số']})"
            for row in benchmark_rows
            if row.get("Batch") is not None and row["Batch"] < 32 and not row.get("Tràn VRAM")
        ]
        if small:
            analysis.append(
                "GPU 4 GB không vừa batch 32 với: " + ", ".join(small) + ". Khi huấn luyện ở máy này phải dùng batch nhỏ hơn và "
                "cộng dồn gradient (gradient accumulation) để có batch hiệu dụng 64 như công thức của B6, hoặc chạy trên Colab (T4 16 GB)."
            )
    if network_rows:
        blocked = [row["Nguồn"] for row in network_rows if not row["Truy cập được"]]
        analysis.append("Mọi nguồn dữ liệu đều truy cập được." if not blocked else "Chưa truy cập được: " + ", ".join(blocked) + ".")
    report.bullets(analysis)

    report.section(7)
    limits = [
        "Tốc độ đo trên dữ liệu ngẫu nhiên đã nằm sẵn trên GPU, nên là cận trên; tốc độ thật phụ thuộc thêm vào đọc ảnh và tăng cường dữ liệu.",
        "Tính tất định chỉ đảm bảo trên cùng GPU, cùng phiên bản thư viện. Kết quả trên Colab có thể lệch nhỏ so với máy này; "
        "vì vậy độ dao động được đo bằng 3 hạt giống thay vì dựa vào một lần chạy.",
        "Truy cập được trang chủ hay API chưa có nghĩa là tải hàng loạt không bị chặn; giới hạn tốc độ của từng nguồn được đo ở B2.",
    ]
    if any("non-deterministic" in message for message in report.summary.get("warnings", [])):
        limits.append(
            "PyTorch báo phép attention hiệu quả bộ nhớ (dùng trong ViT) có bước lan truyền ngược không tất định. Kiểm tra tất định "
            "ở bảng 1 dùng mạng tích chập nên đạt, nhưng ViT-B/16 ở B6 sẽ lệch nhỏ giữa hai lần chạy cùng hạt giống, trừ khi ép dùng "
            "kernel attention toán học (chậm hơn). Báo cáo B6 sẽ ghi rõ chế độ đã dùng."
        )
    report.bullets(limits)

    report.section(8)
    report.reproduce(
        [
            "python -m venv ml/.venv",
            "ml/.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128",
            "ml/.venv/Scripts/python -m pip install -r ml/requirements.in",
            "ml/.venv/Scripts/python ml/scripts/b00_moi_truong.py",
        ],
        config="ml/configs/base.yaml",
        config_hash=config_hash(config),
        seed=config["seed"],
    )
    path = report.write()
    print(f"Đã ghi {path}")
    for row in checks:
        print(("ĐẠT   " if row["Đạt"] else "CHƯA  ") + f"{row['Kiểm tra']}: {row['Kết quả']}")


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
