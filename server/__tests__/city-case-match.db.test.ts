/**
 * city-case-match.db.test.ts — case-insensitive city match + 301-to-canonical.
 *
 * Runs against a live server (BASE_URL, default 127.0.0.1:5000), the same harness
 * as fp1-console-defects.db.test.ts. Read-only: it reads the seeded "Kyoto" market;
 * no writes, so no disposable-DB opt-in is required.
 *
 * The bug it pins: the marketplace reads (neighborhoods, gems, provider services)
 * matched city with case-sensitive `eq()` against the title-case canonical
 * ("Kyoto"), so `/kyoto` returned an HTTP-200 but partially-EMPTY feed. The fix
 * normalizes the incoming name to canonical casing in getLocationView, and a
 * server route 301s a mis-cased page URL to the canonical casing.
 *
 * T-8 (ledger `2026-09-15-orphans-t8-t9-server-tests-class`) — ORDERING CONTRACT, STATED SO IT IS
 * NOT BROKEN BY ACCIDENT. `GET /api/discover/location/:city` is served from an IN-PROCESS,
 * 5-MINUTE cache keyed `v5|<canonical city>:<country>` (`server/services/location-view.service.ts`),
 * with every casing of one city sharing ONE entry. This suite and
 * `server/__tests__/fp1-console-defects.db.test.ts` are the only two suites in the tree that read
 * that endpoint, and they read the SAME key (`Kyoto:Japan`). Whichever runs first fills the entry
 * and the other is served it. That is harmless in this direction and fatal in the other: fp1's
 * B4-b creates three listings and then asserts the payload contains them, so a payload cached by
 * THIS suite beforehand makes it fail (reproduced deterministically). The whole-directory job in
 * `build.yml` therefore runs fp1-console-defects BEFORE city-case-match, in a step of its own,
 * carrying the same note. Do not reorder them without reading that comment.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";

async function getJson(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { "content-type": "application/json" } });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body };
}

test("case-insensitive city match: /kyoto returns the SAME non-empty feed as /Kyoto", async () => {
  const canonical = await getJson("/api/discover/location/Kyoto?country=Japan");
  assert.equal(canonical.status, 200, "canonical Kyoto should 200");
  const nbCanon = canonical.body?.neighborhoods?.data ?? [];
  const svcCanon = canonical.body?.services?.data ?? [];
  assert.ok(nbCanon.length > 0, "seeded Kyoto must have neighborhoods on the canonical URL");

  const mixed = await getJson("/api/discover/location/kyoto?country=Japan");
  assert.equal(mixed.status, 200, "mis-cased kyoto should also 200");
  const nbMixed = mixed.body?.neighborhoods?.data ?? [];
  const svcMixed = mixed.body?.services?.data ?? [];

  // The regression: mis-cased must NOT be empty, and must match the canonical feed.
  assert.ok(nbMixed.length > 0, "mis-cased city must NOT return an empty feed (the bug)");
  assert.equal(nbMixed.length, nbCanon.length, "mis-cased neighborhoods count must equal canonical");
  assert.equal(svcMixed.length, svcCanon.length, "mis-cased services count must equal canonical");
});

test("301 to canonical: /discover/location/kyoto → /discover/location/Kyoto, query preserved", async () => {
  const res = await fetch(`${BASE_URL}/discover/location/kyoto?country=Japan`, { redirect: "manual" });
  assert.equal(res.status, 301, "a mis-cased city page must 301 to canonical");
  assert.equal(res.headers.get("location"), "/discover/location/Kyoto?country=Japan");
});

test("no redirect for already-canonical casing: /discover/location/Kyoto falls through (not 301)", async () => {
  const res = await fetch(`${BASE_URL}/discover/location/Kyoto`, { redirect: "manual" });
  assert.notEqual(res.status, 301, "canonical casing must not redirect (no loop)");
});

test("no redirect for an unknown city: it is never guessed into an existing one (§13)", async () => {
  const res = await fetch(`${BASE_URL}/discover/location/zzz-not-a-city-xyz`, { redirect: "manual" });
  assert.notEqual(res.status, 301, "an unknown city must fall through to the SPA, not redirect");
});
