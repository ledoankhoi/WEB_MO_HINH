import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_STEPS, FEATURES } from "@/data/landing";
import { adminUrl, pickShowcaseModel } from "@/lib/landing";

const STORE_DIR = path.resolve(__dirname, "../src/app/(store)");

// Đường dẫn có trang thật trong src/app/(store)/: đi theo từng đoạn, đoạn không có thư mục cùng tên thì nhận thư mục
// tham số động ([slug], [chuong]...).
function storeRouteExists(href: string): boolean {
  const pathname = href.split(/[?#]/)[0];
  let dir = STORE_DIR;
  for (const segment of pathname.split("/").filter(Boolean)) {
    const exact = path.join(dir, segment);
    if (existsSync(exact)) {
      dir = exact;
      continue;
    }
    const dynamic = readdirSync(dir).find((name) => /^\[[^\]]+\]$/.test(name));
    if (!dynamic) return false;
    dir = path.join(dir, dynamic);
  }
  return existsSync(path.join(dir, "page.tsx"));
}

const item = (key: string | null) => ({ slug: key ?? "khong-co-mo-hinh", modelUrl: key ? `https://cdn.example/media/models/${key}.glb` : null });

describe("trang Giới thiệu (src/lib/landing.ts, src/data/landing.ts)", () => {
  it("khung 3D đầu trang ưu tiên mẫu biến hình xe ↔ robot trong danh sách ưu tiên", () => {
    const items = [item("bruticus"), item("jazz"), item("alliance-bumblebee"), item("alliance-optimus-prime")];
    expect(pickShowcaseModel(items)?.slug).toBe("alliance-optimus-prime");
    expect(pickShowcaseModel(items.slice(0, 3))?.slug).toBe("alliance-bumblebee");
  });

  it("không có mẫu ưu tiên thì lấy mẫu biến hình đầu tiên, rồi mẫu hợp thể, rồi mẫu có file 3D bất kỳ", () => {
    expect(pickShowcaseModel([item("bruticus"), item("jazz")])?.slug).toBe("jazz");
    expect(pickShowcaseModel([item(null), item("alliance-soundwave"), item("bruticus")])?.slug).toBe("bruticus");
    expect(pickShowcaseModel([item(null), item("khong-khai-bao")])?.slug).toBe("khong-khai-bao");
    expect(pickShowcaseModel([item(null)])?.slug).toBe("khong-co-mo-hinh");
    expect(pickShowcaseModel([])).toBeNull();
  });

  it("địa chỉ trang quản trị giữ giao thức và cổng của trang đang xem, đổi tên miền thành ADMIN_HOST", () => {
    expect(adminUrl("admin.localhost", { protocol: "http:", port: "3000" })).toBe("http://admin.localhost:3000/admin");
    expect(adminUrl("admin.robotica.vn", { protocol: "https:", port: "" })).toBe("https://admin.robotica.vn/admin");
  });

  it("mọi liên kết trong nội dung trỏ tới trang có thật của cửa hàng", () => {
    const links = { product: "/san-pham/mau-thu", workshop: "/san-pham/mau-thu/xuong" };
    const hrefs = [...FEATURES.map((feature) => feature.href(links)), ...DEMO_STEPS.flatMap((step) => ("href" in step ? [step.href(links)] : []))];
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, href).toMatch(/^\//);
      expect(storeRouteExists(href), href).toBe(true);
    }
  });
});
