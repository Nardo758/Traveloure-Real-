/**
 * SLIP EVENTS — grouping a day's items under the events they name, and the four ways that can
 * go wrong. Ledger `2026-09-04-slip-events`; migration 277; CLAUDE.md Locked Decision 29.
 *
 * WHY THIS EXISTS. Migration 277 landed the column with no reader, and the ruling that landed it
 * spent most of its words on ONE invariant: an item whose link is NULL is not orphaned — every
 * plan has one implicit unnamed event and NULL *is* that event, which is exactly why the FK is
 * `ON DELETE SET NULL`. A grouping function is the first place that invariant can be quietly
 * broken, and the break is invisible on happy-path data: a plan whose items are all linked looks
 * perfect while the code that drops an unresolvable item sits there untested.
 *
 * What these hold:
 *   G1  NO EVENTS ⇒ one unnamed group holding the day, unchanged. The honest state of every plan
 *       that exists today, and not a degraded one.
 *   G2  ALL ITEMS UNLINKED ⇒ still one unnamed group, even when the plan HAS events. An event
 *       with no items on this day never renders — an empty event card claims a schedule the day
 *       does not have.
 *   G3  A MIX ⇒ the unnamed group leads, then the named ones in the SERVER's order
 *       (`event_date ASC NULLS LAST, created_at ASC`), never re-sorted here; item order within a
 *       group is the caller's, preserved.
 *   G4  A DANGLING ID — an item naming an event that is not in the list — falls back to the
 *       implicit group. It must never disappear, and no placeholder event is invented for it.
 *   G5  the total is conserved: every input item comes out in exactly one group, always.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/slip-events.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSlipDaySlots,
  countPlanEvents,
  eventMetaLine,
  groupItemsByEvent,
  IMPLICIT_EVENT_GROUP_KEY,
  SLIP_EMPTY_EVENT_BODY,
  SLIP_UNDATED_SLOT_HEADING,
  SLIP_UNDATED_SLOT_KEY,
  type EventLinkedItem,
  type PlanEvent,
  type SlipDayItems,
} from "../slip-events";

const CEREMONY: PlanEvent = { id: "ev-ceremony", title: "Ceremony", eventDate: "2026-10-02", location: "Kiyomizu-dera" };
const RECEPTION: PlanEvent = { id: "ev-reception", title: "Reception", eventDate: "2026-10-02", location: null };

/** A day's items, in the order the slip's time sort already put them. */
function item(id: string, userExperienceId?: string | null): EventLinkedItem {
  return userExperienceId === undefined ? { id } : { id, userExperienceId };
}

/** Every item id that came out, group by group — the shape these assertions read. */
function shape(groups: ReturnType<typeof groupItemsByEvent<EventLinkedItem>>) {
  return groups.map((g) => ({ key: g.key, titled: g.event?.title ?? null, items: g.items.map((i) => i.id) }));
}

/** G5, asserted on every case below rather than once: nothing may be dropped or duplicated. */
function assertConserved(groups: ReturnType<typeof groupItemsByEvent<EventLinkedItem>>, items: EventLinkedItem[]) {
  const out = groups.flatMap((g) => g.items.map((i) => i.id)).sort();
  assert.deepEqual(out, items.map((i) => i.id).sort(), "every input item must appear exactly once");
}

describe("G1 — a plan with NO events renders as one unnamed group", () => {
  it("groups a day into a single implicit group when the events list is empty", () => {
    const items = [item("a"), item("b"), item("c")];
    const groups = groupItemsByEvent(items, []);
    assert.deepEqual(shape(groups), [
      { key: IMPLICIT_EVENT_GROUP_KEY, titled: null, items: ["a", "b", "c"] },
    ]);
    assertConserved(groups, items);
  });

  it("treats a null/undefined events list exactly like an empty one", () => {
    for (const events of [null, undefined]) {
      const groups = groupItemsByEvent([item("a")], events);
      assert.equal(groups.length, 1);
      assert.equal(groups[0].event, null, "the one group is the plan's implicit unnamed event");
    }
  });

  it("renders NOTHING for a day with no items at all (never an empty unnamed group)", () => {
    assert.deepEqual(groupItemsByEvent([], [CEREMONY]), []);
  });
});

