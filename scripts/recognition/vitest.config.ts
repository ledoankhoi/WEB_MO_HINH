import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

// Cấu hình riêng cho scripts/recognition-import.mjs: cùng alias với test, chỉ chạy import.run.ts.
export default defineConfig({
  resolve: { alias: { "@": fromRoot("src"), "server-only": fromRoot("test/stubs/server-only.ts") } },
  test: { root: fromRoot(""), environment: "node", include: ["scripts/recognition/import.run.ts"], testTimeout: 600_000, hookTimeout: 600_000 },
});
