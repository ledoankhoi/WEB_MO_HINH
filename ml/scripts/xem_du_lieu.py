"""Trang xem tập dữ liệu trực quan: ROBOTREC_DATA/xem-du-lieu.html (mở bằng trình duyệt, chỉ trên máy này).

Đọc manifest của B2 (ảnh đã tải tới thời điểm chạy), nhật ký lần thử, và điểm của B3 nếu đã có (trùng lặp, điểm liên quan,
ngoại lai, miền ảnh). Ảnh hiển thị từ thư mục ảnh trên máy, không đưa đi đâu. Chạy lại script để cập nhật.

Chạy: python ml/scripts/xem_du_lieu.py [--open]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

from robotrec.config import MANIFESTS, data_root, load_config  # noqa: E402

PAGE = r"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Xem tập dữ liệu robot</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--line:#e2e8f0;--ink:#0f172a;--muted:#64748b;--brand:#c2410c;--wiki:#7c3aed;--ddg:#0369a1;--bad:#b91c1c;--ok:#15803d}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--ink);color:#fff;padding:14px 20px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#cbd5e1}
main{padding:16px 20px;max-width:1500px;margin:auto}section{margin-bottom:22px}h2{font-size:17px;margin:0 0 10px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.stat b{display:block;font-size:24px}.stat span{color:var(--muted);font-size:12px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px}
.bar{display:flex;align-items:center;gap:8px;margin:4px 0}.bar .label{width:210px;font-size:13px}.bar .track{flex:1;background:#f1f5f9;border-radius:4px;height:16px;position:relative}
.bar .fill{height:16px;border-radius:4px;background:#64748b}.bar .num{width:110px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
table{border-collapse:collapse;width:100%;background:var(--card)}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:13px}
th{position:sticky;top:0;background:#f1f5f9;cursor:pointer}tr.cls{cursor:pointer}tr.cls:hover{background:#fff7ed}td.n{text-align:right;font-variant-numeric:tabular-nums}
.tablewrap{max-height:520px;overflow:auto;border:1px solid var(--line);border-radius:10px}
input[type=search]{padding:7px 10px;border:1px solid var(--line);border-radius:6px;width:280px;font:inherit}
button{font:inherit;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer}button.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.tile{background:var(--card);border:2px solid var(--line);border-radius:8px;overflow:hidden;position:relative}
.tile img{width:100%;height:150px;object-fit:contain;background:#f1f5f9;display:block}
.tile .cap{padding:4px 6px;font-size:11px;color:var(--muted)}
.tile.drop{opacity:.45;border-color:var(--bad)}.tile.sus{border-color:#f59e0b}
.src{position:absolute;top:4px;left:4px;font-size:10px;color:#fff;padding:1px 6px;border-radius:3px}.src.wiki{background:var(--wiki)}.src.ddg{background:var(--ddg)}
.gloss dt{font-weight:600;margin-top:8px}.gloss dd{margin:2px 0 0 0;color:#334155}
.classhead{display:flex;gap:14px;align-items:center;margin-bottom:10px}.classhead img{width:110px;height:110px;object-fit:contain;background:#f1f5f9;border-radius:8px}
.legend span{display:inline-block;margin-right:14px;font-size:12px;color:var(--muted)}.chip{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle}
.note{color:var(--muted);font-size:12px}
</style></head><body>
<header><h1>Tập dữ liệu nhận dạng robot</h1><p id="sub"></p></header>
<main>
<section><h2>Tổng quan</h2><div class="cards" id="cards"></div></section>
<section class="cols">
  <div class="panel"><h2>Theo nguồn ảnh</h2><div id="bySource"></div><p class="note" id="sourceNote"></p></div>
  <div class="panel"><h2>Theo franchise</h2><div id="byFranchise"></div></div>
  <div class="panel"><h2>Trùng lặp và nhiễu (đo trên các lớp đã chạy B3)</h2><div id="quality"></div><p class="note" id="qualityNote"></p></div>
  <div class="panel"><h2>Miền ảnh (CLIP gán tự động)</h2><div id="domains"></div></div>
</section>
<section class="panel"><h2>Cấu trúc nhãn 3 cấp</h2><p class="note">Mỗi ảnh có đúng một nhãn ở cấp 3 (robot); cấp 1 và 2 suy ra từ cấp 3.
Mô hình học ở cấp 3, kết quả được báo ở cả ba cấp (kế hoạch B8).</p><div class="cols" id="levels"></div></section>
<section class="panel"><h2>Giải thích nhanh</h2><dl class="gloss" id="gloss"></dl></section>
<section><h2>Ảnh ngẫu nhiên trong toàn bộ tập</h2><p><button class="primary" id="shuffle">Lấy 48 ảnh ngẫu nhiên khác</button>
 <span class="legend"><span><i class="chip" style="background:var(--wiki)"></i>ảnh từ wiki</span><span><i class="chip" style="background:var(--ddg)"></i>ảnh từ DuckDuckGo</span>
 <span><i class="chip" style="background:#f59e0b"></i>viền cam: B3 nghi ngờ</span><span><i class="chip" style="background:var(--bad)"></i>mờ, viền đỏ: B3 loại</span></span></p>
 <div class="gallery" id="random"></div></section>
<section><h2>Các lớp (bấm một dòng để xem toàn bộ ảnh của lớp)</h2>
 <p><input type="search" id="q" placeholder="Tìm lớp, ví dụ Optimus, Zaku, Megazord"> <span class="note" id="count"></span></p>
 <div class="tablewrap"><table><thead><tr><th data-k="i">#</th><th data-k="name">Lớp</th><th data-k="franchise">Franchise</th><th data-k="series">Dòng</th>
 <th data-k="n">Ảnh</th><th data-k="wiki">Từ wiki</th><th data-k="ddg">Từ DuckDuckGo</th><th data-k="store">Cửa hàng bán</th><th data-k="kept">Còn sau B3</th></tr></thead>
 <tbody id="rows"></tbody></table></div></section>
<section id="classView"></section>
</main>
<script>const D = __DATA__;</script>
<script>
const fmt = (n) => n.toLocaleString('vi-VN');
document.getElementById('sub').textContent = `Cập nhật lúc ${D.generated}. ${D.note}`;
const cards = [
  ['Số lớp (robot)', D.classes.length], ['Lớp đã có ảnh', D.classes.filter(c => c.n).length], ['Ảnh đã tải', D.images.length],
  ['Trung vị ảnh / lớp (lớp đã có ảnh)', D.medianPerClass], ['Lượt thử tải', D.attempts.total], ['Dung lượng ảnh', D.diskMB + ' MB'],
];
document.getElementById('cards').innerHTML = cards.map(([k, v]) => `<div class="stat"><b>${typeof v === 'number' ? fmt(v) : v}</b><span>${k}</span></div>`).join('');
function bars(el, entries, total, color) {
  document.getElementById(el).innerHTML = entries.map(([k, v, extra]) => `<div class="bar"><span class="label">${k}</span><span class="track"><span class="fill" style="display:block;width:${total ? v / total * 100 : 0}%;background:${color || '#64748b'}"></span></span><span class="num">${fmt(v)}${extra || ''}</span></div>`).join('');
}
bars('bySource', D.bySource.map(s => [s.name, s.ok, ` (${s.rate} tải được)`]), Math.max(...D.bySource.map(s => s.ok)), '#0369a1');
document.getElementById('sourceNote').textContent = D.sourceNote;
const fr = Object.entries(D.byFranchise); bars('byFranchise', fr.map(([k, v]) => [k, v]), Math.max(...fr.map(([, v]) => v)), '#c2410c');
if (D.quality) { bars('quality', D.quality.rows, D.quality.total, '#b91c1c'); document.getElementById('qualityNote').textContent = D.quality.note; }
else document.getElementById('quality').textContent = 'Chưa chạy B3 trên lớp nào.';
const dm = Object.entries(D.domains || {}); if (dm.length) bars('domains', dm, Math.max(...dm.map(([, v]) => v)), '#7c3aed'); else document.getElementById('domains').textContent = 'Có sau khi chạy B3.';
document.getElementById('levels').innerHTML = D.levels.map((lv) => `<div><b>${lv.title}</b> <span class="note">(${lv.items.length} nhãn)</span>
  <div class="note">${lv.items.map(([k, v]) => `${k}: ${v}`).join(' · ')}</div></div>`).join('');
document.getElementById('gloss').innerHTML = D.glossary.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('');
const byClass = {}; D.images.forEach((im) => { (byClass[im.c] = byClass[im.c] || []).push(im); });
function tile(im, withName) {
  const cls = im.st === 'loại' ? 'drop' : (im.sus ? 'sus' : '');
  const cap = [withName ? `<b>${D.names[im.c]}</b>` : '', im.st === 'loại' ? `loại: ${im.r}` : '', im.p != null ? `liên quan ${im.p}` : '', `${im.w}×${im.h}`].filter(Boolean).join(' · ');
  return `<div class="tile ${cls}"><span class="src ${im.s}">${im.s === 'wiki' ? 'wiki' : 'DDG'}</span><a href="${im.u}" target="_blank" title="Mở ảnh gốc trên mạng"><img loading="lazy" src="${im.f}" alt=""></a><div class="cap">${cap}</div></div>`;
}
function shuffle() {
  const pick = []; for (let i = 0; i < Math.min(48, D.images.length); i++) pick.push(D.images[Math.floor(Math.random() * D.images.length)]);
  document.getElementById('random').innerHTML = pick.map((im) => tile(im, true)).join('');
}
document.getElementById('shuffle').onclick = shuffle; shuffle();
let sortKey = 'i', sortDir = 1;
function renderRows() {
  const q = document.getElementById('q').value.toLowerCase();
  const list = D.classes.filter((c) => !q || (c.name + ' ' + c.series + ' ' + c.franchise).toLowerCase().includes(q))
    .sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * sortDir);
  document.getElementById('count').textContent = `${list.length} lớp`;
  document.getElementById('rows').innerHTML = list.map((c) => `<tr class="cls" data-s="${c.slug}"><td class="n">${c.i}</td><td>${c.name}</td><td>${c.franchise}</td><td>${c.series || ''}</td>
    <td class="n">${c.n || '<span class="note">chưa tới lượt</span>'}</td><td class="n">${c.wiki}</td><td class="n">${c.ddg}</td><td>${c.store ? 'có' : ''}</td><td class="n">${c.kept == null ? '—' : c.kept}</td></tr>`).join('');
}
document.querySelectorAll('th').forEach((th) => th.onclick = () => { const k = th.dataset.k; sortDir = sortKey === k ? -sortDir : (['n','wiki','ddg','kept'].includes(k) ? -1 : 1); sortKey = k; renderRows(); });
document.getElementById('q').oninput = renderRows;
document.getElementById('rows').onclick = (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const c = D.classes.find((x) => x.slug === tr.dataset.s); const ims = byClass[c.slug] || [];
  const view = document.getElementById('classView');
  view.innerHTML = `<div class="panel"><div class="classhead">${c.ref ? `<img src="${c.ref}" alt="">` : ''}<div><h2 style="margin:0">${c.name}</h2>
    <div class="note">${c.franchise} · ${c.series || ''} · ${c.faction || ''}</div><div>${ims.length} ảnh (wiki ${c.wiki}, DuckDuckGo ${c.ddg})${c.kept != null ? ` · còn ${c.kept} sau B3` : ''}</div>
    <div class="note">${c.desc || ''}</div><div class="note">Truy vấn DuckDuckGo đã dùng: ${(c.queries || []).join(' · ') || '—'}</div></div></div>
    <div class="gallery">${ims.map((im) => tile(im, false)).join('')}</div></div>`;
  view.scrollIntoView({behavior: 'smooth'});
};
renderRows();
</script></body></html>
"""

