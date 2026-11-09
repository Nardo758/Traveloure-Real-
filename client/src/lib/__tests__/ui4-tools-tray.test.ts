/**
 * UI-4 — the tools tray and its sheets (row 19; gates frozen).
 *
 *   T1 a sheet carries the planner's token ROOT itself — it is portaled to the body, outside the
 *      slip's root, so without this every tool opened from the plan rendered in console colours
 *   T2 the tray stays a one-row scroller of token chips, with its testids and its one press rail
 *   T3 QW-4's gates are FROZEN: hidden occasion ⇒ chip absent, not-live tool ⇒ chip absent,
 *      unmet gate ⇒ the press routes to the dates/party chip, never to a broken sheet
 *   T4 the travel party form panel is token-only (no `rounded-lg`, no `bg-muted`)
 *   T5 no tool gained a component: every coming-soon key still returns null
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui4-tools-tray.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const TRAY = fs.readFileSync("client/src/components/plan/ToolsTray.tsx", "utf8");
const PARTY = fs.readFileSync("client/src/components/plancard/SlipTravelingParty.tsx", "utf8");

describe("UI-4 — the tray's sheets", () => {
  it("T1 the sheet carries the planner root, ground and body face", () => {
    const sheetAt = TRAY.indexOf("<SheetContent");
    const sheet = TRAY.slice(sheetAt, TRAY.indexOf(">", sheetAt));
    assert.match(sheet, /className="slip-surface/, "the sheet content is a slip surface");
    assert.match(sheet, /bg-\[color:var\(--slip-ground\)\]/, "the planner's ground");
    assert.match(sheet, /font-\[family-name:var\(--slip-font-body\)\]/, "the canvas body face");
    assert.match(sheet, /slipTokensAttr\(readSlipTokensMode\(\)\)/, "the same root attribute the slip spreads");
    // The sheet's own testid contract is unchanged.
    assert.match(TRAY, /data-testid=\{open \? `tool-sheet-\$\{open\}` : undefined\}/);
  });
});

describe("UI-4 — the tray row", () => {
  it("T2 one scroller row of token chips, one press rail", () => {
    assert.match(TRAY, /data-testid="slip-tools-tray"/);
    assert.match(TRAY, /-mx-1 flex gap-2 overflow-x-auto/, "the row scrolls, never wraps");
    assert.match(TRAY, /rounded-\[var\(--slip-radius-chip\)\]/, "chip radius");
    assert.match(TRAY, /data-testid=\{`tool-chip-\$\{key\}`\}/);
    assert.match(TRAY, /data-tool-done=\{done \? "true" : undefined\}/, "the ✓ state is data, not a second button");
    // The press is ONE rail: trayPress decides dates / party / sheet.
    assert.match(TRAY, /const press = props\.facts \? trayPress\(key, props\.facts\) : "sheet";/);
    assert.match(TRAY, /if \(press === "dates" && props\.onNeedDates\) return props\.onNeedDates\(\);/);
    assert.match(TRAY, /if \(press === "party" && props\.onNeedParty\) return props\.onNeedParty\(\);/);
  });

  it("T3 QW-4's gates are frozen", () => {
    // A hidden occasion's chips are ABSENT, not greyed.
    assert.match(TRAY, /const HIDDEN_OCCASION_ABSENT: ReadonlySet<ToolKey> = new Set<ToolKey>\(\["guests", "guest_invites", "travel_party", "whos_coming"\]\)/);
    // A not-live tool draws nothing; an unmet gate whose fact is a chip stays drawn (and routes).
    const fn = TRAY.slice(TRAY.indexOf("export function trayTools"), TRAY.indexOf("export function ToolsTray"));
    assert.equal((fn.match(/\.filter\(/g) ?? []).length, 3, "three gates, in order: hidden occasion · live · press");
    assert.match(fn, /\.filter\(\(k\) => !p\.facts \|\| trayPress\(k, p\.facts\) !== "hidden"\)/);
    // An empty tray draws no wrapper — only the sheet.
    assert.match(TRAY, /if \(tools\.length === 0\) return sheet;/);
  });
});

describe("UI-4 — the travel party form", () => {
  it("T4 the form panel is token-only", () => {
    assert.match(PARTY, /rounded-\[var\(--slip-radius-card\)\] border border-\[color:var\(--slip-line\)\] bg-\[color:var\(--slip-wash\)\] p-4/);
    assert.doesNotMatch(PARTY, /rounded-lg\b/);
    assert.doesNotMatch(PARTY, /bg-muted/);
  });
});

describe("UI-4 — no tool gained a component", () => {
  it("T5 every coming-soon key still resolves to null", () => {
    const body = TRAY.slice(TRAY.indexOf("export function toolContent"), TRAY.indexOf("/** Tools that do not exist under a hidden occasion"));
    const nulls = (body.match(/return null;/g) ?? []).length;
    assert.equal(nulls, 1, "the coming-soon block is one `return null`, unchanged");
    for (const key of ["getting_home", "budget", "who_pays_what", "getting_back_late"]) {
      assert.ok(body.includes(`case "${key}":`), `${key} is still listed as having no component`);
    }
  });
});
