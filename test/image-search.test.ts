import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  IMAGE_SEARCH_MODEL,
  calibrateThresholds,
  centerSquare,
  decide,
  decodeVector,
  dot,
  encodeVector,
  evaluateThresholds,
  hslToHex,
  indexViews,
  l2Normalize,
  parseVector,
  pixelsToTensor,
  poolViews,
  queryViews,
  rankProducts,
  seededRandom,
  type CalibrationSample,
} from "@/lib/image-search";
import { closedSet, productSeed, rankGallery, recordsToCsv, scoreQuery, toSamples, type GalleryEntry, type QueryRecord } from "@/lib/image-search-eval";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === "string" ? cookie : cookie.name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const afterCallbacks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (callback: () => unknown) => afterCallbacks.push(callback) }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const DIM = IMAGE_SEARCH_MODEL.dim;

// Vector đơn vị ngẫu nhiên có hạt giống, và vector "gần" một vector gốc (thêm nhiễu rồi chuẩn hoá).
function randomUnit(random: () => number, dim = DIM) {
  return l2Normalize(Array.from({ length: dim }, () => random() - 0.5));
}
function near(base: Float32Array, noise: number, random: () => number) {
  return l2Normalize(Array.from(base, (value) => value + noise * (random() - 0.5)));
}

describe("phép tính vector", () => {
  it("chuẩn hoá L2 và tích vô hướng", () => {
    const v = l2Normalize([3, 4]);
    expect(Array.from(v)).toEqual([expect.closeTo(0.6, 6), expect.closeTo(0.8, 6)]);
    expect(dot(v, v)).toBeCloseTo(1, 6);
    // Vector 0 giữ nguyên, không chia cho 0.
    expect(Array.from(l2Normalize([0, 0]))).toEqual([0, 0]);
  });

  it("gộp trung bình: ‖z̄‖² bằng trung bình cô-sin của mọi cặp góc (kể cả với chính nó)", () => {
    const random = seededRandom(1);
    const base = randomUnit(random);
    const views = Array.from({ length: 12 }, () => near(base, 0.08, random));
    const { embedding, consistency } = poolViews(views);
    let sum = 0;
    for (const a of views) for (const b of views) sum += dot(a, b);
    expect(consistency ** 2).toBeCloseTo(sum / 144, 5);
    expect(dot(embedding, embedding)).toBeCloseTo(1, 5);
    // 12 góc giống nhau thì độ nhất quán là 1.
    expect(poolViews([base, base, base]).consistency).toBeCloseTo(1, 5);
    expect(() => poolViews([])).toThrow();
  });

  it("mã hoá base64 và giải mã lại đúng từng số float32", () => {
    const vector = randomUnit(seededRandom(2));
    const text = encodeVector(vector);
    expect(text).toHaveLength(Math.ceil((DIM * 4) / 3) * 4);
    expect(Array.from(decodeVector(text))).toEqual(Array.from(vector));
  });

  it("parseVector: đúng số chiều, hữu hạn, khác 0, trả về bản đã chuẩn hoá", () => {
    const ok = Array.from({ length: DIM }, (_, i) => (i === 0 ? 2 : 0));
    expect(parseVector(ok, DIM)?.[0]).toBeCloseTo(1, 6);
    expect(parseVector(ok.slice(1), DIM)).toBeNull();
    expect(parseVector([...ok.slice(1), Number.NaN], DIM)).toBeNull();
    expect(parseVector(new Array(DIM).fill(0), DIM)).toBeNull();
    expect(parseVector("1,2,3", DIM)).toBeNull();
    expect(parseVector([...ok.slice(1), "1"], DIM)).toBeNull();
  });
});

