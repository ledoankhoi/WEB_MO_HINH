import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const qa = await import("@/server/repo/questions");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const { adminAlerts } = await import("@/server/repo/admin-alerts");

let asker = "";
let buyer = "";
let stranger = "";
let audit: Parameters<typeof qa.answerAsStaff>[2];
let productId = "";

beforeAll(async () => {
  await getDb();
  asker = (await createUser("customer")).id;
  buyer = (await createUser("customer")).id;
  stranger = (await createUser("customer")).id;
  const staff = await createUser("support");
  audit = { actor: { id: staff.id, role: "support" }, action: "test", entity: "product_questions", summary: "test" };
  const product = (await products.findProductBySlug("bruticus"))!;
  productId = product.id;
  // Người mua: một đơn hoàn tất có sản phẩm.
  const created = await orders.createOrder({
    userId: buyer,
    paymentMethod: "cod",
    customerName: "Người mua",
    customerPhone: "0901234567",
    customerEmail: "",
    shippingAddress: "1 Lê Lợi",
    shippingCity: "Huế",
    note: "",
    idempotencyKey: null,
    items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("không đặt được đơn");
  for (const key of ["confirm", "start_packing", "packed"] as const) await orders.applyOrderAction(created.order.id, key);
  await orders.applyOrderAction(created.order.id, "hand_over", undefined, { tracking: { carrier: "GHN", code: "GHN-QA" } });
  await orders.applyOrderAction(created.order.id, "delivered");
  await orders.applyOrderAction(created.order.id, "mark_paid");
});
afterAll(cleanup);

describe("hỏi đáp sản phẩm", () => {
  it("câu hỏi chờ duyệt mới hiện; nhân viên trả lời thì hiện ngay; khách đã mua trả lời thì chờ duyệt", async () => {
    expect(await qa.askQuestion(asker, productId, "Có kèm đế trưng bày không?")).toBe("ok");
    expect((await qa.listPublicQuestions(productId)).count).toBe(0);
    expect((await adminAlerts("support")).counts.questions).toBe(1);

    const [question] = (await qa.listQuestionsForAdmin("todo", 1)).items;
    expect(question).toMatchObject({ status: "pending", body: "Có kèm đế trưng bày không?" });
    // Câu hỏi chưa hiện thì khách chưa trả lời được.
    expect(await qa.answerAsBuyer(buyer, question.id, "Có, đế đen.")).toBe("not_found");

    const answered = await qa.answerAsStaff(question.id, "Có kèm đế trong hộp.", audit);
    expect(answered).toMatchObject({ askerId: asker, productSlug: "bruticus" });
    const shown = await qa.listPublicQuestions(productId);
    expect(shown.count).toBe(1);
    expect(shown.items[0].answers).toMatchObject([{ isStaff: true, body: "Có kèm đế trong hộp." }]);
    expect((await adminAlerts("support")).counts.questions).toBe(0);

    expect(await qa.answerAsBuyer(stranger, question.id, "Chắc là có.")).toBe("not_buyer");
    expect(await qa.answerAsBuyer(buyer, question.id, "Có, đế màu đen rất chắc.")).toBe("ok");
    expect((await qa.listPublicQuestions(productId)).items[0].answers).toHaveLength(1);
    const pending = (await qa.listQuestionsForAdmin("todo", 1)).items[0].answers.find((a) => a.status === "pending")!;
    expect(pending).toMatchObject({ isBuyer: true, isStaff: false });
    expect(await qa.setAnswerStatus(pending.id, "approved", audit)).toBe(true);
    expect((await qa.listPublicQuestions(productId)).items[0].answers.map((a) => a.isStaff)).toEqual([true, false]);

    // Ẩn câu hỏi thì mất khỏi trang sản phẩm, nhân viên không trả lời thêm được.
    expect(await qa.setQuestionStatus(question.id, "hidden", audit)).toBe(true);
    expect((await qa.listPublicQuestions(productId)).count).toBe(0);
    expect(await qa.answerAsStaff(question.id, "Thêm nữa.", audit)).toBeNull();
  });

  it("giới hạn số câu hỏi đang chờ của một khách; sản phẩm ngừng bán thì không hỏi được", async () => {
    const user = (await createUser("customer")).id;
    for (let i = 0; i < qa.MAX_PENDING_QUESTIONS; i++) expect(await qa.askQuestion(user, productId, `Câu hỏi số ${i}`)).toBe("ok");
    expect(await qa.askQuestion(user, productId, "Câu hỏi quá hạn mức")).toBe("limit");
    expect(await qa.askQuestion(asker, "khongcosanpham000000", "Hỏi gì đó")).toBe("not_found");
  });
});
