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
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, formOf, signInAs } = await import("./helpers/staff");
const actions = await import("@/app/actions/content");
const content = await import("@/server/repo/content");
const { isSafeLink } = await import("@/lib/validation");
const { parseVnDateTime, toVnDateTimeInput } = await import("@/lib/format");

beforeAll(async () => {
  await getDb();
  await signInAs((await createUser("marketing")).id);
});
afterAll(cleanup);

const banner = (values: Record<string, string>) => formOf({ title: "Sale tháng 10", imageUrl: "https://cdn.example/b.webp", placement: "home_hero", ...values });

describe("banner (T14)", () => {
  it("liên kết an toàn và ô ngày giờ theo giờ Việt Nam", () => {
    for (const ok of ["/san-pham?loai=transformers", "https://example.com/a"]) expect(isSafeLink(ok)).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.com", "http://example.com", "data:text/html,x", "/a b"]) expect(isSafeLink(bad)).toBe(false);
    expect(parseVnDateTime("2026-10-16T07:00")).toBe(Date.UTC(2026, 9, 16, 0, 0));
    expect(toVnDateTimeInput(Date.UTC(2026, 9, 16, 0, 0))).toBe("2026-10-16T07:00");
    expect(parseVnDateTime("2026-02-30T10:00")).toBeNull();
  });

  it("kiểm tra dữ liệu: liên kết javascript:, kết thúc trước bắt đầu bị từ chối", async () => {
    const result = await actions.saveBannerAction({}, banner({ linkUrl: "javascript:alert(1)", startsAt: "2026-10-20T10:00", endsAt: "2026-10-19T10:00" }));
    expect(result.errors).toMatchObject({ linkUrl: expect.any(String), endsAt: expect.stringMatching(/sau bắt đầu/) });
    expect(await content.listBanners()).toEqual([]);
  });

  it("EC-08 và EC-04: bản nháp không hiện; xuất bản thì hiện; hết thời gian hiệu lực thì không hiện nữa", async () => {
    expect((await actions.saveBannerAction({}, banner({ linkUrl: "/san-pham" }))).ok).toBe(true);
    const [created] = await content.listBanners();
    expect(created.status).toBe("draft");
    expect(await content.listActiveBanners()).toEqual([]);

    expect((await actions.bannerAction(created.id, "publish")).ok).toBe(true);
    expect((await content.listActiveBanners()).map((b) => b.id)).toEqual([created.id]);

    // Lịch đã kết thúc (so bằng đồng hồ CSDL).
    const db = await getDb();
    await db.execute({ sql: "UPDATE banners SET starts_at = 1, ends_at = 2 WHERE id = ?", args: [created.id] });
    expect(await content.listActiveBanners()).toEqual([]);
    // Lịch chưa tới.
    const future = Date.now() + 86400000;
    await db.execute({ sql: "UPDATE banners SET starts_at = ?, ends_at = ? WHERE id = ?", args: [future, future + 1000, created.id] });
    expect(await content.listActiveBanners()).toEqual([]);
    // Sắp hết lịch trong 3 ngày (cho trang tổng quan).
    await db.execute({ sql: "UPDATE banners SET starts_at = NULL, ends_at = ? WHERE id = ?", args: [future, created.id] });
    expect((await content.listBannersEndingSoon()).map((b) => b.id)).toEqual([created.id]);
  });

  it("AUD-01: xuất bản banner có nhật ký; vai trò không có content.edit bị từ chối", async () => {
    const db = await getDb();
    const logs = await db.execute("SELECT action FROM audit_logs WHERE entity = 'banners' ORDER BY id");
    expect(logs.rows.map((r) => r.action)).toEqual(["banner.create", "banner.publish"]);
    await signInAs((await createUser("warehouse")).id);
    expect(await actions.saveBannerAction({}, banner({}))).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });
  });
});

describe("menu, thanh thông báo, liên hệ (T15)", () => {
  it("menu nạp sẵn như cửa hàng cũ; liên kết nội bộ phải trỏ tới trang có thật", async () => {
    await signInAs((await createUser("marketing")).id);
    const items = await content.listNavItems();
    expect(items.filter((i) => i.menu === "header").map((i) => i.url)).toEqual([
      "/",
      "/san-pham",
      "/san-pham?loai=transformers",
      "/san-pham?loai=super-sentai",
      "/san-pham?loai=model-kits",
      "/san-pham?sap-xep=moi-nhat",
    ]);
    for (const ok of ["/san-pham/bruticus", "/gio-hang", "/san-pham?loai=figure"]) expect(await content.internalLinkExists(ok)).toBe(true);
    for (const bad of ["/khong-co", "/san-pham/khong-co", "/gio-hang?x=1", "/admin"]) expect(await content.internalLinkExists(bad)).toBe(false);

    expect((await actions.saveNavItemAction({}, formOf({ menu: "header", label: "Trang lỗi", url: "/khong-co" }))).errors?.url).toMatch(/Không có trang/);
    expect((await actions.saveNavItemAction({}, formOf({ menu: "footer", label: "Bruticus", url: "/san-pham/bruticus", isActive: "on" }))).ok).toBe(true);
    expect((await content.listNavItems()).some((i) => i.menu === "footer" && i.label === "Bruticus")).toBe(true);
  });

  it("thanh thông báo chỉ hiện khi bật và trong khung giờ; liên hệ lưu được", async () => {
    expect(await content.activeAnnouncement()).toBeNull();
    expect((await actions.saveSettingsAction("announcement", {}, formOf({ enabled: "on", text: "" }))).errors?.text).toMatch(/Nhập nội dung/);
    expect((await actions.saveSettingsAction("announcement", {}, formOf({ enabled: "on", text: "Nghỉ lễ 2/9", linkUrl: "/san-pham" }))).ok).toBe(true);
    expect(await content.activeAnnouncement()).toMatchObject({ text: "Nghỉ lễ 2/9" });
    expect((await actions.saveSettingsAction("announcement", {}, formOf({ enabled: "on", text: "Đã qua", endsAt: "2020-01-01T00:00" }))).ok).toBe(true);
    expect(await content.activeAnnouncement()).toBeNull();

    expect((await actions.saveSettingsAction("contact", {}, formOf({ phone: "0900 000 001", email: "sai" }))).errors?.email).toBeDefined();
    expect((await actions.saveSettingsAction("contact", {}, formOf({ phone: "0900 000 001", email: "CSKH@ROBOTICA.VN", address: "", hours: "" }))).ok).toBe(true);
    expect((await content.getSettings()).contact).toEqual({ phone: "0900 000 001", email: "cskh@robotica.vn", address: "", hours: "" });
    expect((await actions.saveSettingsAction("policy", {}, formOf({ returnDays: "400", warrantyMonths: "12" }))).errors?.returnDays).toBeDefined();
  });
});
