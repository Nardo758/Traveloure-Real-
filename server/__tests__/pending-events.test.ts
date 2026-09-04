/**
 * THE PRE-TRIP PEN, READ — the decisions the drain makes before it touches a database.
 * Ledger `2026-09-04-event-time-ui`; cites `2026-09-04-plan-mint` (CLAUDE.md Locked Decision 30 (b))
 * and `2026-09-04-stops-and-event-time` (migration 282, Locked Decision 35).
 *
 * WHY THIS IS PURE. `pending-events.service.ts` needs a database for everything it does — read the
 * context row, resolve the occasion, list the trip's existing events, write. The decisions it makes
 * on the way do not, so they live in `pending-events.pure.ts` and keep their proof in an
 * environment with no `DATABASE_URL` (the `trip-destinations.pure.ts` precedent). The sibling
 * `pending-events-drain.db.test.ts` still owns the transactional half.
 *
 * WHAT THESE HOLD:
 *   P1  the RICH pen (`pendingEvents`) drains its own day, time and place.
 *   P2  the LEGACY pen (`pendingEventTitles`, bare strings) still drains — for one release, a
 *       traveler who ticked chips before this deploy loses nothing.
 *   P3  a rich pen WINS over a legacy one sitting beside it (this release writes the first and
 *       empties the second in the same call, so a leftover legacy list is the older answer).
 *   P4  IDEMPOTENCY IS BY TITLE, and a day/time/place is never part of that identity — so editing
 *       a time between two drains cannot fork one event into two.
 *   P5  A FIELD THE TRAVELER DID NOT ANSWER INHERITS THE PLAN'S — except the TIME, which has no
 *       fallback and stays NULL. Never midnight, never "all day" (§13).
 *   P6  a malformed held day or time is DROPPED, not coerced — the column carries no DB CHECK, so
 *       a shape this code cannot vouch for may not be passed on as if the traveler gave it.
 *   P7  nothing held, or nothing usable held, yields nothing — and the pen is never read as an
 *       instruction to invent an event.
 *
 * Run: npx tsx --test server/__tests__/pending-events.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  drainRowValues,
  heldEventsFromContext,
  LEGACY_PEN_KEY,
  PEN_KEY,
} from "../services/pending-events.pure";

/** The plan the pen drains INTO — its first day and its destination, the only two it inherits. */
const PLAN = { startDate: "2026-10-02", destination: "Kyoto, Japan" };

describe("P1/P2/P3 — the pen is read in both spellings, and the richer one wins", () => {
  it("P1: a rich pen carries the traveler's own day, time and place", () => {
    const held = heldEventsFromContext({
      [PEN_KEY]: [
        { title: "Ceremony", eventDate: "2026-10-03", startTime: "15:00", location: "Nanzen-ji" },
        { title: "Reception", eventDate: "2026-10-03", startTime: "18:00" },
      ],
    });
    assert.deepEqual(held, [
      { title: "Ceremony", eventDate: "2026-10-03", startTime: "15:00", location: "Nanzen-ji" },
      { title: "Reception", eventDate: "2026-10-03", startTime: "18:00" },
    ]);
  });

  it("P2: a LEGACY pen of bare titles still drains — nothing ticked before the deploy is lost", () => {
    const held = heldEventsFromContext({
      [LEGACY_PEN_KEY]: ["Rehearsal dinner", "  Ceremony  ", "", "ceremony"],
    });
    // Trimmed, empties dropped, duplicates collapsed case-insensitively (first occurrence wins) —
    // exactly what the pre-rich drain did, so this release changes nothing for a legacy pen.
    assert.deepEqual(held, [{ title: "Rehearsal dinner" }, { title: "Ceremony" }]);
    // And a title-only draft says nothing about a day, a time or a place — those keys are ABSENT,
    // which is what lets the plan's own values be inherited at create (P5).
    assert.equal("eventDate" in held[0], false);
    assert.equal("startTime" in held[0], false);
  });

  it("P3: a rich pen beside a legacy one wins — the legacy list is the older write", () => {
    const held = heldEventsFromContext({
      [PEN_KEY]: [{ title: "Ceremony", startTime: "15:00" }],
      [LEGACY_PEN_KEY]: ["Welcome drinks", "Farewell brunch"],
    });
    assert.deepEqual(held, [{ title: "Ceremony", startTime: "15:00" }]);
  });

  it("P3b: an EMPTY rich list falls through to the legacy one rather than swallowing it", () => {
    const held = heldEventsFromContext({ [PEN_KEY]: [], [LEGACY_PEN_KEY]: ["Ceremony"] });
    assert.deepEqual(held, [{ title: "Ceremony" }]);
  });
});

