/**
 * WHICH EVENT? — the picker's decisions, and the six ways they can fabricate something.
 * Ledger `2026-09-04-which-event-picker`; migration 277; CLAUDE.md Locked Decision 29.
 *
 * WHY THIS EXISTS. The ratified mock for this surface draws things the data may or may not be
 * able to support, and a fabricated one looks exactly like a real one on a happy-path render.
 * Clock times ("Fri 19:00") it CAN now support: migration 282 gave `user_experiences` its own
 * `start_time` (ledger `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 35) and ledger
 * `2026-09-04-event-time-ui` reads it here. So W7's job moved — from "prove no clock is ever
 * emitted" to "prove a clock comes from the CLOCK COLUMN and from nowhere else, and that a row
 * without one still shows none". The "suggested for florists" hint it CAN now
 * support: `experience_types.roles_needed` (migration 280, ledger `2026-09-04-roles-needed`)
 * gives every occasion the disciplines it hires, in the same `category_key` vocabulary a listing
 * carries. Ledger `2026-09-04-which-event-hint` builds it — so this file's job for the hint moved
 * from "prove it is absent" to "prove it appears ONLY when the server's own list says so, and
 * that it never becomes a selection".
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
 *   W7  A CLOCK TIME COMES FROM `start_time` AND FROM NOWHERE ELSE (migration 282). A row without
 *       one — absent, null, or malformed — shows its day and no clock, and a timestamp sitting in
 *       the DATE column is still never read as one. The time prints verbatim, claiming no zone.
 *   W8  THE ROLE HINT. It appears ONLY on an event whose occasion's own `rolesNeeded` names the
 *       listing's `category_key`, and every other case — NULL/absent roles, an empty array, no
 *       category on the listing, a plain non-match, the implicit event, a matched key this build
 *       cannot put into words — is SILENCE, never a negative claim and never a raw key on screen.
 *       And a hint MARKS: it is not a field on a choice, it does not reorder anything, and the
 *       initial selection is still `null` whichever way it lands.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/which-event.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventsForTrip,
  findWhichEventChoice,
  hintForEvent,
  shouldAskWhichEvent,
  whichEventChoices,
  whichEventCtaLabel,
  IMPLICIT_EVENT_CHOICE_LABEL,
  IMPLICIT_EVENT_GROUP_KEY,
  INITIAL_WHICH_EVENT_SELECTION,
  ROLE_HINT_PREFIX,
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
    // Nothing on a CHOICE can mark it as preferred: the shape has no such field, and neither the
    // label nor the meta carries a hint. The role hint is computed separately, per row, against
    // the listing being added (W8) — keeping it off this shape is what stops a mark from being
    // mistaken for, or quietly promoted into, a default selection.
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

describe("W7 — a clock time comes from the clock column, or not at all", () => {
  it("W7a: NO row without `startTime` gets a clock — including one carrying a timestamp", () => {
    const battery: PlanEvent[] = [
      REHEARSAL,
      CEREMONY,
      RECEPTION,
      BARE,
      // `user_experiences.event_date` is a DATE column. A row that somehow carries a timestamp in
      // it must STILL render only its calendar day: the time of day lives in its own column, and
      // reading a clock out of this one would be manufacturing it (§13). This is the assertion
      // that did NOT relax when migration 282 landed.
      { id: "ev-ts", title: "Welcome drinks", eventDate: "2026-10-01T19:00:00.000Z", location: "Pontocho" },
      { id: "ev-space", title: "  ", eventDate: "2026-10-03", location: "  " },
      // NULL is not midnight and not "all day" — an explicit null start time shows no clock.
      { id: "ev-null", title: "Farewell brunch", eventDate: "2026-10-04", startTime: null },
      // Neither is a malformed one: the column has no DB CHECK, so a value whose shape this build
      // cannot vouch for is not rendered as a time at all.
      { id: "ev-bad", title: "Photos", eventDate: "2026-10-03", startTime: "3pm" },
    ];
    for (const choice of whichEventChoices(battery)) {
      assert.doesNotMatch(
        choice.meta,
        CLOCK_RE,
        `"${choice.meta}" reads as a clock time, but no row here has a start_time`,
      );
      assert.doesNotMatch(choice.label, CLOCK_RE);
    }
  });

  it("W7b: the mock's own times ARE now reproducible — from `start_time`, and only from it", () => {
    // The artboard draws "Sat 15:00 · Nanzen-ji". Migration 282 gave that a source, so the row
    // that HAS one renders it; the identical row without one renders exactly as it did before.
    const [, timed] = whichEventChoices([{ ...CEREMONY, startTime: "15:00" }]);
    assert.equal(timed.meta, "Fri, Oct 2 15:00 · Nanzen-ji");
    const [, untimed] = whichEventChoices([CEREMONY]);
    assert.equal(untimed.meta, "Fri, Oct 2 · Nanzen-ji");
  });

  it("W7c: a time with no date still renders — hiding it would lose an answer the traveler gave", () => {
    const [, choice] = whichEventChoices([{ id: "ev-t", title: "Round 1", startTime: "08:10" }]);
    assert.equal(choice.meta, "08:10");
  });

  it("W7d: the clock is printed VERBATIM, with no zone claimed for it", () => {
    // The value is a wall clock read in the PLAN's `trips.timezone` (ruling 30), which this module
    // does not have. So it says the time and nothing about where — no "local", no offset, no Z.
    const [, choice] = whichEventChoices([{ ...CEREMONY, startTime: "15:00" }]);
    assert.doesNotMatch(choice.meta, /local|UTC|GMT|[+-]\d{2}:\d{2}|\bZ\b/i);
  });
});

/**
 * W8 — THE ROLE HINT (ledger `2026-09-04-which-event-hint`; migration 280, Locked Decision 31).
 *
 * The fixtures below carry `rolesNeeded` exactly as the server ships it on the event row. NOTHING
 * in this file maps a role to an occasion, and nothing may: the whole point of the column is that
 * the mapping lives in the DB and travels on the wire. A test that hard-coded "a wedding wants a
 * florist" would be asserting the very second copy §18 rule 1 forbids.
 */