describe("tiền xử lý ảnh", () => {
  it("cắt hình vuông lớn nhất ở giữa (như CLIP: thu cạnh ngắn rồi cắt giữa)", () => {
    expect(centerSquare({ x: 0, y: 0, width: 400, height: 300 })).toEqual({ x: 50, y: 0, width: 300, height: 300 });
    expect(centerSquare({ x: 10, y: 20, width: 100, height: 160 })).toEqual({ x: 10, y: 50, width: 100, height: 100 });
  });

  it("RGBA thành tensor CHW đã chuẩn hoá màu", () => {
    const size = 2;
    // 4 điểm ảnh: trắng, đen, đỏ, xanh dương.
    const rgba = [255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255];
    const tensor = pixelsToTensor(rgba, size);
    const { mean, std } = IMAGE_SEARCH_MODEL;
    expect(tensor).toHaveLength(12);
    // Kênh R của điểm trắng và điểm đen; kênh B của điểm xanh dương (mặt phẳng thứ 3, vị trí 3).
    expect(tensor[0]).toBeCloseTo((1 - mean[0]) / std[0], 5);
    expect(tensor[1]).toBeCloseTo((0 - mean[0]) / std[0], 5);
    expect(tensor[2 * 4 + 3]).toBeCloseTo((1 - mean[2]) / std[2], 5);
    // Ghi vào lô tại vị trí thứ hai.
    const batch = new Float32Array(24);
    pixelsToTensor(rgba, size, IMAGE_SEARCH_MODEL, batch, 12);
    expect(Array.from(batch.subarray(12))).toEqual(Array.from(tensor));
    expect(() => pixelsToTensor([1, 2, 3], size)).toThrow();
  });

  it("12 góc thư viện và ảnh truy vấn giả lập có hạt giống", () => {
    const views = indexViews("default");
    expect(views.map((v) => v.azimuth)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    expect(new Set(views.map((v) => `${v.elevation}|${v.background}`))).toEqual(new Set(["15|#ffffff"]));
    const a = queryViews(6, ["default", "alt"], seededRandom(7));
    const b = queryViews(6, ["default", "alt"], seededRandom(7));
    expect(a).toEqual(b);
    expect(a.filter((v) => v.form === "alt")).toHaveLength(2);
    expect(a.every((v) => v.elevation >= -5 && v.elevation <= 40 && v.degrade && v.degrade.jpeg >= 0.35)).toBe(true);
    expect(queryViews(3, ["default"], seededRandom(7)).every((v) => v.form === "default")).toBe(true);
    expect(a.every((v) => /^#[0-9a-f]{6}$/.test(v.background))).toBe(true);
  });

  it("đổi màu HSL sang mã hex", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(120, 100, 25)).toBe("#008000");
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(210, 40, 60)).toBe("#7099c2");
  });
});

describe("xếp hạng và quyết định", () => {
  const random = seededRandom(3);
  const robot = randomUnit(random);
  const car = randomUnit(random);
  const other = randomUnit(random);
  const products = [
    { productId: "a", forms: [{ form: "default" as const, label: "Dạng robot", embedding: robot }, { form: "alt" as const, label: "Dạng xe", embedding: car }] },
    { productId: "b", forms: [{ form: "default" as const, label: "", embedding: other }] },
  ];

  it("sản phẩm nhiều dạng lấy điểm của dạng giống nhất", () => {
    const ranked = rankProducts(near(car, 0.02, random), products);
    expect(ranked.map((r) => r.productId)).toEqual(["a", "b"]);
    expect(ranked[0]).toMatchObject({ form: "alt", label: "Dạng xe" });
    expect(ranked[0].score).toBeGreaterThan(0.95);
  });

  it("chấp nhận khi s₁ ≥ τ và s₁ − s₂ ≥ δ; nêu lý do khi từ chối", () => {
    const t = { tau: 0.7, delta: 0.05 };
    expect(decide([{ score: 0.9 }, { score: 0.5 }], t)).toEqual({ accepted: true, reason: "match", s1: 0.9, s2: 0.5 });
    expect(decide([{ score: 0.6 }, { score: 0.1 }], t)).toMatchObject({ accepted: false, reason: "low-score" });
    expect(decide([{ score: 0.9 }, { score: 0.87 }], t)).toMatchObject({ accepted: false, reason: "ambiguous" });
    expect(decide([], t)).toMatchObject({ accepted: false, reason: "empty" });
    // Chỉ một sản phẩm: s₂ = −1, điều kiện cách biệt luôn thoả.
    expect(decide([{ score: 0.75 }], t)).toMatchObject({ accepted: true, s2: -1 });
  });
});

