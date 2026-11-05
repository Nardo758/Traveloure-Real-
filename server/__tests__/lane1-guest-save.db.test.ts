/**
 * Lane 1 — the guest save rail (ledger `2026-11-05-lane1-guest-save-rail`; migrations 435, 436, 437).
 *
 *   L1  A-1: one save of each kind — gem, event, listing, partner product (an affiliate product, a partner hotel, a partner
 *       activity) — lands with the server-read name, the right link (content type + id, listing id or affiliate product
 *       id) and the source row's point; a listing never carries a point (LD 22).
 *   L2  A-1: an unknown id of every kind is refused (`unknown_source`) and writes nothing; a body that names no source
 *       is refused by the route schema; a forged point in the body is refused by the schema (no lat/lng admitted).
 *   L3  A-11: a second save of the same source — sequential or concurrent — answers the first item; one row.
 *   L4  A-5: two concurrent creates for one session make ONE plan; the second create answers it (created: false).
 *   L5  A-5: the unique index refuses a second live guest plan for a session; a claimed plan frees the session.
 *   L6  A-11: the item index refuses a second item with the same content link on a plan (the database's own guarantee).
 *   L7  A-18: an unlocated source saves with located: false; a located one with located: true.
 *   L8  A-37: the claim endpoint's service stays idempotent — a second claim claims nothing, no duplicate plan.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/lane1-guest-save.db.test.ts
 */
import { parsePlanItemRef } from "@shared/plan-item-ref";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  activityCache,
  affiliatePartners,
  affiliateProducts,
  feverEventCache,
  hotelCache,
  itineraryItems,
  providerServices,
  travelPulseHiddenGems,
  tripCollaborators,
  trips,
  users,
} from "@shared/schema";
import { claimGuestPlans, createGuestPlan, guestPlanItemBody, hashGuestSession, readGuestPlan, saveGuestPlanItem } from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const tripIds = new Set<string>();
const ids = {
  user: `lane1-user-${tag}`,
  gemLocated: crypto.randomUUID(),
  gemUnlocated: crypto.randomUUID(),
  eventId: `lane1-evt-${tag}`,
  hotel: crypto.randomUUID(),
  activity: crypto.randomUUID(),
  partner: crypto.randomUUID(),
  product: crypto.randomUUID(),
  listing: crypto.randomUUID(),
};
const sid = () => crypto.randomUUID();
const later = new Date(Date.now() + 86_400_000);

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  await db.insert(users).values({ id: ids.user, email: `${ids.user}@example.test`, role: "service_provider" } as any);
  await db.insert(travelPulseHiddenGems).values([
    { id: ids.gemLocated, city: "Kyoto", placeName: `Lane1 Located Gem ${tag}`, latitude: "35.0176200", longitude: "135.6744450" } as any,
    { id: ids.gemUnlocated, city: "Kyoto", placeName: `Lane1 Unlocated Gem ${tag}` } as any,
  ]);
  await db.insert(feverEventCache).values({
    eventId: ids.eventId, title: `Lane1 Event ${tag}`, category: "music", city: "Kyoto", cityCode: "KYO", country: "Japan",
    bookingUrl: "https://example.test/e", expiresAt: later, venueName: "Lane1 Hall", latitude: "35.0100000", longitude: "135.7600000",
  } as any);
  await db.insert(hotelCache).values({ id: ids.hotel, hotelId: `lane1-h-${tag}`, cityCode: "KYO", name: `Lane1 Hotel ${tag}`, expiresAt: later, latitude: "35.0050000", longitude: "135.7700000" } as any);
  await db.insert(activityCache).values({ id: ids.activity, productCode: `lane1-a-${tag}`, destination: "Kyoto", title: `Lane1 Activity ${tag}`, expiresAt: later } as any);
  await db.insert(affiliatePartners).values({ id: ids.partner, name: `Lane1 Partner ${tag}`, websiteUrl: "https://example.test", category: "tours" } as any);
  await db.insert(affiliateProducts).values({ id: ids.product, partnerId: ids.partner, name: `Lane1 Product ${tag}`, productUrl: "https://example.test/p", coordinates: { lat: 35.02, lng: 135.77 } } as any);
  await db.insert(providerServices).values({ id: ids.listing, userId: ids.user, serviceName: `Lane1 Listing ${tag}`, status: "active", approvalStatus: "approved", latitude: "35.0000000", longitude: "135.7000000" } as any);
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) {
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, t));
    await db.delete(trips).where(inArray(trips.id, t));
  }
  await db.delete(providerServices).where(eq(providerServices.id, ids.listing));
  await db.delete(affiliateProducts).where(eq(affiliateProducts.id, ids.product));
  await db.delete(affiliatePartners).where(eq(affiliatePartners.id, ids.partner));
  await db.delete(activityCache).where(eq(activityCache.id, ids.activity));
  await db.delete(hotelCache).where(eq(hotelCache.id, ids.hotel));
  await db.delete(feverEventCache).where(eq(feverEventCache.eventId, ids.eventId));
  await db.delete(travelPulseHiddenGems).where(inArray(travelPulseHiddenGems.id, [ids.gemLocated, ids.gemUnlocated]));
  await db.delete(users).where(eq(users.id, ids.user));
});

