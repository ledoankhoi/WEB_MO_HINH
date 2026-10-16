import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // Gói `server-only` chỉ có nghĩa trong trình đóng gói của Next.js; khi chạy test thay bằng module rỗng.
      "server-only": fromRoot("./test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Lần đầu mỗi file tạo CSDL PGlite và chạy toàn bộ migration, dữ liệu mẫu; chạy song song có thể quá 5 giây.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