describe("hiệu chỉnh ngưỡng", () => {
  // Ảnh có bán: s₁ quanh 0,8, đúng 95%; ảnh không bán: s₁ quanh 0,55. Cách biệt của ảnh có bán lớn hơn.
  function samples(seed: number, count: number): CalibrationSample[] {
    const random = seededRandom(seed);
    const out: CalibrationSample[] = [];
    for (let i = 0; i < count; i++) {
      const s1 = 0.8 + 0.1 * (random() - 0.5);
      out.push({ s1, s2: s1 - 0.1 - 0.1 * random(), known: true, correct: random() > 0.05 });
      const u = 0.55 + 0.2 * (random() - 0.5);
      out.push({ s1: u, s2: u - 0.05 * random(), known: false, correct: false });
    }
    return out;
  }

  it("tỉ lệ trên ảnh có bán cộng lại bằng 1; FAR tính trên ảnh không bán", () => {
    const rates = evaluateThresholds(samples(1, 50), { tau: 0.7, delta: 0.05 });
    expect(rates.correctAccept + rates.wrongAccept + rates.falseReject).toBeCloseTo(1, 10);
    expect(rates).toMatchObject({ known: 50, unknown: 50 });
  });

  it("chọn cặp ngưỡng giữ FAR ≤ 5% trên tập chọn và báo kết quả trên tập kiểm tra", () => {
    const result = calibrateThresholds(samples(1, 200), samples(2, 200), 0.05);
    expect(result.select.falseAccept).toBeLessThanOrEqual(0.05);
    expect(result.select.correctAccept).toBeGreaterThan(0.85);
    // Cách biệt của ảnh không bán ≤ 0,05, của ảnh có bán ≥ 0,1: δ nằm giữa hai mức đó tách được hai nhóm.
    expect(result.delta).toBeGreaterThan(0.05);
    expect(result.delta).toBeLessThanOrEqual(0.1);
    expect(result.test.falseAccept).toBeLessThanOrEqual(0.05);
    expect(result.test.known).toBe(200);
    // Kết quả xác định: chạy lại cho cùng ngưỡng.
    expect(calibrateThresholds(samples(1, 200), samples(2, 200), 0.05)).toEqual(result);
  });

  it("không cặp nào giữ được FAR thì từ chối mọi ảnh", () => {
    const all: CalibrationSample[] = [
      { s1: 1, s2: 0, known: false, correct: false },
      { s1: 0.9, s2: 0.2, known: true, correct: true },
    ];
    const result = calibrateThresholds(all, all, 0);
    expect(result).toMatchObject({ tau: 1, delta: 2 });
    expect(result.select).toMatchObject({ falseAccept: 0, correctAccept: 0 });
  });
});

