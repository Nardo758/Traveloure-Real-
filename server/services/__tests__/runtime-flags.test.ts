/**
 * runtime-flags.test.ts — the /api/health `flags` block (ledger `2026-09-30-health-flags`).
 *
 *   F1  exactly the four named switches, each a boolean; "1" is on and anything else is off
 *   F2  no env VALUE ever leaves: a secret-looking value in any variable is never in the output
 *   F3  the route wires it on every branch (source pin: the ok answer and both 503 answers)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HEALTH_FLAG_NAMES, healthFlags, healthEgress, healthEgressFlags } from "../runtime-flags";

test("F1: the four switches, booleans, '1' is on", () => {
  const f = healthFlags({ PLACE_FACTS_PLACES_ENABLED: "1", AFFILIATE_PAGE_EXTRACT_ENABLED: "true", DMO_INGEST_ENABLED: "0" });
  assert.deepEqual(Object.keys(f), [...HEALTH_FLAG_NAMES]);
  assert.deepEqual(f, { PLACE_FACTS_PLACES_ENABLED: true, AFFILIATE_PAGE_EXTRACT_ENABLED: false, DMO_INGEST_ENABLED: false, E2E_AI_STUB: false });
  for (const v of Object.values(healthFlags({}))) assert.equal(typeof v, "boolean");
});

test("F2: no env value is ever echoed", () => {
  const secret = "sk_live_should_never_appear";
  const out = JSON.stringify(healthFlags({ E2E_AI_STUB: secret, GOOGLE_MAPS_API_KEY: secret, DMO_INGEST_ENABLED: "1" }));
  assert.equal(out.includes(secret), false);
  assert.equal(out.includes("GOOGLE_MAPS_API_KEY"), false, "only the four named switches");
});

test("F3: every /api/health answer carries the flags", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "../../routes/content.routes.ts"), "utf8");
  const start = src.indexOf('router.get("/api/health"');
  const block = src.slice(start, src.indexOf('router.get("/api/status"', start));
  assert.equal((block.match(/\bbuild, flags\b/g) ?? []).length, 3);
});

test("F4: boot egress starts untested and is present on all health branches without another lookup", () => {
  assert.deepEqual(healthEgress, { nominatim: "untested" });
  // Booleans only on the wire: untested ⇒ not checked; blocked ⇒ checked, not reachable; ok ⇒ both.
  assert.deepEqual(healthEgressFlags(), { nominatimChecked: false, nominatimReachable: false });
  assert.deepEqual(healthEgressFlags({ nominatim: "blocked" }), { nominatimChecked: true, nominatimReachable: false });
  assert.deepEqual(healthEgressFlags({ nominatim: "ok" }), { nominatimChecked: true, nominatimReachable: true });
  for (const v of Object.values(healthEgressFlags({ nominatim: "ok" }))) assert.equal(typeof v, "boolean");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "../../routes/content.routes.ts"), "utf8");
  const start = src.indexOf('router.get("/api/health"');
  const block = src.slice(start, src.indexOf('router.get("/api/status"', start));
  assert.equal((block.match(/\bbuild, flags, egress\b/g) ?? []).length, 3);
  assert.ok(block.includes("const egress = healthEgressFlags();"));
  assert.doesNotMatch(block, /fetch\s*\(|resolveVenueFromOsm|seedManualCityEvents/);
  const startup = fs.readFileSync(path.join(here, "../../index.ts"), "utf8");
  assert.equal((startup.match(/healthEgress\.nominatim = eventsResult\.nominatim/g) ?? []).length, 1);
});

test("F5: real seeder reports answers, failures and no-attempt cases without any network or DB calls", async () => {
  const oldUrl = process.env.DATABASE_URL;
  const oldSwitch = process.env.CITY_EVENTS_VENUE_LOOKUP;
  process.env.DATABASE_URL = "postgresql://noconnect@127.0.0.1:1/nodb";
  process.env.CITY_EVENTS_VENUE_LOOKUP = "1";
  const { db, pool } = await import("../../db");
  const { seedCityEvents } = await import("../city-events.service");
  const originalSelect = db.select;
  const originalInsert = db.insert;
  let exists = false;
  // Empty neighbourhoods and an in-memory existence predicate; never connect.
  (db as any).select = () => ({
    from: () => ({
      // An already-seeded row carries the stored venue and its coordinates: a LOCATED row with the
      // entry's own venue is never re-looked up (ledger `2026-10-02-city-events-venue-relookup`).
      where: async () => exists ? [{ id: "existing", venue: "Suzuka Circuit", venueLat: 34.8431 }] : [],
      then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
    }),
  });
  (db as any).insert = () => ({
    values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "new" }] }) }),
  });
  const entry = { source: "manual" as const, sourceId: "health-fixture", title: "Fixture", city: "Kyoto", venue: "Suzuka Circuit", startsAt: "2027-04-09T00:00:00+09:00" };
  let calls = 0;
  const deps = {
    partnerHosts: async () => [],
    sleep: async () => {},
    resolveVenue: async () => { calls++; return null; },
  };
  try {
    assert.equal((await seedCityEvents([], deps)).nominatim, "untested");
    assert.equal((await seedCityEvents([entry], deps)).nominatim, "ok", "a no-match still proves an answer");
    assert.equal(calls, 1, "only the seeder's existing lookup ran");
    exists = true;
    assert.equal((await seedCityEvents([entry], deps)).nominatim, "untested");
    assert.equal(calls, 1, "an existing venue is never looked up again");
    exists = false;
    assert.equal((await seedCityEvents([{ ...entry, venue: "Old Town" }], deps)).nominatim, "untested", "generic venues send no request");
    let failures = 0;
    const mixed = await seedCityEvents([entry, { ...entry, sourceId: "health-fixture-2" }], {
      ...deps,
      resolveVenue: async () => failures++ === 0 ? "unreachable" as const : null,
    });
    assert.equal(mixed.nominatim, "blocked", "a later answer cannot hide a deferred failure");
    assert.equal(mixed.deferred.length, 1);
    process.env.CITY_EVENTS_VENUE_LOOKUP = "0";
    assert.equal((await seedCityEvents([entry], { partnerHosts: deps.partnerHosts, sleep: deps.sleep })).nominatim, "untested");
  } finally {
    db.select = originalSelect;
    db.insert = originalInsert;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    if (oldSwitch === undefined) delete process.env.CITY_EVENTS_VENUE_LOOKUP; else process.env.CITY_EVENTS_VENUE_LOOKUP = oldSwitch;
    await pool.end();
  }
});
