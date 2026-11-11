"""B6. Huấn luyện chính: tinh chỉnh 3 kiến trúc × 3 hạt giống trên tập train của B4 (thí nghiệm E2).

Mỗi lần chạy ghi vào `<ROBOTREC_RUNS>/b06/<kiến trúc>-s<hạt giống>/`: config.json, history.csv, best.pt,
val_logits.npy, result.json; last.pt trong lúc chạy (bị ngắt thì chạy lại đúng lệnh là tiếp tục từ epoch đã xong).
ROBOTREC_RUNS mặc định là `<ROBOTREC_DATA>/runs`; trên Colab đặt vào Google Drive để không mất khi phiên bị ngắt.
Tập test KHÔNG được dùng ở bước này (chỉ dùng ở B8).

Chạy:
  ml/.venv/Scripts/python ml/scripts/b06_huan_luyen.py --all                  # cả 9 lần chạy, bỏ qua lần đã xong
  ml/.venv/Scripts/python ml/scripts/b06_huan_luyen.py --arch convnext_tiny --seed 42
  ml/.venv/Scripts/python ml/scripts/b06_huan_luyen.py --smoke --arch vit_b16_clip   # chạy thử nhanh, đo tốc độ
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from robotrec.config import MANIFESTS, config_hash, data_root, file_sha256, load_config  # noqa: E402


def runs_root() -> Path:
    root = Path(os.environ.get("ROBOTREC_RUNS") or data_root() / "runs")
    root.mkdir(parents=True, exist_ok=True)
    return root


def load_split(name: str, classes: dict[str, int], limit: int | None, seed: int) -> pd.DataFrame:
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    rows = splits[splits["split"] == name].reset_index(drop=True)
    if limit and limit < len(rows):
        rows = rows.sample(limit, random_state=seed).reset_index(drop=True)
    rows["label"] = rows["class"].map(classes)
    return rows


def run_one(arch: str, seed: int, cfg: dict, args: argparse.Namespace) -> dict:
    import timm
    import torch

    from robotrec.env import environment
    from robotrec.seed import set_seed
    from robotrec.train import ImageFiles, fit, transforms_for

    spec = cfg["architectures"][arch]
    train_cfg = {**cfg["train"], "seed": seed, "layer_decay": spec["layer_decay"], "lr": spec["lr"]}
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and args.micro_batch is None and torch.cuda.get_device_properties(0).total_memory < 10 * 1024**3:
        train_cfg["micro_batch"] = min(train_cfg["micro_batch"], 32)
    if args.micro_batch:
        train_cfg["micro_batch"] = args.micro_batch
    train_cfg["workers"] = args.workers if args.workers is not None else min(8, os.cpu_count() or 2)
    limits = (None, None)
    folder = "b06"
    if args.smoke:
        smoke = cfg["smoke"]
        train_cfg.update(epochs_head=smoke["epochs_head"], epochs_max=smoke["epochs_max"], patience=99)
        limits = (smoke["train_images"], smoke["val_images"])
        folder = "b06-chay-thu"
    out_dir = runs_root() / folder / f"{arch}-s{seed}"
    if (out_dir / "result.json").exists() and json.loads((out_dir / "result.json").read_text(encoding="utf-8")).get("finished"):
        print(f"{spec['label']} hạt giống {seed}: đã xong, bỏ qua ({out_dir})")
        return json.loads((out_dir / "result.json").read_text(encoding="utf-8"))

    known = sorted(pd.read_csv(MANIFESTS / "b04_splits.csv.gz", usecols=["class", "split"]).query("split == 'train'")["class"].unique())
    classes = {slug: i for i, slug in enumerate(known)}
    train_rows = load_split("train", classes, limits[0], seed)
    val_rows = load_split("val", classes, limits[1], seed)
    image_root = data_root() / "images" / "raw"
    missing = [f for f in pd.concat([train_rows, val_rows])["file"] if not (image_root / f).exists()]
    if missing:
        raise SystemExit(f"Thiếu {len(missing)} file ảnh trong {image_root} (ví dụ {missing[:3]}). Giải nén images-raw.zip vào {image_root.parent}.")

    set_seed(seed, deterministic=True)
    model = timm.create_model(spec["timm"], pretrained=True, num_classes=len(classes))
    mean, std = model.pretrained_cfg["mean"], model.pretrained_cfg["std"]
    train_set = ImageFiles([image_root / f for f in train_rows["file"]], train_rows["label"].to_numpy(),
                           transforms_for(mean, std, True, cfg["image"]["size"], cfg["image"]["resize"], cfg["aug"]))
    val_set = ImageFiles([image_root / f for f in val_rows["file"]], val_rows["label"].to_numpy(),
                         transforms_for(mean, std, False, cfg["image"]["size"], cfg["image"]["resize"]))
    out_dir.mkdir(parents=True, exist_ok=True)
    b04 = json.loads((Path(__file__).resolve().parents[1] / "reports" / "B04" / "summary.json").read_text(encoding="utf-8"))
    meta = {
        "arch": arch, "label": spec["label"], "timm": spec["timm"], "seed": seed, "train": train_cfg, "aug": cfg["aug"], "image": cfg["image"],
        "mean": list(mean), "std": list(std), "classes": known, "dataset_version": b04["dataset_version"],
        "splits_sha256": file_sha256(MANIFESTS / "b04_splits.csv.gz"), "config_hash": config_hash(cfg), "smoke": bool(args.smoke),
        "train_images": len(train_rows), "val_images": len(val_rows), "params": sum(p.numel() for p in model.parameters()),
        "environment": environment(),
    }
    if not (out_dir / "config.json").exists():
        (out_dir / "config.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        (out_dir / "val_keys.json").write_text(json.dumps(val_rows["key"].tolist()), encoding="utf-8")  # thứ tự hàng của val_logits.npy
    print(f"\n=== {spec['label']} | hạt giống {seed} | train {len(train_rows)} ảnh, val {len(val_rows)} ảnh, {len(classes)} lớp | "
          f"batch {train_cfg['batch_size']} (micro {train_cfg['micro_batch']}) | {device} | {out_dir}")
    started = time.monotonic()
    result = fit(model, train_set, train_rows["label"].to_numpy(), val_set, val_rows["label"].to_numpy(), len(classes), train_cfg, out_dir, device)
    best = result["best"]
    print(f"=== Xong {spec['label']} hạt giống {seed}: tốt nhất ở epoch {best['epoch']}, val top-1 {100 * best['val_top1']:.2f}%, "
          f"macro-F1 {100 * best['val_macro_f1']:.2f}% | {(time.monotonic() - started) / 60:.1f} phút lần này")
    del model
    torch.cuda.empty_cache()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", help="convnext_tiny | efficientnetv2_s | vit_b16_clip")
    parser.add_argument("--seed", type=int)
    parser.add_argument("--all", action="store_true", help="chạy mọi kiến trúc và hạt giống theo thứ tự của cấu hình")
    parser.add_argument("--smoke", action="store_true", help="chạy thử trên một phần nhỏ dữ liệu, 2 epoch")
    parser.add_argument("--micro-batch", type=int, help="số ảnh mỗi lần lan truyền (mặc định tự chọn theo bộ nhớ GPU)")
    parser.add_argument("--workers", type=int, help="số tiến trình đọc ảnh (mặc định min(8, số CPU))")
    args = parser.parse_args()
    cfg = load_config("b06_huan_luyen")
    if args.all:
        jobs = [(a, s) for a in cfg["order"] for s in cfg["seeds"]]
    elif args.arch:
        jobs = [(args.arch, s) for s in ([args.seed] if args.seed is not None else cfg["seeds"][:1] if args.smoke else cfg["seeds"])]
    else:
        parser.error("cần --all hoặc --arch")
    for arch, seed in jobs:
        if arch not in cfg["architectures"]:
            parser.error(f"không có kiến trúc {arch}")
        run_one(arch, seed, cfg, args)


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
