import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const call = (host: string, path: string) => proxy(new NextRequest(`http://${host}${path}`, { headers: { host } }));
const rewrittenTo = (response: Response) => response.headers.get("x-middleware-rewrite");

describe("tách tên miền cửa hàng và quản trị", () => {
  it("tên miền cửa hàng không mở được /admin", () => {
    for (const path of ["/admin", "/admin/san-pham", "/admin/dang-nhap"]) {
      expect(rewrittenTo(call("localhost:3000", path))).toContain("/__khong-co-trang");
    }
  });

  it("tên miền cửa hàng mở bình thường các trang khác", () => {
    for (const path of ["/", "/san-pham", "/administrator"]) {
      const response = call("localhost:3000", path);
      expect(rewrittenTo(response)).toBeNull();
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("tên miền quản trị: / chuyển về /admin, trang cửa hàng không có", () => {
    expect(new URL(call("admin.localhost:3000", "/").headers.get("location")!).pathname).toBe("/admin");
    expect(new URL(call("admin.localhost:3000", "/").headers.get("location")!).host).toBe("admin.localhost:3000");
    expect(rewrittenTo(call("admin.localhost:3000", "/san-pham"))).toContain("/__khong-co-trang");
    expect(rewrittenTo(call("admin.localhost:3000", "/admin/san-pham"))).toBeNull();
    expect(rewrittenTo(call("ADMIN.localhost", "/admin"))).toBeNull();
  });
});
