"""B8: chọn 100 ảnh test mô hình cuối (F-s44, bản đang chạy trên web) đoán sai, dựng tờ ảnh để AI chấm loại lỗi."""
import csv, json, sys
from pathlib import Path
import numpy as np, pandas as pd
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"C:\Users\THINKPAD\WEB_MO_HINH")
sys.path.insert(0, str(ROOT / "ml"))
from robotrec.config import data_root  # noqa: E402
MAN = ROOT / "ml" / "data" / "manifests"
D = data_root()
robots = {r["slug"]: r for r in json.loads((MAN / "robots.json").read_text(encoding="utf-8"))["classes"]}
splits = pd.read_csv(MAN / "b04_splits.csv.gz", dtype=str, keep_default_na=False)
classes = sorted(splits.loc[splits["split"] == "train", "class"].unique())
test = splits[splits["split"] == "test"].reset_index(drop=True)
train = splits[splits["split"] == "train"]
y = test["class"].map({c: i for i, c in enumerate(classes)}).to_numpy()
z = np.load(D / "runs" / "b07" / "F-vit_b16_clip-s44" / "logits_test.npy")
T = 0.775847462264689
p = np.exp((z - z.max(1, keepdims=True)) / T); p /= p.sum(1, keepdims=True)
pred = z.argmax(1)
wrong = np.flatnonzero(pred != y)
rng = np.random.default_rng(42)
pick = np.sort(rng.choice(wrong, size=100, replace=False))
out = D / "b08" / "ai-cham-loi"; out.mkdir(parents=True, exist_ok=True)
print("cột:", list(test.columns), "| sai:", len(wrong), "/", len(test))

def name(c): return robots[c]["display_name"]
rows = []
for n, i in enumerate(pick, 1):
    t, q = classes[y[i]], classes[pred[i]]
    rows.append({"stt": n, "key": test.at[i, "key"], "file": test.at[i, "file"], "that": t, "doan": q,
                 "p_doan": round(float(p[i, pred[i]]), 3), "p_that": round(float(p[i, y[i]]), 3),
                 "cung_nhan_vat": int(robots[t]["character"] == robots[q]["character"]),
                 "cung_franchise": int(robots[t]["franchise"] == robots[q]["franchise"]),
                 "mien": test.at[i, "domain"] if "domain" in test.columns else ""})
with open(out / "muc.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)

font = ImageFont.truetype("arial.ttf", 14); small = ImageFont.truetype("arial.ttf", 12)
S, R, cap = 300, 140, 40  # ảnh test, ảnh tham chiếu, chữ
per = 4
refrng = np.random.default_rng(7)
def refs(c, k=2):
    files = train.loc[train["class"] == c, "file"].tolist()
    return [files[j] for j in refrng.choice(len(files), size=min(k, len(files)), replace=False)]
def paste(im, path, x, y, size):
    t = Image.open(D / "images" / "raw" / path).convert("RGB"); t.thumbnail((size - 4, size - 4))
    im.paste(t, (x + 2 + (size - 4 - t.width) // 2, y + 2 + (size - 4 - t.height) // 2))
rowh = S + cap
width = S + 2 * R + 20 + 2 * R
for s in range(0, len(rows), per):
    chunk = rows[s:s + per]
    im = Image.new("RGB", (width, len(chunk) * rowh), "white"); dr = ImageDraw.Draw(im)
    for j, r in enumerate(chunk):
        y0 = j * rowh
        paste(im, r["file"], 0, y0, S)
        for k, f in enumerate(refs(r["that"])): paste(im, f, S + k * R, y0 + 20, R)
        for k, f in enumerate(refs(r["doan"])): paste(im, f, S + 2 * R + 20 + k * R, y0 + 20, R)
        dr.text((S + 2, y0 + 2), "THẬT (nhãn):", fill="green", font=small)
        dr.text((S + 2 * R + 22, y0 + 2), "MÔ HÌNH ĐOÁN:", fill="red", font=small)
        dr.text((S + 2, y0 + 20 + R + 4), name(r["that"])[:38], fill="green", font=font)
        dr.text((S + 2 * R + 22, y0 + 20 + R + 4), f"{name(r['doan'])[:30]} ({r['p_doan']:.0%})", fill="red", font=font)
        dr.text((4, y0 + S + 2), f"#{r['stt']}  miền: {r['mien']}  p(thật)={r['p_that']:.0%}", fill="black", font=font)
        dr.line([(0, y0 + rowh - 1), (width, y0 + rowh - 1)], fill="#888", width=2)
    im.save(out / f"to-{s // per + 1:02d}.jpg", quality=85)
print("xong", len(rows), "ảnh,", (len(rows) + per - 1) // per, "tờ ở", out)
print("cùng nhân vật:", sum(r["cung_nhan_vat"] for r in rows), "| cùng franchise:", sum(r["cung_franchise"] for r in rows))
