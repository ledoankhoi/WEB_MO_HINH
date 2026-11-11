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
const actions = await import("@/app/actions/news");
const news = await import("@/server/repo/news");
const { internalLinkExists } = await import("@/server/repo/content");

let marketingId = "";
beforeAll(async () => {
  await getDb();
  marketingId = (await createUser("marketing")).id;
  await signInAs(marketingId);
});
afterAll(cleanup);

const post = (values: Record<string, string>) => formOf({ title: "Hàng mới về tháng 11", summary: "Ba mẫu Gundam mới.", body: "Dòng 1\nDòng 2", ...values });

describe("tin tức (/tin-tuc)", () => {
  it("kiểm tra dữ liệu: ảnh bìa javascript:, slug sai, nội dung trống bị từ chối", async () => {
    const result = await actions.saveNewsAction({}, post({ coverImage: "javascript:alert(1)", slug: "Sai Slug", body: "" }));
    expect(result.errors).toMatchObject({ coverImage: expect.any(String), slug: expect.any(String), body: expect.any(String) });
    expect(await news.listNews()).toEqual([]);
  });

  it("bài mới là nháp; xuất bản thì khách thấy và menu nhận liên kết; gỡ xuống thì ẩn nhưng giữ ngày đăng", async () => {
    const saved = await actions.saveNewsAction({}, post({}));
    expect(saved.ok).toBe(true);
    const [created] = await news.listNews();
    expect(created).toMatchObject({ slug: "hang-moi-ve-thang-11", status: "draft", publishedAt: null, coverImage: null });
    expect(await news.listPublishedNews()).toEqual([]);
    expect(await news.findPublishedNews(created.slug)).toBeNull();
    expect(await internalLinkExists("/tin-tuc/hang-moi-ve-thang-11")).toBe(false);
    expect(await internalLinkExists("/tin-tuc")).toBe(true);

    expect((await actions.newsAction(created.id, "publish")).ok).toBe(true);
    const published = await news.findPublishedNews(created.slug);
    expect(published).toMatchObject({ title: "Hàng mới về tháng 11", body: "Dòng 1\nDòng 2" });
    const firstPublishedAt = published!.publishedAt;
    expect(firstPublishedAt).toEqual(expect.any(Number));
    const list = await news.listPublishedNews();
    expect(list.map((item) => item.slug)).toEqual([created.slug]);
    expect(list[0]).not.toHaveProperty("body");
    expect(await internalLinkExists("/tin-tuc/hang-moi-ve-thang-11")).toBe(true);

    // Xuất bản hai lần: lần sau báo đã ở trạng thái này.
    expect((await actions.newsAction(created.id, "publish")).ok).toBeUndefined();

    expect((await actions.newsAction(created.id, "unpublish")).ok).toBe(true);
    expect(await news.listPublishedNews()).toEqual([]);
    expect((await actions.newsAction(created.id, "publish")).ok).toBe(true);
    expect((await news.findPublishedNews(created.slug))!.publishedAt).toBe(firstPublishedAt);

    const db = await getDb();
    const logs = (await db.execute({ sql: "SELECT action FROM audit_logs WHERE entity = 'news_posts' AND entity_id = ? ORDER BY id", args: [created.id] })).rows.map((row) => row.action);
    expect(logs).toEqual(["news.create", "news.publish", "news.unpublish", "news.publish"]);
  });

  it("sửa bài, trùng slug báo lỗi, xoá bài", async () => {
    const [existing] = await news.listNews();
    expect((await actions.saveNewsAction({}, post({ title: "Bài thứ hai", coverImage: "https://cdn.example/a.webp" }))).ok).toBe(true);
    const second = (await news.listNews()).find((item) => item.slug === "bai-thu-hai")!;
    expect(second.coverImage).toBe("https://cdn.example/a.webp");

    const clash = await actions.saveNewsAction({}, post({ id: second.id, title: "Bài thứ hai", slug: existing.slug }));
    expect(clash.errors?.slug).toMatch(/đã có bài khác/);

    expect((await actions.saveNewsAction({}, post({ id: second.id, title: "Bài thứ hai (sửa)", slug: "bai-thu-hai" }))).ok).toBe(true);
    expect((await news.findNews(second.id))!.title).toBe("Bài thứ hai (sửa)");

    expect((await actions.newsAction(second.id, "delete")).ok).toBe(true);
    expect(await news.findNews(second.id)).toBeNull();
    expect((await actions.newsAction(second.id, "delete")).message).toMatch(/không còn/);
  });

  it("nhân viên không có quyền content.edit bị từ chối", async () => {
    await signInAs((await createUser("warehouse")).id);
    try {
      const [existing] = await news.listNews();
      expect((await actions.saveNewsAction({}, post({ title: "Không được" }))).ok).toBeFalsy();
      expect((await actions.newsAction(existing.id, "delete")).ok).toBeFalsy();
      expect(await news.findNews(existing.id)).not.toBeNull();
    } finally {
      await signInAs(marketingId);
    }
  });
});
