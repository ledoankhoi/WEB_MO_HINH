import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { newId } = await import("@/server/ids");
const { createUser, signInAs } = await import("./helpers/staff");
const { adminAlerts } = await import("@/server/repo/admin-alerts");
const { ALERT_KEYS, ALERT_KINDS, alertTotal } = await import("@/lib/admin-alerts");
const { can, ROLES } = await import("@/lib/permissions");
const { NEEDS_ACTION_SQL } = await import("@/lib/order-stage");
const community = await import("@/server/repo/community");
const { REPORT_REASONS } = await import("@/lib/community");
const orders = await import("@/server/repo/orders");
const users = await import("@/server/repo/users");
const { GET } = await import("@/app/admin/api/thong-bao/route");

let authorId: string;
let reportedPost: string;
let inStock: string;
let soldOut: string;

beforeAll(async () => {
  const db = await getDb();
  authorId = await users.insertUser({ email: "tac-gia@example.com", name: "Tác Giả", phone: "", passwordHash: "x" });
  const reporter = await users.insertUser({ email: "nguoi-bao@example.com", name: "Người Báo", phone: "", passwordHash: "x" });

  // Hai bài chờ duyệt, một bài đã duyệt bị báo cáo.
  for (const body of ["Bài thứ nhất chờ duyệt", "Bài thứ hai chờ duyệt"]) {
    await community.createPost(authorId, { id: newId(), topic: "chia-se", body, productSlug: null }, []);
  }
  reportedPost = await community.createPost(authorId, { id: newId(), topic: "hoi-dap", body: "Bài đã duyệt bị báo cáo", productSlug: null }, []);
  await db.execute({ sql: "UPDATE community_posts SET status = 'approved' WHERE id = ?", args: [reportedPost] });
  await community.reportContent(reporter, { postId: reportedPost }, Object.keys(REPORT_REASONS)[0] as keyof typeof REPORT_REASONS);

  // Khách chờ hàng: một mẫu đang có hàng (cần báo khách), một mẫu hết hàng (chưa cần).
  const variants = (await db.execute("SELECT variant_id, stock FROM product_list WHERE is_active ORDER BY stock DESC")).rows;
  inStock = String(variants[0].variant_id);
  soldOut = String(variants.find((row) => Number(row.stock) <= 0)?.variant_id ?? "");
  const alert = (variantId: string, contact: string) =>
    db.execute({
      sql: "INSERT INTO stock_alerts (id, variant_id, contact, contact_kind, created_at) VALUES (?, ?, ?, 'email', ?)",
      args: [newId(), variantId, contact, Date.now()],
    });
  await alert(inStock, "cho-hang@example.com");
  if (soldOut) await alert(soldOut, "cho-hang@example.com");
});
afterAll(cleanup);

describe("thông báo quản trị: đếm và lọc theo quyền (src/server/repo/admin-alerts.ts)", () => {
  it("mỗi vai trò chỉ nhận đúng các loại mình có quyền xử lý", async () => {
    for (const role of ROLES) {
      const { counts } = await adminAlerts(role);
      const expected = ALERT_KEYS.filter((key) => can(role, ALERT_KINDS[key].permission));
      expect(Object.keys(counts).toSorted(), role).toEqual(expected.toSorted());
    }
    // Ví dụ cụ thể: chăm sóc khách hàng thấy bài chờ duyệt, không thấy hoàn tiền hay phiếu kho; kế toán ngược lại.
    expect(Object.keys((await adminAlerts("support")).counts)).toEqual(expect.arrayContaining(["posts", "reports", "reviews", "restocked", "orders"]));
    expect((await adminAlerts("support")).counts).not.toHaveProperty("refunds");
    expect((await adminAlerts("accountant")).counts).toHaveProperty("refunds");
    expect((await adminAlerts("accountant")).counts).not.toHaveProperty("posts");
    expect(await adminAlerts("customer")).toEqual({ counts: {}, events: [] });
  });

  it("đếm đúng bài chờ duyệt, bài bị báo cáo, khách chờ mẫu đã có hàng; báo bài mới nhất", async () => {
    const { counts, events } = await adminAlerts("admin");
    expect(counts.posts).toBe(2);
    expect(counts.reports).toBe(1);
    expect(counts.restocked).toBe(1);
    expect(events.find((event) => event.kind === "posts")).toMatchObject({ text: "Bài cộng đồng mới chờ duyệt · Tác Giả", href: "/admin/cong-dong" });
  });

  it("đơn mới làm tăng số đơn cần xử lý và là việc mới nhất", async () => {
    const db = await getDb();
    const needs = async () => Number((await db.execute(`SELECT COUNT(*) AS n FROM orders o WHERE ${NEEDS_ACTION_SQL}`)).rows[0].n);
    const before = (await adminAlerts("order_staff")).counts.orders;
    expect(before).toBe(await needs());
    const variant = (await db.execute({ sql: "SELECT variant_id, price FROM product_list WHERE variant_id = ?", args: [inStock] })).rows[0];
    const placed = await orders.createOrder({
      userId: null,
      paymentMethod: "cod",
      customerName: "Khách Thông Báo",
      customerPhone: "0912345678",
      customerEmail: "",
      shippingAddress: "1 Lê Lợi",
      shippingCity: "Hà Nội",
      note: "",
      idempotencyKey: null,
      items: [{ variantId: inStock, quantity: 1, expectedPrice: Number(variant.price) }],
    });
    if (!placed.ok) throw new Error(JSON.stringify(placed));
    const after = await adminAlerts("order_staff");
    expect(after.counts.orders).toBe(before! + 1);
    expect(after.events.find((event) => event.kind === "orders")).toMatchObject({ id: placed.order.id, href: `/admin/don-hang/${placed.order.id}` });
    expect(after.events.find((event) => event.kind === "orders")?.text).toContain("Khách Thông Báo");
  });

  it("tổng trên nút chuông không cộng hai lần số đã nằm trong đơn cần xử lý", () => {
    expect(alertTotal({ counts: { orders: 5, refunds: 2, toPack: 1, posts: 3 }, events: [] })).toBe(8);
    // Người chỉ thấy hoàn tiền (không có đơn cần xử lý) thì vẫn đếm hoàn tiền.
    expect(alertTotal({ counts: { refunds: 2 }, events: [] })).toBe(2);
  });
});

describe("GET /admin/api/thong-bao", () => {
  it("cần phiên quản trị; trả đúng các loại của vai trò", async () => {
    jar.clear();
    expect((await GET()).status).toBe(403);
    const marketer = await createUser("marketing");
    await signInAs(marketer.id);
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(Object.keys(body.counts).toSorted()).toEqual(["banners", "posts", "reports"]);
    expect(body.counts.posts).toBe(2);
  });
});
