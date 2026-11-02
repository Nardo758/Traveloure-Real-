/**
 * Row PS-3 — the edit window's When and Who read the plan row, not only the browser pen
 * (audit D1–D3, D17; ledger `2026-11-02-ps3-edit-window-reads-trip-row`).
 *
 *   T1  a plan with confirmed dates and adults 2 / kids 1: When and Who open filled.
 *   T2  a plan whose window is a placeholder: When opens blank; Who is still filled.
 *   T3  after the inline "Who's coming?" (and "Set your dates") save, the pen holds the new answer.
 *   T4  switching the pen to a different plan clears the previous plan's adults/kids; a same-plan
 *       re-sync keeps them.
 *   T5  number_of_travelers = 3 and no adults: Who opens as 3 adults, 0 children.
 *   T6  the destination seed is unchanged (the stop list still seeds from the pen).
 *
 * No DOM, no React render: the seed is the pure `seedFromTripRow`; the pen is the real module over
 * an in-memory sessionStorage, as `rc345-active-plan.test.ts` does it.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-ps3-edit-window-seed.test.tsx
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  get length() {
    return store.size;
  },
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
(globalThis as any).CustomEvent = class {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
};
(globalThis as any).window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
(globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ context: {} }) }) as unknown as Response;

import { seedFromPen, seedFromTripRow } from "../../../lib/edit-window-seed";
import {
  getTripContext,
  switchTripContext,
  switchTripContextPreservingId,
  updateTripContext,
  writePlanAnswersToContext,
} from "../../../lib/trip-context";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

beforeEach(() => store.clear());

describe("PS-3 — the edit window reads the plan row", () => {
  it("T1 confirmed dates + adults 2 / kids 1 open filled", () => {
    const seed = seedFromTripRow(
      { startDate: "2027-04-10", endDate: "2027-04-14", datesConfirmedAt: "2026-11-01T10:00:00Z", adults: 2, kids: 1 },
      {},
    );
    assert.deepEqual(seed, { startDate: "2027-04-10", endDate: "2027-04-14", adults: "2", kids: "1" });
  });

  it("T2 a placeholder window opens blank; Who is still filled — and the pen's copy of the placeholder is not used", () => {
    const seed = seedFromTripRow(
      { startDate: "2026-11-02", endDate: "2026-11-02", datesConfirmedAt: null, adults: 2, kids: null },
      { startDate: "2026-11-02", endDate: "2026-11-02" },
    );
    assert.equal(seed.startDate, "");
    assert.equal(seed.endDate, "");
    assert.equal(seed.adults, "2");
    assert.equal(seed.kids, "");
  });

  it("T3 the inline panels' saves land in the pen, and only for the plan the pen names", () => {
    switchTripContext({ tripId: "trip-a", destination: "Kyoto" });
    writePlanAnswersToContext("trip-a", { adults: 3, kids: 2 });
    assert.equal(getTripContext().adults, 3);
    assert.equal(getTripContext().kids, 2);
    writePlanAnswersToContext("trip-a", { startDate: "2027-05-01", endDate: "2027-05-04" });
    assert.equal(getTripContext().startDate, "2027-05-01");
    assert.equal(getTripContext().endDate, "2027-05-04");
    // A save that sends only adults leaves kids as it was; a kids answer of 0 is removed, never kept as 0.
    writePlanAnswersToContext("trip-a", { adults: 4 });
    assert.equal(getTripContext().kids, 2);
    writePlanAnswersToContext("trip-a", { kids: 0 });
    assert.equal(getTripContext().kids, undefined);
    // Another plan's write never touches this pen.
    assert.equal(writePlanAnswersToContext("trip-b", { adults: 9 }), null);
    assert.equal(getTripContext().adults, 4);

    const panels = read("client/src/components/plan/SlipAnchorPanels.tsx");
    assert.match(panels, /`\/api\/trips\/\$\{tripId\}`, \{ startDate: start, endDate: end \}\);\n.*\n\s+writePlanAnswersToContext\(tripId, \{ startDate: start, endDate: end \}\);/);
    assert.match(panels, /`\/api\/trips\/\$\{tripId\}\/occasion`, body\);[\s\S]{0,400}writePlanAnswersToContext\(tripId, party\);/);
  });

  it("T4 a switch to a different plan clears adults/kids; a same-plan re-sync keeps them", () => {
    switchTripContext({ tripId: "trip-a", destination: "Kyoto" });
    updateTripContext({ adults: 2, kids: 1 });
    switchTripContextPreservingId({ destination: "Kyoto", title: "Kyoto, renamed" });
    assert.equal(getTripContext().tripId, "trip-a");
    assert.equal(getTripContext().adults, 2, "the same plan keeps its party");
    switchTripContext({ tripId: "trip-b", destination: "Osaka" });
    assert.equal(getTripContext().adults, undefined);
    assert.equal(getTripContext().kids, undefined);
    // The new plan's mint writes its own saved party back after the switch.
    const ctx = read("client/src/contexts/PlanningContext.tsx");
    assert.match(ctx, /switchTripContext\(\{\n\s+tripId,[\s\S]{0,600}writePlanAnswersToContext\(tripId, savedParty\);/);
  });

  it("T5 number_of_travelers = 3 and no adults: Who opens 3 / 0", () => {
    const seed = seedFromTripRow({ numberOfTravelers: 3, adults: null, kids: null }, { adults: 5 });
    assert.equal(seed.adults, "3");
    assert.equal(seed.kids, "0");
  });

  it("T6 the destination seed is unchanged, and the window falls back to the pen without a row", () => {
    const modal = read("client/src/components/trip/plan-modal.tsx");
    assert.match(modal, /const seeded = seedStops\(ctx\.destination, ctx\.stops\);/);
    assert.match(modal, /const fromTrip = seedStops\(boundTrip\.destination, boundTrip\.destinations\);/);
    // The row seed runs once per open, from the same bound-plan read, and never for a new plan.
    assert.match(modal, /const contextTripId = source\?\.newPlan \? "" : ctx\.tripId \?\? "";/);
    assert.match(modal, /enabled: open && contextTripId !== "",/);
    assert.match(modal, /const fromRow = seedFromTripRow\(boundTrip, ctx\);/);
    // No row (guest, no plan, failed read) ⇒ exactly the pen's answer, as before.
    assert.deepEqual(seedFromTripRow(null, { startDate: "2027-01-02", endDate: "2027-01-03", adults: 2 }), {
      startDate: "2027-01-02",
      endDate: "2027-01-03",
      adults: "2",
      kids: "",
    });
    assert.deepEqual(seedFromPen({}), { startDate: "", endDate: "", adults: "", kids: "" });
  });
});
