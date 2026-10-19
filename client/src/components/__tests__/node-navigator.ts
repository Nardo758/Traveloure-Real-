/**
 * Node 20 (CI) has no global `navigator`, and `client/src/lib/navigate.ts` reads `navigator.userAgent` when it loads;
 * Node 22 defines one. A render test that loads such a component imports this file FIRST, so the stub is in place before
 * the component module evaluates (ES modules evaluate their imports in order). Not a test file.
 */
if (typeof (globalThis as any).navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, configurable: true });
}
export {};
