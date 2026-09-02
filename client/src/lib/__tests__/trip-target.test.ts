/**
 * F-2 — the ONE trip-target resolver shared by the /services grid and the service-detail page
 * (client/src/lib/trip-target.ts). Pure unit; no DB, no browser.
 *
 * Evidence (manual test session): the slip's row-12 CTA scopes the marketplace to one trip
 * (`/services?tripId=<id>`), the grid honoured it, but the grid's links into `/services/:id`
 * dropped the query string and service-detail never read a `tripId` at all — so opening a listing
 * from a trip-scoped browse and booking it landed in a trip-less cart ("Your Cart — General").
 *
 * These pin the two halves of the fix:
 *   R1-R5  resolution ORDER — URL `?tripId=` first, then the active TripContext, then none.
 *          A "none" answer must be the empty string, never a guessed or stale id (§13).
 *   H1-H4  the detail HREF the grid links to — carries the target forward, and with no target
 *          is byte-identical to the pre-existing plain `/services/:id` link.
 *
 * The order is written once, here, because BOTH surfaces call it — a second copy of
 * "URL first, then context" is exactly how they drifted apart (§18 rule 1, derivation drift).
 *
 * Run: npx tsx --test client/src/lib/__tests__/trip-target.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readTripIdParam, resolveTargetTripId, serviceDetailHref } from "../trip-target";

const TRIP_URL = "11111111-1111-4111-8111-111111111111";
const TRIP_CTX = "22222222-2222-4222-8222-222222222222";

test("R1 the URL handoff wins over the active TripContext", () => {
  assert.equal(
    resolveTargetTripId(`?tripId=${TRIP_URL}`, { tripId: TRIP_CTX }),
    TRIP_URL,
    "an explicit ?tripId= is the traveler saying 'this trip' — it must beat whatever is merely active",
  );
});

test("R2 the active TripContext is used when the URL carries no handoff", () => {
  assert.equal(resolveTargetTripId("", { tripId: TRIP_CTX }), TRIP_CTX);
  assert.equal(resolveTargetTripId("?q=kyoto&page=2", { tripId: TRIP_CTX }), TRIP_CTX);
});

test("R3 no URL handoff and no context resolves to NO target (never a guess)", () => {
  assert.equal(resolveTargetTripId("", {}), "");
  assert.equal(resolveTargetTripId("", null), "");
  assert.equal(resolveTargetTripId(undefined, undefined), "");
  assert.equal(resolveTargetTripId("?q=kyoto", { tripId: "" }), "");
});

test("R4 blank/whitespace ids read as absent, on both rails", () => {
  // A `?tripId=` with nothing after it must fall through to the context, not resolve to "".
  assert.equal(resolveTargetTripId("?tripId=", { tripId: TRIP_CTX }), TRIP_CTX);
  assert.equal(resolveTargetTripId("?tripId=%20%20", { tripId: TRIP_CTX }), TRIP_CTX);
  assert.equal(resolveTargetTripId("?tripId=", { tripId: "   " }), "");
});

test("R5 the search string parses with or without its leading '?'", () => {
  assert.equal(resolveTargetTripId(`tripId=${TRIP_URL}`, {}), TRIP_URL);
  assert.equal(resolveTargetTripId(`?tripId=${TRIP_URL}`, {}), TRIP_URL);
  assert.equal(readTripIdParam(`?showExperts=true&tripId=${TRIP_URL}`), TRIP_URL);
});

test("H1 the detail href carries the target trip forward", () => {
  assert.equal(serviceDetailHref("svc-1", TRIP_URL), `/services/svc-1?tripId=${TRIP_URL}`);
});

test("H2 with no target trip the href is the plain pre-existing link", () => {
  assert.equal(serviceDetailHref("svc-1"), "/services/svc-1");
  assert.equal(serviceDetailHref("svc-1", ""), "/services/svc-1");
  assert.equal(serviceDetailHref("svc-1", null), "/services/svc-1");
  assert.equal(serviceDetailHref("svc-1", "   "), "/services/svc-1");
});

test("H3 the href round-trips back through the resolver (grid → detail is one contract)", () => {
  const href = serviceDetailHref("svc-1", TRIP_URL);
  const search = href.slice(href.indexOf("?"));
  assert.equal(resolveTargetTripId(search, {}), TRIP_URL);
});

test("H4 ids are encoded into the query string", () => {
  assert.equal(serviceDetailHref("svc-1", "a b&c=d"), "/services/svc-1?tripId=a%20b%26c%3Dd");
});
