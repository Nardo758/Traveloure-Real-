/**
 * Phase 1 — the canvas token seam (Leon's go). The canvas look is a ROOT ATTRIBUTE, not a second
 * theme: with no attribute the slip renders exactly as today.
 *
 *   C1 every canvas token also exists in the default file (so default mode is a complete fallback)
 *   C2 the canvas block is scoped to `[data-slip-tokens="canvas"]` under `.slip-surface`
 *   C3 the mode is default unless the URL or the device asks for canvas
 *   C4 the attribute spread is empty in default mode
 *
 * Run: npx tsx --test client/src/lib/__tests__/slip-tokens-canvas.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slipTokensAttr, slipTokensMode } from "../slip-tokens-mode";

const read = (p: string) => fs.readFileSync(p, "utf8");
const names = (css: string) => new Set([...css.matchAll(/(--slip-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const DEFAULT_CSS = read("client/src/styles/slip-tokens.css");
const CANVAS_CSS = read("client/src/styles/slip-tokens.canvas.css");

describe("Phase 1 — canvas token seam", () => {
  it("C1 every canvas token also exists in the default file", () => {
    const base = names(DEFAULT_CSS);
    const canvas = names(CANVAS_CSS);
    assert.ok(canvas.size > 20, "the canvas file defines the palette");
    const missing = [...canvas].filter((n) => !base.has(n));
    assert.deepEqual(missing, [], "a canvas-only token would have no default to fall back to");
  });

  it("C2 the canvas block is the root attribute, not a global theme", () => {
    assert.match(CANVAS_CSS, /\.slip-surface\[data-slip-tokens="canvas"\]\s*\{/);
    assert.doesNotMatch(CANVAS_CSS, /^\s*:root\s*\{/m, "a :root block would restyle every page");
  });

  it("C3 the mode is default unless asked for", () => {
    assert.equal(slipTokensMode("", null), "default");
    assert.equal(slipTokensMode("view=map", "default"), "default");
    assert.equal(slipTokensMode("tokens=canvas", null), "canvas");
    assert.equal(slipTokensMode("", "canvas"), "canvas");
  });

  it("C4 default mode spreads no attribute", () => {
    assert.deepEqual(slipTokensAttr("default"), {});
    assert.deepEqual(slipTokensAttr("canvas"), { "data-slip-tokens": "canvas" });
  });
});
