/**
 * runtime-flags.test.ts — the /api/health `flags` block (ledger `2026-09-30-health-flags`).
 *
 *   F1  exactly the named switches, each a boolean; "1" is on and anything else is off
 *   F2  no env VALUE ever leaves: a secret-looking value in any variable is never in the output
 *   F3  the route wires it on every branch (source pin: the ok answer and both 503 answers)
 *   F6  step 9c D6 (ledger `2026-10-07-step9c-leg-options`): `mapsCaps` — each Maps caller's effective
 *       daily cap as a NUMBER, keyed by caller; never an env name, never a non-numeric env value
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HEALTH_FLAG_NAMES, healthFlags, healthEgress, healthEgressFlags, healthMapsCaps } from "../runtime-flags";
import { MAPS_CALLERS, MAPS_CALLER_KEYS } from "@shared/maps-billing";

const MAPS_HEALTH_NAMES = [
  "MAPS_ROUTES_DRIVE_ENABLED",
  "MAPS_ROUTES_MODE_ENABLED",
  "MAPS_ROUTES_TRANSIT_ENABLED",
  "MAPS_ROUTE_MATRIX_ENABLED",
  "MAPS_GEOCODE_ENABLED",
  "MAPS_PLACES_TEXT_SEARCH_ENABLED",
] as const;

test("F1: the named switches, booleans, '1' is on", () => {
  const f = healthFlags({ PLACE_FACTS_PLACES_ENABLED: "1", AFFILIATE_PAGE_EXTRACT_ENABLED: "true", DMO_INGEST_ENABLED: "0", FLIGHT_LOOKUP_ENABLED: "1" });
  assert.deepEqual(Object.keys(f), [...HEALTH_FLAG_NAMES]);
  assert.deepEqual(f, {
    PLACE_FACTS_PLACES_ENABLED: true,
    AFFILIATE_PAGE_EXTRACT_ENABLED: false,
    DMO_INGEST_ENABLED: false,
    E2E_AI_STUB: false,
    FLIGHT_LOOKUP_ENABLED: true,
    EXPERT_SCRAPE_JOBS_ENABLED: false,
    MAPS_ROUTES_DRIVE_ENABLED: false,
    MAPS_ROUTES_MODE_ENABLED: false,
    MAPS_ROUTES_TRANSIT_ENABLED: false,
    MAPS_ROUTE_MATRIX_ENABLED: false,
    MAPS_GEOCODE_ENABLED: false,
    MAPS_PLACES_TEXT_SEARCH_ENABLED: false,
    SHOW_DEMO_EXPERTS: false,
  });
  for (const v of Object.values(healthFlags({}))) assert.equal(typeof v, "boolean");
});

test("F2: no env value is ever echoed", () => {
  const secret = "sk_live_should_never_appear";
  const out = JSON.stringify(healthFlags({
    E2E_AI_STUB: secret,
    GOOGLE_MAPS_API_KEY: secret,
    GOOGLE_MAPS_BROWSER_KEY: secret,
    FLIGHT_LOOKUP_API_KEY: secret,
    DMO_INGEST_ENABLED: "1",
    MAPS_ROUTES_DRIVE_ENABLED: secret,
    MAPS_ROUTES_DRIVE_DAILY_CAP: secret,
    MAPS_ROUTES_DRIVE_USD_PER_1000: secret,
  }));
  assert.equal(out.includes(secret), false);
  assert.equal(out.includes("GOOGLE_MAPS_API_KEY"), false, "only the named switches");
  assert.equal(out.includes("FLIGHT_LOOKUP_API_KEY"), false, "the flight switch is reported, never its key");
  assert.equal(out.includes("GOOGLE_MAPS_BROWSER_KEY"), false, "never report the browser credential");
  assert.equal(out.includes("MAPS_ROUTES_DRIVE_DAILY_CAP"), false, "caps are not health switches");
  // Step 9c D6 (sanctioned amendment, architect Oct 7, 2026): the cap VALUE is reported — as a number
  // under `mapsCaps`, keyed by caller — while its env NAME and any non-numeric env value never are.
  const caps = healthMapsCaps({ MAPS_ROUTES_DRIVE_DAILY_CAP: "750", MAPS_ROUTES_MODE_DAILY_CAP: secret });
  const capsOut = JSON.stringify(caps);
  assert.equal(caps.routes_drive, 750);
  assert.equal(caps.routes_mode, MAPS_CALLERS.routes_mode.defaultDailyCap, "a non-numeric cap falls back to the default");
  assert.equal(capsOut.includes(secret), false);
  assert.equal(capsOut.includes("MAPS_ROUTES_DRIVE_DAILY_CAP"), false, "never the env name");
  assert.equal(out.includes("MAPS_ROUTES_DRIVE_USD_PER_1000"), false, "prices are not health switches");
});

test("Maps: all six switches use strict '1' semantics independently", () => {
  for (const name of MAPS_HEALTH_NAMES) {
    for (const value of [undefined, "", "0", "false", "true", "01", " 1 ", "1"]) {
      const flags = healthFlags({ [name]: value });
      assert.equal(flags[name], value === "1", `${name} must only enable for the exact string '1'`);
      for (const other of MAPS_HEALTH_NAMES) {
        if (other !== name) assert.equal(flags[other], false, `${name} must not enable ${other}`);
      }
    }
  }
});

test("Maps: all switches can be enabled while expert scrape remains off", () => {
  const flags = healthFlags(Object.fromEntries(MAPS_HEALTH_NAMES.map((name) => [name, "1"])));
  for (const name of MAPS_HEALTH_NAMES) assert.equal(flags[name], true);
  assert.equal(flags.EXPERT_SCRAPE_JOBS_ENABLED, false);
  assert.equal(flags.PLACE_FACTS_PLACES_ENABLED, false, "Maps switches do not enable the separate facts switch");
  assert.equal(Object.values(flags).every((value) => typeof value === "boolean"), true);
});

test("Maps: the reported switches are exactly the Maps billing table's own switches", () => {
  // The health list is written by hand; this pins it to `MAPS_CALLERS` (R299) so a switch renamed or
  // added there cannot silently go unreported. The two Places calls share PLACE_FACTS_PLACES_ENABLED,
  // which health already reports under its own name.
  const tableSwitches = [...new Set(MAPS_CALLER_KEYS.map((k) => MAPS_CALLERS[k].enabledEnv))]
    .filter((name) => name !== "PLACE_FACTS_PLACES_ENABLED")
    .sort();
  assert.deepEqual([...MAPS_HEALTH_NAMES].sort(), tableSwitches);
  for (const name of tableSwitches) assert.ok((HEALTH_FLAG_NAMES as readonly string[]).includes(name), `${name} is reported`);
  assert.ok((HEALTH_FLAG_NAMES as readonly string[]).includes("PLACE_FACTS_PLACES_ENABLED"));
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

test("F6: mapsCaps is every caller's effective cap as an integer, beside the flags on every branch", () => {
  const caps = healthMapsCaps({});
  assert.deepEqual(Object.keys(caps).sort(), [...MAPS_CALLER_KEYS].sort());
  for (const k of MAPS_CALLER_KEYS) {
    assert.equal(caps[k], Math.floor(MAPS_CALLERS[k].defaultDailyCap), `${k} reads its code default when unset`);
    assert.ok(Number.isInteger(caps[k]));
  }
  assert.equal(healthMapsCaps({ MAPS_ROUTES_TRANSIT_DAILY_CAP: "0" }).routes_transit, 0, "0 = none, reported as 0");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "../../routes/content.routes.ts"), "utf8");
  const start = src.indexOf('router.get("/api/health"');
  const block = src.slice(start, src.indexOf('router.get("/api/status"', start));
  assert.equal((block.match(/\bbuild, flags, egress, mapsCaps\b/g) ?? []).length, 3);
  assert.ok(block.includes("const mapsCaps = healthMapsCaps();"));
});
