/**
 * UI-2b (part 1) — the tray's chip STATES (B-8) and the approved lodging CTA (B-9).
 *
 * Ruled 2026-11-09 by Leon:
 *   · B-8 — a chip is CHECKED when the fact it asks for is already saved (dates ⇒ Getting there, a
 *     stay chosen ⇒ Where to stay) and shows a COUNT where the board shows one ("Travel party · 2").
 *     Reads existing fields; no new string.
 *   · B-9 — "Compare places to stay", wording approved; OWNER only (a guest's row is Browse on the
 *     existing Hotels tab, which is UI-2b part 2).
 *
 *   C1 the three checked facts are read off fields the slip already holds, and nothing else is
 *   C2 the count renders only when the plan states a party, and carries its own data attribute
 *   C3 the approved CTA is on the OWNER's tray control, and nowhere a guest can reach
 *   C4 both strings are the approved ones, verbatim
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui2b-chip-states.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const SLIP = read("client/src/components/plancard/SlipView.tsx");
const TRAY = read("client/src/components/plan/ToolsTray.tsx");

describe("UI-2b — B-8: a chip is checked when its fact is saved", () => {
  it("C1 dates ⇒ Getting there; a stay ⇒ Where to stay; the Moment's reservation is kept", () => {
    assert.match(SLIP, /const datesSaved = \(data\.trip as any\)\?\.datesConfirmed === true;/, "dates read off the plan's own confirmation");
    // The SAME lodging predicate the day rows use (`{type, title}`) — not a second one.
    assert.match(
      SLIP,
      /const stayChosen = allActivities\.some\(\(a\) => isLodgingItem\(\{ type: a\.type, title: a\.name \}\)\);/,
      "a stay read off the rows the slip already has",
    );
    assert.match(SLIP, /if \(datesSaved\) done\.add\("getting_there"\);/);
    assert.match(SLIP, /if \(stayChosen\) \{[\s\S]{0,120}done\.add\("where_to_stay"\);[\s\S]{0,80}done\.add\("shared_lodging"\);/);
    assert.match(SLIP, /if \(momentAnchor\) done\.add\("the_reservation"\);/, "the Moment rule is unchanged");
    // No new ask, no derivation: the set is built from those three facts only.
    const block = SLIP.slice(SLIP.indexOf("const doneTools = useMemo"), SLIP.indexOf("}, [momentAnchor, datesSaved, stayChosen]);"));
    assert.equal((block.match(/done\.add\(/g) ?? []).length, 4, "four adds — the reservation, dates and the two lodging keys");
  });
});

describe("UI-2b — B-8: the count", () => {
  it("C2 'Travel party · N' from the stated party, never '· 0'", () => {
    assert.match(TRAY, /const count =\s*\n\s*\(key === "travel_party" \|\| key === "whos_coming"\) &&/, "only the party chips");
    assert.match(TRAY, /typeof props\.facts\?\.travelers === "number"/);
    assert.match(TRAY, /props\.facts\.travelers > 0/, "a party nobody stated draws no count (§13)");
    assert.match(TRAY, /\{count != null \? ` · \$\{count\}` : ""\}/, "the interpunct is the tray's own, no new string");
    assert.match(TRAY, /data-tool-count=\{count != null \? String\(count\) : undefined\}/);
  });
});

describe("UI-2b — B-9: the approved CTA", () => {
  it("C3 owner-only, and only on the tray's compare control", () => {
    assert.match(SLIP, /<SlipAnchorCompareButton tripId=\{tripId\} label="Compare places to stay" \/>/);
    // It sits inside the owner-gated tray block, not on any guest path.
    const trayAt = SLIP.indexOf("<ToolsTray");
    const gateAt = SLIP.indexOf("{isOwner && data.trip && slipView === \"list\" ? (");
    assert.ok(gateAt > 0 && trayAt > gateAt, "the tray — and so the CTA — is inside the isOwner gate");
    // The other caller keeps its OWN approved label.
    assert.match(SLIP, /<SlipAnchorCompareButton tripId=\{tripId\} label=\{ANCHOR_PANEL_ADD_PLACES\}/);
  });

  it("C4 the two strings are the approved ones, verbatim", () => {
    assert.ok(SLIP.includes('"Compare places to stay"'), "B-9's exact word");
    // No new copy for the count: it is appended to TOOL_LABEL's own text, never a hardcoded label.
    assert.match(
      TRAY,
      /\{TOOL_LABEL\[key\]\}\s*\{count != null \? ` · \$\{count\}` : ""\}/,
      "the label stays TOOL_LABEL's; only the count is appended",
    );
  });
});
