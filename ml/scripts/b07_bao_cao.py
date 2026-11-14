"""B7, báo cáo: đóng góp của từng kỹ thuật (A1–A5), đường học theo lượng dữ liệu (A6), suy luận thêm ảnh lật ngang (A7).

So mỗi thí nghiệm với cấu hình chính của B6 trên cùng kiến trúc, cùng hạt giống, cùng ảnh val. Cần GPU cho A7 và cho lỗi trên train
của cấu hình chính (đo một lần, lưu cache cạnh best.pt).

Chạy: ml/.venv/Scripts/python ml/scripts/b07_bao_cao.py [--arch convnext_tiny]   (mặc định: kiến trúc B06 chọn)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from b06_huan_luyen import runs_root  # noqa: E402
from robotrec.baselines import macro_f1  # noqa: E402
from robotrec.config import MANIFESTS, REPORTS, config_hash, data_root, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.evaluate import calibration, fit_temperature, softmax  # noqa: E402
from robotrec.report import Report  # noqa: E402
from robotrec.stats import holm, mcnemar, mean_std  # noqa: E402


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def pv(p: float) -> str:
    return "< 0,001" if p < 0.001 else f"{p:.3f}".replace(".", ",")


def load_run(path: Path, label_of_key: dict) -> dict | None:
    if not (path / "result.json").exists() or not json.loads((path / "result.json").read_text(encoding="utf-8")).get("finished"):
        return None
    meta = json.loads((path / "config.json").read_text(encoding="utf-8"))
    classes = {slug: i for i, slug in enumerate(meta["classes"])}
    keys = json.loads((path / "val_keys.json").read_text(encoding="utf-8"))
    run = {"path": path, "meta": meta, "keys": keys, "y": np.array([classes[label_of_key[k]] for k in keys]), "logits": np.load(path / "val_logits.npy"),
           "result": json.loads((path / "result.json").read_text(encoding="utf-8")), "history": pd.read_csv(path / "history.csv")}
    if (path / "train_logits.npy").exists():
        tkeys = json.loads((path / "train_keys.json").read_text(encoding="utf-8"))
        run["train_error"] = float((np.load(path / "train_logits.npy").argmax(1) != np.array([classes[label_of_key[k]] for k in tkeys])).mean())
    return run


def paired_diff(a: dict, b: dict, n_classes: int, resamples: int = 1000, seed: int = 0) -> dict:
    """Hiệu (A − B) của top-1 và macro-F1 trên cùng ảnh val, khoảng tin cậy bootstrap có ghép cặp."""
    y = a["y"]
    pa, pb = a["logits"].argmax(1), b["logits"].argmax(1)
    rng = np.random.default_rng(seed)
    d1, df = [], []
    for _ in range(resamples):
        idx = rng.integers(0, len(y), len(y))
        d1.append((pa[idx] == y[idx]).mean() - (pb[idx] == y[idx]).mean())
        df.append(macro_f1(pa[idx], y[idx], n_classes) - macro_f1(pb[idx], y[idx], n_classes))
    return {"top1": float((pa == y).mean() - (pb == y).mean()), "top1_ci": tuple(np.quantile(d1, [0.025, 0.975])),
            "f1": macro_f1(pa, y, n_classes) - macro_f1(pb, y, n_classes), "f1_ci": tuple(np.quantile(df, [0.025, 0.975])),
            "mcnemar": mcnemar(pa == y, pb == y)}


def main() -> None:
    import timm
    import torch

    from robotrec.train import ImageFiles, predict, transforms_for

    parser = argparse.ArgumentParser()
    parser.add_argument("--arch")
    args = parser.parse_args()
    cfg6, cfg7 = load_config("b06_huan_luyen"), load_config("b07_thi_nghiem_phu")
    b06 = json.loads((REPORTS / "B06" / "summary.json").read_text(encoding="utf-8")) if (REPORTS / "B06" / "summary.json").exists() else {}
    arch = args.arch or b06.get("choice")
    if not arch:
        raise SystemExit("Chưa có báo cáo B06 chọn kiến trúc; truyền --arch.")
    env = environment()
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    label_of_key = dict(zip(splits["key"], splits["class"]))
    b04 = json.loads((REPORTS / "B04" / "summary.json").read_text(encoding="utf-8"))
    main_runs = {s: load_run(runs_root() / "b06" / f"{arch}-s{s}", label_of_key) for s in cfg6["seeds"]}
    main_runs = {s: r for s, r in main_runs.items() if r}
    if 42 not in main_runs:
        raise SystemExit(f"Chưa có lần chạy chính {arch}-s42 của B6.")
    n_classes = len(main_runs[42]["meta"]["classes"])
    device = "cuda" if torch.cuda.is_available() else "cpu"
    label = cfg6["architectures"][arch]["label"]

    # Lỗi trên ảnh train của cấu hình chính (100% dữ liệu) và A7: TTA, đo trên checkpoint của B6
    tta = {}
    train_rows = splits[splits["split"] == "train"].reset_index(drop=True)
    for seed, run in main_runs.items():
        meta = run["meta"]
        model = timm.create_model(meta["timm"], pretrained=False, num_classes=n_classes)
        model.load_state_dict(torch.load(run["path"] / "best.pt", map_location="cpu", weights_only=True))
        model.to(device).eval()
        transform = transforms_for(meta["mean"], meta["std"], False, meta["image"]["size"], meta["image"]["resize"])
        cache = run["path"] / "train_logits.npy"
        classes = {slug: i for i, slug in enumerate(meta["classes"])}
        if not cache.exists():
            data = ImageFiles([data_root() / "images" / "raw" / f for f in train_rows["file"]], np.zeros(len(train_rows), dtype=int), transform)
            np.save(cache, predict(model, data, device, 128, 4, True))
            (run["path"] / "train_keys.json").write_text(json.dumps(train_rows["key"].tolist()), encoding="utf-8")
        tkeys = json.loads((run["path"] / "train_keys.json").read_text(encoding="utf-8"))
        run["train_error"] = float((np.load(cache).argmax(1) != np.array([classes[label_of_key[k]] for k in tkeys])).mean())
        val_rows = splits.set_index("key").loc[run["keys"]].reset_index()
        data = ImageFiles([data_root() / "images" / "raw" / f for f in val_rows["file"]], np.zeros(len(val_rows), dtype=int), transform)
        timing = {}
        for flip in (False, True):
            if device == "cuda":
                torch.cuda.synchronize()
            started = time.perf_counter()
            logits = predict(model, data, device, 128, 4, True, tta_flip=flip)
            if device == "cuda":
                torch.cuda.synchronize()
            timing[flip] = (time.perf_counter() - started, logits)
        tta[seed] = {"plain": timing[False][1], "flip": timing[True][1], "seconds_plain": timing[False][0], "seconds_flip": timing[True][0]}
        del model
        if device == "cuda":
            torch.cuda.empty_cache()

    report = Report("B07", "thi-nghiem-phu", f"Thí nghiệm phụ trên {label} (thí nghiệm E3, E4)")
    report.section(1)
    report.p("Đo đóng góp của từng kỹ thuật trong công thức huấn luyện của B6 (RQ4) bằng cách bỏ hoặc đổi **một** yếu tố mỗi lần, và đo mô hình đang thiếu dữ liệu "
             "hay thiếu sức chứa bằng đường học theo lượng dữ liệu (độ lệch và phương sai).")
    report.p(f"**Số liệu tạm**: dữ liệu là bản tạm `{b04['dataset_version'][:12]}` của B4. Mọi so sánh trên **val**; test để dành cho B8.")
    report.section(2)
    report.bullets([f"Cấu hình chính: các lần chạy {arch}-s42/43/44 của B6. Thí nghiệm: `<ROBOTREC_RUNS>/b07/`.",
                    "Đầu ra: báo cáo này, `ml/reports/B07/summary.json`, hình `ml/reports/B07/*.png`."])
    report.section(3)
    report.environment(env)
    report.section(4)
    report.table([[k, e["label"], "1 (42)" if e.get("seeds") != "all" else "3 (42, 43, 44)"] for k, e in cfg7["experiments"].items()]
                 + [["A7", "Suy luận thêm ảnh lật ngang rồi lấy trung bình logits (TTA), trên checkpoint của B6", "3 (42, 43, 44)"]],
                 ["Mã", "Thay đổi so với cấu hình chính", "Số hạt giống"], caption="Bảng 1. Các thí nghiệm")
    report.bullets([
        "Mọi thứ khác giữ nguyên như B6 (kiến trúc, tốc độ học, số epoch tối đa, dừng sớm, chọn epoch theo macro-F1 val).",
        "**So sánh**: mỗi thí nghiệm với cấu hình chính cùng hạt giống 42 trên cùng ảnh val: hiệu top-1 và hiệu macro-F1 kèm khoảng tin cậy bootstrap ghép cặp "
        "(1.000 lần lấy mẫu lại ảnh val, tính cả hai mô hình trên cùng mẫu); kiểm định McNemar cho top-1; p hiệu chỉnh Holm–Bonferroni trên A1–A5 và A7.",
        "**A6**: giữ ⌈f · n_c⌉ ảnh ngẫu nhiên của mỗi lớp (f = 10%, 25%, 50%); val giữ nguyên. Lỗi trên train đo trên chính các ảnh train của lần chạy, không tăng cường, "
        "tiền xử lý như val. Khoảng cách lỗi val − lỗi train lớn và giảm khi thêm dữ liệu: mô hình thiếu dữ liệu (phương sai cao); lỗi train cũng cao: thiếu sức chứa (độ lệch cao).",
        "**A7**: logits = trung bình logits của ảnh và ảnh lật ngang; đo thêm thời gian suy luận trên GPU.",
        "Hạn chế đã biết của thiết kế: A1–A5 chỉ một hạt giống nên chênh lệch nhỏ hơn độ dao động giữa các hạt giống (đo được ở cấu hình chính và A6) không nên kết luận.",
    ])
    report.h3("Giải thích bằng lời thường")
    report.bullets([
        "**Ablation** (thí nghiệm bỏ bớt) giống thử nấu món ăn bỏ từng gia vị: bỏ gia vị nào mà món dở hẳn thì gia vị đó quan trọng.",
        "**Đường học theo lượng dữ liệu**: cho mô hình học 10%, 25%, 50%, 100% số ảnh. Nếu điểm vẫn còn tăng rõ khi thêm ảnh thì thu thêm ảnh sẽ có ích.",
        "**TTA**: cho mô hình xem cả ảnh gốc lẫn ảnh soi gương rồi lấy trung bình; thường đúng hơn một chút nhưng chậm gấp đôi.",
    ])

    report.section(5)
    base = main_runs[42]
    main_top1 = [float((r["logits"].argmax(1) == r["y"]).mean()) for r in main_runs.values()]
    main_f1 = [macro_f1(r["logits"].argmax(1), r["y"], n_classes) for r in main_runs.values()]
    rows, compare, pvals = [], [], []
    for exp_id in ("A1", "A2", "A3", "A4", "A5"):
        if exp_id not in cfg7["experiments"]:
            continue
        run = load_run(runs_root() / "b07" / f"{exp_id}-{arch}-s42", label_of_key)
        if not run:
            if "only" not in cfg7["experiments"][exp_id] or arch in cfg7["experiments"][exp_id]["only"]:
                rows.append([exp_id, cfg7["experiments"][exp_id]["label"], "chưa chạy", "", "", "", "", ""])
            continue
        assert run["keys"] == base["keys"], "ảnh val của thí nghiệm khác cấu hình chính"
        d = paired_diff(run, base, n_classes)
        compare.append((exp_id, cfg7["experiments"][exp_id]["label"], run, d))
        pvals.append(d["mcnemar"].p_value)
    seeds_tta = sorted(tta)
    tta_rows = []
    for seed in seeds_tta:
        y = main_runs[seed]["y"]
        flip_run = {"y": y, "logits": tta[seed]["flip"]}
        plain_run = {"y": y, "logits": tta[seed]["plain"]}
        d = paired_diff(flip_run, plain_run, n_classes)
        tta_rows.append((seed, d, tta[seed]["seconds_flip"] / tta[seed]["seconds_plain"]))
    if tta_rows:
        pvals.append(tta_rows[0][1]["mcnemar"].p_value)
    adjusted = holm(pvals) if pvals else []
    for (exp_id, title, run, d), p_adj in zip(compare, adjusted):
        rows.append([exp_id, title, vn(100 * float((run["logits"].argmax(1) == run["y"]).mean()), 2), f"{vn(100 * d['top1'], 2)} [{vn(100 * d['top1_ci'][0], 2)}; {vn(100 * d['top1_ci'][1], 2)}]",
                     f"{vn(100 * d['f1'], 2)} [{vn(100 * d['f1_ci'][0], 2)}; {vn(100 * d['f1_ci'][1], 2)}]", pv(d["mcnemar"].p_value), pv(p_adj), run["result"]["best"]["epoch"]])
    if tta_rows:
        seed, d, ratio = tta_rows[0]
        rows.append(["A7", f"TTA lật ngang (hạt giống {seed}; chậm {vn(ratio, 2)} lần)", vn(100 * float((tta[seed]['flip'].argmax(1) == main_runs[seed]['y']).mean()), 2),
                     f"{vn(100 * d['top1'], 2)} [{vn(100 * d['top1_ci'][0], 2)}; {vn(100 * d['top1_ci'][1], 2)}]",
                     f"{vn(100 * d['f1'], 2)} [{vn(100 * d['f1_ci'][0], 2)}; {vn(100 * d['f1_ci'][1], 2)}]", pv(d["mcnemar"].p_value), pv(adjusted[-1]), "—"])
    columns = ["Mã", "Thay đổi", "top-1 val (%)", "Δ top-1, điểm % [KTC 95%]", "Δ macro-F1, điểm % [KTC 95%]", "p (McNemar)", "p sau Holm", "Epoch tốt nhất"]
    report.p(f"Cấu hình chính ({label}, hạt giống 42): top-1 val {vn(100 * main_top1[0], 2)}%. Qua {len(main_runs)} hạt giống: top-1 "
             f"{vn(100 * mean_std(main_top1)[0], 2)} ± {vn(100 * mean_std(main_top1)[1], 2)}%, macro-F1 {vn(100 * mean_std(main_f1)[0], 2)} ± {vn(100 * mean_std(main_f1)[1], 2)}%.")
    report.table(rows, columns, caption="Bảng 2. Mỗi thí nghiệm so với cấu hình chính (Δ âm: bỏ kỹ thuật đó làm kết quả kém đi)")
    if tta_rows:
        report.table([[s, f"{vn(100 * d['top1'], 2)} [{vn(100 * d['top1_ci'][0], 2)}; {vn(100 * d['top1_ci'][1], 2)}]", f"{vn(100 * d['f1'], 2)}", pv(d["mcnemar"].p_value), vn(r, 2)]
                      for s, d, r in tta_rows], ["Hạt giống", "Δ top-1 của TTA, điểm %", "Δ macro-F1", "p (McNemar)", "Thời gian suy luận (lần)"],
                     caption="Bảng 3. A7: TTA trên cả ba hạt giống của cấu hình chính")

    # A6
    fractions = cfg7["experiments"]["A6"]["fractions"]
    curve = {}
    for f in fractions + [1.0]:
        runs = [load_run(runs_root() / "b07" / f"A6-{int(round(100 * f))}-{arch}-s{s}", label_of_key) for s in cfg7["seeds_all"]] if f < 1 else list(main_runs.values())
        runs = [r for r in runs if r]
        if runs:
            curve[f] = {"val": [float((r["logits"].argmax(1) != r["y"]).mean()) for r in runs], "train": [r.get("train_error", np.nan) for r in runs],
                        "images": int(np.mean([r["meta"]["train_images"] for r in runs]))}
    curve_rows = [[f"{vn(100 * f, 0)}%", c["images"], len(c["val"]), f"{vn(100 * mean_std(c['val'])[0], 2)} ± {vn(100 * mean_std(c['val'])[1], 2)}" if len(c["val"]) > 1 else vn(100 * c["val"][0], 2),
                   f"{vn(100 * np.nanmean(c['train']), 2)}", f"{vn(100 * (np.mean(c['val']) - np.nanmean(c['train'])), 2)}"] for f, c in curve.items()]
    curve_cols = ["Lượng dữ liệu", "Ảnh train", "Số hạt giống", "Lỗi val (%)", "Lỗi train (%)", "Khoảng cách val − train (điểm %)"]
    report.table(curve_rows, curve_cols, caption="Bảng 4. A6: đường học theo lượng dữ liệu")
    if len(curve) >= 2:
        fig, ax = plt.subplots(figsize=(6.5, 3.6))
        xs = [100 * f for f in curve]
        val_mean = [100 * np.mean(c["val"]) for c in curve.values()]
        val_std = [100 * (np.std(c["val"], ddof=1) if len(c["val"]) > 1 else 0) for c in curve.values()]
        ax.errorbar(xs, val_mean, yerr=val_std, marker="o", color="#c2410c", label="lỗi val", capsize=3)
        ax.plot(xs, [100 * np.nanmean(c["train"]) for c in curve.values()], marker="s", color="#0f766e", label="lỗi train (ảnh không tăng cường)")
        ax.set_xscale("log")
        ax.set_xticks(xs, [f"{vn(x, 0)}%" for x in xs])
        ax.set_xlabel("Lượng ảnh train mỗi lớp")
        ax.set_ylabel("Tỉ lệ lỗi top-1 (%)")
        ax.legend(fontsize=8)
        fig.tight_layout()
        report.figure(fig, "duong-hoc-du-lieu", "Đường học theo lượng dữ liệu (thanh sai số: ± 1 độ lệch chuẩn qua 3 hạt giống)")
        plt.close(fig)
    if compare:
        fig, ax = plt.subplots(figsize=(6.5, 0.6 * len(compare) + 1.4))
        names = [f"{c[0]}" for c in compare] + (["A7"] if tta_rows else [])
        values = [100 * c[3]["f1"] for c in compare] + ([100 * tta_rows[0][1]["f1"]] if tta_rows else [])
        errors = [[100 * (c[3]["f1"] - c[3]["f1_ci"][0]) for c in compare] + ([100 * (tta_rows[0][1]["f1"] - tta_rows[0][1]["f1_ci"][0])] if tta_rows else []),
                  [100 * (c[3]["f1_ci"][1] - c[3]["f1"]) for c in compare] + ([100 * (tta_rows[0][1]["f1_ci"][1] - tta_rows[0][1]["f1"])] if tta_rows else [])]
        ax.barh(names, values, xerr=errors, color=["#c2410c" if v < 0 else "#0f766e" for v in values], capsize=3)
        ax.axvline(0, color="#0f172a", linewidth=0.8)
        ax.set_xlabel("Δ macro-F1 so với cấu hình chính (điểm %)")
        fig.tight_layout()
        report.figure(fig, "ablation", "Δ macro-F1 của từng thí nghiệm so với cấu hình chính, kèm khoảng tin cậy 95%")
        plt.close(fig)
    report.set("dataset_version", b04["dataset_version"])
    report.set("arch", arch)
    report.set("tables", {"Bảng 2. Thí nghiệm so với cấu hình chính": {"columns": columns, "rows": rows},
                          "Bảng 4. Đường học theo lượng dữ liệu": {"columns": curve_cols, "rows": curve_rows}})
    report.section(6)
    lines = []
    for (exp_id, title, run, d), p_adj in zip(compare, adjusted):
        verdict = "có ý nghĩa thống kê" if p_adj < 0.05 else "chưa có ý nghĩa thống kê"
        lines.append(f"{exp_id} ({title}): Δ top-1 {vn(100 * d['top1'], 2)} điểm, Δ macro-F1 {vn(100 * d['f1'], 2)} điểm; {verdict} (p sau Holm {pv(p_adj)}).")
    if tta_rows:
        mean_gain = np.mean([d["top1"] for _, d, _ in tta_rows])
        lines.append(f"A7 (TTA): trung bình qua {len(tta_rows)} hạt giống Δ top-1 {vn(100 * mean_gain, 2)} điểm, thời gian suy luận gấp {vn(np.mean([r for *_, r in tta_rows]), 2)} lần.")
    if len(main_top1) > 1:
        lines.append(f"Độ lệch chuẩn top-1 giữa {len(main_top1)} hạt giống của cấu hình chính là {vn(100 * mean_std(main_top1)[1], 2)} điểm: các Δ của A1–A5 (một hạt giống) "
                     "nhỏ hơn mức này chỉ nên coi là gợi ý.")
    if 0.5 in curve and 1.0 in curve:
        gain = 100 * (np.mean(curve[0.5]["val"]) - np.mean(curve[1.0]["val"]))
        lines.append(f"Từ 50% lên 100% dữ liệu, lỗi val giảm {vn(gain, 2)} điểm" + (": mô hình vẫn còn hưởng lợi khi thêm ảnh, thu thêm dữ liệu có ích." if gain > 1 else
                     ": đường học đã gần phẳng, thêm ảnh cùng loại ít có ích; nên cải thiện chất lượng nhãn hoặc mô hình."))
    report.bullets(lines or ["Chưa có thí nghiệm nào xong."])
    report.section(7)
    report.bullets(["A1–A5 một hạt giống; chênh lệch nhỏ không đủ để kết luận.", "Mọi so sánh trên val, cùng tập dùng để chọn epoch, nên các con số hơi lạc quan như nhau.",
                    "Dữ liệu tạm: kết luận về lượng dữ liệu có thể đổi khi nhãn sạch hơn."])
    report.section(8)
    report.reproduce([f"ml/.venv/Scripts/python ml/scripts/b07_thi_nghiem_phu.py --arch {arch} --all", f"ml/.venv/Scripts/python ml/scripts/b07_bao_cao.py --arch {arch}"],
                     config="ml/configs/b07_thi_nghiem_phu.yaml", config_hash=config_hash({"b06": cfg6, "b07": cfg7}), seed=0,
                     dataset_version=f"b04_splits.csv sha256 {b04['dataset_version'][:12]}")
    print(report.write())


if __name__ == "__main__":
    main()
