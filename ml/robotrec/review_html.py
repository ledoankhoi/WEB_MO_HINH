"""Trang HTML để chủ dự án gán nhãn và duyệt ảnh ngay trong trình duyệt (B3).

Mỗi trang là một file tự chứa (dữ liệu nhúng dạng JSON, ảnh theo đường dẫn tương đối tới thư mục ảnh). Kết quả lưu trong
localStorage của trình duyệt (đóng mở lại vẫn còn) và tải về thành CSV bằng nút "Tải kết quả".

- audit: mỗi ảnh một câu hỏi nhiều lựa chọn (phím 1, 2, 3...), có thể thêm câu hỏi phụ (gán miền ảnh).
- review: duyệt theo lớp; bấm vào ảnh để đánh dấu loại; đánh dấu lớp đã xem.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

STYLE = """
:root { --bg:#f8fafc; --card:#fff; --line:#e2e8f0; --ink:#0f172a; --muted:#64748b; --brand:#c2410c; --ok:#15803d; --bad:#b91c1c; }
* { box-sizing: border-box; }
body { margin:0; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; background:var(--bg); color:var(--ink); }
header { position:sticky; top:0; z-index:5; background:var(--card); border-bottom:1px solid var(--line); padding:10px 16px;
         display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
header h1 { font-size:16px; margin:0 12px 0 0; }
button, select { font:inherit; padding:6px 10px; border:1px solid var(--line); border-radius:6px; background:#fff; cursor:pointer; }
button.primary { background:var(--brand); color:#fff; border-color:var(--brand); }
.muted { color:var(--muted); }
main { padding:16px; }
.help { background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 14px; margin-bottom:14px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; }
.card { background:var(--card); border:2px solid var(--line); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; }
.card.focus { outline:3px solid #2563eb; }
.card.done { border-color:#94a3b8; }
.card img.main { width:100%; height:220px; object-fit:contain; background:#f1f5f9; }
.card .body { padding:8px; display:flex; flex-direction:column; gap:6px; }
.ref { display:flex; gap:8px; align-items:center; }
.ref img { width:48px; height:48px; object-fit:contain; background:#f1f5f9; border-radius:4px; }
.choices { display:flex; flex-wrap:wrap; gap:4px; }
.choices button { flex:1 1 auto; padding:4px 6px; font-size:12px; }
.choices button.on { background:var(--ink); color:#fff; border-color:var(--ink); }
.review .card { cursor:pointer; position:relative; }
.review .card img.main { height:170px; }
.review .card.rejected { border-color:var(--bad); }
.review .card.rejected::after { content:"LOẠI"; position:absolute; top:8px; left:8px; background:var(--bad); color:#fff; font-weight:700;
                                 padding:2px 8px; border-radius:4px; }
.badge { font-size:11px; color:var(--muted); }
.badge.warn { color:var(--bad); font-weight:600; }
.classhead { display:flex; gap:12px; align-items:center; background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px; margin-bottom:12px; }
.classhead img { width:96px; height:96px; object-fit:contain; background:#f1f5f9; border-radius:6px; }
"""

AUDIT_JS = """
const KEY = 'robotrec:' + DATA.id;
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const grid = document.getElementById('grid');
let focus = 0;
function render() {
  grid.innerHTML = '';
  DATA.items.forEach((item, i) => {
    const s = state[item.key] || {};
    const card = document.createElement('div');
    card.className = 'card' + (i === focus ? ' focus' : '') + (s.answer ? ' done' : '');
    card.id = 'c' + i;
    const choices = DATA.choices.map((c, j) => `<button data-i="${i}" data-a="${c[0]}" class="${s.answer === c[0] ? 'on' : ''}">${j + 1}. ${c[1]}</button>`).join('');
    const extra = DATA.extra && i < DATA.extraCount ? `<div class="muted">${DATA.extra.question}</div><div class="choices">` +
      DATA.extra.choices.map((c) => `<button data-i="${i}" data-x="${c}" class="${s.extra === c ? 'on' : ''}">${c}</button>`).join('') + '</div>' : '';
    card.innerHTML = `<img class="main" loading="lazy" src="${item.src}" alt="">
      <div class="body"><div class="ref">${item.ref ? `<img src="${item.ref}" alt="">` : ''}<div><b>${item.name}</b><br><span class="muted">${item.series || ''}</span></div></div>
      <div class="muted">${DATA.question}</div><div class="choices">${choices}</div>${extra}</div>`;
    grid.appendChild(card);
  });
  update();
}
function update() {
  const done = DATA.items.filter((it) => (state[it.key] || {}).answer).length;
  document.getElementById('progress').textContent = `${done} / ${DATA.items.length} ảnh đã chấm`;
}
grid.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const i = +b.dataset.i, key = DATA.items[i].key;
  state[key] = state[key] || {};
  if (b.dataset.a) state[key].answer = b.dataset.a;
  if (b.dataset.x) state[key].extra = b.dataset.x;
  save(); focus = i; render();
});
document.addEventListener('keydown', (e) => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= DATA.choices.length) {
    const key = DATA.items[focus].key;
    state[key] = state[key] || {}; state[key].answer = DATA.choices[n - 1][0]; save();
    if (!(DATA.extra && focus < DATA.extraCount)) focus = Math.min(focus + 1, DATA.items.length - 1);
    render(); document.getElementById('c' + focus).scrollIntoView({block: 'center'});
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { focus = Math.min(focus + 1, DATA.items.length - 1); render(); document.getElementById('c' + focus).scrollIntoView({block: 'center'}); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { focus = Math.max(focus - 1, 0); render(); document.getElementById('c' + focus).scrollIntoView({block: 'center'}); e.preventDefault(); }
});
document.getElementById('export').onclick = () => {
  const rows = [['key', 'answer', 'extra']].concat(DATA.items.map((it) => [it.key, (state[it.key] || {}).answer || '', (state[it.key] || {}).extra || '']));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], {type: 'text/csv'}));
  a.download = DATA.id + '.csv'; a.click();
};
render();
"""

REVIEW_JS = """
const KEY = 'robotrec:' + DATA.id;
let state = {rejected: {}, reviewed: {}};
try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const select = document.getElementById('cls');
let showAll = false;
DATA.classes.forEach((c, i) => { const o = document.createElement('option'); o.value = i; select.appendChild(o); });
function labels() {
  [...select.options].forEach((o, i) => { const c = DATA.classes[i]; o.textContent = `${state.reviewed[c.slug] ? '✓ ' : ''}${i + 1}. ${c.name} (${c.items.filter((it) => it.flag).length} nghi ngờ / ${c.items.length})`; });
}
function render() {
  const c = DATA.classes[+select.value];
  const items = showAll ? c.items : c.items.filter((it) => it.flag);
  document.getElementById('head').innerHTML = `${c.ref ? `<img src="${c.ref}" alt="">` : ''}<div><b style="font-size:16px">${c.name}</b><br>
    <span class="muted">${c.series || ''}</span><br><span class="muted">Hiển thị ${items.length} / ${c.items.length} ảnh ${showAll ? '(tất cả)' : '(chỉ ảnh nghi ngờ)'}</span><br>
    <label><input type="checkbox" id="rev" ${state.reviewed[c.slug] ? 'checked' : ''}> Đã xem xong lớp này</label></div>`;
  document.getElementById('rev').onchange = (e) => { state.reviewed[c.slug] = e.target.checked; save(); labels(); update(); };
  const grid = document.getElementById('grid'); grid.innerHTML = '';
  items.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'card' + (state.rejected[it.key] ? ' rejected' : '');
    card.innerHTML = `<img class="main" loading="lazy" src="${it.src}" alt=""><div class="body"><span class="badge ${it.flag ? 'warn' : ''}">${it.note}</span></div>`;
    card.onclick = () => { if (state.rejected[it.key]) delete state.rejected[it.key]; else state.rejected[it.key] = c.slug; save(); card.classList.toggle('rejected'); update(); };
    grid.appendChild(card);
  });
  update();
}
function update() {
  const reviewed = Object.values(state.reviewed).filter(Boolean).length;
  document.getElementById('progress').textContent = `${reviewed} / ${DATA.classes.length} lớp đã xem · ${Object.keys(state.rejected).length} ảnh đánh dấu loại`;
}
select.onchange = render;
document.getElementById('prev').onclick = () => { select.value = Math.max(0, +select.value - 1); render(); window.scrollTo(0, 0); };
document.getElementById('next').onclick = () => { const c = DATA.classes[+select.value]; state.reviewed[c.slug] = true; save(); labels();
  select.value = Math.min(DATA.classes.length - 1, +select.value + 1); render(); window.scrollTo(0, 0); };
document.getElementById('all').onclick = (e) => { showAll = !showAll; e.target.textContent = showAll ? 'Chỉ ảnh nghi ngờ' : 'Hiện tất cả ảnh'; render(); };
document.getElementById('export').onclick = () => {
  const rows = [['key', 'class', 'decision']].concat(Object.entries(state.rejected).map(([k, s]) => [k, s, 'loai']))
    .concat(Object.entries(state.reviewed).filter(([, v]) => v).map(([s]) => ['', s, 'da_xem']));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], {type: 'text/csv'}));
  a.download = DATA.id + '.csv'; a.click();
};
labels(); render();
"""


def _page(title: str, help_html: str, data: dict, controls: str, body_class: str, script: str) -> str:
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title><style>{STYLE}</style></head>
<body class="{body_class}"><header><h1>{html.escape(title)}</h1>{controls}<span id="progress" class="muted"></span>
<button class="primary" id="export">Tải kết quả (CSV)</button></header>
<main><div class="help">{help_html}</div><div id="head"></div><div class="grid" id="grid"></div></main>
<script>const DATA = {payload};</script><script>{script}</script></body></html>
"""


def write_audit(path: Path, page_id: str, title: str, help_html: str, question: str, choices: list[tuple[str, str]], items: list[dict],
                extra: dict | None = None, extra_count: int = 0) -> None:
    data = {"id": page_id, "question": question, "choices": choices, "items": items, "extra": extra, "extraCount": extra_count}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_page(title, help_html, data, "", "audit", AUDIT_JS), encoding="utf-8")


def write_review(path: Path, page_id: str, title: str, help_html: str, classes: list[dict]) -> None:
    controls = ('<button id="prev">← Lớp trước</button><select id="cls"></select>'
                '<button id="next">Xong, lớp sau →</button><button id="all">Hiện tất cả ảnh</button>')
    data = {"id": page_id, "classes": classes}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_page(title, help_html, data, controls, "review", REVIEW_JS), encoding="utf-8")
