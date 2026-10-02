import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  root: process.cwd(),
  resolve: { alias: {
    "@shared": path.resolve(process.cwd(), "shared"),
    "@": path.resolve(process.cwd(), "client/src"),
  } },
  test: { environment: "node", include: ["server/automations/messaging/__tests__/core-journey.test.ts"],
    passWithNoTests: false },
});