describe("đánh giá: bỏ một sản phẩm, Recall@K, hai cách gộp", () => {
  const random = seededRandom(21);
  // Ba sản phẩm; A và A' rất giống nhau (hai phiên bản của cùng một robot), B khác hẳn.
  const a = randomUnit(random);
  const b = randomUnit(random);
  const entry = (productId: string, center: Float32Array, noise: number): GalleryEntry => {
    const views = Array.from({ length: 12 }, () => near(center, noise, random));
    return { productId, name: productId.toUpperCase(), modelUrl: `/models/${productId}.glb`, forms: [{ form: "default", label: "", embedding: poolViews(views).embedding, views }] };
  };
  const gallery = [entry("a", a, 0.1), entry("a2", near(a, 0.05, random), 0.1), entry("b", b, 0.1)];

  it("ảnh của A: hạng 1 là A; bỏ A khỏi thư viện thì A' đứng đầu với điểm vẫn cao (ca khó của tập mở)", () => {
    const query = near(a, 0.05, random);
    const score = scoreQuery(query, "a", gallery, "mean");
    expect(score.rank).toBe(1);
    expect(score.top).toBe("a");
    expect(score.looTop).toBe("a2");
    expect(score.looS1).toBeGreaterThan(0.8);
    expect(score.looS2).toBeLessThan(score.looS1);
    // Sản phẩm không có trong thư viện: hạng 0.
    expect(scoreQuery(query, "khong-co", gallery, "mean").rank).toBe(0);
  });

  it("maxview lấy góc giống nhất nên điểm không thấp hơn cách gộp trung bình", () => {
    const query = near(b, 0.2, random);
    const mean = rankGallery(query, gallery, "mean");
    const max = rankGallery(query, gallery, "maxview");
    expect(mean[0].productId).toBe("b");
    expect(max[0].productId).toBe("b");
    // ‖z̄‖ ≤ 1 nên cô-sin với trung bình (đã chuẩn hoá) có thể cao hơn từng góc; điều chắc chắn là
    // maxview ≥ cô-sin với từng góc của chính sản phẩm đó.
    const views = gallery[2].forms[0].views;
    expect(max[0].score).toBeCloseTo(Math.max(...views.map((view) => dot(query, view))), 6);
  });

  it("mỗi ảnh cho một mẫu có bán và một mẫu không bán; Recall@1, Recall@5, MRR", () => {
    const records = [{ rank: 1 }, { rank: 2 }, { rank: 6 }, { rank: 0 }];
    expect(closedSet(records)).toEqual({ queries: 3, recall1: 1 / 3, recall5: 2 / 3, mrr: (1 + 1 / 2 + 1 / 6) / 3 });
    const samples = toSamples([{ rank: 1, s1: 0.9, s2: 0.5, top: "a", looS1: 0.7, looS2: 0.4, looTop: "a2" }]);
    expect(samples).toEqual([
      { s1: 0.9, s2: 0.5, known: true, correct: true },
      { s1: 0.7, s2: 0.4, known: false, correct: false },
    ]);
    expect(closedSet([])).toMatchObject({ queries: 0, recall1: 0, mrr: 0 });
  });

  it("hạt giống theo sản phẩm ổn định; CSV có tiêu đề, số làm tròn, chuỗi được bọc", () => {
    expect(productSeed(2026, "abc")).toBe(productSeed(2026, "abc"));
    expect(productSeed(2026, "abc")).not.toBe(productSeed(2026, "abd"));
    expect(productSeed(2026, "abc")).not.toBe(productSeed(2027, "abc"));
    const record: QueryRecord = {
      productId: "a",
      name: 'Robot "A"',
      form: "default",
      index: 3,
      split: "test",
      pooling: "mean",
      rank: 1,
      s1: 0.123456789,
      s2: 0.1,
      top: "a",
      looS1: 0.5,
      looS2: 0.2,
      looTop: "a2",
    };
    const csv = recordsToCsv([record], new Map([["a2", "Robot A'"]])).split("\n");
    expect(csv[0]).toBe("san_pham,dang,anh,tap,cach_gop,hang_dung,s1,s2,hang_1,loo_s1,loo_s2,loo_hang_1");
    expect(csv[1]).toBe('"Robot ""A""","default",3,"test","mean",1,0.123457,0.1,"a",0.5,0.2,"Robot A\'"');
  });
});

