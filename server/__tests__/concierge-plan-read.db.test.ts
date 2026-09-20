/**
 * THE BOOKING CONCIERGE READS THE PLAN IT WORKS.
 *
 * Decision-maker ruling 2026-09-20 (ledger `2026-09-20-concierge-plan-read`). Proves
 * `server/services/concierge-plan-read.service.ts` (`grantConciergePlanRead`) and its two
 * callers — `createHandoffRequestsForBooking` (hand-off) and `claimBookingRequest` (claim) —
 * directly against real Postgres. CLAUDE.md Locked Decisions 12, 32 (incl. the ONE-author
 * paragraph), 40 D22, 42 D7/D16, 44, 51; §13, §14, §15, §18 rule 1.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after(). No
 * Stripe key and no network — this file never reaches Stripe.
 *
 * Run solo: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/concierge-plan-read.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { createHandoffRequestsForBooking } from "../services/concierge-handoff.service";
import { claimBookingRequest } from "../services/booking-agent-claim.service";
import { grantConciergePlanRead, CONCIERGE_READ_GRANT_MESSAGE } from "../services/concierge-plan-read.service";
import { isTripAdvisor, isTripAdvisorWithWriteAccess } from "../utils/trip-advisor";
import { getPlatformConciergeUserId, invalidatePlatformConciergeCache } from "../services/platform-concierge.service";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const travelerId = `cpr-${RUN}-trav`;
const listingOwnerId = `cpr-${RUN}-owner`; // the listing owner for hand-off (G1, G5, G7a)
const poolAgentId = `cpr-${RUN}-agent`; // the claimant for pooled requests (G3, G7b)
const noTripAgentId = `cpr-${RUN}-notrip`; // its own user, so G4 needs no ordering assumption

let conciergeServiceId: string;
let nonConciergeServiceId: string;
let partnerId: string;
let productA: string;
let productB: string;
let productC: string;
let productD: string;
let platformUserId: string | null;
let platformConciergeServiceId: string | null;

const tripIds: string[] = [];
const itemIds: string[] = [];
const bookingIds: string[] = [];
const requestIds: string[] = []; // requests inserted directly (claim fixtures)

async function makeTrip(): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${travelerId}, ${`CPR trip ${RUN}`}, '2030-07-01', '2030-07-05', 'Lisbon, Portugal')
  `);
  tripIds.push(id);
  return id;
}

async function makeItem(opts: {
  tripId: string;
  title: string;
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO itinerary_items
      (id, trip_id, title, day_number, routing_status, provider_service_id, affiliate_product_id)
    VALUES
      (${id}, ${opts.tripId}, ${opts.title}, 1, 'in_planning',
       ${opts.providerServiceId ?? null}, ${opts.affiliateProductId ?? null})
  `);
  itemIds.push(id);
  return id;
}

async function makeConciergeBooking(opts: {
  serviceId: string;
  itineraryItemId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings, booking_details)
    VALUES
      (${id}, ${opts.serviceId}, ${travelerId}, ${listingOwnerId}, 'confirmed', '499.00', '124.75', '374.25',
       ${JSON.stringify({ itineraryItemId: opts.itineraryItemId })}::jsonb)
  `);
  bookingIds.push(id);
  return id;
}

/** A pooled (unclaimed) request, on the `booking-agent-claim.db.test.ts` fixture shape. */
async function newPooledRequest(tripId: string | null): Promise<string> {
  const row = await storage.createAffiliateBookingRequest({
    userId: travelerId,
    expertId: null,
    tripId,
    itemName: "CPR partner activity",
    itemDescription: null,
    partnerName: "CPR Partner",
    partnerCategory: "tours",
    affiliateUrl: "https://partner.example.com/book?ref=cpr-db-test",
    travelDate: null,
    travelers: 1,
    userNotes: null,
    expertNotes: null,
    confirmationRef: null,
    price: null,
    status: "pending",
  } as any);
  requestIds.push(row.id);
  return row.id;
}

