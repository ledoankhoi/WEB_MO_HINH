// Sinh dữ liệu mẫu cho cửa hàng: khách, nhà cung cấp, phiếu nhập, đơn hàng (đủ vòng đời), đánh giá, yêu thích,
// bài cộng đồng, tin tức. Mọi thao tác đi qua đúng hàm của cửa hàng (createOrder, applyOrderAction, phiếu kho,
// submitReview, createPost, saveNews...) nên sổ kho, thanh toán, lịch sử đơn, nhật ký quản trị khớp nhau như dữ liệu
// thật. Thời điểm của từng việc đặt bằng `setClock` (đồng hồ giả của Vitest) để rải đều trong `days` ngày trước `now`.
//
// Nhận ra dữ liệu mẫu: email khách và nhân viên mẫu, email trên đơn của khách vãng lai đều thuộc DEMO_DOMAIN; mã nhà
// cung cấp bắt đầu bằng DEMO-NCC. Chạy: npm run demo-data (scripts/demo-data.mjs).

import { slugify } from "@/lib/format";
import type { Role } from "@/lib/permissions";
import { hashPassword } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { newId, newToken } from "@/server/ids";
import type { AuditEntry } from "@/server/repo/audit";
import { addComment, createPost, moderatePost } from "@/server/repo/community";
import { findInventoryDiscrepancies } from "@/server/repo/inventory";
import { saveNews, setNewsStatus } from "@/server/repo/news";
import { applyOrderAction, createOrder, type OrderDraft } from "@/server/repo/orders";
import type { OrderActionKey } from "@/lib/order-flow";
import { setReviewStatus, submitReview } from "@/server/repo/reviews";
import { changeDocumentStatus, createDocument, postDocument, saveDraft } from "@/server/repo/stock-documents";
import {
  CARRIERS,
  CITIES,
  COMMENTS,
  COMMUNITY_POSTS,
  DEMO_DOMAIN,
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  LAST_NAMES,
  MIDDLE_NAMES_F,
  MIDDLE_NAMES_M,
  NEWS_POSTS,
  ORDER_NOTES,
  REVIEW_TEXTS,
  SUPPLIERS,
} from "./content";

export type SeedOptions = {
  now: number;
  days: number;
  // 1 = khoảng 150 khách, 400 đơn. Test dùng số nhỏ.
  scale: number;
  setClock: (ms: number) => void;
  log: (message: string) => void;
  seed?: number;
  // Chạy tiếp sau một lần bị dừng giữa chừng (scripts/demo-data.mjs với DEMO_RESUME=1).
  resume?: boolean;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VN = 7 * HOUR;

// ---------------------------------------------------------------------------------------------------------
// Số ngẫu nhiên có hạt giống: chạy lại cho cùng kế hoạch.

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
  const weighted = <T>(items: readonly T[], weight: (item: T) => number) => {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let r = next() * total;
    for (const item of items) {
      r -= weight(item);
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  };
  const normal = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
  const poisson = (lambda: number) => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = next();
    while (p > limit) {
      k++;
      p *= next();
    }
    return k;
  };
  return { next, between, int, pick, chance, weighted, normal, poisson };
}

// Ngày giờ Việt Nam của một mốc (để chọn giờ trong ngày, nhận ngày lễ).
const vnDate = (ms: number) => new Date(ms + VN);
const vnKey = (ms: number) => vnDate(ms).toISOString().slice(5, 10);

// Ngày khuyến mãi, lễ: số đơn nhân lên.
const PEAKS: Record<string, number> = {
  "06-01": 2.2,
  "06-06": 1.8,
  "07-07": 1.8,
  "08-08": 1.8,
  "08-31": 1.8,
  "09-01": 2.4,
  "09-02": 2.6,
  "09-03": 1.8,
  "09-09": 2,
  "10-09": 1.8,
  "10-10": 3.6,
  "10-11": 1.8,
  "10-18": 1.8,
  "10-19": 2.2,
  "10-20": 2.4,
  "10-21": 1.6,
};

// Giờ đặt hàng trong ngày (giờ Việt Nam): rải từ 7h tới 23h, cao nhất buổi tối.
const HOUR_WEIGHTS = [0, 0, 0, 0, 0, 0, 0.2, 0.5, 1, 1.4, 1.6, 1.6, 1.8, 1.4, 1.3, 1.3, 1.4, 1.6, 1.9, 2.3, 2.8, 3, 2.4, 1.2];

type Product = { variantId: string; productId: string; price: number; name: string; slug: string; image: string | null; category: string; weight: number };
type Customer = { id: string; name: string; phone: string; email: string; address: string; city: string; createdAt: number; loyalty: number };
type Staff = Record<"admin" | "order_staff" | "warehouse_manager" | "warehouse" | "accountant" | "support" | "marketing", { id: string; role: string }>;