describe("lưu chỉ mục, tìm kiếm và quyền (CSDL)", () => {
  const cleanup = setupTempDatabase();
  let getDb: typeof import("@/server/db").getDb;
  let actions: typeof import("@/app/actions/image-search");
  let repo: typeof import("@/server/repo/image-search");
  let search: typeof import("@/server/image-search");
  let route: typeof import("@/app/api/tim-bang-anh/route");
  let staff: typeof import("./helpers/staff");
  const products: { id: string; modelUrl: string; name: string }[] = [];
  const centers = new Map<string, Float32Array>();
  const random = seededRandom(11);

  // 12 góc quanh một vector gốc riêng của mỗi sản phẩm, gửi lên dạng base64 như trình duyệt.
  const viewsOf = (id: string) => Array.from({ length: 12 }, () => encodeVector(near(centers.get(id)!, 0.15, random)));

  beforeAll(async () => {
    ({ getDb } = await import("@/server/db"));
    actions = await import("@/app/actions/image-search");
    repo = await import("@/server/repo/image-search");
    search = await import("@/server/image-search");
    route = await import("@/app/api/tim-bang-anh/route");
    staff = await import("./helpers/staff");
    const db = await getDb();
    const rows = await db.execute("SELECT id, model_url, name FROM products WHERE status = 'published' AND model_url IS NOT NULL ORDER BY slug LIMIT 3");
    for (const row of rows.rows) {
      products.push({ id: String(row.id), modelUrl: String(row.model_url), name: String(row.name) });
      centers.set(String(row.id), randomUnit(random));
    }
    await staff.signInAs((await staff.createUser("product_manager")).id);
  });
  afterAll(cleanup);

  const payload = (index: number, extra: Partial<import("@/app/actions/image-search").IndexPayload> = {}) => ({
    productId: products[index].id,
    model: IMAGE_SEARCH_MODEL.id,
    sourceUrl: products[index].modelUrl,
    forms: [{ form: "default" as const, label: "", views: viewsOf(products[index].id) }],
    ...extra,
  });

  it("quản lý sản phẩm lập chỉ mục; máy chủ tự gộp 12 góc và ghi nhật ký", async () => {
    for (let i = 0; i < products.length; i++) {
      const result = await actions.saveImageIndexAction(payload(i));
      expect(result.ok).toBe(true);
      expect(result.forms?.[0].consistency).toBeGreaterThan(0.5);
    }
    const status = await repo.listIndexStatus(IMAGE_SEARCH_MODEL.id);
    const indexed = status.products.filter((p) => p.forms.length > 0);
    expect(indexed.map((p) => p.productId).sort()).toEqual(products.map((p) => p.id).sort());
    expect(indexed[0].forms[0]).toMatchObject({ form: "default", views: 12 });
    const db = await getDb();
    const logs = await db.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'image_search.index'");
    expect(Number(logs.rows[0].n)).toBe(products.length);
    // Lập lại thì thay dòng cũ, không nhân đôi.
    expect((await actions.saveImageIndexAction(payload(0))).ok).toBe(true);
    const rows = await db.execute({ sql: "SELECT COUNT(*) AS n FROM image_search_index WHERE product_id = ?", args: [products[0].id] });
    expect(Number(rows.rows[0].n)).toBe(1);
  });

  it("từ chối vector sai số chiều, chưa chuẩn hoá, dạng trùng hoặc mô hình 3D đã đổi", async () => {
    const short = encodeVector(l2Normalize([1, 2, 3]));
    expect((await actions.saveImageIndexAction(payload(0, { forms: [{ form: "default", label: "", views: [short] }] }))).ok).toBeUndefined();
    const unnormalized = encodeVector(Array.from({ length: DIM }, () => 1));
    expect((await actions.saveImageIndexAction(payload(0, { forms: [{ form: "default", label: "", views: [unnormalized] }] }))).ok).toBeUndefined();
    const views = viewsOf(products[0].id);
    expect(
      (await actions.saveImageIndexAction(payload(0, { forms: [{ form: "default", label: "", views }, { form: "default", label: "", views }] }))).message,
    ).toMatch(/không hợp lệ/);
    expect((await actions.saveImageIndexAction(payload(0, { sourceUrl: "/models/khac.glb" }))).message).toMatch(/vừa thay đổi/);
    expect((await actions.saveImageIndexAction(payload(0, { model: "mo-hinh-khac" }))).message).toMatch(/không hợp lệ/);
  });

  it("CSDL chặn vector có số byte không khớp số chiều", async () => {
    const db = await getDb();
    await expect(
      db.execute({
        sql: `INSERT INTO image_search_index (product_id, model, form, dim, views, embedding, view_embeddings, consistency, created_at)
              VALUES (?, 'thu', 'default', 512, 1, ?, ?, 1, 0)`,
        args: [products[0].id, new Uint8Array(100), new Uint8Array(2048)],
      }),
    ).rejects.toThrow();
  });

  it("ảnh gần sản phẩm nào thì sản phẩm đó đứng đầu; ảnh lạ bị từ chối", async () => {
    const target = products[1];
    const outcome = await search.searchByEmbedding(IMAGE_SEARCH_MODEL.id, near(centers.get(target.id)!, 0.15, random));
    expect(outcome.candidates).toBe(products.length);
    expect(outcome.results[0].product.id).toBe(target.id);
    expect(outcome.results[0].product.name).toBe(target.name);
    expect(outcome).toMatchObject({ accepted: true, reason: "match", ...DEFAULT_THRESHOLDS });
    const stranger = await search.searchByEmbedding(IMAGE_SEARCH_MODEL.id, randomUnit(random));
    expect(stranger.accepted).toBe(false);
    expect(stranger.reason).toBe("low-score");
  });

  it("sản phẩm ngừng bán không xuất hiện trong kết quả", async () => {
    const db = await getDb();
    expect(await search.getImageSearchStatus(IMAGE_SEARCH_MODEL.id)).toEqual({ products: products.length });
    await db.execute({ sql: "UPDATE products SET status = 'draft' WHERE id = ?", args: [products[2].id] });
    const index = await repo.loadSearchIndex(IMAGE_SEARCH_MODEL.id);
    expect(index.map((entry) => entry.productId)).not.toContain(products[2].id);
    // Nút máy ảnh ở đầu trang và trang của khách đếm cùng một tập sản phẩm.
    expect(await repo.countSearchableProducts(IMAGE_SEARCH_MODEL.id)).toBe(products.length - 1);
    expect(await repo.countSearchableProducts("mo-hinh-khac")).toBe(0);
    await db.execute({ sql: "UPDATE products SET status = 'published' WHERE id = ?", args: [products[2].id] });
  });

  it("ngưỡng: kiểm tra miền giá trị; hiệu chỉnh chỉ được ghi kèm đúng cặp ngưỡng của nó", async () => {
    expect((await actions.saveThresholdsAction({ tau: 1.5, delta: 0.02, calibration: null })).ok).toBeUndefined();
    expect((await actions.saveThresholdsAction({ tau: 0.7, delta: -1, calibration: null })).ok).toBeUndefined();
    const select = { correctAccept: 0.9, wrongAccept: 0.02, falseReject: 0.08, falseAccept: 0.04, known: 10, unknown: 10 };
    const calibration = { tau: 0.71, delta: 0.03, farMax: 0.05, select, test: select, products: 3, queriesPerProduct: 6 };
    expect((await actions.saveThresholdsAction({ tau: 0.71, delta: 0.03, calibration })).ok).toBe(true);
    let settings = await repo.getImageSearchSettings(IMAGE_SEARCH_MODEL.id);
    expect(settings).toMatchObject({ tau: 0.71, delta: 0.03, source: "calibrated", calibration: { products: 3 } });
    // Tự nhập ngưỡng khác: bỏ kết quả hiệu chỉnh cũ.
    expect((await actions.saveThresholdsAction({ tau: 0.72, delta: 0.03, calibration })).ok).toBe(true);
    settings = await repo.getImageSearchSettings(IMAGE_SEARCH_MODEL.id);
    expect(settings).toMatchObject({ tau: 0.72, source: "manual", calibration: null });
    // Ngưỡng của mô hình khác không được dùng.
    expect((await repo.getImageSearchSettings("mo-hinh-khac")).source).toBe("default");
  });

  it("kết quả hiệu chỉnh: máy chủ chỉ lưu các trường đã biết, sai một phần thì từ chối cả kết quả", async () => {
    const rates = { correctAccept: 0.8, wrongAccept: 0, falseReject: 0.2, falseAccept: 0.05, known: 40, unknown: 40 };
    const closed = { queries: 40, recall1: 0.975, recall5: 1, mrr: 0.99 };
    const calibration = {
      tau: 0.6,
      delta: 0.05,
      farMax: 0.05,
      select: { ...rates, ghiChu: "không lưu" },
      test: rates,
      products: 10,
      queriesPerProduct: 8,
      seed: 2026,
      maxview: { tau: 0.62, delta: 0.01, select: rates, test: rates },
      closedSet: { mean: closed, maxview: closed },
      laLung: "<script>",
    };
    expect((await actions.saveThresholdsAction({ tau: 0.6, delta: 0.05, calibration: calibration as never })).ok).toBe(true);
    const settings = await repo.getImageSearchSettings(IMAGE_SEARCH_MODEL.id);
    expect(settings.source).toBe("calibrated");
    expect(settings.calibration).toEqual({
      tau: 0.6,
      delta: 0.05,
      farMax: 0.05,
      select: rates,
      test: rates,
      products: 10,
      queriesPerProduct: 8,
      seed: 2026,
      maxview: { tau: 0.62, delta: 0.01, select: rates, test: rates },
      closedSet: { mean: closed, maxview: closed },
    });
    const broken = { ...calibration, closedSet: { mean: { ...closed, recall1: 2 }, maxview: closed } };
    expect((await actions.saveThresholdsAction({ tau: 0.6, delta: 0.05, calibration: broken as never })).message).toMatch(/không hợp lệ/);
    // Các test sau dùng lại ngưỡng của test trước.
    expect((await actions.saveThresholdsAction({ tau: 0.72, delta: 0.03, calibration: null })).ok).toBe(true);
  });

  it("vai trò không có quyền sửa danh mục không lập chỉ mục, không đổi ngưỡng, không tải dữ liệu hiệu chỉnh", async () => {
    await staff.signInAs((await staff.createUser("warehouse")).id);
    expect((await actions.saveImageIndexAction(payload(0))).message).toMatch(/không có quyền/);
    expect((await actions.saveThresholdsAction({ tau: 0.7, delta: 0.02, calibration: null })).message).toMatch(/không có quyền/);
    expect("entries" in (await actions.loadCalibrationAction())).toBe(false);
    await staff.signInAs((await staff.createUser("product_manager")).id);
    const loaded = await actions.loadCalibrationAction();
    expect("entries" in loaded && loaded.entries.length).toBe(products.length);
    expect("entries" in loaded && loaded.entries[0].forms[0].views).toHaveLength(12);
  });

  it("API /api/tim-bang-anh: kiểm tra đầu vào, trả kết quả và ghi nhật ký (không lưu ảnh)", async () => {
    const post = (body: unknown) =>
      route.POST(new Request("http://localhost/api/tim-bang-anh", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
    expect((await post("khong-phai-json")).status).toBe(400);
    expect((await post({ model: IMAGE_SEARCH_MODEL.id, embedding: [1, 2] })).status).toBe(400);
    expect((await post({ model: "cu", embedding: Array.from(randomUnit(random)) })).status).toBe(409);

    const target = products[0];
    const response = await post({ model: IMAGE_SEARCH_MODEL.id, embedding: Array.from(near(centers.get(target.id)!, 0.05, random)), clientMs: 812 });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accepted).toBe(true);
    expect(body.results[0].product.id).toBe(target.id);
    expect(body.results[0].score).toBeGreaterThan(body.results[1].score);
    expect(body).toMatchObject({ reason: "match", tau: 0.72, delta: 0.03, candidates: products.length });

    for (const callback of afterCallbacks.splice(0)) await callback();
    const db = await getDb();
    const log = await db.execute("SELECT * FROM image_search_logs ORDER BY id DESC LIMIT 1");
    expect(log.rows[0]).toMatchObject({ top_product_id: target.id, accepted: true, reason: "match", client_ms: 812, candidates: products.length });
    const stats = await repo.imageSearchStats(30);
    expect(stats.total).toBe(1);
    expect(stats.recent[0].productName).toBe(target.name);
  });

  it("API giới hạn 30 lượt mỗi phút theo IP", async () => {
    const body = JSON.stringify({ model: IMAGE_SEARCH_MODEL.id, embedding: Array.from(randomUnit(random)) });
    let last: Response | null = null;
    for (let i = 0; i < 31; i++) last = await route.POST(new Request("http://localhost/api/tim-bang-anh", { method: "POST", body }));
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
    afterCallbacks.splice(0);
  });

  it("xoá sản phẩm thì xoá luôn chỉ mục của nó", async () => {
    const db = await getDb();
    await db.batch([
      { sql: "DELETE FROM image_search_logs WHERE top_product_id = ?", args: [products[2].id] },
      { sql: "DELETE FROM image_search_index WHERE product_id = ? AND form = 'alt'", args: [products[2].id] },
    ]);
    const before = await db.execute({ sql: "SELECT COUNT(*) AS n FROM image_search_index WHERE product_id = ?", args: [products[2].id] });
    expect(Number(before.rows[0].n)).toBe(1);
    expect((await actions.deleteImageIndexAction(products[2].id)).ok).toBe(true);
    const after = await db.execute({ sql: "SELECT COUNT(*) AS n FROM image_search_index WHERE product_id = ?", args: [products[2].id] });
    expect(Number(after.rows[0].n)).toBe(0);
  });
});