async function advisorRow(tripId: string, expertUserId: string): Promise<{ status: string; message: string | null } | null> {
  const result = await db.execute(sql`
    SELECT status, message FROM trip_expert_advisors
    WHERE trip_id = ${tripId} AND local_expert_id = ${expertUserId}
  `);
  return (result.rows[0] as any) ?? null;
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${travelerId}, ${`cpr-${RUN}-trav@test.local`}, 'traveler'),
      (${listingOwnerId}, ${`cpr-${RUN}-owner@test.local`}, 'expert'),
      (${poolAgentId}, ${`cpr-${RUN}-agent@test.local`}, 'expert'),
      (${noTripAgentId}, ${`cpr-${RUN}-notrip@test.local`}, 'expert')
  `);

  conciergeServiceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method, expert_offering_type_key)
    VALUES
      (${conciergeServiceId}, ${listingOwnerId}, ${`cpr-${RUN} Booking Concierge fixture`}, '499.00', 'active', 'approved', 'in_person', 'booking_concierge')
  `);

  nonConciergeServiceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method)
    VALUES
      (${nonConciergeServiceId}, ${listingOwnerId}, ${`cpr-${RUN} Ordinary listing fixture`}, '100.00', 'active', 'approved', 'in_person')
  `);

  partnerId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO affiliate_partners (id, name, website_url, category, approval_status)
    VALUES (${partnerId}, ${`CPR Partner ${RUN}`}, 'https://partner.test', 'tours', 'approved')
  `);

  const mkProduct = async (label: string) => {
    const id = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO affiliate_products (id, partner_id, name, category, product_url, affiliate_url, is_active)
      VALUES (${id}, ${partnerId}, ${`CPR Product ${label} ${RUN}`}, 'tours', ${`https://partner.test/${label}`}, ${`https://partner.test/${label}?ref=1`}, true)
    `);
    return id;
  };
  productA = await mkProduct("a");
  productB = await mkProduct("b");
  productC = await mkProduct("c");
  productD = await mkProduct("d");

  // Migration 313's platform-owned listing (Locked Decision 51 lane F) — read, never re-seeded.
  invalidatePlatformConciergeCache();
  platformUserId = await getPlatformConciergeUserId();
  if (platformUserId) {
    const row = await db.execute(sql`
      SELECT id FROM provider_services
      WHERE user_id = ${platformUserId} AND expert_offering_type_key = 'booking_concierge'
      LIMIT 1
    `);
    platformConciergeServiceId = (row.rows[0] as any)?.id ?? null;
  }
});

after(async () => {
  if (requestIds.length > 0) {
    await db.execute(sql`DELETE FROM affiliate_booking_requests WHERE id IN (${sql.join(requestIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (bookingIds.length > 0) {
    await db.execute(sql`DELETE FROM affiliate_booking_requests WHERE service_booking_id IN (${sql.join(bookingIds.map((i) => sql`${i}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${sql.join(bookingIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (itemIds.length > 0) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id IN (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (tripIds.length > 0) {
    // `trip_expert_advisors` FKs ON DELETE CASCADE off trips — any grant rows this file wrote go
    // with them.
    await db.execute(sql`DELETE FROM trips WHERE id IN (${sql.join(tripIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  await db.execute(sql`DELETE FROM affiliate_products WHERE id IN (${productA}, ${productB}, ${productC}, ${productD})`);
  await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${partnerId}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${conciergeServiceId}, ${nonConciergeServiceId})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${travelerId}, ${listingOwnerId}, ${poolAgentId}, ${noTripAgentId})`);
});

test("G1: hand-off to a real listing owner grants a pending read-only row, and the read predicate admits it", async () => {
  const tripId = await makeTrip();
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: conciergeServiceId });
  await makeItem({ tripId, title: "Partner activity", affiliateProductId: productA });
  const bookingId = await makeConciergeBooking({ serviceId: conciergeServiceId, itineraryItemId: conciergeItem });

  const result = await createHandoffRequestsForBooking(bookingId);
  assert.equal(result.handedOff, 1);

  const row = await advisorRow(tripId, listingOwnerId);
  assert.ok(row, "the hand-off must grant a trip_expert_advisors row");
  assert.equal(row!.status, "pending", "§12 READ rank only");
  assert.equal(row!.message, CONCIERGE_READ_GRANT_MESSAGE);

  assert.equal(await isTripAdvisor(tripId, listingOwnerId), true, "the read predicate admits `pending`");
});

test("G2: hand-off from the platform's own reserved listing grants NOTHING", async (t) => {
  if (!platformUserId || !platformConciergeServiceId) {
    t.skip("migration 313 has not seeded the platform concierge listing on this database");
    return;
  }
  const tripId = await makeTrip();
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge (platform)", providerServiceId: platformConciergeServiceId });
  await makeItem({ tripId, title: "Partner activity", affiliateProductId: productB });
  const bookingId = await makeConciergeBooking({ serviceId: platformConciergeServiceId, itineraryItemId: conciergeItem });
  // `createHandoffRequestsForBooking` resolves the listing owner from `service.userId`, not from
  // this booking row's own `provider_id` (a fixture column unrelated to this decision), so the
  // platform's listing being the SERVICE is what matters here.

  const result = await createHandoffRequestsForBooking(bookingId);
  assert.equal(result.handedOff, 1, "the request itself is still created — pooled, expertId null");

  const row = await advisorRow(tripId, platformUserId);
  assert.equal(row, null, "the platform's reserved account never gets a plan-read grant");
});

test("G3: claiming a pooled request that names a trip grants the claimant a pending read-only row", async () => {
  const tripId = await makeTrip();
  const requestId = await newPooledRequest(tripId);

  const outcome = await claimBookingRequest({ requestId, actorUserId: poolAgentId });
  assert.equal(outcome.ok, true);

  const row = await advisorRow(tripId, poolAgentId);
  assert.ok(row, "a winning claim on a trip-linked request must grant a plan-read row");
  assert.equal(row!.status, "pending");
  assert.equal(row!.message, CONCIERGE_READ_GRANT_MESSAGE);
  assert.equal(await isTripAdvisor(tripId, poolAgentId), true);
});

test("G4: claiming a pooled request with NO trip grants nothing", async () => {
  const requestId = await newPooledRequest(null);

  // Its own dedicated user (never granted anywhere else in this file), so the count below needs
  // no ordering assumption against the other G-tests.
  const outcome = await claimBookingRequest({ requestId, actorUserId: noTripAgentId });
  assert.equal(outcome.ok, true);

  const result = await db.execute(sql`
    SELECT count(*)::int AS n FROM trip_expert_advisors WHERE local_expert_id = ${noTripAgentId}
  `);
  assert.equal((result.rows[0] as any).n, 0, "no plan-read row exists — there is no plan to read (§13)");
});

test("G5: an advisor already `accepted` on a plan is NEVER downgraded by the grant — a conflict never downgrades", async () => {
  const tripId = await makeTrip();
  // Pre-seed an `accepted` row through the ONE author, exactly as an admin-confirmed or
  // traveler-accepted advisor would carry it.
  await grantConciergePlanRead({ tripId, expertUserId: listingOwnerId, requestId: "pre-seed" });
  // Promote it to `accepted` directly (simulating the real advisor-acceptance path, which this
  // file does not need to exercise) using the SAME one author via a raw upsert-shaped update —
  // done here through direct SQL since `upsertTripAdvisorRow`'s ladder never demotes and this
  // fixture needs the row to start ABOVE `pending`.
  await db.execute(sql`
    UPDATE trip_expert_advisors SET status = 'accepted', message = 'Hired directly'
    WHERE trip_id = ${tripId} AND local_expert_id = ${listingOwnerId}
  `);
  const before = await advisorRow(tripId, listingOwnerId);
  assert.equal(before!.status, "accepted");

  // Now the SAME expert is stamped as the concierge hand-off's listing owner on this same plan.
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: conciergeServiceId });
  await makeItem({ tripId, title: "Partner activity", affiliateProductId: productC });
  const bookingId = await makeConciergeBooking({ serviceId: conciergeServiceId, itineraryItemId: conciergeItem });
  await createHandoffRequestsForBooking(bookingId);

  const after = await advisorRow(tripId, listingOwnerId);
  assert.equal(after!.status, "accepted", "a conflict never downgrades — `pending` cannot demote `accepted`");
  assert.equal(after!.message, "Hired directly", "message is COALESCE(existing, incoming) — the existing note stands");
});

test("G6: the concierge's grant is READ-ONLY — it may not write an item on the plan", async () => {
  const tripId = await makeTrip();
  await grantConciergePlanRead({ tripId, expertUserId: poolAgentId, requestId: "g6" });

  assert.equal(await isTripAdvisor(tripId, poolAgentId), true, "read access: granted");
  assert.equal(
    await isTripAdvisorWithWriteAccess(tripId, poolAgentId),
    false,
    "write access: `pending` never grants it — Locked Decision 12",
  );
});

test("G7a: a failed hand-off grant leaves the hand-off's own result unchanged (§15b)", async () => {
  const tripId = await makeTrip();
  const conciergeItem = await makeItem({ tripId, title: "Booking Concierge", providerServiceId: conciergeServiceId });
  await makeItem({ tripId, title: "Partner activity", affiliateProductId: productD });
  const bookingId = await makeConciergeBooking({ serviceId: conciergeServiceId, itineraryItemId: conciergeItem });

  const result = await createHandoffRequestsForBooking(bookingId, {
    createAffiliateBookingRequestIdempotent: (data) => storage.createAffiliateBookingRequestIdempotent(data),
    grantConciergePlanRead: async () => {
      throw new Error("injected grant failure");
    },
  });

  // The hand-off's own result is EXACTLY what it would have been without the injected failure —
  // the grant is an ancillary effect, never a co-author of this function's answer.
  assert.equal(result.handedOff, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.requestIds.length, 1);

  const row = await advisorRow(tripId, listingOwnerId);
  assert.equal(row, null, "the injected failure means no grant row exists — and nothing else broke either");
});

test("G7b: a failed claim grant leaves the claim's own result unchanged (§15b)", async () => {
  const tripId = await makeTrip();
  const requestId = await newPooledRequest(tripId);

  const outcome = await claimBookingRequest(
    { requestId, actorUserId: poolAgentId },
    {
      grantConciergePlanRead: async () => {
        throw new Error("injected grant failure");
      },
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.alreadyYours, false);

  const result = await db.execute(sql`
    SELECT count(*)::int AS n FROM trip_expert_advisors WHERE trip_id = ${tripId} AND local_expert_id = ${poolAgentId}
  `);
  assert.equal((result.rows[0] as any).n, 0, "the injected failure means no grant row exists — the claim itself still won");
});

test("G8: check-advisor-row-author.cjs still passes — this lane added no second insert site", () => {
  // Throws (non-zero exit) on failure; a clean run is the assertion.
  execFileSync("node", ["scripts/check-advisor-row-author.cjs"], { stdio: "pipe" });
});
