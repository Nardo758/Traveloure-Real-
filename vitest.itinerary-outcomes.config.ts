import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["server/services/__tests__/itinerary-generation-outcome.vitest.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 30000,
  },
});