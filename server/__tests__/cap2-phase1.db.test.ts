/**
 * CAP-2 Phase 1 (ledger `2026-11-05-cap2-plan-item-ref`): the PlanItemRef contract and its ONE resolver.
 *
 *   C1  one save per kind on the guest rail (gem, event, city_event, listing, affiliate_product, hotel, activity): each
 *       row carries the SERVER's identity (the column each kind uses) and the row's own point.
 *   C2  a forged latitude/longitude/title on the envelope is ignored — the stored point and name are the row's.
 *   C3  each reason code: unknown_kind, unknown_source, source_withdrawn, city_mismatch, unplaceable.
 *   C4  placement: a city event lands on its own day with its known start time; a chosen day is honored; a property
 *       listing saves unlocated (its public point is blurred).
 *   C5  the resolver itself, as the signed-in rail calls it (`resolvePlanItemRef`), answers the same rows and reasons.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cap2-phase1.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, trips } from "@shared/schema";
import guestPlansRoutes from "../routes/guest-plans.routes";
import { setFeverEventLookupForTests, resolvePlanItemRef, isCityMismatch } from "../services/guest-item-source.service";
import { parsePlanItemRef, planItemRefFromFeedItem } from "@shared/plan-item-ref";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const R = `cap2-${crypto.randomUUID().slice(0, 6)}`;
const ID = {
  user: `${R}-user`,
  gem: `${R}-gem`, gemHidden: `${R}-gem-hidden`, gemPorto: `${R}-gem-porto`, gemNoName: `${R}-gem-noname`,
  event: `${R}-event`,
  cityEvent: `${R}-ce`, cityEventWithdrawn: `${R}-ce-w`,
  listing: `${R}-listing`, listingPaused: `${R}-listing-paused`, listingProperty: `${R}-listing-prop`,
  partner: `${R}-partner`, affiliate: `${R}-aff`, affiliateInactive: `${R}-aff-off`,
  hotel: `${R}-hotel`, activity: `${R}-activity`,
};
const tripIds = new Set<string>();
let priorMode: string | null = null;

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = ((r as any).rows?.[0]?.setting_value as string | undefined) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', 'waitlist')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'waitlist'`);
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ID.user}, ${`${R}@traveloure-qa.test`}, 'user')`);
  await db.execute(sql`INSERT INTO travel_pulse_hidden_gems (id, city, place_name, latitude, longitude, hidden_at) VALUES
    (${ID.gem}, 'Kyoto', 'CAP-2 garden', 35.0116, 135.7681, NULL),
    (${ID.gemHidden}, 'Kyoto', 'CAP-2 hidden', 35.01, 135.76, NOW()),
    (${ID.gemPorto}, 'Porto', 'CAP-2 Porto gem', 41.15, -8.61, NULL),
    (${ID.gemNoName}, 'Kyoto', '   ', 35.01, 135.76, NULL)`);
  await db.execute(sql`INSERT INTO fever_event_cache (id, event_id, title, category, city, city_code, country, booking_url, expires_at, latitude, longitude, start_date)
    VALUES (${`${R}-fec`}, ${ID.event}, 'CAP-2 concert', 'music', 'Kyoto', 'KYO', 'Japan', 'https://example.invalid/e', NOW() + interval '1 day', 35.02, 135.77, '2026-12-11T09:00:00Z')`);
  // 2026-12-10 18:30 in Kyoto (09:30 UTC), time known.
  await db.execute(sql`INSERT INTO city_events (id, source, source_id, title, city, venue, venue_lat, venue_lng, starts_at, nights, start_time_known, withdrawn_at) VALUES
    (${`${R}-ce-row`}, 'manual', ${ID.cityEvent}, 'CAP-2 night temple', 'Kyoto', 'Kodai-ji', 35.0006, 135.7810, '2026-12-10T09:30:00Z', 1, true, NULL),
    (${`${R}-ce-w-row`}, 'manual', ${ID.cityEventWithdrawn}, 'CAP-2 withdrawn', 'Kyoto', 'To-ji', 34.98, 135.74, '2026-12-10T09:30:00Z', 1, true, NOW())`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, city, latitude, longitude, status, approval_status, product_shape) VALUES
    (${ID.listing}, ${ID.user}, 'CAP-2 tea class', 'Kyoto', 35.005, 135.765, 'active', 'approved', NULL),
    (${ID.listingPaused}, ${ID.user}, 'CAP-2 paused', 'Kyoto', 35.005, 135.765, 'paused', 'approved', NULL),
    (${ID.listingProperty}, ${ID.user}, 'CAP-2 machiya', 'Kyoto', 35.006, 135.766, 'active', 'approved', 'property')`);
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category) VALUES (${ID.partner}, 'CAP-2 partner', 'https://partner.invalid', 'activity')`);
  await db.execute(sql`INSERT INTO affiliate_products (id, partner_id, name, product_url, city, coordinates, is_active) VALUES
    (${ID.affiliate}, ${ID.partner}, 'CAP-2 bike tour', 'https://partner.invalid/p', 'Kyoto', '{"lat":35.01,"lng":135.75}'::jsonb, true),
    (${ID.affiliateInactive}, ${ID.partner}, 'CAP-2 gone', 'https://partner.invalid/q', 'Kyoto', '{"lat":35.01,"lng":135.75}'::jsonb, false)`);
  await db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, city, name, latitude, longitude, expires_at)
    VALUES (${ID.hotel}, ${ID.hotel}, 'KYO', 'Kyoto', 'CAP-2 inn', 35.003, 135.775, NOW() + interval '1 day')`);
  await db.execute(sql`INSERT INTO activity_cache (id, product_code, destination, city, title, latitude, longitude, expires_at)
    VALUES (${ID.activity}, ${ID.activity}, 'Kyoto', 'Kyoto', 'CAP-2 kimono walk', 35.004, 135.776, NOW() + interval '1 day')`);
  setFeverEventLookupForTests(async () => null);
});

after(async () => {
  setFeverEventLookupForTests(null);
  const t = Array.from(tripIds);
  if (t.length) await db.delete(trips).where(inArray(trips.id, t));
  await db.execute(sql`DELETE FROM travel_pulse_hidden_gems WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM fever_event_cache WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM city_events WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM affiliate_products WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM affiliate_partners WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM activity_cache WHERE id LIKE ${R + "%"}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ID.user}`);
  if (priorMode === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMode} WHERE setting_key = 'traveler_signup_mode'`);
});

/** A browser: keeps the guest cookie between calls. */
function guest() {
  let cookie = "";
  return async (method: "GET" | "POST" | "PATCH", path: string, body?: unknown) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => false;
      next();
    });
    app.use(guestPlansRoutes);
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const json = await res.json().catch(() => undefined);
      if ((json as any)?.plan?.id) tripIds.add((json as any).plan.id);
      return { status: res.status, json: json as any, timing: res.headers.get("server-timing") };
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  };
}