describe("G2 — all items unlinked ⇒ still one unnamed group, even when the plan has events", () => {
  it("puts every unlinked item in the implicit group and renders no empty event cards", () => {
    const items = [item("a"), item("b", null)];
    const groups = groupItemsByEvent(items, [CEREMONY, RECEPTION]);
    assert.deepEqual(shape(groups), [
      { key: IMPLICIT_EVENT_GROUP_KEY, titled: null, items: ["a", "b"] },
    ]);
    assertConserved(groups, items);
  });

  it("an ABSENT key and an explicit NULL are the same fact — both are the implicit event", () => {
    const groups = groupItemsByEvent([item("absent"), item("explicit-null", null)], [CEREMONY]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].items.map((i) => i.id), ["absent", "explicit-null"]);
  });
});

describe("G3 — a mix: the unnamed group leads, named groups keep the server's order", () => {
  it("groups linked items under their event and leaves the rest unnamed", () => {
    const items = [
      item("breakfast"),
      item("vows", "ev-ceremony"),
      item("photos", "ev-ceremony"),
      item("dinner", "ev-reception"),
      item("nightcap", null),
    ];
    const groups = groupItemsByEvent(items, [CEREMONY, RECEPTION]);
    assert.deepEqual(shape(groups), [
      { key: IMPLICIT_EVENT_GROUP_KEY, titled: null, items: ["breakfast", "nightcap"] },
      { key: "ev-ceremony", titled: "Ceremony", items: ["vows", "photos"] },
      { key: "ev-reception", titled: "Reception", items: ["dinner"] },
    ]);
    assertConserved(groups, items);
  });

  it("does NOT re-sort the events — the payload's order (the server's) is the render order", () => {
    const groups = groupItemsByEvent(
      [item("dinner", "ev-reception"), item("vows", "ev-ceremony")],
      // Reversed relative to the case above: the reader must follow the list it was given, not
      // re-derive an order from titles or dates.
      [RECEPTION, CEREMONY],
    );
    assert.deepEqual(groups.map((g) => g.key), ["ev-reception", "ev-ceremony"]);
  });

  it("preserves the caller's item order inside each group (the slip's time sort survives)", () => {
    const groups = groupItemsByEvent(
      [item("late", "ev-ceremony"), item("early", "ev-ceremony")],
      [CEREMONY],
    );
    assert.deepEqual(groups[0].items.map((i) => i.id), ["late", "early"]);
  });

  it("omits an event that has no items on this day", () => {
    const groups = groupItemsByEvent([item("vows", "ev-ceremony")], [CEREMONY, RECEPTION]);
    // Only the ceremony renders: the reception has nothing here, and an empty card would claim
    // a schedule this day does not have. No implicit group either — nothing was left over.
    assert.deepEqual(groups.map((g) => g.key), ["ev-ceremony"]);
  });

  it("collapses a duplicated event id to one group rather than rendering it twice", () => {
    const groups = groupItemsByEvent([item("vows", "ev-ceremony")], [CEREMONY, { ...CEREMONY }]);
    assert.deepEqual(groups.map((g) => g.key), ["ev-ceremony"]);
  });
});

describe("G4 — an item naming an event that is not in the list falls back, never disappears", () => {
  it("files a dangling link under the implicit group", () => {
    const items = [item("vows", "ev-ceremony"), item("mystery", "ev-deleted")];
    const groups = groupItemsByEvent(items, [CEREMONY]);
    assert.deepEqual(shape(groups), [
      { key: IMPLICIT_EVENT_GROUP_KEY, titled: null, items: ["mystery"] },
      { key: "ev-ceremony", titled: "Ceremony", items: ["vows"] },
    ]);
    assertConserved(groups, items);
  });

  it("invents no placeholder event for the dangling id", () => {
    const groups = groupItemsByEvent([item("mystery", "ev-deleted")], [CEREMONY]);
    assert.equal(groups.length, 1, "no second group is conjured for an id nothing resolves");
    assert.equal(groups[0].event, null);
    assert.equal(groups[0].key, IMPLICIT_EVENT_GROUP_KEY);
  });

  it("keeps every item when the whole events list is missing but items still carry links", () => {
    // The viewer's gate returned no events (or the rows were deleted) while the items kept their
    // column. The day must still render in full.
    const items = [item("a", "ev-ceremony"), item("b", "ev-reception")];
    const groups = groupItemsByEvent(items, []);
    assert.deepEqual(shape(groups), [
      { key: IMPLICIT_EVENT_GROUP_KEY, titled: null, items: ["a", "b"] },
    ]);
    assertConserved(groups, items);
  });
});

