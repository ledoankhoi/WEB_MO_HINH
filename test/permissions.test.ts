import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can, PERMISSIONS, ROLES, isStaffRole, type Role } from "@/lib/permissions";
import { setupTempDatabase } from "./helpers/temp-db";

// Giả lập phần của Next.js mà Server Action dùng: cookie của yêu cầu, chuyển hướng, cache.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === "string" ? cookie : cookie.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();

const { getDb } = await import("@/server/db");
const { newId, newToken, sha256 } = await import("@/server/ids");
const { hashPassword } = await import("@/server/auth/password");
const session = await import("@/server/auth/session");
const admin = await import("@/app/actions/admin");
const auth = await import("@/app/actions/auth");
const orders = await import("@/server/repo/orders");
const products = await import("@/server/repo/products");

afterAll(cleanup);

// Bảng ở mục 3 của docs/chuan/10, cột theo thứ tự: admin, product_manager, warehouse_manager, warehouse,
// order_staff, support, marketing, accountant, viewer.
const COLUMNS: Role[] = [
  "admin",
  "product_manager",
  "warehouse_manager",
  "warehouse",
  "order_staff",
  "support",
  "marketing",
  "accountant",
  "viewer",
];
const EXPECTED: Record<string, string> = {
  "dashboard.view": "●●●●●●●●●",
  "catalog.view": "●●●●●●●●●",
  "catalog.edit": "●●·······",
  "cost.view": "●·●····●·",
  "inventory.view": "●●●●●··●●",
  "inventory.draft": "●·●●·····",
  "inventory.post": "●·●······",
  "inventory.setup": "●·●······",
  "orders.view": "●·●●●●·●●",
  "orders.process": "●···●····",
  "orders.fulfil": "●·●●●····",
  "payments.manage": "●······●·",
  "customers.view": "●···●●·●·",
  "customers.manage": "●····●···",
  "reviews.moderate": "●····●···",
  "content.edit": "●·····●··",
  "coupons.manage": "●·····●··",
  "reports.view": "●●●···●●●",
  "staff.manage": "●········",
  "audit.view": "●······●●",
};

describe("ma trận quyền", () => {
  it("khớp từng ô của bảng ở tài liệu 10, mục 3", () => {
    expect(PERMISSIONS.toSorted()).toEqual(Object.keys(EXPECTED).toSorted());
    for (const permission of PERMISSIONS) {
      const row = COLUMNS.map((role) => (can(role, permission) ? "●" : "·")).join("");
      expect(row, permission).toBe(EXPECTED[permission]);
    }
  });

  it("khách hàng không có quyền nào và không phải nhân viên", () => {
    expect(PERMISSIONS.some((permission) => can("customer", permission))).toBe(false);
    expect(ROLES.filter(isStaffRole)).toEqual(COLUMNS.toSorted((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)));
    expect(isStaffRole("customer")).toBe(false);
    expect(isStaffRole("hacker")).toBe(false);
  });
});

async function createUser(role: Role, password = "mat-khau-dung") {
  const db = await getDb();
  const id = newId();
  const email = `${role}-${id}@example.com`;
  await db.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, email, role, await hashPassword(password), role, Date.now()],
  });
  return { id, email };
}

// Đăng nhập quản trị bằng cách đặt thẳng cookie rs_admin, như máy chủ làm sau khi xác minh mật khẩu.
async function signInAs(userId: string) {
  const db = await getDb();
  const token = newToken();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [sha256(token), userId, Date.now() + 60_000, Date.now()],
  });
  jar.set("rs_admin", token);
}

async function auditRows(action: string) {
  const db = await getDb();
  return (await db.execute({ sql: "SELECT * FROM audit_logs WHERE action = ? ORDER BY id", args: [action] })).rows;
}

