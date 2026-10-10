import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [{
    name: "vendor-proposal-no-live-transport",
    enforce: "pre",
    resolveId(source) {
      // Resolve BOTH static and concurrent dynamic imports to a physical stub.
      // vi.mock alone did not isolate concurrent imports in this Vitest runtime.
      if (/(^|\/)email\.service(?:\.[jt]s)?$/.test(source)) {
        return fileURLToPath(new URL("./server/services/__tests__/fixtures/vendor-bulk-transport.stub.ts", import.meta.url));
      }
    },
  }],
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["server/services/__tests__/vendor-bulk-proposal.vitest.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    setupFiles: ["server/services/__tests__/fixtures/vendor-bulk-network-guard.ts"],
  },
});
