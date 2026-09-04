/**
 * WHICH EVENT? — the picker's decisions, and the six ways they can fabricate something.
 * Ledger `2026-09-04-which-event-picker`; migration 277; CLAUDE.md Locked Decision 29.
 *
 * WHY THIS EXISTS. The ratified mock for this surface draws TWO things the data cannot support:
 * clock times ("Fri 19:00") for rows whose only temporal column is a bare DATE, and a
 * "suggested for florists" hint that presumes a category→event mapping which does not exist
 * anywhere in this repo. Both are the kind of thing that gets re-added by the next person
 * reading the mock, and neither breaks a happy-path render — a fabricated time looks exactly
 * like a real one. So the negatives are pinned here, in the module both the picker and its
 * confirm read from.
 *
 * What these hold:
 *   W1  ZERO events ⇒ no picker. The plan has only its ONE implicit unnamed event; there is
 *       nothing to choose between.
 *   W2  EXACTLY ONE event ⇒ still no picker (the mock's own footnote). A one-option dialog is
 *       not a choice.
 *   W3  TWO OR MORE ⇒ the picker, with NOTHING pre-selected and no row marked "suggested".
 *   W4  The implicit choice's value is an EXPLICIT `null` — the plan's own unnamed event, the
 *       reason the FK is ON DELETE SET NULL — never `undefined` and never an empty string.
 *   W5  An event with NO date and NO location renders with no label and no meta: nothing is
 *       invented for it, and it is never called "Untitled event".
 *   W6  ORDERING is the server's. `eventsForTrip` filters without sorting; `whichEventChoices`
 *       preserves the order it was handed, implicit first.
 *   W7  NO CLOCK TIME is ever emitted, for any event, in any shape the column can hold.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/which-event.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventsForTrip,
  findWhichEventChoice,
  shouldAskWhichEvent,
  whichEventChoices,
  whichEventCtaLabel,
  IMPLICIT_EVENT_CHOICE_LABEL,
  IMPLICIT_EVENT_GROUP_KEY,
  INITIAL_WHICH_EVENT_SELECTION,
  type PlanEvent,
  type PlanEventRow,
} from "../which-event";
import { ADD_TO_PLAN_LABEL } from "../plan-vocabulary";

const REHEARSAL: PlanEvent = { id: "ev-rehearsal", title: "Rehearsal dinner", eventDate: "2026-10-01", location: null };
const CEREMONY: PlanEvent = { id: "ev-ceremony", title: "Ceremony", eventDate: "2026-10-02", location: "Nanzen-ji" };
const RECEPTION: PlanEvent = { id: "ev-reception", title: "Reception", eventDate: "2026-10-02", location: null };
/** A row that has told us NOTHING but its id — the honest floor of this data (§13). */
const BARE: PlanEvent = { id: "ev-bare", title: null, eventDate: null, location: null };

/** Anything that looks like a wall-clock reading: "19:00", "7:00 PM", "10.30am". */
const CLOCK_RE = /\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\s*(?:am|pm)\b/i;

describe("W1/W2 — the question is skipped when there is nothing to ask", () => {
  it("W1: a plan with NO events never asks", () => {
    assert.equal(shouldAskWhichEvent([]), false);
    // A list that never loaded reads as the same absence, never as "ask anyway".
    assert.equal(shouldAskWhichEvent(undefined), false);
    assert.equal(shouldAskWhichEvent(null), false);
  });

  it("W2: a plan with EXACTLY ONE event never asks", () => {
    assert.equal(shouldAskWhichEvent([CEREMONY]), false);
  });

  it("W3a: two or more events ask", () => {
    assert.equal(shouldAskWhichEvent([CEREMONY, RECEPTION]), true);
    assert.equal(shouldAskWhichEvent([REHEARSAL, CEREMONY, RECEPTION, BARE]), true);
  });
});

describe("W3 — the picker opens with nothing chosen and nothing recommended", () => {
  it("W3b: the initial selection is null, and no choice carries a suggestion", () => {
    assert.equal(INITIAL_WHICH_EVENT_SELECTION, null);
    const choices = whichEventChoices([REHEARSAL, CEREMONY, RECEPTION]);
    // Nothing on a choice can mark it as preferred: the shape has no such field, and none of the
    // rendered strings carries a hint. A category→event mapping does not exist in this codebase
    // (`experience_types.roles_needed` is absent and HELD), so a suggestion would be invented.
    for (const choice of choices) {
      assert.deepEqual(
        Object.keys(choice).sort(),
        ["event", "key", "label", "meta", "value"],
        "a choice must not grow a suggested/recommended/selected flag",
      );
      assert.doesNotMatch(`${choice.label} ${choice.meta}`, /suggest|recommend|for florists/i);
    }
    // And nothing resolves to a default: an unset selection finds no choice.
    assert.equal(findWhichEventChoice(choices, INITIAL_WHICH_EVENT_SELECTION), null);
  });
});

describe("W4 — the implicit event is a real answer, written as an explicit null", () => {
  it("W4a: the implicit choice leads, is keyed like the slip's group, and its value is null", () => {
    const choices = whichEventChoices([CEREMONY, RECEPTION]);
    const implicit = choices[0];
    assert.equal(implicit.key, IMPLICIT_EVENT_GROUP_KEY);
    assert.equal(implicit.event, null);
    // `null`, not undefined and not "" — the server reads absent / null / a value as three
    // different instructions, and this one means "the plan's one implicit unnamed event".
    assert.strictEqual(implicit.value, null);
    assert.equal(Object.prototype.hasOwnProperty.call(implicit, "value"), true);
  });

  it("W4b: it is never labelled as a failure state", () => {
    assert.equal(IMPLICIT_EVENT_CHOICE_LABEL, "No particular event");
    assert.doesNotMatch(IMPLICIT_EVENT_CHOICE_LABEL, /unassigned|ungrouped|\bother\b|\bnone\b|untitled/i);
  });

  it("W4c: it is offered even when every event on the plan is named", () => {
    const choices = whichEventChoices([REHEARSAL, CEREMONY, RECEPTION]);
    assert.equal(choices.filter((c) => c.value === null).length, 1);
    assert.equal(choices.length, 4);
  });
});

