/**
 * trip-destinations.service.test.ts — a plan's ORDERED STOPS: the rules that are not the database's.
 * Migration 281, ledger `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 34.
 *
 * WHAT THIS PROVES, AND WHY IT NEEDS NO DATABASE.
 * Everything decided BEFORE a row is written — the allowlist, the empty-list refusal, the cap, the
 * server-derived positions, the both-or-neither coordinate rule and the mirror rule — is pure
 * function in `trip-destinations.service.ts`. Asserting it here means these rules keep their proof
 * in an environment with no `DATABASE_URL`, which is where CI runs the unit lane. The transactional
 * delete+insert and the `storage.updateTrip` mirror WRITE are the parts that genuinely need a
 * database; they are deliberately NOT faked here, because a fake would prove only that the fake
 * behaves as written.
 *
 * IMPORT DISCIPLINE: the pure functions and the schema are imported from a `.pure` sibling that the
 * service re-exports from, NOT re-declared here. A copy would keep passing while the real writer
 * drifted — the exact failure the user-experience mass-assignment suite calls out.
 *
 *   T1  positions are 0-BASED and derived from array order, never from the body
 *   T2  the mirror rule: position 0's name is what `trips.destination` must become
 *   T3  an empty list is REFUSED — `trips.destination` is NOT NULL, so zero stops is not a state
 *   T4  more than MAX_TRIP_DESTINATIONS is REFUSED
 *   T5  the allowlist REFUSES unknown keys outright (no silent strip), `position`/`id`/`tripId`
 *       among them, so a caller can never renumber or re-parent a stop
 *   T6  a HALF coordinate is refused; both-or-neither, and neither is an honest unlocated stop
 *   T7  optional structure absent stays absent — nothing is derived from `name`
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TRIP_DESTINATIONS,
  mirrorDestinationFor,
  normalizeTripDestinations,
  tripDestinationsBodySchema,
} from "../services/trip-destinations.pure";

const stop = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra }) as any;

test("T1: positions are 0-based and derived from array order", () => {
  const result = normalizeTripDestinations([stop("Kyoto"), stop("Osaka"), stop("Nara")]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.rows.map((r) => [r.position, r.name]),
    [
      [0, "Kyoto"],
      [1, "Osaka"],
      [2, "Nara"],
    ],
  );
});

test("T2: the mirror is position 0's name", () => {
  const result = normalizeTripDestinations([stop("Kyoto"), stop("Osaka")]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(mirrorDestinationFor(result.rows), "Kyoto");
  // Reordering the list moves the mirror with it — that is the whole point of the rule living in
  // one function rather than at each write site.
  const reordered = normalizeTripDestinations([stop("Osaka"), stop("Kyoto")]);
  assert.equal(reordered.ok, true);
  if (!reordered.ok) return;
  assert.equal(mirrorDestinationFor(reordered.rows), "Osaka");
});

test("T3: an empty list is refused, by the schema and by the normalizer", () => {
  const parsed = tripDestinationsBodySchema.safeParse({ stops: [] });
  assert.equal(parsed.success, false, "the body schema refuses an empty list");

  const normalized = normalizeTripDestinations([]);
  assert.equal(normalized.ok, false, "the normalizer refuses it too — an internal caller has no bypass");
  if (normalized.ok) return;
  assert.match(normalized.message, /at least one stop/i);
});

test("T4: more than the cap is refused", () => {
  const tooMany = Array.from({ length: MAX_TRIP_DESTINATIONS + 1 }, (_, i) => stop(`Stop ${i}`));
  assert.equal(tripDestinationsBodySchema.safeParse({ stops: tooMany }).success, false);
  assert.equal(normalizeTripDestinations(tooMany).ok, false);

  const exactly = Array.from({ length: MAX_TRIP_DESTINATIONS }, (_, i) => stop(`Stop ${i}`));
  assert.equal(tripDestinationsBodySchema.safeParse({ stops: exactly }).success, true, "the cap itself is allowed");
});

test("T5: unknown keys are refused outright — position/id/tripId can never be client-supplied", () => {
  for (const smuggled of [{ position: 7 }, { id: "row-1" }, { tripId: "someone-elses-trip" }, { createdAt: "2026-01-01" }]) {
    const parsed = tripDestinationsBodySchema.safeParse({ stops: [stop("Kyoto", smuggled)] });
    assert.equal(
      parsed.success,
      false,
      `an unknown key ${JSON.stringify(smuggled)} must be refused, not silently dropped`,
    );
  }
  // And the legitimate five still parse — the allowlist is not a blanket denial.
  const ok = tripDestinationsBodySchema.safeParse({
    stops: [{ name: "Kyoto", city: "Kyoto", country: "Japan", lat: 35.0116, lng: 135.7681 }],
  });
  assert.equal(ok.success, true);
});

test("T6: a half coordinate is refused; neither is an honest unlocated stop", () => {
  const half = normalizeTripDestinations([stop("Kyoto", { lat: 35.0116 })]);
  assert.equal(half.ok, false, "lat without lng is a guess waiting to happen");

  const otherHalf = normalizeTripDestinations([stop("Kyoto", { lng: 135.7681 })]);
  assert.equal(otherHalf.ok, false);

  const neither = normalizeTripDestinations([stop("Kyoto")]);
  assert.equal(neither.ok, true);
  if (!neither.ok) return;
  assert.equal(neither.rows[0].lat, null, "unlocated is NULL — never 0, never a city centre");
  assert.equal(neither.rows[0].lng, null);

  const both = normalizeTripDestinations([stop("Kyoto", { lat: 35.0116, lng: 135.7681 })]);
  assert.equal(both.ok, true);
  if (!both.ok) return;
  assert.equal(both.rows[0].lat, 35.0116);
  assert.equal(both.rows[0].lng, 135.7681);
});

test("T7: absent city/country stay absent — nothing is derived from the name", () => {
  const result = normalizeTripDestinations([stop("Somewhere the traveler typed")]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.rows[0].city, null);
  assert.equal(result.rows[0].country, null);
});
