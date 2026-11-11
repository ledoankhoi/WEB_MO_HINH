"""Huấn luyện có giám sát (B6, B7): lấy mẫu cân bằng lớp, hai pha (đầu phân loại rồi toàn mạng), lịch học cosine,
AMP fp16, cắt gradient, dừng sớm theo macro-F1 trên val, checkpoint mỗi epoch và chạy tiếp được khi bị ngắt.

Kế hoạch: docs/nhan-dang-robot/00-ke-hoach.md mục 8, B6.
"""

from __future__ import annotations

import csv
import json
import math
import os
import time
from pathlib import Path
from typing import Any, Callable

import numpy as np
import torch

from .baselines import macro_f1, topk_correct

HISTORY_FIELDS = ["epoch", "phase", "lr", "train_loss", "train_top1", "val_loss", "val_top1", "val_top5", "val_macro_f1", "seconds", "gpu_mem_gb"]


# Các hàm thuần ------------------------------------------------------------------------------------------------------


def class_balanced_weights(labels: np.ndarray, power: float = 0.5) -> np.ndarray:
    """Trọng số lấy mẫu của từng ảnh để lớp c được chọn với xác suất tỉ lệ n_c^power (power = 0,5: lấy mẫu căn bậc hai;
    power = 1: lấy mẫu thường). Trọng số mỗi ảnh = n_c^(power − 1)."""
    labels = np.asarray(labels)
    counts = np.bincount(labels).astype(np.float64)
    return counts[labels] ** (power - 1.0)


def lr_factor(step: int, warmup: int, total: int, floor: float = 0.0) -> float:
    """Hệ số tốc độ học: tăng tuyến tính trong `warmup` bước đầu, rồi giảm theo cosine về `floor` ở bước `total`."""
    if step < warmup:
        return (step + 1) / warmup
    progress = min(1.0, (step - warmup) / max(1, total - warmup))
    return floor + (1.0 - floor) * 0.5 * (1.0 + math.cos(math.pi * progress))


def make_param_groups(model: torch.nn.Module, lr: float, weight_decay: float, layer_decay: float | None = None) -> list[dict]:
    """Nhóm tham số cho AdamW. Tham số một chiều (bias, LayerNorm, BatchNorm) không phạt trọng số.
    Có `layer_decay` (ViT): tầng thứ i tính từ đầu ra có tốc độ học lr · layer_decay^i (nhóm của timm)."""
    from timm.optim import param_groups_layer_decay, param_groups_weight_decay

    skip = model.no_weight_decay() if hasattr(model, "no_weight_decay") else ()
    if layer_decay:
        groups = param_groups_layer_decay(model, weight_decay, no_weight_decay_list=skip, layer_decay=layer_decay)
    else:
        groups = param_groups_weight_decay(model, weight_decay, no_weight_decay_list=skip)
    for group in groups:
        group["lr"] = group["base_lr"] = lr * group.pop("lr_scale", 1.0)
    return [g for g in groups if g["params"]]


# Dữ liệu ảnh -------------------------------------------------------------------------------------------------------


class ImageFiles(torch.utils.data.Dataset):
    def __init__(self, paths: list[Path], labels: np.ndarray, transform: Callable) -> None:
        self.paths, self.labels, self.transform = paths, np.asarray(labels), transform

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int):
        from PIL import Image

        with Image.open(self.paths[index]) as image:
            return self.transform(image.convert("RGB")), int(self.labels[index])


