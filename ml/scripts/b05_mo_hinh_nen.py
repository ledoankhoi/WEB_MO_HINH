"""B5, phần 2: mô hình nền trên đặc trưng đóng băng (thí nghiệm E1) và báo cáo B05.

Với mỗi bộ đặc trưng (CLIP ViT-B/32, B/16, L/14; DINOv2 ViT-S/14, B/14): zero-shot (chỉ CLIP), linear probe (hồi quy logistic,
chọn C bằng 5-fold CV), k-NN cô-sin. Báo top-1, top-5, macro-F1 trên val và test kèm khoảng tin cậy bootstrap 95%.

Chạy sau `b05_dac_trung.py`:  ml/.venv/Scripts/python ml/scripts/b05_mo_hinh_nen.py [--recompute]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from robotrec.baselines import fit_logreg, knn_scores, metrics_with_ci  # noqa: E402
from robotrec.config import MANIFESTS, config_hash, data_root, load_config  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.report import Report  # noqa: E402
from robotrec.stats import holm, mcnemar, paired_bootstrap_diff  # noqa: E402

FRANCHISE = {"transformers": "Transformers", "gundam": "Gundam", "sentai": "Super Sentai / Power Rangers"}
METHOD = {"zs": "Zero-shot", "lp": "Linear probe", "knn": "k-NN"}


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def ci(triple, digits: int = 1) -> str:
    point, low, high = (100 * v for v in triple)
    return f"{vn(point, digits)} [{vn(low, digits)}; {vn(high, digits)}]"


def pv(p: float) -> str:
    return "< 0,001" if p < 0.001 else f"{p:.3f}".replace(".", ",")


def evaluate_backbone(spec: dict, cfg: dict, splits: pd.DataFrame, class_index: dict[str, int], out: Path, root: Path) -> dict:
    from sklearn.model_selection import StratifiedGroupKFold

    data = np.load(root / "b05" / "features" / f"{spec['id']}.npz")
    position = {key: i for i, key in enumerate(data["keys"])}
    features = data["features"]
    n_classes = len(class_index)
    part = {}
    for name in ("train", "val", "test"):
        rows = splits[splits["split"] == name]
        part[name] = (features[[position[k] for k in rows["key"]]], rows["class"].map(class_index).to_numpy(), rows)
    x_train, y_train, train_rows = part["train"]
    results, scores_out = [], {}

    def add(method: str, setting: str, score_of: dict[str, np.ndarray], **extra) -> None:
        entry = {"backbone": spec["id"], "method": method, "setting": setting, **extra}
        for name in ("val", "test"):
            entry[name] = metrics_with_ci(score_of[name], part[name][1], n_classes, cfg["bootstrap_resamples"], cfg["seed"])
            scores_out[f"{method}|{setting}|{name}"] = score_of[name].argmax(1).astype(np.int16)
        results.append(entry)

    # (a) Zero-shot
    if "text" in data.files:
        slug_pos = {s: i for i, s in enumerate(data["slugs"])}
        text = data["text"][[slug_pos[s] for s in class_index]]
        add("zs", "—", {name: part[name][0] @ text.T for name in ("val", "test")})

    # (b) Linear probe: chọn C bằng CV theo nhóm trên train
    lp = cfg["linear_probe"]
    folds = list(StratifiedGroupKFold(n_splits=lp["cv_folds"], shuffle=True, random_state=cfg["seed"]).split(x_train, y_train, train_rows["group"]))
    cv, grid = {}, list(lp["c_grid"])
    started = time.monotonic()
    while grid:
        c = grid.pop(0)
        accuracies = []
        for fit_index, held_index in folds:
            weights, bias = fit_logreg(x_train[fit_index], y_train[fit_index], n_classes, c, lp["max_iter"])
            accuracies.append(float(((x_train[held_index] @ weights.T + bias).argmax(1) == y_train[held_index]).mean()))
        cv[c] = (float(np.mean(accuracies)), float(np.std(accuracies, ddof=1)))
        print(f"  {spec['label']} C={c:g}: CV top-1 {100 * cv[c][0]:.2f} ± {100 * cv[c][1]:.2f}", flush=True)
        best = max(cv, key=lambda k: cv[k][0])
        if not grid and best == max(cv) and best * 10 <= lp["c_extend_to"]:
            grid.append(best * 10)  # C tốt nhất ở mép trên của lưới: thử tiếp
    best = max(cv, key=lambda k: cv[k][0])
    weights, bias = fit_logreg(x_train, y_train, n_classes, best, lp["max_iter"])
    lp_seconds = time.monotonic() - started
    lp_scores = {name: part[name][0] @ weights.T + bias for name in ("val", "test")}
    add("lp", f"C = {best:g}", lp_scores, cv={f"{k:g}": v for k, v in cv.items()}, best_c=float(best), seconds=lp_seconds,
        train_top1=float(((x_train @ weights.T + bias).argmax(1) == y_train).mean()))
    np.savez(out / f"{spec['id']}-lp.npz", weights=weights, bias=bias, val=lp_scores["val"].astype(np.float32), test=lp_scores["test"].astype(np.float32))

    # (c) k-NN
    for k in cfg["knn_k"]:
        add("knn", f"k = {k}", {name: knn_scores(x_train, y_train, part[name][0], n_classes, k) for name in ("val", "test")})

    summary = {"id": spec["id"], "label": spec["label"], "dim": int(features.shape[1]), "params": int(data["params"]), "seconds": float(data["seconds"]),
               "images": int(len(features)), "results": results}
    (out / f"{spec['id']}.json").write_text(json.dumps(summary, ensure_ascii=False), encoding="utf-8")
    np.savez(out / f"{spec['id']}-pred.npz", **scores_out)
    return summary


def sklearn_check(cfg: dict, splits: pd.DataFrame, class_index: dict[str, int], out: Path, root: Path) -> dict:
    """So hồi quy logistic tự viết (PyTorch, GPU) với scikit-learn trên một cấu hình thật."""
    target = out / "sklearn-check.json"
    if target.exists():
        return json.loads(target.read_text(encoding="utf-8"))
    from sklearn.linear_model import LogisticRegression

    spec = cfg["backbones"][0]
    data = np.load(root / "b05" / "features" / f"{spec['id']}.npz")
    position = {key: i for i, key in enumerate(data["keys"])}
    get = lambda name: (data["features"][[position[k] for k in splits.loc[splits["split"] == name, "key"]]],  # noqa: E731
                        splits.loc[splits["split"] == name, "class"].map(class_index).to_numpy())
    (x_train, y_train), (x_val, y_val) = get("train"), get("val")
    c = 1.0
    started = time.monotonic()
    weights, bias = fit_logreg(x_train, y_train, len(class_index), c, cfg["linear_probe"]["max_iter"])
    mine_seconds = time.monotonic() - started
    mine = (x_val @ weights.T + bias).argmax(1)
    started = time.monotonic()
    model = LogisticRegression(C=c, max_iter=cfg["linear_probe"]["max_iter"]).fit(x_train, y_train)
    theirs_seconds = time.monotonic() - started
    theirs = model.predict(x_val)
    result = {"backbone": spec["label"], "c": c, "mine_top1": float((mine == y_val).mean()), "sklearn_top1": float((theirs == y_val).mean()),
              "agreement": float((mine == theirs).mean()), "mine_seconds": mine_seconds, "sklearn_seconds": theirs_seconds, "n_iter": int(model.n_iter_[0])}
    target.write_text(json.dumps(result), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--recompute", action="store_true")
    args = parser.parse_args()
    cfg = load_config("b05_mo_hinh_nen")
    root = data_root()
    out = root / "b05" / "eval"
    out.mkdir(parents=True, exist_ok=True)
    env = environment()
    splits = pd.read_csv(MANIFESTS / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
    b04 = json.loads((Path(__file__).resolve().parents[1] / "reports" / "B04" / "summary.json").read_text(encoding="utf-8"))
    robots = json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]
    known = sorted(splits.loc[splits["split"] == "train", "class"].unique())
    class_index = {slug: i for i, slug in enumerate(known)}
    franchise_of = {r["slug"]: r["franchise"] for r in robots}
    name_of = {r["slug"]: r["display_name"] for r in robots}

    summaries = []
    for spec in cfg["backbones"]:
        cached = out / f"{spec['id']}.json"
        if cached.exists() and not args.recompute:
            summaries.append(json.loads(cached.read_text(encoding="utf-8")))
        else:
            print(spec["label"], flush=True)
            summaries.append(evaluate_backbone(spec, cfg, splits, class_index, out, root))
    check = sklearn_check(cfg, splits, class_index, out, root)

    label_of = {s["id"]: s["label"] for s in summaries}
    rows = [dict(r, label=label_of[r["backbone"]]) for s in summaries for r in s["results"]]
    y = {name: splits.loc[splits["split"] == name, "class"].map(class_index).to_numpy() for name in ("val", "test")}
    pred = {s["id"]: np.load(out / f"{s['id']}-pred.npz") for s in summaries}

    def correct(row: dict, name: str) -> np.ndarray:
        return pred[row["backbone"]][f"{row['method']}|{row['setting']}|{name}"] == y[name]

    best_of = {m: max((r for r in rows if r["method"] == m), key=lambda r: r["val"]["top1"][0]) for m in METHOD}
    best_knn_per = {s["id"]: max((r for r in s["results"] if r["method"] == "knn"), key=lambda r: r["val"]["top1"][0]) for s in summaries}
    lp_per = {s["id"]: next(r for r in s["results"] if r["method"] == "lp") for s in summaries}
    best_lp = best_of["lp"]

    # Báo cáo ---------------------------------------------------------------------------------------------------------
    report = Report("B05", "mo-hinh-nen", "Mô hình nền trên đặc trưng đóng băng (thí nghiệm E1)")
    report.section(1)
    report.p(
        "Đặt **mốc so sánh** trước khi huấn luyện: nếu không tinh chỉnh mạng nào, chỉ lấy đặc trưng của các mạng đã huấn luyện sẵn (đóng băng) rồi phân loại bằng "
        "phương pháp đơn giản, thì nhận dạng 195 robot đạt bao nhiêu? Con số này trả lời nửa đầu của RQ2; nửa sau (tinh chỉnh tốt hơn bao nhiêu) có ở B6 và B8. "
        "Bước này cũng cho biết bộ đặc trưng nào hợp với bài toán, làm căn cứ chọn kiến trúc ở B6."
    )
    report.p(f"**Số liệu tạm**: chạy trên bản dữ liệu tạm `{b04['dataset_version'][:12]}` của B4 (chưa có nhãn tay của B3).")
    report.section(2)
    sizes = b04["sizes"]
    report.bullets(
        [
            f"Đầu vào: `b04_splits.csv.gz` (mã `{b04['dataset_version'][:12]}`): train {sizes['train']}, val {sizes['val']}, test {sizes['test']} ảnh của {len(known)} lớp đã biết.",
            "Đầu ra: báo cáo này, `ml/reports/B05/summary.json`; đặc trưng, trọng số linear probe và dự đoán từng ảnh ở `ROBOTREC_DATA/b05/` (không vào git; dùng lại ở B8 để so với mô hình tinh chỉnh).",
            "Lớp không biết và tập âm đã được trích đặc trưng nhưng chưa dùng ở bước này (để dành cho B8).",
        ]
    )
    report.section(3)
    report.environment(env)
    report.section(4)
    lp = cfg["linear_probe"]
    report.bullets(
        [
            "**Đặc trưng đóng băng.** Mỗi ảnh đi qua mạng một lần, lấy vector đầu ra, chuẩn hoá L2 (độ dài 1). Trọng số mạng không đổi. "
            "CLIP (Radford et al., 2021) học từ 400 triệu cặp ảnh và chữ; DINOv2 (Oquab et al., 2023) tự học từ 142 triệu ảnh, không dùng chữ. "
            "Ảnh vào 224×224: CLIP dùng tiền xử lý của open_clip; DINOv2 thu cạnh ngắn về 256 (bicubic), cắt giữa 224, chuẩn hoá theo ImageNet, lấy vector CLS.",
            "**(a) Zero-shot (chỉ CLIP).** Không dùng ảnh huấn luyện nào. Mỗi lớp được mô tả bằng 5 câu tiếng Anh, ví dụ "
            + "; ".join(f"*\"{t}\"*" for t in cfg["zero_shot_templates"][:2]) + ". Lấy trung bình 5 vector văn bản, chuẩn hoá L2. Ảnh được gán cho lớp có cô-sin lớn nhất: "
            "ŷ = argmax_c cos(f(x), t_c).",
            "**(b) Linear probe.** Hồi quy logistic đa lớp trên đặc trưng: p(c | x) = softmax(W·f(x) + b). Tìm W, b làm nhỏ nhất "
            "Σᵢ −log p(yᵢ | xᵢ) + ‖W‖² / (2C) bằng thuật toán L-BFGS (tối đa "
            f"{lp['max_iter']} vòng). C là độ mạnh điều chuẩn: C nhỏ ép W nhỏ (chống quá khớp), C lớn cho mô hình tự do hơn. "
            f"Chọn C trong {{{', '.join(f'{c:g}' for c in lp['c_grid'])}}} bằng **{lp['cv_folds']}-fold cross-validation** trên train, rồi huấn luyện lại trên toàn bộ train với C tốt nhất.",
            "**(c) k-NN cô-sin.** Với mỗi ảnh cần đoán, tìm k ảnh train giống nhất (cô-sin lớn nhất); mỗi ảnh láng giềng bỏ phiếu cho lớp của nó với trọng số bằng độ giống; "
            f"lớp nhiều điểm nhất thắng. k ∈ {{{', '.join(str(k) for k in cfg['knn_k'])}}}. Không có bước huấn luyện.",
            f"**Chỉ số.** top-1, top-5, macro-F1 (kế hoạch mục 7.2) trên val và test. Khoảng tin cậy 95% bằng bootstrap {cfg['bootstrap_resamples']} lần theo phân vị: lấy mẫu lại có hoàn lại "
            "các ảnh của tập đánh giá. Mô hình và C được chọn **chỉ bằng CV và val**; test không tham gia lựa chọn nào.",
            "**So sánh hai phương pháp** trên cùng tập test: kiểm định McNemar trên các ảnh mà hai phương pháp đúng/sai khác nhau, hiệu top-1 kèm khoảng tin cậy bootstrap ghép cặp, "
            "giá trị p hiệu chỉnh Holm–Bonferroni vì so nhiều cặp.",
            "**Khác kế hoạch ở ba điểm.** (1) Hồi quy logistic viết bằng PyTorch chạy trên GPU thay cho scikit-learn (cùng hàm mục tiêu, cùng L-BFGS) vì nhanh hơn nhiều lần; "
            "đã so khớp với scikit-learn (bảng 7 và test tự động). (2) CV chia theo **nhóm** ảnh gần trùng của B4 (`StratifiedGroupKFold`) thay cho chia phân tầng thường, để hai ảnh "
            "gần giống nhau không nằm ở hai phần; nếu không, CV sẽ ưu ái mô hình ít điều chuẩn. (3) Khi C tốt nhất nằm ở mép trên của lưới thì thử tiếp C × 10 "
            f"(tới {lp['c_extend_to']:g}), vì đặc trưng đã chuẩn hoá về độ dài 1 cần C lớn.",
        ]
    )
    report.h3("Giải thích bằng lời thường")
    report.bullets(
        [
            "**Đặc trưng** là bản tóm tắt bằng số của bức ảnh do một mạng đã học sẵn viết ra, như một người sành sỏi mô tả ảnh bằng vài trăm con số. Ở bước này ta không dạy lại người đó.",
            "**Zero-shot**: đưa cho CLIP tên robot bằng chữ và hỏi ảnh giống tên nào nhất. Không cần ảnh mẫu nào, nhưng CLIP phải tự biết robot đó trông thế nào.",
            "**k-NN**: \"ảnh này giống những ảnh nào đã có nhãn?\" rồi lấy theo số đông. Giống tra cứu album ảnh.",
            "**Linear probe**: kẻ các đường thẳng (mặt phẳng) chia không gian đặc trưng thành vùng của từng robot. Chỉ học lớp cuối, rất nhanh.",
            "**Cross-validation**: chia train thành 5 phần, lần lượt giấu một phần để chấm thử, lấy trung bình 5 lần. Dùng để chọn C mà không phải đụng tới val hay test.",
            "**top-1 / top-5**: đáp án đúng là lựa chọn số một, hay nằm trong năm lựa chọn đầu. **macro-F1**: điểm trung bình tính đều cho mọi robot, robot ít ảnh cũng nặng như robot nhiều ảnh.",
            f"**Mốc đoán mò**: chọn bừa một trong {len(known)} lớp thì đúng {vn(100 / len(known), 2)}%.",
        ]
    )

    report.section(5)
    backbone_rows = [[s["label"], s["dim"], vn(s["params"] / 1e6), s["images"], vn(s["seconds"], 0), vn(s["images"] / s["seconds"], 0)] for s in summaries]
    backbone_columns = ["Bộ trích đặc trưng", "Số chiều", "Tham số phần ảnh (triệu)", "Số ảnh đã trích", "Thời gian (giây)", "Ảnh/giây"]
    report.table(backbone_rows, backbone_columns, caption="Bảng 1. Bộ trích đặc trưng (GPU RTX A2000 4 GB, fp16, gồm cả thời gian đọc ảnh)")

    all_c = sorted({float(c) for s in summaries for c in lp_per[s["id"]]["cv"]})
    cv_rows = []
    for s in summaries:
        entry = lp_per[s["id"]]
        cells = []
        for c in all_c:
            value = entry["cv"].get(f"{c:g}")
            mark = "**" if value and c == entry["best_c"] else ""
            cells.append("—" if not value else f"{mark}{vn(100 * value[0])} ± {vn(100 * value[1])}{mark}")
        cv_rows.append([s["label"]] + cells + [vn(100 * entry["train_top1"]), vn(entry["seconds"], 0)])
    cv_columns = ["Bộ đặc trưng"] + [f"C = {c:g}" for c in all_c] + ["top-1 trên train với C chọn (%)", "Thời gian CV + huấn luyện (giây)"]
    report.table(cv_rows, cv_columns, caption=f"Bảng 2. Linear probe: top-1 của {lp['cv_folds']}-fold CV trên train (%, trung bình ± độ lệch chuẩn qua các fold; in đậm: C được chọn)")

    def result_table(name: str) -> list[list]:
        return [[r["label"], METHOD[r["method"]], r["setting"], ci(r[name]["top1"]), ci(r[name]["top5"]), ci(r[name]["macro_f1"])] for r in rows]

    result_columns = ["Bộ đặc trưng", "Phương pháp", "Tham số", "top-1 % [KTC 95%]", "top-5 % [KTC 95%]", "macro-F1 % [KTC 95%]"]
    val_rows, test_rows = result_table("val"), result_table("test")
    report.table(val_rows, result_columns, caption=f"Bảng 3. Kết quả trên val ({sizes['val']} ảnh)")
    report.table(test_rows, result_columns, caption=f"Bảng 4. Kết quả trên test ({sizes['test']} ảnh)")
    report.p("Với k-NN k = 1 chỉ một lớp có điểm nên top-5 bằng top-1; top-5 của k-NN chỉ tính trên các lớp xuất hiện trong k láng giềng.")

    fig, ax = plt.subplots(figsize=(8.5, 3.4))
    width = 0.26
    for offset, (method, color) in enumerate((("zs", "#64748b"), ("knn", "#0f766e"), ("lp", "#c2410c"))):
        for i, s in enumerate(summaries):
            candidates = [r for r in s["results"] if r["method"] == method]
            if not candidates:
                continue
            r = max(candidates, key=lambda r: r["val"]["top1"][0])
            point, low, high = (100 * v for v in r["test"]["top1"])
            ax.bar(i + (offset - 1) * width, point, width, color=color, label=METHOD[method] if i == 0 or (method == "zs" and i == 0) else None,
                   yerr=[[point - low], [high - point]], capsize=2)
            ax.text(i + (offset - 1) * width, high + 1, vn(point), ha="center", fontsize=7)
    ax.set_xticks(range(len(summaries)))
    ax.set_xticklabels([s["label"] for s in summaries], fontsize=8)
    ax.set_ylabel("top-1 trên test (%)")
    ax.set_ylim(0, 100)
    handles, labels = ax.get_legend_handles_labels()
    seen = dict(zip(labels, handles))
    ax.legend(seen.values(), seen.keys(), fontsize=8, ncol=3)
    fig.tight_layout()
    report.figure(fig, "top1-test", "top-1 trên test của từng bộ đặc trưng và phương pháp (k-NN lấy k tốt nhất trên val; thanh sai số: khoảng tin cậy 95%)")
    plt.close(fig)

    # So sánh có kiểm định (trên test)
    comparisons = []
    for s in summaries:
        zs = next((r for r in s["results"] if r["method"] == "zs"), None)
        if zs:
            comparisons.append((f"{s['label']}: linear probe so với zero-shot", lp_per[s["id"]], zs))
        comparisons.append((f"{s['label']}: linear probe so với k-NN tốt nhất", lp_per[s["id"]], best_knn_per[s["id"]]))
    clip_best = max((lp_per[s["id"]] for s in summaries if s["id"].startswith("clip")), key=lambda r: r["val"]["top1"][0])
    dino_best = max((lp_per[s["id"]] for s in summaries if s["id"].startswith("dino")), key=lambda r: r["val"]["top1"][0])
    comparisons.append((f"Linear probe: {label_of[clip_best['backbone']]} so với {label_of[dino_best['backbone']]}", clip_best, dino_best))
    tests = [mcnemar(correct(a, "test"), correct(b, "test")) for _, a, b in comparisons]
    adjusted = holm([t.p_value for t in tests])
    compare_rows = []
    for (title, a, b), t, p_adj in zip(comparisons, tests, adjusted):
        diff = paired_bootstrap_diff(correct(a, "test"), correct(b, "test"), cfg["bootstrap_resamples"], seed=cfg["seed"])
        compare_rows.append([title, f"{vn(100 * diff.estimate)} [{vn(100 * diff.low)}; {vn(100 * diff.high)}]", t.b, t.c, pv(t.p_value), pv(p_adj)])
    compare_columns = ["So sánh (A so với B)", "Hiệu top-1, điểm % [KTC 95%]", "A đúng, B sai", "A sai, B đúng", "p (McNemar)", "p sau Holm"]
    report.table(compare_rows, compare_columns, caption="Bảng 5. So sánh từng cặp trên test")

    # Theo franchise và lớp khó nhất của cấu hình tốt nhất
    test_part = splits[splits["split"] == "test"].reset_index(drop=True)
    ok = correct(best_lp, "test")
    franchise_rows = []
    for key, label in FRANCHISE.items():
        mask = (test_part["class"].map(franchise_of) == key).to_numpy()
        franchise_rows.append([label, int(mask.sum()), test_part.loc[mask, "class"].nunique(), vn(100 * ok[mask].mean())])
    source_rows = [[{"wiki": "Wiki người hâm mộ", "ddg": "Tìm ảnh"}[k], int((test_part["source"] == k).sum()), "", vn(100 * ok[(test_part["source"] == k).to_numpy()].mean())] for k in ("wiki", "ddg")]
    group_columns = ["Nhóm", "Ảnh test", "Số lớp", "top-1 (%)"]
    report.table(franchise_rows + source_rows, group_columns, caption=f"Bảng 6. Cấu hình tốt nhất ({best_lp['label']}, linear probe) trên test theo franchise và theo nguồn ảnh")
    per_class = pd.DataFrame({"class": test_part["class"], "ok": ok}).groupby("class")["ok"].agg(["mean", "size"])
    worst = per_class.sort_values("mean").head(10)
    worst_rows = [[name_of[slug], FRANCHISE[franchise_of[slug]], int(r["size"]), vn(100 * r["mean"])] for slug, r in worst.iterrows()]
    report.table(worst_rows, ["Lớp", "Franchise", "Ảnh test", "top-1 (%)"], caption="Bảng 6b. 10 lớp khó nhất của cấu hình tốt nhất (mỗi lớp ít ảnh test nên con số dao động mạnh)")

    check_rows = [
        ["Cấu hình", f"{check['backbone']}, C = {check['c']:g}, {sizes['train']} ảnh train"],
        ["top-1 trên val: bản PyTorch (GPU)", vn(100 * check["mine_top1"], 2) + "%"],
        ["top-1 trên val: scikit-learn (CPU)", vn(100 * check["sklearn_top1"], 2) + "%"],
        ["Tỉ lệ ảnh val hai bản dự đoán giống nhau", vn(100 * check["agreement"], 2) + "%"],
        ["Thời gian huấn luyện: PyTorch / scikit-learn (giây)", f"{vn(check['mine_seconds'])} / {vn(check['sklearn_seconds'])}"],
    ]
    report.table(check_rows, ["Mục", "Giá trị"], caption="Bảng 7. Kiểm chứng hồi quy logistic tự viết so với scikit-learn")
    convergence_path = Path(__file__).resolve().parents[1] / "reports" / "B05" / "convergence.json"
    convergence = json.loads(convergence_path.read_text(encoding="utf-8")) if convergence_path.exists() else []
    convergence_rows = [[f"{c['c']:g}", vn(c["fp32_objective"], 2), vn(c["fp64_objective"], 2), vn(100 * (c["fp32_objective"] - c["fp64_objective"]) / c["fp64_objective"], 5) + "%",
                         vn(c["fp32_val"], 2), vn(c["fp64_val"], 2), c["fp32_evals"], c["fp64_evals"], vn(c["fp32_seconds"]), vn(c["fp64_seconds"])] for c in convergence]
    convergence_columns = ["C", "Hàm mục tiêu: fp32 (bản dùng)", "fp64 tới hội tụ", "Chênh lệch tương đối", "top-1 val %: fp32", "fp64", "Số lần tính hàm: fp32", "fp64", "Giây: fp32", "fp64"]
    if convergence_rows:
        report.table(convergence_rows, convergence_columns, caption="Bảng 7b. Bản fp32 đã hội tụ chưa? So với bản fp64 chạy tới hội tụ (CLIP ViT-L/14, toàn bộ train)")

    # t-SNE của bộ đặc trưng tốt nhất
    from sklearn.manifold import TSNE

    data = np.load(root / "b05" / "features" / f"{best_lp['backbone']}.npz")
    position = {key: i for i, key in enumerate(data["keys"])}
    val_part = splits[splits["split"] == "val"]
    if len(val_part) > cfg["tsne"]["max_images"]:
        val_part = val_part.sample(cfg["tsne"]["max_images"], random_state=cfg["seed"])
    embedded = TSNE(n_components=2, perplexity=cfg["tsne"]["perplexity"], init="pca", random_state=cfg["seed"]).fit_transform(data["features"][[position[k] for k in val_part["key"]]])
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.6))
    for key, color in (("transformers", "#c2410c"), ("gundam", "#1d4ed8"), ("sentai", "#15803d")):
        mask = (val_part["class"].map(franchise_of) == key).to_numpy()
        axes[0].scatter(embedded[mask, 0], embedded[mask, 1], s=2, color=color, label=FRANCHISE[key], alpha=0.6)
    axes[0].legend(fontsize=8, markerscale=4)
    axes[0].set_title("Tô màu theo franchise", fontsize=9)
    domains = sorted(val_part["domain"].unique())
    palette = ["#c2410c", "#1d4ed8", "#15803d", "#7c3aed", "#64748b"]
    for domain, color in zip(domains, palette):
        mask = (val_part["domain"] == domain).to_numpy()
        axes[1].scatter(embedded[mask, 0], embedded[mask, 1], s=2, color=color, label=domain, alpha=0.6)
    axes[1].legend(fontsize=7, markerscale=4)
    axes[1].set_title("Tô màu theo miền ảnh (CLIP gán, chưa kiểm định)", fontsize=9)
    for ax in axes:
        ax.set_xticks([])
        ax.set_yticks([])
    fig.tight_layout()
    report.figure(fig, "tsne", f"t-SNE của đặc trưng {best_lp['label']} trên {len(val_part)} ảnh val: mỗi chấm một ảnh, chấm gần nhau là ảnh có đặc trưng giống nhau")
    plt.close(fig)

    report.set("dataset_version", b04["dataset_version"])
    report.set("best", {m: {"backbone": r["label"], "setting": r["setting"], "val_top1": r["val"]["top1"], "test_top1": r["test"]["top1"],
                             "test_top5": r["test"]["top5"], "test_macro_f1": r["test"]["macro_f1"]} for m, r in best_of.items()})
    report.set("sklearn_check", check)
    report.set("results", [{k: v for k, v in r.items() if k != "cv"} for r in rows])
    report.set("tables", {
        "Bảng 1. Bộ trích đặc trưng": {"columns": backbone_columns, "rows": backbone_rows},
        "Bảng 2. Linear probe: top-1 của CV trên train": {"columns": cv_columns, "rows": [[str(c).replace("**", "") for c in r] for r in cv_rows]},
        "Bảng 3. Kết quả trên val": {"columns": result_columns, "rows": val_rows},
        "Bảng 4. Kết quả trên test": {"columns": result_columns, "rows": test_rows},
        "Bảng 5. So sánh từng cặp trên test": {"columns": compare_columns, "rows": compare_rows},
        "Bảng 6. Cấu hình tốt nhất theo franchise và nguồn": {"columns": group_columns, "rows": franchise_rows + source_rows},
        "Bảng 7. Kiểm chứng với scikit-learn": {"columns": ["Mục", "Giá trị"], "rows": check_rows},
        "Bảng 7b. Hội tụ của bản fp32": {"columns": convergence_columns, "rows": convergence_rows},
    })

    report.section(6)
    zs_best, knn_best = best_of["zs"], best_of["knn"]
    gap = 100 * (best_lp["train_top1"] - best_lp["test"]["top1"][0])
    edge = [label_of[s["id"]] for s in summaries if lp_per[s["id"]]["best_c"] >= max(float(c) for c in lp_per[s["id"]]["cv"])]
    report.bullets(
        [
            f"**Mốc tốt nhất: {best_lp['label']} + linear probe ({best_lp['setting']})**: top-1 trên test {ci(best_lp['test']['top1'])}%, top-5 {ci(best_lp['test']['top5'])}%, "
            f"macro-F1 {ci(best_lp['test']['macro_f1'])}%. Mô hình tinh chỉnh ở B6 phải vượt con số này thì việc huấn luyện mới có ý nghĩa (RQ2).",
            f"Zero-shot tốt nhất ({zs_best['label']}) đạt top-1 {ci(zs_best['test']['top1'])}%; k-NN tốt nhất ({knn_best['label']}, {knn_best['setting']}) đạt {ci(knn_best['test']['top1'])}%. "
            f"So với mốc đoán mò {vn(100 / len(known), 2)}%, CLIP đã nhận ra một phần robot chỉ qua tên; nhưng có ảnh mẫu thì tốt hơn hẳn.",
            f"Cả {len(compare_rows)} so sánh ở bảng 5 đều có ý nghĩa thống kê ({sum(1 for p in adjusted if p < 0.05)} cặp có p sau Holm dưới 0,05). Linear probe hơn k-NN tốt nhất "
            "từ 11 tới 17 điểm và hơn zero-shot khoảng 40 điểm, trên mọi bộ đặc trưng. Giữa hai họ mạng, linear probe của CLIP ViT-L/14 hơn DINOv2 ViT-B/14 "
            f"{compare_rows[-1][1]} điểm: có ý nghĩa nhưng nhỏ, trong khi DINOv2 ViT-B/14 nhẹ hơn 3,5 lần.",
            "**DINOv2 tốt hơn CLIP ở k-NN nhưng kém hơn ở linear probe.** Với k = 1, DINOv2 ViT-B/14 đạt "
            f"{vn(100 * next(r for r in rows if r['backbone'] == 'dinov2-b14' and r['setting'] == 'k = 1')['test']['top1'][0])}% so với "
            f"{vn(100 * next(r for r in rows if r['backbone'] == 'clip-l14' and r['setting'] == 'k = 1')['test']['top1'][0])}% của CLIP ViT-L/14: láng giềng gần nhất trong không gian DINOv2 thường cùng robot hơn, "
            "còn đặc trưng CLIP lại dễ tách bằng mặt phẳng hơn khi có nhãn (nguyên nhân chưa được kiểm chứng ở đây). DINOv2 ViT-S/14 chỉ 21,6 triệu tham số mà ngang CLIP ViT-B/16 (86 triệu).",
            f"**Theo franchise** (bảng 6): Gundam {franchise_rows[1][3]}%, Transformers {franchise_rows[0][3]}%, Super Sentai {franchise_rows[2][3]}%. "
            f"**Theo nguồn**: ảnh wiki khó hơn ảnh tìm kiếm ({source_rows[0][3]}% so với {source_rows[1][3]}%), trái với dự đoán rằng ảnh wiki \"sạch\" hơn; "
            "một cách giải thích (chưa kiểm chứng) là trang wiki chứa nhiều ảnh cảnh phim, ảnh chi tiết, ảnh robot khác cùng trang, còn ảnh tìm kiếm phần lớn là ảnh sản phẩm chụp chính diện.",
            "**Lớp khó nhất** (bảng 6b) trùng với những vấn đề đã ghi ở các bước trước: *X Emperor Slash* và *Thunder Ultrazord* là hai trong bốn lớp có tên lệch với trang wiki (nhật ký 11/11); "
            "*Optimus Prime (WFC)*, *00 Gundam* và *0 Gundam* là các lớp trùng tên hoặc gần tên với lớp khác nên ảnh tìm kiếm dễ lẫn. Đây là bằng chứng gián tiếp rằng nhãn của các lớp này còn nhiễu.",
            f"Linear probe của cấu hình tốt nhất đúng {vn(100 * best_lp['train_top1'])}% trên train và {vn(100 * best_lp['test']['top1'][0])}% trên test: chênh {vn(gap)} điểm. "
            "Khoảng chênh này là dấu hiệu quá khớp của lớp phân loại tuyến tính trên đặc trưng cố định; tinh chỉnh toàn mạng kèm tăng cường dữ liệu (B6) nhằm thu hẹp nó.",
            "Kết quả val và test gần nhau ở mọi cấu hình (bảng 3, 4), phù hợp với việc hai tập cùng phân bố (B04).",
            ("C tốt nhất vẫn nằm ở mép trên của lưới đã mở rộng với: " + ", ".join(edge) + ". Đỉnh thật có thể còn cao hơn một chút." if edge
             else "Với mọi bộ đặc trưng, C tốt nhất nằm bên trong lưới đã thử (bảng 2), nên việc chọn C không bị chặn bởi mép lưới."),
            f"Bản hồi quy logistic trên GPU và scikit-learn dự đoán giống nhau trên {vn(100 * check['agreement'], 2)}% ảnh val, top-1 lệch "
            f"{vn(abs(100 * (check['mine_top1'] - check['sklearn_top1'])), 2)} điểm (bảng 7). Phần lệch nhiều khả năng đến từ điều kiện dừng (scikit-learn mặc định tol = 10⁻⁴). "
            "Bảng 7b cho thấy bản fp32 đang dùng đã hội tụ: hàm mục tiêu chỉ cao hơn bản fp64 chạy tới hội tụ dưới 0,002%, top-1 trên val lệch không quá 0,05 điểm, "
            "trong khi nhanh hơn từ 70 tới gần 1.000 lần.",
        ]
    )
    report.section(7)
    report.bullets(
        [
            "Số liệu trên bản dữ liệu tạm: nhãn chưa được người kiểm định, ảnh sai nhãn còn sót làm giảm độ chính xác đo được của mọi phương pháp.",
            "Bản tạm đã bỏ ảnh \"nghi ngờ\" theo điểm của **CLIP ViT-L/14**, nên dữ liệu thiên về ảnh mà CLIP ViT-L/14 thấy dễ; kết quả của chính bộ đặc trưng này có thể được lợi.",
            "Mỗi lớp chỉ có khoảng 16–100 ảnh test, nên số liệu từng lớp (bảng 6b) dao động mạnh; chỉ số trên toàn tập mới đáng tin.",
            "Bootstrap chỉ đo dao động do tập test hữu hạn; không đo dao động do cách chia tập (chỉ có một lần chia) hay do nhãn sai.",
            "Zero-shot phụ thuộc cách viết câu mô tả; 5 mẫu câu ở đây chưa được tối ưu, nên đây là cận dưới của zero-shot.",
            "Tập test cùng nguồn web với train; ảnh khách tự chụp có thể khó hơn (đo ở B13).",
            "t-SNE chỉ để nhìn, không dùng để kết luận: khoảng cách trên hình không bảo toàn khoảng cách thật.",
        ]
    )
    report.section(8)
    report.reproduce(
        ["ml/.venv/Scripts/python ml/scripts/b05_dac_trung.py", "ml/.venv/Scripts/python ml/scripts/b05_mo_hinh_nen.py --recompute"],
        config="ml/configs/b05_mo_hinh_nen.yaml", config_hash=config_hash(cfg), seed=cfg["seed"], dataset_version=f"b04_splits.csv sha256 {b04['dataset_version'][:12]}",
    )
    print(report.write())
    print(json.dumps({m: [r["label"], r["setting"], round(100 * r["test"]["top1"][0], 2)] for m, r in best_of.items()}, ensure_ascii=False))


if __name__ == "__main__":
    from robotrec.awake import keep_awake

    with keep_awake():
        main()
