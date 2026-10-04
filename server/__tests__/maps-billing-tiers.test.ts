/**
 * R299 — the Maps billing audit's price test (ledger `2026-10-04-maps-billing-audit`). Pure: no
 * database, no network. Pins, per Google Maps Platform caller, the SKU tier it bills under and the
 * request shape that puts it there, and proves the gate's rule (switch, key, daily cap, recorded cost).
 *
 *   M1  the caller table: every key has a tier, distinct env names, a cap and a cost
 *   M2  the gate refuses — switch off, no key, cap 0, cap reached, counter unreadable — and makes no call
 *   M3  the gate under its cap calls once and records the call (units, sku), success or failure
 *   M4  the recorded cost is the row's unit price × units, in tenths of a cent
 *   M5  Routes: the drive body is Essentials (TRAFFIC_UNAWARE, no departure); the mode body has no preference
 *   M6  Places: Details is Enterprise (Atmosphere for dining) with photos inside it; the ID lookup asks places.id only
 *   M7  the workspace Text Search mask is exactly the eight fields — no photos — and its rows carry no photo URL
 *   M8  the source: no legacy Place Photo / legacy Text Search URL and no TRAFFIC_AWARE request anywhere
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MAPS_CALLERS, MAPS_CALLER_KEYS, WORKSPACE_TEXT_SEARCH_FIELDS, type MapsCallerKey } from "@shared/maps-billing";
import { mapsGate, withMapsGate, type MapsCallRecord, type MapsGateDeps } from "../services/maps-billing/maps-billing.core";
import { mapsCallerCostTenthsOfCent, mapsCallerDailyCap, mapsCallerEnabled } from "../config/maps-billing.config";
import { DRIVE_FIELD_MASK, MODE_FIELD_MASK, drivingRouteBody, modeRouteBody } from "../services/maps-billing/maps-requests";
import { PlacesAdapter, placesFieldMask } from "../services/content-facts/places-adapter";
import { workspaceResultFrom, workspaceSearchBody } from "../services/maps-billing/places-text-search";

const EXPECTED_TIERS: Record<MapsCallerKey, string> = {
  routes_drive: "compute_routes_essentials",
  routes_mode: "compute_routes_essentials",
  routes_transit: "compute_routes_essentials",
  route_matrix: "compute_route_matrix_pro",
  geocode: "geocoding_essentials",
  places_id_lookup: "text_search_ids_only",
  places_details: "place_details_enterprise",
  places_text_search: "text_search_enterprise",
};

function deps(over: Partial<MapsGateDeps> & { used?: number | null } = {}): MapsGateDeps & { records: MapsCallRecord[] } {
  const records: MapsCallRecord[] = [];
  return {
    enabled: () => true,
    apiKey: () => "k",
    dailyCap: () => 10,
    countToday: async () => (over.used === undefined ? 0 : over.used),
    record: async (r) => {
      records.push(r);
    },
    ...over,
    records,
  } as any;
}

test("M1: every Maps caller names its tier, its own switch, cap and cost", () => {
  assert.deepEqual([...MAPS_CALLER_KEYS].sort(), Object.keys(EXPECTED_TIERS).sort());
  for (const key of MAPS_CALLER_KEYS) {
    const c = MAPS_CALLERS[key];
    assert.equal(c.key, key);
    assert.equal(c.sku, EXPECTED_TIERS[key], `${key} tier`);
    assert.ok(c.why.length > 20, `${key} says why`);
    assert.ok(c.defaultDailyCap > 0, `${key} has a cap`);
    assert.ok(c.defaultCost >= 0, `${key} has a recorded cost`);
  }
  const caps = MAPS_CALLER_KEYS.map((k) => MAPS_CALLERS[k].dailyCapEnv);
  assert.equal(new Set(caps).size, caps.length, "one cap per caller");
  // The two Places calls share the spine's switch; every other caller has its own.
  const switches = MAPS_CALLER_KEYS.filter((k) => !k.startsWith("places_id") && !k.startsWith("places_details")).map((k) => MAPS_CALLERS[k].enabledEnv);
  assert.equal(new Set(switches).size, switches.length);
});

test("M2: the gate refuses before any call — off, no key, cap 0, cap reached, unreadable counter", async () => {
  const cases: Array<[Partial<MapsGateDeps> & { used?: number | null }, string]> = [
    [{ enabled: () => false }, "disabled"],
    [{ apiKey: () => null }, "no_api_key"],
    [{ dailyCap: () => 0 }, "cap_reached"],
    [{ used: 10 }, "cap_reached"],
    [{ used: null }, "cap_reached"],
  ];
  for (const [over, reason] of cases) {
    const d = deps(over);
    let called = 0;
    const out = await withMapsGate("geocode", d, async () => {
      called++;
      return { value: 1 };
    });
    assert.deepEqual(out, { refused: reason });
    assert.equal(called, 0);
    assert.equal(d.records.length, 0, "a refused call records nothing");
  }
  // Off by default: no switch is set in this process.
  for (const key of MAPS_CALLER_KEYS) {
    if (MAPS_CALLERS[key].enabledEnv === "PLACE_FACTS_PLACES_ENABLED") continue;
    delete process.env[MAPS_CALLERS[key].enabledEnv];
    assert.equal(mapsCallerEnabled(key), false, `${key} is off unless switched on`);
  }
});

test("M3: under the cap the call runs once and is recorded, success or failure", async () => {
  const d = deps({ used: 9 });
  assert.deepEqual(await mapsGate("routes_drive", d), { ok: true, apiKey: "k" });
  const out = await withMapsGate("route_matrix", d, async (key) => ({ value: key, units: 100 }), { sku: "compute_route_matrix_essentials" });
  assert.deepEqual(out, { value: "k" });
  assert.equal(d.records.length, 1);
  assert.equal(d.records[0].units, 100);
  assert.equal(d.records[0].sku, "compute_route_matrix_essentials");
  assert.equal(d.records[0].success, true);
  await assert.rejects(
    withMapsGate("geocode", d, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(d.records[1].success, false);
  assert.equal(d.records[1].sku, "geocoding_essentials");
});

test("M4: the recorded cost — unit price × units, in tenths of a cent; caps and prices are env-overridable", () => {
  assert.equal(mapsCallerCostTenthsOfCent("routes_drive", 1), 5); // $5 / 1,000 = 0.5¢
  assert.equal(mapsCallerCostTenthsOfCent("route_matrix", 100), 1000); // $10 / 1,000 × 100 = $1
  assert.equal(mapsCallerCostTenthsOfCent("places_details", 1), 20); // 2¢ per call
  assert.equal(mapsCallerCostTenthsOfCent("places_text_search", 1), 35);
  process.env.MAPS_GEOCODE_DAILY_CAP = "7";
  process.env.MAPS_GEOCODE_USD_PER_1000 = "4";
  try {
    assert.equal(mapsCallerDailyCap("geocode"), 7);
    assert.equal(mapsCallerCostTenthsOfCent("geocode", 10), 40);
  } finally {
    delete process.env.MAPS_GEOCODE_DAILY_CAP;
    delete process.env.MAPS_GEOCODE_USD_PER_1000;
  }
});

test("M5: Routes — the drive is Essentials (TRAFFIC_UNAWARE, no departure); a mode carries no preference", () => {
  const drive = drivingRouteBody({ origin: { lat: 35, lng: 135 }, destination: { lat: 35.1, lng: 135.1 } }) as Record<string, unknown>;
  assert.equal(drive.travelMode, "DRIVE");
  assert.equal(drive.routingPreference, "TRAFFIC_UNAWARE");
  assert.equal("departureTime" in drive, false);
  assert.equal("intermediates" in drive, false);
  assert.equal("routeModifiers" in drive, false);
  assert.equal("extraComputations" in drive, false);
  assert.equal(DRIVE_FIELD_MASK.includes("travelAdvisory"), false, "no toll/traffic advisory fields (Enterprise)");
  for (const mode of ["WALK", "BICYCLE", "TRANSIT"] as const) {
    const b = modeRouteBody({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, mode) as Record<string, unknown>;
    assert.equal("routingPreference" in b, false);
    assert.equal(b.travelMode, mode);
  }
  assert.equal(MODE_FIELD_MASK, "routes.duration,routes.distanceMeters");
});

test("M6: Places — Details is Enterprise (+Atmosphere for dining) with photos inside it; the ID lookup asks places.id only", async () => {
  const hours = placesFieldMask("stop.hours");
  assert.equal(hours.sku, "details_enterprise");
  assert.ok(hours.fields.includes("regularOpeningHours.weekdayDescriptions"), "hours lift it to Enterprise");
  assert.ok(hours.fields.includes("photos"), "photos are an Essentials field — the tier is unchanged");
  assert.equal(hours.fields.some((f) => /rating|priceLevel|reviews|editorialSummary/.test(f)), false, "nothing beyond Enterprise");
  const dining = placesFieldMask("dining");
  assert.equal(dining.sku, "details_enterprise_atmosphere");
  assert.deepEqual(dining.fields.filter((f) => !hours.fields.includes(f)), ["reservable"]);

  const masks: string[] = [];
  const a = new PlacesAdapter(
    async (_url, init) => {
      masks.push(init.headers["X-Goog-FieldMask"]);
      return { ok: true, status: 200, json: async () => ({ places: [{ id: "ChIJ-x" }] }) };
    },
    () => "k",
    () => true,
  );
  assert.equal(await a.resolvePlaceId({ need: "stop.hours", market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto" }, budgetCents: 0 }), "ChIJ-x");
  assert.deepEqual(masks, ["places.id"]);
});

test("M7: the workspace Text Search — eight fields, no photos, no photo URL on any row", () => {
  assert.deepEqual([...WORKSPACE_TEXT_SEARCH_FIELDS], [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.types",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
  ]);
  assert.equal(WORKSPACE_TEXT_SEARCH_FIELDS.some((f) => f.includes("photo")), false);
  assert.deepEqual(workspaceSearchBody("ramen in Kyoto", "restaurant"), { textQuery: "ramen in Kyoto", maxResultCount: 15, languageCode: "en", includedType: "restaurant" });
  assert.equal("includedType" in workspaceSearchBody("x", null), false);
  const row = workspaceResultFrom({
    id: "ChIJ-r",
    displayName: { text: "Ramen Sen" },
    formattedAddress: "1 Street, Kyoto",
    location: { latitude: 35, longitude: 135.7 },
    types: ["restaurant"],
    rating: 4.4,
    userRatingCount: 120,
    priceLevel: "PRICE_LEVEL_MODERATE",
  })!;
  assert.equal(row.photoUrl, null);
  assert.equal(row.priceLabel, "$$");
  assert.equal(row.category, "dining");
  assert.deepEqual(row.location, { lat: 35, lng: 135.7 });
  const bare = workspaceResultFrom({ id: "ChIJ-b" })!;
  assert.equal(bare.rating, null);
  assert.equal(bare.priceLabel, null);
  assert.equal(bare.location, null);
  assert.equal(workspaceResultFrom({}), null);
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("M8: no legacy Place Photo or legacy Text Search URL, and no TRAFFIC_AWARE request, anywhere in the app", () => {
  const files = [...sourceFiles("server"), ...sourceFiles("client/src"), ...sourceFiles("shared")];
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // Only live code is an offender; a commented-out stub may still name a URL.
    const live = src.split("\n").filter((l) => /maps\/api\/place\/(photo|textsearch)/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    if (live.length) offenders.push(f);
    if (/routingPreference:\s*["'`]TRAFFIC_AWARE/.test(src)) offenders.push(`${f} (TRAFFIC_AWARE)`);
  }
  assert.deepEqual(offenders, []);
});