async function placeOrder() {
  const product = (await products.findProductBySlug("strike-freedom-gundam"))!;
  const created = await orders.createOrder({
    userId: null,
    paymentMethod: "cod",
    customerName: "Nguyễn Văn A",
    customerPhone: "0901234567",
    customerEmail: "",
    shippingAddress: "12 Lê Lợi",
    shippingCity: "Đà Nẵng",
    note: "",
    idempotencyKey: null,
    items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("Không tạo được đơn thử");
  return created.order.id;
}

beforeAll(async () => {
  await getDb();
});

beforeEach(() => jar.clear());

describe("kiểm tra quyền ở máy chủ", () => {
  it("SEC-01: nhân viên nội dung gọi thẳng action xử lý đơn, thanh toán, sản phẩm bị từ chối và không ghi gì", async () => {
    const orderId = await placeOrder();
    const marketing = await createUser("marketing");
    await signInAs(marketing.id);

    const forbidden = { message: "Bạn không có quyền thực hiện thao tác này." };
    expect(await admin.advanceOrderAction(orderId, "confirmed")).toEqual(forbidden);
    expect(await admin.cancelOrderAsAdminAction(orderId)).toEqual(forbidden);
    expect(await admin.setPaymentStatusAction(orderId, "paid")).toEqual(forbidden);
    const product = (await products.findProductBySlug("strike-freedom-gundam"))!;
    expect(await admin.deleteProductAction(product.id)).toEqual(forbidden);
    const form = new FormData();
    form.set("id", product.id);
    form.set("name", "Đổi tên trái phép");
    expect(await admin.saveProductAction({}, form)).toEqual(forbidden);

    const order = (await orders.findOrderById(orderId))!;
    expect(order).toMatchObject({ status: "pending", paymentStatus: "unpaid" });
    expect((await products.findProductById(product.id))!.name).toBe(product.name);
    const db = await getDb();
    expect(Number((await db.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE actor_id IS NOT NULL")).rows[0].n)).toBe(0);
  });

  it("chưa đăng nhập quản trị hoặc chỉ có phiên khách thì action cũng bị từ chối", async () => {
    const orderId = await placeOrder();
    expect((await admin.advanceOrderAction(orderId, "confirmed")).ok).toBeUndefined();
    const customer = await createUser("customer");
    await signInAs(customer.id);
    expect((await admin.advanceOrderAction(orderId, "confirmed")).ok).toBeUndefined();
    expect((await orders.findOrderById(orderId))!.status).toBe("pending");
  });

  it("nhân viên đúng quyền thao tác được, mỗi thao tác đúng một dòng nhật ký với người làm và trước, sau", async () => {
    const orderId = await placeOrder();
    const staff = await createUser("order_staff");
    await signInAs(staff.id);

    expect((await admin.advanceOrderAction(orderId, "confirmed")).ok).toBe(true);
    // Lần bấm thứ hai không đổi gì nên không ghi thêm nhật ký.
    expect((await admin.advanceOrderAction(orderId, "confirmed")).ok).toBeUndefined();
    const rows = await auditRows("order.confirmed");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: staff.id, actor_role: "order_staff", entity: "orders", entity_id: orderId });
    expect(JSON.parse(String(rows[0].detail))).toEqual({ before: { status: "pending" }, after: { status: "confirmed" } });

    // Nhân viên đơn hàng không có quyền thu tiền.
    expect((await admin.setPaymentStatusAction(orderId, "paid")).ok).toBeUndefined();
    const accountant = await createUser("accountant");
    await signInAs(accountant.id);
    expect((await admin.setPaymentStatusAction(orderId, "paid")).ok).toBe(true);
    expect(await auditRows("payment.paid")).toHaveLength(1);
  });

  it("trang quản trị: thiếu phiên thì về đăng nhập, thiếu quyền thì 404", async () => {
    await expect(session.requireStaff("orders.view", "/admin/don-hang")).rejects.toThrow(
      "REDIRECT /admin/dang-nhap?next=%2Fadmin%2Fdon-hang",
    );
    const marketing = await createUser("marketing");
    await signInAs(marketing.id);
    await expect(session.requireStaff("orders.view")).rejects.toThrow("NOT_FOUND");
    expect((await session.requireStaff("dashboard.view")).id).toBe(marketing.id);
  });

  it("SEC-04: tài khoản bị khoá còn phiên đang mở thì yêu cầu tiếp theo bị đưa về trang đăng nhập", async () => {
    const staff = await createUser("warehouse");
    await signInAs(staff.id);
    expect((await session.requireStaff("dashboard.view")).id).toBe(staff.id);

    const db = await getDb();
    await db.execute({ sql: "UPDATE users SET is_active = false WHERE id = ?", args: [staff.id] });
    await expect(session.requireStaff("dashboard.view")).rejects.toThrow("REDIRECT /admin/dang-nhap");
    expect(await session.authorize("dashboard.view")).toBeNull();
  });
});

describe("đăng nhập quản trị", () => {
  const login = (email: string, password: string) => {
    const form = new FormData();
    form.set("email", email);
    form.set("password", password);
    return auth.adminLoginAction({}, form);
  };

  it("sai mật khẩu có một dòng nhật ký thất bại, không có người làm", async () => {
    const staff = await createUser("support");
    expect((await login(staff.email, "sai-mat-khau")).message).toBe("Email hoặc mật khẩu không đúng.");
    const rows = (await auditRows("auth.admin_login_failed")).filter((row) => row.entity_id === staff.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: null, entity: "users" });
    expect(String(rows[0].summary)).toContain(staff.email);
  });

  it("nhận mọi vai trò nhân viên đang hoạt động; từ chối khách hàng và tài khoản bị khoá", async () => {
    const staff = await createUser("viewer");
    await expect(login(staff.email, "mat-khau-dung")).rejects.toThrow("REDIRECT /admin");
    expect(jar.has("rs_admin")).toBe(true);
    expect((await auditRows("auth.admin_login")).some((row) => row.actor_id === staff.id)).toBe(true);

    const customer = await createUser("customer");
    expect((await login(customer.email, "mat-khau-dung")).message).toBe("Email hoặc mật khẩu không đúng.");

    const locked = await createUser("admin");
    const db = await getDb();
    await db.execute({ sql: "UPDATE users SET is_active = false WHERE id = ?", args: [locked.id] });
    expect((await login(locked.email, "mat-khau-dung")).message).toBe("Email hoặc mật khẩu không đúng.");
  });
});
