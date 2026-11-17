// Phần dữ liệu mẫu thứ hai, chạy sau seed-demo.ts (dùng lại khách, nhân viên, đơn mẫu): thanh thông báo, flash sale,
// combo, hỏi đáp, chat, trả hàng (đủ luồng), khách chờ hàng, hoá đơn, báo cáo vi phạm, xu và gacha, sản phẩm đã xem.
// Như seed-demo.ts: mọi việc đi qua hàm của cửa hàng, thời điểm đặt bằng `setClock`. Chạy: DEMO_PART=extras npm run demo-data.

import { suggestedRefund, type ReturnReason } from "@/lib/returns";
import { COMIC_CHAPTERS } from "@/data/comics";
import { CHECKIN_REWARD, COMIC_READ_REWARD, orderCoins } from "@/lib/quests";
import { getDb, type InValue } from "@/server/db";
import { newToken, sha256 } from "@/server/ids";
import type { AuditEntry } from "@/server/repo/audit";
import { saveDeal } from "@/server/repo/bundles";
import { postCustomerMessage, postStaffMessage, setThreadStatus } from "@/server/repo/chat";
import { creditStatement } from "@/server/repo/coins";
import { reportContent } from "@/server/repo/community";
import { saveSetting } from "@/server/repo/content";
import { saveFlashItem, saveFlashSale } from "@/server/repo/flash-sales";
import { pull } from "@/server/repo/gacha";
import { findInventoryDiscrepancies } from "@/server/repo/inventory";
import { invoiceRequestStatement, issueInvoice } from "@/server/repo/invoices";
import { findOrderById } from "@/server/repo/orders";
import { answerAsBuyer, answerAsStaff, askQuestion, setAnswerStatus } from "@/server/repo/questions";
import { recordViews } from "@/server/repo/recently-viewed";
import { createReturnDocument, createReturnRequest, decideReturnRequest, recordReturnRefund } from "@/server/repo/returns";
import { postDocument } from "@/server/repo/stock-documents";
import { createStockAlert } from "@/server/repo/stock-alerts";
import { DEMO_DOMAIN } from "./content";
import { CHATS, COMPANIES, QUESTIONS, RETURN_NOTES } from "./content-extras";

export type ExtrasOptions = { now: number; scale: number; setClock: (ms: number) => void; log: (message: string) => void; seed?: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (min: number, max: number) => min + (max - min) * next();
  const int = (min: number, max: number) => Math.floor(between(min, max + 1));
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const chance = (p: number) => next() < p;
  const shuffle = <T>(items: readonly T[]) => items.map((item) => ({ item, key: next() })).sort((a, b) => a.key - b.key).map((x) => x.item);
  return { next, between, int, pick, chance, shuffle };
}

