/**
 * THE PLATFORM'S OWN BOOKING CONCIERGE LISTING — where no expert offers one.
 *
 * Ledger `2026-09-18-platform-concierge-listing` (CLAUDE.md Locked Decision 51, lane F).
 * Proves migration 313's seed, `server/services/platform-concierge.service.ts`, the mint-skip in
 * `storage.mintCompletionEarningsForBooking` and the pool branch in
 * `server/services/concierge-handoff.service.ts`.
 *
 * DISPOSABLE DB ONLY for the rows this file itself creates (bookings/requests); the platform's
 * own seeded `users`/`local_expert_forms`/`provider_services` rows are the MIGRATION'S rows and
 * are never deleted by this file.
 *
 * Run solo: npx tsx --test server/__tests__/platform-concierge-listing.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { storage } from "../storage";
import {
  getPlatformConciergeUserId,
  isPlatformConciergeUserId,
  invalidatePlatformConciergeCache,
  PLATFORM_CONCIERGE_USER_ID_SETTING_KEY,
} from "../services/platform-concierge.service";
import { createHandoffRequestsForBooking } from "../services/concierge-handoff.service";
import { leadRoutingService } from "../services/lead-routing.service";
import { OPERATING_MARKET_CITY_NAMES } from "@shared/operating-markets";
import { earnerProfilePath } from "../../client/src/lib/earner-address";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRATION_SQL = readFileSync(join(REPO, "server", "migrations", "313_platform_concierge_listing.sql"), "utf8");

const RUN = crypto.randomUUID().slice(0, 8);
const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

let platformUserId: string;
let platformListingId: string;
let platformFormId: string;

const travelerId = `pcl-${RUN}-trav`;
const tripIds: string[] = [];
const itemIds: string[] = [];
const bookingIds: string[] = [];
const partnerIds: string[] = [];
const productIds: string[] = [];

// A REAL expert, seeded by this test (not by the migration), used by F5's ranking proof.
const realExpertId = `pcl-${RUN}-real-expert`;
let realExpertServiceId: string;
let realExpertFormId: string;

async function makeTrip(): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${travelerId}, ${`PCL trip ${RUN}`}, '2030-06-01', '2030-06-05', 'Kyoto, Japan')
  `);
  tripIds.push(id);
  return id;
}

async function makeItem(opts: {
  tripId: string;
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status, provider_service_id, affiliate_product_id)
    VALUES (${id}, ${opts.tripId}, ${`PCL item ${RUN}`}, 1, 'in_planning', ${opts.providerServiceId ?? null}, ${opts.affiliateProductId ?? null})
  `);
  itemIds.push(id);
  return id;
}

async function makeBooking(opts: {
  serviceId: string;
  providerId: string;
  itineraryItemId: string | null;
  totalAmount: string;
  platformFee: string;
  providerEarnings: string;
  conciergeFeeExpertShare?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const details: Record<string, unknown> = {};
  if (opts.itineraryItemId) details.itineraryItemId = opts.itineraryItemId;
  if (opts.conciergeFeeExpertShare) {
    details.travelerCharge = { conciergeFee: "20.00", conciergeFeeExpertShare: opts.conciergeFeeExpertShare };
  }
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status,
       total_amount, platform_fee, provider_earnings,
       stripe_payment_intent_id, confirmed_at, booking_details)
    VALUES
      (${id}, ${opts.serviceId}, ${travelerId}, ${opts.providerId}, 'confirmed',
       ${opts.totalAmount}, ${opts.platformFee}, ${opts.providerEarnings},
       ${`pi_pcl_${RUN}_${id}`}, NOW() - interval '10 days',
       ${JSON.stringify(details)}::jsonb)
  `);
  bookingIds.push(id);
  return id;
}

before(async () => {
  // The migration is expected to have already run against this database (CI runs the full
  // migration chain before any test job) — this reads what it seeded rather than re-seeding it.
  invalidatePlatformConciergeCache();
  const id = await getPlatformConciergeUserId();
  assert.ok(id, "migration 313 must have run before this test — platform_concierge_user_id is unseeded");
  platformUserId = id!;

  const listingRow = await db.execute(sql`
    SELECT id FROM provider_services
    WHERE user_id = ${platformUserId} AND expert_offering_type_key = 'booking_concierge'
    LIMIT 1
  `);
  assert.equal(listingRow.rows.length, 1, "the platform's own booking_concierge listing must exist");
  platformListingId = (listingRow.rows[0] as any).id;

  const formRow = await db.execute(sql`
    SELECT id FROM local_expert_forms WHERE user_id = ${platformUserId} LIMIT 1
  `);
  assert.equal(formRow.rows.length, 1, "the platform's local_expert_forms row must exist");
  platformFormId = (formRow.rows[0] as any).id;

  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${travelerId}, ${`pcl-${RUN}-trav@test.local`}, 'traveler'),
      (${realExpertId}, ${`pcl-${RUN}-real-expert@test.local`}, 'expert')
  `);

  realExpertServiceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method, expert_offering_type_key)
    VALUES
      (${realExpertServiceId}, ${realExpertId}, ${`pcl-${RUN} real expert Booking Concierge`}, '150.00', 'active', 'approved', 'in_person', 'booking_concierge')
  `);

  realExpertFormId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO local_expert_forms
      (id, user_id, expert_type, destinations, specialties, status)
    VALUES
      (${realExpertFormId}, ${realExpertId}, 'local_expert', '["Kyoto"]'::jsonb, '["weddings"]'::jsonb, 'approved')
  `);

  const partnerId = crypto.randomUUID();
  partnerIds.push(partnerId);
  await db.execute(sql`
    INSERT INTO affiliate_partners (id, name, website_url, category, approval_status)
    VALUES (${partnerId}, ${`PCL Partner ${RUN}`}, 'https://partner.test', 'tours', 'approved')
  `);

  const productId = crypto.randomUUID();
  productIds.push(productId);
  await db.execute(sql`
    INSERT INTO affiliate_products (id, partner_id, name, category, product_url, affiliate_url, is_active)
    VALUES (${productId}, ${partnerId}, ${`PCL Product ${RUN}`}, 'tours', 'https://partner.test/x', 'https://partner.test/x?ref=1', true)
  `);
});

after(async () => {
  if (bookingIds.length > 0) {
    await db.execute(sql`DELETE FROM affiliate_booking_requests WHERE service_booking_id IN (${idList(bookingIds)})`);
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id IN (${idList(bookingIds)})`);
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id IN (${idList(bookingIds)})`);
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id IN (${idList(bookingIds)})`);
    await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${idList(bookingIds)})`);
  }
  if (itemIds.length > 0) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id IN (${idList(itemIds)})`);
  }
  if (tripIds.length > 0) {
    await db.execute(sql`DELETE FROM trips WHERE id IN (${idList(tripIds)})`);
  }
  if (productIds.length > 0) {
    await db.execute(sql`DELETE FROM affiliate_products WHERE id IN (${idList(productIds)})`);
  }
  if (partnerIds.length > 0) {
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id IN (${idList(partnerIds)})`);
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${realExpertServiceId}`);
  await db.execute(sql`DELETE FROM local_expert_forms WHERE id = ${realExpertFormId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${travelerId}, ${realExpertId})`);
  // The migration's OWN seeded rows (platform user/form/listing/settings/fee-band row) are never
  // deleted — they are production data this migration is meant to leave behind permanently.
});

test("F1: the seeder is idempotent — re-running migration 313 leaves exactly one row each", async () => {
  await pool.query(MIGRATION_SQL);

  const users = await db.execute(sql`SELECT id FROM users WHERE id = ${platformUserId}`);
  assert.equal(users.rows.length, 1);

  const forms = await db.execute(sql`SELECT id FROM local_expert_forms WHERE user_id = ${platformUserId}`);
  assert.equal(forms.rows.length, 1);

  const listings = await db.execute(sql`
    SELECT id FROM provider_services WHERE user_id = ${platformUserId} AND expert_offering_type_key = 'booking_concierge'
  `);
  assert.equal(listings.rows.length, 1);

  const settings = await db.execute(sql`
    SELECT setting_value FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}
  `);
  assert.equal(settings.rows.length, 1);
  assert.equal((settings.rows[0] as any).setting_value, platformUserId);

  const bands = await db.execute(sql`
    SELECT band_key FROM fee_bands WHERE band_key = 'platform_concierge_booking_listing_price'
  `);
  assert.equal(bands.rows.length, 1);
});

test("F1b: the platform account clears the SAME security gate every local expert clears — role local_expert, approved form", async () => {
  const row = await db.execute(sql`SELECT role, password FROM users WHERE id = ${platformUserId}`);
  assert.equal((row.rows[0] as any).role, "local_expert");
  assert.equal((row.rows[0] as any).password, null, "never a login — no password hash");

  const form = await db.execute(sql`SELECT status FROM local_expert_forms WHERE id = ${platformFormId}`);
  assert.equal((form.rows[0] as any).status, "approved");
});

test("F2: the platform account is visible on the LIVE gates for each of the 8 markets, through no new predicate", async () => {
  for (const city of OPERATING_MARKET_CITY_NAMES) {
    const scores = await leadRoutingService.scoreExperts({ destination: city });
    const platformScore = scores.find((s) => s.expertId === platformUserId);
    assert.ok(platformScore, `lead-routing scorer must return the platform account for ${city}`);
    assert.ok(
      platformScore!.destinationScore > 0,
      `destinationScore for ${city} must be > 0 — the platform's own destinations list should cover it`,
    );
  }

  // §13: the platform is not claimed to cover a market it doesn't. A destination outside the 8
  // scores its DESTINATION component 0 — no fabricated coverage.
  const outside = await leadRoutingService.scoreExperts({ destination: "Nairobi" });
  const platformOutside = outside.find((s) => s.expertId === platformUserId);
  assert.ok(platformOutside, "the scorer still returns the platform account (it is approved) — just unscored on destination");
  assert.equal(platformOutside!.destinationScore, 0);
});

test("F2b: static pin — no new isPlatform* bypass predicate was added to the two live gate files", () => {
  const routesSrc = readFileSync(join(REPO, "server", "routes.ts"), "utf8");
  const routingSrc = readFileSync(join(REPO, "server", "services", "lead-routing.service.ts"), "utf8");
  assert.ok(
    !/isPlatformConcierge|platformConciergeUserId|PLATFORM_CONCIERGE/i.test(routesSrc),
    "server/routes.ts must not gain a platform-concierge-specific branch — LD 51 lane F reuses the existing gate",
  );
  assert.ok(
    !/isPlatformConcierge|platformConciergeUserId|PLATFORM_CONCIERGE/i.test(routingSrc),
    "lead-routing.service.ts must not gain a platform-concierge-specific branch — LD 51 lane F reuses the existing scorer",
  );
});

test("F2c (LD 40): the platform account's row carries a claimed handle and resolves to /s/:handle, never /experts/:id", async () => {
  const row = await db.execute(sql`SELECT handle FROM users WHERE id = ${platformUserId}`);
  const handle = (row.rows[0] as any).handle as string | null;
  assert.ok(handle, "the platform account must have a claimed handle (LD 40)");
  const path = earnerProfilePath({ handle, id: platformUserId });
  assert.equal(path, `/s/${handle}`);
});

test("F6: the seeded destinations equal shared/operating-markets.ts's OPERATING_MARKET_CITY_NAMES", async () => {
  const row = await db.execute(sql`SELECT destinations FROM local_expert_forms WHERE id = ${platformFormId}`);
  const seeded = (row.rows[0] as any).destinations as string[];
  assert.deepEqual(
    [...seeded].sort(),
    [...OPERATING_MARKET_CITY_NAMES].sort(),
    "migration 313's hardcoded city list must equal the shared module's — the migration cannot import TS, so this test is the guard against drift",
  );
});

test("F5: a real expert with a matching specialty in the same city outranks the platform's floor row", async () => {
  const scores = await leadRoutingService.scoreExperts({ destination: "Kyoto", topic: "weddings" });
  const real = scores.find((s) => s.expertId === realExpertId);
  const platform = scores.find((s) => s.expertId === platformUserId);
  assert.ok(real, "the real expert must be scored");
  assert.ok(platform, "the platform account must be scored");
  assert.ok(
    real!.totalScore > platform!.totalScore,
    `real expert (${real!.totalScore}) must outrank the platform's floor row (${platform!.totalScore})`,
  );
  assert.equal(platform!.specialtyScore, 0, "the platform's seeded specialties are [] — no specialty credit");
});

test("F3: a hand-off from a booking of the PLATFORM listing births requests with expert_id NULL (pooled)", async () => {
  const tripId = await makeTrip();
  const conciergeItemId = await makeItem({ tripId, providerServiceId: platformListingId });
  const partnerItemId = await makeItem({ tripId, affiliateProductId: productIds[0] });

  const bookingId = await makeBooking({
    serviceId: platformListingId,
    providerId: platformUserId,
    itineraryItemId: conciergeItemId,
    totalAmount: "25.00",
    platformFee: "25.00",
    providerEarnings: "0.00",
  });

  const result = await createHandoffRequestsForBooking(bookingId);
  assert.equal(result.handedOff, 1);
  assert.equal(result.requestIds.length, 1);

  const rows = await db.execute(sql`
    SELECT expert_id, trip_id, itinerary_item_id, service_booking_id
    FROM affiliate_booking_requests WHERE service_booking_id = ${bookingId}
  `);
  assert.equal(rows.rows.length, 1);
  assert.equal((rows.rows[0] as any).expert_id, null, "a platform-owned listing's hand-off must be POOLED, not assigned to the platform account");
  assert.equal((rows.rows[0] as any).itinerary_item_id, partnerItemId);
});

test("F3b (contrast): a hand-off from a REAL expert's listing still stamps expertId to the owner", async () => {
  const tripId = await makeTrip();
  const conciergeItemId = await makeItem({ tripId, providerServiceId: realExpertServiceId });
  await makeItem({ tripId, affiliateProductId: productIds[0] });

  const bookingId = await makeBooking({
    serviceId: realExpertServiceId,
    providerId: realExpertId,
    itineraryItemId: conciergeItemId,
    totalAmount: "150.00",
    platformFee: "37.50",
    providerEarnings: "112.50",
  });

  const result = await createHandoffRequestsForBooking(bookingId);
  assert.equal(result.handedOff, 1);

  const rows = await db.execute(sql`
    SELECT expert_id FROM affiliate_booking_requests WHERE service_booking_id = ${bookingId}
  `);
  assert.equal((rows.rows[0] as any).expert_id, realExpertId);
});

test("F4: completion of a platform-owned-listing booking mints NO expert share — platform_revenue keeps the full fee", async () => {
  const bookingId = await makeBooking({
    serviceId: platformListingId,
    providerId: platformUserId,
    itineraryItemId: null,
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    conciergeFeeExpertShare: "15.00",
  });

  const booking = await storage.getServiceBooking(bookingId);
  assert.ok(booking);

  const applied = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(applied, true);

  const expertEarnings = await db.execute(sql`SELECT amount::numeric AS amount FROM expert_earnings WHERE reference_id = ${bookingId}`);
  const revenue = await db.execute(sql`
    SELECT gross_amount::numeric AS gross, platform_fee::numeric AS platform_fee, provider_earnings::numeric AS provider_earnings
    FROM platform_revenue WHERE source_id = ${bookingId} AND gross_amount >= 0
  `);

  // The base 75/25 split still mints ordinarily (out of this ruling's scope — LD 51 lane F only
  // skips the CONCIERGE-FEE re-split); what must NOT happen is the $15 concierge share folding in.
  assert.equal(revenue.rows.length, 1);
  assert.equal(Number((revenue.rows[0] as any).platform_fee), 25, "the concierge fee's expert share must NOT be subtracted from platformFee for a platform-owned listing");
  assert.equal(Number((revenue.rows[0] as any).provider_earnings), 75, "providerEarnings must NOT gain the $15 concierge share");
  assert.equal(expertEarnings.rows.length, 1, "the ordinary base-split mint (unrelated to LD 51 lane F) still writes one expert_earnings row");
  assert.equal(Number((expertEarnings.rows[0] as any).amount), 75, "it must not carry the $15 concierge share on top");
});

test("isPlatformConciergeUserId: true for the platform account, false for a real expert and for null", async () => {
  assert.equal(await isPlatformConciergeUserId(platformUserId), true);
  assert.equal(await isPlatformConciergeUserId(realExpertId), false);
  assert.equal(await isPlatformConciergeUserId(null), false);
  assert.equal(await isPlatformConciergeUserId(undefined), false);
});