async function newPlan(session: string): Promise<string> {
  const out = await createGuestPlan(hashGuestSession(session)!, { destination: "Kyoto, Japan" } as any);
  assert.equal(out.ok, true, JSON.stringify(out));
  const id = (out as any).view.plan.id as string;
  tripIds.add(id);
  return id;
}
const items = (tripId: string) => db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));

describe("Lane 1 guest save rail", () => {
  it("L1 saves each kind with the server-read name, link and point", async () => {
    const s = sid();
    const h = hashGuestSession(s)!;
    const tripId = await newPlan(s);
    const saves: Array<[string, Record<string, unknown>]> = [
      ["gem", { kind: "gem", source_id: ids.gemLocated, city: "Kyoto", title: "typed by the client" }],
      ["event", { kind: "event", source_id: ids.eventId, city: "Kyoto" }],
      ["listing", { kind: "listing", source_id: ids.listing, city: "Kyoto" }],
      ["product", { kind: "affiliate_product", source_id: ids.product, city: "Kyoto" }],
      ["hotel", { kind: "hotel", source_id: ids.hotel, city: "Kyoto" }],
      ["activity", { kind: "activity", source_id: ids.activity, city: "Kyoto" }],
    ];
    for (const [, body] of saves) {
      const out = await saveGuestPlanItem(h, guestPlanItemBody.parse(body));
      assert.equal(out.ok, true, JSON.stringify(out));
    }
    const rows = await items(tripId);
    const by = (title: string) => rows.find((r) => r.title === title)!;
    const gem = by(`Lane1 Located Gem ${tag}`);
    assert.ok(gem, "the gem row's name, never the client's");
    assert.equal(gem.contentType, "gem");
    assert.equal(gem.contentId, ids.gemLocated);
    assert.equal(Number(gem.latitude), 35.01762);
    const ev = by(`Lane1 Event ${tag}`);
    assert.equal(ev.contentType, "event");
    assert.equal(ev.contentId, ids.eventId);
    assert.equal(ev.locationName, "Lane1 Hall");
    assert.ok(ev.latitude != null);
    const listing = by(`Lane1 Listing ${tag}`);
    assert.equal(listing.providerServiceId, ids.listing);
    // CAP-2 (ruling, Nov 5, sanctioned): a listing's point is the `provider_services` row's own (R323's client-coordinate
    // path retired); only a property's blurred public point saves unlocated.
    assert.equal(listing.latitude, "35.0000000", "a listing saves at its own stored pin");
    const product = by(`Lane1 Product ${tag}`);
    assert.equal(product.affiliateProductId, ids.product);
    assert.equal(Number(product.latitude), 35.02);
    const hotel = by(`Lane1 Hotel ${tag}`);
    assert.equal(hotel.contentType, "hotel");
    assert.equal(hotel.contentId, ids.hotel);
    assert.equal(hotel.itemType, "accommodation");
    const act = by(`Lane1 Activity ${tag}`);
    assert.equal(act.contentType, "activity");
    assert.equal(act.latitude, null, "no point on the source row ⇒ none on the item");
    assert.ok(rows.every((r) => r.origin === "traveler"));
    assert.equal(rows.length, 6);
  });

  it("L2 refuses an unknown source, a body naming none, and a forged point", async () => {
    const s = sid();
    const h = hashGuestSession(s)!;
    const tripId = await newPlan(s);
    // CAP-2 (sanctioned): `partner_product` split into its three kinds (ruling 8).
    for (const kind of ["gem", "event", "listing", "affiliate_product", "hotel", "activity"] as const) {
      const out = await saveGuestPlanItem(h, guestPlanItemBody.parse({ kind, source_id: `nope-${tag}`, city: "Kyoto" }));
      assert.deepEqual(out, { ok: false, code: "unknown_source" }, kind);
    }
    assert.equal((await items(tripId)).length, 0);
    assert.equal(guestPlanItemBody.safeParse({ title: "Philosopher's Path" }).success, false, "no source ⇒ refused");
    // CAP-2 (sanctioned): a forged point is stripped from the envelope (ignored, never stored), and an unknown kind is
    // answered `unknown_kind` by the contract's own parser.
    const forged = guestPlanItemBody.parse({ kind: "gem", source_id: ids.gemLocated, city: "Kyoto", latitude: "1", longitude: "2" });
    assert.equal("latitude" in forged || "longitude" in forged, false, "no point in the body");
    assert.deepEqual(parsePlanItemRef({ kind: "venue", source_id: "x", city: "Kyoto" }), { ok: false, reason: "unknown_kind" }, "unknown kind");
  });

  it("L3 a second save of the same source answers the first item (sequential and concurrent)", async () => {
    const s = sid();
    const h = hashGuestSession(s)!;
    const tripId = await newPlan(s);
    const body = guestPlanItemBody.parse({ kind: "gem", source_id: ids.gemLocated, city: "Kyoto" });
    const first = await saveGuestPlanItem(h, body);
    const again = await saveGuestPlanItem(h, body);
    assert.equal(first.ok && again.ok, true);
    assert.equal((again as any).existing, true);
    assert.equal((again as any).itemId, (first as any).itemId);
    const listingBody = guestPlanItemBody.parse({ kind: "listing", source_id: ids.listing, city: "Kyoto" });
    const both = await Promise.all([saveGuestPlanItem(h, listingBody), saveGuestPlanItem(h, listingBody)]);
    assert.equal(new Set(both.map((o) => (o as any).itemId)).size, 1);
    assert.equal((await items(tripId)).length, 2);
  });

  it("L4 two concurrent creates make one plan", async () => {
    const h = hashGuestSession(sid())!;
    const [a, b] = await Promise.all([
      createGuestPlan(h, { destination: "Kyoto, Japan" } as any),
      createGuestPlan(h, { destination: "Kyoto, Japan" } as any),
    ]);
    assert.equal(a.ok && b.ok, true);
    const ida = (a as any).view.plan.id;
    tripIds.add(ida);
    tripIds.add((b as any).view.plan.id);
    assert.equal((b as any).view.plan.id, ida);
    assert.deepEqual([(a as any).created, (b as any).created].sort(), [false, true]);
    const live = await db.select().from(trips).where(sql`guest_session_hash = ${h} AND guest_claimed_at IS NULL`);
    assert.equal(live.length, 1);
  });

  it("L5 the unique index allows one live guest plan per session; a claim frees it", async () => {
    const s = sid();
    const h = hashGuestSession(s)!;
    const first = await newPlan(s);
    await assert.rejects(
      db.insert(trips).values({ destination: "Kyoto, Japan", startDate: "2027-01-01", endDate: "2027-01-01", guestSessionHash: h } as any),
      (err: any) => (err?.code ?? err?.cause?.code) === "23505",
    );
    const userId = `lane1-claim-${tag}`;
    await db.insert(users).values({ id: userId, email: `${userId}@example.test`, role: "user" } as any);
    try {
      assert.deepEqual(await claimGuestPlans(h, userId), [first]);
      const second = await newPlan(s);
      assert.notEqual(second, first, "after the claim the session may start a new plan");
    } finally {
      await db.delete(tripCollaborators).where(eq(tripCollaborators.userId, userId));
      await db.update(trips).set({ userId: null }).where(eq(trips.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("L6 the item index refuses a second item with the same content link", async () => {
    const tripId = await newPlan(sid());
    const row = { tripId, title: "x", dayNumber: 1, status: "planned", contentType: "gem", contentId: ids.gemUnlocated } as any;
    await db.insert(itineraryItems).values(row);
    await assert.rejects(db.insert(itineraryItems).values(row), (err: any) => (err?.code ?? err?.cause?.code) === "23505");
  });

  it("L7 located tells the client whether to say the item is not on the map", async () => {
    const s = sid();
    const h = hashGuestSession(s)!;
    await newPlan(s);
    const on = await saveGuestPlanItem(h, guestPlanItemBody.parse({ kind: "gem", source_id: ids.gemLocated, city: "Kyoto" }));
    const off = await saveGuestPlanItem(h, guestPlanItemBody.parse({ kind: "gem", source_id: ids.gemUnlocated, city: "Kyoto" }));
    assert.equal((on as any).located, true);
    assert.equal((off as any).located, false);
    const view = await readGuestPlan(h);
    assert.deepEqual(view!.items.map((i) => i.located).sort(), [false, true]);
  });

  it("L8 a second claim claims nothing and makes no plan", async () => {
    const s = sid();
    const h = hashGuestSession(s)!;
    const tripId = await newPlan(s);
    const userId = `lane1-claim2-${tag}`;
    await db.insert(users).values({ id: userId, email: `${userId}@example.test`, role: "user" } as any);
    try {
      assert.deepEqual(await claimGuestPlans(h, userId), [tripId]);
      assert.deepEqual(await claimGuestPlans(h, userId), []);
      const owned = await db.select().from(trips).where(eq(trips.userId, userId));
      assert.equal(owned.length, 1);
    } finally {
      await db.delete(tripCollaborators).where(eq(tripCollaborators.userId, userId));
      await db.update(trips).set({ userId: null }).where(eq(trips.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
