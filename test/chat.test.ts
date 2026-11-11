import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const chat = await import("@/server/repo/chat");
const { adminAlerts } = await import("@/server/repo/admin-alerts");

let staffId = "";
beforeAll(async () => {
  await getDb();
  staffId = (await createUser("support")).id;
});
afterAll(cleanup);

describe("chat với cửa hàng", () => {
  it("khách vãng lai gửi tin, nhân viên thấy và trả lời; khách thấy tin chưa đọc", async () => {
    const guest = { visitorHash: "a".repeat(64) };
    const threadId = await chat.postCustomerMessage(guest, "Mẫu Bruticus còn hàng không?", 1000);
    expect(await chat.postCustomerMessage(guest, "Mình ở Huế.", 2000)).toBe(threadId);
    expect((await adminAlerts("support")).counts.chat).toBe(1);

    const [thread] = await chat.listThreads("open");
    expect(thread).toMatchObject({ id: threadId, name: "Khách vãng lai", unread: 2, lastSender: "customer", preview: "Mình ở Huế." });
    const seen = await chat.listMessages(threadId, 0, "staff", 2500);
    expect(seen.map((m) => m.sender)).toEqual(["customer", "customer"]);
    expect((await chat.findThread(threadId))!.unread).toBe(0);

    expect(await chat.postStaffMessage(threadId, staffId, "Còn 4 bộ ạ.", 3000)).toBe(true);
    expect((await adminAlerts("support")).counts.chat).toBe(0);
    expect(await chat.countUnreadForCustomer(threadId)).toBe(1);
    const fresh = await chat.listMessages(threadId, seen.at(-1)!.id, "customer", 4000);
    expect(fresh).toMatchObject([{ sender: "staff", body: "Còn 4 bộ ạ.", staffName: "support" }]);
    expect(await chat.countUnreadForCustomer(threadId)).toBe(0);
  });

  it("khách đăng nhập một cuộc trò chuyện theo tài khoản; đóng rồi nhắn lại thì mở lại", async () => {
    const user = await createUser("customer");
    const owner = { userId: user.id, name: "Khách quen" };
    const threadId = await chat.postCustomerMessage(owner, "Chào shop");
    expect(await chat.setThreadStatus(threadId, "closed")).toBe(true);
    expect((await chat.listThreads("closed")).map((t) => t.id)).toContain(threadId);
    await chat.postCustomerMessage(owner, "Cho mình hỏi thêm");
    expect((await chat.findThread(threadId))!).toMatchObject({ status: "open", name: "Khách quen", email: user.email });
    expect(await chat.postStaffMessage("khongco0000000000000", staffId, "x")).toBe(false);
  });
});