GLOSSARY = [
    ("Lớp (class)", "Một robot ở một dòng, ví dụ <i>Optimus Prime (G1)</i>. Mô hình sẽ học cách trả lời một ảnh thuộc lớp nào. Danh mục có 230 lớp (B1)."),
    ("Nhãn (label)", "Tên lớp gắn với mỗi ảnh. Ở đây nhãn của một ảnh là lớp mà ta đã dùng để tìm ra nó (truy vấn hoặc trang wiki), nên có thể sai; B3 đo và giảm tỉ lệ nhãn sai."),
    ("Ảnh thô", "Ảnh vừa tải về, chưa làm sạch: còn ảnh trùng, ảnh sai robot, ảnh không phải robot."),
    ("Trùng tuyệt đối / gần trùng", "Cùng một file (sha1 giống hệt), hoặc gần như cùng một ảnh (bản thu nhỏ, cắt nhẹ, nén lại): pHash lệch ≤ 6/64 bit hoặc đặc trưng CLIP giống ≥ 0,95. Ảnh trùng làm số liệu đánh giá bị thổi phồng nếu một bản rơi vào tập huấn luyện, một bản rơi vào tập kiểm tra."),
    ("Điểm liên quan", "Xác suất (0–1) mô hình CLIP cho rằng ảnh là một robot (đồ chơi, mô hình, phim, tranh) chứ không phải người, chữ, biểu tượng... Dùng để lọc và để xếp ảnh nghi ngờ lên trước khi duyệt tay."),
    ("Khoảng tin cậy 95%", "Khoảng giá trị mà con số thật nhiều khả năng nằm trong đó, khi ta chỉ đo được trên một mẫu. Ví dụ ghép tự động đúng 71/76 = 93,4%, khoảng tin cậy [85,5%; 97,2%]: nếu có thêm nhiều sản phẩm, tỉ lệ đúng thật nhiều khả năng nằm trong khoảng đó. Mẫu càng lớn, khoảng càng hẹp."),
    ("Độ chính xác nhãn", "Tỉ lệ ảnh có nhãn đúng trong tập dữ liệu, đo bằng cách chủ dự án chấm tay một mẫu ngẫu nhiên (B3: 500 ảnh trước lọc, 1.000 ảnh sau lọc), kèm khoảng tin cậy."),
    ("Huấn luyện (B6)", "Chưa bắt đầu. Sẽ tinh chỉnh (fine-tune) mạng đã học sẵn trên hàng triệu ảnh (ConvNeXt-Tiny, EfficientNetV2-S, ViT-B/16) để phân biệt 230 lớp: hàm mất mát cross-entropy có làm trơn nhãn, tối ưu AdamW, tăng cường dữ liệu, chạy 3 hạt giống."),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--open", action="store_true", help="mở trang bằng trình duyệt mặc định")
    args = parser.parse_args()
    root = data_root()
    robots = json.loads((MANIFESTS / "robots.json").read_text(encoding="utf-8"))["classes"]
    with open(root / "b02" / "manifest.csv", encoding="utf-8", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    attempts_path = root / "b02" / "attempts.csv"
    attempts = list(csv.DictReader(open(attempts_path, encoding="utf-8", newline=""))) if attempts_path.exists() else []
    scores: dict[str, dict] = {}
    scores_from = None
    for name in ("b03", "b03_thu"):
        path = root / name / "scores.csv"
        if path.exists():
            with open(path, encoding="utf-8", newline="") as handle:
                scores = {row["key"]: row for row in csv.DictReader(handle)}
            scores_from = name
            break

    images = []
    for i, row in enumerate(manifest):
        score = scores.get(f"r{i}")
        images.append({
            "c": row["class"], "s": row["source"], "f": f"images/raw/{row['file']}", "u": row["url"], "w": int(row["width"]), "h": int(row["height"]),
            **({"st": score["status"], "r": score["reason"], "p": round(float(score["p_robot"]), 2) if score.get("p_robot") else None,
                "sus": score.get("suspicious") == "True"} if score else {}),
        })
    counts = Counter(row["class"] for row in manifest)
    by_source_class = Counter((row["class"], row["source"]) for row in manifest)
    kept = Counter(s["class"] for s in scores.values() if s["status"] == "giữ")
    scored_classes = {s["class"] for s in scores.values()}
    queries: dict[str, list[str]] = defaultdict(list)
    for row in manifest:
        if row["source"] == "ddg" and row["query"] not in queries[row["class"]]:
            queries[row["class"]].append(row["query"])
    classes = [
        {"i": i, "slug": r["slug"], "name": r["display_name"], "franchise": r["franchise_label"], "series": r["series"], "faction": r["faction"],
         "n": counts.get(r["slug"], 0), "wiki": by_source_class[(r["slug"], "wiki")], "ddg": by_source_class[(r["slug"], "ddg")],
         "store": bool(r["store_products"]), "kept": kept.get(r["slug"], 0) if r["slug"] in scored_classes else None,
         "ref": r["image"]["url"], "desc": (r["description"] or "")[:300], "queries": queries.get(r["slug"], [])}
        for i, r in enumerate(robots, 1)
    ]
    with_images = sorted(c["n"] for c in classes if c["n"])
    status = Counter(a["status"] for a in attempts)
    by_source = []
    for source, name in (("wiki", "Wiki (Teletraan I, Gundam Wiki, RangerWiki)"), ("ddg", "DuckDuckGo Images")):
        tried = [a for a in attempts if a["source"] == source]
        ok = sum(1 for a in tried if a["status"] == "ok")
        by_source.append({"name": name, "ok": ok, "rate": f"{ok / len(tried) * 100:.0f}%" if tried else "—"})
    quality = None
    if scores:
        values = list(scores.values())
        total = len(values)
        reasons = Counter(s["reason"] for s in values if s["status"] == "loại")
        alive = [s for s in values if s["status"] == "giữ"]
        rows = [[k, v, f" ({v / total * 100:.1f}%)"] for k, v in reasons.most_common()]
        sus = sum(1 for s in alive if s.get("suspicious") == "True")
        rows.append(["nghi ngờ (chờ duyệt tay)", sus, f" ({sus / total * 100:.1f}%)"])
        rows.append(["còn lại, không nghi ngờ", len(alive) - sus, f" ({(len(alive) - sus) / total * 100:.1f}%)"])
        quality = {"rows": rows, "total": total,
                   "note": f"Đo trên {len(scored_classes)} lớp đã chạy thử B3 ({total} ảnh thô). Số của toàn bộ tập có sau khi B2 xong và chạy B3."}
    domains = Counter(s.get("domain") for s in scores.values() if s["status"] == "giữ" and s.get("domain"))
    disk = sum(p.stat().st_size for p in (root / "images" / "raw").rglob("*.jpg")) / 1024**2
    data = {
        "generated": datetime.now().strftime("%H:%M %d/%m/%Y"),
        "note": f"B2 đang thu ảnh: {sum(1 for c in classes if c['n'])}/{len(classes)} lớp đã có ảnh. Ảnh chỉ dùng cho nghiên cứu, chỉ xem trên máy này.",
        "classes": classes, "images": images, "names": {r["slug"]: r["display_name"] for r in robots},
        "medianPerClass": with_images[len(with_images) // 2] if with_images else 0,
        "attempts": {"total": len(attempts), "status": dict(status)}, "diskMB": round(disk),
        "bySource": by_source,
        "sourceNote": f"Tỉ lệ tải được = ảnh tải về được / URL đã thử. Lỗi thường gặp: robots.txt không cho phép {status.get('robots', 0)}, "
                      f"HTTP 4xx {status.get('http_4xx', 0)}, hết thời gian {status.get('timeout', 0)}. Bing và TFWiki đã bị loại (báo cáo B02).",
        "byFranchise": dict(Counter(r["franchise_label"] for r in robots for _ in range(counts.get(r["slug"], 0)))),
        "quality": quality, "domains": dict(domains), "glossary": GLOSSARY, "scoresFrom": scores_from,
    }
    franchise_count = Counter(r["franchise_label"] for r in robots)
    group_count = Counter((r["franchise_label"], r["series"].split(" · ")[0] if r["franchise"] == "gundam" else r["group"]) for r in robots)
    b01 = load_config("b01_danh_muc")
    group_label = {g["key"]: g["label"] for f in b01["franchises"] for g in f["groups"]}
    data["levels"] = [
        {"title": "Cấp 1: franchise", "items": [[k, f"{v} robot"] for k, v in franchise_count.items()]},
        {"title": "Cấp 2: dòng / kỷ nguyên", "items": [[f"{group_label.get(g, g)}", f"{v} robot"] for (_, g), v in group_count.items()]},
        {"title": "Cấp 3: robot (lớp huấn luyện)", "items": [["tổng", "230 robot, mỗi robot một nhãn"]]},
    ]
    out = root / "xem-du-lieu.html"
    out.write_text(PAGE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")), encoding="utf-8")
    print(f"Đã ghi {out} ({len(images)} ảnh, {sum(1 for c in classes if c['n'])} lớp có ảnh)")
    if args.open:
        os.startfile(out)  # type: ignore[attr-defined]


if __name__ == "__main__":
    main()
