// Phần dữ liệu mẫu thứ ba: làm dữ liệu chi tiết và hợp lý hơn (chạy sau seed-demo.ts và seed-extras.ts).
//   1. Sản phẩm: điền các trường còn trống từ chính thông số đã có (tỉ lệ, cấp độ, "trong hộp có gì", mô tả SEO). Không
//      ghi đè nội dung đã có.
//   2. Viết lại lời đánh giá, hỏi đáp, bình luận cộng đồng của dữ liệu mẫu cho khớp loại sản phẩm, số sao và chủ đề bài.
//   3. Đơn mới theo đúng luồng: đơn có tuỳ chọn Xưởng, đơn mua đủ combo, đơn hai ngày gần đây (có flash sale, chờ chuyển
//      khoản, khách báo đã chuyển), báo chuyển khoản cho đơn chuyển khoản cũ; đánh giá cho đơn mới đã hoàn tất.
//   4. Tin tức khớp với flash sale, combo đã có; bài hướng dẫn; bài cộng đồng và câu hỏi mới còn chờ duyệt.
// Mỗi bước tự kiểm tra đã làm chưa (đơn mới có idempotency_key "demo3-..."), nên chạy lại sau khi bị dừng không tạo trùng.
// Chạy: DEMO_PART=details npm run demo-data.

import { foldText, slugify } from "@/lib/format";
import { parseConfig, serializeConfig, type WorkshopSelection } from "@/lib/workshop";
import { getDb, type InStatement, type InValue } from "@/server/db";
import { newId } from "@/server/ids";
import type { AuditEntry } from "@/server/repo/audit";
import { createPost } from "@/server/repo/community";
import { findInventoryDiscrepancies } from "@/server/repo/inventory";
import { issueInvoice, type InvoiceInput } from "@/server/repo/invoices";
import { saveNews, setNewsStatus } from "@/server/repo/news";
import { applyOrderAction, createOrder, type OrderDraft } from "@/server/repo/orders";
import { findCartProducts } from "@/server/repo/products";
import { askQuestion } from "@/server/repo/questions";
import { setReviewStatus, submitReview } from "@/server/repo/reviews";
import { changeDocumentStatus, createDocument, postDocument, saveDraft } from "@/server/repo/stock-documents";
import { COMMUNITY_POSTS, DEMO_DOMAIN, ORDER_NOTES } from "./content";
import {
  ACCESSORY_DISPLAY_POSTS,
  ACCESSORY_PAINT_POST,
  ASPECTS,
  CLOSERS,
  CONTEXTS,
  DISPLAY_COMMENTS,
  DISPLAY_KEYWORD_COMMENTS,
  EXTRA_DISPLAY_POSTS,
  GUIDE_POSTS,
  KIND_QUESTION_POSTS,
  KIT_BUILD,
  KIT_DIFFICULTY,
  NO_TRANSFORM_REVIEW_POSTS,
  OPENERS,
  PENDING_POSTS,
  QA,
  QA_GIFT,
  QUESTION_POST_ANSWERS,
  SERVICE,
  SHARE_COMMENTS,
  SHOP_COMMENTS,
  WORKSHOP_LINES,
  type Kind,
  type QaTemplate,
} from "./content-details";
import { COMPANIES } from "./content-extras";
import { DAY, HOUR, address, orderSteps, phone, randomPerson, rng, type Outcome } from "./seed-demo";

export type DetailsOptions = { now: number; setClock: (ms: number) => void; log: (message: string) => void; scale?: number };

