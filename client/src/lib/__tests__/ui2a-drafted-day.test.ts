/**
 * UI-2a — the Drafted day's own furniture (rows 5, 6; ruled 2026-11-09).
 *
 * What this slice ships, and what it deliberately does not:
 *
 *   D1 the day's add control reads the APPROVED copy, "+ Add to this day", and the approved string
 *      carries its own plus — so the control never draws two of them
 *   D2 the event-level control keeps its own label and its icon (the day label is the only one that
 *      changed)
 *   D3 the day photo's attribution band takes the token ground/ink — no raw hex on a planner surface
 *   D4 the day's heading, its stats and the per-row "Swap" entry are untouched (they already exist;
 *      this slice may not lose them while restyling around them)
 *
 * NOT here, and why (recorded in `from-claude/ui-blockers.md`):
 *   · "Drafted setup chips (checked/count)" — the board names chips no surface has yet, and nothing
 *     in the repo defines what is checked; building it would be a guess at the board, not a slice.
 *   · the lodging "Compare places to stay" CTA — that exact wording is NOT among the two approved
 *     strings; the existing control keeps its own label until Leon approves it.
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui2a-drafted-day.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SLIP_ADD_DAY_LABEL, SLIP_ADD_EVENT_LABEL } from "../slip-item-tools";

const TOOLS = fs.readFileSync("client/src/components/plancard/SlipItemTools.tsx", "utf8");
const PHOTO = fs.readFileSync("client/src/components/plan/PlacePhoto.tsx", "utf8");
const DAY = fs.readFileSync("client/src/components/plan/DayBlock.tsx", "utf8");

describe("UI-2a — the day's add control", () => {
  it("D1 the approved copy, and exactly one plus", () => {
    assert.equal(SLIP_ADD_DAY_LABEL, "+ Add to this day", "the approved string, verbatim — never reworded");
    assert.match(SLIP_ADD_DAY_LABEL, /^\+ /, "the plus is part of the copy, as the board draws it");
    // The control draws the glyph ONLY for a label that does not already carry one.
    assert.match(
      TOOLS,
      /\{label\.trimStart\(\)\.startsWith\("\+"\) \? null : <Plus className="w-3 h-3" \/>\} \{label\}/,
      "no double plus: the icon yields to the approved sign",
    );
  });

  it("D2 the event control keeps its label and its icon", () => {
    assert.equal(SLIP_ADD_EVENT_LABEL, "Add something to this event", "the event label is not this slice's");
    assert.doesNotMatch(SLIP_ADD_EVENT_LABEL, /^\+ /, "so it still needs the glyph");
  });
});

describe("UI-2a — the day photo's credit", () => {
  it("D3 the band's attribution is token-only", () => {
    const bandStart = PHOTO.indexOf('if (size === "band")');
    // Slice to the band figure's own close, so the check cannot spill into the hero variant
    // (and does not depend on the file's line endings).
    const band = PHOTO.slice(bandStart, PHOTO.indexOf("</figure>", bandStart));
    assert.ok(band.length > 0, "the band is addressable");
    assert.match(band, /bg-\[color:var\(--slip-card\)\]/, "its own ground, from the token");
    assert.match(band, /text-\[color:var\(--slip-muted\)\]/, "and muted ink");
    assert.doesNotMatch(band, /#[0-9A-Fa-f]{3,8}\b/, "no raw hex in a planner component");
    assert.doesNotMatch(band, /bg-white/, "and no brand-era surface literal");
    // The attribution itself — the fact — is unchanged, link and testid included.
    assert.match(band, /data-testid=\{`\$\{testId\}-attribution`\}/);
    assert.match(band, /photo\.attribution/);
    assert.match(band, /photo\.sourceUrl/);
  });
});

describe("UI-2a — what already existed stays", () => {
  it("D4 the day heading, its stats and the row's Swap entry are untouched", () => {
    assert.match(DAY, /data-testid=\{`slip-day-heading-\$\{dayKey\}`\}/);
    assert.match(DAY, /data-testid=\{`slip-day-stats-\$\{dayKey\}`\}/);
    assert.match(DAY, /slip-display text-xl font-semibold/, "the board's day heading face");
    const row = fs.readFileSync("client/src/components/plan/ItemRow.tsx", "utf8");
    assert.match(row, /swap: "Swap"/, "the per-stop swap entry still exists");
  });
});