const ref = (kind: string, source_id: string, extra: Record<string, unknown> = {}) => ({ kind, source_id, city: "Kyoto", ...extra });
const KYOTO = new Set(["kyoto"]);

async function item(id: string) {
  const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, id));
  return row;
}

describe("CAP-2 Phase 1 — PlanItemRef and its resolver", () => {
  it("C1/C2 one save per kind: server identity and the row's point; a forged point and title are ignored", async () => {
    const call = guest();
    await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan", startDate: "2026-12-10", endDate: "2026-12-12" });
    const forged = { latitude: "1.000", longitude: "2.000", title: "Forged name", lat: 1, lng: 2 };
    const cases: Array<[string, string, Record<string, unknown>]> = [
      ["gem", ID.gem, { contentType: "gem", contentId: ID.gem, latitude: "35.0116000" }],
      ["event", ID.event, { contentType: "event", contentId: ID.event, latitude: "35.0200000" }],
      ["city_event", ID.cityEvent, { contentType: "city_event", contentId: ID.cityEvent, latitude: "35.0006000" }],
      ["listing", ID.listing, { providerServiceId: ID.listing, contentId: null, latitude: "35.0050000" }],
      ["affiliate_product", ID.affiliate, { affiliateProductId: ID.affiliate, contentId: null, latitude: "35.0100000" }],
      ["hotel", ID.hotel, { contentType: "hotel", contentId: ID.hotel, latitude: "35.0030000", itemType: "accommodation" }],
      ["activity", ID.activity, { contentType: "activity", contentId: ID.activity, latitude: "35.0040000" }],
    ];
    for (const [kind, id, want] of cases) {
      const res = await call("POST", "/api/guest-plans/current/items", { ...ref(kind, id), ...forged });
      assert.equal(res.status, 200, `${kind}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.located, true, `${kind} is located`);
      const row = await item(res.json.id);
      for (const [k, v] of Object.entries(want)) assert.equal(String((row as any)[k]), String(v), `${kind}.${k}`);
      assert.notEqual(row.title, "Forged name", `${kind}: the name is the row's`);
      assert.notEqual(String(row.latitude), "1.0000000", `${kind}: the forged point is not stored`);
    }
  });

  it("C3 each reason code is exercised on the guest rail", async () => {
    const call = guest();
    await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan", startDate: "2026-12-10", endDate: "2026-12-11" });
    const codes: Array<[unknown, string]> = [
      [ref("reservation_preset", "x"), "unknown_kind"],
      [ref("gem", `${R}-nowhere`), "unknown_source"],
      [ref("event", `${R}-nowhere`), "unknown_source"],
      [ref("gem", ID.gemHidden), "source_withdrawn"],
      [ref("listing", ID.listingPaused), "source_withdrawn"],
      [ref("affiliate_product", ID.affiliateInactive), "source_withdrawn"],
      [ref("city_event", ID.cityEventWithdrawn), "source_withdrawn"],
      [ref("gem", ID.gemPorto), "city_mismatch"],
      [{ ...ref("gem", ID.gem), city: "Porto" }, "city_mismatch"],
      [ref("gem", ID.gemNoName), "unplaceable"],
      [{ kind: "gem", city: "Kyoto" }, "unplaceable"],
      [ref("gem", ID.gem, { placement: { day_number: 9 } }), "unplaceable"],
    ];
    for (const [body, code] of codes) {
      const res = await call("POST", "/api/guest-plans/current/items", body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} → ${res.status}`);
      assert.equal(res.json.code, code, JSON.stringify(body));
    }
    const view = await call("GET", "/api/guest-plans/current");
    assert.equal(view.json.items.length, 0, "no refused save left a row");
  });

  it("C4 placement: a city event on its own day and time; a chosen day; a property saves unlocated", async () => {
    const call = guest();
    await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan", startDate: "2026-12-09", endDate: "2026-12-12" });
    const ce = await call("POST", "/api/guest-plans/current/items", ref("city_event", ID.cityEvent, { placement: { day_number: 1 } }));
    const ceRow = await item(ce.json.id);
    assert.equal(String(ceRow.scheduledDate).slice(0, 10), "2026-12-10");
    assert.equal(ceRow.dayNumber, 2, "the event's day wins over the card's");
    assert.equal(ceRow.startTime, "18:30", "a known start lands as the item's time (Kyoto wall clock)");
    const chosen = await call("POST", "/api/guest-plans/current/items", ref("gem", ID.gem, { placement: { day_number: 3 } }));
    assert.equal((await item(chosen.json.id)).dayNumber, 3);
    const none = await call("POST", "/api/guest-plans/current/items", ref("hotel", ID.hotel));
    const noneRow = await item(none.json.id);
    assert.equal(noneRow.dayNumber, 1);
    assert.equal(noneRow.startTime, null, "no slot ⇒ Day 1 with no time");
    const prop = await call("POST", "/api/guest-plans/current/items", ref("listing", ID.listingProperty));
    assert.equal(prop.status, 200);
    assert.equal(prop.json.located, false);
    assert.equal((await item(prop.json.id)).latitude, null);
  });

  it("C5 the resolver the signed-in rail calls: same rows, same reasons; the pure helpers", async () => {
    const ok = await resolvePlanItemRef(ref("listing", ID.listing) as any, { markets: KYOTO, planDays: 3 });
    assert.ok(ok.ok && ok.source.providerServiceId === ID.listing && ok.source.latitude === "35.0050000");
    const miss = await resolvePlanItemRef(ref("gem", ID.gemPorto) as any, { markets: KYOTO });
    assert.deepEqual(miss, { ok: false, reason: "city_mismatch" });
    // A plan in no operating market, or a city in none, is no mismatch.
    assert.equal(isCityMismatch("Porto", new Set()), false);
    assert.equal(isCityMismatch("Paris", KYOTO), false);
    assert.deepEqual(parsePlanItemRef({ kind: "viator", source_id: "x", city: "Kyoto" }), { ok: false, reason: "unknown_kind" });
    const parsed = parsePlanItemRef({ ...ref("gem", ID.gem), latitude: 1 });
    assert.ok(parsed.ok && !("latitude" in parsed.ref), "a forged key is stripped from the envelope");
    assert.deepEqual(planItemRefFromFeedItem({ type: "service", sourceContentId: "s1" }, "Kyoto", 2), { kind: "listing", source_id: "s1", city: "Kyoto", placement: { day_number: 2 } });
    assert.deepEqual(planItemRefFromFeedItem({ type: "hotel", sourceContentId: "h1" }, "Kyoto"), { kind: "hotel", source_id: "h1", city: "Kyoto" });
    assert.equal(planItemRefFromFeedItem({ type: "recommendation" }, "Kyoto"), null);
    assert.equal(planItemRefFromFeedItem({ type: "activity", viatorProductCode: "V1" }, "Kyoto"), null, "Viator is not a kind");
  });
});
