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
 *   R6  `stopsShape` (the sixth column, first read by ledger `2026-09-04-plan-stops-ui`) falls
 *       back to ONE — the opposite direction to `durationShape`, for a stated reason — and only
 *       the exact string "many" opens the ordered stop list.
 *   R5  `guestListSetting` keeps `false` and `null` apart. Collapsing them to a boolean at the
 *       reader would erase the difference between "this occasion has no guests" and "nobody
 *       decided", which are opposite instructions to a surface.
 *   R7  `resolveOccasionForPlan` — events first, then R4's lookup, then null (ledger
 *       `2026-09-05-slip-switch-reads-events-first`, Locked Decision 42 D1). The agreement test is
 *       the interesting half: unanimous ⇒ that row EXACTLY; disagreement, a missing id, an id no
 *       supplied row carries, and no events at all ALL fall through rather than picking a
 *       majority, a first or a nearest — and a fall-through that is itself ambiguous is `null`,
 *       the plain-trip shape.
 *   A1-A5 the SHIPPED wiring. A resolver nobody calls resolves nothing, and the defect class here
 *       is a surface reading `trips.event_type` for a shape decision — so these assert that the
 *       hook takes the plan's events, that the slip hands them down, that the guest surface is a
 *       `guestListSetting` read with the event-type set reachable ONLY on `null`, that the
 *       schedule-template offer passes the resolved slug, and that the plancard skin routes
 *       through the occasion classifier instead of the old three-value `if` chain.
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
  stopsShape,
  type OccasionSwitchRow,
} from "../occasion-switches";
import { partyCountLabel, partyNoun, partyNounSingular } from "../plan-vocabulary";
import {
  findOccasionByEventType,
  findOccasionById,
  findOccasionByKey,
  resolveOccasionForPlan,
  unanimousEventOccasionId,
} from "@shared/occasions";
import { planCardSkin } from "@/components/plancard/plancard-types";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf-8");
const hookSrc = read("client", "src", "hooks", "use-occasion-switches.ts");
const logisticsSrc = read("client", "src", "components", "plancard", "SlipLogisticsSection.tsx");
const plancardTypesSrc = read("client", "src", "components", "plancard", "plancard-types.tsx");

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

/**
 * R6 — `default_stops`, the sixth switch and the last one to get a reader (ledger
 * `2026-09-04-plan-stops-ui`). It was deliberately unread until `trip_destinations` existed
 * (migration 281): a control that collects an answer nothing can store is worse than an absent
 * one. Its fallback points the OPPOSITE way to `durationShape`'s, and that is the interesting
 * part — not offering the stop control discards nothing (the destination field still records the
 * answer), whereas falling back to "many" would claim an undecided occasion is multi-city.
 */
