import { defineConfig } from "vitest/config";
import base from "./vitest.checkout-sweep.config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["server/routes/__tests__/facts-recheck-registration.vitest.ts"],
  },
});