describe("W5 — an event that has told us nothing invents nothing", () => {
  it("W5a: no title ⇒ empty label, never a placeholder name", () => {
    const [, bare] = whichEventChoices([BARE]);
    assert.equal(bare.label, "");
    assert.doesNotMatch(`${bare.label}${bare.meta}`, /untitled|unnamed|tbd|to be confirmed/i);
  });

  it("W5b: no date and no location ⇒ empty meta, never a fabricated one", () => {
    const [, bare] = whichEventChoices([BARE]);
    assert.equal(bare.meta, "");
  });

  it("W5c: a date with no place, and a place with no date, each render only what is there", () => {
    const [, rehearsal] = whichEventChoices([REHEARSAL]);
    assert.equal(rehearsal.meta, "Thu, Oct 1");
    const [, placeOnly] = whichEventChoices([{ id: "ev-p", title: "Brunch", eventDate: null, location: "Gion" }]);
    assert.equal(placeOnly.meta, "Gion");
  });

  it("W5d: the CTA falls back to the platform label rather than naming a nameless event", () => {
    const choices = whichEventChoices([CEREMONY, BARE]);
    assert.equal(whichEventCtaLabel(findWhichEventChoice(choices, "ev-ceremony")), "Add to Ceremony");
    assert.equal(whichEventCtaLabel(findWhichEventChoice(choices, "ev-bare")), ADD_TO_PLAN_LABEL);
    assert.equal(whichEventCtaLabel(findWhichEventChoice(choices, IMPLICIT_EVENT_GROUP_KEY)), ADD_TO_PLAN_LABEL);
    assert.equal(whichEventCtaLabel(null), ADD_TO_PLAN_LABEL);
  });
});

describe("W6 — ordering is the server's, and only this plan's rows are offered", () => {
  const rows: PlanEventRow[] = [
    { ...RECEPTION, tripId: "trip-1" },
    { ...CEREMONY, tripId: "trip-2" },
    { ...REHEARSAL, tripId: "trip-1" },
    { ...BARE, tripId: null },
  ];

  it("W6a: rows are filtered to the plan and NOT re-sorted", () => {
    const mine = eventsForTrip(rows, "trip-1");
    assert.deepEqual(
      mine.map((e) => e.id),
      ["ev-reception", "ev-rehearsal"],
      "the server's order must survive the filter — no client-side sort",
    );
  });

  it("W6b: no trip id, or no list, yields no events rather than someone else's", () => {
    assert.deepEqual(eventsForTrip(rows, undefined), []);
    assert.deepEqual(eventsForTrip(rows, null), []);
    assert.deepEqual(eventsForTrip(undefined, "trip-1"), []);
  });

  it("W6c: choices preserve the handed order, implicit first", () => {
    const choices = whichEventChoices([RECEPTION, REHEARSAL, CEREMONY]);
    assert.deepEqual(
      choices.map((c) => c.key),
      [IMPLICIT_EVENT_GROUP_KEY, "ev-reception", "ev-rehearsal", "ev-ceremony"],
    );
  });

  it("W6d: a duplicate id is collapsed to its first occurrence, as the slip's grouping collapses it", () => {
    const choices = whichEventChoices([CEREMONY, { ...CEREMONY, title: "Ceremony (dup)" }, RECEPTION]);
    assert.deepEqual(choices.map((c) => c.key), [IMPLICIT_EVENT_GROUP_KEY, "ev-ceremony", "ev-reception"]);
    assert.equal(choices[1].label, "Ceremony");
  });
});

describe("W7 — NO CLOCK TIME is ever emitted, for any event", () => {
  it("W7a: no choice's meta carries a wall-clock reading", () => {
    const battery: PlanEvent[] = [
      REHEARSAL,
      CEREMONY,
      RECEPTION,
      BARE,
      // `user_experiences.event_date` is a DATE column, so this is the only shape it can hold —
      // but a row that somehow carried a timestamp must STILL render only its calendar day: the
      // picker has no source for a start time and must not manufacture one (§13).
      { id: "ev-ts", title: "Welcome drinks", eventDate: "2026-10-01T19:00:00.000Z", location: "Pontocho" },
      { id: "ev-space", title: "  ", eventDate: "2026-10-03", location: "  " },
    ];
    for (const choice of whichEventChoices(battery)) {
      assert.doesNotMatch(
        choice.meta,
        CLOCK_RE,
        `"${choice.meta}" reads as a clock time; user_experiences has no time-of-day column`,
      );
      assert.doesNotMatch(choice.label, CLOCK_RE);
    }
  });

  it("W7b: the mock's own times are not reproducible from this data", () => {
    // The artboard draws "Fri 19:00" / "Sat 15:00" / "Sun 10:30". Nothing on the row can produce
    // them, so the meta line for a dated event is a bare calendar day.
    const [, ceremony] = whichEventChoices([CEREMONY]);
    assert.equal(ceremony.meta, "Fri, Oct 2 · Nanzen-ji");
  });
});
