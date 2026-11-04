/**
 * Lane 1 — the guest save rail, client half (ledger `2026-11-05-lane1-guest-save-rail`).
 *
 *   L1  A-2: the first save's city is the route's, then the page's, then the item's; none ⇒ null. The browse routes'
 *       city is read from the path.
 *   L2  A-18: the confirmed save says "Saved to plan", or the approved not-on-the-map hint when the place has no point.
 *   L3  A-19: a door's pending add is replayed with its kind and source id intact.
 *   L4  A-37: one claim request per sign-in — a second call for the same account answers the first without a request.
 *   L5  A-18: migration 437 and the seed list name the same four gems, points and sources; no Google point.
 *   L6  A-33: a city-page gem or event with a point never reads "not on the map".
 *
 * Run: npx tsx --test client/src/lib/__tests__/lane1-guest-save.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import { cityFromPath, guestBodyForPendingAdd, guestSavedMessage, resolveSaveCity } from "../waitlist-guest-plan";
import { cityContentPlaces } from "../browse-supply";
import { gemCategory } from "../feed-stream";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Lane 1 guest save rail (client)", () => {
  it("L1 resolves the first save's city in order", () => {
    assert.equal(resolveSaveCity("Kyoto", "Osaka", "Tokyo"), "Kyoto");
    assert.equal(resolveSaveCity(null, "Kyoto", "Tokyo"), "Kyoto");
    assert.equal(resolveSaveCity(null, "  ", "Kyoto"), "Kyoto");
    assert.equal(resolveSaveCity(null, null, null), null);
    assert.equal(cityFromPath("/discover/location/Kyoto"), "Kyoto");
    assert.equal(cityFromPath("/discover/location/Kyoto%2C%20Japan?tab=1"), "Kyoto, Japan");
    assert.equal(cityFromPath("/places/kyoto"), "kyoto");
    assert.equal(cityFromPath("/plans/new"), null);
    assert.equal(cityFromPath(""), null);
  });

  it("L2 says the hint for an unlocated save", () => {
    assert.equal(guestSavedMessage({ located: true }), "Saved to plan");
    assert.equal(guestSavedMessage({ located: false }), "Saved to your plan. We don't have this spot on the map yet.");
    assert.equal(GUEST_PLAN_COPY.savedNotOnMap, "Saved to your plan. We don't have this spot on the map yet.");
  });

  it("L3 replays a pending add whole", () => {
    assert.deepEqual(guestBodyForPendingAdd({ kind: "listing", id: "s1", title: "Tea", dayNumber: 1 }), { kind: "listing", sourceId: "s1", title: "Tea", dayNumber: 1 });
    assert.deepEqual(guestBodyForPendingAdd({ kind: "partner", id: "p1", title: "Cafe" }), { kind: "partner_product", sourceId: "p1", title: "Cafe", dayNumber: 1 });
    assert.equal(guestBodyForPendingAdd(null), null);
    const page = read("client/src/pages/guest-plan-map.tsx");
    assert.doesNotMatch(page, /saveToGuestPlan\(\{ title: record\.pendingAdd\.title/, "the title-only replay is gone");
  });

  it("L4 claims once per sign-in", async () => {
    const store = new Map<string, string>();
    (globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    (globalThis as any).localStorage = { getItem: () => "11111111-2222-3333-4444-555555555555", setItem: () => {}, removeItem: () => {} };
    let calls = 0;
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ tripIds: ["t1"] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const mod = await import("../waitlist-guest-plan");
      mod._resetGuestClaimMemo();
      const [a, b] = await Promise.all([mod.claimGuestPlans("u1"), mod.claimGuestPlans("u1")]);
      const c = await mod.claimGuestPlans("u1");
      assert.deepEqual(a, ["t1"]);
      assert.deepEqual(b, ["t1"]);
      assert.deepEqual(c, ["t1"]);
      assert.equal(calls, 1, "one request for the sign-in");
      mod._resetGuestClaimMemo();
      assert.deepEqual(await mod.claimGuestPlans("u1"), [], "a reload in the same tab does not claim again");
      assert.equal(calls, 1);
    } finally {
      (globalThis as any).fetch = realFetch;
    }
  });

  it("L5 migration 437 and the seed list agree", () => {
    const migration = read("server/migrations/437_kyoto_gem_coordinates.sql");
    const seed = read("server/seeds/kyoto-gem-coordinates.seed.ts");
    const rows = [...seed.matchAll(/\{ placeName: "([^"]+)", latitude: "([^"]+)", longitude: "([^"]+)", sourceUrl: "([^"]+)", osm: (true|false) \}/g)];
    assert.equal(rows.length, 4);
    for (const [, name, lat, lng, url] of rows) {
      assert.match(migration, new RegExp(`-- ${name} — source: ${url.replace(/[.?/]/g, "\\$&")} — © OpenStreetMap contributors, ODbL 1\\.0`));
      assert.match(migration, new RegExp(`SET latitude = ${lat.replace(".", "\\.")}, longitude = ${lng.replace(".", "\\.")}\\s+WHERE city ILIKE 'kyoto' AND place_name = '${name}' AND latitude IS NULL AND longitude IS NULL;`));
      assert.match(url, /^https:\/\/www\.openstreetmap\.org\//);
    }
    assert.doesNotMatch(migration + seed, /googleapis|maps\.google|google\.com\/maps|goo\.gl/i, "no Google source URL");
  });

  it("L6 a located gem or event is not 'not on the map'", () => {
    const places = cityContentPlaces(
      {
        gems: { data: [{ id: "g1", placeName: "Bamboo Grove", placeType: "nature", located: true }, { id: "g2", placeName: "Alley", placeType: "street", located: false }] },
        events: { data: { events: [{ id: "e1", title: "Show", description: "Our words.", located: true }] } },
      },
      gemCategory,
    );
    assert.deepEqual(places.map((p) => [p.id, p.located]), [["g1", true], ["g2", false], ["e1", true]]);
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    assert.match(mcc, /\{b\.lat == null && b\.located !== true \? <span[^>]*>not on the map<\/span> : null\}/);
  });
});
