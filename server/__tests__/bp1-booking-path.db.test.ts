/**
 * BP-1 (ledger `2026-10-12-bp1-booking-path`): the plan read's booking path, end to end against a real database.
 *
 *   P1 a live platform listing ⇒ platform; a paused one falls through to the next rule
 *   P2 an active, approved partner with a template covering the item's product ⇒ affiliate; no template ⇒ not
 *   P3 a bookable LiteAPI stay ⇒ affiliate (the stay chain is injected — its own suite covers it); booking off ⇒
 *      the real reader returns nothing
 *   P4 a named place ⇒ concierge; an area title ⇒ none
 *   P5 a past day ⇒ none on every path — but only when the plan's dates were chosen
 *   P6 a frozen path wins over the live facts, except on a past day
 *   P7 Make final freezes the paths into the snapshot, and the Trip Card render reads them
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { resolvePlanBookingPaths, readFrozenBookingPaths, defaultBookingPathDeps } = await import("../services/booking-path.service");
const { liteapiBookableItemIds } = await import("../services/liteapi-booking.service");
const { finalizeTrip } = await import("../services/trip-finalize.service");
const { assembleTripPlan } = await import("../services/trip-plan.service");

const SUFFIX = `bp1-${process.pid}`;
let userId: string;
let liveListing: string;
let pausedListing: string;
let goodPartner: string;
let barePartner: string;
let coveredProduct: string;
let bareProduct: string;
const tripIds: string[] = [];

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function one<T = any>(q: any): Promise<T> {
  return (await db.execute(q)).rows[0] as T;
}

async function makeTrip(opts: { startOffset: number; confirmed: boolean }): Promise<string> {
  const r = await one<{ id: string }>(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone, dates_confirmed_at)
    VALUES (gen_random_uuid()::text, ${userId}, 'BP-1 plan', 'Kyoto, Japan', ${isoDay(opts.startOffset)}, ${isoDay(opts.startOffset + 3)},
            'Asia/Tokyo', ${opts.confirmed ? sql`NOW()` : sql`NULL`})
    RETURNING id
  `);
  tripIds.push(r.id);
  return r.id;
}

async function makeItem(tripId: string, f: { title: string; day?: number; location?: string; serviceId?: string; productId?: string }): Promise<string> {
  const r = await one<{ id: string }>(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, location_name, provider_service_id, affiliate_product_id)
    VALUES (gen_random_uuid()::text, ${tripId}, ${f.title}, ${f.day ?? 1}, ${f.location ?? null}, ${f.serviceId ?? null}, ${f.productId ?? null})
    RETURNING id
  `);
  return r.id;
}

async function itemsOf(tripId: string) {
  return (
    await db.execute(sql`
      SELECT id, title, location_name AS "locationName", provider_service_id AS "providerServiceId",
             affiliate_product_id AS "affiliateProductId", day_number AS "dayNumber"
        FROM itinerary_items WHERE trip_id = ${tripId}
    `)
  ).rows as any[];
}

async function tripOf(tripId: string) {
  return one(sql`
    SELECT id, destination, start_date AS "startDate", timezone, dates_confirmed_at AS "datesConfirmedAt"
      FROM trips WHERE id = ${tripId}
  `);
}

const noStays = { ...defaultBookingPathDeps, liteapiBookableItemIds: async () => new Set<string>() };

before(async () => {
  userId = (await one<{ id: string }>(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${SUFFIX + "@traveloure.test"}, 'service_provider') RETURNING id
  `)).id;
  liveListing = (await one<{ id: string }>(sql`
    INSERT INTO provider_services (id, user_id, service_name, status, approval_status)
    VALUES (gen_random_uuid()::text, ${userId}, 'BP-1 live tea ceremony', 'active', 'approved') RETURNING id
  `)).id;
  pausedListing = (await one<{ id: string }>(sql`
    INSERT INTO provider_services (id, user_id, service_name, status, approval_status)
    VALUES (gen_random_uuid()::text, ${userId}, 'BP-1 paused tour', 'paused', 'approved') RETURNING id
  `)).id;
  goodPartner = (await one<{ id: string }>(sql`
    INSERT INTO affiliate_partners (id, name, website_url, category, is_active, approval_status, affiliate_link_template)
    VALUES (gen_random_uuid()::text, ${"bp1-good-" + SUFFIX}, 'https://partner.example', 'activities', true, 'approved',
            'https://tp.media/r?marker={marker}&u={url}') RETURNING id
  `)).id;
  barePartner = (await one<{ id: string }>(sql`
    INSERT INTO affiliate_partners (id, name, website_url, category, is_active, approval_status, affiliate_link_template)
    VALUES (gen_random_uuid()::text, ${"bp1-bare-" + SUFFIX}, 'https://bare.example', 'activities', true, 'approved', NULL) RETURNING id
  `)).id;
  coveredProduct = (await one<{ id: string }>(sql`
    INSERT INTO affiliate_products (id, partner_id, name, product_url, is_active)
    VALUES (gen_random_uuid()::text, ${goodPartner}, 'Fushimi Inari guided hike', 'https://partner.example/p/1', true) RETURNING id
  `)).id;
  bareProduct = (await one<{ id: string }>(sql`
    INSERT INTO affiliate_products (id, partner_id, name, product_url, is_active)
    VALUES (gen_random_uuid()::text, ${barePartner}, 'Kinkaku-ji ticket', 'https://bare.example/p/1', true) RETURNING id
  `)).id;
});

after(async () => {
  for (const t of tripIds) {
    await db.execute(sql`DELETE FROM trip_finals WHERE trip_id = ${t}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${t}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`);
  }
  await db.execute(sql`DELETE FROM affiliate_products WHERE id IN (${coveredProduct}, ${bareProduct})`);
  await db.execute(sql`DELETE FROM affiliate_partners WHERE id IN (${goodPartner}, ${barePartner})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${liveListing}, ${pausedListing})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  await pool.end();
});

test("P1–P4: each path from the plan's real rows", async () => {
  const tripId = await makeTrip({ startOffset: 30, confirmed: true });
  const live = await makeItem(tripId, { title: "Tea ceremony", location: "Camellia Garden", serviceId: liveListing });
  const paused = await makeItem(tripId, { title: "Nishiki Market tasting", serviceId: pausedListing });
  const product = await makeItem(tripId, { title: "Fushimi Inari hike", productId: coveredProduct });
  const bare = await makeItem(tripId, { title: "Kinkaku-ji", productId: bareProduct });
  const stay = await makeItem(tripId, { title: "Hotel Kanra" });
  const area = await makeItem(tripId, { title: "Gion Walk" });
  const paths = await resolvePlanBookingPaths(await tripOf(tripId), await itemsOf(tripId), {}, {
    ...defaultBookingPathDeps,
    liteapiBookableItemIds: async () => new Set([stay]),
  });
  assert.equal(paths.get(live), "platform");
  assert.equal(paths.get(paused), "concierge", "a paused listing falls through to the named place");
  assert.equal(paths.get(product), "affiliate");
  assert.equal(paths.get(bare), "concierge", "a partner with no link template covers nothing");
  assert.equal(paths.get(stay), "affiliate");
  assert.equal(paths.get(area), "none");
});

test("P3: with LiteAPI booking off, the real stay reader covers nothing", async () => {
  const tripId = await makeTrip({ startOffset: 30, confirmed: true });
  await makeItem(tripId, { title: "Hotel Kanra" });
  const ids = await liteapiBookableItemIds(tripId, { config: () => null });
  assert.equal(ids.size, 0);
});

test("P5: a past day is none on every path, only when the dates were chosen", async () => {
  const chosen = await makeTrip({ startOffset: -10, confirmed: true });
  const a = await makeItem(chosen, { title: "Tea ceremony", serviceId: liveListing });
  const b = await makeItem(chosen, { title: "Fushimi Inari hike", productId: coveredProduct });
  const c = await makeItem(chosen, { title: "Nanzen-ji" });
  const p1 = await resolvePlanBookingPaths(await tripOf(chosen), await itemsOf(chosen), {}, noStays);
  assert.deepEqual([p1.get(a), p1.get(b), p1.get(c)], ["none", "none", "none"]);

  const placeholder = await makeTrip({ startOffset: -10, confirmed: false });
  const d = await makeItem(placeholder, { title: "Tea ceremony", serviceId: liveListing });
  const p2 = await resolvePlanBookingPaths(await tripOf(placeholder), await itemsOf(placeholder), {}, noStays);
  assert.equal(p2.get(d), "platform", "a placeholder window has no past (§13)");
});

test("P6: a frozen path wins, except on a past day", async () => {
  const future = await makeTrip({ startOffset: 30, confirmed: true });
  const x = await makeItem(future, { title: "Nanzen-ji" });
  const p1 = await resolvePlanBookingPaths(await tripOf(future), await itemsOf(future), { frozen: { [x]: "platform" } }, noStays);
  assert.equal(p1.get(x), "platform");

  const past = await makeTrip({ startOffset: -10, confirmed: true });
  const y = await makeItem(past, { title: "Nanzen-ji" });
  const p2 = await resolvePlanBookingPaths(await tripOf(past), await itemsOf(past), { frozen: { [y]: "platform" } }, noStays);
  assert.equal(p2.get(y), "none");
  assert.deepEqual(readFrozenBookingPaths({ bookingPaths: { [y]: "platform", z: "bogus" } }), { [y]: "platform" });
});

test("P7: Make final freezes the paths; the Trip Card render reads them", async () => {
  const tripId = await makeTrip({ startOffset: 30, confirmed: true });
  const live = await makeItem(tripId, { title: "Tea ceremony", location: "Camellia Garden", serviceId: liveListing });
  const area = await makeItem(tripId, { title: "Gion Walk" });
  await finalizeTrip(tripId, userId);
  const snap = (await one<{ snapshot: any }>(sql`SELECT snapshot FROM trip_finals WHERE trip_id = ${tripId} ORDER BY version DESC LIMIT 1`)).snapshot;
  assert.equal(snap.bookingPaths?.[live], "platform");
  assert.equal(snap.bookingPaths?.[area], "none");

  // The listing is paused after Make final: the working plan reads the live fact, the Trip Card the frozen one.
  await db.execute(sql`UPDATE provider_services SET status = 'paused' WHERE id = ${liveListing}`);
  try {
    const card: any = await assembleTripPlan(tripId, "full", { render: "final" } as any);
    const slip: any = await assembleTripPlan(tripId, "full");
    const find = (plan: any) => plan.days.flatMap((d: any) => d.activities).find((a: any) => a.id === live);
    assert.equal(find(card).bookingPath, "platform", "the Trip Card reads the frozen path");
    assert.equal(find(slip).bookingPath, "concierge", "the working plan reads the live facts");
  } finally {
    await db.execute(sql`UPDATE provider_services SET status = 'active' WHERE id = ${liveListing}`);
  }
});