type R = ReturnType<typeof rng>;
const STAFF_ROLES = ["order_staff", "warehouse_manager", "warehouse", "accountant", "support", "marketing"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

type Info = {
  id: string;
  slug: string;
  name: string;
  short: string;
  kind: Kind;
  category: string;
  categoryName: string;
  variantId: string;
  price: number;
  image: string | null;
  tagline: string;
  specs: Map<string, string>;
  box: string;
  scale: string;
  grade: string;
  metaTitle: string;
  metaDescription: string;
};

const KIND_BY_CATEGORY: Record<string, Kind> = { transformers: "tf", "robot-hop-the": "combiner", "model-kits": "kit", "super-sentai": "sentai", "phu-kien": "acc", figure: "figure" };
// Tên ngắn: cắt phần phe phái, dòng, phân hạng, chú thích ("Bruticus Combaticons (bộ 5 hợp thể)" → "Bruticus",
// "Optimus Prime G1 Commander Class" → "Optimus Prime"); kit bỏ cấp độ đứng đầu ("MG GN-001 Gundam Exia" → "GN-001 Gundam Exia").
const SHORT_CUT =
  /\s(?:Autobots?|Decepticons?|Constructicons?|Protectobots?|Combaticons?|Stunticons?|Dinobots?|Predacons?|Maximals?|Transformers|Beast Wars|Ninja Sentai|Mobile Suit|G1|G2|Masterpiece|Studio Series|Deluxe|Voyager|Leader|Commander|Core|Legends|Titan)\b|\s\(/;
const shortName = (name: string, kind: Kind) => {
  const short = name.split(SHORT_CUT)[0].trim();
  return (kind === "kit" ? short.replace(/^(?:HG|RG|MG|PG|SD|HGUC|HGAC)\s+/, "") : short) || name;
};
// Từ đầu là danh từ chung thì viết thường khi đứng giữa câu ("đi kèm súng ion blaster"); tên riêng giữ nguyên.
const COMMON_NOUNS = new Set(["súng", "pháo", "kiếm", "rìu", "rơ-moóc", "đế", "bàn", "băng", "beam", "khiên", "chuỳ", "hiệu", "khung"]);

const lowerFirst = (text: string) => {
  const first = text.split(/\s/)[0].toLowerCase();
  return COMMON_NOUNS.has(first) || /[^\x00-\x7f]/.test(text.split(/\s/)[0]) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
};
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Giá trị cho chỗ giữ chỗ trong câu mẫu, lấy từ thông số sản phẩm. Thiếu thông số thì không có khoá đó.
function valuesOf(p: Info): Record<string, string> {
  const s = (label: string) => p.specs.get(label)?.trim() ?? "";
  const v: Record<string, string> = { name: p.name, short: p.short };
  const alt = s("Biến hình").replace(/^(Robot|robot|Dạng người máy|dạng người máy)\s+và\s+/, "");
  if (alt && alt !== s("Biến hình")) {
    v.alt = lowerFirst(alt);
    // Chỉ dạng có bánh (xe, mô tô) mới dùng câu "lăn bánh".
    if (/^(xe|mô tô)/i.test(v.alt)) v.car = v.alt;
  }
  const height = s("Chiều cao").replace(/\s*\(.*?\)\s*$/, "");
  if (height) v.height = height.charAt(0).toLowerCase() + height.slice(1);
  if (s("Phân hạng")) v.klass = s("Phân hạng");
  if (s("Dòng phim")) v.line = s("Dòng phim").replace(/\s*\(\d{4}\)\s*$/, "");
  const acc = s("Phụ kiện");
  if (acc) {
    v.acc = lowerFirst(acc);
    v.Acc = upperFirst(acc.split(/,\s*/)[0]);
  }
  if (p.kind === "combiner" && s("Hợp thể")) v.members = s("Hợp thể");
  if (s("Số thành viên")) v.count = s("Số thành viên").replace(/\s*\(.*?\)\s*$/, "");
  const grade = (s("Cấp độ").match(/\(([A-Z]+)\)/) ?? [])[1] ?? "";
  if (grade) {
    v.grade = grade;
    if (KIT_BUILD[grade]) v.build = KIT_BUILD[grade];
    if (KIT_DIFFICULTY[grade]) v.difficulty = KIT_DIFFICULTY[grade];
    // Chỉ RG, MG (và PG) có khung trong.
    if (["RG", "MG", "PG"].includes(grade)) v.frame = "Khung trong";
  }
  if (s("Tỉ lệ")) v.scale = s("Tỉ lệ");
  if (p.kind === "sentai" && s("Hợp thể")) v.merge = `từ ${s("Hợp thể")}`;
  if (s("Dùng cho")) v.for = s("Dùng cho");
  if (s("Chiều dài")) v.length = lowerFirst(s("Chiều dài"));
  if (s("Kiểu gắn")) v.mount = lowerFirst(s("Kiểu gắn"));
  if (s("Hãng sản xuất")) v.maker = s("Hãng sản xuất");
  if (s("Độ tuổi")) v.age = lowerFirst(s("Độ tuổi"));
  if (s("Vai trò khi hợp thể")) v.role = lowerFirst(s("Vai trò khi hợp thể"));
  return v;
}

// Thay chỗ giữ chỗ; null nếu câu cần một giá trị không có.
function fill(template: string, values: Record<string, string>): string | null {
  let missing = false;
  const out = template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => {
    // Câu bắt đầu bằng {acc} dùng bản viết hoa chữ đầu.
    const value = key === "acc" && template.startsWith("{acc}") ? values.Acc : values[key];
    if (!value) missing = true;
    return value ?? "";
  });
  return missing ? null : out;
}

const pickFilled = (r: R, templates: readonly string[], values: Record<string, string>, avoid = new Set<string>()): string | null => {
  const options = templates.map((t) => fill(t, values)).filter((t): t is string => t !== null && !avoid.has(t));
  return options.length > 0 ? r.pick(options) : null;
};

// Lời đánh giá ghép từ mảnh câu theo loại sản phẩm, số sao, tuỳ chọn Xưởng và chuyến giao thực tế của đơn.
function writeReview(r: R, p: Info, rating: number, ctx: { days: number; city: string; workshop: WorkshopSelection | null }, used: Set<string>): string {
  if (rating >= 4 && r.chance(0.1)) return "";
  const values = { ...valuesOf(p), days: ctx.days <= 1 ? "1 ngày" : `${ctx.days} ngày`, city: ctx.city, n: String(r.int(3, 25)) };
  for (let attempt = 0; attempt < 12; attempt++) {
    const aspects = ASPECTS[p.kind];
    const parts: string[] = [];
    if (r.chance(0.4)) parts.push(r.pick(OPENERS[rating]));
    const chosen = new Set<string>();
    const add = (pool: readonly string[]) => {
      const line = pickFilled(r, pool, values, chosen);
      if (line) {
        chosen.add(line);
        parts.push(line);
      }
    };
    if (rating === 5) {
      add(aspects.good);
      if (r.chance(0.55)) add(aspects.good);
    } else if (rating === 4) {
      add(aspects.good);
      if (r.chance(0.5)) add(aspects.mixed);
    } else if (rating === 3) {
      add(aspects.mixed);
      if (r.chance(0.5)) add(aspects.good);
    } else {
      add(aspects.bad);
      if (r.chance(0.3)) add(aspects.mixed);
    }
    if (ctx.workshop) {
      const lines = workshopLines(ctx.workshop);
      if (lines.length > 0) parts.push(r.pick(lines));
    }
    if (rating >= 4 && r.chance(0.25)) {
      const line = fill(r.pick(CONTEXTS), values);
      if (line) parts.push(line);
    }
    const service = rating >= 4 ? SERVICE.good : rating === 3 ? SERVICE.mixed : SERVICE.bad;
    if (r.chance(rating >= 4 ? 0.55 : 0.6)) {
      const line = pickFilled(r, service, values);
      if (line) parts.push(line);
    }
    if (r.chance(0.4)) parts.push(r.pick(CLOSERS[rating]));
    const text = parts.join(" ").trim();
    if (text && !used.has(text)) {
      used.add(text);
      return text;
    }
  }
  return "";
}

function workshopLines(selection: WorkshopSelection): string[] {
  const paintNames: Record<string, string> = { "do-tham": "Đỏ thẫm", "bang-lam": "Băng lam", "bong-dem": "Bóng đêm", "vang-solar": "Vàng Solar" };
  const finishNames: Record<string, string> = { bong: "bóng", "anh-kim": "ánh kim" };
  const lines: string[] = [];
  if (selection.paint) lines.push(WORKSHOP_LINES.paint.replace("{paint}", paintNames[selection.paint] ?? selection.paint));
  if (selection.finish && finishNames[selection.finish]) lines.push(WORKSHOP_LINES.finish.replace("{finish}", finishNames[selection.finish]));
  if (selection.stand === "luc-giac") lines.push(WORKSHOP_LINES.stand);
  if (selection.stand === "luc-giac-led") lines.push(WORKSHOP_LINES["stand-led"]);
  if (selection.led) lines.push(WORKSHOP_LINES.led);
  if (selection.assembly === "lap-rap") lines.push(WORKSHOP_LINES.assembly);
  if (selection.assembly === "lap-rap-ke-chi") lines.push(WORKSHOP_LINES["assembly-panel"]);
  if (selection.decal && selection.decalText) lines.push(WORKSHOP_LINES.decal.replace("{text}", selection.decalText));
  if (selection.gift) lines.push(WORKSHOP_LINES.gift);
  return lines;
}

// "Trong hộp có gì" dựng từ thông số (mô hình, phụ kiện đã ghi trong thông số, sách hướng dẫn phù hợp loại).
function boxFor(p: Info): string[] {
  const s = (label: string) => p.specs.get(label)?.trim() ?? "";
  const accessories = s("Phụ kiện") ? s("Phụ kiện").split(/,\s*/).map(upperFirst) : [];
  const v = valuesOf(p);
  switch (p.kind) {
    case "combiner": {
      const members = s("Hợp thể");
      return [
        members ? `${v.count ?? "Các"} mô hình thành viên: ${members}` : `Các mô hình thành viên của ${p.short}`,
        "Chi tiết bàn tay, bàn chân dùng khi hợp thể",
        ...accessories,
        "Sách hướng dẫn biến hình và hợp thể",
      ];
    }
    case "kit":
      return [`Linh kiện lắp ${v.grade && !p.short.startsWith(v.grade) ? `${v.grade} ` : ""}${p.short}`, ...accessories, "Tờ sticker và sách hướng dẫn lắp"];
    case "acc":
      return [p.name, ...(s("Lắp ráp") ? ["Hướng dẫn lắp"] : [])];
    case "sentai":
      return [`Mô hình ${p.short}`, ...accessories, s("Hợp thể") ? "Sách hướng dẫn hợp thể" : "Sách hướng dẫn"];
    case "figure":
      return [`Mô hình ${p.short}`, ...accessories, "Sách hướng dẫn"];
    default:
      return [
        `Mô hình ${p.short}${v.klass ? ` (${v.klass})` : ""}`,
        ...accessories,
        s("Vai trò khi hợp thể") ? "Sách hướng dẫn biến hình và hợp thể" : s("Biến hình") ? "Sách hướng dẫn biến hình" : "Sách hướng dẫn",
      ];
  }
}

function metaFor(p: Info): { title: string; description: string } {
  const v = valuesOf(p);
  const longTitle = `${p.name} – ${p.categoryName} chính hãng`;
  const title = longTitle.length <= 60 ? longTitle : `${p.name} chính hãng`.slice(0, 60);
  // Không lặp chữ đã có trong tên ("B-127 Transformers One Deluxe" không thêm "Deluxe Class", "RG ..." không thêm "RG").
  const klass = v.klass && !p.name.includes(v.klass.split(" ")[0]) ? ` ${v.klass}` : "";
  const grade = v.grade && !new RegExp(`\\b${v.grade}\\b`).test(p.name) ? ` ${v.grade}` : "";
  const scale = v.scale && !p.name.includes(v.scale) ? ` ${v.scale}` : "";
  const bits = [
    `${p.name}${klass}${grade}${scale} chính hãng${v.maker ? ` ${v.maker}` : ""}.`,
    p.tagline ? `${upperFirst(p.tagline.replace(/\.$/, ""))}.` : "",
    v.height ? `Cao ${v.height}.` : "",
    "Xem mô hình 3D và ảnh thật tại ROBOTICA.",
  ].filter(Boolean);
  let description = "";
  for (const bit of bits) if ((description + " " + bit).trim().length <= 160) description = (description + " " + bit).trim();
  return { title, description };
}

// ---------------------------------------------------------------------------------------------------------

export async function seedDetails(options: DetailsOptions): Promise<Record<string, number>> {
  const { now, log } = options;
  const setClock = (ms: number) => options.setClock(Math.round(Math.min(ms, now - 60_000)));
  const db = await getDb();
  const summary: Record<string, number> = {};
  const count = (key: string, n = 1) => (summary[key] = (summary[key] ?? 0) + n);
  const demo = `%@${DEMO_DOMAIN}`;
  const has = async (sql: string, args: InValue[] = []) => Boolean((await db.execute({ sql: `SELECT EXISTS (${sql}) AS x`, args })).rows[0].x);
  // Mỗi bước một chuỗi ngẫu nhiên riêng: chạy lại một bước cho cùng kế hoạch dù các bước trước đã bỏ qua.
  const rngFor = (name: string) => rng([...name].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 20261112));

  const staff = {} as Record<StaffRole, { id: string; role: string }>;
  for (const role of STAFF_ROLES) {
    const row = (await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [`${role.replace("_", ".")}@${DEMO_DOMAIN}`] })).rows[0];
    if (!row) throw new Error("Chưa có dữ liệu mẫu phần một (npm run demo-data).");
    staff[role] = { id: String(row.id), role };
  }
  const entry = (who: StaffRole, action: string, entity: string, text: string): AuditEntry => ({ actor: staff[who], action, entity, summary: text });

  const products: Info[] = (
    await db.execute(
      `SELECT p.id, p.slug, p.name, p.tagline, p.specs, p.box_contents, p.scale, p.grade, p.meta_title, p.meta_description,
              c.slug AS category, c.name AS category_name, v.id AS variant_id, v.price, COALESCE(v.image, p.image) AS image
       FROM products p JOIN categories c ON c.id = p.category_id JOIN product_variants v ON v.product_id = p.id AND v.is_active
       WHERE p.status = 'published' ORDER BY p.slug, v.id`,
    )
  ).rows.map((row) => {
    let specs: { label: string; value: string }[] = [];
    try {
      specs = JSON.parse(String(row.specs ?? "[]"));
    } catch {
      specs = [];
    }
    const name = String(row.name);
    const category = String(row.category);
    return {
      id: String(row.id),
      slug: String(row.slug),
      name,
      short: shortName(name, KIND_BY_CATEGORY[category] ?? "tf"),
      kind: KIND_BY_CATEGORY[category] ?? "tf",
      category,
      categoryName: String(row.category_name),
      variantId: String(row.variant_id),
      price: Number(row.price),
      image: row.image === null ? null : String(row.image),
      tagline: String(row.tagline ?? ""),
      specs: new Map(specs.map((x) => [String(x.label), String(x.value)])),
      box: String(row.box_contents ?? ""),
      scale: String(row.scale ?? ""),
      grade: String(row.grade ?? ""),
      metaTitle: String(row.meta_title ?? ""),
      metaDescription: String(row.meta_description ?? ""),
    };
  });
  const byProduct = new Map(products.map((p) => [p.id, p]));
  const byVariant = new Map(products.map((p) => [p.variantId, p]));
  const preorderVariants = new Set((await db.execute("SELECT variant_id FROM preorder_offers WHERE status <> 'ended'")).rows.map((row) => String(row.variant_id)));
  const sellable = products.filter((p) => !preorderVariants.has(p.variantId));
  log(`${products.length} sản phẩm đang bán (${sellable.length} không đặt trước).`);

  // ---------------------------------------------------------------------------------------------------------
  // 1. Sản phẩm: chỉ điền trường còn trống.
  {
    const statements: InStatement[] = [];
    for (const p of products) {
      const v = valuesOf(p);
      if (!p.scale && v.scale) statements.push({ sql: "UPDATE products SET scale = ? WHERE id = ? AND COALESCE(scale, '') = ''", args: [v.scale, p.id] });
      if (!p.grade && v.grade) statements.push({ sql: "UPDATE products SET grade = ? WHERE id = ? AND COALESCE(grade, '') = ''", args: [v.grade, p.id] });
      if (!p.box.trim()) {
        statements.push({ sql: "UPDATE products SET box_contents = ? WHERE id = ? AND COALESCE(box_contents, '') = ''", args: [boxFor(p).join("\n"), p.id] });
        count("Sản phẩm thêm \"trong hộp có gì\"");
      }
      if (!p.metaTitle || !p.metaDescription) {
        const meta = metaFor(p);
        statements.push({
          sql: "UPDATE products SET meta_title = CASE WHEN COALESCE(meta_title, '') = '' THEN ? ELSE meta_title END, meta_description = CASE WHEN COALESCE(meta_description, '') = '' THEN ? ELSE meta_description END WHERE id = ?",
          args: [meta.title, meta.description, p.id],
        });
        count("Sản phẩm thêm mô tả SEO");
      }
      if ((!p.scale && v.scale) || (!p.grade && v.grade)) count("Sản phẩm thêm tỉ lệ/cấp độ");
    }
    for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
    log(`Sản phẩm: ${statements.length} lệnh điền trường trống.`);
  }

  // ---------------------------------------------------------------------------------------------------------
  // 2a. Viết lại lời đánh giá mẫu theo sản phẩm, số sao, tuỳ chọn Xưởng và chuyến giao của chính đơn đó.
  {
    const r = rngFor("reviews");
    const rows = await db.execute({
      sql: `SELECT rv.id, rv.rating, oi.product_id, oi.options_config, o.shipping_city, o.created_at,
                   (SELECT MIN(e.created_at) FROM order_events e WHERE e.order_id = o.id AND e.field = 'shipping_status' AND e.to_value = 'delivered')::bigint AS delivered_at
            FROM reviews rv JOIN order_items oi ON oi.id = rv.order_item_id JOIN orders o ON o.id = oi.order_id JOIN users u ON u.id = rv.user_id
            WHERE u.email LIKE ? ORDER BY rv.created_at, rv.id`,
      args: [demo],
    });
    const used = new Set<string>();
    const statements: InStatement[] = [];
    for (const row of rows.rows) {
      const product = byProduct.get(String(row.product_id));
      if (!product) continue;
      const days = row.delivered_at ? Math.max(1, Math.round((Number(row.delivered_at) - Number(row.created_at)) / DAY)) : 3;
      const config = parseConfig(String(row.options_config ?? ""), product.category);
      const text = writeReview(r, product, Number(row.rating), { days, city: String(row.shipping_city), workshop: config && config.lines.length > 0 ? config.selection : null }, used);
      statements.push({ sql: "UPDATE reviews SET comment = ? WHERE id = ?", args: [text, String(row.id)] });
    }
    for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
    count("Đánh giá viết lại", statements.length);
  }

  // 2b. Hỏi đáp: câu hỏi hợp loại sản phẩm, câu trả lời lấy từ thông số.
  {
    const r = rngFor("questions");
    const rows = await db.execute({
      sql: `SELECT q.id, q.product_id, u.city,
                   (SELECT a.id FROM product_answers a WHERE a.question_id = q.id AND a.is_staff ORDER BY a.created_at LIMIT 1) AS staff_answer,
                   (SELECT a.id FROM product_answers a WHERE a.question_id = q.id AND NOT a.is_staff ORDER BY a.created_at LIMIT 1) AS buyer_answer
            FROM product_questions q JOIN users u ON u.id = q.user_id WHERE u.email LIKE ? ORDER BY q.created_at`,
      args: [demo],
    });
    const usage = new Map<string, number>();
    const perProduct = new Map<string, Set<string>>();
    const statements: InStatement[] = [];
    for (const row of rows.rows) {
      const product = byProduct.get(String(row.product_id));
      if (!product) continue;
      const values = { ...valuesOf(product), city: String(row.city || "Hà Nội") };
      const needBuyer = row.buyer_answer !== null;
      const pool: QaTemplate[] = [...QA[product.kind], ...QA.any, ...(product.kind === "acc" ? [] : [QA_GIFT])];
      const seen = perProduct.get(product.id) ?? new Set<string>();
      const usable = (t: QaTemplate) => Boolean(fill(t.q, values) && fill(t.staff, values) && (!needBuyer || (t.buyer && fill(t.buyer, values))) && !seen.has(t.q));
      // Ưu tiên câu hỏi riêng của loại sản phẩm (70%), còn lại là câu hỏi chung (giao hàng, bảo hành, gói quà...).
      const specific = QA[product.kind].filter(usable);
      const valid = specific.length > 0 && r.chance(0.7) ? specific : pool.filter(usable);
      if (valid.length === 0) continue;
      const least = Math.min(...valid.map((t) => usage.get(t.q) ?? 0));
      const template = r.pick(valid.filter((t) => (usage.get(t.q) ?? 0) === least));
      usage.set(template.q, least + 1);
      seen.add(template.q);
      perProduct.set(product.id, seen);
      statements.push({ sql: "UPDATE product_questions SET body = ? WHERE id = ?", args: [fill(template.q, values)!, String(row.id)] });
      if (row.staff_answer) statements.push({ sql: "UPDATE product_answers SET body = ? WHERE id = ?", args: [fill(template.staff, values)!, String(row.staff_answer)] });
      if (row.buyer_answer && template.buyer) statements.push({ sql: "UPDATE product_answers SET body = ? WHERE id = ?", args: [fill(template.buyer, values)!, String(row.buyer_answer)] });
      count("Câu hỏi viết lại");
    }
    for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
  }

  // 2c. Cộng đồng: bài trưng bày trùng nội dung đổi sang bài khác; bình luận khớp chủ đề; bình luận bị báo spam thành tin rao vặt.
  {
    const r = rngFor("community");
    const posts = (
      await db.execute({
        sql: `SELECT p.id, p.topic, p.body, p.created_at, p.product_id, pr.name AS product_name FROM community_posts p JOIN users u ON u.id = p.user_id
              LEFT JOIN products pr ON pr.id = p.product_id WHERE u.email LIKE ? ORDER BY p.created_at`,
        args: [demo],
      })
    ).rows.map((row) => ({
      id: String(row.id),
      topic: String(row.topic),
      body: String(row.body),
      product: row.product_id === null ? null : (byProduct.get(String(row.product_id)) ?? null),
      productName: row.product_name === null ? null : String(row.product_name),
    }));
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = COMMUNITY_POSTS.map((t) => new RegExp(`^${escape(t.body).replace(escape("{p}"), ".*?")}$`, "s"));
    const transforms = (p: Info) => p.kind === "combiner" || Boolean(valuesOf(p).alt);
    const seenTemplate = new Set<number>();
    const extra = r.shuffle(EXTRA_DISPLAY_POSTS);
    const accessoryPosts = r.shuffle(ACCESSORY_DISPLAY_POSTS);
    // Bình luận trả lời cho bài hỏi đáp vừa viết lại.
    const answersFor = new Map<string, string[]>();
    const takeExtra = (p: Info) => {
      // "So dáng ở hai chế độ" chỉ hợp với mẫu biến hình.
      const index = extra.findIndex((t) => transforms(p) || !t.includes("hai chế độ"));
      return index >= 0 ? extra.splice(index, 1)[0] : null;
    };
    const statements: InStatement[] = [];
    for (const post of posts) {
      const index = patterns.findIndex((pattern) => pattern.test(post.body));
      const p = post.product;
      const name = post.productName;
      let body: string | null = null;
      if (p && name && p.kind === "acc" && post.topic === "trung-bay") {
        body = (accessoryPosts.pop() ?? ACCESSORY_DISPLAY_POSTS[0]).replace("{p}", name);
      } else if (p && name && p.kind === "acc" && post.body.includes("sơn lại")) {
        body = ACCESSORY_PAINT_POST.replace("{p}", name);
      } else if (p && name && post.body.includes("biến hình") && !transforms(p)) {
        if (post.topic === "hoi-dap" && KIND_QUESTION_POSTS[p.kind]) {
          body = KIND_QUESTION_POSTS[p.kind]!.body.replace("{p}", name);
          answersFor.set(post.id, KIND_QUESTION_POSTS[p.kind]!.answers);
        } else if (post.topic === "chia-se") {
          body = NO_TRANSFORM_REVIEW_POSTS[p.kind === "kit" || p.kind === "acc" ? p.kind : "other"].replace("{p}", name);
        } else if (post.topic === "trung-bay") {
          body = takeExtra(p)?.replace("{p}", name) ?? null;
        }
      } else if (index >= 0 && seenTemplate.has(index) && p && name) {
        // Bài trưng bày trùng nội dung với bài trước (chỉ khác tên sản phẩm).
        body = takeExtra(p)?.replace("{p}", name) ?? null;
      }
      if (index >= 0) seenTemplate.add(index);
      if (body && body !== post.body) {
        post.body = body;
        statements.push({ sql: "UPDATE community_posts SET body = ? WHERE id = ?", args: [body, post.id] });
        count("Bài cộng đồng viết lại");
      }
    }
    const reported = new Set((await db.execute("SELECT comment_id FROM community_reports WHERE comment_id IS NOT NULL")).rows.map((row) => String(row.comment_id)));
    const spam = ["Thanh lý mô hình giá rẻ, ai cần inbox mình.", "Bên mình nhận order hàng giá sốc, xem trang cá nhân nhé.", "Tuyển cộng tác viên bán hàng online, thu nhập cao.", "Bán acc game giá rẻ, liên hệ mình."];
    for (const post of posts) {
      const comments = (
        await db.execute({
          sql: "SELECT c.id FROM community_comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? AND u.email LIKE ? ORDER BY c.created_at",
          args: [post.id, demo],
        })
      ).rows.map((row) => String(row.id));
      if (comments.length === 0) continue;
      const answers = answersFor.get(post.id) ?? QUESTION_POST_ANSWERS.find((item) => post.body.includes(item.starts))?.answers;
      // Bình luận nhắc tên sản phẩm ("Con X này mình cũng có, giữ dáng tốt") không hợp với phụ kiện.
      const nameable = post.productName !== null && post.product?.kind !== "acc";
      const base =
        post.topic === "hoi-dap"
          ? (answers ?? ["Mình cũng đang thắc mắc giống bạn.", "Hóng câu trả lời.", "Bạn hỏi thử shop qua chat xem, trả lời nhanh lắm."])
          : post.topic === "trung-bay"
            ? [
                ...DISPLAY_COMMENTS.filter((c) => nameable || !c.includes("{p}")),
                ...DISPLAY_KEYWORD_COMMENTS.filter((group) => group.keys.some((key) => post.body.toLowerCase().includes(key.toLowerCase()))).flatMap((group) => group.comments),
              ]
            : post.topic === "chia-se"
              ? SHARE_COMMENTS
              : SHOP_COMMENTS;
      const pool = r.shuffle(base).map((c) => c.replace("{p}", post.productName ?? ""));
      for (const [i, id] of comments.entries()) {
        const body = reported.has(id) ? r.pick(spam) : (pool[i] ?? r.pick(pool));
        statements.push({ sql: "UPDATE community_comments SET body = ? WHERE id = ?", args: [body, id] });
        count("Bình luận viết lại");
      }
    }
    for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
  }
  log(`Viết lại: ${summary["Đánh giá viết lại"] ?? 0} đánh giá, ${summary["Câu hỏi viết lại"] ?? 0} câu hỏi, ${summary["Bình luận viết lại"] ?? 0} bình luận.`);

  // ---------------------------------------------------------------------------------------------------------
  // 3a. Báo "đã chuyển khoản" cho các đơn chuyển khoản cũ: khách bấm nút giữa lúc đặt và lúc kế toán ghi nhận.
  if (!(await has("SELECT 1 FROM transfer_claims t JOIN orders o ON o.id = t.order_id WHERE o.customer_email LIKE ?", [demo]))) {
    const r = rngFor("claims");
    const rows = await db.execute({
      sql: `SELECT o.id, o.code, o.created_at,
                   (SELECT MIN(e.created_at) FROM order_events e WHERE e.order_id = o.id AND e.field = 'payment_status' AND e.to_value = 'paid')::bigint AS paid_at
            FROM orders o WHERE o.payment_method = 'bank' AND o.customer_email LIKE ?`,
      args: [demo],
    });
    const notes = ["Đã chuyển khoản, nội dung {code}", "Mình chuyển qua MB Bank rồi nhé", "Đã chuyển đủ, nhờ shop kiểm tra giúp", "Chuyển Vietcombank, nội dung ghi mã đơn {code}", "Đã chuyển lúc {time}", "Chuyển qua app ngân hàng rồi ạ"];
    const statements: InStatement[] = [];
    for (const row of rows.rows) {
      if (!row.paid_at || !r.chance(0.6)) continue;
      const created = Number(row.created_at);
      const paid = Number(row.paid_at);
      if (paid - created < 10 * 60_000) continue;
      const at = Math.round(created + (paid - created) * r.between(0.15, 0.8));
      const time = new Date(at - 2 * 60_000 + 7 * HOUR).toISOString().slice(11, 16);
      statements.push({ sql: "INSERT INTO transfer_claims (order_id, note, created_at) VALUES (?, ?, ?)", args: [String(row.id), r.pick(notes).replace("{code}", String(row.code)).replace("{time}", time), at] });
    }
    for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
    count("Báo chuyển khoản (đơn cũ)", statements.length);
  }

  // ---------------------------------------------------------------------------------------------------------
  // 3b. Đơn mới. Kế hoạch trước, rồi nhập bổ sung đúng số hàng các đơn này cần (ghi ngày trước đơn sớm nhất), rồi đặt và xử lý.
  const customers = (
    await db.execute({ sql: "SELECT id, name, phone, email, address, city, created_at FROM users WHERE role = 'customer' AND email LIKE ? ORDER BY created_at", args: [demo] })
  ).rows.map((row) => ({ id: String(row.id), name: String(row.name), phone: String(row.phone), email: String(row.email), address: String(row.address), city: String(row.city), createdAt: Number(row.created_at) }));
  const sold = new Map<string, number>();
  for (const row of (await db.execute({ sql: "SELECT oi.product_id, SUM(oi.quantity)::int AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.customer_email LIKE ? GROUP BY oi.product_id", args: [demo] })).rows) {
    sold.set(String(row.product_id), Number(row.n));
  }
  const popular = (p: Info) => (sold.get(p.id) ?? 0) + 2;
  const lastDemoOrder = Number((await db.execute({ sql: "SELECT MAX(created_at)::bigint AS t FROM orders WHERE customer_email LIKE ? AND COALESCE(idempotency_key, '') NOT LIKE 'demo3-%'", args: [demo] })).rows[0].t ?? now - 2 * DAY);
  const flash = await db.execute({
    sql: `SELECT fs.starts_at, fs.ends_at, fi.variant_id, fi.qty_limit, COALESCE(fi.max_per_order, 2) AS max_per_order FROM flash_sales fs
          JOIN flash_sale_items fi ON fi.sale_id = fs.id WHERE fs.is_active AND fs.starts_at < ? AND fs.ends_at > ?`,
    args: [now, lastDemoOrder],
  });
  const flashItems = flash.rows.map((row) => ({ variantId: String(row.variant_id), startsAt: Number(row.starts_at), endsAt: Number(row.ends_at), left: Number(row.qty_limit), max: Number(row.max_per_order) }));
  const combos = (
    await db.execute("SELECT d.id, d.name, d.created_at, string_agg(i.product_id, ',') AS members FROM bundle_deals d JOIN bundle_deal_items i ON i.deal_id = d.id WHERE d.is_active GROUP BY d.id, d.name, d.created_at ORDER BY d.created_at")
  ).rows.map((row) => ({ id: String(row.id), name: String(row.name), createdAt: Number(row.created_at), members: String(row.members).split(",") }));

  type Planned = {
    key: string;
    at: number;
    customer: (typeof customers)[number] | null;
    lines: { variantId: string; quantity: number; cfg: string }[];
    payment: "cod" | "bank";
    outcome: Outcome | "awaiting";
    claim: boolean;
    note: string;
    invoice: InvoiceInput | null;
    leadHours: number;
  };
  const plan: Planned[] = [];
  const pickCustomer = (r: R, at: number) => {
    const pool = customers.filter((c) => c.createdAt < at - DAY);
    return pool.length > 0 && r.chance(0.85) ? r.pick(pool) : null;
  };
  const decalText = (r: R, name: string | undefined) => {
    const first = foldText(name ?? "ROBOT").split(/\s+/).pop()!.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "ROBOT";
    return `${first} ${String(r.int(1, 99)).padStart(2, "0")}`;
  };
  const workshopCfg = (r: R, p: Info, customerName: string | undefined): string => {
    if (p.kind === "acc") return "";
    const selection: WorkshopSelection = {};
    if (p.kind === "kit") {
      if (r.chance(0.65)) selection.assembly = r.pick(["lap-rap", "lap-rap-ke-chi"]);
      if (r.chance(0.2)) selection.led = "mat-nguc";
    } else {
      if (r.chance(0.4)) {
        selection.paint = r.pick(["do-tham", "bang-lam", "bong-dem", "vang-solar"]);
        if (r.chance(0.5)) selection.finish = r.pick(["bong", "anh-kim"]);
      }
      if (r.chance(0.25)) selection.led = "mat-nguc";
    }
    if (r.chance(0.45)) selection.stand = r.pick(["luc-giac", "luc-giac-led"]);
    if (r.chance(0.15)) {
      selection.decal = "ten-rieng";
      selection.decalText = decalText(r, customerName);
    }
    if (r.chance(0.25)) selection.gift = "hop-qua";
    if (Object.keys(selection).length === 0) selection.stand = "luc-giac";
    const cfg = serializeConfig(selection);
    return parseConfig(cfg, p.category) ? cfg : "";
  };
  const invoiceFor = (r: R): InvoiceInput | null => {
    if (!r.chance(0.08)) return null;
    const company = r.pick(COMPANIES);
    return { ...company, invoiceEmail: `ketoan@${company.taxCode}.${DEMO_DOMAIN}` };
  };

  // Đơn có tuỳ chọn Xưởng, rải từ đầu tháng 9.
  {
    const r = rngFor("workshop");
    const from = Date.UTC(2026, 8, 1, 2);
    const to = Math.min(lastDemoOrder, now - 3 * DAY);
    for (let i = 0; i < 14; i++) {
      const at = Math.round(from + (to - from) * r.next());
      const customer = pickCustomer(r, at);
      const product = r.weighted(sellable.filter((p) => p.kind !== "acc"), popular);
      const cfg = workshopCfg(r, product, customer?.name);
      if (!cfg) continue;
      const leadDays = parseConfig(cfg, product.category)?.leadDays ?? 0;
      const payment = r.chance(0.55) ? "bank" : "cod";
      plan.push({ key: `demo3-workshop-${i}`, at, customer, lines: [{ variantId: product.variantId, quantity: 1, cfg }], payment, outcome: r.chance(0.9) ? "complete" : "customer_cancel", claim: false, note: r.chance(0.4) ? "Làm xưởng xong nhắn mình trước khi gửi nhé." : "", invoice: null, leadHours: leadDays * 24 * r.between(0.6, 1) });
    }
  }
  // Đơn mua đủ bộ combo (sau ngày tạo combo).
  {
    const r = rngFor("combos");
    let i = 0;
    for (const combo of combos) {
      const members = combo.members.map((id) => sellable.find((p) => p.id === id)).filter((p): p is Info => Boolean(p));
      if (members.length !== combo.members.length) continue;
      for (let k = r.int(1, 2); k > 0; k--) {
        const start = combo.createdAt + DAY;
        const end = Math.min(lastDemoOrder, now - 2 * DAY);
        if (end <= start) break;
        const at = Math.round(start + (end - start) * r.next());
        plan.push({ key: `demo3-combo-${i++}`, at, customer: pickCustomer(r, at), lines: members.map((p) => ({ variantId: p.variantId, quantity: 1, cfg: "" })), payment: r.chance(0.5) ? "bank" : "cod", outcome: "complete", claim: false, note: "", invoice: invoiceFor(r), leadHours: 0 });
      }
    }
  }
  // Đơn từ sau đơn mẫu cuối cùng tới nay: có flash sale đang chạy, đơn mới đặt chưa xử lý, đơn chờ chuyển khoản. Làm một
  // lần (số đơn tính theo khoảng tới lúc chạy, chạy lại muộn hơn sẽ ra kế hoạch khác).
  if (!(await has("SELECT 1 FROM orders WHERE idempotency_key LIKE 'demo3-recent-%'"))) {
    const r = rngFor("recent");
    const span = (now - lastDemoOrder) / DAY;
    const total = Math.max(3, r.poisson(3.4 * span));
    const flashLeft = new Map(flashItems.map((item) => [item.variantId, item.left]));
    for (let i = 0; i < total; i++) {
      const at = Math.round(lastDemoOrder + (now - 20 * 60_000 - lastDemoOrder) * Math.pow(r.next(), 0.9));
      const customer = pickCustomer(r, at);
      const lines: Planned["lines"] = [];
      const activeFlash = flashItems.filter((item) => item.startsAt < at && item.endsAt > at && (flashLeft.get(item.variantId) ?? 0) > 0);
      if (activeFlash.length > 0 && r.chance(0.6)) {
        const item = r.pick(activeFlash);
        const quantity = Math.min(item.max, flashLeft.get(item.variantId)!, r.chance(0.2) ? 2 : 1);
        flashLeft.set(item.variantId, flashLeft.get(item.variantId)! - quantity);
        lines.push({ variantId: item.variantId, quantity, cfg: "" });
      }
      if (lines.length === 0 || r.chance(0.3)) {
        const product = r.weighted(sellable.filter((p) => !lines.some((l) => l.variantId === p.variantId) && !flashItems.some((f) => f.variantId === p.variantId)), popular);
        lines.push({ variantId: product.variantId, quantity: 1, cfg: r.chance(0.12) ? workshopCfg(r, product, customer?.name) : "" });
      }
      const payment = r.chance(0.42) ? "bank" : "cod";
      const recent = now - at < 30 * HOUR;
      const outcome: Planned["outcome"] = payment === "bank" && recent && r.chance(0.35) ? "awaiting" : r.chance(0.05) ? "customer_cancel" : "complete";
      plan.push({ key: `demo3-recent-${i}`, at, customer, lines, payment, outcome, claim: outcome === "awaiting" && r.chance(0.5), note: r.chance(0.15) ? r.pick(ORDER_NOTES) : "", invoice: invoiceFor(r), leadHours: 0 });
    }
  }
  // Hai đơn chuyển khoản đặt vài giờ trước, khách chưa trả (một đơn đã bấm "Tôi đã chuyển khoản"): việc chờ kế toán đối soát.
  if (!(await has("SELECT 1 FROM orders WHERE idempotency_key LIKE 'demo3-await-%'"))) {
    const r = rngFor("awaiting");
    for (let i = 0; i < 2; i++) {
      const at = Math.round(now - r.between(2, 10) * HOUR);
      const customer = pickCustomer(r, at) ?? r.pick(customers);
      const product = r.weighted(sellable.filter((p) => !flashItems.some((f) => f.variantId === p.variantId)), popular);
      plan.push({ key: `demo3-await-${i}`, at, customer, lines: [{ variantId: product.variantId, quantity: 1, cfg: "" }], payment: "bank", outcome: "awaiting", claim: i === 1, note: "", invoice: null, leadHours: 0 });
    }
  }
  plan.sort((a, b) => a.at - b.at);
  const todo: Planned[] = [];
  for (const order of plan) if (!(await has("SELECT 1 FROM orders WHERE idempotency_key = ?", [order.key]))) todo.push(order);
  log(`Kế hoạch đơn mới: ${plan.length} đơn (${todo.length} chưa tạo).`);

  if (todo.length > 0) {
    // Nhập bổ sung đúng số hàng các đơn này cần (chỉ hàng có sẵn; hàng đặt trước không giữ tồn), ghi trước đơn sớm nhất.
    const need = new Map<string, number>();
    for (const order of todo) for (const line of order.lines) need.set(line.variantId, (need.get(line.variantId) ?? 0) + line.quantity);
    const storage = String((await db.execute("SELECT id FROM locations WHERE type = 'storage' AND is_active ORDER BY code LIMIT 1")).rows[0]?.id ?? "");
    const supplier = String((await db.execute("SELECT id FROM suppliers WHERE code = 'DEMO-NCC-01'")).rows[0]?.id ?? "") || null;
    const receiptAt = todo[0].at - 2 * DAY;
    const r = rngFor("receipt");
    setClock(receiptAt);
    const documentId = await createDocument("receipt", entry("warehouse", "stock_document.create", "stock_documents", "Tạo phiếu nhập"));
    await saveDraft(documentId, {
      supplierId: supplier,
      orderId: null,
      reasonCode: "",
      reference: "HĐ BS-0921",
      note: "Nhập bổ sung hàng cho đơn Xưởng, combo và đợt flash sale",
      expectedAt: null,
      lines: [...need.entries()].map(([variantId, qty]) => ({
        variantId,
        locationId: storage,
        toLocationId: null,
        qtyExpected: qty,
        qty,
        qtyQuarantined: null,
        systemQty: null,
        unitCost: Math.round(((byVariant.get(variantId)?.price ?? 0) * r.between(0.55, 0.68)) / 1000) * 1000,
        note: "",
      })),
    });
    setClock(receiptAt + 2 * HOUR);
    await changeDocumentStatus(documentId, "submit", entry("warehouse", "stock_document.submit", "stock_documents", "Gửi phiếu nhập chờ ghi sổ"));
    setClock(receiptAt + 4 * HOUR);
    const posted = await postDocument(documentId, entry("warehouse_manager", "stock_document.post", "stock_documents", "Ghi sổ phiếu nhập"));
    if (!posted.ok) throw new Error(`Không ghi sổ được phiếu nhập bổ sung: ${posted.reason}`);
    count("Phiếu nhập bổ sung");
  }

  const reviewQueue: { orderId: string; userId: string; doneAt: number; city: string; days: number }[] = [];
  {
    const r = rngFor("orders");
    for (const [index, order] of todo.entries()) {
      setClock(order.at);
      const buyer = order.customer ?? (() => {
        const person = randomPerson(r);
        return { name: person.full, phone: phone(r), email: `khach.${r.int(10000, 99999)}@${DEMO_DOMAIN}`, ...address(r) };
      })();
      const prices = new Map((await findCartProducts(order.lines.map((l) => l.variantId), order.at)).map((v) => [v.id, v.price]));
      const draft: OrderDraft = {
        userId: order.customer?.id ?? null,
        paymentMethod: order.payment,
        customerName: buyer.name,
        customerPhone: buyer.phone,
        customerEmail: buyer.email,
        shippingAddress: buyer.address,
        shippingCity: buyer.city,
        note: order.note,
        idempotencyKey: order.key,
        invoice: order.invoice ?? undefined,
        items: order.lines.map((line) => {
          const product = byVariant.get(line.variantId)!;
          return { variantId: line.variantId, quantity: line.quantity, cfg: line.cfg, expectedPrice: (prices.get(line.variantId) ?? product.price) + (parseConfig(line.cfg, product.category)?.price ?? 0) };
        }),
      };
      const result = await createOrder(draft);
      if (!result.ok) {
        count("Đơn mới không tạo được");
        log(`Bỏ qua ${order.key}: ${result.reason}${"issues" in result ? ` ${JSON.stringify(result.issues)}` : ""}`);
        continue;
      }
      count("Đơn mới");
      const { id: orderId, code } = result.order;
      if (order.outcome === "awaiting") {
        if (order.claim) {
          const claimAt = Math.round(Math.min(now - 60_000, order.at + r.between(5, 60) * 60_000));
          await db.execute({ sql: "INSERT INTO transfer_claims (order_id, note, created_at) VALUES (?, ?, ?)", args: [orderId, `Đã chuyển khoản, nội dung ${code}`, claimAt] });
          count("Báo chuyển khoản (đơn mới)");
        }
        count("Đơn chờ chuyển khoản");
        continue;
      }
      const steps = orderSteps(r, { payment: order.payment, outcome: order.outcome, city: buyer.city, leadHours: order.leadHours }, code);
      let t = order.at;
      let finished = true;
      let deliveredAt = 0;
      for (const step of steps) {
        t += step.after;
        if (t >= now - 5 * 60_000) {
          finished = false;
          break;
        }
        setClock(t);
        const ok = await applyOrderAction(orderId, step.key, step.who ? entry(step.who, `order.${step.key}`, "orders", `${step.label}: đơn ${code}`) : undefined, { tracking: step.tracking, reference: step.reference });
        if (!ok) {
          count("Bước đơn bị từ chối");
          log(`Đơn ${code}: bước ${step.key} không áp dụng được.`);
          finished = false;
          break;
        }
        if (step.key === "delivered") deliveredAt = t;
      }
      if (order.invoice && finished && order.outcome === "complete") {
        const issueAt = t + r.between(4, 30) * HOUR;
        if (issueAt < now) {
          setClock(issueAt);
          if ((await issueInvoice(orderId, entry("accountant", "invoice.issue", "order_invoices", `Xuất hoá đơn đơn ${code}`), Math.round(issueAt))).ok) count("Hoá đơn đơn mới");
        }
      }
      if (finished && order.outcome === "complete" && order.customer) {
        reviewQueue.push({ orderId, userId: order.customer.id, doneAt: t, city: buyer.city, days: Math.max(1, Math.round(((deliveredAt || t) - order.at) / DAY)) });
      }
      if ((index + 1) % 10 === 0) log(`  ${index + 1}/${todo.length} đơn mới...`);
    }
  }

  // Đánh giá cho đơn mới đã hoàn tất (nhắc tới tuỳ chọn Xưởng nếu có).
  {
    const r = rngFor("new-reviews");
    const used = new Set((await db.execute("SELECT comment FROM reviews WHERE comment <> ''")).rows.map((row) => String(row.comment)));
    for (const done of reviewQueue) {
      const items = await db.execute({ sql: "SELECT id, product_id, options_config FROM order_items WHERE order_id = ? ORDER BY id", args: [done.orderId] });
      for (const item of items.rows) {
        if (!r.chance(0.6)) continue;
        const at = done.doneAt + r.between(1, 10) * DAY;
        if (at >= now) continue;
        const product = byProduct.get(String(item.product_id));
        if (!product) continue;
        const rating = r.weighted([5, 4, 3, 2, 1], (s) => ({ 5: 64, 4: 25, 3: 7, 2: 3, 1: 1 })[s]!);
        const config = parseConfig(String(item.options_config ?? ""), product.category);
        setClock(at);
        const comment = writeReview(r, product, rating, { days: done.days, city: done.city, workshop: config && config.lines.length > 0 ? config.selection : null }, used);
        if ((await submitReview(done.userId, Number(item.id), rating, comment)) !== "ok") continue;
        count("Đánh giá đơn mới");
        const moderatedAt = at + r.between(1, 24) * HOUR;
        if (moderatedAt >= now) continue;
        const reviewId = String((await db.execute({ sql: "SELECT id FROM reviews WHERE order_item_id = ?", args: [Number(item.id)] })).rows[0].id);
        setClock(moderatedAt);
        await setReviewStatus(reviewId, "approved", entry("support", "review.approve", "reviews", "Duyệt đánh giá"));
      }
    }
  }
  log(`Đơn mới: ${summary["Đơn mới"] ?? 0}, đánh giá mới: ${summary["Đánh giá đơn mới"] ?? 0}.`);

  // ---------------------------------------------------------------------------------------------------------
  // 4a. Tin tức khớp với flash sale, combo đã có và hai bài hướng dẫn.
  {
    const r = rngFor("news");
    const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
    const publish = async (title: string, summaryText: string, body: string, publishAt: number, cover: string | null) => {
      const slug = slugify(title).slice(0, 80).replace(/-+$/, "");
      if (publishAt >= now || (await has("SELECT 1 FROM news_posts WHERE slug = ?", [slug]))) return;
      setClock(publishAt - r.between(3, 20) * HOUR);
      const id = await saveNews(null, { slug, title, summary: summaryText, body, coverImage: cover }, entry("marketing", "news.create", "news_posts", `Viết bài tin tức ${title}`));
      if (!id) return;
      setClock(publishAt);
      await setNewsStatus(id, "published", entry("marketing", "news.publish", "news_posts", `Xuất bản bài tin tức ${title}`));
      count("Tin tức mới");
    };
    const sales = await db.execute(
      `SELECT fs.id, fs.title, fs.starts_at, fs.ends_at, fi.sale_price, v.price, p.name, COALESCE(v.image, p.image) AS image
       FROM flash_sales fs JOIN flash_sale_items fi ON fi.sale_id = fs.id JOIN product_variants v ON v.id = fi.variant_id JOIN products p ON p.id = v.product_id
       WHERE fs.is_active ORDER BY fs.starts_at, fi.sale_price DESC`,
    );
    const bySale = new Map<string, typeof sales.rows>();
    for (const row of sales.rows) bySale.set(String(row.id), [...(bySale.get(String(row.id)) ?? []), row]);
    for (const items of bySale.values()) {
      const first = items[0];
      const startsAt = Number(first.starts_at);
      const endsAt = Number(first.ends_at);
      const maxPct = Math.max(...items.map((row) => Math.round((1 - Number(row.sale_price) / Number(row.price)) * 100)));
      const fmt = (ms: number) => {
        const d = new Date(ms + 7 * HOUR);
        return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} ngày ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      };
      const list = items.map((row) => `• ${row.name}: ${vnd(Number(row.sale_price))} (giá thường ${vnd(Number(row.price))})`).join("\n");
      const upcoming = startsAt > now;
      await publish(
        upcoming ? `${first.title}: ${items.length} mẫu giảm đến ${maxPct}%, mở lúc ${fmt(startsAt)}` : `${first.title}: giảm đến ${maxPct}% cho ${items.length} mẫu robot`,
        `Từ ${fmt(startsAt)} đến ${fmt(endsAt)}, ${items.length} mẫu giảm đến ${maxPct}%. Số suất có hạn, mỗi đơn tối đa 2 sản phẩm mỗi mẫu.`,
        `${upcoming ? "Đặt lịch nhắc ngay" : "Flash sale đã mở"}: từ ${fmt(startsAt)} đến ${fmt(endsAt)}, các mẫu dưới đây giảm giá trực tiếp, không cần nhập mã.\n\n${list}\n\nMỗi mẫu có số suất giới hạn, mỗi đơn tối đa 2 sản phẩm của một mẫu. Giá sale được tính đúng thời điểm bạn đặt hàng; hết suất hoặc hết giờ thì trở về giá thường.`,
        upcoming ? now - r.between(2, 8) * HOUR : startsAt + HOUR,
        String(first.image ?? "") || null,
      );
    }
    const comboRows = await db.execute(
      "SELECT d.name, d.percent, d.created_at, string_agg(p.name, ', ' ORDER BY p.name) AS members, MIN(p.image) AS image FROM bundle_deals d JOIN bundle_deal_items i ON i.deal_id = d.id JOIN products p ON p.id = i.product_id WHERE d.is_active GROUP BY d.id, d.name, d.percent, d.created_at ORDER BY d.created_at",
    );
    if (comboRows.rows.length > 0) {
      const maxPercent = Math.max(...comboRows.rows.map((row) => Number(row.percent)));
      const list = comboRows.rows.map((row) => `• ${row.name} (giảm ${row.percent}%): ${row.members}`).join("\n");
      await publish(
        `Ra mắt Combo đồng đội: mua đủ bộ giảm đến ${maxPercent}%`,
        `Mua đủ các mẫu trong một combo, giỏ hàng tự giảm thêm đến ${maxPercent}%. Hiện có ${comboRows.rows.length} combo.`,
        `Combo đồng đội gom các mẫu cùng một bộ phim hoặc một đội. Khi giỏ hàng có đủ các mẫu của combo, phần giảm được tính tự động, không cần nhập mã.\n\nCác combo hiện có:\n${list}\n\nTrên trang sản phẩm, mục Combo cho biết mẫu đó thuộc combo nào và còn thiếu mẫu nào để được giảm.`,
        Number(comboRows.rows[0].created_at) + DAY,
        String(comboRows.rows[0].image ?? "") || null,
      );
    }
    const kits = sellable.filter((p) => p.kind === "kit");
    const tfs = sellable.filter((p) => p.kind === "tf");
    const examples = (pool: Info[], test: (p: Info) => boolean) => {
      const names = pool.filter(test).slice(0, 3).map((p) => p.name);
      return names.length > 0 ? ` Ví dụ tại cửa hàng: ${names.join(", ")}.` : "";
    };
    const year = new Date(now + 7 * HOUR).getUTCFullYear();
    for (const guide of GUIDE_POSTS) {
      const body = guide.body
        .replace("{hg}", examples(kits, (p) => valuesOf(p).grade === "HG"))
        .replace("{rg}", examples(kits, (p) => valuesOf(p).grade === "RG"))
        .replace("{mg}", examples(kits, (p) => valuesOf(p).grade === "MG"))
        .replace("{deluxe}", examples(tfs, (p) => valuesOf(p).klass === "Deluxe Class"))
        .replace("{voyager}", examples(tfs, (p) => valuesOf(p).klass === "Voyager Class"))
        .replace("{leader}", examples(tfs, (p) => valuesOf(p).klass === "Leader Class"));
      const [mm, dd] = guide.date.split("-").map(Number);
      const cover = (guide.title.includes("Gunpla") ? kits : tfs)[0]?.image ?? null;
      await publish(guide.title, guide.summary, body, Date.UTC(year, mm - 1, dd, 2, r.int(0, 50)), cover);
    }
  }

  // 4b. Bài cộng đồng và câu hỏi mới gần đây, còn chờ duyệt / chờ trả lời. Làm một lần: sản phẩm được chọn theo lượt bán
  // nên chạy lại sẽ chọn khác; nhận ra đã làm qua bài chia sẻ không gắn sản phẩm (nội dung cố định).
  const sharePending = PENDING_POSTS.find((post) => !post.product)!.body;
  if (!(await has("SELECT 1 FROM community_posts WHERE body = ?", [sharePending]))) {
    const r = rngFor("pending");
    for (const template of PENDING_POSTS) {
      // Bài nhắc dạng biến hình chỉ gắn với mẫu có dạng biến hình.
      const product = template.product ? r.weighted(sellable.filter((p) => p.kind === "tf" && (!template.body.includes("{alt}") || valuesOf(p).alt)), popular) : null;
      const body = template.body.replace("{p}", product?.name ?? "").replace("{alt}", product ? (valuesOf(product).alt ?? "") : "");
      if (await has("SELECT 1 FROM community_posts WHERE body = ?", [body])) continue;
      const author = r.pick(customers.filter((c) => c.createdAt < now - 7 * DAY));
      setClock(now - r.between(0.5, 9) * HOUR);
      await createPost(author.id, { id: newId(), topic: template.topic, body, productSlug: product?.slug ?? null }, template.topic === "trung-bay" && product?.image ? [product.image] : []);
      count("Bài cộng đồng chờ duyệt");
    }
    for (let i = 0; i < 4; i++) {
      const product = r.pick(sellable);
      const values = valuesOf(product);
      const template = r.pick(QA[product.kind].filter((t) => fill(t.q, values)));
      if (!template) continue;
      const body = fill(template.q, values)!;
      if (await has("SELECT 1 FROM product_questions WHERE product_id = ? AND body = ?", [product.id, body])) continue;
      const asker = r.pick(customers.filter((c) => c.createdAt < now - 3 * DAY));
      setClock(now - r.between(0.3, 12) * HOUR);
      if ((await askQuestion(asker.id, product.id, body)) === "ok") count("Câu hỏi chờ trả lời");
    }
  }

  setClock(now);
  summary["Lệch sổ kho"] = (await findInventoryDiscrepancies()).length;
  return summary;
}
