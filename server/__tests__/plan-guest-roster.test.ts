/**
 * PLAN GUEST ROSTER — the derivation, proved (ledger `2026-09-04-guests-per-event`).
 *
 * The roster is not stored anywhere: it is one row per PERSON across a plan's events, with one
 * column per event. Every rule below is a §13 honesty rule that a plausible-looking implementation
 * gets wrong, so each is pinned:
 *
 *   R1  dedupe is by NORMALISED EMAIL (lowercase + trim) and by nothing else.
 *   R2  an invite with NO email is its OWN row and is never merged into another — nothing in the
 *       data says it is the same person, and name matching is refused by ruling.
 *   R3  column order FOLLOWS THE EVENT ORDER GIVEN; the builder is not a second ordering
 *       authority beside `storage.getUserExperiencesByTrip` (§18 rule 1).
 *   R4  `not_invited` and `pending` are DIFFERENT answers — never invited vs invited and silent.
 *   R5  two invites with two different dietary notes yield the UNION, never a silent pick.
 *   R6  `totals.countries` is ABSENT (not 0) when no guest states an origin country.
 *
 * Pure: imports the builder only. `loadPlanGuestRoster` in the same module imports `storage`
 * LAZILY for exactly this reason — `server/db` throws without DATABASE_URL, and these proofs must
 * run in plain CI with no database.
 *
 * Run: npx tsx --test server/__tests__/plan-guest-roster.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanGuestRoster,
  type PlanGuestRosterEventInput,
  type PlanGuestRosterInviteInput,
} from "../services/plan-guest-roster.service";

const CEREMONY = "evt-ceremony";
const RECEPTION = "evt-reception";
const BRUNCH = "evt-brunch";

/** Events in the server's canonical order (`event_date ASC NULLS LAST, created_at ASC`). */
const EVENTS: PlanGuestRosterEventInput[] = [
  { id: CEREMONY, title: "Ceremony", eventDate: "2026-10-02" },
  { id: RECEPTION, title: "Reception", eventDate: "2026-10-03" },
  { id: BRUNCH, title: "Brunch", eventDate: "2026-10-04" },
];

function invite(over: Partial<PlanGuestRosterInviteInput> & { id: string; experienceId: string }) {
  return { createdAt: "2026-09-01T00:00:00.000Z", ...over } as PlanGuestRosterInviteInput;
}

const guestByName = (roster: ReturnType<typeof buildPlanGuestRoster>, name: string) => {
  const row = roster.guests.find((g) => g.name === name);
  assert.ok(row, `no roster row named ${name}`);
  return row!;
};

describe("R1 — one row per person, deduplicated by normalised email", () => {
  const roster = buildPlanGuestRoster(EVENTS, [
    invite({
      id: "i1",
      experienceId: CEREMONY,
      guestEmail: "Priya@Example.com",
      guestName: "Priya Mehta",
      rsvpStatus: "accepted",
    }),
    invite({
      id: "i2",
      experienceId: RECEPTION,
      guestEmail: "  priya@example.com  ",
      guestName: "Priya Mehta",
      rsvpStatus: "declined",
    }),
  ]);

  it("collapses the two invites into ONE guest", () => {
    assert.equal(roster.guests.length, 1);
    assert.equal(roster.guests[0].email, "priya@example.com");
    assert.equal(roster.totals.invited, 1);
  });

  it("keeps EACH event's own answer on that one row", () => {
    const priya = roster.guests[0];
    assert.equal(priya.rsvp[CEREMONY], "attending");
    assert.equal(priya.rsvp[RECEPTION], "declined");
  });

  it("counts a person attending ANY event once in totals.attending", () => {
    assert.equal(roster.totals.attending, 1);
    assert.deepEqual(roster.totals.perEvent[CEREMONY], { invited: 1, attending: 1 });
    assert.deepEqual(roster.totals.perEvent[RECEPTION], { invited: 1, attending: 0 });
  });
});

describe("R2 — a guest with no email is never merged", () => {
  const roster = buildPlanGuestRoster(EVENTS, [
    invite({ id: "n1", experienceId: CEREMONY, guestEmail: "", guestName: "Aiko Tanaka" }),
    invite({ id: "n2", experienceId: RECEPTION, guestEmail: "   ", guestName: "Aiko Tanaka" }),
  ]);

  it("keeps two same-named, email-less invites as TWO rows (no name matching, by ruling)", () => {
    assert.equal(roster.guests.length, 2);
    assert.deepEqual(
      roster.guests.map((g) => g.key).sort(),
      ["invite:n1", "invite:n2"],
    );
  });

  it("omits `email` entirely rather than emitting an empty string", () => {
    for (const guest of roster.guests) {
      assert.equal("email" in guest, false);
    }
  });
});

describe("R3 — column order follows the event order given", () => {
  it("preserves the caller's order and does not re-sort by date or title", () => {
    const reordered = [EVENTS[2], EVENTS[0], EVENTS[1]];
    const roster = buildPlanGuestRoster(reordered, []);
    assert.deepEqual(roster.events.map((e) => e.id), [BRUNCH, CEREMONY, RECEPTION]);
  });

  it("renders a column for an event with ZERO invites, every cell not_invited", () => {
    const roster = buildPlanGuestRoster(EVENTS, [
      invite({ id: "i1", experienceId: CEREMONY, guestEmail: "a@example.com", guestName: "A" }),
    ]);
    assert.equal(roster.events.length, 3);
    assert.equal(roster.guests[0].rsvp[BRUNCH], "not_invited");
    assert.deepEqual(roster.totals.perEvent[BRUNCH], { invited: 0, attending: 0 });
  });
});

