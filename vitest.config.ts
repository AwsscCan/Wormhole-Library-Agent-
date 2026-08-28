import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/performance/**/*.test.ts"],
    environment: "node",
    // 测试默认禁用外网馆藏调用（联邦适配器测试自行 stub transport）。
    env: {
      OPENALEX_DISABLED: "1",
      OPENLIBRARY_DISABLED: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/support/server-only.ts"),
    },
  },
});
