import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

// Cấu hình riêng cho bộ sinh dữ liệu mẫu (scripts/demo-data.mjs): cùng alias với test, chỉ chạy run.demo.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("src"),
      "server-only": fromRoot("test/stubs/server-only.ts"),
    },
  },
  test: {
    root: fromRoot(""),
    environment: "node",
    include: ["scripts/demo/run.demo.ts"],
    testTimeout: 6 * 3_600_000,
    hookTimeout: 600_000,
  },
});