const STAFF_ROLES = ["order_staff", "warehouse_manager", "warehouse", "accountant", "support", "marketing"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

export async function seedExtras(options: ExtrasOptions): Promise<Record<string, number>> {
  const { now, scale, log } = options;
  const setClock = (ms: number) => options.setClock(Math.round(Math.min(ms, now - 60_000)));
  const r = rng(options.seed ?? 20261112);
  const db = await getDb();
  const summary: Record<string, number> = {};
  const count = (key: string, n = 1) => (summary[key] = (summary[key] ?? 0) + n);
  const demo = `%@${DEMO_DOMAIN}`;

  const staff = {} as Record<StaffRole, { id: string; role: string }>;
  for (const role of STAFF_ROLES) {
    const row = (await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [`${role.replace("_", ".")}@${DEMO_DOMAIN}`] })).rows[0];
    if (!row) throw new Error("Chưa có dữ liệu mẫu phần một (npm run demo-data).");
    staff[role] = { id: String(row.id), role };
  }
  // Mỗi mục kiểm tra riêng đã có dữ liệu mẫu chưa: chạy lại sau khi bị dừng giữa chừng chỉ làm các mục còn thiếu.
  const has = async (sql: string, args: InValue[] = []) => Boolean((await db.execute({ sql: `SELECT EXISTS (${sql}) AS x`, args })).rows[0].x);
  const skipped: string[] = [];
  const phase = async (name: string, doneSql: string, args: InValue[] = []) => {
    const done = await has(doneSql, args);
    if (done) skipped.push(name);
    return !done;
  };
  const entry = (who: StaffRole, action: string, entity: string, text: string): AuditEntry => ({ actor: staff[who], action, entity, summary: text });

  const customers = (await db.execute({ sql: "SELECT id, name, email, created_at FROM users WHERE role = 'customer' AND email LIKE ? ORDER BY created_at", args: [demo] })).rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    createdAt: Number(row.created_at),
  }));
  const products = (
    await db.execute(
      `SELECT p.id, p.slug, p.name, p.series_id, v.id AS variant_id, v.price FROM products p
       JOIN product_variants v ON v.product_id = p.id AND v.is_active
       WHERE p.status = 'published' AND NOT EXISTS (SELECT 1 FROM preorder_offers po WHERE po.variant_id = v.id AND po.status <> 'ended')
       ORDER BY p.slug`,
    )
  ).rows.map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name), seriesId: row.series_id === null ? null : String(row.series_id), variantId: String(row.variant_id), price: Number(row.price) }));
  // Đơn mẫu đã hoàn tất của khách có tài khoản, kèm mốc giao thành công.
  const completed = (
    await db.execute({
      sql: `SELECT o.id, o.user_id, o.total, o.code,
                   (SELECT MAX(e.created_at) FROM order_events e WHERE e.order_id = o.id AND e.field = 'shipping_status' AND e.to_value = 'delivered')::bigint AS delivered_at,
                   (SELECT MAX(e.created_at) FROM order_events e WHERE e.order_id = o.id)::bigint AS done_at
            FROM orders o WHERE o.status = 'completed' AND o.user_id IS NOT NULL AND o.customer_email LIKE ? ORDER BY o.created_at`,
      args: [demo],
    })
  ).rows.map((row) => ({ id: String(row.id), userId: String(row.user_id), total: Number(row.total), code: String(row.code), deliveredAt: Number(row.delivered_at ?? 0), doneAt: Number(row.done_at ?? 0) }));
  log(`${customers.length} khách, ${products.length} biến thể, ${completed.length} đơn hoàn tất.`);

  // ---------------------------------------------------------------------------------------------------------
  // Thanh thông báo (đúng chính sách trong src/config/site.ts).
  if (await phase("Thanh thông báo", "SELECT 1 FROM site_settings WHERE key = 'announcement'")) {
    setClock(now - 3 * DAY);
    await saveSetting(
      "announcement",
      { enabled: true, text: "Miễn phí vận chuyển cho đơn từ 1.000.000đ · Đổi trả trong 7 ngày · Flash sale giữa tháng đang diễn ra", linkUrl: "/san-pham", startsAt: null, endsAt: null },
      entry("marketing", "settings.update", "site_settings", "Sửa thanh thông báo"),
    );
    count("Thanh thông báo");
  }

  // ---------------------------------------------------------------------------------------------------------
  // Flash sale: một đợt đang chạy (hết hạn sau 4 ngày), một đợt 12/12 sắp tới.
  const flashPool = r.shuffle(products.filter((p) => p.price >= 500_000));
  const sales = [
    { title: "Flash sale giữa tháng 11", startsAt: now - DAY, endsAt: now + 4 * DAY, items: flashPool.slice(0, 6) },
    { title: "Siêu sale 12.12", startsAt: Date.UTC(2026, 11, 11, 17), endsAt: Date.UTC(2026, 11, 12, 17), items: flashPool.slice(6, 14) },
  ];
  for (const sale of sales) {
    if (!(await phase(`Flash sale ${sale.title}`, "SELECT 1 FROM flash_sales WHERE title = ?", [sale.title]))) continue;
    setClock(Math.min(sale.startsAt, now) - 2 * DAY);
    const saved = await saveFlashSale(null, { title: sale.title, startsAt: sale.startsAt, endsAt: sale.endsAt, isActive: true }, entry("marketing", "flash_sale.create", "flash_sales", `Tạo flash sale ${sale.title}`));
    if (!saved.ok) continue;
    count("Flash sale");
    for (const item of sale.items) {
      const salePrice = Math.round((item.price * (1 - r.pick([0.1, 0.12, 0.15, 0.18, 0.2]))) / 10_000) * 10_000;
      const result = await saveFlashItem(saved.id, { variantId: item.variantId, salePrice, qtyLimit: r.int(4, 12), maxPerOrder: 2 }, entry("marketing", "flash_sale.item", "flash_sales", `Thêm ${item.name} vào ${sale.title}`));
      if (result === "ok") count("Dòng flash sale");
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // Combo theo series: mua đủ các mẫu cùng series được giảm thêm.
  const bySeries = new Map<string, typeof products>();
  for (const p of products) if (p.seriesId) bySeries.set(p.seriesId, [...(bySeries.get(p.seriesId) ?? []), p]);
  const seriesNames = new Map((await db.execute("SELECT id, name FROM series")).rows.map((row) => [String(row.id), String(row.name)]));
  const groups = (await phase("Combo", "SELECT 1 FROM bundle_deals WHERE created_by = ?", [staff.marketing.id]))
    ? r.shuffle([...bySeries.entries()].filter(([, items]) => new Set(items.map((i) => i.id)).size >= 2)).slice(0, 5)
    : [];
  for (const [seriesId, items] of groups) {
    const ids = [...new Set(items.map((i) => i.id))].slice(0, r.int(2, 3));
    setClock(now - r.between(5, 40) * DAY);
    const id = await saveDeal(null, { name: `Combo ${seriesNames.get(seriesId) ?? "đồng đội"}`, percent: r.pick([5, 8, 10, 12]), isActive: true, productIds: ids }, entry("marketing", "bundle.create", "bundle_deals", "Tạo combo"));
    if (id && id !== "products") count("Combo");
  }

  // ---------------------------------------------------------------------------------------------------------
  // Hỏi đáp: khách hỏi, nhân viên trả lời sau vài giờ; khách đã mua trả lời thêm, được duyệt.
  const buyersOf = new Map<string, Set<string>>();
  for (const row of (await db.execute({ sql: "SELECT DISTINCT oi.product_id, o.user_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'completed' AND o.customer_email LIKE ? AND o.user_id IS NOT NULL", args: [demo] })).rows) {
    const set = buyersOf.get(String(row.product_id)) ?? new Set<string>();
    set.add(String(row.user_id));
    buyersOf.set(String(row.product_id), set);
  }
  const askedBefore = !(await phase("Hỏi đáp", "SELECT 1 FROM product_questions q JOIN users u ON u.id = q.user_id WHERE u.email LIKE ?", [demo]));
  const questionCount = askedBefore ? 0 : Math.round(45 * scale);
  for (let i = 0; i < questionCount; i++) {
    const template = QUESTIONS[i % QUESTIONS.length];
    const product = r.pick(products);
    const at = now - r.between(1, 150) * DAY;
    const pool = customers.filter((c) => c.createdAt < at);
    if (pool.length === 0) continue;
    const asker = r.pick(pool);
    setClock(at);
    if ((await askQuestion(asker.id, product.id, template.q.replace("{p}", product.name))) !== "ok") continue;
    count("Câu hỏi");
    const questionId = String((await db.execute({ sql: "SELECT id FROM product_questions WHERE user_id = ? AND product_id = ? ORDER BY created_at DESC LIMIT 1", args: [asker.id, product.id] })).rows[0].id);
    // Câu hỏi gần đây có thể còn chờ trả lời.
    const answerAt = at + r.between(0.5, 20) * HOUR;
    if (answerAt >= now || r.chance(0.08)) continue;
    setClock(answerAt);
    await answerAsStaff(questionId, template.staff.replace("{p}", product.name), entry("support", "question.answer", "product_questions", "Trả lời câu hỏi sản phẩm"));
    count("Trả lời của cửa hàng");
    const buyers = [...(buyersOf.get(product.id) ?? [])].filter((id) => id !== asker.id);
    if (template.buyer && buyers.length > 0 && r.chance(0.7)) {
      const buyerAt = answerAt + r.between(2, 72) * HOUR;
      if (buyerAt >= now) continue;
      setClock(buyerAt);
      const buyer = r.pick(buyers);
      if ((await answerAsBuyer(buyer, questionId, template.buyer)) === "ok") {
        count("Trả lời của người đã mua");
        const answerId = String((await db.execute({ sql: "SELECT id FROM product_answers WHERE question_id = ? AND user_id = ?", args: [questionId, buyer] })).rows[0].id);
        setClock(buyerAt + r.between(1, 10) * HOUR);
        await setAnswerStatus(answerId, "approved", entry("support", "answer.approve", "product_answers", "Duyệt câu trả lời"));
      }
    }
  }
  log(`Hỏi đáp: ${summary["Câu hỏi"] ?? 0} câu hỏi.`);

  // ---------------------------------------------------------------------------------------------------------
  // Chat hỗ trợ: khách có tài khoản và vài khách vãng lai; cuộc cũ đã đóng, vài cuộc mới còn chờ trả lời.
  const chattedBefore = !(await phase("Chat", "SELECT 1 FROM chat_threads t JOIN users u ON u.id = t.user_id WHERE u.email LIKE ?", [demo]));
  const chatCount = chattedBefore ? 0 : Math.round(30 * scale);
  for (let i = 0; i < chatCount; i++) {
    const script = CHATS[i % CHATS.length];
    const product = r.pick(products);
    const at = now - r.between(0.05, 60) * DAY;
    const pool = customers.filter((c) => c.createdAt < at);
    const owner = r.chance(0.8) && pool.length > 0 ? (() => { const c = r.pick(pool); return { userId: c.id, name: c.name }; })() : { visitorHash: sha256(newToken(16)) };
    let t = at;
    let threadId = "";
    let lastStaff = false;
    for (const [index, raw] of script.entries()) {
      const body = raw.replace("{p}", product.name);
      if (t >= now - 60_000) break;
      setClock(t);
      if (index % 2 === 0) {
        threadId = await postCustomerMessage(owner, body, Math.round(t));
        lastStaff = false;
      } else {
        await postStaffMessage(threadId, staff.support.id, body, Math.round(t));
        lastStaff = true;
      }
      if (index === 0) count("Cuộc chat");
      count("Tin nhắn chat");
      t += index % 2 === 0 ? r.between(2, 40) * 60_000 : r.between(1, 30) * 60_000;
    }
    if (threadId && lastStaff && at < now - 2 * DAY) await setThreadStatus(threadId, "closed");
  }
  log(`Chat: ${summary["Cuộc chat"] ?? 0} cuộc.`);

  // ---------------------------------------------------------------------------------------------------------
  // Trả hàng: vài đơn đã giao gửi yêu cầu trong hạn 7 ngày; phần lớn được duyệt → phiếu hàng trả → hoàn tiền, một yêu cầu bị từ chối.
  const reasons = Object.keys(RETURN_NOTES) as ReturnReason[];
  const returnedBefore = !(await phase("Trả hàng", "SELECT 1 FROM return_requests rr JOIN orders o ON o.id = rr.order_id WHERE o.customer_email LIKE ?", [demo]));
  const returnTargets = returnedBefore ? [] : r.shuffle(completed.filter((o) => o.deliveredAt > 0 && o.deliveredAt < now - 3 * DAY)).slice(0, Math.max(2, Math.round(8 * scale)));
  for (const [index, target] of returnTargets.entries()) {
    const order = await findOrderById(target.id);
    if (!order || order.items.length === 0) continue;
    const line = order.items[0];
    const picks = new Map([[line.lineId, 1]]);
    const reason = reasons[index % reasons.length];
    const at = target.deliveredAt + r.between(0.5, 5) * DAY;
    setClock(at);
    const request = await createReturnRequest({
      order,
      reason,
      note: r.pick(RETURN_NOTES[reason]),
      refundAccount: `Vietcombank ${String(r.int(1e9, 9e9))} - ${order.customerName}`,
      refundAmount: suggestedRefund(order, picks),
      picks,
      images: [],
    });
    if (!request) continue;
    count("Yêu cầu trả hàng");
    const decideAt = at + r.between(2, 20) * HOUR;
    if (decideAt >= now) continue;
    setClock(decideAt);
    if (index === 1) {
      await decideReturnRequest(request.id, { approve: false, staffNote: "Đã quá hạn đổi ý và hàng đã bóc seal, cửa hàng không nhận lại." }, entry("order_staff", "return.reject", "return_requests", `Từ chối ${request.code}`));
      count("Trả hàng bị từ chối");
      continue;
    }
    await decideReturnRequest(request.id, { approve: true, amount: suggestedRefund(order, picks), staffNote: "Đồng ý nhận lại, khách gửi hàng qua đơn vị vận chuyển." }, entry("order_staff", "return.approve", "return_requests", `Duyệt ${request.code}`));
    const docAt = decideAt + r.between(24, 72) * HOUR;
    if (docAt >= now) continue;
    setClock(docAt);
    const doc = await createReturnDocument(request.id, entry("warehouse", "stock_document.create", "stock_documents", `Lập phiếu hàng trả cho ${request.code}`));
    if (!doc.ok) continue;
    setClock(docAt + 2 * HOUR);
    const posted = await postDocument(doc.documentId, entry("warehouse_manager", "stock_document.post", "stock_documents", "Ghi sổ phiếu hàng trả"));
    if (!posted.ok) continue;
    const refundAt = docAt + r.between(4, 30) * HOUR;
    if (refundAt >= now) continue;
    setClock(refundAt);
    const refunded = await recordReturnRefund(request.id, `FT${r.int(26000, 26999)}${String(r.int(0, 99_999_999)).padStart(8, "0")}`, entry("accountant", "return.refund", "return_requests", `Hoàn tiền ${request.code}`));
    if (refunded.ok) count("Trả hàng đã hoàn tiền");
  }

  // ---------------------------------------------------------------------------------------------------------
  // Khách chờ hàng: đăng ký báo khi có hàng cho các mẫu sắp hết.
  const lowStock = (await db.execute("SELECT variant_id FROM inventory ORDER BY (on_hand - reserved), variant_id LIMIT 10")).rows.map((row) => String(row.variant_id));
  const alertsBefore = !(await phase("Khách chờ hàng", "SELECT 1 FROM stock_alerts a JOIN users u ON u.id = a.user_id WHERE u.email LIKE ?", [demo]));
  for (let i = 0; i < (alertsBefore ? 0 : Math.round(25 * scale)); i++) {
    const c = r.pick(customers);
    setClock(now - r.between(0.2, 25) * DAY);
    const result = await createStockAlert({ variantId: r.pick(lowStock), contact: { contact: c.email, kind: "email" }, userId: c.id });
    if (result === "created") count("Khách chờ hàng");
  }

  // ---------------------------------------------------------------------------------------------------------
  // Hoá đơn công ty cho một số đơn đã thanh toán; kế toán cấp số sau 1–2 ngày.
  const invoicedBefore = !(await phase("Hoá đơn", "SELECT 1 FROM order_invoices i JOIN orders o ON o.id = i.order_id WHERE o.customer_email LIKE ?", [demo]));
  for (const target of invoicedBefore ? [] : r.shuffle(completed).slice(0, Math.round(14 * scale))) {
    const company = r.pick(COMPANIES);
    const at = target.doneAt + r.between(0.1, 2) * DAY;
    if (at >= now) continue;
    setClock(at);
    try {
      await db.execute(invoiceRequestStatement(target.id, { ...company, invoiceEmail: `ketoan@${company.taxCode}.${DEMO_DOMAIN}` }, Math.round(at)));
    } catch {
      continue;
    }
    count("Yêu cầu hoá đơn");
    const issueAt = at + r.between(4, 40) * HOUR;
    if (issueAt >= now) continue;
    setClock(issueAt);
    if ((await issueInvoice(target.id, entry("accountant", "invoice.issue", "order_invoices", `Xuất hoá đơn đơn ${target.code}`), Math.round(issueAt))).ok) count("Hoá đơn đã xuất");
  }

  // ---------------------------------------------------------------------------------------------------------
  // Báo cáo vi phạm ở cộng đồng (bình luận rao bán, spam): chờ người kiểm duyệt.
  const comments = (await db.execute({ sql: "SELECT c.id, c.created_at FROM community_comments c JOIN users u ON u.id = c.user_id WHERE u.email LIKE ? ORDER BY c.created_at DESC LIMIT 40", args: [demo] })).rows;
  const reportedBefore = !(await phase("Báo cáo vi phạm", "SELECT 1 FROM community_reports cr JOIN users u ON u.id = cr.user_id WHERE u.email LIKE ?", [demo]));
  for (const row of reportedBefore ? [] : r.shuffle(comments).slice(0, Math.round(4 * scale) || 1)) {
    setClock(Number(row.created_at) + r.between(1, 48) * HOUR);
    if ((await reportContent(r.pick(customers).id, { commentId: String(row.id) }, "spam")) === "ok") count("Báo cáo vi phạm");
  }

  // ---------------------------------------------------------------------------------------------------------
  // Xu: thưởng đơn hoàn tất (khách tự bấm nhận sau vài ngày), điểm danh, đọc truyện; rồi tiêu xu quay gacha.
  const ledger = [];
  const coinsBefore = !(await phase("Xu", "SELECT 1 FROM coin_ledger l JOIN users u ON u.id = l.user_id WHERE u.email LIKE ? AND l.reason IN ('order', 'checkin', 'comic')", [demo]));
  for (const order of coinsBefore ? [] : completed) {
    if (!r.chance(0.75) || orderCoins(order.total) <= 0) continue;
    const at = Math.round(Math.min(now - HOUR, order.doneAt + r.between(0.2, 6) * DAY));
    setClock(at);
    ledger.push(creditStatement(order.userId, orderCoins(order.total), "order", order.id, `Đơn ${order.code}`));
  }
  const active = coinsBefore ? [] : r.shuffle(customers).slice(0, Math.round(customers.length * 0.6));
  for (const c of active) {
    const streakStart = now - r.int(3, 40) * DAY;
    for (let day = streakStart; day < now - HOUR; day += DAY * (r.chance(0.75) ? 1 : r.int(2, 4))) {
      if (day < c.createdAt) continue;
      const key = new Date(day + 7 * HOUR).toISOString().slice(0, 10);
      setClock(day);
      ledger.push(creditStatement(c.id, CHECKIN_REWARD, "checkin", key, "Điểm danh"));
    }
    for (const chapter of COMIC_CHAPTERS) {
      if (!r.chance(0.5)) continue;
      const at = Math.round(Math.max(c.createdAt, now - r.between(1, 60) * DAY));
      ledger.push({ sql: "INSERT INTO comic_reads (user_id, chapter, read_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", args: [c.id, chapter.slug, at] });
      setClock(at + 60_000);
      ledger.push(creditStatement(c.id, COMIC_READ_REWARD, "comic", chapter.slug, `Đọc ${chapter.title}`));
    }
  }
  for (let i = 0; i < ledger.length; i += 150) await db.batch(ledger.slice(i, i + 150));
  if (ledger.length > 0) count("Dòng sổ xu", ledger.length);
  const pulledBefore = !(await phase("Gacha", "SELECT 1 FROM gacha_pulls g JOIN users u ON u.id = g.user_id WHERE u.email LIKE ?", [demo]));
  const balances = await db.execute({ sql: "SELECT l.user_id, SUM(l.amount)::int AS n FROM coin_ledger l JOIN users u ON u.id = l.user_id WHERE u.email LIKE ? GROUP BY l.user_id", args: [demo] });
  const random = (n: number) => Math.floor(r.next() * n);
  for (const row of pulledBefore ? [] : balances.rows) {
    let balance = Number(row.n);
    let t = now - r.between(1, 20) * DAY;
    for (let k = 0; k < 6 && balance >= 100 && r.chance(0.7); k++) {
      const mode = balance >= 900 && r.chance(0.3) ? "ten" : balance >= 450 && r.chance(0.4) ? "pack" : "single";
      setClock(t);
      const outcome = await pull(String(row.user_id), mode, random);
      if (!outcome.ok) break;
      balance -= mode === "ten" ? 900 : mode === "pack" ? 450 : 100;
      count("Lượt quay gacha");
      t += r.between(0.1, 3) * DAY;
      if (t >= now) break;
    }
  }
  log(`Xu và gacha: ${summary["Lượt quay gacha"] ?? 0} lượt quay.`);

  // ---------------------------------------------------------------------------------------------------------
  // Sản phẩm đã xem gần đây.
  const viewedBefore = !(await phase("Đã xem", "SELECT 1 FROM recently_viewed rv JOIN users u ON u.id = rv.user_id WHERE u.email LIKE ?", [demo]));
  for (const c of viewedBefore ? [] : r.shuffle(customers).slice(0, Math.round(customers.length * 0.7))) {
    const slugs = r.shuffle(products).slice(0, r.int(2, 8)).map((p) => p.slug);
    await recordViews(c.id, [...new Set(slugs)], Math.round(now - r.between(0.1, 20) * DAY));
    count("Khách có lịch sử xem");
  }

  if (skipped.length > 0) log(`Bỏ qua (đã có từ lần chạy trước): ${skipped.join(", ")}.`);
  setClock(now);
  summary["Lệch sổ kho"] = (await findInventoryDiscrepancies()).length;
  return summary;
}