describe("R6 — stopsShape falls back to ONE, and only an explicit \"many\" opens the list", () => {
  it("every not-set spelling reads as one", () => {
    for (const row of NOT_SET) {
      assert.equal(stopsShape(row), "one", `not-set row must read as one: ${JSON.stringify(row)}`);
    }
    assert.equal(stopsShape({ defaultStops: null }), "one");
    assert.equal(stopsShape({ defaultStops: undefined }), "one");
  });

  it("an unrecognised value is treated exactly like NULL (the columns carry no CHECK)", () => {
    for (const value of ["MANY", "several", "multi", "2", "", " many "]) {
      assert.equal(stopsShape({ defaultStops: value }), "one", `"${value}" must not open the list`);
    }
  });

  it('only the exact value "many" opens the ordered stop list', () => {
    assert.equal(stopsShape({ defaultStops: "many" }), "many");
    assert.equal(stopsShape({ defaultStops: "one" }), "one");
  });

  it("reads independently of the other five switches", () => {
    const row = {
      defaultStops: "many",
      defaultDuration: "day",
      defaultSchedule: false,
      defaultGuests: false,
      vocabulary: "attendees",
      defaultVisibility: "hidden",
    };
    assert.equal(stopsShape(row), "many");
    assert.equal(durationShape(row), "day");
    assert.equal(showsSchedule(row), false);
    assert.equal(isHiddenOccasion(row), true);
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

// ── R7 / A — events-first occasion resolution ─────────────────────────────────────────────────
// Ledger `2026-09-05-slip-switch-reads-events-first`; CLAUDE.md Locked Decision 42 D1, 28, 29.

/** Rows shaped like `GET /api/experience-types` returns them: an id AND a slug. */
const ROWS = [
  { id: "occ-wedding", slug: "wedding" },
  { id: "occ-birthday", slug: "birthday" },
  { id: "occ-milestone", slug: "milestone-birthday" },
  { id: "occ-corporate", slug: "corporate" },
  { id: "occ-corporate-events", slug: "corporate-events" },
  { id: "occ-proposal", slug: "proposal" },
];

describe("R7 — the plan's own events name the occasion, exactly", () => {
  it("events that AGREE resolve to that row, even when the event type is ambiguous", () => {
    // "birthday" is reachable from two slugs, so R4's lookup honestly refuses it. The events do
    // not: they carry the id itself.
    assert.equal(findOccasionByEventType(ROWS, "birthday"), null);
    const resolved = resolveOccasionForPlan({
      events: [{ experienceTypeId: "occ-milestone" }, { experienceTypeId: "occ-milestone" }],
      eventType: "birthday",
      occasions: ROWS,
    });
    assert.equal(resolved?.slug, "milestone-birthday");
  });

  it("ONE event is still unanimous", () => {
    const resolved = resolveOccasionForPlan({
      events: [{ experienceTypeId: "occ-corporate" }],
      eventType: "corporate",
      occasions: ROWS,
    });
    assert.equal(resolved?.slug, "corporate");
  });

  it("events that DISAGREE fall through — no majority, no first, no nearest", () => {
    assert.equal(
      unanimousEventOccasionId([
        { experienceTypeId: "occ-wedding" },
        { experienceTypeId: "occ-wedding" },
        { experienceTypeId: "occ-birthday" },
      ]),
      null,
    );
    // The fall-through is R4's lookup, so an unambiguous event type still answers.
    const resolved = resolveOccasionForPlan({
      events: [{ experienceTypeId: "occ-wedding" }, { experienceTypeId: "occ-birthday" }],
      eventType: "wedding",
      occasions: ROWS,
    });
    assert.equal(resolved?.slug, "wedding");
  });

  it("an event carrying NO id cannot vote and cannot be ignored — the plan says nothing", () => {
    for (const missing of [null, undefined, "", "   "]) {
      assert.equal(
        unanimousEventOccasionId([{ experienceTypeId: "occ-wedding" }, { experienceTypeId: missing }]),
        null,
        `an event with ${JSON.stringify(missing)} must break unanimity`,
      );
    }
  });

  it("NO events (absent, null or empty) falls through to the event-type lookup", () => {
    for (const events of [undefined, null, [] as const]) {
      const resolved = resolveOccasionForPlan({ events, eventType: "proposal", occasions: ROWS });
      assert.equal(resolved?.slug, "proposal", "the hidden occasion must still resolve");
    }
  });

  it("an id no supplied row carries falls through — never a nearest row", () => {
    assert.equal(findOccasionById(ROWS, "occ-deleted"), null);
    const resolved = resolveOccasionForPlan({
      events: [{ experienceTypeId: "occ-deleted" }],
      eventType: "wedding",
      occasions: ROWS,
    });
    assert.equal(resolved?.slug, "wedding");
  });

  it("BOTH attempts failing is null — the plain-trip shape, unchanged", () => {
    assert.equal(
      resolveOccasionForPlan({
        events: [{ experienceTypeId: "occ-deleted" }],
        eventType: "birthday",
        occasions: ROWS,
      }),
      null,
    );
    assert.equal(resolveOccasionForPlan({ events: [], eventType: null, occasions: ROWS }), null);
    assert.equal(
      resolveOccasionForPlan({ events: [{ experienceTypeId: "occ-wedding" }], occasions: null }),
      null,
      "no rows to look in is an honest nothing",
    );
  });

  it("is a WIDENING: every answer R4 gives, the resolver gives", () => {
    for (const eventType of ["wedding", "proposal", "anniversary", "vacation", "other", null]) {
      assert.deepEqual(
        resolveOccasionForPlan({ eventType, occasions: ROWS }),
        findOccasionByEventType(ROWS, eventType),
        `event-type-only resolution must be unchanged for "${eventType}"`,
      );
    }
  });
});

describe("R7b — the plancard skin routes through the occasion classifier", () => {
  it("a resolved occasion row is classified, not string-matched", () => {
    assert.equal(planCardSkin({ slug: "wedding-anniversaries" }), "wedding");
    assert.equal(planCardSkin({ slug: "golf-trip" }), "travel");
    assert.equal(planCardSkin({ slug: "corporate" }), "corporate");
    assert.equal(planCardSkin({ slug: "corporate-events" }), "corporate");
    assert.equal(planCardSkin({ name: "Corporate Retreats" }), "corporate");
  });

  it("NOTHING is the DEFAULT skin — the plain-plan vocabulary", () => {
    for (const nothing of [undefined, null, "", "   ", {}, { slug: null }]) {
      assert.equal(planCardSkin(nothing as never), "travel");
    }
  });

  it("an eventTypeEnum member keeps the pre-ruling answer VERBATIM (the two vocabularies collide)", () => {
    const legacy: Record<string, string> = {
      wedding: "wedding", honeymoon: "wedding", proposal: "wedding", corporate: "corporate",
      vacation: "travel", anniversary: "travel", birthday: "travel", adventure: "travel",
      cultural: "travel", other: "travel",
    };
    for (const [eventType, skin] of Object.entries(legacy)) {
      assert.equal(planCardSkin(eventType), skin, `event type "${eventType}" must not be re-skinned`);
    }
  });
});

describe("A — the shipped wiring, because a resolver nobody calls resolves nothing", () => {
  it("A1: the hook takes the plan's events and delegates to the ONE resolver", () => {
    assert.ok(
      hookSrc.includes("resolveOccasionForPlan({ events, eventType, occasions })"),
      "useOccasionSwitches must call the shared resolver, not re-implement either attempt",
    );
    assert.ok(
      !hookSrc.includes("const occasion = findOccasionByEventType("),
      "the event-type-only resolution must no longer be the hook's own answer",
    );
    assert.ok(
      hookSrc.includes("events?: readonly PlanEventOccasionRef[] | null"),
      "the events hand-down must stay OPTIONAL — an unconverted caller keeps today's behaviour",
    );
  });

  it("A2: the slip hands its own events down rather than fetching a second copy", () => {
    assert.ok(
      logisticsSrc.includes("useOccasionSwitches(tripId, planEvents)"),
      "SlipLogisticsSection must pass the plancard events array it already holds",
    );
  });

  it("A3: the guest surface is a switch read; the event-type set is reachable ONLY on null", () => {
    assert.ok(
      logisticsSrc.includes("const guestSetting = guestListSetting(occasion);"),
      "the guest gate must read default_guests through the ONE reader",
    );
    assert.ok(
      logisticsSrc.includes("guestSetting === true"),
      "an occasion that HAS guests must open the surface on its own say-so",
    );
    assert.ok(
      /guestSetting === null &&\s*LEGACY_EVENT_TYPE_GUEST_FALLBACK/.test(logisticsSrc),
      "the event-type set must be guarded by the NULL branch — never consulted over a real ruling",
    );
    assert.ok(
      !logisticsSrc.includes("EVENT_TRIP_TYPES"),
      "the unconditional EVENT_TRIP_TYPES test must not come back",
    );
    assert.ok(
      logisticsSrc.includes("!!linkedExperience ||"),
      "a plan that already has invites must never lose the surface they live on",
    );
  });

  it("A4: the schedule-template offer passes the RESOLVED slug, not a hardcoded wedding", () => {
    assert.ok(
      logisticsSrc.includes("templateSlug={anchorTemplateSlug}"),
      "WeddingAnchorPresets must be given the occasion's own slug",
    );
    assert.ok(
      !logisticsSrc.includes('templateSlug="wedding"'),
      "the hardcoded wedding template must be gone",
    );
    assert.ok(
      logisticsSrc.includes('occasion?.slug || ((trip?.eventType || "").toLowerCase() === "wedding" ? "wedding" : null)'),
      "an unresolved occasion must keep today's exact behaviour, and nothing wider",
    );
  });

  it("A5: getTemplateConfig no longer carries the three-value event-type chain", () => {
    assert.ok(
      !/eventType === "wedding" \|\| eventType === "honeymoon"/.test(plancardTypesSrc),
      "the hand-typed skin test must be gone",
    );
    assert.ok(
      plancardTypesSrc.includes("classifyOccasion(key) === \"travel\" ? \"travel\" : \"wedding\""),
      "the skin must be routed through the ONE occasion classifier",
    );
    assert.ok(
      plancardTypesSrc.includes("TEMPLATES[planCardSkin(occasion)]"),
      "getTemplateConfig must delegate to the skin resolver",
    );
  });
});
