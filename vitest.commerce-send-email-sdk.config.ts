import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@": fileURLToPath(new URL("./client/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["server/routes/__tests__/commerce-send-email-sdk.vitest.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
