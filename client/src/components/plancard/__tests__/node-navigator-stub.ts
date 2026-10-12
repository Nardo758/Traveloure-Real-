/**
 * Side-effect module for tests that load the card on Node 20 (CI), which has no global `navigator`:
 * `client/src/lib/navigate.ts` reads it when it loads. Import this BEFORE the components.
 */
if (typeof (globalThis as any).navigator === "undefined") (globalThis as any).navigator = { userAgent: "node" };
export {};