describe("countPlanEvents — the chip's count, and what zero means", () => {
  it("counts the rows, and an absent list is zero (never a guess)", () => {
    assert.equal(countPlanEvents([CEREMONY, RECEPTION]), 2);
    assert.equal(countPlanEvents([]), 0);
    assert.equal(countPlanEvents(null), 0);
    assert.equal(countPlanEvents(undefined), 0);
  });
});

describe("eventMetaLine — the ONE derivation of what an event row may say about itself", () => {
  /**
   * G6/G7 (ledger `2026-09-04-which-event-picker`). This was inline in `SlipEventGroupBlock`
   * until the "Which event?" picker needed the same line; a second copy is exactly where a clock
   * time gets invented, so the derivation moved here and both surfaces call it.
   */
  it("G6: renders the date when set and the place when set, and nothing when neither is", () => {
    assert.equal(eventMetaLine(CEREMONY), "Fri, Oct 2 · Kiyomizu-dera");
    assert.equal(eventMetaLine(RECEPTION), "Fri, Oct 2");
    assert.equal(eventMetaLine({ id: "ev-p", title: "Brunch", eventDate: null, location: "Gion" }), "Gion");
    // A row that has told us nothing gets NO meta — never "Date TBD", never a placeholder (§13).
    assert.equal(eventMetaLine({ id: "ev-bare" }), "");
    assert.equal(eventMetaLine(null), "");
  });

  it("G7: a clock is emitted ONLY from `start_time` — never read out of the DATE column", () => {
    // Migration 282 (ledger `2026-09-04-event-time-ui`) gave the row a time of its own. What did
    // NOT change: `event_date` is a DATE column and a timestamp that lands in it is still rendered
    // as a calendar day. A row with no `startTime` reads exactly as it did before this lane, and
    // NULL is never shown as midnight or "all day" (§13, Locked Decision 35).
    const clock = /\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\s*(?:am|pm)\b/i;
    for (const event of [
      CEREMONY,
      RECEPTION,
      { id: "ev-ts", title: "Welcome drinks", eventDate: "2026-10-01T19:00:00.000Z", location: "Pontocho" },
      { id: "ev-null", title: "Brunch", eventDate: "2026-10-04", startTime: null },
      // No DB CHECK stands behind the column, so a shape this build cannot vouch for is not shown
      // as a time at all — the row keeps its day and its place.
      { id: "ev-bad", title: "Photos", eventDate: "2026-10-04", startTime: "7pm", location: "Gion" },
    ]) {
      assert.doesNotMatch(eventMetaLine(event), clock);
    }
    assert.equal(eventMetaLine({ id: "ev-bad2", eventDate: "2026-10-04", startTime: "7pm", location: "Gion" }), "Sun, Oct 4 · Gion");
  });

  it("G7c: with a `startTime` set, the day and the clock are ONE segment and the place the next", () => {
    assert.equal(
      eventMetaLine({ ...CEREMONY, startTime: "15:00" }),
      "Fri, Oct 2 15:00 · Kiyomizu-dera",
    );
    // A time with no day still renders: "08:10" is true of a row given an hour and no date, and
    // dropping it would lose an answer the traveler gave.
    assert.equal(eventMetaLine({ id: "ev-t", title: "Round 1", startTime: "08:10" }), "08:10");
    // Verbatim, with no zone claimed for it — the zone is the PLAN's (`trips.timezone`, ruling 30)
    // and this derivation does not have the plan.
    assert.doesNotMatch(
      eventMetaLine({ ...CEREMONY, startTime: "15:00" }),
      /local|UTC|GMT|[+-]\d{2}:\d{2}|\bZ\b/i,
    );
  });

  it("G7b: a bare DATE is read as a LOCAL day, so it never renders one day early (F-1)", () => {
    assert.equal(eventMetaLine({ id: "x", eventDate: "2026-10-02" }), "Fri, Oct 2");
  });
});