type Outcome = "complete" | "customer_cancel" | "unpaid_cancel" | "shop_cancel" | "fail_return" | "fail_redeliver";
type PlannedOrder = {
  at: number;
  customer: Customer | null;
  guest: { name: string; phone: string; email: string; address: string; city: string } | null;
  lines: { product: Product; quantity: number }[];
  payment: "cod" | "bank";
  coupon: string | null;
  note: string;
  outcome: Outcome;
};

export type SeedSummary = Record<string, number>;

export async function seedDemo(options: SeedOptions): Promise<SeedSummary> {
  const { now, days, scale, log } = options;
  const setClock = (ms: number) => options.setClock(Math.round(ms));
  const r = rng(options.seed ?? 20261108);
  const db = await getDb();
  const start = now - days * DAY;
  const summary: SeedSummary = {};
  const count = (key: string, n = 1) => (summary[key] = (summary[key] ?? 0) + n);

  const resume = options.resume ?? false;
  const existing = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM users WHERE email LIKE ?", args: [`%@${DEMO_DOMAIN}`] });
  if (!resume && Number(existing.rows[0].n) > 0) throw new Error(`CSDL đã có dữ liệu mẫu (email @${DEMO_DOMAIN}). Không chạy lần hai.`);
  if (resume && Number(existing.rows[0].n) === 0) throw new Error("Chưa có dữ liệu mẫu để chạy tiếp.");
  // Chạy tiếp: chỉ sinh đơn sau đơn mẫu cuối cùng; khách, nhân viên, nhà cung cấp dùng lại.
  const resumeFrom = resume
    ? Number((await db.execute({ sql: "SELECT COALESCE(MAX(created_at), 0)::bigint AS t FROM orders WHERE customer_email LIKE ?", args: [`%@${DEMO_DOMAIN}`] })).rows[0].t)
    : 0;

  // ---------------------------------------------------------------------------------------------------------
  // Sản phẩm đang bán (mỗi biến thể đang bật, không đặt trước).
  const productRows = await db.execute(
    `SELECT v.id AS variant_id, p.id AS product_id, v.price, p.name, p.slug, COALESCE(v.image, p.image) AS image, c.slug AS category
     FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
     WHERE p.status = 'published' AND v.is_active
       AND NOT EXISTS (SELECT 1 FROM preorder_offers po WHERE po.variant_id = v.id AND po.status <> 'ended')
     ORDER BY p.slug, v.id`,
  );
  const products: Product[] = productRows.rows.map((row) => {
    const price = Number(row.price);
    // Mẫu rẻ bán chạy hơn; mỗi mẫu thêm độ "hot" ngẫu nhiên.
    const weight = Math.exp(0.8 * r.normal()) / Math.pow(price / 1_500_000, 0.6);
    return { variantId: String(row.variant_id), productId: String(row.product_id), price, name: String(row.name), slug: String(row.slug), image: row.image === null ? null : String(row.image), category: String(row.category), weight };
  });
  if (products.length === 0) throw new Error("Không có sản phẩm đang bán.");
  const storage = String((await db.execute("SELECT id FROM locations WHERE type = 'storage' AND is_active ORDER BY code LIMIT 1")).rows[0]?.id ?? "");
  if (!storage) throw new Error("Không có vị trí kho.");
  const adminRow = (await db.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1")).rows[0];
  log(`${products.length} biến thể đang bán.`);

  // Mật khẩu ngẫu nhiên không ai biết: tài khoản mẫu không dùng để đăng nhập.
  const passwordHash = await hashPassword(newToken(24));

  // ---------------------------------------------------------------------------------------------------------
  // Nhân viên mẫu (ký tên trên phiếu kho, xử lý đơn, duyệt bài).
  const staffNames: Record<Exclude<keyof Staff, "admin">, string> = {
    order_staff: "Nguyễn Thảo Vy",
    warehouse_manager: "Trần Quốc Hưng",
    warehouse: "Lê Minh Tài",
    accountant: "Phạm Ngọc Hân",
    support: "Đỗ Khánh Linh",
    marketing: "Võ Gia Bảo",
  };
  const staff = {} as Staff;
  const staffInserts = [];
  for (const [role, name] of Object.entries(staffNames) as [Exclude<keyof Staff, "admin">, string][]) {
    const email = `${role.replace("_", ".")}@${DEMO_DOMAIN}`;
    if (resume) {
      const row = (await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] })).rows[0];
      if (!row) throw new Error(`Thiếu nhân viên mẫu ${email}`);
      staff[role] = { id: String(row.id), role };
      continue;
    }
    const id = newId();
    staff[role] = { id, role };
    staffInserts.push({
      sql: "INSERT INTO users (id, email, name, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [id, email, name, phone(r), passwordHash, role as Role, start - 30 * DAY],
    });
  }
  if (staffInserts.length > 0) await db.batch(staffInserts);
  staff.admin = adminRow ? { id: String(adminRow.id), role: "admin" } : staff.order_staff;
  count("Nhân viên mẫu", staffInserts.length);
  const entry = (who: keyof Staff, action: string, entity: string, summary: string, detail?: Record<string, unknown>): AuditEntry => ({ actor: staff[who], action, entity, summary, detail });

  // ---------------------------------------------------------------------------------------------------------
  // Khách hàng (có sổ địa chỉ), tạo dần trong khoảng [start - 90 ngày, now - 1 ngày].
  const customers: Customer[] = [];
  const emails = new Set<string>();
  const customerCount = resume ? 0 : Math.max(8, Math.round(150 * scale));
  if (resume) {
    const rows = await db.execute({ sql: "SELECT id, name, phone, email, address, city, created_at FROM users WHERE role = 'customer' AND email LIKE ? ORDER BY created_at", args: [`%@${DEMO_DOMAIN}`] });
    for (const row of rows.rows) {
      customers.push({ id: String(row.id), name: String(row.name), phone: String(row.phone), email: String(row.email), address: String(row.address), city: String(row.city), createdAt: Number(row.created_at), loyalty: Math.exp(r.normal()) });
    }
  }
  for (let i = 0; i < customerCount; i++) {
    const person = randomPerson(r);
    let email = "";
    do email = `${slugify(person.first).replace(/-/g, "")}.${slugify(person.last).replace(/-/g, "")}${r.int(1, 9999)}@${DEMO_DOMAIN}`;
    while (emails.has(email));
    emails.add(email);
    const span = now - DAY - (start - 90 * DAY);
    customers.push({ id: newId(), name: person.full, phone: phone(r), email, ...address(r), createdAt: Math.round(start - 90 * DAY + span * Math.pow(r.next(), 0.85)), loyalty: Math.exp(r.normal()) });
  }
  customers.sort((a, b) => a.createdAt - b.createdAt);
  for (let i = 0; i < customers.length && !resume; i += 40) {
    await db.batch(
      customers.slice(i, i + 40).flatMap((c) => [
        {
          sql: `INSERT INTO users (id, email, name, phone, address, city, password_hash, role, created_at, marketing_consent, marketing_consent_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'customer', ?, ?, ?)`,
          args: [c.id, c.email, c.name, c.phone, c.address, c.city, passwordHash, c.createdAt, ...(r.chance(0.4) ? [true, c.createdAt] : [false, null])],
        },
        {
          sql: `INSERT INTO customer_addresses (id, user_id, label, recipient_name, phone, address, city, is_default, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, true, ?, ?)`,
          args: [newId(), c.id, r.chance(0.8) ? "home" : "office", c.name, c.phone, c.address, c.city, c.createdAt, c.createdAt],
        },
      ]),
    );
  }
  count("Khách hàng", customers.length);
  log(`Đã tạo ${customers.length} khách, ${staffInserts.length} nhân viên mẫu.`);

  // ---------------------------------------------------------------------------------------------------------
  // Nhà cung cấp, mã giảm giá của các đợt khuyến mãi.
  const suppliers: string[] = [];
  if (resume) {
    for (const s of SUPPLIERS) suppliers.push(String((await db.execute({ sql: "SELECT id FROM suppliers WHERE code = ?", args: [s.code] })).rows[0]?.id ?? ""));
  }
  if (!resume) await db.batch(
    SUPPLIERS.map((s) => {
      const id = newId();
      suppliers.push(id);
      return {
        sql: "INSERT INTO suppliers (id, code, name, contact_name, phone, email, address, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [id, s.code, s.name, s.contact, s.phone, s.email, s.address, s.note, start - 20 * DAY],
      };
    }),
  );
  count("Nhà cung cấp", suppliers.length);
  const COUPONS = [
    { code: "ROBOT10", kind: "percent", value: 10, max: 200_000, min: 1_000_000 },
    { code: "CHAOBAN50", kind: "fixed", value: 50_000, max: null, min: 500_000 },
  ];
  for (const c of resume ? [] : COUPONS) {
    const added = await db.execute({
      sql: `INSERT INTO coupons (id, code, kind, value, max_discount, min_subtotal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (code) DO NOTHING`,
      args: [newId(), c.code, c.kind, c.value, c.max, c.min, start - 5 * DAY, start - 5 * DAY],
    });
    count("Mã giảm giá", added.rowsAffected);
  }

  // ---------------------------------------------------------------------------------------------------------
  // Kế hoạch đơn hàng.
  const plan: PlannedOrder[] = [];
  for (let d = 0; d < days; d++) {
    const dayStart = start + d * DAY;
    const progress = d / days;
    const weekday = vnDate(dayStart).getUTCDay();
    const lambda = (1.1 + 1.9 * progress) * (weekday === 0 || weekday === 6 ? 1.25 : 1) * (PEAKS[vnKey(dayStart + 12 * HOUR)] ?? 1) * scale * 1.05;
    for (let k = r.poisson(lambda); k > 0; k--) {
      const midnight = dayStart - ((dayStart + VN) % DAY);
      const hour = r.weighted(HOUR_WEIGHTS.map((_, h) => h), (h) => HOUR_WEIGHTS[h]);
      const at = midnight + hour * HOUR + r.int(0, 59) * 60_000 + r.int(0, 59) * 1000;
      if (at >= now - 10 * 60_000 || at < start) continue;
      const planned = planOrder(r, at, products, customers, now);
      if (at > resumeFrom + 60_000) plan.push(planned);
    }
  }
  plan.sort((a, b) => a.at - b.at);
  log(`Kế hoạch: ${plan.length} đơn trong ${days} ngày.`);

  // ---------------------------------------------------------------------------------------------------------
  // Phiếu nhập: đầu mỗi tháng nhập đủ hàng cho đơn của tháng đó (cộng dư một ít), chia theo nhà cung cấp.
  const monthOf = (ms: number) => vnDate(ms).toISOString().slice(0, 7);
  const demand = new Map<string, Map<string, number>>();
  for (const order of plan) {
    const month = demand.get(monthOf(order.at)) ?? new Map<string, number>();
    for (const line of order.lines) month.set(line.product.variantId, (month.get(line.product.variantId) ?? 0) + line.quantity);
    demand.set(monthOf(order.at), month);
  }
  const byVariant = new Map(products.map((p) => [p.variantId, p]));
  if (resume) {
    // Chạy tiếp: các phiếu nhập tháng sau đã ghi sổ ở lần trước; chỉ nhập bù phần còn thiếu, một đợt trước đơn đầu tiên.
    const available = new Map<string, number>();
    for (const row of (await db.execute("SELECT variant_id, (on_hand - reserved)::int AS n FROM inventory")).rows) available.set(String(row.variant_id), Number(row.n));
    const total = new Map<string, number>();
    for (const lines of demand.values()) for (const [variantId, qty] of lines) total.set(variantId, (total.get(variantId) ?? 0) + qty);
    const shortfall = new Map<string, number>();
    for (const [variantId, qty] of total) if (qty > (available.get(variantId) ?? 0)) shortfall.set(variantId, qty - (available.get(variantId) ?? 0));
    demand.clear();
    if (shortfall.size > 0 && plan.length > 0) demand.set(`bu:${plan[0].at}`, shortfall);
  }
  let receiptIndex = Number(
    (await db.execute("SELECT COUNT(*)::int AS n FROM stock_documents d JOIN suppliers s ON s.id = d.supplier_id WHERE s.code LIKE 'DEMO-NCC%'")).rows[0]?.n ?? 0,
  );
  for (const [month, lines] of [...demand.entries()].sort()) {
    const topUp = month.startsWith("bu:");
    const [y, m] = topUp ? [vnDate(Number(month.slice(3))).getUTCFullYear(), vnDate(Number(month.slice(3))).getUTCMonth() + 1] : month.split("-").map(Number);
    const monthStart = topUp ? Number(month.slice(3)) - DAY + 2 * DAY : Date.UTC(y, m - 1, 1, 8 - 7);
    const receiptAt = Math.max(monthStart, start - 3 * DAY);
    const groups = new Map<number, [string, number][]>();
    for (const [variantId, qty] of lines) {
      const group = hash(variantId) % 3;
      groups.set(group, [...(groups.get(group) ?? []), [variantId, qty]]);
    }
    for (const [group, items] of groups) {
      const at = receiptAt - 2 * DAY + group * 3 * HOUR;
      setClock(at);
      const supplierIndex = group;
      const id = await createDocument("receipt", entry("warehouse", "stock_document.create", "stock_documents", "Tạo phiếu nhập"));
      await saveDraft(id, {
        supplierId: suppliers[supplierIndex],
        orderId: null,
        reasonCode: "",
        reference: `HĐ ${String(1000 + ++receiptIndex * 7).padStart(7, "0")}`,
        note: `Nhập hàng tháng ${m}/${y}`,
        expectedAt: null,
        lines: items.map(([variantId, qty]) => {
          const product = byVariant.get(variantId)!;
          const total = qty + r.int(1, 4);
          return {
            variantId,
            locationId: storage,
            toLocationId: null,
            qtyExpected: total,
            qty: total,
            qtyQuarantined: null,
            systemQty: null,
            unitCost: Math.round((product.price * r.between(0.55, 0.68)) / 1000) * 1000,
            note: "",
          };
        }),
      });
      setClock(at + 2 * HOUR);
      await changeDocumentStatus(id, "submit", entry("warehouse", "stock_document.submit", "stock_documents", "Gửi phiếu nhập chờ ghi sổ"));
      setClock(at + 5 * HOUR);
      const posted = await postDocument(id, entry("warehouse_manager", "stock_document.post", "stock_documents", "Ghi sổ phiếu nhập"));
      if (!posted.ok) throw new Error(`Không ghi sổ được phiếu nhập: ${posted.reason} ${posted.message ?? ""}`);
      count("Phiếu nhập");
    }
  }
  log(`Đã ghi sổ ${summary["Phiếu nhập"] ?? 0} phiếu nhập.`);

  // ---------------------------------------------------------------------------------------------------------
  // Đơn hàng: đặt rồi chạy từng bước theo luật L2–L14, dừng ở bước chưa tới giờ (đơn gần đây còn đang xử lý).
  const completed: { orderId: string; userId: string; doneAt: number }[] = [];
  if (resume) {
    // Đơn hoàn tất của lần chạy trước (để viết đánh giá, chọn tác giả bài cộng đồng); mốc hoàn tất = sự kiện cuối của đơn.
    const rows = await db.execute({
      sql: `SELECT o.id, o.user_id, (SELECT MAX(e.created_at) FROM order_events e WHERE e.order_id = o.id)::bigint AS done_at
            FROM orders o WHERE o.status = 'completed' AND o.user_id IS NOT NULL AND o.customer_email LIKE ?
              AND NOT EXISTS (SELECT 1 FROM reviews rv JOIN order_items oi ON oi.id = rv.order_item_id WHERE oi.order_id = o.id)`,
      args: [`%@${DEMO_DOMAIN}`],
    });
    for (const row of rows.rows) completed.push({ orderId: String(row.id), userId: String(row.user_id), doneAt: Number(row.done_at ?? 0) });
  }
  const statusCounts = new Map<string, number>();
  for (const [index, order] of plan.entries()) {
    setClock(order.at);
    const buyer = order.customer ?? order.guest!;
    const draft: OrderDraft = {
      userId: order.customer?.id ?? null,
      paymentMethod: order.payment,
      customerName: buyer.name,
      customerPhone: buyer.phone,
      customerEmail: buyer.email,
      shippingAddress: buyer.address,
      shippingCity: buyer.city,
      note: order.note,
      idempotencyKey: null,
      couponCode: order.coupon ?? undefined,
      items: order.lines.map((line) => ({ variantId: line.product.variantId, quantity: line.quantity, expectedPrice: line.product.price, cfg: "" })),
    };
    let result = await createOrder(draft);
    if (!result.ok && result.reason === "coupon") result = await createOrder({ ...draft, couponCode: undefined });
    if (!result.ok) {
      count("Đơn không tạo được");
      log(`Bỏ qua một đơn: ${result.reason}`);
      continue;
    }
    const orderId = result.order.id;
    const code = (await db.execute({ sql: "SELECT code FROM orders WHERE id = ?", args: [orderId] })).rows[0].code as string;
    count("Đơn hàng");

    const steps = orderSteps(r, order, code);
    let t = order.at;
    let finished = true;
    for (const step of steps) {
      t += step.after;
      if (t >= now - 5 * 60_000) {
        finished = false;
        break;
      }
      setClock(t);
      const ok = await applyOrderAction(
        orderId,
        step.key,
        step.who ? entry(step.who, `order.${step.key}`, "orders", `${step.label}: đơn ${code}`) : undefined,
        { tracking: step.tracking, reference: step.reference },
      );
      if (!ok) {
        count("Bước đơn bị từ chối");
        log(`Đơn ${code}: bước ${step.key} không áp dụng được.`);
        finished = false;
        break;
      }
    }
    if (finished && order.outcome !== "customer_cancel" && order.outcome !== "unpaid_cancel" && order.outcome !== "shop_cancel" && order.outcome !== "fail_return" && order.customer) {
      completed.push({ orderId, userId: order.customer.id, doneAt: t });
    }
    if ((index + 1) % 25 === 0) log(`  ${index + 1}/${plan.length} đơn...`);
  }
  for (const row of (await db.execute({ sql: "SELECT status, COUNT(*)::int AS n FROM orders WHERE customer_email LIKE ? GROUP BY status", args: [`%@${DEMO_DOMAIN}`] })).rows) {
    statusCounts.set(String(row.status), Number(row.n));
  }
  for (const [status, n] of statusCounts) summary[`Đơn ${status}`] = n;
  log(`Đã tạo ${summary["Đơn hàng"] ?? 0} đơn.`);

  // ---------------------------------------------------------------------------------------------------------
  // Đánh giá: khoảng một nửa dòng của đơn đã hoàn tất, viết sau khi nhận 1–14 ngày; nhân viên duyệt sau vài giờ.
  for (const done of completed) {
    const items = await db.execute({ sql: "SELECT id, product_name FROM order_items WHERE order_id = ? ORDER BY id", args: [done.orderId] });
    for (const item of items.rows) {
      if (!r.chance(0.5)) continue;
      const at = done.doneAt + r.between(1, 14) * DAY;
      if (at >= now) continue;
      const rating = r.weighted([5, 4, 3, 2, 1], (s) => ({ 5: 62, 4: 25, 3: 8, 2: 3, 1: 2 })[s]!);
      setClock(at);
      const comment = r.chance(0.12) ? "" : r.pick(REVIEW_TEXTS[rating]).replace("{p}", String(item.product_name));
      if ((await submitReview(done.userId, Number(item.id), rating, comment)) !== "ok") continue;
      count("Đánh giá");
      const reviewId = String((await db.execute({ sql: "SELECT id FROM reviews WHERE order_item_id = ?", args: [Number(item.id)] })).rows[0].id);
      const moderatedAt = at + r.between(1, 30) * HOUR;
      if (moderatedAt >= now) continue;
      setClock(moderatedAt);
      await setReviewStatus(reviewId, "approved", entry("support", "review.approve", "reviews", "Duyệt đánh giá"));
    }
  }
  log(`Đã tạo ${summary["Đánh giá"] ?? 0} đánh giá.`);

  // ---------------------------------------------------------------------------------------------------------
  // Yêu thích.
  const wishlist = [];
  for (const c of customers) {
    if (!r.chance(0.55)) continue;
    const picked = new Set<string>();
    for (let i = r.int(1, 6); i > 0; i--) picked.add(r.weighted(products, (p) => p.weight).productId);
    for (const productId of picked) {
      wishlist.push({ sql: "INSERT INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", args: [c.id, productId, Math.round(Math.min(now - HOUR, c.createdAt + r.between(0, 40) * DAY))] });
    }
  }
  for (let i = 0; i < wishlist.length; i += 100) await db.batch(wishlist.slice(i, i + 100));
  count("Yêu thích", wishlist.length);

  // ---------------------------------------------------------------------------------------------------------
  // Cộng đồng: mỗi mẫu bài dùng một lần, bài trưng bày dùng thêm vài lần với sản phẩm khác.
  const buyers = [...new Set(completed.map((c) => c.userId))];
  const postTemplates = COMMUNITY_POSTS.flatMap((p) => (p.topic === "trung-bay" ? [p, p, p] : [p]));
  const postCount = Math.min(postTemplates.length, Math.max(4, Math.round(postTemplates.length * Math.min(1, scale * 1.2))));
  const posts = postTemplates
    .slice(0, postCount)
    .map((template) => ({ template, at: start + days * DAY * Math.pow(r.next(), 0.7) }))
    .sort((a, b) => a.at - b.at);
  for (const { template, at } of posts) {
    if (at >= now - 2 * HOUR) continue;
    const pool = customers.filter((c) => c.createdAt < at);
    const authorPool = pool.filter((c) => buyers.includes(c.id));
    const author = r.pick(authorPool.length > 0 ? authorPool : pool.length > 0 ? pool : customers);
    const product = template.product ? r.weighted(products, (p) => p.weight) : null;
    const body = template.body.replace("{p}", product?.name ?? "");
    const image = template.image ? (product ?? r.pick(products)).image : null;
    setClock(at);
    const postId = await createPost(author.id, { id: newId(), topic: template.topic, body, productSlug: product?.slug ?? null }, image ? [image] : []);
    count("Bài cộng đồng");
    const approvedAt = at + r.between(0.5, 10) * HOUR;
    if (approvedAt >= now) continue;
    setClock(approvedAt);
    await moderatePost(postId, "approved", "", entry("support", "community.approve", "community_posts", "Duyệt bài cộng đồng"));
    const others = customers.filter((c) => c.id !== author.id && c.createdAt < approvedAt);
    let commentAt = approvedAt;
    for (let i = r.int(0, 6); i > 0 && others.length > 0; i--) {
      commentAt += r.between(0.3, 30) * HOUR;
      if (commentAt >= now) break;
      setClock(commentAt);
      if (await addComment(r.pick(others).id, postId, r.pick(COMMENTS))) count("Bình luận");
    }
    const likers = new Set<string>();
    for (let i = Math.round(Math.exp(r.between(0, 3.4))); i > 0 && others.length > 0; i--) likers.add(r.pick(others).id);
    const likes = [...likers].map((userId) => ({
      sql: "INSERT INTO community_likes (post_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
      args: [postId, userId, Math.round(Math.min(now - 60_000, approvedAt + r.between(0.1, 72) * HOUR))],
    }));
    if (likes.length > 0) await db.batch(likes);
    count("Lượt thích", likes.length);
  }
  log(`Đã tạo ${summary["Bài cộng đồng"] ?? 0} bài cộng đồng.`);

  // ---------------------------------------------------------------------------------------------------------
  // Tin tức: ngày đăng rải theo nội dung (đợt hàng, ngày khuyến mãi); bài nào chưa tới ngày thì bỏ.
  const NEWS_DATES = ["05-15", "06-03", "06-20", "08-28", "07-20", "07-12", "07-04", "08-10", "10-08", "09-25", "10-16", "10-25", "09-15", "11-02", "10-30", "11-05"];
  const year = vnDate(now).getUTCFullYear();
  const sold = new Map<string, number>();
  for (const row of (await db.execute(
    `SELECT oi.product_id, SUM(oi.quantity)::int AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'cancelled' GROUP BY oi.product_id ORDER BY n DESC`,
  )).rows) sold.set(String(row.product_id), Number(row.n));
  const topSellers = [...products].sort((a, b) => (sold.get(b.productId) ?? 0) - (sold.get(a.productId) ?? 0));
  const usedSlugs = new Set<string>();
  for (const [i, post] of NEWS_POSTS.entries()) {
    const [mm, dd] = (NEWS_DATES[i] ?? "11-01").split("-").map(Number);
    const publishAt = Date.UTC(year, mm - 1, dd, 8 - 7, r.int(0, 50));
    if (publishAt < start - 10 * DAY || publishAt >= now) continue;
    const themed = /Gundam/.test(post.title) ? products.filter((p) => /gundam|zaku|gouf|dom|sazabi|zeta|wing/i.test(p.slug)) : /Sentai/.test(post.title) ? products.filter((p) => p.category.includes("sentai")) : [];
    const pool = /Top 5/.test(post.title) ? topSellers.slice(0, 3) : themed.length >= 2 ? themed : products;
    const featured = /Top 5/.test(post.title) ? pool : [r.pick(pool), r.pick(pool), r.pick(pool)];
    const fill = (text: string) => text.replace("{p1}", featured[0].name).replace("{p2}", featured[1].name).replace("{p3}", featured[2].name);
    let slug = slugify(post.title).slice(0, 80).replace(/-+$/, "");
    while (usedSlugs.has(slug)) slug = `${slug.slice(0, 76)}-${r.int(10, 99)}`;
    usedSlugs.add(slug);
    const taken = await db.execute({ sql: "SELECT 1 FROM news_posts WHERE slug = ?", args: [slug] });
    if (taken.rows.length > 0) continue;
    setClock(publishAt - r.between(4, 30) * HOUR);
    const id = await saveNews(
      null,
      { slug, title: post.title, summary: fill(post.summary), body: fill(post.body), coverImage: featured[0].image },
      entry("marketing", "news.create", "news_posts", `Viết bài tin tức ${post.title}`),
    );
    if (!id) continue;
    setClock(publishAt);
    await setNewsStatus(id, "published", entry("marketing", "news.publish", "news_posts", `Xuất bản bài tin tức ${post.title}`));
    count("Tin tức");
  }
  log(`Đã đăng ${summary["Tin tức"] ?? 0} bài tin tức.`);

  setClock(now);
  const issues = await findInventoryDiscrepancies();
  summary["Lệch sổ kho"] = issues.length;
  if (issues.length > 0) log(`CẢNH BÁO lệch sổ kho:\n${issues.slice(0, 10).join("\n")}`);
  return summary;
}

