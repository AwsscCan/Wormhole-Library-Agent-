import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/performance/**/*.test.ts"],
    environment: "node",
    // 测试默认禁用 OpenAlex 外网调用（openAlexAdapter 测试自行 stub fetch）
    env: {
      OPENALEX_DISABLED: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
