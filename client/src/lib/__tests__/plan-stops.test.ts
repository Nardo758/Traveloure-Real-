/**
 * PLAN STOPS — the reducer, and the four things it must never invent.
 * Ledger `2026-09-04-plan-stops-ui`; reader/reducer: `client/src/lib/plan-stops.ts`;
 * rows: `trip_destinations` (migration 281, CLAUDE.md Locked Decision 34).
 *
 * WHY THIS EXISTS. The list has rules that are invisible in the UI and identical for both surfaces
 * that edit it (the plan modal's step 2 and the location-mismatch dialog's "add this city as a
 * stop"): index 0 IS the plan's destination, a blank row is not a stop, a half coordinate is not a
 * placement, and the list can never be emptied. Every one of them is the kind that a component
 * quietly re-implements a second, slightly different way — so they live in a pure module and are
 * pinned here, with no React, no DOM and no fetch anywhere in sight.
 *
 *   S1  ordering — add / remove / move, and the invariants each must not break.
 *   S2  index 0 is the destination: it is never removed, and promoting a stop into it is allowed
 *       because that genuinely re-mirrors `trips.destination` (Locked Decision 34).
 *   S3  the payload is what gets SENT: trimmed, blank rows dropped, positions left to the server,
 *       and a HALF coordinate dropped rather than half-sent (the server refuses it outright).
 *   S4  `appendStopNamed` is idempotent BY CITY, not by string — it shares `locationsAgree` with
 *       the mismatch reader, so the dialog and the list can never disagree about "same city".
 *   S5  `seedStops` treats NO ROWS as NOT CAPTURED and falls back to `trips.destination`, and it
 *       never coerces an unparseable coordinate to 0 (0,0 is a real place).
 *   S6  the summary is a SEQUENCE and nothing more — no distance, no duration, no route.
 *
 * Pure unit: no DOM, no DB, no fetch.
 * Run: npx tsx --test client/src/lib/__tests__/plan-stops.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PLAN_STOPS,
  addStop,
  appendStopNamed,
  ensureFirstStop,
  isLocatedStop,
  moveStop,
  namedStops,
  removeStopAt,
  renameStopAt,
  seedStops,
  stopNameForLocation,
  stopSequence,
  stopsPayload,
  type PlanStop,
} from "../plan-stops";

const KYOTO: PlanStop = { name: "Kyoto, Japan" };
const OSAKA: PlanStop = { name: "Osaka" };
const NARA: PlanStop = { name: "Nara" };

/** The names in order — the only thing most of these assertions care about. */
const names = (stops: readonly PlanStop[]) => stops.map((s) => s.name);

describe("S1 — add, remove and move keep the list an ORDER", () => {
  it("addStop appends one empty row for the traveler to type into", () => {
    assert.deepEqual(names(addStop([KYOTO])), ["Kyoto, Japan", ""]);
  });

  it("addStop refuses past the cap rather than offering an add the server would reject", () => {
    const full = Array.from({ length: MAX_PLAN_STOPS }, (_, i) => ({ name: `Stop ${i}` }));
    assert.equal(addStop(full).length, MAX_PLAN_STOPS);
  });

  it("moveStop swaps by one and never wraps", () => {
    const list = [KYOTO, OSAKA, NARA];
    assert.deepEqual(names(moveStop(list, 2, "up")), ["Kyoto, Japan", "Nara", "Osaka"]);
    assert.deepEqual(names(moveStop(list, 0, "down")), ["Osaka", "Kyoto, Japan", "Nara"]);
    // Off both ends, and out of range entirely: no-ops, never a wrap and never a throw.
    assert.deepEqual(names(moveStop(list, 0, "up")), names(list));
    assert.deepEqual(names(moveStop(list, 2, "down")), names(list));
    assert.deepEqual(names(moveStop(list, 9, "up")), names(list));
    assert.deepEqual(names(moveStop(list, -1, "down")), names(list));
  });

  it("every operation returns a NEW array — the caller's list is never mutated in place", () => {
    const list = [KYOTO, OSAKA];
    const before = names(list);
    void addStop(list);
    void removeStopAt(list, 1);
    void moveStop(list, 0, "down");
    void renameStopAt(list, 0, "Tokyo");
    assert.deepEqual(names(list), before);
  });

  it("renameStopAt stores the name EXACTLY as typed — mid-word is not an answer to trim", () => {
    assert.deepEqual(names(renameStopAt([KYOTO], 0, "  Osak")), ["  Osak"]);
    assert.deepEqual(names(renameStopAt([KYOTO], 5, "Nope")), ["Kyoto, Japan"]);
  });
});

