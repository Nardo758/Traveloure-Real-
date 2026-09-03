/**
 * OCCASION SWITCH READERS — the six columns are read, and a NULL is never turned into an answer.
 * Ledger `2026-09-03-switch-readers`; migration 276; CLAUDE.md Locked Decision 28.
 *
 * WHY THIS EXISTS. `experience-type-switches.test.ts` proves the SEEDER writes six real values per
 * occasion. It says nothing about what a reader does with them — and until this lane there were no
 * readers, so the interesting half of the ruling was untested: the columns are nullable with no DB
 * CHECK (the publish-trap posture), which means every reader meets three states, not two, and the
 * third one — NOT SET — is the one §13 governs. A reader that quietly resolves NULL to a plausible
 * `one`/`day`/`off` is presenting a guess with the row's authority, and nothing about the seed
 * data would reveal it.
 *
 * What these hold:
 *   R1  every switch reader falls back to the PLAIN-PLAN shape on NULL/absent/garbage, and the
 *       fallbacks point in the SAFE direction (ask for a range rather than silently collapsing a
 *       date; show a plan rather than silently deleting Share).
 *   R2  `partyNoun` reads the `vocabulary` column, and `default_guests: false` beats it — an
 *       occasion with no guest list shows no guest copy, which is a combination of two switches
 *       and therefore has exactly one place to live.
 *   R3  `partyCountLabel` agrees in number and says NOTHING for a count nobody stated (the same
 *       honest-or-absent posture `travelersForSave` enforces on the write side).
 *   R4  `findOccasionByEventType` refuses to guess: `eventTypeForSlug` is many-to-one, so a row
 *       comes back ONLY on a unique match. The proposal case — the one `hidden` occasion, and the
 *       reason the slip needs the lookup — is proven to resolve; an ambiguous family is proven to
 *       resolve to nothing rather than to whichever row was listed first.
 *   R5  `guestListSetting` keeps `false` and `null` apart. Collapsing them to a boolean at the
 *       reader would erase the difference between "this occasion has no guests" and "nobody
 *       decided", which are opposite instructions to a surface.
 *
 * Pure unit: no DOM, no DB, no fetch.
 * Run: npx tsx --test client/src/lib/__tests__/occasion-switch-readers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  durationShape,
  guestListSetting,
  isHiddenOccasion,
  showsSchedule,
  type OccasionSwitchRow,
} from "../occasion-switches";
import { partyCountLabel, partyNoun, partyNounSingular } from "../plan-vocabulary";
import { findOccasionByEventType, findOccasionByKey } from "@shared/occasions";

/** Every "the row said nothing" spelling a reader can actually meet. */
const NOT_SET: Array<OccasionSwitchRow | null | undefined> = [
  undefined,
  null,
  {},
  { defaultDuration: null, defaultSchedule: null, defaultGuests: null, defaultVisibility: null },
  // Not a member of any allowed set — the columns carry no CHECK, so this is reachable.
  { defaultDuration: "days", defaultVisibility: "visible" },
];

describe("R1 — NULL is NOT SET, and the fallback is the plain-plan shape", () => {
  it("durationShape falls back to the RANGE (asking more, never silently collapsing a date)", () => {
    for (const row of NOT_SET) {
      assert.equal(durationShape(row), "range", `not-set row must read as range: ${JSON.stringify(row)}`);
    }
    assert.equal(durationShape({ defaultDuration: "day" }), "day");
    assert.equal(durationShape({ defaultDuration: "range" }), "range");
  });

  it("showsSchedule falls back to OFF — a step that is not shown asks nothing", () => {
    for (const row of NOT_SET) assert.equal(showsSchedule(row), false);
    assert.equal(showsSchedule({ defaultSchedule: true }), true);
    assert.equal(showsSchedule({ defaultSchedule: false }), false);
  });

  it("isHiddenOccasion falls back to SHOWN — an undecided occasion never loses Share/Guests", () => {
    for (const row of NOT_SET) assert.equal(isHiddenOccasion(row), false);
    assert.equal(isHiddenOccasion({ defaultVisibility: "hidden" }), true);
    assert.equal(isHiddenOccasion({ defaultVisibility: "shown" }), false);
  });
});

