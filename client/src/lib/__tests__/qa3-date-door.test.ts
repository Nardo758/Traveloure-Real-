/**
 * QA round 3 PR 2, item 3 (Leon, Nov 11, 2026): a date-first door that carried NO occasion, group or experience lands
 * on Step 2 (the occasion) — never on dates and party, never on a minted plan. E2's carried-occasion skips stand.
 *
 *   Q1 the table: the eight date-first paths checked in a browser on main (f258c13), plus QA's reported path —
 *      each row's state is built the way PlanEntry builds it (`initialPlanEntry(source)`, then the date door's own
 *      moves: "A date", the preset's dates, the city chip). Step 1's forward control goes to "occasion", and the pop-up
 *      offers no Start on Step 1 (inline, the page's Continue is the same move).
 *   Q2 the carried-occasion doors are by design (E2): an event, a door's occasion slug, a door-chosen group and H-10's
 *      carried experience go to "details" — the occasion was already answered.
 *   Q3 PlanEntry reads these two rules and restates neither.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/qa3-date-door.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  doorChoseGroup,
  initialPlanEntry,
  startOfferedOnAround,
  stepAfterAround,
  type PlanEntrySource,
  type PlanEntryState,
} from "../plan-entry";
import { OPERATING_MARKETS } from "@shared/operating-markets";

const KYOTO = OPERATING_MARKETS.find((m) => m.marketKey === "kyoto")!;

/** The date door's own moves on top of the door's starting state: "A date", the preset's range, the Kyoto chip. */
function afterDateDoor(source: PlanEntrySource | null, range: { startDate: string; endDate: string }): PlanEntryState {
  const { state } = initialPlanEntry(source);
  return { ...state, around: "date", event: null, night: null, ...range, market: KYOTO as any };
}

type Row = { path: string; source: PlanEntrySource | null; inline: boolean; range: { startDate: string; endDate: string } };
const WEEKEND = { startDate: "2026-11-14", endDate: "2026-11-15" };
const NEXT_MONTH = { startDate: "2026-12-03", endDate: "2026-12-05" };
const DEC_1_4 = { startDate: "2026-12-01", endDate: "2026-12-04" };

const rows: Row[] = [
  { path: "nav pop-up (/?start=1) · This weekend · Kyoto · 1280px", source: null, inline: false, range: WEEKEND },
  { path: "nav pop-up (/?start=1) · Pick dates · Kyoto · 1280px", source: null, inline: false, range: NEXT_MONTH },
  { path: "/experiences inline · This weekend · Kyoto · 1280px", source: null, inline: true, range: WEEKEND },
  { path: "/experiences?group=trips inline · This weekend · Kyoto", source: { group: "trips", onlyGroup: "trips" } as PlanEntrySource, inline: true, range: WEEKEND },
  { path: "/experiences?group=celebrations inline · This weekend · Kyoto", source: { group: "celebrations", onlyGroup: "celebrations" } as PlanEntrySource, inline: true, range: WEEKEND },
  { path: "/experiences inline · Next month · Kyoto · 375px", source: null, inline: true, range: NEXT_MONTH },
  { path: "/experiences inline · Pick dates · Kyoto · 375px", source: null, inline: true, range: NEXT_MONTH },
  // QA round 3 (prod 47989fa; PlanEntry and plan-entry.ts unchanged to f258c13): a fresh guest, header "Start a plan"
  // → /?start=1&step=around → "A date" → "Pick dates" → Dec 1–4 → the "Kyoto" chip under "What's on Dec 1–4".
  { path: "QA: /?start=1&step=around · Pick dates Dec 1–4 · Kyoto chip under What's on", source: null, inline: false, range: DEC_1_4 },
];

describe("QA round 3 — a date-first door with no occasion lands on Step 2", () => {
  for (const row of rows) {
    it(`Q1 ${row.path}`, () => {
      const state = afterDateDoor(row.source, row.range);
      assert.equal(state.occasionSlug, null, "the door carried no occasion");
      const groupChosen = doorChoseGroup(row.source);
      assert.equal(groupChosen, false, "a ?group= filter is not a chosen group (R3-6)");
      assert.equal(stepAfterAround({ state, groupChosen, askDatesAndParty: row.source?.askDatesAndParty }), "occasion", "Step 1 → Step 2");
      // The pop-up draws only "Next" on Step 1; inline the page's Continue is drawn, and its press is the move above.
      assert.equal(startOfferedOnAround({ inline: row.inline, state }), row.inline, row.inline ? "inline Continue" : "no Start on Step 1");
    });
  }

  it("Q2 carried-occasion doors go to dates and party (E2, by design)", () => {
    const base = afterDateDoor(null, DEC_1_4);
    assert.equal(stepAfterAround({ state: { ...base, occasionSlug: "wedding" }, groupChosen: false }), "details", "a door's occasion slug");
    assert.equal(stepAfterAround({ state: base, groupChosen: true }), "details", "a door-chosen group");
    assert.equal(stepAfterAround({ state: base, groupChosen: false, askDatesAndParty: true }), "details", "H-10's carried experience");
    assert.equal(stepAfterAround({ state: { ...base, event: { title: "x" } as any }, groupChosen: false }), "details", "an event");
    assert.equal(startOfferedOnAround({ inline: false, state: { ...base, occasionSlug: "wedding" } }), true, "a carried occasion may start from Step 1");
    assert.equal(stepAfterAround({ state: { ...base, market: null }, groupChosen: false }), null, "no city ⇒ nothing to move to");
  });

  it("Q3 PlanEntry reads the two rules", () => {
    const src = fs.readFileSync("client/src/components/plan/PlanEntry.tsx", "utf8");
    assert.match(src, /const next = stepAfterAround\(\{ state, groupChosen, askDatesAndParty: source\?\.askDatesAndParty \}\);/);
    assert.match(src, /\(step !== "around" \|\| startOfferedOnAround\(\{ inline, state \}\)\) && \(/);
    assert.doesNotMatch(src, /const known = /, "the decision is not restated in the component");
  });
});
