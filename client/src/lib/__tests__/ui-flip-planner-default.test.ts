/**
 * UI-flip — the planner containers DEFAULT to the canvas (ruled 2026-11-09).
 *
 * This is the slice whose whole safety story is its SIZE: one line in `slipTokensMode`, plus this pin.
 *
 *   F1 the default is canvas; `?tokens=default` and a stored "default" are the one-step way back
 *   F2 every PLANNER container spreads the attribute (the slip, the Trip Card, and the two planner
 *      pages) — that is the set the ruling names, not "every page"
 *   F3 the attribute never reaches `<html>`, the nav or the sign-in modal — a root attribute below
 *      them cannot reach them, which is the point of putting it on containers at all
 *   F4 the revert is ONE line: a single `return "canvas"` at the end of the mode function
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui-flip-planner-default.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slipTokensAttr, slipTokensMode } from "../slip-tokens-mode";

const read = (p: string) => fs.readFileSync(p, "utf8");
const MODE = read("client/src/lib/slip-tokens-mode.ts");

describe("UI-flip — the default", () => {
  it("F1 canvas by default, with one step back", () => {
    assert.equal(slipTokensMode("", null), "canvas", "an untouched URL resolves to the canvas");
    assert.equal(slipTokensMode("view=map", undefined), "canvas", "and so does a URL with other query");
    assert.equal(slipTokensMode("tokens=default", null), "default", "?tokens=default is the way back");
    assert.equal(slipTokensMode("", "default"), "default", "and a stored default keeps a device out");
    assert.equal(slipTokensAttr(slipTokensMode("", null))["data-slip-tokens"], "canvas");
    // The opt-out spreads nothing at all, so the surface keeps its own tokens.
    assert.deepEqual(slipTokensAttr(slipTokensMode("tokens=default", null)), {});
  });
});

describe("UI-flip — nothing outside the planner is widened", () => {
  it("F2 the four planner containers spread it", () => {
    for (const file of [
      "client/src/components/plancard/SlipView.tsx",
      "client/src/components/plancard/TripCardDays.tsx",
      "client/src/pages/plan-versions.tsx",
      "client/src/pages/plan-compare.tsx",
    ]) {
      const src = read(file);
      assert.match(src, /slipTokensAttr\(readSlipTokensMode\(\)\)/, `${file} carries the root attribute`);
    }
  });

  it("F3 `<html>`, the nav and the sign-in modal are untouched", () => {
    assert.doesNotMatch(read("client/index.html"), /data-slip-tokens/, "the document element never carries it");
    assert.doesNotMatch(MODE, /documentElement\.|document\.body\.setAttribute/, "no global attribute writer exists");
    for (const chrome of ["client/src/components/layout.tsx", "client/src/components/dashboard-sidebar.tsx"]) {
      assert.doesNotMatch(read(chrome), /slip-tokens-mode|data-slip-tokens/, `${chrome} stays on the brand`);
    }
    // The sign-in modal is one of the surfaces the ruling names: it must not read the mode at all.
    const auth = fs
      .readdirSync("client/src/components", { withFileTypes: true })
      .filter((e) => e.isFile() && /sign-?in|auth/i.test(e.name));
    for (const f of auth) {
      assert.doesNotMatch(read(`client/src/components/${f.name}`), /data-slip-tokens|slipTokensAttr/, `${f.name} stays on the brand`);
    }
  });

  it("F4 the revert is one line", () => {
    const body = MODE.slice(MODE.indexOf("export function slipTokensMode"));
    assert.equal((body.match(/return "default";/g) ?? []).length, 2, "the two explicit opt-outs");
    // The DEFAULT return is the function's tail: changing its one word to "default" is the revert.
    assert.match(body, /return "canvas";\s*\n\}/, "the canvas return is the function's tail");
  });
});