describe("R4 — not_invited and pending are different answers", () => {
  const roster = buildPlanGuestRoster(EVENTS, [
    invite({
      id: "i1",
      experienceId: CEREMONY,
      guestEmail: "liu@example.com",
      guestName: "Liu Wei",
      rsvpStatus: "pending",
    }),
    invite({
      id: "i2",
      experienceId: RECEPTION,
      guestEmail: "liu@example.com",
      guestName: "Liu Wei",
      rsvpStatus: "no_response",
    }),
  ]);

  it("invited-and-silent is `pending`, never-invited is `not_invited`", () => {
    const liu = guestByName(roster, "Liu Wei");
    assert.equal(liu.rsvp[CEREMONY], "pending");
    assert.equal(liu.rsvp[RECEPTION], "pending");
    assert.equal(liu.rsvp[BRUNCH], "not_invited");
  });

  it("counts a pending guest as INVITED but not attending", () => {
    assert.equal(roster.totals.invited, 1);
    assert.equal(roster.totals.attending, 0);
    assert.deepEqual(roster.totals.perEvent[CEREMONY], { invited: 1, attending: 0 });
  });

  it("treats `maybe` as not-yet-a-yes, never as attending", () => {
    const maybeRoster = buildPlanGuestRoster(EVENTS, [
      invite({
        id: "m1",
        experienceId: CEREMONY,
        guestEmail: "m@example.com",
        guestName: "M",
        rsvpStatus: "maybe",
      }),
    ]);
    assert.equal(maybeRoster.guests[0].rsvp[CEREMONY], "pending");
    assert.equal(maybeRoster.totals.attending, 0);
  });
});

describe("R5 — dietary notes are the UNION across a person's invites", () => {
  const roster = buildPlanGuestRoster(EVENTS, [
    invite({
      id: "i1",
      experienceId: CEREMONY,
      guestEmail: "emma@example.com",
      guestName: "Emma Dubois",
      dietaryRestrictions: ["Gluten-free"],
    }),
    invite({
      id: "i2",
      experienceId: RECEPTION,
      guestEmail: "emma@example.com",
      guestName: "Emma Dubois",
      dietaryRestrictions: ["gluten-free", "No shellfish"],
    }),
  ]);

  it("keeps both notes and de-duplicates case-insensitively", () => {
    assert.deepEqual(guestByName(roster, "Emma Dubois").dietary, ["Gluten-free", "No shellfish"]);
  });

  it("leaves `dietary` empty — never a fabricated 'no restrictions' — when nothing was stated", () => {
    const silent = buildPlanGuestRoster(EVENTS, [
      invite({ id: "s1", experienceId: CEREMONY, guestEmail: "s@example.com", guestName: "S" }),
    ]);
    assert.deepEqual(silent.guests[0].dietary, []);
  });
});

describe("R6 — origins: `from` and `countries` are omitted, never zero-filled", () => {
  it("omits totals.countries entirely when no guest states an origin country", () => {
    const roster = buildPlanGuestRoster(EVENTS, [
      invite({ id: "i1", experienceId: CEREMONY, guestEmail: "a@example.com", guestName: "A" }),
      invite({
        id: "i2",
        experienceId: CEREMONY,
        guestEmail: "b@example.com",
        guestName: "B",
        originCity: "Kyoto",
      }),
    ]);
    assert.equal("countries" in roster.totals, false);
    assert.equal("from" in roster.guests[0], false);
    assert.equal(guestByName(roster, "B").from, "Kyoto");
  });

  it("counts DISTINCT origin countries when they exist", () => {
    const roster = buildPlanGuestRoster(EVENTS, [
      invite({
        id: "i1",
        experienceId: CEREMONY,
        guestEmail: "a@example.com",
        guestName: "A",
        originCity: "Mumbai",
        originCountry: "India",
      }),
      invite({
        id: "i2",
        experienceId: CEREMONY,
        guestEmail: "b@example.com",
        guestName: "B",
        originCity: "London",
        originCountry: "UK",
      }),
      invite({
        id: "i3",
        experienceId: RECEPTION,
        guestEmail: "c@example.com",
        guestName: "C",
        originCity: "Manchester",
        originCountry: "uk",
      }),
    ]);
    assert.equal(roster.totals.countries, 2);
    assert.equal(guestByName(roster, "A").from, "Mumbai, India");
  });

  it("shows BOTH stated origins rather than silently picking one", () => {
    const roster = buildPlanGuestRoster(EVENTS, [
      invite({
        id: "i1",
        experienceId: CEREMONY,
        guestEmail: "x@example.com",
        guestName: "X",
        originCity: "Kyoto",
        originCountry: "Japan",
      }),
      invite({
        id: "i2",
        experienceId: RECEPTION,
        guestEmail: "x@example.com",
        guestName: "X",
        originCity: "Osaka",
        originCountry: "Japan",
      }),
    ]);
    assert.equal(roster.guests[0].from, "Kyoto, Japan · Osaka, Japan");
  });
});

describe("the roster ignores invites that belong to another plan's event", () => {
  it("drops an invite whose experienceId is not one of this plan's events", () => {
    const roster = buildPlanGuestRoster(EVENTS, [
      invite({
        id: "i1",
        experienceId: "evt-someone-elses",
        guestEmail: "stranger@example.com",
        guestName: "Stranger",
      }),
    ]);
    assert.equal(roster.guests.length, 0);
    assert.equal(roster.totals.invited, 0);
    assert.equal("countries" in roster.totals, false);
  });
});
