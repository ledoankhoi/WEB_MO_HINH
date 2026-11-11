"""B4. Chia tập train / val / test, chọn lớp "không biết", kiểm tra rò rỉ (docs/nhan-dang-robot/00-ke-hoach.md mục 8, B4).

Đầu vào: kết quả phần máy của B3 (`ROBOTREC_DATA/b03/scores.csv`, `pairs.csv`, đặc trưng CLIP đã cache), manifest B2, robots.json.
Đầu ra: `ml/data/manifests/b04_splits.csv.gz` (mỗi ảnh một dòng: lớp, tập, nhóm), báo cáo B04, `ml/reports/B04/`.

Tập âm (ảnh không phải robot: COCO và đồ chơi khác) làm ở `b04b_tap_am.py`.

Chạy: ml/.venv/Scripts/python ml/scripts/b04_chia_tap.py
"""

from __future__ import annotations

import csv
import glob
import gzip
import hashlib
import io
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from robotrec.config import MANIFESTS, config_hash, data_root, file_sha256, load_config  # noqa: E402
from robotrec.dedup import UnionFind, phash_pairs  # noqa: E402
from robotrec.env import environment  # noqa: E402
from robotrec.report import Report  # noqa: E402

FRANCHISE = {"transformers": "Transformers", "gundam": "Gundam", "sentai": "Super Sentai / Power Rangers"}
SPLIT_LABEL = {"train": "train (huấn luyện)", "val": "val (chọn mô hình)", "test": "test (đánh giá cuối)",
               "unknown_val": "lạ-val (lớp không biết)", "unknown_test": "lạ-test (lớp không biết)"}
SPLITS = list(SPLIT_LABEL)


