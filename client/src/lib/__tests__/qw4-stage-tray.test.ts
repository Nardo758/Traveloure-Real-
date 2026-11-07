/**
 * QW-4 (Leon, Nov 7): the tray is stage-aware. A tool is drawn only once its question can be answered;
 * an unmet gate whose fact is a chip on the plan (dates, party) keeps the chip and routes its press to
 * that chip; only a fact the slip cannot supply (located stops, an event/item) hides the chip.
 *
 *   T1 Getting there gates on the DATES (the arrival leg exists before any stop does)
 *   T2 Who pays what gates on the PARTY only (prices are hidden in waitlist, so a priced-stop gate would never open)
 *   T3 Run of show / Timing check need ONE item (the tool is how you give things times)
 *   T4 Getting around needs two located stops — hidden, because a point is not a chip
 *   T5 Pace needs two items — hidden
 *   T6 Arrivals & split groups: dates first, then party
 *   T7 the wiring: the tray filters on `hidden`, routes `dates`/`party`, and the slip hands it the facts
 *
 * Run: npx tsx --test client/src/lib/__tests__/qw4-stage-tray.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { trayPress, type TrayFacts } from "../tray-stage";

const base: TrayFacts = { datesConfirmed: true, travelers: 2, stops: 3 };
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("QW-4 — stage-aware tray", () => {
  it("T1 Getting there gates on the dates", () => {
    assert.equal(trayPress("getting_there", { ...base, datesConfirmed: false }), "dates");
    assert.equal(trayPress("getting_there", base), "sheet");
  });

  it("T2 Who pays what gates on the party, never on a price", () => {
    assert.equal(trayPress("who_pays_what", { ...base, travelers: 1 }), "party");
    assert.equal(trayPress("who_pays_what", { ...base, travelers: null }), "party");
    assert.equal(trayPress("who_pays_what", base), "sheet");
    assert.equal(trayPress("split_activities", { ...base, travelers: 1 }), "party");
  });

  it("T3 Run of show / Timing check need one item", () => {
    assert.equal(trayPress("run_of_show", { ...base, stops: 0 }), "hidden");
    assert.equal(trayPress("run_of_show", { ...base, stops: 1 }), "sheet");
    assert.equal(trayPress("timing_check", { ...base, stops: 0 }), "hidden");
    assert.equal(trayPress("timing_check", { ...base, stops: 1 }), "sheet");
  });

  it("T4 Getting around needs two stops, and hides when the plan has fewer", () => {
    assert.equal(trayPress("getting_around", { ...base, stops: 1 }), "hidden");
    assert.equal(trayPress("getting_around", { ...base, stops: 2 }), "sheet");
  });

  it("T5 Pace needs two items", () => {
    assert.equal(trayPress("pace", { ...base, stops: 1 }), "hidden");
    assert.equal(trayPress("pace", { ...base, stops: 2 }), "sheet");
  });

  it("T6 Arrivals & split groups: dates first, then party", () => {
    assert.equal(trayPress("arrivals_split_groups", { ...base, datesConfirmed: false }), "dates");
    assert.equal(trayPress("arrivals_split_groups", { ...base, travelers: 1 }), "party");
    assert.equal(trayPress("arrivals_split_groups", base), "sheet");
  });

  it("T7 the wiring: filter, route, and facts", () => {
    const tray = read("client/src/components/plan/ToolsTray.tsx");
    assert.match(tray, /trayPress\(k, p\.facts\) !== "hidden"/);
    assert.match(tray, /if \(press === "dates" && props\.onNeedDates\) return props\.onNeedDates\(\);/);
    assert.match(tray, /if \(press === "party" && props\.onNeedParty\) return props\.onNeedParty\(\);/);
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /stops: allActivities\.length/);
    assert.match(slip, /onNeedDates=\{\(\) => setTrayChip\("dates"\)\}/);
    assert.match(slip, /onNeedParty=\{askParty \? \(\) => setTrayChip\("who"\) : undefined\}/);
    // The press opens the panels the header chips open — not a new surface.
    assert.match(slip, /trayChip === "dates" && data\.trip \? \(\s*<InlineDatesPanel/);
    assert.match(slip, /trayChip === "who" && data\.trip \? \(\s*<InlineWhoPanel/);
  });
});
