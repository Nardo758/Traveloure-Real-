/**
 * THE PARTY TOTAL AND THE HOME-CITY MATCHER — the two derivations that moved into `shared/` so
 * they would stop having two homes. Ledger `2026-09-05-slip-events-first-render`;
 * CLAUDE.md Locked Decision 33 ("`travelers` stays DERIVED from the pair by one `partyTotal`"),
 * Locked Decision 38 (the date-night home-city pre-fill), §13 and §18 rule 1.
 *
 * WHY THIS EXISTS. Both defects these pin were invisible from either side alone:
 *
 *   P — the party total. Step 4 wrote `trips.adults`/`trips.kids` through
 *       `PATCH /api/trips/:tripId/occasion` and nothing wrote the DERIVED total, so the slip
 *       header (which reads `trips.number_of_travelers` through the plancard assembler) said
 *       "1 traveler" while the Trip Strip chip and step 4 both said "2 guests". The client's
 *       `partyTotal` was correct; the server had its own inline copy on the create path and the
 *       occasion PATCH had neither. One implementation, three callers, is the whole fix.
 *
 *   H — the home city. `users.home_city` had exactly one writer, reachable only from the Plus
 *       occasions surface, so a non-Plus traveler could never state one and ruling 38's step-2
 *       pre-fill could never fire. The Profile page is a second SURFACE on that same writer, and
 *       both offer the SAME market list and the SAME matcher — a second list is how the expert
 *       application ended up offering ten cities that did not include Kyoto.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test shared/__tests__/plan-party-total.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { partyTotal, travelersForSave } from "../plan-vocabulary";
import {
  canonicalMarketName,
  OPERATING_MARKETS,
  OPERATING_MARKET_CITY_NAMES,
} from "../operating-markets";

// ── P — the party total ───────────────────────────────────────────────────────────────────────

test("P1: the total is the sum of the two answers, in every spelling the wire uses", () => {
  assert.equal(partyTotal(2, 1), 3);
  assert.equal(partyTotal("2", "1"), 3);
  // The walkthrough's own case: step 4's two adults, no kids field touched.
  assert.equal(partyTotal(2, null), 2);
  assert.equal(partyTotal("2", ""), 2);
});

test("P2 (§13): a pair that states NOTHING derives nothing — never 0, never a fabricated 1", () => {
  for (const [a, k] of [
    [null, null],
    [undefined, undefined],
    ["", ""],
    ["   ", null],
    [0, 0],
    ["0", "0"],
    [-3, -1],
    ["abc", "def"],
    [Number.NaN, null],
  ] as const) {
    assert.equal(partyTotal(a as any, k as any), undefined, `${String(a)}/${String(k)}`);
  }
  // This is the value the occasion PATCH tests for: `undefined` ⇒ it writes no
  // `number_of_travelers` at all, rather than stamping a count nobody stated.
});

test("P3: a kids count with no adults is honoured as GIVEN, never topped up with an assumed adult", () => {
  assert.equal(partyTotal(null, 3), 3);
  assert.equal(partyTotal("", "1"), 1);
});

test("P4: the total delegates to `travelersForSave` — one reading of 'they did not answer'", () => {
  // Not a re-implementation test for its own sake: the two halves MUST agree, or a zero typed into
  // one field would count while the same zero in the other did not.
  for (const raw of ["", "   ", "0", "-2", "abc", null, undefined]) {
    assert.equal(travelersForSave(raw as any), undefined);
    assert.equal(partyTotal(raw as any, raw as any), undefined);
  }
  assert.equal(travelersForSave("2.7"), 2, "a fractional party is floored, not rounded up");
  assert.equal(partyTotal("2.7", "0.4"), 2, "and the floor happens BEFORE the addition");
});

test("P5: the derivation the trip-create path used to write inline gives the same answer", () => {
  // `sanitizedInput.numberOfTravelers = adults + (kids ?? 0)` — the exact expression that was
  // duplicated in `server/routes.ts`, for every input it was reachable with (adults >= 1).
  for (const adults of [1, 2, 5, 40]) {
    for (const kids of [null, 0, 1, 4]) {
      assert.equal(partyTotal(adults, kids), adults + (kids ?? 0));
    }
  }
});

// ── H — the home-city matcher ─────────────────────────────────────────────────────────────────

test("H1: the city list is DERIVED from the operating markets, never hand-listed", () => {
  assert.deepEqual(OPERATING_MARKET_CITY_NAMES, OPERATING_MARKETS.map((m) => m.cityName));
  assert.ok(OPERATING_MARKET_CITY_NAMES.includes("Kyoto"), "the flagship market is in the list");
  assert.equal(new Set(OPERATING_MARKET_CITY_NAMES).size, OPERATING_MARKET_CITY_NAMES.length);
});

test("H2: a match is case- and whitespace-insensitive and returns the CANONICAL spelling", () => {
  assert.equal(canonicalMarketName("kyoto"), "Kyoto");
  assert.equal(canonicalMarketName("  KYOTO  "), "Kyoto");
  assert.equal(canonicalMarketName("Kyoto"), "Kyoto");
});

test("H3 (§13): anything that is not one of the markets is REFUSED, never coerced to a near one", () => {
  for (const bad of ["Kyot", "Kyoto, Japan", "Paris", "", "   ", null, undefined, 7, {}, []]) {
    assert.equal(canonicalMarketName(bad as any), null, JSON.stringify(bad));
  }
  // "Kyoto, Japan" is deliberately refused: the column stores the bare city name, and silently
  // trimming a country off a submitted string would be this module guessing what was meant.
});

test("H4: every market round-trips — the Profile picker can only offer values the writer accepts", () => {
  // The picker renders the SERVER's `markets` array (this same list), so an option the traveler
  // can select must always be one the PATCH will store. A drift here is a form that 400s on save.
  for (const city of OPERATING_MARKET_CITY_NAMES) {
    assert.equal(canonicalMarketName(city), city);
  }
});