describe("S2 — index 0 is the plan's destination", () => {
  it("the last remaining row is never removed: a plan with zero stops is not a state", () => {
    // `trips.destination` is NOT NULL and the writer refuses an empty list with a 400.
    assert.deepEqual(names(removeStopAt([KYOTO], 0)), ["Kyoto, Japan"]);
    assert.deepEqual(names(removeStopAt([], 0)), [""]);
  });

  it("removing index 0 of a longer list PROMOTES the next stop", () => {
    assert.deepEqual(names(removeStopAt([KYOTO, OSAKA, NARA], 0)), ["Osaka", "Nara"]);
  });

  it("moving a stop into index 0 is allowed — it re-mirrors the plan's destination", () => {
    assert.deepEqual(names(moveStop([KYOTO, OSAKA], 1, "up")), ["Osaka", "Kyoto, Japan"]);
  });

  it("ensureFirstStop gives an empty list its destination row", () => {
    assert.deepEqual(ensureFirstStop([]), [{ name: "" }]);
  });
});

describe("S3 — the payload is what gets SENT, and it invents nothing", () => {
  it("trims names, drops blank rows, and carries no position (the server derives it)", () => {
    const payload = stopsPayload([
      { name: "  Kyoto, Japan  " },
      { name: "   " },
      { name: "Osaka", city: " Osaka ", country: "Japan" },
    ]);
    assert.deepEqual(payload, [
      { name: "Kyoto, Japan" },
      { name: "Osaka", city: "Osaka", country: "Japan" },
    ]);
    assert.ok(payload.every((row) => !("position" in row)));
  });

  it("a HALF coordinate is dropped, not half-sent", () => {
    assert.deepEqual(stopsPayload([{ name: "Kyoto", lat: 35.01 }]), [{ name: "Kyoto" }]);
    assert.deepEqual(stopsPayload([{ name: "Kyoto", lng: 135.76 }]), [{ name: "Kyoto" }]);
    assert.deepEqual(stopsPayload([{ name: "Kyoto", lat: 35.01, lng: 135.76 }]), [
      { name: "Kyoto", lat: 35.01, lng: 135.76 },
    ]);
  });

  it("a placement of 0,0 is kept — it is a coordinate, not a missing one", () => {
    assert.deepEqual(stopsPayload([{ name: "Null Island", lat: 0, lng: 0 }]), [
      { name: "Null Island", lat: 0, lng: 0 },
    ]);
    assert.equal(isLocatedStop({ name: "x", lat: 0, lng: 0 }), true);
    assert.equal(isLocatedStop({ name: "x" }), false);
    assert.equal(isLocatedStop(undefined), false);
  });

  it("a list with nothing named yields an EMPTY payload, and the caller then writes nothing", () => {
    assert.deepEqual(stopsPayload([{ name: "" }, { name: "  " }]), []);
  });
});

