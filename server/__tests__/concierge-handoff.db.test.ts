/**
 * THE HAND-OFF — checkout of a Booking Concierge line creates the plan's partner requests.
 *
 * Ledger `2026-09-18-concierge-handoff`. Proves `server/services/concierge-handoff.service.ts`
 * `createHandoffRequestsForBooking` directly (both promotion call sites just call it — see H6).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 * No Stripe key and no network — this file never reaches Stripe.
 *
 * Run solo: npx tsx --test server/__tests__/concierge-handoff.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { createHandoffRequestsForBooking } from "../services/concierge-handoff.service";

const RUN = crypto.randomUUID().slice(0, 8);
const expertId = `ch-${RUN}-expert`;
const travelerId = `ch-${RUN}-trav`;

let conciergeServiceId: string;
let nonConciergeServiceId: string;
let partnerId: string;
let productA: string; // resolves fine
let productB: string; // resolves fine, used by H5
const tripIds: string[] = [];
const itemIds: string[] = [];
const bookingIds: string[] = [];

async function makeTrip(): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${travelerId}, ${`CH trip ${RUN}`}, '2030-06-01', '2030-06-05', 'Kyoto, Japan')
  `);
  tripIds.push(id);
  return id;
}

async function makeItem(opts: {
  tripId: string;
  title: string;
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
  routingStatus?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO itinerary_items
      (id, trip_id, title, day_number, routing_status, provider_service_id, affiliate_product_id)
    VALUES
      (${id}, ${opts.tripId}, ${opts.title}, 1, ${opts.routingStatus ?? "in_planning"},
       ${opts.providerServiceId ?? null}, ${opts.affiliateProductId ?? null})
  `);
  itemIds.push(id);
  return id;
}

async function makeBooking(opts: { serviceId: string; itineraryItemId: string | null }): Promise<string> {
  const id = crypto.randomUUID();
  const bookingDetails = opts.itineraryItemId ? { itineraryItemId: opts.itineraryItemId } : {};
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings, booking_details)
    VALUES
      (${id}, ${opts.serviceId}, ${travelerId}, ${expertId}, 'confirmed', '100.00', '25.00', '75.00',
       ${JSON.stringify(bookingDetails)}::jsonb)
  `);
  bookingIds.push(id);
  return id;
}

async function requestsForBooking(bookingId: string) {
  const rows = await db.execute(sql`
    SELECT id, expert_id, trip_id, itinerary_item_id, service_booking_id, status
    FROM affiliate_booking_requests
    WHERE service_booking_id = ${bookingId}
  `);
  return rows.rows as any[];
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${expertId}, ${`ch-${RUN}-expert@test.local`}, 'expert'),
      (${travelerId}, ${`ch-${RUN}-trav@test.local`}, 'traveler')
  `);

  conciergeServiceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method, expert_offering_type_key)
    VALUES
      (${conciergeServiceId}, ${expertId}, ${`ch-${RUN} Booking Concierge fixture`}, '499.00', 'active', 'approved', 'in_person', 'booking_concierge')
  `);

  nonConciergeServiceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method)
    VALUES
      (${nonConciergeServiceId}, ${expertId}, ${`ch-${RUN} Ordinary listing fixture`}, '100.00', 'active', 'approved', 'in_person')
  `);

  partnerId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO affiliate_partners (id, name, website_url, category, approval_status)
    VALUES (${partnerId}, ${`CH Partner ${RUN}`}, 'https://partner.test', 'tours', 'approved')
  `);

  productA = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO affiliate_products (id, partner_id, name, category, product_url, affiliate_url, is_active)
    VALUES (${productA}, ${partnerId}, ${`CH Product A ${RUN}`}, 'tours', 'https://partner.test/a', 'https://partner.test/a?ref=1', true)
  `);

  productB = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO affiliate_products (id, partner_id, name, category, product_url, affiliate_url, is_active)
    VALUES (${productB}, ${partnerId}, ${`CH Product B ${RUN}`}, 'tours', 'https://partner.test/b', 'https://partner.test/b?ref=1', true)
  `);
});

after(async () => {
  if (bookingIds.length > 0) {
    await db.execute(sql`DELETE FROM affiliate_booking_requests WHERE service_booking_id IN (${sql.join(bookingIds.map((i) => sql`${i}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${sql.join(bookingIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (itemIds.length > 0) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id IN (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (tripIds.length > 0) {
    await db.execute(sql`DELETE FROM trips WHERE id IN (${sql.join(tripIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  await db.execute(sql`DELETE FROM affiliate_products WHERE id IN (${productA}, ${productB})`);
  await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${partnerId}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${conciergeServiceId}, ${nonConciergeServiceId})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${expertId}, ${travelerId})`);
});

test("H1: one request per partner item, both FKs set, expert_id = the listing owner, status is the birth value", async () => {
  const tripId = await makeTrip();
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: conciergeServiceId });
  const partnerItem = await makeItem({ tripId, title: "Partner activity", affiliateProductId: productA });
  const bookingId = await makeBooking({ serviceId: conciergeServiceId, itineraryItemId: conciergeItem });

  const result = await createHandoffRequestsForBooking(bookingId);
  assert.equal(result.handedOff, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.requestIds.length, 1);

  const rows = await requestsForBooking(bookingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].itinerary_item_id, partnerItem);
  assert.equal(rows[0].service_booking_id, bookingId);
  assert.equal(rows[0].expert_id, expertId, "the ASSUMPTION: a paid hand-off is stamped to the listing owner, not the pool");
  assert.equal(rows[0].trip_id, tripId);
  assert.equal(rows[0].status, "pending", "the legacy birth value the ONE reader maps to the ruled `received`");
});

test("H2: a second promotion creates none — the partial UNIQUE + ON CONFLICT DO NOTHING guard", async () => {
  const tripId = await makeTrip();
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: conciergeServiceId });
  const partnerItem = await makeItem({ tripId, title: "Partner activity", affiliateProductId: productA });
  const bookingId = await makeBooking({ serviceId: conciergeServiceId, itineraryItemId: conciergeItem });
  void partnerItem;

  const first = await createHandoffRequestsForBooking(bookingId);
  assert.equal(first.handedOff, 1);

  const second = await createHandoffRequestsForBooking(bookingId);
  assert.equal(second.handedOff, 0, "the retry inserts nothing new");
  assert.equal(second.skipped, 0, "a conflict is not a skip — it was already done, not passed over");

  const rows = await requestsForBooking(bookingId);
  assert.equal(rows.length, 1, "still exactly one row for this (booking, item) pair");
});

test("H3: a non-concierge booking hands off nothing", async () => {
  const tripId = await makeTrip();
  const item = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: nonConciergeServiceId });
  const bookingId = await makeBooking({ serviceId: nonConciergeServiceId, itineraryItemId: item });

  const result = await createHandoffRequestsForBooking(bookingId);
  assert.deepEqual(result, { handedOff: 0, skipped: 0, reason: "not_concierge", requestIds: [] });

  const rows = await requestsForBooking(bookingId);
  assert.equal(rows.length, 0);
});

test("H4: items lacking affiliate_product_id are skipped and counted, never invented", async () => {
  const tripId = await makeTrip();
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: conciergeServiceId });
  await makeItem({ tripId, title: "Plain itinerary item, no partner link" });
  const bookingId = await makeBooking({ serviceId: conciergeServiceId, itineraryItemId: conciergeItem });

  const result = await createHandoffRequestsForBooking(bookingId);
  assert.equal(result.handedOff, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.reason, "no_partner_product");
  assert.deepEqual(result.requestIds, []);

  const rows = await requestsForBooking(bookingId);
  assert.equal(rows.length, 0);
});

test("H5: an injected insert failure returns without throwing (§15b: an ancillary write may not break the operation that authorizes it)", async () => {
  const tripId = await makeTrip();
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: conciergeServiceId });
  await makeItem({ tripId, title: "Partner activity", affiliateProductId: productB });
  const bookingId = await makeBooking({ serviceId: conciergeServiceId, itineraryItemId: conciergeItem });

  const result = await createHandoffRequestsForBooking(bookingId, {
    createAffiliateBookingRequestIdempotent: async () => {
      throw new Error("injected failure");
    },
  });
  assert.deepEqual(result, { handedOff: 0, skipped: 0, requestIds: [] });

  const rows = await requestsForBooking(bookingId);
  assert.equal(rows.length, 0, "the injected failure created no row");
});

test("H6: both promotion paths import the ONE hand-off implementation (§18 rule 1)", () => {
  const payments = fs.readFileSync("server/routes/payments.routes.ts", "utf8");
  const checkoutClaim = fs.readFileSync("server/services/checkout-claim.service.ts", "utf8");
  assert.match(payments, /from ["']\.\.\/services\/concierge-handoff\.service["']/);
  assert.match(checkoutClaim, /from ["']\.\/concierge-handoff\.service["']/);
  assert.match(payments, /createHandoffRequestsForBooking/);
  assert.match(checkoutClaim, /createHandoffRequestsForBooking/);
});
