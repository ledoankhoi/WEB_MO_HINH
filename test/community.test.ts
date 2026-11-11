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
// Không gửi ảnh lên Supabase Storage thật trong test.
const uploaded: string[] = [];
vi.mock("@/server/storage", async (original) => ({
  ...(await original<typeof import("@/server/storage")>()),
  uploadObject: async (path: string) => {
    uploaded.push(path);
    return `https://media.test/${path}`;
  },
}));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const { newToken, sha256 } = await import("@/server/ids");
const users = await import("@/server/repo/users");
const community = await import("@/server/repo/community");
const actions = await import("@/app/actions/community");
const quests = await import("@/server/repo/quests");
const { POST: createPostRoute } = await import("@/app/api/cong-dong/bai-viet/route");

async function signInCustomer(userId: string) {
  const db = await getDb();
  const token = newToken();
  await db.execute({ sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", args: [sha256(token), userId, Date.now() + 3_600_000, Date.now()] });
  jar.set("rs_session", token);
}
const customer = (email: string) => users.insertUser({ email, name: email.split("@")[0], phone: "", passwordHash: "x" });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let author: string;
let reader: string;
beforeAll(async () => {
  await getDb();
  author = await customer("tac-gia@example.com");
  reader = await customer("nguoi-doc@example.com");
});
afterAll(cleanup);

describe("cộng đồng", () => {
  it("bài mới chờ duyệt: không hiện công khai, tác giả vẫn thấy; chưa duyệt thì không bình luận, thả tim được", async () => {
    const id = await community.createPost(author, { id: "a".repeat(20), topic: "chia-se", body: "Kệ trưng bày mới của mình", productSlug: "bruticus" }, []);
    expect((await community.listFeed({ sort: "moi", page: 1, pageSize: 10, viewerId: null })).total).toBe(0);
    expect(await community.findPost(id, null)).toBeNull();
    expect((await community.findPost(id, author))?.status).toBe("pending");
    expect(await community.addComment(reader, id, "Đẹp quá")).toBeNull();
    expect(await community.toggleLike(reader, id)).toBeNull();
  });

  it("khách thường không kiểm duyệt được; nhân viên duyệt thì bài hiện, có sản phẩm gắn kèm, nhiệm vụ cộng đồng nhận được", async () => {
    const id = "a".repeat(20);
    await signInCustomer(reader);
    jar.delete("rs_admin");
    expect((await actions.moderatePostAction(id, "approved", "")).ok).toBeFalsy();
    await signInAs((await createUser("support")).id);
    expect((await actions.moderatePostAction(id, "approved", "")).ok).toBe(true);
    const feed = await community.listFeed({ sort: "moi", page: 1, pageSize: 10, viewerId: reader });
    expect(feed.items.map((post) => [post.id, post.product?.slug])).toEqual([[id, "bruticus"]]);
    const board = await quests.getQuestBoard(author);
    expect(board.quests.find((quest) => quest.ref === "cong-dong")?.status).toBe("claimable");
  });

  it("bình luận, thả tim và bỏ tim, báo cáo một lần; ẩn bài thì báo cáo được xử lý", async () => {
    const id = "a".repeat(20);
    await signInCustomer(reader);
    const form = new FormData();
    form.set("body", "Đẹp quá, cho xin cách sơn!");
    expect((await actions.addCommentAction(id, {}, form)).ok).toBe(true);
    expect(await actions.toggleLikeAction(id)).toMatchObject({ ok: true, liked: true, likes: 1 });
    expect(await actions.toggleLikeAction(id)).toMatchObject({ ok: true, liked: false, likes: 0 });
    expect((await actions.reportAction("post", id, "spam")).message).toMatch(/Đã gửi báo cáo/);
    expect((await actions.reportAction("post", id, "spam")).message).toMatch(/đã báo cáo/);
    expect((await community.listForModeration("reported", 1, 10)).total).toBe(1);

    await signInAs((await createUser("marketing")).id);
    expect((await actions.moderatePostAction(id, "hidden", "Nội dung quảng cáo")).ok).toBe(true);
    expect((await community.listForModeration("reported", 1, 10)).total).toBe(0);
    expect((await community.findPost(id, author))?.moderationNote).toBe("Nội dung quảng cáo");
    const db = await getDb();
    const log = await db.execute("SELECT action FROM audit_logs WHERE action LIKE 'community_post.%' ORDER BY id");
    expect(log.rows.map((row) => row.action)).toEqual(["community_post.approve", "community_post.hide"]);
  });

  it("đăng bài qua Route Handler: kiểm tra đăng nhập, nội dung, chữ ký ảnh; ảnh hợp lệ lên kho media", async () => {
    const send = (fields: Record<string, string>, files: File[] = []) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.set(key, value);
      for (const file of files) form.append("images", file);
      return createPostRoute(new Request("http://localhost/api/cong-dong/bai-viet", { method: "POST", body: form }));
    };
    jar.delete("rs_session");
    expect((await send({ topic: "chia-se", body: "Xin chào cộng đồng ROBOTICA" })).status).toBe(401);

    await signInCustomer(author);
    const bad = await send({ topic: "khong-co", body: "ngắn" }, [new File([new TextEncoder().encode("<script>")], "anh.png", { type: "image/png" })]);
    expect(bad.status).toBe(400);
    expect(Object.keys((await bad.json()).errors).sort()).toEqual(["body", "images", "topic"]);

    const ok = await send({ topic: "trung-bay", body: "Góc trưng bày Combaticons của mình", product: "onslaught" }, [new File([PNG], "ke.png", { type: "image/png" })]);
    expect(ok.status).toBe(200);
    const { id } = await ok.json();
    expect(uploaded).toEqual([`community/${id}-1.png`]);
    expect((await community.findPost(id, author))?.images).toEqual([`https://media.test/community/${id}-1.png`]);
  });
});
