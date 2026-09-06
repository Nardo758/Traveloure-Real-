/**
 * OWN YOUR PLAN — the owner adds, edits, deletes and reorders on the slip, and a booked row is
 * never deletable. Ledger `2026-09-05-slip-own-your-plan`; CLAUDE.md Locked Decision 42 rows
 * 1.6 / S1 / S2 / D16, Locked Decision 39, Locked Decision 29, §13, §14, §18 rule 1.
 *
 * WHY THIS EXISTS. Every rule this lane ships is invisible on happy-path data:
 *
 *  · D16 is a RENDER rule, so an advisor who is wrongly handed a ✕ sees a button that works right
 *    up until the server's own gate refuses it — or, worse, does not (the Workstation rails are
 *    write-capable for an accepted advisor). Nothing goes red; the plan just grows a second edit
 *    surface nobody ruled.
 *  · The money rules are about a row that LOOKS ordinary. A booked row renders like any other, and
 *    a ✕ on it destroys the only plan-side link to a `service_bookings` row with no code path in
 *    this repo to put it back (§15). The absence of a button leaves no trace to test after the
 *    fact, which is exactly why it is asserted here.
 *  · §14's rule is about a field that is NOT sent. A cost field added to the add form would be
 *    accepted by the server, stored, and read as a number on the traveler's plan — and no test
 *    that only checks what IS in the body would notice.
 *  · The reorder request needs TWO lists (the day's, and the group's) and would appear to work
 *    with one: sending only the group's ids renumbers `sort_order` for the whole day from a
 *    partial list, silently reordering rows the traveler never touched.
 *
 * What these hold:
 *   T1  D16 — every tool is the owner's; a non-owner gets an empty toolset on every row shape.
 *   T2  the money rules — paid ⇒ no tools; booked ⇒ ↑ ✎ and no ✕; plain ⇒ all three.
 *   T3  the add body — the event link rides (id AND explicit null), no money field is emitted,
 *       empty optionals are omitted rather than sent as "", notes land on `description`.
 *   T4  the edit body — only what changed, a cleared field as `null`, and never `expertNote`.
 *   T5  reorder — the DAY's list with a GROUP-neighbour swap; null at the ends of a group.
 *   T6  which day a hand-added item lands on, and when the answer is honestly "we don't know".
 *   T7  the four rails are the EXISTING ones (URL pins).
 *   A1-A5 the shipped wiring: the slip renders the tools through the owner-gated predicate, the
 *       add control on the event header and on the day, and the component sends nothing else.
 *
 * Pure unit + static source pins: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/slip-own-your-plan.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSlipAddItemBody,
  buildSlipEditItemBody,
  canReorderInDirection,
  EMPTY_SLIP_ITEM_FORM,
  reorderedDayItemIds,
  resolveAddDayNumber,
  slipItemTools,
  SLIP_ADD_DAY_LABEL,
  SLIP_ADD_EVENT_LABEL,
  SLIP_ITEM_ENDPOINTS,
  type SlipItemFormValues,
} from "../slip-item-tools";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const slipViewSrc = readFileSync(
  join(ROOT, "client", "src", "components", "plancard", "SlipView.tsx"),
  "utf8",
);
const toolsSrc = readFileSync(
  join(ROOT, "client", "src", "components", "plancard", "SlipItemTools.tsx"),
  "utf8",
);

const PLAIN = { routingStatus: "in_planning", bookingId: null };
const IN_CHECKOUT = { routingStatus: "ready_for_checkout", bookingId: null };
const BOOKED = { routingStatus: "ready_for_checkout", bookingId: "bk_1" };
const PAID = { routingStatus: "purchased", bookingId: "bk_2" };
const PAID_NO_BOOKING = { routingStatus: "purchased", bookingId: null };

function form(over: Partial<SlipItemFormValues> = {}): SlipItemFormValues {
  return { ...EMPTY_SLIP_ITEM_FORM, ...over };
}

describe("T1 — D16: the slip's edit controls are the OWNER'S", () => {
  it("hands a non-owner nothing, whatever the row is", () => {
    for (const row of [PLAIN, IN_CHECKOUT, BOOKED, PAID]) {
      assert.deepEqual(slipItemTools({ isOwner: false, ...row }), {
        reorder: false,
        edit: false,
        remove: false,
      });
    }
  });

  it("is the ONLY thing that changes between the two viewers on a plain row", () => {
    assert.deepEqual(slipItemTools({ isOwner: true, ...PLAIN }), {
      reorder: true,
      edit: true,
      remove: true,
    });
  });
});

describe("T2 — a booked row is money", () => {
  it("gives a plain planning row all three tools", () => {
    assert.deepEqual(slipItemTools({ isOwner: true, ...PLAIN }), {
      reorder: true,
      edit: true,
      remove: true,
    });
  });

  it("takes ✕ off a row that carries a booking, and keeps ↑ and ✎", () => {
    assert.deepEqual(slipItemTools({ isOwner: true, ...BOOKED }), {
      reorder: true,
      edit: true,
      remove: false,
    });
  });

  it("takes every tool off a PAID row — with or without a booking id on the row", () => {
    for (const row of [PAID, PAID_NO_BOOKING]) {
      assert.deepEqual(slipItemTools({ isOwner: true, ...row }), {
        reorder: false,
        edit: false,
        remove: false,
      });
    }
  });

  it("leaves a not-yet-charged checkout row fully removable — §13: it is not booked", () => {
    // The rebuild guard spares this row from a MACHINE wipe; a traveler taking it out of their own
    // checkout queue is a different act, and refusing it as "item_booked" would be a false claim.
    assert.deepEqual(slipItemTools({ isOwner: true, ...IN_CHECKOUT }), {
      reorder: true,
      edit: true,
      remove: true,
    });
  });

  it("treats an absent routing status and an absent booking as no commitment", () => {
    assert.equal(slipItemTools({ isOwner: true }).remove, true);
  });
});

describe("T3 — S1: the add body", () => {
  const ctx = { dayNumber: 2, userExperienceId: "ev-ceremony" };

  it("carries the event link so the row lands under the event that was pressed", () => {
    const body = buildSlipAddItemBody(form({ title: "Florist drop-off" }), ctx)!;
    assert.equal(body.userExperienceId, "ev-ceremony");
    assert.equal(body.dayNumber, 2);
    assert.equal(body.title, "Florist drop-off");
  });

  it("sends an EXPLICIT null for the plan's implicit unnamed event — an answer, not an absence", () => {
    const body = buildSlipAddItemBody(form({ title: "Coffee" }), {
      dayNumber: 1,
      userExperienceId: null,
    })!;
    assert.ok("userExperienceId" in body, "the key must be present — the server reads its presence");
    assert.equal(body.userExperienceId, null);
  });

  it("emits NO money field of any kind (§14)", () => {
    const body = buildSlipAddItemBody(
      form({ title: "Dinner", startTime: "19:00", locationName: "Kiyamachi", notes: "quiet room" }),
      ctx,
    )!;
    for (const key of Object.keys(body)) {
      assert.doesNotMatch(
        key,
        /cost|price|amount|currency|fee|rate|payout|share/i,
        `the slip's add form must never send ${key}`,
      );
    }
    assert.deepEqual(Object.keys(body).sort(), [
      "dayNumber",
      "description",
      "locationName",
      "startTime",
      "title",
      "userExperienceId",
    ]);
  });

  it("OMITS an untouched optional rather than sending \"\" (§13)", () => {
    const body = buildSlipAddItemBody(form({ title: "Walk" }), ctx)!;
    assert.equal("startTime" in body, false);
    assert.equal("locationName" in body, false);
    assert.equal("description" in body, false);
  });

  it("puts the traveler's notes on `description` — never on `expertNote` (D4)", () => {
    const body = buildSlipAddItemBody(form({ title: "Walk", notes: "bring a coat" }), ctx)!;
    assert.equal(body.description, "bring a coat");
    assert.equal("expertNote" in body, false);
  });

  it("refuses a blank title rather than posting a row with no name", () => {
    assert.equal(buildSlipAddItemBody(form({ title: "   " }), ctx), null);
  });
});

describe("T4 — S2: the edit body", () => {
  const before = form({ title: "Dinner", startTime: "19:00", locationName: "Kiyamachi", notes: "n" });

  it("sends only what changed", () => {
    const body = buildSlipEditItemBody({ ...before, title: "Late dinner" }, before)!;
    assert.deepEqual(body, { title: "Late dinner" });
  });

  it("sends null for a cleared optional — the column's NULL is how 'cleared' is recorded", () => {
    const body = buildSlipEditItemBody({ ...before, startTime: "" }, before)!;
    assert.deepEqual(body, { startTime: null });
  });

  it("sends nothing at all when nothing changed", () => {
    assert.equal(buildSlipEditItemBody(before, before), null);
  });

  it("refuses to empty the title (the column is NOT NULL)", () => {
    assert.equal(buildSlipEditItemBody({ ...before, title: "" }, before), null);
  });

  it("never carries expertNote, origin, suggestedBy, routingStatus or bookingId", () => {
    const body = buildSlipEditItemBody(
      { title: "A", startTime: "08:00", locationName: "B", notes: "C" },
      EMPTY_SLIP_ITEM_FORM,
    )!;
    assert.deepEqual(Object.keys(body).sort(), ["description", "locationName", "startTime", "title"]);
  });
});

describe("T5 — reorder sends the DAY's list, swapped by GROUP neighbour", () => {
  // A day whose stored order interleaves two events: the ceremony rows sit at 0 and 2.
  const dayItemIds = ["a", "x", "b", "y"];
  const groupItemIds = ["a", "b"];

  it("swaps the row with its neighbour IN THE GROUP, inside the day's full list", () => {
    assert.deepEqual(
      reorderedDayItemIds({ dayItemIds, groupItemIds, itemId: "b", direction: -1 }),
      ["b", "x", "a", "y"],
    );
  });

  it("returns the WHOLE day — a partial list would renumber rows nobody touched", () => {
    const out = reorderedDayItemIds({ dayItemIds, groupItemIds, itemId: "a", direction: 1 })!;
    assert.equal(out.length, dayItemIds.length);
    assert.deepEqual([...out].sort(), [...dayItemIds].sort());
  });

  it("has nowhere to go at either end of the group", () => {
    assert.equal(reorderedDayItemIds({ dayItemIds, groupItemIds, itemId: "a", direction: -1 }), null);
    assert.equal(reorderedDayItemIds({ dayItemIds, groupItemIds, itemId: "b", direction: 1 }), null);
    assert.equal(canReorderInDirection({ dayItemIds, groupItemIds, itemId: "a", direction: -1 }), false);
    assert.equal(canReorderInDirection({ dayItemIds, groupItemIds, itemId: "a", direction: 1 }), true);
  });

  it("refuses rather than guesses when the two reads disagree", () => {
    assert.equal(
      reorderedDayItemIds({ dayItemIds: ["a"], groupItemIds, itemId: "a", direction: 1 }),
      null,
    );
    assert.equal(
      reorderedDayItemIds({ dayItemIds, groupItemIds, itemId: "zz", direction: 1 }),
      null,
    );
  });
});

describe("T6 — which day a hand-added item lands on", () => {
  it("uses the slot's own day when it has one", () => {
    assert.equal(resolveAddDayNumber({ dayNum: 3, dateIso: "2026-10-04", tripStartDate: "2026-10-02" }), 3);
  });

  it("derives it from the calendar date — the inverse of the server's own dayDateIso", () => {
    assert.equal(resolveAddDayNumber({ dayNum: null, dateIso: "2026-10-02", tripStartDate: "2026-10-02" }), 1);
    assert.equal(resolveAddDayNumber({ dayNum: null, dateIso: "2026-10-04", tripStartDate: "2026-10-02" }), 3);
    // A timestamp-shaped start date is read as its calendar day, never re-zoned.
    assert.equal(
      resolveAddDayNumber({ dayNum: null, dateIso: "2026-10-04", tripStartDate: "2026-10-02T00:00:00.000Z" }),
      3,
    );
  });

  it("answers NULL rather than inventing day 1 (§13)", () => {
    // No date at all (an undated event on a plan with no items).
    assert.equal(resolveAddDayNumber({ dayNum: null, dateIso: null, tripStartDate: "2026-10-02" }), null);
    // No start date to count from.
    assert.equal(resolveAddDayNumber({ dayNum: null, dateIso: "2026-10-04", tripStartDate: null }), null);
    // A date BEFORE the plan starts is not day 0 and is not clamped to day 1.
    assert.equal(resolveAddDayNumber({ dayNum: null, dateIso: "2026-10-01", tripStartDate: "2026-10-02" }), null);
    // An unparseable value is not repaired.
    assert.equal(resolveAddDayNumber({ dayNum: null, dateIso: "October 4", tripStartDate: "2026-10-02" }), null);
  });
});

describe("T7 — the four rails already existed", () => {
  it("pins each URL to the endpoint the platform already serves", () => {
    assert.equal(SLIP_ITEM_ENDPOINTS.add("t1"), "/api/trips/t1/itinerary-items");
    assert.equal(SLIP_ITEM_ENDPOINTS.edit("t1", "i1"), "/api/trips/t1/itinerary-items/i1");
    assert.equal(SLIP_ITEM_ENDPOINTS.remove("t1", "i1"), "/api/trips/t1/itinerary-items/i1");
    assert.equal(SLIP_ITEM_ENDPOINTS.reorder("t1"), "/api/trips/t1/itinerary/reorder");
  });

  it("uses the Workstation's own reorder request shape — { dayNumber, itemIds }", () => {
    assert.match(toolsSrc, /SLIP_ITEM_ENDPOINTS\.reorder\(tripId\)[\s\S]{0,120}dayNumber,[\s\S]{0,40}itemIds/);
  });
});

describe("A1 — the slip renders the tools through the owner-gated predicate", () => {
  it("computes the toolset from `slipItemTools` with `isOwner`, and never inline", () => {
    assert.match(slipViewSrc, /slipItemTools\(\{\s*\n?\s*isOwner,/);
    assert.match(slipViewSrc, /<SlipItemTools/);
    // The row passes the SHARED money facts, not a re-derived local rule.
    assert.match(slipViewSrc, /routingStatus: a\.routingStatus \?\? null,/);
    assert.match(slipViewSrc, /bookingId: a\.booking\?\.id \?\? null,/);
  });

  it("mounts the add control on the event header AND at day level", () => {
    assert.match(slipViewSrc, /<SlipAddItemControl[\s\S]{0,320}userExperienceId=\{event\.id\}/);
    assert.match(slipViewSrc, /<SlipAddItemControl[\s\S]{0,320}userExperienceId=\{null\}/);
    assert.match(slipViewSrc, /SLIP_ADD_EVENT_LABEL/);
    assert.match(slipViewSrc, /SLIP_ADD_DAY_LABEL/);
    // D16 — the day-level control is inside an owner branch.
    assert.match(slipViewSrc, /\{isOwner && addDayNumber != null && \(\s*\n\s*<div className="px-3 pt-1\.5 pb-0\.5">/);
  });

  it("keeps the labels the ratified artboards draw", () => {
    assert.equal(SLIP_ADD_EVENT_LABEL, "Add something to this event");
    assert.equal(SLIP_ADD_DAY_LABEL, "Add something to this day");
  });
});

describe("A2 — the component talks to nothing else", () => {
  it("names only the four shared rails, and hand-writes no WRITE url of its own", () => {
    // Every request this component makes goes through the shared table. (The two `queryKey`
    // strings are READS of endpoints other surfaces already own — the plancard and the item list
    // the edit form prefills from — and are deliberately outside this predicate.)
    const calls = [...toolsSrc.matchAll(/apiRequest\(\s*"[A-Z]+",\s*([^,)]+)/g)].map((m) => m[1].trim());
    assert.ok(calls.length >= 4, `expected the four rails, found ${calls.length}`);
    for (const url of calls) {
      assert.ok(
        url.startsWith("SLIP_ITEM_ENDPOINTS."),
        `SlipItemTools must reach the server only through the shared rail table, not ${url}`,
      );
    }
    for (const rail of ["SLIP_ITEM_ENDPOINTS.add", "SLIP_ITEM_ENDPOINTS.edit", "SLIP_ITEM_ENDPOINTS.remove", "SLIP_ITEM_ENDPOINTS.reorder"]) {
      assert.ok(toolsSrc.includes(rail), `${rail} must be the only way this component reaches the server`);
    }
  });

  it("sends no money field and no expertNote from any of its bodies (§14, D4)", () => {
    assert.doesNotMatch(toolsSrc, /\bexpertNote\b/);
    assert.doesNotMatch(toolsSrc, /estimatedCost|\bprice\b|\bamount\b/);
  });

  it("asks before it deletes", () => {
    assert.match(toolsSrc, /confirmingDelete/);
    assert.match(toolsSrc, /SLIP_DELETE_CONFIRM_LABEL/);
  });
});

describe("A3 — the day renders in the plan's own order, so ↑/↓ can mean something", () => {
  it("no longer re-sorts a day's items by time on the client", () => {
    assert.doesNotMatch(slipViewSrc, /items: \[\.\.\.day\.activities\]\.sort\(/);
    assert.match(slipViewSrc, /items: \[\.\.\.day\.activities\],/);
  });

  it("passes BOTH id lists to the row (the day's, and the group's)", () => {
    assert.match(slipViewSrc, /dayItemIds=\{dayItemIds\}/);
    assert.match(slipViewSrc, /groupItemIds=\{groupItemIds\}/);
    assert.match(slipViewSrc, /const dayItemIds = \(day\?\.activities \?\? \[\]\)\.map/);
  });
});