def transforms_for(mean, std, train: bool, size: int = 224, resize: int = 256, aug: dict | None = None):
    """Tiền xử lý. Huấn luyện: RandomResizedCrop, lật ngang, RandAugment, ColorJitter, RandomErasing (kế hoạch B6).
    Val/test (và trình duyệt ở B11): thu cạnh ngắn về `resize` bằng song tuyến, cắt giữa `size`."""
    from torchvision import transforms as T

    bilinear = T.InterpolationMode.BILINEAR
    normalize = T.Normalize(mean, std)
    if not train:
        return T.Compose([T.Resize(resize, interpolation=bilinear), T.CenterCrop(size), T.ToTensor(), normalize])
    aug = aug or {}
    steps = [T.RandomResizedCrop(size, scale=tuple(aug.get("crop_scale", (0.35, 1.0))), interpolation=bilinear), T.RandomHorizontalFlip()]
    if aug.get("randaugment", True):
        steps.append(T.RandAugment(num_ops=aug.get("ra_ops", 2), magnitude=aug.get("ra_magnitude", 9)))
    if aug.get("color_jitter", 0.3):
        jitter = aug.get("color_jitter", 0.3)
        steps.append(T.ColorJitter(jitter, jitter, jitter))
    steps += [T.ToTensor(), normalize]
    if aug.get("erasing", 0.25):
        steps.append(T.RandomErasing(p=aug.get("erasing", 0.25)))
    return T.Compose(steps)


def _seed_worker(worker_id: int) -> None:
    import random

    seed = torch.initial_seed() % 2**32
    np.random.seed(seed)
    random.seed(seed)


# Vòng huấn luyện ---------------------------------------------------------------------------------------------------


@torch.no_grad()
def predict(model: torch.nn.Module, dataset, device: str, batch_size: int = 128, workers: int = 0, amp: bool = True) -> np.ndarray:
    """Logits (N × số lớp, float32) theo đúng thứ tự của dataset."""
    model.eval()
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=workers, pin_memory=device == "cuda")
    out = []
    for x, _ in loader:
        with torch.autocast(device_type="cuda" if device == "cuda" else "cpu", dtype=torch.float16, enabled=amp and device == "cuda"):
            out.append(model(x.to(device, non_blocking=True)).float().cpu())
    return torch.cat(out).numpy()


def _atomic_save(obj: Any, path: Path) -> None:
    temp = path.with_name(path.name + ".tmp")
    torch.save(obj, temp)
    os.replace(temp, path)


def _state_dict(model: torch.nn.Module, half: bool) -> dict:
    return {k: (v.half() if half and v.is_floating_point() else v).detach().cpu().clone() for k, v in model.state_dict().items()}


