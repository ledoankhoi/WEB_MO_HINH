"""B8. Đánh giá toàn diện (thí nghiệm E5, E6): tập đóng, theo cấp, theo miền, hiệu chỉnh độ tin, tập mở, luật trả lời theo cấp.

Nguồn mô hình:
  --source b05             mốc B5: linear probe trên đặc trưng CLIP ViT-L/14 đóng băng → báo cáo B08a
  --source b06 --arch X    mô hình tinh chỉnh của B6, đủ các hạt giống đã xong → báo cáo B08

Ngưỡng và nhiệt độ chỉ chọn trên val (đã biết, lạ-val, âm-val); tập test (đã biết, lạ-test, âm-test) chỉ để báo số liệu.

Chạy: ml/.venv/Scripts/python ml/scripts/b08_danh_gia.py --source b05
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from robotrec.baselines import metrics_with_ci  # noqa: E402
from robotrec.config import MANIFESTS, data_root  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.evaluate import (  # noqa: E402
    answer_outcomes,
    calibration,
    fit_temperature,
    hierarchy,
    ood_metrics,
    ood_scores,
    oscr,
    search_thresholds,
    softmax,
)
from robotrec.report import Report  # noqa: E402
from robotrec.stats import holm, mcnemar, mean_std, paired_bootstrap_diff, wilson_ci  # noqa: E402

FRANCHISE = {"transformers": "Transformers", "gundam": "Gundam", "sentai": "Super Sentai / Power Rangers"}
SCORE_LABEL = {"msp": "MSP", "maxlogit": "max-logit", "energy": "−năng lượng", "msp_t": "MSP sau hiệu chỉnh"}
SETS = ["val", "test", "unknown_val", "unknown_test", "neg_val", "neg_test"]
SEED = 0


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def pct(part: float, whole: float, digits: int = 1) -> str:
    return (vn(100 * part / whole, digits) + "%") if whole else "—"


def pv(p: float) -> str:
    return "< 0,001" if p < 0.001 else f"{p:.3f}".replace(".", ",")


def ci_text(triple, digits: int = 1) -> str:
    return f"{vn(100 * triple[0], digits)} [{vn(100 * triple[1], digits)}; {vn(100 * triple[2], digits)}]"


def wilson_text(k: int, n: int, digits: int = 1) -> str:
    if n == 0:
        return "—"
    w = wilson_ci(int(k), int(n))
    return f"{vn(100 * w.estimate, digits)} [{vn(100 * w.low, digits)}; {vn(100 * w.high, digits)}]"


def agg(values: list[float], digits: int = 1, scale: float = 100) -> str:
    """Một mô hình: giá trị; nhiều hạt giống: trung bình ± độ lệch chuẩn."""
    if len(values) == 1:
        return vn(scale * values[0], digits)
    mean, std = mean_std(values)
    return f"{vn(scale * mean, digits)} ± {vn(scale * std, digits)}"


# Dữ liệu ------------------------------------------------------------------------------------------------------------


def load_sets(classes: list[str]) -> dict[str, pd.DataFrame]:
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    negatives = pd.read_csv(MANIFESTS / "b04b_negatives.csv.gz", dtype=str, keep_default_na=False)
    index = {slug: i for i, slug in enumerate(classes)}
    out = {}
    for name in ("val", "test"):
        rows = splits[splits["split"] == name].reset_index(drop=True)
        rows["label"] = rows["class"].map(index)
        out[name] = rows
    for name in ("unknown_val", "unknown_test"):
        out[name] = splits[splits["split"] == name].reset_index(drop=True)
    for name, part in (("neg_val", "val"), ("neg_test", "test"), ("neg_train", "train")):
        out[name] = negatives[negatives["split"] == part].reset_index(drop=True)
    return out


def models_from_b05(sets: dict[str, pd.DataFrame]) -> list[dict]:
    root = data_root() / "b05"
    features = np.load(root / "features" / "clip-l14.npz")
    lp = np.load(root / "eval" / "clip-l14-lp.npz")
    position = {k: i for i, k in enumerate(features["keys"])}
    logits = {}
    for name, rows in sets.items():
        x = features["features"][[position[k] for k in rows["key"]]]
        logits[name] = x.astype(np.float64) @ lp["weights"].T.astype(np.float64) + lp["bias"].astype(np.float64)
    assert np.abs(logits["test"] - lp["test"]).max() < 1e-3, "logits test tính lại không khớp logits đã lưu ở B5"
    return [{"name": "Linear probe CLIP ViT-L/14 (B5)", "seed": None, "logits": logits}]


def models_from_b06(arch: str, sets: dict[str, pd.DataFrame], classes: list[str]) -> list[dict]:
    """Nạp best.pt của từng hạt giống đã xong, suy luận trên mọi tập (lưu cache logits_<tập>.npy cạnh best.pt)."""
    import timm
    import torch

    from b06_huan_luyen import runs_root
    from robotrec.config import load_config
    from robotrec.train import ImageFiles, predict, transforms_for

    cfg = load_config("b06_huan_luyen")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    models = []
    for seed in cfg["seeds"]:
        run = runs_root() / "b06" / f"{arch}-s{seed}"
        if not (run / "result.json").exists():
            continue
        meta = json.loads((run / "config.json").read_text(encoding="utf-8"))
        assert meta["classes"] == classes, "thứ tự lớp của mô hình khác thứ tự lớp đang đánh giá"
        logits = {}
        model = None
        for name, rows in sets.items():
            cache = run / f"logits_{name}.npy"
            if cache.exists():
                logits[name] = np.load(cache).astype(np.float64)
                continue
            if model is None:
                model = timm.create_model(meta["timm"], pretrained=False, num_classes=len(classes))
                model.load_state_dict(torch.load(run / "best.pt", map_location="cpu", weights_only=True))
                model.to(device).eval()
            folder = "negatives" if name.startswith("neg") else "raw"
            dataset = ImageFiles([data_root() / "images" / folder / f for f in rows["file"]], np.zeros(len(rows), dtype=int),
                                 transforms_for(meta["mean"], meta["std"], False, meta["image"]["size"], meta["image"]["resize"]))
            out = predict(model, dataset, device, 128, 4, True)
            np.save(cache, out.astype(np.float32))
            logits[name] = out.astype(np.float64)
        models.append({"name": f"{meta['label']} (hạt giống {seed})", "seed": seed, "logits": logits, "label": meta["label"]})
    if not models:
        raise SystemExit(f"Chưa có lần chạy B6 nào của {arch} xong.")
    return models


def explain_and_errors(arch: str, seed: int, sets: dict[str, pd.DataFrame], logits_test: np.ndarray, classes: list[str], robots: dict, report: Report) -> dict:
    """Grad-CAM cho 20 ảnh đúng và 20 ảnh sai, UMAP đặc trưng tầng áp chót trên val, trang phân tích 100 ảnh đoán sai cho chủ dự án."""
    import timm
    import torch
    from PIL import Image

    from b06_huan_luyen import runs_root
    from robotrec.explain import gradcam, target_layer
    from robotrec.review_html import write_audit
    from robotrec.train import ImageFiles, predict, transforms_for

    run = runs_root() / "b06" / f"{arch}-s{seed}"
    meta = json.loads((run / "config.json").read_text(encoding="utf-8"))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = timm.create_model(meta["timm"], pretrained=False, num_classes=len(classes))
    model.load_state_dict(torch.load(run / "best.pt", map_location="cpu", weights_only=True))
    model.to(device).eval()
    transform = transforms_for(meta["mean"], meta["std"], False, meta["image"]["size"], meta["image"]["resize"])
    test = sets["test"]
    y = test["label"].to_numpy()
    pred = logits_test.argmax(1)
    rng = np.random.default_rng(SEED)
    out: dict = {}

    def show(index: int):
        with Image.open(data_root() / "images" / "raw" / test.at[index, "file"]) as image:
            rgb = image.convert("RGB")
            from torchvision import transforms as T

            display = T.CenterCrop(224)(T.Resize(256, interpolation=T.InterpolationMode.BILINEAR)(rgb))
            return np.asarray(display), transform(rgb)[None]

    layer, reshape = target_layer(model)
    for title, pool, name in (("đúng", np.flatnonzero(pred == y), "gradcam-dung"), ("sai", np.flatnonzero(pred != y), "gradcam-sai")):
        chosen = rng.choice(pool, size=min(20, len(pool)), replace=False)
        fig, axes = plt.subplots(4, 10, figsize=(20, 9.2))
        for k, index in enumerate(chosen):
            picture, x = show(int(index))
            cam = gradcam(model, x.to(device), layer, int(pred[index]), 224, reshape)
            ax_img, ax_cam = axes[(k // 10) * 2, k % 10], axes[(k // 10) * 2 + 1, k % 10]
            ax_img.imshow(picture)
            ax_img.set_title(f"thật: {robots[classes[y[index]]]['display_name'][:22]}\nđoán: {robots[classes[pred[index]]]['display_name'][:22]}", fontsize=6)
            ax_cam.imshow(picture)
            ax_cam.imshow(cam, cmap="jet", alpha=0.45)
        for ax in axes.ravel():
            ax.axis("off")
        fig.suptitle(f"Grad-CAM của 20 ảnh test đoán {title} (hàng trên: ảnh; hàng dưới: vùng làm điểm của lớp được đoán tăng)", fontsize=10)
        fig.tight_layout()
        report.figure(fig, name, f"Grad-CAM, ảnh đoán {title} ({meta['label']}, hạt giống {seed})")
        plt.close(fig)

    # UMAP của đặc trưng tầng áp chót trên val
    import umap

    val = sets["val"]
    features = []
    loader = torch.utils.data.DataLoader(ImageFiles([data_root() / "images" / "raw" / f for f in val["file"]], np.zeros(len(val), dtype=int), transform),
                                         batch_size=128, num_workers=4)
    with torch.no_grad():
        for x, _ in loader:
            with torch.autocast(device_type="cuda" if device == "cuda" else "cpu", dtype=torch.float16, enabled=device == "cuda"):
                features.append(model.forward_head(model.forward_features(x.to(device)), pre_logits=True).float().cpu().numpy())
    features = np.concatenate(features)
    embedded = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=SEED).fit_transform(features)
    fig, ax = plt.subplots(figsize=(7, 6))
    for key, color in (("transformers", "#c2410c"), ("gundam", "#1d4ed8"), ("sentai", "#15803d")):
        mask = (val["class"].map(lambda c: robots[c]["franchise"]) == key).to_numpy()
        ax.scatter(embedded[mask, 0], embedded[mask, 1], s=2, color=color, alpha=0.6, label=FRANCHISE[key])
    ax.legend(markerscale=4, fontsize=8)
    ax.set_xticks([])
    ax.set_yticks([])
    fig.tight_layout()
    report.figure(fig, "umap", f"UMAP của đặc trưng tầng áp chót trên {len(val)} ảnh val ({meta['label']}, hạt giống {seed}); mỗi chấm một ảnh")
    plt.close(fig)

    # Trang phân tích lỗi cho chủ dự án
    wrong = rng.choice(np.flatnonzero(pred != y), size=min(100, int((pred != y).sum())), replace=False)
    items = [{"key": test.at[int(i), "key"], "src": f"../images/raw/{test.at[int(i), 'file']}",
              "name": f"Thật: {robots[classes[y[i]]]['display_name']} · Mô hình đoán: {robots[classes[pred[i]]]['display_name']}",
              "series": robots[classes[y[i]]]["series"], "ref": robots[classes[y[i]]]["image"]["url"]} for i in wrong]
    page = data_root() / "b08" / "phan-tich-loi.html"
    write_audit(page, "b08-phan-tich-loi", "B8 · Phân tích 100 ảnh mô hình đoán sai",
                "Mỗi ảnh mô hình đã đoán sai. Ảnh nhỏ bên trái là ảnh tham chiếu của robot <b>thật</b> (theo nhãn). Chọn nguyên nhân chính bằng phím 1–6. "
                "Tiến độ tự lưu trong trình duyệt; xong thì bấm <b>Tải kết quả (CSV)</b> và gửi file cho Claude.",
                "Vì sao mô hình đoán sai ảnh này?",
                [("nhan-sai", "Nhãn sai (ảnh không phải robot ghi)"), ("giong-nhau", "Hai robot trông giống nhau"), ("anh-kho", "Ảnh nhỏ, mờ, bị che, nhiều robot"),
                 ("sai-dong", "Đúng nhân vật, sai dòng"), ("mien-la", "Kiểu ảnh lạ (tranh, hộp, dạng xe)"), ("khac", "Khác")], items)
    out["error_page"] = str(page)
    out["umap_points"] = len(val)
    return out


# Đánh giá một mô hình -------------------------------------------------------------------------------------------------


def evaluate_model(model: dict, sets: dict[str, pd.DataFrame], h, classes: list[str], robots: dict) -> dict:
    lg = model["logits"]
    y_val, y_test = sets["val"]["label"].to_numpy(), sets["test"]["label"].to_numpy()
    n_classes = len(classes)
    res: dict = {}
    pred = lg["test"].argmax(1)
    res["closed"] = metrics_with_ci(lg["test"], y_test, n_classes, 1000, SEED)
    from sklearn.metrics import precision_recall_fscore_support

    p, r, f, s = precision_recall_fscore_support(y_test, pred, labels=np.arange(n_classes), zero_division=0)
    res["per_class"] = pd.DataFrame({"class": classes, "precision": p, "recall": r, "f1": f, "support": s})
    pw, rw, fw, _ = precision_recall_fscore_support(y_test, pred, average="weighted", zero_division=0)
    pm, rm, fm, _ = precision_recall_fscore_support(y_test, pred, average="macro", zero_division=0)
    res["summary"] = {"balanced_accuracy": float(r[s > 0].mean()), "macro_precision": pm, "macro_recall": rm, "macro_f1": fm,
                      "weighted_precision": pw, "weighted_recall": rw, "weighted_f1": fw}
    # Theo cấp (xác suất sau hiệu chỉnh) và mức nghiêm trọng của lỗi
    T = fit_temperature(lg["val"], y_val)
    res["T"] = T
    probs_test = softmax(lg["test"], T)
    char_ok = h.char_probs(probs_test).argmax(1) == h.class_char[y_test]
    fr_ok = h.franchise_probs(probs_test).argmax(1) == h.class_franchise[y_test]
    wrong = pred != y_test
    same_char = wrong & (h.class_char[pred] == h.class_char[y_test])
    same_fr = wrong & ~same_char & (h.class_franchise[pred] == h.class_franchise[y_test])
    res["levels"] = {"class": float((~wrong).mean()), "character": float(char_ok.mean()), "franchise": float(fr_ok.mean()),
                     "errors": int(wrong.sum()), "err_same_char": int(same_char.sum()), "err_same_franchise": int(same_fr.sum()),
                     "err_other_franchise": int((wrong & ~same_char & ~same_fr).sum())}
    res["correct_test"] = ~wrong
    # Hiệu chỉnh
    res["cal_before"] = calibration(softmax(lg["test"], 1.0), y_test)
    res["cal_after"] = calibration(probs_test, y_test)
    res["cal_val_before"] = calibration(softmax(lg["val"], 1.0), y_val)
    res["cal_val_after"] = calibration(softmax(lg["val"], T), y_val)
    # Tập mở
    scores = {name: {**ood_scores(lg[name]), "msp_t": softmax(lg[name], T).max(1)} for name in ("test", "unknown_test", "neg_test")}
    neg = sets["neg_test"]
    res["ood"] = {}
    rng = np.random.default_rng(SEED)
    for score in SCORE_LABEL:
        for target, mask in (("unknown_test", None), ("neg_test", None), ("neg_test_coco", (neg["group"] == "coco").to_numpy()),
                             ("neg_test_toy", (neg["group"] == "toy").to_numpy())):
            base = target if not target.startswith("neg_test") else "neg_test"
            ood = scores[base][score] if mask is None else scores[base][score][mask]
            known = scores["test"][score]
            m = ood_metrics(known, ood)
            boots = []
            for _ in range(1000 if target in ("unknown_test", "neg_test") else 0):
                kb, ob = known[rng.integers(0, len(known), len(known))], ood[rng.integers(0, len(ood), len(ood))]
                bm = ood_metrics(kb, ob)
                boots.append((bm["auroc"], bm["fpr95"]))
            if boots:
                arr = np.array(boots)
                m["auroc_ci"] = tuple(np.quantile(arr[:, 0], [0.025, 0.975]))
                m["fpr95_ci"] = tuple(np.quantile(arr[:, 1], [0.025, 0.975]))
            fpr, ccr, area = oscr(known, res["correct_test"], ood)
            m["oscr"] = area
            m["curve"] = (fpr, ccr)
            res["ood"][(score, target)] = m
    res["scores"] = scores
    # Luật trả lời theo cấp: ngưỡng chọn trên val, báo trên test
    unk_truth = {}
    for name in ("unknown_val", "unknown_test"):
        rows = sets[name]
        unk_truth[name] = (np.array([h.char_of(c, robots[c]) for c in rows["class"]]), np.array([h.franchise_index[robots[c]["franchise"]] for c in rows["class"]]))
    pv_ = {name: softmax(lg[name], T) for name in SETS}
    res["rule"] = {}
    for far in (0.01, 0.02, 0.05, 0.10, 0.20):
        best = search_thresholds(pv_["val"], y_val, pv_["unknown_val"], *unk_truth["unknown_val"], pv_["neg_val"], h, far_max=far)
        t = best["t"]
        known_o = answer_outcomes(pv_["test"], h, t, "known", true_class=y_test)
        unk_o = answer_outcomes(pv_["unknown_test"], h, t, "unknown", true_char=unk_truth["unknown_test"][0], true_franchise=unk_truth["unknown_test"][1])
        neg_o = answer_outcomes(pv_["neg_test"], h, t, "negative")
        res["rule"][far] = {"val": best, "t": t, "known": known_o, "unknown": unk_o, "negative": neg_o}
    return res


# Báo cáo -------------------------------------------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["b05", "b06"], required=True)
    parser.add_argument("--arch", help="kiến trúc của B6 (khi --source b06)")
    args = parser.parse_args()
    env = environment()
    robots = {r["slug"]: r for r in json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]}
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    classes = sorted(splits.loc[splits["split"] == "train", "class"].unique())
    sets = load_sets(classes)
    h = hierarchy(classes, robots)
    b04 = json.loads((Path(__file__).resolve().parents[1] / "reports" / "B04" / "summary.json").read_text(encoding="utf-8"))
    models = models_from_b05(sets) if args.source == "b05" else models_from_b06(args.arch, sets, classes)
    results = [evaluate_model(m, sets, h, classes, robots) for m in models]
    first, r0 = models[0], results[0]
    many = len(models) > 1
    y_test = sets["test"]["label"].to_numpy()

    if args.source == "b05":
        report = Report("B08a", "danh-gia-moc-b05", "Đánh giá toàn diện mốc B5 (linear probe trên đặc trưng CLIP ViT-L/14)")
    else:
        report = Report("B08", "danh-gia", f"Đánh giá toàn diện mô hình chính ({models[0]['label']})")
    report.section(1)
    report.p(
        "Đo đủ các mặt của một mô hình nhận dạng theo kế hoạch B8: độ chính xác trên ảnh của lớp đã biết (tổng thể, từng lớp, theo cấp nhân vật và franchise, "
        "theo miền ảnh), độ tin mô hình báo ra có khớp thực tế không (hiệu chỉnh), khả năng nhận ra **robot lạ** (lớp không biết) và **ảnh không phải robot** "
        "(tập âm), và luật trả lời theo cấp sẽ dùng trên web. Trả lời RQ2 và RQ5."
    )
    if args.source == "b05":
        report.p(
            "Báo cáo này chạy trên **mốc của B5** (hồi quy logistic trên đặc trưng CLIP ViT-L/14 đóng băng), để (1) kiểm chứng toàn bộ phép đánh giá trước khi có "
            "mô hình tinh chỉnh và (2) có số liệu tập mở của mốc để so sánh ở B8. Mốc không được chọn hay chỉnh theo tập test nên dùng test ở đây không làm sai "
            "nguyên tắc \"test chỉ dùng một lần\" cho mô hình chính."
        )
    report.p(f"**Số liệu tạm**: dữ liệu là bản tạm `{b04['dataset_version'][:12]}` của B4 (chưa có nhãn tay của B3).")
    report.section(2)
    sizes = {name: len(rows) for name, rows in sets.items()}
    report.table(
        [["Đã biết (195 lớp)", sizes["val"], sizes["test"], "Ảnh của lớp mô hình đã học"],
         ["Lớp không biết (robot lạ)", sizes["unknown_val"], sizes["unknown_test"], "35 robot bị giấu khỏi lúc huấn luyện (B4)"],
         ["Tập âm (không phải robot)", sizes["neg_val"], sizes["neg_test"], "COCO val2017 và ảnh đồ chơi, mô hình, xe (B4b)"]],
        ["Nhóm ảnh", "val (chọn ngưỡng, nhiệt độ)", "test (báo số liệu)", "Ghi chú"], caption="Bảng 1. Các tập dùng trong đánh giá",
    )
    report.p(f"Mô hình: {', '.join(m['name'] for m in models)}.")
    report.section(3)
    report.environment(env)
    report.section(4)
    report.bullets(
        [
            "**Tập đóng** (ảnh test của lớp đã biết): top-1, top-5, macro-F1 kèm khoảng tin cậy bootstrap 95% (1.000 lần lấy mẫu lại ảnh test); balanced accuracy "
            "(trung bình recall các lớp); precision, recall, F1 trung bình đều (macro) và trung bình theo số ảnh (weighted).",
            "**Theo cấp**: xác suất của một nhân vật = tổng xác suất các lớp cùng nhân vật (ví dụ Optimus Prime G1 + phim + ...), của một franchise = tổng các lớp "
            "của franchise; độ chính xác cấp nhân vật (franchise) = tỉ lệ ảnh có nhân vật (franchise) xác suất cao nhất là đúng. **Mức nghiêm trọng của lỗi**: "
            "trong các ảnh đoán sai lớp, sai đúng nhân vật nhưng khác dòng / sai nhân vật cùng franchise / sai franchise.",
            "**Theo miền ảnh và nguồn**: top-1 trên từng nhóm kèm khoảng Wilson 95%. Miền ảnh do CLIP gán ở B3, chưa kiểm định.",
            "**Hiệu chỉnh độ tin** (temperature scaling): p = softmax(z / T), chọn T > 0 làm nhỏ nhất NLL trên **val**; báo ECE (15 khoảng độ tin chia đều), MCE, "
            "NLL, Brier trên test trước và sau hiệu chỉnh. ECE = Σ_b (|B_b| / N) · |độ chính xác của B_b − độ tin trung bình của B_b|.",
            "**Tập mở**: ba điểm \"đã biết\": MSP = max softmax, max-logit, −năng lượng = log Σ exp(z) (T = 1), thêm MSP sau hiệu chỉnh. Tách ảnh test đã biết với "
            "lạ-test (robot lạ) và với âm-test (không phải robot; tách thêm COCO và đồ chơi): AUROC, AUPR-In, AUPR-Out, FPR@95%TPR (tỉ lệ ảnh lạ bị nhận khi ngưỡng "
            "giữ 95% ảnh đã biết), diện tích dưới đường OSCR (tỉ lệ vừa được nhận vừa đúng lớp, theo tỉ lệ ảnh lạ bị nhận). Khoảng tin cậy của AUROC và "
            "FPR@95 bằng bootstrap 1.000 lần, lấy mẫu lại riêng ảnh đã biết và ảnh lạ.",
            "**Luật trả lời theo cấp** (xác suất sau hiệu chỉnh): p(lớp) ≥ t₁ → trả lời lớp; ngược lại p(nhân vật) ≥ t₂ → nhân vật; ngược lại p(franchise) ≥ t₃ → franchise; "
            "còn lại → \"không nhận ra\". Với ảnh đã biết, **lợi ích** = số cấp nói đúng / 3 (đúng lớp 1; đúng nhân vật 2/3; đúng franchise 1/3; sai hoặc từ chối 0). "
            "Với robot lạ, trả lời một lớp luôn là nhận nhầm; trả lời đúng nhân vật (khi nhân vật có trong danh mục, ví dụ Optimus Prime của dòng bị giấu) hoặc đúng franchise, "
            "hoặc từ chối, là đúng. Với ảnh không phải robot chỉ từ chối là đúng.",
            "**Chọn ngưỡng trên val**: vét lưới t₁, t₂, t₃ ∈ {0; 0,02; …; 1} ∪ {1,01 = không bao giờ}, lấy bộ có lợi ích trung bình trên ảnh val đã biết lớn nhất với "
            "ràng buộc tỉ lệ nhận nhầm trên lạ-val ≤ α **và** trên âm-val ≤ α. Kế hoạch dùng α = 5%; báo thêm α = 1%, 2%, 10%, 20% để thấy đánh đổi. "
            "Kết quả trên test kèm khoảng Wilson 95%.",
            "**Khác kế hoạch**: (1) kế hoạch không định nghĩa \"trả lời đúng nhiều nhất\" khi các cấp có giá trị khác nhau; ở đây dùng lợi ích theo số cấp nói đúng để "
            "luật không chọn trả lời ở cấp franchise cho mọi ảnh. (2) Chưa đánh giá riêng ảnh dạng biến hình (`mode = alt`) vì bộ dữ liệu chưa có nhãn dạng.",
        ]
    )
    report.h3("Giải thích bằng lời thường")
    report.bullets(
        [
            "**Hiệu chỉnh độ tin**: nếu mô hình nói \"chắc 90%\" thì trong 100 lần nói vậy phải đúng khoảng 90 lần. ECE đo độ lệch trung bình giữa \"nói chắc bao nhiêu\" và "
            "\"đúng bao nhiêu\"; ECE nhỏ là độ tin đáng tin. Temperature scaling chỉ \"vặn\" độ tin cao lên hay thấp xuống bằng một con số T, không đổi câu trả lời.",
            "**AUROC**: lấy ngẫu nhiên một ảnh đã biết và một ảnh lạ, AUROC là xác suất ảnh đã biết được chấm điểm \"quen\" cao hơn. 0,5 là đoán mò, 1 là tách hoàn hảo.",
            "**FPR@95%TPR**: đặt ngưỡng sao cho 95% ảnh đã biết được nhận, rồi đếm bao nhiêu phần trăm ảnh lạ cũng lọt qua. Càng thấp càng tốt.",
            "**Luật theo cấp**: khi không chắc robot nào, web vẫn có thể nói \"đây có vẻ là Optimus Prime\" hoặc \"đây có vẻ là robot Gundam\" thay vì đoán bừa; khi chẳng chắc gì "
            "thì nói \"không nhận ra\". Ngưỡng được chọn sao cho ảnh lạ hiếm khi bị nhận nhầm.",
        ]
    )

    report.section(5)
    # Bảng 2: tập đóng
    closed_rows = [
        ["top-1 (%)", agg([r["closed"]["top1"][0] for r in results], 2), ci_text(r0["closed"]["top1"], 2)],
        ["top-5 (%)", agg([r["closed"]["top5"][0] for r in results], 2), ci_text(r0["closed"]["top5"], 2)],
        ["macro-F1 (%)", agg([r["closed"]["macro_f1"][0] for r in results], 2), ci_text(r0["closed"]["macro_f1"], 2)],
    ] + [[label, agg([r["summary"][key] for r in results], 2), "—"] for key, label in (
        ("balanced_accuracy", "balanced accuracy (%)"), ("macro_precision", "precision, macro (%)"), ("macro_recall", "recall, macro (%)"),
        ("weighted_precision", "precision, weighted (%)"), ("weighted_recall", "recall, weighted (%)"), ("weighted_f1", "F1, weighted (%)"))]
    closed_cols = ["Chỉ số trên test", "Giá trị" + (" (TB ± ĐLC qua hạt giống)" if many else ""), f"Khoảng tin cậy 95% ({first['name']})"]
    report.table(closed_rows, closed_cols, caption="Bảng 2. Tập đóng: ảnh test của 195 lớp đã biết")

    lv = [r["levels"] for r in results]
    level_rows = [["Lớp (nhân vật + dòng)", agg([x["class"] for x in lv], 2)], ["Nhân vật", agg([x["character"] for x in lv], 2)], ["Franchise", agg([x["franchise"] for x in lv], 2)]]
    report.table(level_rows, ["Cấp", "top-1 trên test (%)"], caption="Bảng 3. Độ chính xác theo cấp (xác suất cộng theo cây nhãn)")
    e = r0["levels"]
    severity_rows = [["Đúng nhân vật, sai dòng (ví dụ Optimus Prime G1 thành Optimus Prime phim)", e["err_same_char"], pct(e["err_same_char"], e["errors"])],
                     ["Sai nhân vật, cùng franchise", e["err_same_franchise"], pct(e["err_same_franchise"], e["errors"])],
                     ["Sai franchise", e["err_other_franchise"], pct(e["err_other_franchise"], e["errors"])],
                     ["Tổng số ảnh đoán sai lớp", e["errors"], "100%"]]
    report.table(severity_rows, ["Loại lỗi", "Số ảnh", "Tỉ lệ trong các lỗi"], caption=f"Bảng 4. Mức nghiêm trọng của lỗi ({first['name']})")

    test_rows = sets["test"]
    ok = r0["correct_test"]
    group_rows = []
    for column, mapping in (("franchise", FRANCHISE), ("source", {"wiki": "Wiki người hâm mộ", "ddg": "Tìm ảnh (ddgs)"}), ("domain", None)):
        values = sorted(test_rows[column].unique()) if mapping is None else list(mapping)
        for value in values:
            mask = (test_rows[column] == value).to_numpy()
            if mask.sum():
                group_rows.append([{"franchise": "Franchise", "source": "Nguồn", "domain": "Miền ảnh (CLIP gán)"}[column],
                                   mapping[value] if mapping else value, int(mask.sum()), wilson_text(ok[mask].sum(), mask.sum())])
    group_cols = ["Nhóm", "Giá trị", "Ảnh test", "top-1 % [Wilson 95%]"]
    report.table(group_rows, group_cols, caption=f"Bảng 5. top-1 theo nhóm ảnh ({first['name']})")

    pc = r0["per_class"].copy()
    pc["name"] = [robots[c]["display_name"] for c in pc["class"]]
    worst = pc.sort_values(["f1", "support"]).head(20)
    worst_rows = [[r["name"], FRANCHISE[robots[r["class"]]["franchise"]], int(r["support"]), vn(100 * r["precision"]), vn(100 * r["recall"]), vn(100 * r["f1"])] for _, r in worst.iterrows()]
    report.table(worst_rows, ["Lớp", "Franchise", "Ảnh test", "Precision (%)", "Recall (%)", "F1 (%)"], caption=f"Bảng 6. 20 lớp kém nhất theo F1 ({first['name']})")

    pred = first["logits"]["test"].argmax(1)
    pairs = Counter((int(a), int(b)) for a, b in zip(y_test, pred) if a != b)
    support = np.bincount(y_test, minlength=len(classes))
    pair_rows = [[robots[classes[a]]["display_name"], robots[classes[b]]["display_name"], n, pct(n, support[a]),
                  "cùng nhân vật" if h.class_char[a] == h.class_char[b] else "cùng franchise" if h.class_franchise[a] == h.class_franchise[b] else "khác franchise"]
                 for (a, b), n in pairs.most_common(20)]
    report.table(pair_rows, ["Lớp thật", "Bị đoán thành", "Số ảnh", "Tỉ lệ trong ảnh của lớp thật", "Quan hệ"], caption=f"Bảng 7. 20 cặp nhầm nhiều nhất ({first['name']})")

    order = sorted(range(len(classes)), key=lambda i: (robots[classes[i]]["franchise"], robots[classes[i]]["group"], classes[i]))
    matrix = np.zeros((len(classes), len(classes)))
    np.add.at(matrix, (y_test, pred), 1)
    matrix = matrix / np.maximum(matrix.sum(1, keepdims=True), 1)
    shown = matrix[np.ix_(order, order)].copy()
    np.fill_diagonal(shown, np.nan)
    fig, ax = plt.subplots(figsize=(7.5, 6.6))
    im = ax.imshow(shown, cmap="magma_r", vmin=0, vmax=0.3, interpolation="nearest")
    franchises_sorted = [robots[classes[i]]["franchise"] for i in order]
    edges = [i for i in range(1, len(order)) if franchises_sorted[i] != franchises_sorted[i - 1]]
    for edge in edges:
        ax.axhline(edge - 0.5, color="#0f172a", linewidth=0.6)
        ax.axvline(edge - 0.5, color="#0f172a", linewidth=0.6)
    starts = [0] + edges
    ends = edges + [len(order)]
    centers = [(a + b - 1) / 2 for a, b in zip(starts, ends)]
    names = [FRANCHISE[franchises_sorted[a]].split(" /")[0] for a in starts]
    ax.set_xticks(centers, names, fontsize=8)
    ax.set_yticks(centers, names, fontsize=8, rotation=90, va="center")
    ax.set_xlabel("Lớp bị đoán (xếp theo franchise, dòng)")
    ax.set_ylabel("Lớp thật")
    fig.colorbar(im, ax=ax, fraction=0.04, label="Tỉ lệ ảnh của lớp thật (bỏ đường chéo; cắt ở 0,3)")
    fig.tight_layout()
    report.figure(fig, "ma-tran-nham", f"Ma trận nhầm lẫn chuẩn hoá theo hàng, bỏ đường chéo ({first['name']}); đường kẻ chia ba franchise")
    plt.close(fig)

    # Hiệu chỉnh
    cal_rows = []
    for key, label in (("ece", "ECE"), ("mce", "MCE"), ("nll", "NLL"), ("brier", "Brier")):
        cal_rows.append([label, agg([r["cal_before"][key] for r in results], 4, 1), agg([r["cal_after"][key] for r in results], 4, 1)])
    cal_rows.append(["Nhiệt độ T (chọn trên val)", "1", agg([r["T"] for r in results], 3, 1)])
    report.table(cal_rows, ["Chỉ số trên test", "Trước hiệu chỉnh (T = 1)", "Sau hiệu chỉnh"], caption="Bảng 8. Hiệu chỉnh độ tin (càng nhỏ càng tốt)")
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.8))
    for ax, key, title in ((axes[0], "cal_before", "Trước hiệu chỉnh"), (axes[1], "cal_after", f"Sau hiệu chỉnh (T = {vn(r0['T'], 2)})")):
        bins = [b for b in r0[key]["bins"] if b["count"]]
        centers = [(b["low"] + b["high"]) / 2 for b in bins]
        ax.bar(centers, [b["accuracy"] for b in bins], width=1 / 15, edgecolor="#0f172a", color="#c2410c", alpha=0.8, label="Độ chính xác")
        ax.plot([0, 1], [0, 1], linestyle="--", color="#64748b", label="Hiệu chỉnh hoàn hảo")
        ax.set_title(f"{title}: ECE = {vn(r0[key]['ece'], 3)}", fontsize=9)
        ax.set_xlabel("Độ tin (xác suất cao nhất)")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
    axes[0].set_ylabel("Độ chính xác trong khoảng")
    axes[0].legend(fontsize=7)
    fig.tight_layout()
    report.figure(fig, "do-tin-cay", f"Biểu đồ độ tin cậy trên test ({first['name']}): cột thấp hơn đường chéo là mô hình tự tin quá mức")
    plt.close(fig)

    # Tập mở
    ood_rows = []
    for target, label in (("unknown_test", "Robot lạ (lạ-test)"), ("neg_test", "Không phải robot (âm-test)"), ("neg_test_coco", "   trong đó COCO"), ("neg_test_toy", "   trong đó đồ chơi, xe")):
        for score in SCORE_LABEL:
            values = [r["ood"][(score, target)] for r in results]
            m = values[0]
            auroc_ci = f" [{vn(m['auroc_ci'][0], 3)}; {vn(m['auroc_ci'][1], 3)}]" if "auroc_ci" in m and not many else ""
            fpr_ci = f" [{vn(100 * m['fpr95_ci'][0])}; {vn(100 * m['fpr95_ci'][1])}]" if "fpr95_ci" in m and not many else ""
            ood_rows.append([label, SCORE_LABEL[score], agg([v["auroc"] for v in values], 3, 1) + auroc_ci, agg([v["aupr_in"] for v in values], 3, 1),
                             agg([v["aupr_out"] for v in values], 3, 1), agg([v["fpr95"] for v in values], 1) + fpr_ci, agg([v["oscr"] for v in values], 3, 1)])
    ood_cols = ["Ảnh lạ", "Điểm", "AUROC", "AUPR-In", "AUPR-Out", "FPR@95%TPR (%)", "Diện tích OSCR"]
    report.table(ood_rows, ood_cols, caption="Bảng 9. Tách ảnh đã biết (test) với ảnh lạ")
    fig, axes = plt.subplots(1, 3, figsize=(13, 3.6))
    bins = np.linspace(0, 1, 41)
    sc = r0["scores"]
    axes[0].hist(sc["test"]["msp_t"], bins=bins, alpha=0.6, density=True, color="#0f766e", label="đã biết (test)")
    axes[0].hist(sc["unknown_test"]["msp_t"], bins=bins, alpha=0.6, density=True, color="#c2410c", label="robot lạ")
    axes[0].hist(sc["neg_test"]["msp_t"], bins=bins, alpha=0.6, density=True, color="#64748b", label="không phải robot")
    axes[0].set_xlabel("MSP sau hiệu chỉnh")
    axes[0].set_ylabel("Mật độ")
    axes[0].legend(fontsize=7)
    for ax, target, title in ((axes[1], "unknown_test", "OSCR: robot lạ"), (axes[2], "neg_test", "OSCR: không phải robot")):
        for score, color in (("msp", "#0f766e"), ("maxlogit", "#1d4ed8"), ("energy", "#c2410c")):
            fpr, ccr = r0["ood"][(score, target)]["curve"]
            ax.plot(fpr, ccr, color=color, label=f"{SCORE_LABEL[score]} ({vn(r0['ood'][(score, target)]['oscr'], 3)})")
        ax.set_xscale("symlog", linthresh=0.01)
        ax.set_xlabel("Tỉ lệ ảnh lạ bị nhận (FPR)")
        ax.set_ylabel("Tỉ lệ ảnh đã biết vừa được nhận vừa đúng (CCR)")
        ax.set_title(title, fontsize=9)
        ax.legend(fontsize=7)
    fig.tight_layout()
    report.figure(fig, "tap-mo", f"Trái: phân bố độ tin của ba nhóm ảnh. Giữa, phải: đường OSCR (trục ngang thang log gần 0; trong ngoặc là diện tích) ({first['name']})")
    plt.close(fig)

    # Luật trả lời theo cấp
    rule_rows = []
    for far, rr in r0["rule"].items():
        k, u, n = rr["known"], rr["unknown"], rr["negative"]
        nk, nu, nn = len(k["level"]), len(u["level"]), len(n["level"])
        rule_rows.append([
            f"{vn(100 * far, 0)}%", "; ".join(vn(x, 2) for x in rr["t"]), vn(100 * rr["val"]["utility"]),
            wilson_text((k["correct"] & (k["level"] == 3)).sum(), nk), wilson_text((k["correct"] & (k["level"] == 2)).sum(), nk),
            wilson_text((k["correct"] & (k["level"] == 1)).sum(), nk), wilson_text(k["wrong"].sum(), nk), wilson_text(k["reject"].sum(), nk),
            wilson_text(u["false_accept"].sum(), nu), wilson_text(n["false_accept"].sum(), nn),
        ])
    rule_cols = ["α (trần nhận nhầm trên val)", "t₁; t₂; t₃", "Lợi ích trên val (%)", "Đã biết: đúng lớp %", "đúng nhân vật %", "đúng franchise %", "trả lời sai %",
                 "từ chối oan %", "Robot lạ: nhận nhầm %", "Không phải robot: nhận nhầm %"]
    report.table(rule_rows, rule_cols, caption=f"Bảng 10. Luật trả lời theo cấp: ngưỡng chọn trên val, kết quả trên test [Wilson 95%] ({first['name']})")
    main_rule = r0["rule"][0.05]
    k, u, n = main_rule["known"], main_rule["unknown"], main_rule["negative"]
    unk_rows = sets["unknown_test"]
    char_known = np.array([h.char_of(c, robots[c]) >= 0 for c in unk_rows["class"]])
    detail_rows = [
        ["Robot lạ có nhân vật trong danh mục (ví dụ Optimus Prime dòng bị giấu)", int(char_known.sum()),
         wilson_text((u["correct"] & (u["level"] == 2) & char_known).sum(), char_known.sum()), wilson_text((u["level"][char_known] == 1).sum() if char_known.any() else 0, char_known.sum()),
         wilson_text(u["reject"][char_known].sum(), char_known.sum()), wilson_text(u["false_accept"][char_known].sum(), char_known.sum())],
        ["Robot lạ có nhân vật không có trong danh mục", int((~char_known).sum()), "—", wilson_text((u["correct"] & (u["level"] == 1) & ~char_known).sum(), (~char_known).sum()),
         wilson_text(u["reject"][~char_known].sum(), (~char_known).sum()), wilson_text(u["false_accept"][~char_known].sum(), (~char_known).sum())],
    ]
    report.table(detail_rows, ["Nhóm robot lạ (test)", "Số ảnh", "Trả lời đúng nhân vật %", "Trả lời franchise %", "Từ chối %", "Nhận nhầm %"],
                 caption="Bảng 11. Robot lạ dưới luật α = 5%: hệ thống có nói được \"đây là Optimus Prime\" khi gặp một dòng Optimus chưa học không?")
    fig, ax = plt.subplots(figsize=(7, 3.4))
    fars = list(r0["rule"])
    for label, fn, color in (("đúng lớp", lambda rr: (rr["known"]["correct"] & (rr["known"]["level"] == 3)).mean(), "#c2410c"),
                             ("đúng ở cấp bất kỳ", lambda rr: rr["known"]["correct"].mean(), "#0f766e"),
                             ("từ chối oan", lambda rr: rr["known"]["reject"].mean(), "#64748b"),
                             ("robot lạ bị nhận nhầm", lambda rr: rr["unknown"]["false_accept"].mean(), "#7c3aed"),
                             ("không phải robot bị nhận nhầm", lambda rr: rr["negative"]["false_accept"].mean(), "#1d4ed8")):
        ax.plot([100 * f for f in fars], [100 * fn(r0["rule"][f]) for f in fars], marker="o", color=color, label=label)
    ax.set_xlabel("α: trần tỉ lệ nhận nhầm đặt trên val (%)")
    ax.set_ylabel("Tỉ lệ trên test (%)")
    ax.set_xscale("log")
    ax.set_xticks([1, 2, 5, 10, 20])
    ax.set_xticklabels(["1", "2", "5", "10", "20"])
    ax.legend(fontsize=7)
    fig.tight_layout()
    report.figure(fig, "danh-doi", "Đánh đổi của luật trả lời theo cấp: nới trần nhận nhầm thì trả lời được nhiều hơn nhưng nhận nhầm ảnh lạ nhiều hơn")
    plt.close(fig)

    # So sánh với mốc B5 (chỉ khi đánh giá mô hình tinh chỉnh)
    compare_rows = []
    if args.source == "b06":
        base = models_from_b05(sets)[0]
        base_ok = base["logits"]["test"].argmax(1) == y_test
        tests = [mcnemar(r["correct_test"], base_ok) for r in results]
        adjusted = holm([t.p_value for t in tests])
        for m, r, t, p_adj in zip(models, results, tests, adjusted):
            diff = paired_bootstrap_diff(r["correct_test"], base_ok, 1000, seed=SEED)
            compare_rows.append([f"{m['name']} so với linear probe B5", f"{vn(100 * diff.estimate)} [{vn(100 * diff.low)}; {vn(100 * diff.high)}]", t.b, t.c, pv(t.p_value), pv(p_adj)])
        report.table(compare_rows, ["So sánh trên test", "Hiệu top-1, điểm % [KTC 95%]", "A đúng, B sai", "A sai, B đúng", "p (McNemar)", "p sau Holm"],
                     caption="Bảng 12. Mô hình tinh chỉnh so với mốc B5 (RQ2)")
        report.h3("Giải thích mô hình và phân tích lỗi")
        extra = explain_and_errors(args.arch, models[0]["seed"], sets, first["logits"]["test"], classes, robots, report)
        report.p(f"Trang để chủ dự án phân loại nguyên nhân của 100 ảnh đoán sai (nhãn sai, hai robot giống nhau, ảnh khó, sai dòng, kiểu ảnh lạ): `{extra['error_page']}`. "
                 "Tỉ lệ từng nguyên nhân sẽ được thêm vào báo cáo khi có kết quả.")

    # summary.json
    report.set("dataset_version", b04["dataset_version"])
    report.set("source", args.source)
    report.set("models", [m["name"] for m in models])
    report.set("closed", [{k: list(v) for k, v in r["closed"].items()} for r in results])
    report.set("levels", lv)
    report.set("temperature", [r["T"] for r in results])
    report.set("calibration", [{"before": {k: r["cal_before"][k] for k in ("ece", "mce", "nll", "brier")}, "after": {k: r["cal_after"][k] for k in ("ece", "mce", "nll", "brier")}} for r in results])
    report.set("ood", [{f"{s}|{t}": {k: v for k, v in m.items() if k != "curve"} for (s, t), m in r["ood"].items()} for r in results])
    report.set("rule", [{str(f): {"t": rr["t"], "val": rr["val"], "test": {
        "known_correct_class": float((rr["known"]["correct"] & (rr["known"]["level"] == 3)).mean()), "known_correct_any": float(rr["known"]["correct"].mean()),
        "known_wrong": float(rr["known"]["wrong"].mean()), "known_reject": float(rr["known"]["reject"].mean()),
        "unknown_false_accept": float(rr["unknown"]["false_accept"].mean()), "negative_false_accept": float(rr["negative"]["false_accept"].mean())}} for f, rr in r["rule"].items()} for r in results])
    report.set("tables", {
        "Bảng 2. Tập đóng": {"columns": closed_cols, "rows": closed_rows},
        "Bảng 3. Theo cấp": {"columns": ["Cấp", "top-1 trên test (%)"], "rows": level_rows},
        "Bảng 4. Mức nghiêm trọng của lỗi": {"columns": ["Loại lỗi", "Số ảnh", "Tỉ lệ"], "rows": severity_rows},
        "Bảng 5. top-1 theo nhóm ảnh": {"columns": group_cols, "rows": group_rows},
        "Bảng 8. Hiệu chỉnh": {"columns": ["Chỉ số", "Trước", "Sau"], "rows": cal_rows},
        "Bảng 9. Tập mở": {"columns": ood_cols, "rows": ood_rows},
        "Bảng 10. Luật trả lời theo cấp": {"columns": rule_cols, "rows": rule_rows},
    })

    # Phân tích
    report.section(6)
    cb, ca = r0["cal_before"], r0["cal_after"]
    best_near = max(SCORE_LABEL, key=lambda s: r0["ood"][(s, "unknown_test")]["auroc"])
    best_far = max(SCORE_LABEL, key=lambda s: r0["ood"][(s, "neg_test")]["auroc"])
    near, far_ = r0["ood"][(best_near, "unknown_test")], r0["ood"][(best_far, "neg_test")]
    coco, toy = r0["ood"][(best_far, "neg_test_coco")], r0["ood"][(best_far, "neg_test_toy")]
    analysis = [
        f"Tập đóng: top-1 {ci_text(r0['closed']['top1'])}%, top-5 {ci_text(r0['closed']['top5'])}%. Ở cấp nhân vật đúng {vn(100 * lv[0]['character'])}%, cấp franchise "
        f"{vn(100 * lv[0]['franchise'])}%. Trong {e['errors']} ảnh đoán sai lớp, {pct(e['err_same_char'], e['errors'])} là đúng nhân vật sai dòng và "
        f"{pct(e['err_other_franchise'], e['errors'])} là sai cả franchise: phần lớn lỗi là nhầm giữa các robot gần nhau.",
        f"Hiệu chỉnh: T = {vn(r0['T'], 2)} ({'mô hình tự tin quá mức, cần hạ độ tin' if r0['T'] > 1 else 'mô hình thiếu tự tin, cần nâng độ tin'}). ECE trên test từ "
        f"{vn(cb['ece'], 3)} xuống {vn(ca['ece'], 3)}, NLL từ {vn(cb['nll'], 3)} xuống {vn(ca['nll'], 3)}. Mục tiêu tham khảo của kế hoạch là ECE sau hiệu chỉnh ≤ 0,05: "
        + ("đạt." if ca["ece"] <= 0.05 else "chưa đạt."),
        f"Robot lạ: điểm tốt nhất là {SCORE_LABEL[best_near]}, AUROC {vn(near['auroc'], 3)}, FPR@95 {vn(100 * near['fpr95'])}%. Mục tiêu tham khảo AUROC ≥ 0,85: "
        + ("đạt." if near["auroc"] >= 0.85 else "chưa đạt.") + " Robot lạ là phần khó nhất vì chúng giống robot đã biết.",
        f"Không phải robot: {SCORE_LABEL[best_far]} đạt AUROC {vn(far_['auroc'], 3)} (COCO {vn(coco['auroc'], 3)}, đồ chơi và xe {vn(toy['auroc'], 3)}). "
        "Ảnh đời thường dễ tách hơn hẳn ảnh đồ chơi chụp kiểu sản phẩm.",
        f"Luật trả lời theo cấp với α = 5% (ngưỡng {', '.join(vn(x, 2) for x in main_rule['t'])}): trên test trả lời đúng lớp "
        f"{pct((k['correct'] & (k['level'] == 3)).sum(), len(k['level']))} ảnh đã biết, đúng ở một cấp nào đó {pct(k['correct'].sum(), len(k['level']))}, "
        f"trả lời sai {pct(k['wrong'].sum(), len(k['level']))}, từ chối oan {pct(k['reject'].sum(), len(k['level']))}; nhận nhầm {pct(u['false_accept'].sum(), len(u['level']))} "
        f"robot lạ và {pct(n['false_accept'].sum(), len(n['level']))} ảnh không phải robot. Tỉ lệ nhận nhầm trên test có thể vượt 5% một chút vì ngưỡng chọn trên val.",
    ]
    if compare_rows:
        analysis.append("So với mốc B5 (bảng 12): " + "; ".join(f"{row[0].split(' so với')[0]}: {row[1]} điểm, p sau Holm {row[5]}" for row in compare_rows) + ".")
    report.bullets(analysis)
    report.section(7)
    report.bullets(
        [
            "Số liệu trên bản dữ liệu tạm; nhãn sai còn sót trong test làm các chỉ số thấp hơn thật một chút (ảnh đúng mà nhãn sai bị tính là lỗi).",
            "Lớp không biết và tập âm cùng nguồn web với dữ liệu huấn luyện; robot lạ hay ảnh khách gửi ngoài đời có thể khác (thử nghiệm thực địa ở B13).",
            "Nhóm đồ chơi của tập âm chưa duyệt tay từng ảnh nên có thể lẫn vài ảnh robot, làm tỉ lệ nhận nhầm trên nhóm này cao hơn thật.",
            "Ngưỡng chọn trên một lưới bước 0,02 và trên cỡ mẫu val hữu hạn; tỉ lệ nhận nhầm trên test dao động quanh α.",
            "Chưa đánh giá ảnh dạng biến hình (xe, thú) riêng vì chưa có nhãn dạng; chưa thử outlier exposure (E7, cần huấn luyện lại).",
            "Miền ảnh do CLIP gán, chưa kiểm định; bảng theo miền chỉ để tham khảo.",
        ]
    )
    report.section(8)
    report.reproduce([f"ml/.venv/Scripts/python ml/scripts/b08_danh_gia.py --source {args.source}" + (f" --arch {args.arch}" if args.arch else "")],
                     config=None, config_hash=None, seed=SEED, dataset_version=f"b04_splits.csv sha256 {b04['dataset_version'][:12]}")
    print(report.write())


if __name__ == "__main__":
    main()