def vn(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def pv(p: float) -> str:
    """Giá trị p viết theo kiểu Việt Nam; rất nhỏ thì ghi dưới ngưỡng."""
    return "< 0,001" if p < 0.001 else f"{p:.3f}".replace(".", ",")


def pct(part: float, whole: float, digits: int = 1) -> str:
    return (vn(100 * part / whole, digits) + "%") if whole else "—"


def quotas(counts: dict[str, int], total: int) -> dict[str, int]:
    """Chia `total` suất theo tỉ lệ `counts` bằng phương pháp số dư lớn nhất."""
    whole = sum(counts.values())
    exact = {k: total * v / whole for k, v in counts.items()}
    base = {k: int(v) for k, v in exact.items()}
    for k in sorted(exact, key=lambda k: exact[k] - base[k], reverse=True)[: total - sum(base.values())]:
        base[k] += 1
    return base


def choose_unknown(robots: list[dict], per_class: dict[str, int], cfg: dict) -> tuple[dict[str, str], list[str]]:
    """Trả về {slug: 'unknown_val' | 'unknown_test'} và danh sách lớp bị ép vào vì thiếu ảnh."""
    rng = np.random.default_rng(cfg["seed"])
    total = int(np.ceil(cfg["unknown_fraction"] * len(robots)))
    quota = quotas(Counter(r["franchise"] for r in robots), total)
    forced = [r["slug"] for r in robots if per_class.get(r["slug"], 0) < cfg["min_images_per_class"]]
    chosen: dict[str, list[str]] = defaultdict(list)
    by_slug = {r["slug"]: r for r in robots}
    for slug in forced:
        chosen[by_slug[slug]["franchise"]].append(slug)
    for franchise in sorted(quota):
        pool = sorted(r["slug"] for r in robots if r["franchise"] == franchise and r["selected_by"] != "store" and r["slug"] not in forced)
        need = max(0, quota[franchise] - len(chosen[franchise]))
        chosen[franchise] += [str(x) for x in rng.choice(pool, size=need, replace=False)]
    out: dict[str, str] = {}
    flip = 0
    for franchise in sorted(chosen):
        members = list(chosen[franchise])
        rng.shuffle(members)
        for slug in members:
            out[slug] = "unknown_val" if flip % 2 == 0 else "unknown_test"
            flip += 1
    return out, forced


def build_groups(data: pd.DataFrame, pairs: pd.DataFrame, cfg: dict) -> np.ndarray:
    """Nhóm ảnh phải nằm chung một tập: chỉ nối ảnh cùng lớp (cô-sin cao, pHash gần, cùng trang nguồn)."""
    position = {key: i for i, key in enumerate(data["key"])}
    classes = data["class"].to_numpy()
    uf = UnionFind(len(data))
    edges = Counter()
    for a, b, cos in zip(pairs["a"], pairs["b"], pairs["cos"]):
        i, j = position.get(a), position.get(b)
        if i is not None and j is not None and classes[i] == classes[j] and cos >= cfg["group_cosine"]:
            uf.union(i, j)
            edges["cô-sin"] += 1
    hashes = np.array([int(h, 16) for h in data["phash"]], dtype=np.uint64)
    for i, j, _ in phash_pairs(hashes, cfg["group_phash"]):
        if classes[i] == classes[j]:
            uf.union(i, j)
            edges["pHash"] += 1
    if cfg["group_same_page"]:
        search = data[(data["source"] == "ddg") & (data["page_url"] != "")]
        for _, members in search.groupby(["class", "page_url"]).indices.items():
            rows = search.index[members]
            first = position[data.at[rows[0], "key"]]
            for row in rows[1:]:
                uf.union(first, position[data.at[row, "key"]])
                edges["cùng trang"] += 1
    build_groups.edges = dict(edges)  # type: ignore[attr-defined]
    return uf.labels()


def max_cosine(query: np.ndarray, base: np.ndarray, block: int = 2048) -> np.ndarray:
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    b = torch.from_numpy(base).to(device, dtype=dtype)
    out = []
    for start in range(0, len(query), block):
        q = torch.from_numpy(query[start : start + block]).to(device, dtype=dtype)
        out.append((q @ b.T).max(dim=1).values.float().cpu().numpy())
    return np.concatenate(out) if out else np.zeros(0, np.float32)


def main() -> None:
    from scipy.stats import chi2_contingency
    from sklearn.model_selection import StratifiedGroupKFold

    cfg = load_config("b04_chia_tap")
    root = data_root()
    b03 = root / "b03"
    env = environment()
    robots = json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]
    name_of = {r["slug"]: r["display_name"] for r in robots}
    by_slug = {r["slug"]: r for r in robots}

    scores = pd.read_csv(b03 / "scores.csv", dtype=str, keep_default_na=False)
    with open(root / "b02" / "manifest.csv", encoding="utf-8", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    scores["page_url"] = [manifest[int(k[1:])]["page_url"] for k in scores["key"]]
    kept = scores[scores["status"] == "giữ"]
    data = kept[kept["suspicious"] != "True"].reset_index(drop=True).copy()
    pairs = pd.read_csv(b03 / "pairs.csv")
    per_class = data.groupby("class").size().to_dict()

    # 1. Lớp "không biết"
    unknown, forced = choose_unknown(robots, per_class, cfg)
    data["split"] = data["class"].map(unknown).fillna("")

    # 2. Lớp đã biết: nhóm + StratifiedGroupKFold
    data["group_id"] = build_groups(data, pairs, cfg)
    known = data[data["split"] == ""]
    folds = np.zeros(len(known), dtype=int)
    splitter = StratifiedGroupKFold(n_splits=cfg["folds"], shuffle=True, random_state=cfg["seed"])
    for fold, (_, index) in enumerate(splitter.split(np.zeros(len(known)), known["class"], known["group_id"])):
        folds[index] = fold
    names = np.where(folds < cfg["test_folds"], "test", np.where(folds < cfg["test_folds"] + cfg["val_folds"], "val", "train"))
    data.loc[known.index, "split"] = names
    data["group"] = "g" + data["group_id"].astype(str)

    # 3. Ghi splits và mã phiên bản dữ liệu
    out = data[["key", "class", "franchise", "source", "host", "file", "sha1", "width", "height", "domain", "p_robot", "group", "split"]].copy()
    out.insert(1, "image_id", out["sha1"].str[:16])
    buffer = io.StringIO()
    out.to_csv(buffer, index=False, lineterminator="\n")
    payload = buffer.getvalue().encode("utf-8")
    version = hashlib.sha256(payload).hexdigest()
    with gzip.GzipFile(MANIFESTS / "b04_splits.csv.gz", "wb", mtime=0) as handle:
        handle.write(payload)

    # 4. Rò rỉ: cô-sin lớn nhất của mỗi ảnh val/test với ảnh train
    cache = np.load(glob.glob(str(b03 / "cache" / "*.npz"))[0])
    feature_pos = {key: i for i, key in enumerate(np.load(b03 / "features_index.npy"))}
    features = cache["features"][[feature_pos[k] for k in data["key"]]]
    is_train = (data["split"] == "train").to_numpy()
    leak = {}
    for name in ("val", "test", "unknown_val", "unknown_test"):
        mask = (data["split"] == name).to_numpy()
        overall = max_cosine(features[mask], features[is_train])
        same = np.full(mask.sum(), np.nan, dtype=np.float32)
        if name in ("val", "test"):
            labels = data.loc[mask, "class"].to_numpy()
            train_labels = data.loc[is_train, "class"].to_numpy()
            train_features = features[is_train]
            for slug in np.unique(labels):
                rows = labels == slug
                same[rows] = (features[mask][rows] @ train_features[train_labels == slug].T).max(axis=1)
        leak[name] = {"overall": overall, "same": same}

    # Báo cáo ---------------------------------------------------------------------------------------------------------
    report = Report("B04", "chia-tap", "Chia tập huấn luyện, kiểm tra và lớp \"không biết\"")
    report.section(1)
    report.p(
        "Chia bộ ảnh đã làm sạch thành các tập không giao nhau: **train** để huấn luyện, **val** để chọn mô hình và ngưỡng, **test** để lấy số liệu cuối; "
        "tách riêng một nhóm **lớp \"không biết\"** mà mô hình không bao giờ được học, để đo khả năng từ chối robot lạ (RQ5). "
        "Kiểm tra không có ảnh gần giống nhau nằm ở hai phía train và test (rò rỉ), vì rò rỉ làm độ chính xác đo được cao giả."
    )
    report.p(
        "**Bản dữ liệu này là bản tạm.** Chủ dự án chưa chấm tay ở B3, nên ảnh đưa vào chia là ảnh phần máy giữ lại, **bỏ toàn bộ ảnh bị đánh dấu nghi ngờ** "
        "(điểm liên quan dưới 0,5 hoặc ngoại lai). Độ chính xác nhãn của bản này **chưa được đo**. Khi có kết quả duyệt tay, chạy lại script này với danh "
        "sách loại chính thức; mã phiên bản dữ liệu sẽ đổi và mọi bước sau ghi mã mới."
    )
    report.section(2)
    report.bullets(
        [
            f"Đầu vào: `scores.csv` của B03a ({len(scores)} dòng; {len(kept)} ảnh còn giữ; {int((kept['suspicious'] == 'True').sum())} ảnh nghi ngờ bị bỏ ở bản tạm), "
            "`pairs.csv` (cặp ảnh có cô-sin ≥ 0,95), đặc trưng CLIP ViT-L/14 đã lưu, `robots.json` (230 lớp).",
            f"Đầu ra: `ml/data/manifests/b04_splits.csv.gz`, {len(out)} dòng, mỗi ảnh một dòng (lớp, nguồn, file, miền ảnh, nhóm, tập).",
            f"**Mã phiên bản dữ liệu** (`dataset_version`) = sha256 của nội dung `b04_splits.csv`: `{version[:12]}`. Mọi bước sau (B5–B9) ghi mã này.",
        ]
    )
    report.section(3)
    report.environment(env)
    report.section(4)
    quota = quotas(Counter(r["franchise"] for r in robots), int(np.ceil(cfg["unknown_fraction"] * len(robots))))
    report.bullets(
        [
            f"**Lớp \"không biết\" (near-OOD).** Lấy {int(cfg['unknown_fraction'] * 100)}% số lớp = {sum(quota.values())} lớp, chia theo tỉ lệ số lớp của từng franchise "
            f"(Transformers {quota['transformers']}, Gundam {quota['gundam']}, Sentai {quota['sentai']}), chọn ngẫu nhiên (hạt giống {cfg['seed']}) trong các lớp "
            "**không phải** robot cửa hàng đang bán, vì web cần nhận ra hàng của cửa hàng. Chia đôi thành lạ-val (chọn ngưỡng từ chối) và lạ-test (đo). "
            "Ảnh của các lớp này không bao giờ vào train.",
            f"**Lớp thiếu ảnh.** Lớp có dưới {cfg['min_images_per_class']} ảnh không đủ để huấn luyện (tiêu chí B3). Thay vì bỏ, lớp đó được đưa vào nhóm lớp "
            "\"không biết\" (chiếm một suất của franchise): ảnh vẫn có ích để đo từ chối, và không cần thu thêm."
            + (f" Lần này: {', '.join(name_of[s] for s in forced)}." if forced else " Lần này không có lớp nào."),
            f"**Lớp đã biết: train / val / test = 70 / 15 / 15** bằng `StratifiedGroupKFold` của scikit-learn với {cfg['folds']} phần: "
            f"{cfg['test_folds']} phần làm test, {cfg['val_folds']} phần làm val, còn lại làm train. *Stratified*: mỗi phần giữ tỉ lệ các lớp như toàn tập. "
            "*Group*: mọi ảnh cùng nhóm nằm chung một phần.",
            f"**Nhóm.** Hai ảnh **cùng lớp** vào chung nhóm khi cô-sin CLIP ≥ {vn(cfg['group_cosine'], 2)}, hoặc pHash lệch ≤ {cfg['group_phash']} bit, hoặc "
            "cùng một trang web nguồn (ví dụ nhiều ảnh của một tin rao bán). Nối bắc cầu bằng union–find. Ảnh wiki không gộp theo trang, vì mọi ảnh wiki "
            "của một lớp đều chung một trang.",
            "**Khác kế hoạch ở hai điểm, có chủ đích.** (1) Kế hoạch ghi nhóm theo \"pHash lệch ≤ 10 bit và cùng trang nguồn\"; ở đây thêm điều kiện cô-sin ≥ 0,95 "
            "để các ảnh gần trùng còn sót sau B3 (cô-sin 0,95–0,98) không nằm ở hai tập. (2) Kế hoạch yêu cầu \"không có cặp train–test nào cô-sin ≥ 0,95\". "
            "B03a đã cho thấy **hai robot khác nhau vẽ cùng phong cách cũng đạt cô-sin ≥ 0,95**, nên yêu cầu đó không thể thoả và cũng không đúng nghĩa rò rỉ. "
            "Tiêu chí dùng ở đây: **không có cặp train–val hoặc train–test nào *cùng lớp* có cô-sin ≥ 0,95**; cặp khác lớp được đếm và báo riêng.",
            "**Kiểm tra rò rỉ.** Với mỗi ảnh val/test: tính cô-sin lớn nhất với mọi ảnh train (bất kỳ lớp nào) và với ảnh train cùng lớp. "
            "Với ảnh của lớp \"không biết\": cô-sin lớn nhất với mọi ảnh train, để biết robot lạ giống robot đã biết tới mức nào.",
            "**So phân bố miền ảnh giữa các tập** bằng kiểm định χ² độc lập trên bảng tập × miền; kèm hệ số Cramér V = √(χ² / (N · (min(hàng, cột) − 1))) "
            "để biết mức khác biệt lớn hay nhỏ (với hàng chục nghìn ảnh, khác biệt rất nhỏ cũng cho p nhỏ).",
            "**Tập âm** (ảnh không phải robot: COCO và đồ chơi khác) được lập ở bước B04b, không nằm trong file này.",
        ]
    )
    report.h3("Giải thích bằng lời thường")
    report.bullets(
        [
            "**Train / val / test** giống ôn thi: *train* là sách bài tập để học; *val* là đề thi thử để chọn cách học tốt nhất; *test* là đề thi thật, chỉ mở một lần ở cuối. "
            "Nếu dùng đề thi thật để chọn cách học thì điểm thi không còn trung thực.",
            "**Rò rỉ** là khi một câu trong đề thi thật đã có sẵn trong sách bài tập: học sinh thuộc đáp án chứ không phải hiểu bài. Với ảnh, đó là khi cùng một ảnh "
            "(hay bản cắt, bản nén lại của nó) nằm ở cả train lẫn test.",
            "**Chia theo nhóm**: các ảnh gần giống nhau được buộc thành một bó, cả bó đi về một tập. Vì vậy không ảnh nào trong test có \"anh em sinh đôi\" trong train.",
            "**Phân tầng**: mỗi tập đều có đủ mọi lớp theo cùng tỉ lệ, để không tập nào thiếu hẳn một robot.",
            "**Lớp \"không biết\"**: khách có thể gửi ảnh một robot mà mô hình chưa từng học. Mô hình tốt phải nói \"không nhận ra\" chứ không đoán bừa. "
            "Muốn đo điều đó thì phải giấu hẳn một số robot khỏi lúc huấn luyện, rồi đưa ảnh của chúng ra hỏi.",
        ]
    )

    report.section(5)
    size_rows = []
    for name in SPLITS:
        part = data[data["split"] == name]
        counts = part.groupby("class").size()
        size_rows.append([SPLIT_LABEL[name], len(part), pct(len(part), len(data)), part["class"].nunique(), int(counts.min()), vn(counts.median()), int(counts.max()),
                          pct((part["source"] == "wiki").sum(), len(part))])
    size_rows.append(["Tổng", len(data), "100%", data["class"].nunique(), "", "", "", pct((data["source"] == "wiki").sum(), len(data))])
    size_columns = ["Tập", "Số ảnh", "Tỉ lệ", "Số lớp", "Ảnh mỗi lớp: nhỏ nhất", "trung vị", "lớn nhất", "Tỉ lệ ảnh wiki"]
    report.table(size_rows, size_columns, caption="Bảng 1. Kích thước các tập")
    known = data[data["split"].isin(["train", "val", "test"])]
    ratio = known["split"].value_counts()
    report.p(f"Trong các lớp đã biết: train {pct(ratio['train'], len(known))}, val {pct(ratio['val'], len(known))}, test {pct(ratio['test'], len(known))} (mục tiêu 70 / 15 / 15).")

    franchise_rows = []
    for key, label in FRANCHISE.items():
        part = data[data["franchise"] == key]
        franchise_rows.append([label] + [int((part["split"] == name).sum()) for name in SPLITS]
                              + [part.loc[part["split"].isin(["train", "val", "test"]), "class"].nunique(), part.loc[part["split"].str.startswith("unknown"), "class"].nunique()])
    franchise_columns = ["Franchise"] + [SPLIT_LABEL[n].split(" ")[0] for n in SPLITS] + ["Lớp đã biết", "Lớp không biết"]
    report.table(franchise_rows, franchise_columns, caption="Bảng 2. Số ảnh từng tập theo franchise")

    unknown_rows = [[name_of[slug], FRANCHISE[by_slug[slug]["franchise"]], SPLIT_LABEL[split].split(" ")[0], per_class.get(slug, 0),
                     "thiếu ảnh (dưới mức tối thiểu)" if slug in forced else "ngẫu nhiên"] for slug, split in sorted(unknown.items(), key=lambda kv: (kv[1], kv[0]))]
    unknown_columns = ["Lớp", "Franchise", "Tập", "Số ảnh", "Lý do chọn"]
    report.table(unknown_rows, unknown_columns, caption=f"Bảng 3. {len(unknown)} lớp \"không biết\"")

    group_size = known.groupby("group").size()
    edges = build_groups.edges  # type: ignore[attr-defined]
    group_rows = [
        ["Số ảnh của lớp đã biết", len(known)],
        ["Số nhóm", len(group_size)],
        ["Nhóm chỉ có 1 ảnh", int((group_size == 1).sum())],
        ["Nhóm có từ 2 ảnh", int((group_size > 1).sum())],
        ["Ảnh nằm trong nhóm từ 2 ảnh", f"{int(group_size[group_size > 1].sum())} ({pct(group_size[group_size > 1].sum(), len(known))})"],
        ["Nhóm lớn nhất (ảnh)", int(group_size.max())],
        ["Cạnh nối do cô-sin ≥ 0,95 (cùng lớp)", edges.get("cô-sin", 0)],
        [f"Cạnh nối do pHash lệch ≤ {cfg['group_phash']} bit (cùng lớp)", edges.get("pHash", 0)],
        ["Cạnh nối do cùng trang nguồn", edges.get("cùng trang", 0)],
    ]
    report.table(group_rows, ["Chỉ số", "Giá trị"], caption="Bảng 4. Nhóm ảnh dùng khi chia (số cạnh tính trên toàn bộ ảnh, kể cả lớp không biết)")

    leak_rows = []
    t = cfg["leak_threshold"]
    for name in ("val", "test", "unknown_val", "unknown_test"):
        overall, same = leak[name]["overall"], leak[name]["same"]
        row = [SPLIT_LABEL[name], len(overall), vn(float(np.median(overall)), 3), vn(float(np.quantile(overall, 0.95)), 3), vn(float(overall.max()), 3),
               f"{int((overall >= t).sum())} ({pct((overall >= t).sum(), len(overall), 2)})", int((overall >= 0.98).sum())]
        row += [vn(float(np.nanmax(same)), 4), int((same >= t).sum())] if name in ("val", "test") else ["—", "—"]
        leak_rows.append(row)
    leak_columns = ["Tập", "Số ảnh", "Cô-sin lớn nhất với train: trung vị", "phân vị 95%", "lớn nhất", f"Ảnh có cô-sin ≥ {vn(t, 2)} với train (mọi lớp)",
                    "≥ 0,98 (mọi lớp)", "Lớn nhất với train cùng lớp", f"Ảnh có cô-sin ≥ {vn(t, 2)} với train cùng lớp"]
    report.table(leak_rows, leak_columns, caption="Bảng 5. Kiểm tra rò rỉ")
    same_leaks = int(sum((leak[n]["same"] >= t).sum() for n in ("val", "test")))

    fig, axes = plt.subplots(1, 2, figsize=(9, 3))
    bins = np.linspace(0.3, 1.0, 71)
    axes[0].hist(leak["test"]["overall"], bins=bins, alpha=0.6, label="test, với train (mọi lớp)", color="#c2410c")
    axes[0].hist(leak["test"]["same"], bins=bins, alpha=0.6, label="test, với train cùng lớp", color="#0f766e")
    axes[0].axvline(t, color="#0f172a", linestyle="--", linewidth=1)
    axes[0].set_xlabel("Cô-sin lớn nhất với ảnh train")
    axes[0].set_ylabel("Số ảnh test")
    axes[0].legend(fontsize=7)
    axes[1].hist(leak["test"]["overall"], bins=bins, alpha=0.6, label="test (lớp đã biết)", color="#c2410c", density=True)
    axes[1].hist(np.concatenate([leak["unknown_val"]["overall"], leak["unknown_test"]["overall"]]), bins=bins, alpha=0.6, label="lớp không biết", color="#64748b", density=True)
    axes[1].set_xlabel("Cô-sin lớn nhất với ảnh train (mọi lớp)")
    axes[1].set_ylabel("Mật độ")
    axes[1].legend(fontsize=7)
    fig.tight_layout()
    report.figure(fig, "ro-ri", "Trái: độ giống của ảnh test với ảnh train gần nhất (đường đứt: 0,95). Phải: ảnh của lớp không biết chỉ hơi ít giống ảnh train hơn ảnh test")
    plt.close(fig)

    domains = sorted(known["domain"].unique())
    table = pd.crosstab(known["split"], known["domain"]).reindex(index=["train", "val", "test"], columns=domains).fillna(0).astype(int)
    chi2, p_value, dof, _ = chi2_contingency(table.to_numpy())
    cramers = float(np.sqrt(chi2 / (table.to_numpy().sum() * (min(table.shape) - 1))))
    domain_rows = [[SPLIT_LABEL[name]] + [f"{int(table.at[name, d])} ({pct(table.at[name, d], table.loc[name].sum())})" for d in domains] for name in ["train", "val", "test"]]
    report.table(domain_rows, ["Tập"] + domains, caption="Bảng 6. Miền ảnh (CLIP gán, chưa kiểm định) trong từng tập của lớp đã biết")
    report.p(f"Kiểm định χ² độc lập: χ² = {vn(chi2, 2)}, bậc tự do {dof}, p = {pv(p_value)}; Cramér V = {vn(cramers, 4)}.")
    src = pd.crosstab(known["split"], known["source"]).reindex(index=["train", "val", "test"]).fillna(0).astype(int)
    chi2_s, p_s, dof_s, _ = chi2_contingency(src.to_numpy())
    cramers_s = float(np.sqrt(chi2_s / (src.to_numpy().sum() * (min(src.shape) - 1))))
    wiki_share = {name: src.at[name, "wiki"] / src.loc[name].sum() for name in ["train", "val", "test"]}
    report.p(
        f"Nguồn ảnh (wiki / tìm kiếm) giữa ba tập: tỉ lệ ảnh wiki là {pct(wiki_share['train'], 1)} / {pct(wiki_share['val'], 1)} / {pct(wiki_share['test'], 1)}; "
        f"χ² = {vn(chi2_s, 2)}, bậc tự do {dof_s}, p = {pv(p_s)}; Cramér V = {vn(cramers_s, 4)}."
    )

    per = data.pivot_table(index="class", columns="split", values="key", aggfunc="count", fill_value=0).reindex(columns=SPLITS, fill_value=0)
    fig, ax = plt.subplots(figsize=(7.5, 3))
    known_classes = [s for s in per.index if s not in unknown]
    for name, color in (("train", "#c2410c"), ("val", "#0f766e"), ("test", "#64748b")):
        ax.hist(per.loc[known_classes, name], bins=30, alpha=0.65, label=SPLIT_LABEL[name], color=color)
    ax.set_xlabel("Số ảnh của lớp trong tập")
    ax.set_ylabel("Số lớp")
    ax.legend(fontsize=8)
    fig.tight_layout()
    report.figure(fig, "anh-moi-lop", "Phân bố số ảnh mỗi lớp trong train, val, test")
    plt.close(fig)
    class_rows = [[name_of[r["slug"]], FRANCHISE[r["franchise"]], "không biết" if r["slug"] in unknown else "đã biết"]
                  + [int(per.at[r["slug"], n]) if r["slug"] in per.index else 0 for n in SPLITS] for r in robots]
    class_columns = ["Lớp", "Franchise", "Vai trò"] + [SPLIT_LABEL[n].split(" ")[0] for n in SPLITS]
    report.table(class_rows, class_columns, caption=f"Bảng 7. Số ảnh từng tập của {len(robots)} lớp")

    min_test = int(per.loc[known_classes, "test"].min())
    min_val = int(per.loc[known_classes, "val"].min())
    min_train = int(per.loc[known_classes, "train"].min())
    report.set("dataset_version", version)
    report.set("sizes", {name: int((data["split"] == name).sum()) for name in SPLITS})
    report.set("classes", {"known": len(known_classes), "unknown": len(unknown), "forced_unknown": forced})
    report.set("leak", {"same_class_pairs_over_threshold": same_leaks,
                        **{name: {"median": float(np.median(v["overall"])), "max": float(v["overall"].max()), "over_threshold": int((v["overall"] >= t).sum())} for name, v in leak.items()}})
    report.set("domain_chi2", {"chi2": float(chi2), "dof": int(dof), "p": float(p_value), "cramers_v": cramers})
    report.set("source_chi2", {"chi2": float(chi2_s), "dof": int(dof_s), "p": float(p_s), "cramers_v": cramers_s})
    report.set("tables", {
        "Bảng 1. Kích thước các tập": {"columns": size_columns, "rows": size_rows},
        "Bảng 2. Số ảnh từng tập theo franchise": {"columns": franchise_columns, "rows": franchise_rows},
        "Bảng 3. Lớp không biết": {"columns": unknown_columns, "rows": unknown_rows},
        "Bảng 4. Nhóm ảnh": {"columns": ["Chỉ số", "Giá trị"], "rows": group_rows},
        "Bảng 5. Kiểm tra rò rỉ": {"columns": leak_columns, "rows": leak_rows},
        "Bảng 6. Miền ảnh trong từng tập": {"columns": ["Tập"] + domains, "rows": domain_rows},
        "Bảng 7. Số ảnh từng tập của từng lớp": {"columns": class_columns, "rows": class_rows},
    })

    report.section(6)
    cross = {n: int((leak[n]["overall"] >= t).sum()) for n in ("val", "test")}
    report.bullets(
        [
            f"{len(data)} ảnh, {len(known_classes)} lớp đã biết và {len(unknown)} lớp không biết. Tỉ lệ thật của train / val / test là "
            f"{pct(ratio['train'], len(known))} / {pct(ratio['val'], len(known))} / {pct(ratio['test'], len(known))}; lệch nhỏ so với 70 / 15 / 15 vì phải giữ nguyên từng nhóm.",
            f"Lớp ít ảnh nhất có {min_train} ảnh train, {min_val} ảnh val, {min_test} ảnh test. Số ảnh test mỗi lớp nhỏ nên độ chính xác **từng lớp** sẽ có khoảng tin cậy rộng; "
            "số liệu chính là trên toàn tập test.",
            f"**Rò rỉ cùng lớp: {same_leaks} ảnh** val/test có cô-sin ≥ {vn(t, 2)} với ảnh train cùng lớp" + (" (đạt tiêu chí)." if same_leaks == 0 else " (CHƯA đạt tiêu chí, cần xem lại nhóm)."),
            f"Có {cross['val']} ảnh val và {cross['test']} ảnh test đạt cô-sin ≥ {vn(t, 2)} với một ảnh train **khác lớp**. Đây không phải rò rỉ nhãn: đó là các robot khác nhau "
            "vẽ cùng phong cách hoặc cùng khuôn (B03a). Chúng là những ca khó, đáng theo dõi riêng ở B8 (ma trận nhầm lẫn).",
            f"Ảnh của lớp không biết có cô-sin lớn nhất với train chỉ hơi thấp hơn ảnh test (trung vị {vn(float(np.median(leak['unknown_test']['overall'])), 3)} so với "
            f"{vn(float(np.median(leak['test']['overall'])), 3)}; hình bên phải) và hai phân bố gần như chồng lên nhau: với đặc trưng CLIP chưa tinh chỉnh, robot lạ trông "
            "giống robot đã biết gần bằng chính robot đã biết. Từ chối robot lạ sẽ là phần khó của RQ5.",
            f"Miền ảnh giữa ba tập: p = {pv(p_value)}, Cramér V = {vn(cramers, 4)}"
            + (" (không có khác biệt có ý nghĩa ở mức 0,05; đạt tiêu chí)." if p_value >= 0.05 else " (khác biệt có ý nghĩa thống kê; xem bảng 6).")
            ,
            f"Tỉ lệ ảnh wiki giữa ba tập khác nhau có ý nghĩa thống kê (p = {pv(p_s)}) nhưng mức khác biệt rất nhỏ: {pct(wiki_share['train'], 1)}, {pct(wiki_share['val'], 1)}, "
            f"{pct(wiki_share['test'], 1)}, Cramér V = {vn(cramers_s, 4)}. Một cách giải thích (chưa kiểm chứng): ảnh tìm kiếm bị buộc theo trang nguồn nên đi theo bó, ảnh wiki thì không. "
            "Với cỡ mẫu hơn 40 nghìn ảnh, chênh 2 điểm phần trăm đã đủ cho p nhỏ; mức này không đáng lo nhưng được ghi lại để B8 báo kết quả tách theo nguồn.",
        ]
    )
    report.section(7)
    report.bullets(
        [
            "Bản dữ liệu tạm: chưa có nhãn tay, độ chính xác nhãn chưa đo; ảnh sai nhãn còn sót sẽ nằm ở cả train lẫn test. Số liệu của B5–B8 trên bản này là số liệu tạm.",
            "Bỏ hết ảnh nghi ngờ làm mất cả ảnh đúng mà máy chấm nhầm (dạng xe của Transformers, tranh vẽ), nên bản tạm thiên về ảnh \"dễ\".",
            "Miền ảnh do CLIP gán, chưa kiểm định; kiểm định χ² vì thế chỉ có giá trị tham khảo.",
            "Lớp thiếu ảnh bị ép vào nhóm không biết nên nhóm này không hoàn toàn ngẫu nhiên.",
            "Nhóm chỉ nối ảnh cùng lớp; hai ảnh gần giống nhau ở hai lớp khác nhau (robot cùng khuôn khác màu) vẫn có thể nằm ở hai tập. Đó là đặc điểm của bài toán, không phải rò rỉ nhãn.",
            "Tập test lấy từ cùng nguồn với train (web), nên vẫn cùng phân bố; con số trung thực nhất là thử nghiệm thực địa ở B13 với ảnh tự chụp.",
        ]
    )
    report.section(8)
    report.reproduce(
        ["ml/.venv/Scripts/python ml/scripts/b04_chia_tap.py"], config="ml/configs/b04_chia_tap.yaml", config_hash=config_hash(cfg), seed=cfg["seed"],
        dataset_version=f"b04_splits.csv sha256 {version[:12]} (đầu vào: b03a_scores.csv.gz sha256 {file_sha256(MANIFESTS / 'b03a_scores.csv.gz')[:12]})",
    )
    print(report.write())
    print(json.dumps({"dataset_version": version[:12], "sizes": report.summary["sizes"], "same_class_leaks": same_leaks, "forced": forced}, ensure_ascii=False))


if __name__ == "__main__":
    main()