const CEREMONY_WITH_ROLES: PlanEvent = {
  ...CEREMONY,
  rolesNeeded: ["event_coordinator", "florist", "photography", "officiant"],
};
/** The occasion behind this row was never given a roles list — NOT SET, the column's own NULL. */
const RECEPTION_NULL_ROLES: PlanEvent = { ...RECEPTION, rolesNeeded: null };
/** No `rolesNeeded` key at all — the absent-vs-null spelling of the same absence. */
const REHEARSAL_NO_ROLES: PlanEvent = { ...REHEARSAL };

describe("W8 — a hint appears only where the server's own list puts one", () => {
  it("W8a: a listing whose category the occasion names gets the artboard's mark", () => {
    assert.equal(hintForEvent(CEREMONY_WITH_ROLES, "florist"), "suggested for florists");
    // The claim is SUGGESTION, never a judgement — the prefix is the one place it is worded.
    assert.equal(ROLE_HINT_PREFIX, "suggested for");
    assert.doesNotMatch(
      hintForEvent(CEREMONY_WITH_ROLES, "florist")!,
      /best|right|should|must|recommend/i,
      "the hint reports what the occasion asks for; it does not judge the traveler's plan",
    );
    // A different discipline on the same occasion reads in its own words, not the florist's.
    assert.equal(hintForEvent(CEREMONY_WITH_ROLES, "photography"), "suggested for photography");
  });

  it("W8b: NULL roles_needed ⇒ NO hint, and never a claim about what the event needs", () => {
    assert.equal(hintForEvent(RECEPTION_NULL_ROLES, "florist"), null);
    // Absent and null are the same absence here, and an EMPTY array is not a second empty state
    // that means something else — Locked Decision 31 refuses that reading explicitly.
    assert.equal(hintForEvent(REHEARSAL_NO_ROLES, "florist"), null);
    assert.equal(hintForEvent({ ...CEREMONY, rolesNeeded: [] }, "florist"), null);
  });

  it("W8c: a listing with NO category_key ⇒ NO hint, on any event", () => {
    for (const key of [null, undefined, ""]) {
      assert.equal(hintForEvent(CEREMONY_WITH_ROLES, key), null);
    }
  });

  it("W8d: a plain non-match is silence — there is no 'not suggested'", () => {
    const hint = hintForEvent(CEREMONY_WITH_ROLES, "accommodation");
    assert.equal(hint, null, "an event that does not list a discipline says nothing about it");
  });

  it("W8e: the implicit unnamed event is not an occasion and asks for nothing", () => {
    // The picker's first row has `event: null` — the plan's own unnamed event. It has no
    // occasion, so there is no roles list and never a hint on it.
    const [implicit] = whichEventChoices([CEREMONY_WITH_ROLES, RECEPTION_NULL_ROLES]);
    assert.equal(implicit.event, null);
    assert.equal(hintForEvent(implicit.event, "florist"), null);
    assert.equal(hintForEvent(undefined, "florist"), null);
  });

  it("W8f: a matched key this build cannot name prints NOTHING, never the raw key", () => {
    // `roles_needed` has no DB CHECK (publish-trap posture), so an unknown value can reach a
    // reader. Showing `aff_air_hotel` or a typo'd key to a traveler is worse than silence (§13).
    const odd: PlanEvent = { ...CEREMONY, rolesNeeded: ["aff_air_hotel", "not_a_real_role"] };
    assert.equal(hintForEvent(odd, "aff_air_hotel"), null);
    assert.equal(hintForEvent(odd, "not_a_real_role"), null);
  });

  it("W8g: no keyword guessing — the title, date and place are never evidence", () => {
    // An event literally CALLED "Florist meeting", whose occasion does not list the role, gets no
    // hint. The only evidence is the array the server sent.
    const named: PlanEvent = {
      id: "ev-f",
      title: "Florist meeting",
      eventDate: "2026-10-02",
      location: "Floral & Decoration",
    };
    assert.equal(hintForEvent(named, "florist"), null);
  });

  it("W8h: a hint MARKS and never CHOOSES", () => {
    // The selection is still nothing, and the rows are the same rows in the same order whether or
    // not a listing category is in play — a mark must not reorder, add or remove a choice.
    assert.equal(INITIAL_WHICH_EVENT_SELECTION, null);
    const events = [REHEARSAL_NO_ROLES, CEREMONY_WITH_ROLES, RECEPTION_NULL_ROLES];
    const choices = whichEventChoices(events);
    assert.deepEqual(
      choices.map((c) => c.key),
      [IMPLICIT_EVENT_GROUP_KEY, "ev-rehearsal", "ev-ceremony", "ev-reception"],
    );
    for (const choice of choices) {
      assert.deepEqual(
        Object.keys(choice).sort(),
        ["event", "key", "label", "meta", "value"],
        "the hint must never become a field on a choice — that is how a mark turns into a default",
      );
    }
    // Exactly ONE row is marked here, and the marked row is still not the selected one.
    const marked = choices.filter((c) => hintForEvent(c.event, "florist") !== null);
    assert.equal(marked.length, 1);
    assert.equal(marked[0].key, "ev-ceremony");
    assert.equal(findWhichEventChoice(choices, INITIAL_WHICH_EVENT_SELECTION), null);
    // And the confirm still names no event with nothing chosen.
    assert.equal(whichEventCtaLabel(null), ADD_TO_PLAN_LABEL);
  });

  it("W8i: a hint carries no clock time and no fabricated figure (W7, one surface over)", () => {
    const hint = hintForEvent(CEREMONY_WITH_ROLES, "florist")!;
    assert.doesNotMatch(hint, CLOCK_RE);
    // It names a DISCIPLINE, never a provider, a price or a count — this array is not supply.
    assert.doesNotMatch(hint, /\$|\d/);
  });
});
