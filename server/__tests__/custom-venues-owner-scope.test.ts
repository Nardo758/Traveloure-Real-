/**
 * custom-venues-owner-scope.test.ts — ledger `2026-09-05-custom-venues-owner-scope`.
 *
 * §14 applied to READS: a route whose rows are user-owned derives the owner from the SESSION and
 * never from `req.query`. `GET /api/custom-venues` did the opposite — no `isAuthenticated`, and a
 * `userId` read off the query string into a storage reader that treated it as an optional filter,
 * so omitting it returned every custom venue on the table (rows that carry private addresses) and
 * supplying one returned any named user's. `GET /api/custom-venues/:id` had no owner check at all.
 *
 * No DB and no HTTP here: everything the fix decides is either a pure predicate (P*, T*) or a fact
 * about the shipped route/storage artifacts (A*), and both are checkable without either. The route
 * handlers themselves live in `content.routes.ts`, which imports the entire server; an HTTP test of
 * them would need a database this lane cannot reach, and would not prove anything the artifact
 * assertions below do not.
 *
 * Run: npx tsx --test server/__tests__/custom-venues-owner-scope.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isCustomVenueOwner, scopeTripFilter } from "../utils/custom-venue-owner";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const routesSrc = readFileSync(join(ROOT, "server", "routes", "content.routes.ts"), "utf-8");
const storageSrc = readFileSync(join(ROOT, "server", "storage.ts"), "utf-8");

/** The `router.get("/api/custom-venues", …)` block, up to the next route registration. */
function routeBlock(marker: string): string {
  const start = routesSrc.indexOf(marker);
  assert.notEqual(start, -1, `route not found in content.routes.ts: ${marker}`);
  const rest = routesSrc.slice(start + marker.length);
  const next = rest.search(/\n\s*router\s*\.\s*(get|post|put|patch|delete)\s*\(/);
  return rest.slice(0, next === -1 ? undefined : next);
}

const LIST_MARKER = 'router.get("/api/custom-venues", ';
const DETAIL_MARKER = 'router.get("/api/custom-venues/:id", ';

// ── P: the ownership predicate ───────────────────────────────────────────────────────────────────

test("P1: the owner of a venue is an owner", () => {
  assert.equal(isCustomVenueOwner({ userId: "u-1" }, "u-1"), true);
});

test("P2: a different user is not an owner", () => {
  assert.equal(isCustomVenueOwner({ userId: "u-1" }, "u-2"), false);
});

test("P3: an ABSENT session user is never an owner — not even of an ownerless row", () => {
  // The shape that turns two absences into a grant (`undefined === undefined`) is exactly what a
  // hand-written `venue.userId !== userId` comparison does when both sides are missing.
  assert.equal(isCustomVenueOwner({ userId: "u-1" }, undefined), false);
  assert.equal(isCustomVenueOwner({ userId: "u-1" }, null), false);
  assert.equal(isCustomVenueOwner({ userId: "u-1" }, ""), false);
  assert.equal(isCustomVenueOwner({ userId: null }, null), false);
  assert.equal(isCustomVenueOwner({ userId: undefined }, undefined), false);
});

test("P4: a missing venue and a venue with no owner column are both refused (fail-closed)", () => {
  assert.equal(isCustomVenueOwner(null, "u-1"), false);
  assert.equal(isCustomVenueOwner(undefined, "u-1"), false);
  assert.equal(isCustomVenueOwner({}, "u-1"), false);
  assert.equal(isCustomVenueOwner({ userId: null }, "u-1"), false);
});

// ── T: the tripId filter ─────────────────────────────────────────────────────────────────────────

const owns = async () => true;
const ownsNot = async () => false;

test("T1: a trip the caller owns is honoured as a filter", async () => {
  assert.equal(await scopeTripFilter("trip-1", "u-1", owns), "trip-1");
});

test("T2: a trip the caller does NOT own is treated as ABSENT, not as an error", async () => {
  assert.equal(await scopeTripFilter("trip-someone-else", "u-1", ownsNot), undefined);
});

test("T3: absent / malformed trip ids resolve to no filter", async () => {
  assert.equal(await scopeTripFilter(undefined, "u-1", owns), undefined);
  assert.equal(await scopeTripFilter("", "u-1", owns), undefined);
  // Express gives an array for a repeated query param — not a string, so not a trip id.
  assert.equal(await scopeTripFilter(["trip-1", "trip-2"], "u-1", owns), undefined);
  assert.equal(await scopeTripFilter({ evil: true }, "u-1", owns), undefined);
});

test("T4: an empty session user is refused WITHOUT consulting ownership", async () => {
  let called = false;
  const spy = async () => {
    called = true;
    return true;
  };
  assert.equal(await scopeTripFilter("trip-1", "", spy), undefined);
  assert.equal(called, false);
});

// ── A: the shipped route artifacts ───────────────────────────────────────────────────────────────

test("A1: both GET routes are gated by isAuthenticated", () => {
  assert.ok(routesSrc.includes(`${LIST_MARKER}isAuthenticated`), "list route is not gated");
  assert.ok(routesSrc.includes(`${DETAIL_MARKER}isAuthenticated`), "detail route is not gated");
});

test("A2: the list route never reads an owner id from the query string", () => {
  const block = routeBlock(LIST_MARKER);
  // The defect, verbatim: `const { userId, tripId, experienceType } = req.query;`
  assert.equal(/\{[^}]*\buserId\b[^}]*\}\s*=\s*req\.query/.test(block), false);
  assert.equal(/req\.query[?.[\s]*["']?userId/.test(block), false);
});

test("A3: the list route derives the owner from the session and passes it to storage first", () => {
  const block = routeBlock(LIST_MARKER);
  assert.match(block, /const userId = getUserId\(req\)/);
  assert.match(block, /if \(!userId\) return res\.status\(401\)/);
  // The owner is the FIRST argument of the storage call — the position that used to carry the
  // caller-supplied value.
  assert.match(block, /getCustomVenuesPage\(\s*\n?\s*userId,/);
});

test("A4: the list route verifies the tripId filter through the shared helper", () => {
  assert.match(routeBlock(LIST_MARKER), /scopeTripFilter\(tripId, userId, verifyTripOwnership\)/);
});

test("A5: the detail route answers 'not found or not yours' identically (undifferentiated 404)", () => {
  const block = routeBlock(DETAIL_MARKER);
  assert.match(block, /if \(!isCustomVenueOwner\(venue, userId\)\)/);
  assert.match(block, /status\(404\)/);
  // A 403 here would tell an unauthenticated prober which venue ids exist.
  assert.equal(/status\(403\)/.test(block), false);
});

test("A6: all four custom-venue routes use the ONE predicate — no re-typed comparison", () => {
  // §18 rule 1: the hand-written comparison existed on two of four routes and was absent from the
  // two that leaked. A fifth surface must call the helper, not re-type this.
  const venuesSection = routesSrc.slice(
    routesSrc.indexOf("=== Custom Venues Routes ==="),
    routesSrc.indexOf("=== Experience Types Routes ==="),
  );
  assert.ok(venuesSection.length > 0, "custom-venues section not found");
  assert.equal(/venue\.userId\s*!==\s*userId/.test(venuesSection), false);
  assert.equal((venuesSection.match(/isCustomVenueOwner\(/g) ?? []).length, 3); // GET :id, PATCH, DELETE
});

// ── S: the storage layer refuses an ownerless listing ────────────────────────────────────────────

test("S1: both custom-venue readers require an owner and throw when it is missing", () => {
  // Second layer (the same two-layer placement §18 requires for a privileged field): the route is
  // fixed, and no FUTURE caller can list the whole table by leaving the argument off.
  assert.match(storageSrc, /getCustomVenues\(userId: string, tripId\?: string/);
  assert.match(storageSrc, /throw new Error\("getCustomVenues requires an owner userId"\)/);
  assert.match(storageSrc, /getCustomVenuesPage\(\s*\n?\s*userId: string,/);
  assert.match(storageSrc, /throw new Error\("getCustomVenuesPage requires an owner userId"\)/);
});

test("S2: neither reader can build a query with no owner condition", () => {
  // The exact line that turned an omitted owner into "select every row".
  const section = storageSrc.slice(
    storageSrc.indexOf("// Custom Venues"),
    storageSrc.indexOf("// Vendor Availability Slots"),
  );
  assert.ok(section.length > 0, "custom venues storage section not found");
  assert.equal(/conditions\.length === 0/.test(section), false);
  const pageStart = storageSrc.indexOf("async getCustomVenuesPage(");
  const pageBody = storageSrc.slice(pageStart, pageStart + 1400);
  assert.equal(/conditions\.length > 0 \? and\(\.\.\.conditions\) : undefined/.test(pageBody), false);
  assert.match(pageBody, /const conditions = \[eq\(customVenues\.userId, userId\)\]/);
});
