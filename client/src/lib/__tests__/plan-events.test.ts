/**
 * STEP 5's TABLE — the reducer's rules, pinned without React.
 * Ledger `2026-09-04-event-time-ui`; cites `2026-09-04-stops-and-event-time` (migration 282,
 * CLAUDE.md Locked Decision 35).
 *
 * WHY THIS EXISTS. The ratified artboards (`Step5Events.dc.html`, `TravelEvents.dc.html`) draw
 * each ticked chip as a row of Event · Day · Time · Place, with the day and place shown already
 * filled from the plan. That is exactly the shape §13 governs: a value the platform SHOWS as a
 * default and a value the traveler CHOSE look identical on screen and are completely different
 * facts. These hold the line between them, plus the three ways a table like this loses an answer.
 *
 * What these hold:
 *   E1  a default is SHOWN, never WRITTEN — an untouched row carries no day, no time, no place.
 *   E2  ticking and unticking, and what unticking takes with it.
 *   E3  editing one cell, and CLEARING one back to "not answered".
 *   E4  the CTA's count and the save's list are ONE derivation, free text included.
 *   E5  the Day cell offers the PLAN's days and no others; an unreadable range offers none.
 *   E6  the pen round-trips in both spellings, and the legacy one loses nothing.
 *   E7  the ONE inheritance rule: day and place fall back to the plan, the TIME never does.
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan-events.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventsToCreate,
  hasEventRow,
  planDayOptions,
  planEventRowValues,
  readPendingEvents,
  setEventDetail,
  toggleEventRow,
  type PlanEventDraft,
} from "../plan-events";

const PLAN = { startDate: "2026-10-02", destination: "Kyoto, Japan" };

describe("E1 — a default is shown, never written", () => {
  it("E1a: a freshly ticked row carries a title and NOTHING else", () => {
    const rows = toggleEventRow([], "Ceremony");
    assert.deepEqual(rows, [{ title: "Ceremony" }]);
    // The three absences are the point: the modal renders the plan's first day and destination as
    // placeholders, and a traveler who never opened those cells has not chosen them.
    assert.equal("eventDate" in rows[0], false);
    assert.equal("startTime" in rows[0], false);
    assert.equal("location" in rows[0], false);
  });

  it("E1b: the plan's day only becomes a value at CREATE, and is distinguishable until then", () => {
    const [row] = toggleEventRow([], "Ceremony");
    assert.equal(row.eventDate, undefined, "the DRAFT says the traveler chose no day");
    assert.equal(
      planEventRowValues(row, PLAN).eventDate,
      "2026-10-02",
      "the ROW inherits the plan's day — one rule, applied once, at create",
    );
  });
});

describe("E2 — ticking, and what unticking takes with it", () => {
  it("E2a: ticking appends in tick order and never sorts", () => {
    let rows = toggleEventRow([], "Rehearsal dinner");
    rows = toggleEventRow(rows, "Ceremony");
    rows = toggleEventRow(rows, "Farewell brunch");
    assert.deepEqual(rows.map((r) => r.title), ["Rehearsal dinner", "Ceremony", "Farewell brunch"]);
  });

  it("E2b: unticking removes the row AND its answers — a re-tick starts blank", () => {
    let rows = toggleEventRow([], "Ceremony");
    rows = setEventDetail(rows, "Ceremony", { startTime: "15:00", location: "Nanzen-ji" });
    rows = toggleEventRow(rows, "Ceremony");
    assert.deepEqual(rows, []);
    // A ghost time surviving an untick would come back on a re-tick looking like an answer the
    // traveler re-entered, which is the fabrication §13 forbids.
    assert.deepEqual(toggleEventRow(rows, "Ceremony"), [{ title: "Ceremony" }]);
  });

  it("E2c: matching is case-insensitive, because the drain's idempotency is", () => {
    const rows = toggleEventRow([{ title: "Ceremony" }], "ceremony");
    assert.deepEqual(rows, [], "a differently-cased tick is the SAME row, not a second one");
    assert.equal(hasEventRow([{ title: "Ceremony" }], "  CEREMONY "), true);
  });

  it("E2d: the cap refuses a new row rather than silently dropping an earlier one", () => {
    const full: PlanEventDraft[] = Array.from({ length: 20 }, (_, i) => ({ title: `Event ${i}` }));
    const rows = toggleEventRow(full, "One too many");
    assert.equal(rows.length, 20);
    assert.equal(hasEventRow(rows, "Event 0"), true, "the FIRST row is still there");
    assert.equal(hasEventRow(rows, "One too many"), false);
  });
});

describe("E3 — editing a cell, and clearing one back to unanswered", () => {
  it("E3a: a cell is set on its own row and no other", () => {
    const rows = setEventDetail(
      [{ title: "Ceremony" }, { title: "Reception" }],
      "Ceremony",
      { eventDate: "2026-10-03", startTime: "15:00", location: "Nanzen-ji" },
    );
    assert.deepEqual(rows[0], {
      title: "Ceremony",
      eventDate: "2026-10-03",
      startTime: "15:00",
      location: "Nanzen-ji",
    });
    assert.deepEqual(rows[1], { title: "Reception" });
  });

  it("E3b: an EMPTY value clears the field back to ABSENT — taking an answer back is allowed", () => {
    let rows = setEventDetail([{ title: "Ceremony" }], "Ceremony", { startTime: "15:00" });
    rows = setEventDetail(rows, "Ceremony", { startTime: "" });
    assert.deepEqual(rows, [{ title: "Ceremony" }]);
    assert.equal("startTime" in rows[0], false, "cleared is ABSENT, not an empty string");
  });

  it("E3c: a malformed value never reaches the pen — it is dropped, not half-parsed", () => {
    const rows = setEventDetail([{ title: "Ceremony" }], "Ceremony", {
      eventDate: "October 3rd",
      startTime: "3pm",
    });
    assert.deepEqual(rows, [{ title: "Ceremony" }]);
  });

  it("E3d: editing a title that is not a row creates nothing", () => {
    const rows = setEventDetail([{ title: "Ceremony" }], "Reception", { startTime: "18:00" });
    assert.deepEqual(rows, [{ title: "Ceremony" }]);
  });
});

describe("E4 — the count and the save read the same list", () => {
  it("E4a: the free-text chip joins the rows it will actually be saved as", () => {
    const rows = eventsToCreate([{ title: "Ceremony", startTime: "15:00" }], "  Tea ceremony  ");
    assert.deepEqual(rows, [
      { title: "Ceremony", startTime: "15:00" },
      // The free-text row carries no day/time/place: it has no cell to fill until it IS a row, and
      // inventing one for it would be the fabrication E1 exists to prevent.
      { title: "Tea ceremony" },
    ]);
  });

  it("E4b: empty free text adds nothing, and a duplicate of a ticked chip is not a second event", () => {
    const ticked: PlanEventDraft[] = [{ title: "Ceremony", startTime: "15:00" }];
    assert.deepEqual(eventsToCreate(ticked, "   "), ticked);
    assert.deepEqual(eventsToCreate(ticked, "ceremony"), ticked);
  });
});

describe("E5 — the Day cell offers the plan's own days", () => {
  it("E5a: a range yields every day in it, in order", () => {
    assert.deepEqual(planDayOptions("2026-10-02", "2026-10-04"), [
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("E5b: a one-day plan yields exactly its day; a backwards range yields the start alone", () => {
    assert.deepEqual(planDayOptions("2026-10-02", "2026-10-02"), ["2026-10-02"]);
    assert.deepEqual(planDayOptions("2026-10-02", null), ["2026-10-02"]);
    assert.deepEqual(planDayOptions("2026-10-04", "2026-10-02"), ["2026-10-04"]);
  });

  it("E5c: an unreadable range offers NO days — the cell asks nothing rather than guessing one", () => {
    for (const bad of ["", null, undefined, "next October", "10/02/2026"]) {
      assert.deepEqual(planDayOptions(bad as string | null, "2026-10-04"), [], String(bad));
    }
  });

  it("E5d: a month boundary is crossed correctly, and the list is capped", () => {
    assert.deepEqual(planDayOptions("2026-10-30", "2026-11-02"), [
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    assert.equal(planDayOptions("2026-01-01", "2099-01-01").length, 60);
  });
});

describe("E6 — the pen round-trips in both spellings", () => {
  it("E6a: the rich pen comes back exactly as written", () => {
    const held: PlanEventDraft[] = [
      { title: "Ceremony", eventDate: "2026-10-03", startTime: "15:00", location: "Nanzen-ji" },
      { title: "Reception" },
    ];
    assert.deepEqual(readPendingEvents({ pendingEvents: held }), held);
  });

  it("E6b: the LEGACY pen of bare titles is read as title-only rows — nothing is lost", () => {
    assert.deepEqual(readPendingEvents({ pendingEventTitles: ["Ceremony", "Reception"] }), [
      { title: "Ceremony" },
      { title: "Reception" },
    ]);
  });

  it("E6c: a rich pen wins over a legacy one beside it; an empty rich list falls through", () => {
    assert.deepEqual(
      readPendingEvents({ pendingEvents: [{ title: "Ceremony" }], pendingEventTitles: ["Old"] }),
      [{ title: "Ceremony" }],
    );
    assert.deepEqual(readPendingEvents({ pendingEvents: [], pendingEventTitles: ["Old"] }), [
      { title: "Old" },
    ]);
  });

  it("E6d: no pen at all is no events, never a fabricated one", () => {
    assert.deepEqual(readPendingEvents({}), []);
    assert.deepEqual(readPendingEvents(null), []);
    assert.deepEqual(readPendingEvents(undefined), []);
  });
});

describe("E7 — the inheritance rule, stated once for both create rails", () => {
  it("E7a: an unanswered day and place take the plan's; the TIME stays null", () => {
    assert.deepEqual(planEventRowValues({ title: "Welcome drinks" }, PLAN), {
      title: "Welcome drinks",
      eventDate: "2026-10-02",
      startTime: null,
      location: "Kyoto, Japan",
    });
  });

  it("E7b: an answered field is kept, never overwritten by the plan's", () => {
    assert.deepEqual(
      planEventRowValues(
        { title: "Round 1", eventDate: "2026-10-03", startTime: "08:10", location: "St Andrews" },
        PLAN,
      ),
      {
        title: "Round 1",
        eventDate: "2026-10-03",
        startTime: "08:10",
        location: "St Andrews",
      },
    );
  });

  it("E7c: a plan with nothing to inherit writes nulls, never a placeholder", () => {
    assert.deepEqual(planEventRowValues({ title: "Ceremony" }, {}), {
      title: "Ceremony",
      eventDate: null,
      startTime: null,
      location: null,
    });
  });
});
