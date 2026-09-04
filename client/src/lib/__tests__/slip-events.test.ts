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
  countPlanEvents,
  eventMetaLine,
  groupItemsByEvent,
  IMPLICIT_EVENT_GROUP_KEY,
  type EventLinkedItem,
  type PlanEvent,
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

  it("G7: never emits a clock time — `user_experiences` has no time-of-day column", () => {
    const clock = /\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\s*(?:am|pm)\b/i;
    for (const event of [
      CEREMONY,
      RECEPTION,
      { id: "ev-ts", title: "Welcome drinks", eventDate: "2026-10-01T19:00:00.000Z", location: "Pontocho" },
    ]) {
      assert.doesNotMatch(eventMetaLine(event), clock);
    }
  });

  it("G7b: a bare DATE is read as a LOCAL day, so it never renders one day early (F-1)", () => {
    assert.equal(eventMetaLine({ id: "x", eventDate: "2026-10-02" }), "Fri, Oct 2");
  });
});