describe("G8 — eventMetaLine's SHORT form: one implementation, two callers (re-audit A18)", () => {
  /**
   * Both ratified artboards print the weekday alone — the slip because the day heading directly
   * above already names the date, the "Which event?" picker because it lists one plan's events.
   * The fix had to be an OPTION rather than a second function: the slip and the picker describe
   * the same row, and a second copy is where a clock gets invented out of something that is not
   * one (§18 rule 1). These hold that the two forms differ in EXACTLY one thing.
   */
  it("short prints the weekday alone; long (the default) prints the calendar day", () => {
    assert.equal(eventMetaLine(CEREMONY), "Fri, Oct 2 · Kiyomizu-dera");
    assert.equal(eventMetaLine(CEREMONY, { format: "short" }), "Fri · Kiyomizu-dera");
    // An absent option object, and an explicit "long", are the same answer.
    assert.equal(eventMetaLine(CEREMONY, {}), eventMetaLine(CEREMONY));
    assert.equal(eventMetaLine(CEREMONY, { format: "long" }), eventMetaLine(CEREMONY));
  });

  it("the artboard's own line, verbatim: 'Sat 15:00 · Nanzen-ji'", () => {
    assert.equal(
      eventMetaLine(
        { id: "ev-s", title: "Reception", eventDate: "2026-10-03", startTime: "15:00", location: "Nanzen-ji" },
        { format: "short" },
      ),
      "Sat 15:00 · Nanzen-ji",
    );
  });

  it("EVERY §13 silence survives the option — a short form invents nothing a long one would not", () => {
    for (const format of ["long", "short"] as const) {
      // No time ⇒ no clock, in either form.
      assert.doesNotMatch(eventMetaLine(CEREMONY, { format }), /\d{2}:\d{2}/);
      // A malformed clock is not rendered as one, in either form.
      assert.doesNotMatch(
        eventMetaLine({ id: "b", eventDate: "2026-10-04", startTime: "7pm", location: "Gion" }, { format }),
        /\d{2}:\d{2}/,
      );
      // A row that has told us nothing says nothing.
      assert.equal(eventMetaLine({ id: "bare" }, { format }), "");
      assert.equal(eventMetaLine(null, { format }), "");
      // A time with no day still renders alone.
      assert.equal(eventMetaLine({ id: "t", startTime: "08:10" }, { format }), "08:10");
      // A place with no day still renders alone.
      assert.equal(eventMetaLine({ id: "p", location: "Gion" }, { format }), "Gion");
    }
  });

  it("short still reads the bare DATE as a LOCAL day (F-1) — the weekday is never a day early", () => {
    assert.equal(eventMetaLine({ id: "x", eventDate: "2026-10-02" }, { format: "short" }), "Fri");
  });
});

