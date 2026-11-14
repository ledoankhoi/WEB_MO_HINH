"""B7. Thí nghiệm phụ: đổi một yếu tố mỗi lần so với cấu hình chính của B6 (ablation A1–A5) và đường học theo lượng dữ liệu (A6).

Mỗi lần chạy ghi vào `<ROBOTREC_RUNS>/b07/<mã>-<kiến trúc>-s<hạt giống>/` giống B6 (chạy tiếp được khi bị ngắt). Lần chạy A6 ghi thêm
logits trên chính các ảnh train của nó (tiền xử lý của val) để đo lỗi trên train. A7 (TTA) đo ở `b07_bao_cao.py`.

Chạy:
  ml/.venv/Scripts/python ml/scripts/b07_thi_nghiem_phu.py --arch convnext_tiny --all        # mọi thí nghiệm theo thứ tự của cấu hình
  ml/.venv/Scripts/python ml/scripts/b07_thi_nghiem_phu.py --arch convnext_tiny --exp A1
  ml/.venv/Scripts/python ml/scripts/b07_thi_nghiem_phu.py --arch convnext_tiny --exp A4 --smoke --device cpu   # chạy thử rất nhỏ
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from b06_huan_luyen import load_split, runs_root  # noqa: E402
from robotrec.config import MANIFESTS, REPORTS, config_hash, data_root, file_sha256, load_config  # noqa: E402


def subsample(rows: pd.DataFrame, fraction: float, seed: int) -> pd.DataFrame:
    """Giữ ⌈fraction · n_c⌉ ảnh của mỗi lớp c (ít nhất 1), chọn ngẫu nhiên theo hạt giống."""
    parts = [part.sample(max(1, math.ceil(fraction * len(part))), random_state=seed) for _, part in rows.groupby("class", sort=True)]
    return pd.concat(parts).sort_index().reset_index(drop=True)


def run_experiment(exp_id: str, arch: str, seed: int, fraction: float | None, cfg6: dict, cfg7: dict, args: argparse.Namespace) -> dict:
    import timm
    import torch

    from robotrec.env import environment
    from robotrec.seed import set_seed
    from robotrec.train import ImageFiles, fit, predict, transforms_for

    exp = cfg7["experiments"][exp_id]
    spec = cfg6["architectures"][arch]
    timm_name = exp.get("timm", {}).get(arch, spec["timm"])
    train_cfg = {**cfg6["train"], "seed": seed, "layer_decay": spec["layer_decay"], "lr": spec["lr"], **exp.get("train", {})}
    aug = {**cfg6["aug"], **exp.get("aug", {})}
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    if device == "cuda" and args.micro_batch is None and torch.cuda.get_device_properties(0).total_memory < 10 * 1024**3:
        train_cfg["micro_batch"] = min(train_cfg["micro_batch"], 32)
    if args.micro_batch:
        train_cfg["micro_batch"] = args.micro_batch
    train_cfg["workers"] = args.workers if args.workers is not None else min(8, os.cpu_count() or 2)
    limits = (None, None)
    folder = "b07"
    if args.smoke:
        train_cfg.update(epochs_head=1, epochs_max=2, patience=99, batch_size=16, micro_batch=8)
        limits = (64, 32)
        folder = "b07-chay-thu"
    name = f"{exp_id}" + (f"-{int(round(100 * fraction))}" if fraction else "") + f"-{arch}-s{seed}"
    out_dir = runs_root() / folder / name
    if (out_dir / "result.json").exists() and json.loads((out_dir / "result.json").read_text(encoding="utf-8")).get("finished"):
        print(f"{name}: đã xong, bỏ qua")
        return json.loads((out_dir / "result.json").read_text(encoding="utf-8"))

    known = sorted(pd.read_csv(MANIFESTS / "b04_splits.csv.gz", usecols=["class", "split"]).query("split == 'train'")["class"].unique())
    classes = {slug: i for i, slug in enumerate(known)}
    train_rows = load_split("train", classes, None, seed)
    if fraction:
        train_rows = subsample(train_rows, fraction, seed)
    if limits[0]:
        train_rows = train_rows.sample(min(limits[0], len(train_rows)), random_state=seed).reset_index(drop=True)
    val_rows = load_split("val", classes, limits[1], seed)
    image_root = data_root() / "images" / "raw"

    set_seed(seed, deterministic=True)
    model = timm.create_model(timm_name, pretrained=True, num_classes=len(classes))
    mean, std = model.pretrained_cfg["mean"], model.pretrained_cfg["std"]
    eval_transform = transforms_for(mean, std, False, cfg6["image"]["size"], cfg6["image"]["resize"])
    train_set = ImageFiles([image_root / f for f in train_rows["file"]], train_rows["label"].to_numpy(),
                           transforms_for(mean, std, True, cfg6["image"]["size"], cfg6["image"]["resize"], aug))
    val_set = ImageFiles([image_root / f for f in val_rows["file"]], val_rows["label"].to_numpy(), eval_transform)
    out_dir.mkdir(parents=True, exist_ok=True)
    b04 = json.loads((REPORTS / "B04" / "summary.json").read_text(encoding="utf-8"))
    meta = {"experiment": exp_id, "label": exp["label"], "arch": arch, "arch_label": spec["label"], "timm": timm_name, "seed": seed, "fraction": fraction,
            "train": train_cfg, "aug": aug, "image": cfg6["image"], "mean": list(mean), "std": list(std), "classes": known,
            "dataset_version": b04["dataset_version"], "splits_sha256": file_sha256(MANIFESTS / "b04_splits.csv.gz"),
            "config_hash": config_hash({"b06": cfg6, "b07": cfg7}), "smoke": bool(args.smoke), "train_images": len(train_rows), "val_images": len(val_rows),
            "params": sum(p.numel() for p in model.parameters()), "environment": environment()}
    if not (out_dir / "config.json").exists():
        (out_dir / "config.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        (out_dir / "val_keys.json").write_text(json.dumps(val_rows["key"].tolist()), encoding="utf-8")
    print(f"\n=== {exp_id} {exp['label']}" + (f" ({int(round(100 * fraction))}%)" if fraction else "") + f" | {spec['label']} | hạt giống {seed} | "
          f"train {len(train_rows)} ảnh, val {len(val_rows)} ảnh | {device} | {out_dir}")
    started = time.monotonic()
    result = fit(model, train_set, train_rows["label"].to_numpy(), val_set, val_rows["label"].to_numpy(), len(classes), train_cfg, out_dir, device)
    if fraction and not (out_dir / "train_logits.npy").exists():  # lỗi trên chính ảnh train (không tăng cường) cho đường học theo lượng dữ liệu
        clean = ImageFiles([image_root / f for f in train_rows["file"]], train_rows["label"].to_numpy(), eval_transform)
        np.save(out_dir / "train_logits.npy", predict(model, clean, device, 128, train_cfg["workers"], device == "cuda"))
        (out_dir / "train_keys.json").write_text(json.dumps(train_rows["key"].tolist()), encoding="utf-8")
    best = result["best"]
    print(f"=== Xong {name}: epoch tốt nhất {best['epoch']}, val top-1 {100 * best['val_top1']:.2f}%, macro-F1 {100 * best['val_macro_f1']:.2f}% | "
          f"{(time.monotonic() - started) / 60:.1f} phút")
    del model
    if device == "cuda":
        torch.cuda.empty_cache()
    return result


def jobs_for(exp_id: str, arch: str, cfg7: dict) -> list[tuple[str, int, float | None]]:
    exp = cfg7["experiments"][exp_id]
    if "only" in exp and arch not in exp["only"]:
        return []
    seeds = cfg7["seeds_all"] if exp.get("seeds") == "all" else cfg7["seeds_one"]
    fractions = exp.get("fractions") or [None]
    return [(exp_id, seed, fraction) for fraction in fractions for seed in seeds]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", required=True, help="kiến trúc được chọn ở B6")
    parser.add_argument("--exp", help="A1 | A2 | A3 | A4 | A5 | A6")
    parser.add_argument("--all", action="store_true", help="mọi thí nghiệm theo thứ tự của cấu hình")
    parser.add_argument("--seed", type=int, help="chỉ chạy hạt giống này (chia việc giữa nhiều máy)")
    parser.add_argument("--fraction", type=float, help="A6: chỉ chạy tỉ lệ dữ liệu này")
    parser.add_argument("--smoke", action="store_true", help="chạy thử rất nhỏ (64 ảnh train, 32 ảnh val, 2 epoch)")
    parser.add_argument("--device", choices=["cuda", "cpu"])
    parser.add_argument("--micro-batch", type=int)
    parser.add_argument("--workers", type=int)
    args = parser.parse_args()
    cfg6, cfg7 = load_config("b06_huan_luyen"), load_config("b07_thi_nghiem_phu")
    if args.arch not in cfg6["architectures"]:
        parser.error(f"không có kiến trúc {args.arch}")
    experiments = cfg7["order"] if args.all else [args.exp]
    if not experiments or experiments == [None]:
        parser.error("cần --exp hoặc --all")
    jobs = [job for exp_id in experiments for job in jobs_for(exp_id, args.arch, cfg7)]
    jobs = [(e, s, f) for e, s, f in jobs if (args.seed is None or s == args.seed)
            and (args.fraction is None or (f is not None and abs(f - args.fraction) < 1e-9))]
    if not jobs:
        parser.error("không có lần chạy nào khớp --exp/--seed/--fraction")
    if args.smoke:
        jobs = jobs[:1]
    for exp_id, seed, fraction in jobs:
        run_experiment(exp_id, args.arch, seed, fraction, cfg6, cfg7, args)


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