// ---------------------------------------------------------------------------------------------------------

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}

function phone(r: ReturnType<typeof rng>): string {
  return `${r.pick(["090", "091", "093", "094", "096", "097", "098", "032", "033", "035", "070", "076", "077", "079", "083", "084", "085", "086", "088"])}${String(r.int(0, 9_999_999)).padStart(7, "0")}`;
}

function randomPerson(r: ReturnType<typeof rng>) {
  const male = r.chance(0.78);
  const last = r.pick(LAST_NAMES);
  const first = r.pick(male ? FIRST_NAMES_M : FIRST_NAMES_F);
  const full = `${last} ${r.pick(male ? MIDDLE_NAMES_M : MIDDLE_NAMES_F)} ${first}`;
  return { first, last, full };
}

function address(r: ReturnType<typeof rng>) {
  const city = r.weighted(CITIES, (c) => c.weight);
  const number = r.chance(0.3) ? `${r.int(1, 200)}/${r.int(1, 40)}` : String(r.int(1, 480));
  return { address: `${number} ${r.pick(city.streets)}, ${r.pick(city.wards)}`, city: city.name };
}

function planOrder(r: ReturnType<typeof rng>, at: number, products: Product[], customers: Customer[], now: number): PlannedOrder {
  const pool = customers.filter((c) => c.createdAt < at - HOUR);
  const customer = pool.length > 0 && r.chance(0.8) ? r.weighted(pool, (c) => c.loyalty) : null;
  const guest = customer
    ? null
    : (() => {
        const person = randomPerson(r);
        return { name: person.full, phone: phone(r), email: `khach.${r.int(10000, 99999)}@${DEMO_DOMAIN}`, ...address(r) };
      })();
  const lineCount = r.weighted([1, 2, 3], (n) => ({ 1: 70, 2: 24, 3: 6 })[n]!);
  const chosen = new Map<string, { product: Product; quantity: number }>();
  for (let i = 0; i < lineCount * 3 && chosen.size < lineCount; i++) {
    const product = r.weighted(products, (p) => p.weight);
    if (!chosen.has(product.variantId)) chosen.set(product.variantId, { product, quantity: product.price < 1_000_000 && r.chance(0.15) ? 2 : 1 });
  }
  const lines = [...chosen.values()];
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const promo = ["10-09", "10-10", "10-11"].includes(vnKey(at));
  const coupon = subtotal >= 1_000_000 && r.chance(promo ? 0.6 : 0.05) ? "ROBOT10" : subtotal >= 500_000 && r.chance(0.06) ? "CHAOBAN50" : null;
  const payment = r.chance(0.62) ? "cod" : "bank";
  const outcomes: [Outcome, number][] =
    payment === "bank"
      ? [["complete", 84], ["customer_cancel", 4], ["unpaid_cancel", 5], ["shop_cancel", 3], ["fail_return", 2], ["fail_redeliver", 2]]
      : [["complete", 82], ["customer_cancel", 7], ["shop_cancel", 3], ["fail_return", 5], ["fail_redeliver", 3]];
  const outcome = r.weighted(outcomes, ([, w]) => w)[0];
  void now;
  return { at, customer, guest, lines, payment, coupon, note: r.chance(0.18) ? r.pick(ORDER_NOTES) : "", outcome };
}