describe("S4 — appendStopNamed is idempotent by CITY", () => {
  it('adds the listing\'s city as a plain named stop — no coordinates are invented for it', () => {
    const next = appendStopNamed([KYOTO], "Osaka");
    assert.deepEqual(next, [KYOTO, { name: "Osaka" }]);
    assert.equal(isLocatedStop(next[1]), false);
  });

  it("does not add a city the plan already names, in either spelling direction", () => {
    assert.deepEqual(names(appendStopNamed([KYOTO], "Kyoto")), ["Kyoto, Japan"]);
    assert.deepEqual(names(appendStopNamed([{ name: "Kyoto" }], "Kyoto, Japan")), ["Kyoto"]);
    assert.deepEqual(names(appendStopNamed([KYOTO, OSAKA], "  osaka  ")), ["Kyoto, Japan", "Osaka"]);
  });

  it("still adds a NEAR-miss city — the same prefix rule the alert itself used", () => {
    assert.deepEqual(names(appendStopNamed([{ name: "New York" }], "York")), ["New York", "York"]);
  });

  it("a blank name adds nothing: there is no city to add", () => {
    assert.deepEqual(names(appendStopNamed([KYOTO], "   ")), ["Kyoto, Japan"]);
  });

  it("fills an EMPTY destination row rather than hanging a stop off a blank headline", () => {
    assert.deepEqual(names(appendStopNamed([{ name: "" }], "Osaka")), ["Osaka"]);
  });

  it("refuses past the cap", () => {
    const full = Array.from({ length: MAX_PLAN_STOPS }, (_, i) => ({ name: `City ${i}` }));
    assert.equal(appendStopNamed(full, "One More").length, MAX_PLAN_STOPS);
  });

  it("stopNameForLocation names the listing's own city, sentinel-aware", () => {
    assert.equal(stopNameForLocation("Gion, Kyoto, Japan"), "Gion");
    assert.equal(stopNameForLocation("Unknown"), "");
    assert.equal(stopNameForLocation(null), "");
  });
});

describe("S5 — seedStops: no rows means NOT CAPTURED, never 'no stops'", () => {
  it("falls back to trips.destination when the plan has no child rows", () => {
    assert.deepEqual(seedStops("Kyoto, Japan", []), [{ name: "Kyoto, Japan" }]);
    assert.deepEqual(seedStops("Kyoto, Japan", null), [{ name: "Kyoto, Japan" }]);
    assert.deepEqual(seedStops("Kyoto, Japan", undefined), [{ name: "Kyoto, Japan" }]);
    assert.deepEqual(seedStops(null, null), [{ name: "" }]);
  });

  it("reads the rows in the order given, coordinates included when both parse", () => {
    assert.deepEqual(
      seedStops("Edinburgh", [
        { name: "Edinburgh", country: "Scotland", lat: "55.95", lng: "-3.19" },
        { name: "St Andrews" },
      ]),
      [
        { name: "Edinburgh", country: "Scotland", lat: 55.95, lng: -3.19 },
        { name: "St Andrews" },
      ],
    );
  });

  it("an unparseable or half coordinate leaves the stop UNLOCATED, never at 0,0", () => {
    const [stop] = seedStops("Edinburgh", [{ name: "Edinburgh", lat: "not-a-number", lng: "-3.19" }]);
    assert.equal(isLocatedStop(stop), false);
    assert.equal(stop.lat, undefined);
    const [half] = seedStops("Edinburgh", [{ name: "Edinburgh", lat: "55.95", lng: null }]);
    assert.equal(isLocatedStop(half), false);
  });
});

describe("S6 — the summary is a sequence, not a route", () => {
  it("joins the NAMED stops in order with an arrow", () => {
    assert.equal(
      stopSequence([{ name: "Edinburgh" }, { name: "  " }, { name: "St Andrews" }, { name: "Dornoch" }]),
      "Edinburgh → St Andrews → Dornoch",
    );
    assert.equal(namedStops([{ name: "Edinburgh" }, { name: "" }]).length, 1);
  });

  it("says nothing when nothing is named", () => {
    assert.equal(stopSequence([{ name: "" }]), "");
  });

  it("claims no distance, duration or travel of any kind", () => {
    const summary = stopSequence([{ name: "Edinburgh" }, { name: "Dornoch" }]);
    assert.ok(!/\bkm\b|\bmiles?\b|\bmin(ute)?s?\b|\bhours?\b|\bdrive\b|\bdistance\b/i.test(summary));
  });
});