describe("F — buildSlipDaySlots: a plan with EVENTS and no ITEMS still renders its events", () => {
  /**
   * Ledger `2026-09-05-slip-events-first-render`. The slip's day list comes from ITEMS, so a
   * freshly minted plan — four events ticked at step 5, zero items — had NO days, rendered
   * "No items on this plan yet", and showed not one `slip-event-<id>` card, directly under a
   * header that said "4 events". These hold the fix and, just as importantly, hold that the
   * items-present render did not move.
   */
  const day = (
    dayNum: number,
    dateIso: string | null,
    items: EventLinkedItem[],
  ): SlipDayItems<EventLinkedItem> => ({ dayNum, dateIso, items });

  const OCT2 = "2026-10-02";
  const OCT3 = "2026-10-03";

  it("F1: events + NO items ⇒ one empty group per event, under the day each event names", () => {
    const slots = buildSlipDaySlots<EventLinkedItem>([], [CEREMONY, RECEPTION], {
      groupByEvent: true,
    });
    // Both events name Oct 2, so they share ONE slot — the honest reading of the column.
    assert.equal(slots.length, 1);
    assert.equal(slots[0].dateIso, OCT2);
    assert.equal(slots[0].dayNum, null, "an event-only slot has no ordinal to claim");
    assert.equal(slots[0].undated, false);
    assert.deepEqual(
      slots[0].groups.map((g) => ({ key: g.key, items: g.items.length })),
      [
        { key: "ev-ceremony", items: 0 },
        { key: "ev-reception", items: 0 },
      ],
    );
    // The event ROW itself rides the group, so the card can render its title/meta/affordances.
    assert.equal(slots[0].groups[0].event?.title, "Ceremony");
  });

  it("F2: two events on DIFFERENT days get one slot each, in date order", () => {
    const slots = buildSlipDaySlots<EventLinkedItem>(
      [],
      [{ ...RECEPTION, eventDate: OCT3 }, CEREMONY],
      { groupByEvent: true },
    );
    assert.deepEqual(
      slots.map((s) => [s.dateIso, s.groups.map((g) => g.key)]),
      [
        [OCT2, ["ev-ceremony"]],
        [OCT3, ["ev-reception"]],
      ],
    );
  });

  it("F3 (§13): an event with NO date lands in a TRAILING undated slot, never on day 1", () => {
    const undatedEvent: PlanEvent = { id: "ev-x", title: "Rehearsal", eventDate: null };
    const slots = buildSlipDaySlots<EventLinkedItem>(
      [day(1, OCT2, [item("a")])],
      [CEREMONY, undatedEvent],
      { groupByEvent: true },
    );
    const last = slots[slots.length - 1];
    assert.equal(last.key, SLIP_UNDATED_SLOT_KEY);
    assert.equal(last.undated, true);
    assert.equal(last.dateIso, null, "it names no day, because the traveler named none");
    assert.equal(last.dayNum, null, "and it is never given an ordinal either");
    assert.deepEqual(last.groups.map((g) => g.key), ["ev-x"]);
    // The dated event still lands on the plan's own Oct 2 day rather than a slot of its own.
    assert.equal(slots[0].dayNum, 1);
    assert.deepEqual(slots[0].groups.map((g) => g.key), [IMPLICIT_EVENT_GROUP_KEY, "ev-ceremony"]);
  });

  it("F3b (§13): a date whose SHAPE is not a calendar day is treated as NO date, never repaired", () => {
    for (const bad of ["next Friday", "10/02/2026", "", "  "]) {
      const slots = buildSlipDaySlots<EventLinkedItem>(
        [],
        [{ id: "ev-bad", title: "Photos", eventDate: bad }],
        { groupByEvent: true },
      );
      assert.equal(slots.length, 1);
      assert.equal(slots[0].undated, true, `"${bad}" is not a day`);
    }
    // A timestamp that happens to lead with a calendar day IS read as that day — same posture as
    // `eventMetaLine`, which renders the DATE column as a calendar day and never as a clock.
    const slots = buildSlipDaySlots<EventLinkedItem>(
      [],
      [{ id: "ev-ts", eventDate: "2026-10-02T19:00:00.000Z" }],
      { groupByEvent: true },
    );
    assert.equal(slots[0].dateIso, OCT2);
    assert.equal(slots[0].undated, false);
  });

  it("F4: events + items ⇒ output is UNCHANGED — no event gains a second, empty card", () => {
    const items = [item("breakfast"), item("vows", "ev-ceremony"), item("dinner", "ev-reception")];
    const slots = buildSlipDaySlots<EventLinkedItem>([day(1, OCT2, items)], [CEREMONY, RECEPTION], {
      groupByEvent: true,
    });
    assert.equal(slots.length, 1, "no extra slot: every event already renders with its items");
    assert.equal(slots[0].dayNum, 1);
    // Byte-for-byte the shape `groupItemsByEvent` returns on its own (G3's pinned snapshot).
    assert.deepEqual(shape(slots[0].groups), shape(groupItemsByEvent(items, [CEREMONY, RECEPTION])));
    assert.deepEqual(shape(slots[0].groups), [
      { key: IMPLICIT_EVENT_GROUP_KEY, titled: null, items: ["breakfast"] },
      { key: "ev-ceremony", titled: "Ceremony", items: ["vows"] },
      { key: "ev-reception", titled: "Reception", items: ["dinner"] },
    ]);
  });

  it("F4b: an event with items on ONE day is not also drawn empty on the day it is DATED", () => {
    // The reception is dated Oct 3 but its only item sits on day 1 (Oct 2). It renders where its
    // items are — once — and gets no empty card on Oct 3.
    const slots = buildSlipDaySlots<EventLinkedItem>(
      [day(1, OCT2, [item("dinner", "ev-reception")])],
      [{ ...RECEPTION, eventDate: OCT3 }],
      { groupByEvent: true },
    );
    assert.equal(slots.length, 1);
    assert.deepEqual(slots[0].groups.map((g) => g.key), ["ev-reception"]);
    assert.equal(slots[0].groups[0].items.length, 1);
  });

  it("F5: NO events and NO items ⇒ NO slots (the caller's 'No items on this plan yet' survives)", () => {
    assert.deepEqual(buildSlipDaySlots<EventLinkedItem>([], [], { groupByEvent: true }), []);
    assert.deepEqual(buildSlipDaySlots<EventLinkedItem>([], null, { groupByEvent: true }), []);
    assert.deepEqual(buildSlipDaySlots<EventLinkedItem>([], [CEREMONY]), [], "ungrouped ⇒ no slots");
  });

  it("F6: with grouping OFF the day list is the flat, single implicit group it always was", () => {
    const items = [item("a"), item("b", "ev-ceremony")];
    const slots = buildSlipDaySlots<EventLinkedItem>([day(1, OCT2, items)], [CEREMONY], {
      groupByEvent: false,
    });
    assert.deepEqual(shape(slots[0].groups), [
      { key: IMPLICIT_EVENT_GROUP_KEY, titled: null, items: ["a", "b"] },
    ]);
    // An occasion that states no internal schedule gets no event cards at all, empty or otherwise.
    assert.equal(slots.length, 1);
  });

  it("F7: an event dated OUTSIDE the plan's own days gets its own slot, merged in date order", () => {
    const slots = buildSlipDaySlots<EventLinkedItem>(
      [day(2, OCT3, [item("a")])],
      [CEREMONY], // Oct 2 — one day before the plan's only item-day
      { groupByEvent: true },
    );
    assert.deepEqual(
      slots.map((s) => [s.dateIso, s.dayNum]),
      [
        [OCT2, null],
        [OCT3, 2],
      ],
      "a real calendar day sorts where it falls, and the plan's own day keeps its ordinal",
    );
  });

  it("F7b: a plan with NO machine dates keeps its ordinal days FIRST — nothing is wedged in", () => {
    const slots = buildSlipDaySlots<EventLinkedItem>(
      [day(1, null, [item("a")]), day(2, null, [item("b")])],
      [CEREMONY],
      { groupByEvent: true },
    );
    assert.deepEqual(
      slots.map((s) => s.dayNum),
      [1, 2, null],
      "there is no honest place to insert a dated slot among days that have no dates",
    );
  });

  it("F8: the caller's item order inside a day is preserved, and no item is dropped", () => {
    const items = [item("late", "ev-ceremony"), item("early", "ev-ceremony"), item("loose")];
    const slots = buildSlipDaySlots<EventLinkedItem>([day(1, OCT2, items)], [CEREMONY, RECEPTION], {
      groupByEvent: true,
    });
    const out = slots.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.id)));
    assert.deepEqual(out.slice().sort(), ["early", "late", "loose"]);
    assert.deepEqual(
      slots[0].groups.find((g) => g.key === "ev-ceremony")!.items.map((i) => i.id),
      ["late", "early"],
    );
  });

  it("F9: the empty-body line is ONE string, stated once and never re-spelled", () => {
    assert.equal(SLIP_EMPTY_EVENT_BODY, "Nothing added under this event yet");
    // §13 — it describes the EVENT's contents, and claims nothing about the plan or the day.
    assert.doesNotMatch(SLIP_EMPTY_EVENT_BODY, /\b0\b|none|empty|no items on this plan/i);
    assert.equal(SLIP_UNDATED_SLOT_HEADING, "Undated");
  });
});