describe("R2 — the party noun is the row's, and no-guest-list beats the vocabulary", () => {
  it("reads the vocabulary column", () => {
    assert.equal(partyNoun("travelers"), "travelers");
    assert.equal(partyNoun("guests"), "guests");
    assert.equal(partyNoun("attendees"), "attendees");
  });

  it("NULL / unknown ⇒ travelers, the plain-plan word (§13)", () => {
    for (const v of [undefined, null, "", "   ", "attendee", "people"]) {
      assert.equal(partyNoun(v as string | null | undefined), "travelers");
    }
  });

  it("default_guests: false forces travelers — no guest copy anywhere", () => {
    assert.equal(partyNoun("guests", false), "travelers");
    assert.equal(partyNoun("attendees", false), "travelers");
    // null is NOT a ruling: the vocabulary column still speaks.
    assert.equal(partyNoun("guests", null), "guests");
    assert.equal(partyNoun("guests", true), "guests");
  });

  it("singulars are the plurals minus the s", () => {
    assert.equal(partyNounSingular("travelers"), "traveler");
    assert.equal(partyNounSingular("guests"), "guest");
    assert.equal(partyNounSingular("attendees"), "attendee");
  });
});

describe("R3 — the count label agrees in number and stays silent when nobody answered", () => {
  it("agrees in number", () => {
    assert.equal(partyCountLabel(1, "guests"), "1 guest");
    assert.equal(partyCountLabel(4, "guests"), "4 guests");
    assert.equal(partyCountLabel(1, "attendees"), "1 attendee");
    assert.equal(partyCountLabel(2, null), "2 travelers");
  });

  it("says NOTHING for an unstated count — never '0 travelers'", () => {
    for (const n of [undefined, null, 0, -3, NaN]) {
      assert.equal(partyCountLabel(n as number | null | undefined, "guests"), "");
    }
  });

  it("honours the no-guest-list ruling here too", () => {
    assert.equal(partyCountLabel(3, "guests", false), "3 travelers");
  });
});

describe("R4 — the reverse lookup refuses to guess", () => {
  // Slugs as the seeder writes them; `eventTypeForSlug` is the mapping under test.
  const ROWS = [
    { slug: "proposal", name: "Proposal" },
    { slug: "wedding", name: "Wedding" },
    { slug: "travel", name: "Travel" },
    { slug: "romance", name: "Romantic Getaways" },
    { slug: "birthday", name: "Birthday" },
    { slug: "milestone-birthday", name: "Milestone Birthday" },
  ];

  it("resolves the proposal case — the one hidden occasion, and the reason the slip needs this", () => {
    assert.equal(findOccasionByEventType(ROWS, "proposal")?.slug, "proposal");
    assert.equal(findOccasionByEventType(ROWS, "wedding")?.slug, "wedding");
  });

  it("returns null when TWO occasions share an event type (birthday / milestone-birthday)", () => {
    assert.equal(findOccasionByEventType(ROWS, "birthday"), null);
    // travel and romance both map to "vacation".
    assert.equal(findOccasionByEventType(ROWS, "vacation"), null);
  });

  it("returns null for no rows, no event type, and an event type nothing maps to", () => {
    assert.equal(findOccasionByEventType(ROWS, null), null);
    assert.equal(findOccasionByEventType(ROWS, ""), null);
    assert.equal(findOccasionByEventType(null, "proposal"), null);
    assert.equal(findOccasionByEventType([], "proposal"), null);
    assert.equal(findOccasionByEventType(ROWS, "honeymoon"), null);
  });

  it("findOccasionByKey matches a slug OR a display name, and nothing else", () => {
    assert.equal(findOccasionByKey(ROWS, "romance")?.slug, "romance");
    assert.equal(findOccasionByKey(ROWS, "Romantic Getaways")?.slug, "romance");
    assert.equal(findOccasionByKey(ROWS, "Milestone Birthday")?.slug, "milestone-birthday");
    assert.equal(findOccasionByKey(ROWS, "Honeymoon"), null);
    assert.equal(findOccasionByKey(ROWS, ""), null);
  });
});

describe("R5 — false and null are different instructions", () => {
  it("keeps the tri-state", () => {
    assert.equal(guestListSetting({ defaultGuests: true }), true);
    assert.equal(guestListSetting({ defaultGuests: false }), false);
    assert.equal(guestListSetting({}), null);
    assert.equal(guestListSetting(undefined), null);
    assert.equal(guestListSetting({ defaultGuests: null }), null);
  });
});