type Step = { key: OrderActionKey; after: number; who: "order_staff" | "warehouse" | "accountant" | null; label: string; tracking?: { carrier: string; code: string }; reference?: string };

// Các bước của một đơn, mỗi bước cách bước trước `after` mili giây.
function orderSteps(r: ReturnType<typeof rng>, order: PlannedOrder, code: string): Step[] {
  const h = (min: number, max: number) => r.between(min, max) * HOUR;
  const steps: Step[] = [];
  const bank = order.payment === "bank";
  const ref = () => `FT${r.int(26000, 26999)}${String(r.int(0, 99_999_999)).padStart(8, "0")}`;
  if (order.outcome === "customer_cancel") return [{ key: "customer_cancel", after: h(0.2, 6), who: null, label: "L12 Khách huỷ đơn" }];
  if (order.outcome === "unpaid_cancel") return [{ key: "cancel", after: h(26, 50), who: "order_staff", label: "L13 Huỷ đơn quá hạn chuyển khoản" }];
  if (bank) steps.push({ key: "mark_paid", after: h(0.1, 4), who: "accountant", label: "L2 Ghi nhận đã thu tiền", reference: ref() });
  steps.push({ key: "confirm", after: h(0.4, 8), who: "order_staff", label: "L3 Xác nhận đơn" });
  if (order.outcome === "shop_cancel") {
    steps.push({ key: "cancel", after: h(1, 12), who: "order_staff", label: "L13 Huỷ đơn (hết hàng mẫu khách chọn, đã gọi báo khách)" });
    if (bank) steps.push({ key: "refund", after: h(2, 30), who: "accountant", label: "L14 Ghi nhận đã hoàn tiền", reference: ref() });
    return steps;
  }
  const carrier = r.pick(CARRIERS);
  steps.push(
    { key: "start_packing", after: h(1, 14), who: "warehouse", label: "L4 Bắt đầu đóng gói" },
    { key: "packed", after: h(0.5, 4), who: "warehouse", label: "L5 Đóng gói xong" },
    { key: "hand_over", after: h(1, 20), who: "warehouse", label: "L6 Bàn giao vận chuyển", tracking: { carrier: carrier.name, code: `${carrier.prefix}${code.slice(2)}${r.int(100, 999)}` } },
  );
  const far = !["TP. Hồ Chí Minh", "Hà Nội"].includes((order.customer ?? order.guest)!.city);
  if (order.outcome === "fail_return" || order.outcome === "fail_redeliver") {
    steps.push({ key: "delivery_failed", after: h(30, 90), who: "order_staff", label: "L9 Giao thất bại (không liên lạc được người nhận)" });
    if (order.outcome === "fail_return") {
      steps.push({ key: "receive_return", after: h(48, 120), who: "warehouse", label: "L11 Nhận hàng hoàn về kho" });
      if (bank) steps.push({ key: "refund", after: h(4, 48), who: "accountant", label: "L14 Ghi nhận đã hoàn tiền", reference: ref() });
      return steps;
    }
    steps.push({ key: "redeliver", after: h(12, 40), who: "order_staff", label: "L10 Giao lại" });
    steps.push({ key: "delivered", after: h(20, 48), who: "order_staff", label: "L7 Giao thành công" });
  } else {
    steps.push({ key: "delivered", after: far ? h(60, 130) : h(20, 70), who: "order_staff", label: "L7 Giao thành công" });
  }
  if (!bank) steps.push({ key: "mark_paid", after: h(2, 40), who: "accountant", label: "L2 Ghi nhận đã thu tiền (đối soát COD)", reference: `COD-${carrier.prefix}-${r.int(10000, 99999)}` });
  return steps;
}