def fit(model: torch.nn.Module, train_set, train_labels: np.ndarray, val_set, val_labels: np.ndarray, n_classes: int, cfg: dict, out_dir: Path,
        device: str, log: Callable[..., None] = print, stop_after_epochs: int | None = None) -> dict:
    """Huấn luyện một lần chạy và trả về {history, best, finished, stopped_early, val_logits}.

    - Pha 1 (`epochs_head` epoch đầu): chỉ đầu phân loại (`model.get_classifier()`), thân mạng đóng băng ở chế độ eval,
      AdamW với tốc độ học cố định `lr_head`.
    - Pha 2: toàn mạng, AdamW (`make_param_groups`), khởi động tuyến tính `warmup_epochs` epoch rồi cosine tới hết `epochs_max`.
    - Mỗi bước tối ưu gồm `batch_size` ảnh, chia thành micro-batch `micro_batch` ảnh (cộng dồn gradient) khi GPU ít bộ nhớ.
    - Sau mỗi epoch: đánh giá val, lưu `last.pt` (để chạy tiếp) và `best.pt` khi macro-F1 trên val tăng; dừng sớm khi
      `patience` epoch liền không tăng. Kết thúc: nạp best.pt, ghi logits val, `result.json`; xoá last.pt (trừ khi `keep_last`).
    - `stop_after_epochs`: dừng sau chừng ấy epoch của lần gọi này mà không kết thúc (giả lập bị ngắt; dùng trong test).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    result_path, last_path, best_path = out_dir / "result.json", out_dir / "last.pt", out_dir / "best.pt"
    if result_path.exists():
        done = json.loads(result_path.read_text(encoding="utf-8"))
        if done.get("finished"):
            done["val_logits"] = np.load(out_dir / "val_logits.npy")
            return done

    amp = bool(cfg.get("amp", True)) and device == "cuda"
    autocast_device = "cuda" if device == "cuda" else "cpu"
    accumulate = max(1, cfg["batch_size"] // cfg.get("micro_batch", cfg["batch_size"]))
    micro = cfg["batch_size"] // accumulate
    workers = cfg.get("workers", 0)
    train_labels, val_labels = np.asarray(train_labels), np.asarray(val_labels)
    weights = torch.as_tensor(class_balanced_weights(train_labels, cfg["sampler_power"]), dtype=torch.double)
    micro_per_epoch = math.ceil(len(train_set) / micro)
    steps_per_epoch = math.ceil(micro_per_epoch / accumulate)
    epochs_head, epochs_max = cfg["epochs_head"], cfg["epochs_max"]
    total_steps = max(1, (epochs_max - epochs_head) * steps_per_epoch)
    warmup_steps = cfg["warmup_epochs"] * steps_per_epoch
    criterion = torch.nn.CrossEntropyLoss(label_smoothing=cfg["label_smoothing"])
    head = model.get_classifier()
    head_ids = {id(p) for p in head.parameters()}
    model.to(device)

    history: list[dict] = []
    best = {"val_macro_f1": -1.0, "epoch": 0}
    since_best, start_epoch, saved_phase, saved_optimizer, saved_scaler = 0, 0, None, None, None
    if last_path.exists():
        checkpoint = torch.load(last_path, map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["model"])
        history, best, since_best = checkpoint["history"], checkpoint["best"], checkpoint["since_best"]
        start_epoch, saved_phase = checkpoint["epoch"], checkpoint["phase"]
        saved_optimizer, saved_scaler = checkpoint["optimizer"], checkpoint["scaler"]
        log(f"Chạy tiếp từ epoch {start_epoch} ({out_dir})")

    def build_optimizer(phase: int) -> torch.optim.Optimizer:
        betas = tuple(cfg.get("betas", (0.9, 0.999)))
        if phase == 1:
            for p in model.parameters():
                p.requires_grad_(id(p) in head_ids)
            groups = make_param_groups(head, cfg["lr_head"], cfg["weight_decay"])
        else:
            for p in model.parameters():
                p.requires_grad_(True)
            groups = make_param_groups(model, cfg["lr"], cfg["weight_decay"], cfg.get("layer_decay"))
        return torch.optim.AdamW(groups, betas=betas)

    optimizer, phase_of_optimizer = None, None
    scaler = torch.amp.GradScaler("cuda", enabled=amp)
    if saved_scaler is not None:
        scaler.load_state_dict(saved_scaler)
    stopped_early = bool(history) and since_best >= cfg["patience"]
    started_all = time.monotonic()
    epochs_run = 0
    for epoch in range(start_epoch, epochs_max):
        if stopped_early:
            break
        if stop_after_epochs is not None and epochs_run >= stop_after_epochs:
            return {"history": history, "best": best, "finished": False, "stopped_early": False, "val_logits": None}
        phase = 1 if epoch < epochs_head else 2
        if phase != phase_of_optimizer:
            optimizer = build_optimizer(phase)
            if saved_optimizer is not None and saved_phase == phase and epoch == start_epoch:
                optimizer.load_state_dict(saved_optimizer)
            phase_of_optimizer = phase
        model.train()
        if phase == 1:
            model.eval()
            head.train()
        generator = torch.Generator().manual_seed(cfg["seed"] * 1000 + epoch)
        sampler = torch.utils.data.WeightedRandomSampler(weights, num_samples=len(train_set), replacement=True, generator=generator)
        loader = torch.utils.data.DataLoader(
            train_set, batch_size=micro, sampler=sampler, num_workers=workers, pin_memory=device == "cuda", drop_last=False,
            worker_init_fn=_seed_worker if workers else None, generator=torch.Generator().manual_seed(cfg["seed"] * 1000 + epoch + 1),
            persistent_workers=False,
        )
        if device == "cuda":
            torch.cuda.reset_peak_memory_stats()
        started = time.monotonic()
        loss_sum, correct, seen = 0.0, 0, 0
        optimizer.zero_grad(set_to_none=True)
        for index, (x, y) in enumerate(loader):
            step = index // accumulate
            if phase == 2:
                factor = lr_factor((epoch - epochs_head) * steps_per_epoch + step, warmup_steps, total_steps)
                for group in optimizer.param_groups:
                    group["lr"] = group["base_lr"] * factor
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            with torch.autocast(device_type=autocast_device, dtype=torch.float16, enabled=amp):
                logits = model(x)
                loss = criterion(logits.float(), y)
            scaler.scale(loss / accumulate).backward()
            loss_sum += float(loss.detach()) * len(y)
            correct += int((logits.argmax(1) == y).sum())
            seen += len(y)
            if (index + 1) % accumulate == 0 or index + 1 == micro_per_epoch:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.grad is not None], cfg["grad_clip"])
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad(set_to_none=True)
        logits = predict(model, val_set, device, cfg.get("eval_batch", 128), workers, amp)
        val_loss = float(torch.nn.functional.cross_entropy(torch.from_numpy(logits), torch.tensor(val_labels, dtype=torch.long)))
        pred = logits.argmax(1)
        entry = {
            "epoch": epoch + 1, "phase": phase, "lr": max(g["lr"] for g in optimizer.param_groups),
            "train_loss": loss_sum / max(seen, 1), "train_top1": correct / max(seen, 1), "val_loss": val_loss,
            "val_top1": float((pred == val_labels).mean()), "val_top5": float(topk_correct(logits, val_labels, 5).mean()),
            "val_macro_f1": macro_f1(pred, val_labels, n_classes), "seconds": time.monotonic() - started,
            "gpu_mem_gb": torch.cuda.max_memory_allocated() / 1024**3 if device == "cuda" else 0.0,
        }
        history.append(entry)
        if entry["val_macro_f1"] > best["val_macro_f1"]:
            best = {k: entry[k] for k in ("epoch", "val_top1", "val_top5", "val_macro_f1", "val_loss")}
            since_best = 0
            _atomic_save(_state_dict(model, cfg.get("save_half", False)), best_path)
        else:
            since_best += 1
        stopped_early = since_best >= cfg["patience"]
        _atomic_save({"model": model.state_dict(), "optimizer": optimizer.state_dict(), "scaler": scaler.state_dict(), "epoch": epoch + 1,
                      "phase": phase, "history": history, "best": best, "since_best": since_best}, last_path)
        with open(out_dir / "history.csv", "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, HISTORY_FIELDS)
            writer.writeheader()
            writer.writerows(history)
        log(f"epoch {epoch + 1}/{epochs_max} pha {phase} | train loss {entry['train_loss']:.3f} top-1 {100 * entry['train_top1']:.1f} | "
            f"val loss {val_loss:.3f} top-1 {100 * entry['val_top1']:.2f} top-5 {100 * entry['val_top5']:.2f} macro-F1 {100 * entry['val_macro_f1']:.2f} | "
            f"lr {entry['lr']:.2e} | {entry['seconds']:.0f} s | {entry['gpu_mem_gb']:.2f} GB" + (" | tốt nhất" if since_best == 0 else ""))
        epochs_run += 1

    model.load_state_dict(torch.load(best_path, map_location="cpu", weights_only=True))
    model.to(device)
    val_logits = predict(model, val_set, device, cfg.get("eval_batch", 128), workers, amp)
    np.save(out_dir / "val_logits.npy", val_logits)
    result = {"finished": True, "stopped_early": stopped_early, "best": best, "history": history, "epochs": len(history),
              "seconds": sum(h["seconds"] for h in history), "seconds_this_call": time.monotonic() - started_all,
              "accumulate": accumulate, "micro_batch": micro, "steps_per_epoch": steps_per_epoch}
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    if not cfg.get("keep_last", False):
        last_path.unlink(missing_ok=True)
    result["val_logits"] = val_logits
    return result
