/**
 * Smoke 9 addendum (ledger `2026-10-04-smoke9-addendum`) — the client half.
 *   C1 S9-6 the facts line's "checked" day is read in the PLAN's zone, not UTC
 *   C2 S9-2 amendment the ⋯ entry "Set as where you're staying" is wired to the one rail
 *   C3 S9-9 the slip prints no transition-log line
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { factCheckedLabel, itemFactsLine } from "../place-facts";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("C1 S9-6: 'checked' is the plan's day — 23:30 UTC on 2 Oct reads 3 Oct in Kyoto", () => {
  const at = "2026-10-02T23:30:00.000Z";
  assert.equal(factCheckedLabel(at, "Asia/Tokyo"), "3 Oct");
  assert.equal(factCheckedLabel(at, "America/Los_Angeles"), "2 Oct");
  assert.equal(factCheckedLabel(at, null), "2 Oct", "no zone ⇒ the UTC day the server stamped, never the viewer's");
  assert.equal(factCheckedLabel(at, "Not/AZone"), "2 Oct", "an unknown zone falls back to UTC");
  const facts = [
    {
      factType: "hours",
      value: { weekdayDescriptions: ["Saturday: 8:45 AM – 5:00 PM"] },
      provenance: "Google Maps · checked 2 Oct 2026",
      checkedAt: at,
      sourceUrl: null,
      stale: false,
    },
  ] as any;
  assert.equal(itemFactsLine(facts, "2026-11-14", "Asia/Tokyo")?.text, "Sat · 8:45 AM – 5:00 PM · Google Maps · checked 3 Oct");
  const slip = read("client/src/components/plancard/SlipView.tsx");
  assert.match(slip, /timeZone=\{data\.trip\?\.timezone \?\? null\}/);
  assert.match(read("client/src/components/plan/ItemRow.tsx"), /itemFactsLine\(facts, dateIso, timeZone\)/);
});

test("C2 S9-2 amendment: 'Set as where you're staying' posts the hand-added item to the one where-to-stay rail", () => {
  const sets = read("client/src/components/plancard/SlipOptionSets.tsx");
  assert.match(sets, /apiRequest\("POST", `\/api\/trips\/\$\{tripId\}\/where-to-stay`, \{ kind: "this_item", itemId \}\)/);
  const row = read("client/src/components/plan/ItemRow.tsx");
  assert.match(row, /data-testid=\{`item-menu-set-as-stay-\$\{id\}`\}/);
  const slip = read("client/src/components/plancard/SlipView.tsx");
  assert.match(slip, /isLodgingItem\(\{ type: a\.type, title: a\.name \}\)/);
  assert.match(slip, /!lodgingSet &&/);
  assert.match(read("client/src/components/plan/AnchorPanel.tsx"), /ANCHOR_PANEL_HAND_ADDED = HAND_ADDED_STAY_LINE/);
});

test("C3 S9-9: the slip prints no 'v1 · Oct 3 · (removed item) (you)' line", () => {
  const slip = read("client/src/components/plancard/SlipView.tsx");
  assert.ok(!/TransitionLogFooter|slip-transition-log|\(removed item\)/.test(slip.replace(/\/\/.*$/gm, "")));
});