describe("P4 — identity is the TITLE, and a time is never part of it", () => {
  it("P4a: two rows of one title collapse, whatever their times", () => {
    const held = heldEventsFromContext({
      [PEN_KEY]: [
        { title: "Ceremony", startTime: "15:00" },
        { title: "ceremony", startTime: "16:00" },
      ],
    });
    assert.equal(held.length, 1, "one title is one event — a differing time may not fork it");
    assert.equal(held[0].startTime, "15:00", "the FIRST occurrence wins, as the drain's skip does");
  });

  it("P4b: the drained title is verbatim, so the drain's existing-title skip still matches", () => {
    const [held] = heldEventsFromContext({ [PEN_KEY]: [{ title: "  Round 1  ", startTime: "08:10" }] });
    assert.equal(drainRowValues(held, PLAN).title, "Round 1");
  });
});

describe("P5 — the plan's day and place are inherited; the TIME never is", () => {
  it("P5a: a row that answered nothing takes the plan's day and destination", () => {
    const values = drainRowValues({ title: "Welcome drinks" }, PLAN);
    assert.deepEqual(values, {
      title: "Welcome drinks",
      eventDate: "2026-10-02",
      location: "Kyoto, Japan",
      // THE WHOLE POINT: a plan has no hour to inherit. NULL is "no time given", and rendering it
      // as 00:00 or "all day" would be a claim nobody made (Locked Decision 35, §13).
      startTime: null,
    });
  });

  it("P5b: a row that answered keeps its OWN day, time and place", () => {
    const values = drainRowValues(
      { title: "Round 3", eventDate: "2026-10-04", startTime: "08:30", location: "Carnoustie" },
      PLAN,
    );
    assert.deepEqual(values, {
      title: "Round 3",
      eventDate: "2026-10-04",
      startTime: "08:30",
      location: "Carnoustie",
    });
  });

  it("P5c: a plan with no day and no destination inherits NOTHING — nulls, never placeholders", () => {
    const values = drainRowValues({ title: "Ceremony" }, { startDate: null, destination: null });
    assert.deepEqual(values, { title: "Ceremony", eventDate: null, startTime: null, location: null });
  });

  it("P5d: a plan whose start date arrives as an ISO instant still inherits its CALENDAR day", () => {
    // `trips.start_date` reaches the drain as whatever the mint site held. Reducing it to the date
    // part keeps the long-standing pass-through rather than turning an inherited day into NULL,
    // and it never re-reads the value in another zone (F-1).
    const values = drainRowValues({ title: "Ceremony" }, { startDate: "2026-10-02T00:00:00.000Z" });
    assert.equal(values.eventDate, "2026-10-02");
  });
});

describe("P6 — a malformed held value is dropped, never coerced", () => {
  it("P6a: a bad day or a bad time leaves the field ABSENT, and the title survives", () => {
    const held = heldEventsFromContext({
      [PEN_KEY]: [
        { title: "Ceremony", eventDate: "October 3rd", startTime: "3pm", location: "Nanzen-ji" },
      ],
    });
    assert.deepEqual(held, [{ title: "Ceremony", location: "Nanzen-ji" }]);
    // …and the row then inherits the plan's day exactly as an unanswered one does. A garbled value
    // must never survive as a half-parsed date on a column with no CHECK behind it.
    assert.equal(drainRowValues(held[0], PLAN).eventDate, "2026-10-02");
    assert.equal(drainRowValues(held[0], PLAN).startTime, null);
  });

  it("P6b: SHAPE is checked, RANGE deliberately is not — the format authority owns that", () => {
    // `userExperienceStartTimeSchema` (`shared/schema.ts`) is a shape check only, for the reason
    // stated there: a range rule invented by a normalizer becomes a second authority. "25:00"
    // therefore survives here, exactly as it survives the admission schema.
    const held = heldEventsFromContext({ [PEN_KEY]: [{ title: "Late one", startTime: "25:00" }] });
    assert.equal(held[0].startTime, "25:00");
  });

  it("P6c: a row with no usable title is not an event", () => {
    const held = heldEventsFromContext({
      [PEN_KEY]: [{ title: "   ", startTime: "09:00" }, { startTime: "10:00" }, { title: "Ceremony" }],
    });
    assert.deepEqual(held, [{ title: "Ceremony" }]);
  });
});

describe("P7 — an absent or unusable pen yields nothing at all", () => {
  it("P7a: no pen, an empty pen, and a pen of junk all read as no held events", () => {
    for (const context of [
      null,
      undefined,
      {},
      { [PEN_KEY]: [] },
      { [LEGACY_PEN_KEY]: [] },
      { [PEN_KEY]: "Ceremony" },
      { [PEN_KEY]: [null, 7, true] },
      { [LEGACY_PEN_KEY]: ["", "   "] },
    ]) {
      assert.deepEqual(heldEventsFromContext(context), [], JSON.stringify(context));
    }
  });

  it("P7b: the pen is capped, so a crafted context cannot mint an unbounded number of events", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ title: `Event ${i}` }));
    assert.equal(heldEventsFromContext({ [PEN_KEY]: many }).length, 20);
  });

  it("P7c: the two pen keys are the ones the client writes and the drain clears", () => {
    // Named constants rather than inline strings, so a rename cannot leave the client writing one
    // key while the drain reads another — which would silently resurrect the original bug.
    assert.equal(PEN_KEY, "pendingEvents");
    assert.equal(LEGACY_PEN_KEY, "pendingEventTitles");
  });
});
