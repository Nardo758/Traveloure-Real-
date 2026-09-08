/**
 * A CONCIERGE REQUEST'S `tripId` IS A CLAIM, AND IT IS VERIFIED. Ledger
 * `2026-09-07-concierge-trip-ownership`; CLAUDE.md §14's identity rule ("the acting user from the
 * session — NEVER from `req.body`") applied one table over, to the PLAN a request names.
 *
 * WHAT WAS WRONG. Both concierge create paths — `POST /api/concierge/requests` and
 * `POST /api/concierge/quote` — wrote `concierge_requests.trip_id` straight from `req.body` with
 * no check of any kind, so a claimed guest request could name any plan on the platform. Nothing
 * read the column, which is exactly why nobody noticed: the same reason §18 rule 3 gives for
 * stripping a privileged field with no consumer.
 *
 *   C1  Neither create path stores `body.tripId`; both resolve it first.
 *   C2  Ownership is the EXISTING shared predicate (`verifyTripOwnership`), not a second one.
 *   C3  The resolver's three answers stay three answers (§13): absent ⇒ stored as absent,
 *       owned ⇒ stored, anything else ⇒ REFUSED — never silently dropped, never stored unverified.
 *   C4  One refusal message for every failing case, so the rail cannot probe which trips exist.
 *
 * A SOURCE PIN, and it says so. The resolver reaches the database through `verifyTripOwnership`,
 * so proving its behaviour end-to-end needs a live trip row; what regresses invisibly here is the
 * WIRING — a later edit re-pointing an insert back at `body.tripId` type-checks, runs, and stores
 * an unverified linkage in silence. That is what these pins hold.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const src = readFileSync(join(repoRoot, "server/routes/concierge.routes.ts"), "utf8");

/** The body of one route handler, by its registration line. */
function handler(marker: string): string {
  const start = src.indexOf(marker);
  assert.ok(start > 0, `${marker} must exist`);
  const end = src.indexOf("\nrouter.", start + marker.length);
  return src.slice(start, end === -1 ? undefined : end);
}

test("C1 neither create path stores a body-supplied tripId", () => {
  for (const marker of ['router.post("/api/concierge/requests"', 'router.post("/api/concierge/quote"']) {
    const body = handler(marker);
    assert.ok(
      !/tripId:\s*body\.tripId/.test(body),
      `${marker} must not store body.tripId directly`,
    );
    assert.ok(body.includes("resolveOwnedTripId("), `${marker} must resolve the claim`);
    assert.ok(body.includes("refuseUnverifiedTrip(res)"), `${marker} must refuse an unverified claim`);
    assert.ok(body.includes("tripClaim.tripId"), `${marker} must store the resolved value`);
  }
});

test("C2 ownership is the existing shared predicate, not a second one", () => {
  assert.ok(src.includes('from "../utils/trip-ownership"'), "it must import the shared helper");
  assert.ok(src.includes("await verifyTripOwnership("), "it must call it");
  // §18 rule 1: no re-implementation of the ownership read beside it.
  const resolver = src.slice(src.indexOf("async function resolveOwnedTripId("));
  const resolverBody = resolver.slice(0, resolver.indexOf("\n}"));
  assert.ok(!/storage\.getTrip\(|db\.select\(/.test(resolverBody), "it must not re-read the trip itself");
});

test("C3 the resolver keeps three distinct answers", () => {
  const resolver = src.slice(src.indexOf("async function resolveOwnedTripId("));
  const body = resolver.slice(0, resolver.indexOf("\n}\n"));
  // absent ⇒ ok with no value (a request that belongs to no plan keeps belonging to none)
  assert.ok(/tripId === undefined\)\s*return \{ ok: true \}/.test(body));
  // no session ⇒ refused, because nothing about a guest's claim can be checked
  assert.ok(/if \(!userId\) return \{ ok: false \}/.test(body));
  // owned ⇒ carried; not owned ⇒ refused
  assert.ok(/owns \? \{ ok: true, tripId: trimmed \} : \{ ok: false \}/.test(body));
});

test("C4 there is exactly one refusal, and it discloses nothing", () => {
  const refusal = src.slice(src.indexOf("function refuseUnverifiedTrip("));
  const body = refusal.slice(0, refusal.indexOf("\n}"));
  assert.ok(body.includes("trip_not_yours"));
  // "does not exist" and "not yours" must not be distinguishable from the response.
  assert.ok(!/not_found|does not exist/i.test(body));
  assert.equal(src.split("refuseUnverifiedTrip(res)").length - 1, 2, "one refusal per create path");
});
