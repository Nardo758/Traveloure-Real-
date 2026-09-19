/**
 * A QUOTE IS LINKED TO THE PLAN IT WAS ASKED FROM — behavioural proof of ledger
 * `2026-09-19-quote-plan-link` (migration 314; CLAUDE.md Locked Decision 49, amended).
 *
 *   P1  a REQUEST with a valid `tripId` stores it on the row (server-verified, §14).
 *   P2  a `tripId` naming ANOTHER user's trip ⇒ ONE 404 (LD 40), and NOTHING is stored — not the
 *       trip link, not the quote at all.
 *   P3  an `itineraryItemId` naming an item on a DIFFERENT trip, or an item on the right trip but
 *       for a DIFFERENT listing, is REFUSED — never silently dropped.
 *   P4  ACCEPT copies `trip_id` and `booking_details.itineraryItemId` onto the booking (the SAME
 *       spellings the cart rail uses) inside the existing atomic claim/mint, and the linked item is
 *       routed `in_planning -> ready_for_checkout` — carrying no `booking_id` yet, because the item
 *       is not purchased until the EXISTING paid promotion says so.
 *   P5  paying that booking through the #988 quote-born arm, with an ACTIVE Trip Pass on the linked
 *       plan, reads `coveredByTripPass === true` and charges the traveler service fee at 0 — the
 *       SAME waiver mechanism Q13 (`quote-born-charge.db.test.ts`) proves, reached here through the
 *       real request(tripId) -> issue -> accept rails rather than a raw-SQL trip_id stamp.
 *   P6  the EXISTING paid promotion (`markItemPurchased`, `item-routing.service.ts` — no new call
 *       site) flips the linked item to `purchased` and stamps its `booking_id`, because P4 already
 *       left the item exactly where that function requires it (`routing_status = 'ready_for_checkout'`).
 *   P7  a quote asked with NO plan in mind is byte-identical to today: no `trip_id` on the booking,
 *       no `itineraryItemId` key in `booking_details`, no routing touched, the fee charged in full.
 *
 * NO FEE LITERALS (§8): P5/P7's expected fee is read off the `fee_bands` row the resolver itself
 * reads. DISPOSABLE DB ONLY — every row this file writes it deletes in after(). No Stripe key, no
 * network (the dummy key below only satisfies `quote-charge.service.ts`'s import-time chain).
 *
 * Run solo: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 \
 *   npx tsx --test server/__tests__/quote-plan-link.db.test.ts
 */

// `booking-completion.service.ts` (imported by `quote-charge.service.ts`) reaches
// `stripe.service.ts`, which constructs its client at IMPORT time and throws keyless — the
// `quote-born-charge.db.test.ts` technique, verbatim. No Stripe call is made anywhere in this file.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_quote_plan_link_suite";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "../db";

// Dynamic imports, deliberately AFTER the env guard above (see the header comment).
const { acceptQuote, issueQuote, requestQuote } = await import("../services/service-quotes.service");
const { claimQuoteBornBooking, resolveQuoteCharge } = await import("../services/quote-charge.service");
const { markItemPurchased } = await import("../services/item-routing.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `qpl-${RUN}-prov`,
  traveler: `qpl-${RUN}-trav`,
  other: `qpl-${RUN}-other`,
};
const createdServiceIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdTripIds: string[] = [];
const createdItemIds: string[] = [];
let categoryId: string;

// ── Disposable-DB guard (the service-quotes / quote-born-charge posture) ───────────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[quote-plan-link] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function resolveCategoryId(key: string): Promise<string> {
  const found = await db.execute(sql`SELECT id FROM service_categories WHERE category_key = ${key} LIMIT 1`);
  const existing = (found.rows[0] as any)?.id as string | undefined;
  if (existing) return existing;
  const id = `qpl-${RUN}-cat-${key}`;
  const inserted = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, category_key, commission_band_key)
    SELECT ${id}, ${`QPL ${RUN} ${key}`}, ${`qpl-${RUN}-${key}`}, ${key}, sc.commission_band_key
      FROM service_categories sc
     WHERE sc.commission_band_key IS NOT NULL
     LIMIT 1
    RETURNING id
  `);
  assert.ok(inserted.rows[0], `cannot create a disposable '${key}' category: taxonomy migrations not applied`);
  createdCategoryIds.push(id);
  return id;
}

/** A custom-quote listing: NULL price, request mode, approved + active — the D-30 fixture shape. */
async function makeQuoteListing(): Promise<string> {
  const id = `qpl-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, price_type, booking_mode,
                                   delivery_method, category_id, status, approval_status)
    VALUES (${id}, ${ids.provider}, ${`QPL listing ${RUN}`}, 'fixture', NULL, 'custom_quote', 'request',
            'in_person', ${categoryId}, 'active', 'approved')
  `);
  createdServiceIds.push(id);
  return id;
}

/** An ordinary (non-quote) listing — used only as P3's "wrong listing" fixture. */
async function makeOtherListing(): Promise<string> {
  const id = `qpl-${RUN}-other-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, category_id, status, approval_status)
    VALUES (${id}, ${ids.provider}, ${`QPL other listing ${RUN}`}, 'fixture', '50.00', ${categoryId}, 'active', 'approved')
  `);
  createdServiceIds.push(id);
  return id;
}

async function makeTrip(ownerId: string): Promise<string> {
  const id = `qpl-${RUN}-trip-${crypto.randomUUID().slice(0, 8)}`;
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${id}, ${ownerId}, ${`QPL trip ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto, Japan')
  `);
  createdTripIds.push(id);
  return id;
}

async function makeItem(opts: { tripId: string; providerServiceId?: string | null; routingStatus?: string }): Promise<string> {
  const id = `qpl-${RUN}-item-${crypto.randomUUID().slice(0, 8)}`;
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status, provider_service_id)
    VALUES (${id}, ${opts.tripId}, 'QPL fixture item', 1, ${opts.routingStatus ?? "in_planning"}, ${opts.providerServiceId ?? null})
  `);
  createdItemIds.push(id);
  return id;
}

async function itemRow(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM itinerary_items WHERE id = ${id}`);
  return r.rows[0];
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM service_bookings WHERE id = ${id}`);
  return r.rows[0];
}

async function quoteRow(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM service_quotes WHERE id = ${id}`);
  return r.rows[0];
}

async function quoteCountForService(serviceId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM service_quotes WHERE service_id = ${serviceId}`);
  return (r.rows[0] as any).n as number;
}

function ok<T extends { ok: boolean }>(r: T, label: string): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, `${label}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}
function refused<T extends { ok: boolean }>(r: T, label: string): Extract<T, { ok: false }> {
  assert.equal(r.ok, false, `${label}: expected a refusal, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: false }>;
}

/** Request -> issue -> accept, the REAL rails, ending in the unpaid quote-born booking under test. */
async function acceptedQuoteBooking(opts: {
  serviceId: string;
  amountCents: number;
  tripId?: string;
  itineraryItemId?: string;
}): Promise<{ quoteId: string; bookingId: string }> {
  const requested = await requestQuote({
    serviceId: opts.serviceId,
    travelerId: ids.traveler,
    ...(opts.tripId ? { tripId: opts.tripId } : {}),
    ...(opts.itineraryItemId ? { itineraryItemId: opts.itineraryItemId } : {}),
  });
  assert.equal(requested.ok, true, JSON.stringify(requested));
  const quoteId = (requested as any).quote.id as string;
  const issued = await issueQuote({ quoteId, actorUserId: ids.provider, amountCents: opts.amountCents });
  assert.equal(issued.ok, true, JSON.stringify(issued));
  const accepted = await acceptQuote({ quoteId, travelerId: ids.traveler });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  return { quoteId, bookingId: (accepted as any).bookingId as string };
}

before(async () => {
  await assertDisposableDb();
  categoryId = await resolveCategoryId("av_tech");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`qpl-${RUN}-prov@t.test`}, 'QPL', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`qpl-${RUN}-trav@t.test`}, 'QPL', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.other}, ${`qpl-${RUN}-other@t.test`}, 'QPL', 'Bystander')
  `);
});

after(async () => {
  if (createdItemIds.length > 0) {
    await db.execute(sql`DELETE FROM cart_items WHERE itinerary_item_id IN (${sql.join(createdItemIds.map((i) => sql`${i}`), sql`, `)})`).catch(() => {});
    await db.execute(sql`DELETE FROM itinerary_items WHERE id IN (${sql.join(createdItemIds.map((i) => sql`${i}`), sql`, `)})`).catch(() => {});
  }
  for (const tid of createdTripIds) {
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id = ${tid}`).catch(() => {});
  }
  for (const sid of createdServiceIds) {
    const bookings = await db.execute(sql`SELECT id FROM service_bookings WHERE service_id = ${sid}`);
    for (const b of bookings.rows as any[]) {
      await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${b.id}`).catch(() => {});
    }
    await db.execute(sql`DELETE FROM service_quotes WHERE service_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE service_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${sid}`).catch(() => {});
  }
  if (createdTripIds.length > 0) {
    await db.execute(sql`DELETE FROM trips WHERE id IN (${sql.join(createdTripIds.map((i) => sql`${i}`), sql`, `)})`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler}, ${ids.other})`).catch(() => {});
  for (const id of createdCategoryIds) {
    await db.execute(sql`DELETE FROM service_categories WHERE id = ${id}`).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════

test("P1 · a REQUEST with a valid tripId stores it on the row", async () => {
  const serviceId = await makeQuoteListing();
  const tripId = await makeTrip(ids.traveler);

  const r = ok(await requestQuote({ serviceId, travelerId: ids.traveler, tripId }), "request with tripId");
  assert.equal(r.quote.tripId, tripId);

  const row = await quoteRow(r.quote.id);
  assert.equal(row.trip_id, tripId);
  assert.equal(row.itinerary_item_id, null, "no item was named");
});

test("P2 · another user's trip ⇒ ONE 404 and NOTHING stored", async () => {
  const serviceId = await makeQuoteListing();
  const othersTrip = await makeTrip(ids.other);
  const before = await quoteCountForService(serviceId);

  const r = refused(
    await requestQuote({ serviceId, travelerId: ids.traveler, tripId: othersTrip }),
    "another user's trip",
  );
  assert.equal(r.status, 404);
  assert.equal(r.code, "trip_not_found");

  assert.equal(await quoteCountForService(serviceId), before, "no quote row was created at all");
});

test("P3 · an item on a different trip, or for a different listing, is REFUSED", async () => {
  const serviceId = await makeQuoteListing();
  const otherServiceId = await makeOtherListing();

  // Case A: the item is on a DIFFERENT trip than the one named.
  const tripA = await makeTrip(ids.traveler);
  const tripB = await makeTrip(ids.traveler);
  const itemOnTripB = await makeItem({ tripId: tripB, providerServiceId: serviceId });
  const wrongTrip = refused(
    await requestQuote({ serviceId, travelerId: ids.traveler, tripId: tripA, itineraryItemId: itemOnTripB }),
    "item on a different trip",
  );
  assert.equal(wrongTrip.status, 400);
  assert.equal(wrongTrip.code, "item_not_on_plan");

  // Case B: the item is on the RIGHT trip but names a DIFFERENT listing.
  const tripC = await makeTrip(ids.traveler);
  const itemForOtherService = await makeItem({ tripId: tripC, providerServiceId: otherServiceId });
  const wrongService = refused(
    await requestQuote({ serviceId, travelerId: ids.traveler, tripId: tripC, itineraryItemId: itemForOtherService }),
    "item for a different listing",
  );
  assert.equal(wrongService.status, 400);
  assert.equal(wrongService.code, "item_not_on_plan");

  assert.equal(await quoteCountForService(serviceId), 0, "neither refusal stored a quote");
});

test("P4 · accept copies trip_id + itineraryItemId onto the booking, and routes the item to ready_for_checkout (no booking_id yet)", async () => {
  const serviceId = await makeQuoteListing();
  const tripId = await makeTrip(ids.traveler);
  const itemId = await makeItem({ tripId, providerServiceId: serviceId });

  const { bookingId } = await acceptedQuoteBooking({ serviceId, amountCents: 42000, tripId, itineraryItemId: itemId });

  const booking = await bookingRow(bookingId);
  assert.equal(booking.trip_id, tripId, "the SAME spelling the cart rail uses (payments.routes.ts:1976)");
  assert.equal(
    (booking.booking_details ?? {}).itineraryItemId,
    itemId,
    "the SAME spelling the cart rail uses (payments.routes.ts:1997)",
  );

  const item = await itemRow(itemId);
  assert.equal(item.routing_status, "ready_for_checkout", "in_planning -> ready_for_checkout, LD 39");
  assert.equal(item.booking_id, null, "not purchased yet — that is the EXISTING paid promotion's job (P6)");
});

test("P5 · a Trip Pass on the linked plan WAIVES the fee, reached through the REAL request(tripId) -> issue -> accept rails", async () => {
  const serviceId = await makeQuoteListing();
  const tripId = await makeTrip(ids.traveler);
  await db.execute(sql`
    INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source_payment_id, allowances_snapshot)
    VALUES (${`qpl-${RUN}-tp`}, ${tripId}, 'trip_pass', 'active', ${`pi_qpl_tp_${RUN}`}, '{}'::jsonb)
  `);

  const { bookingId } = await acceptedQuoteBooking({ serviceId, amountCents: 80000, tripId }); // no item — the waiver only needs trip_id

  const p = ok(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  assert.equal(p.coveredByTripPass, true);
  assert.equal(p.travelerServiceFee.waived, true);
  assert.equal(p.travelerServiceFee.waiverBasis, "trip_pass");
  assert.equal(p.travelerServiceFee.charged, 0, "a covered line charges NO fee — the same mechanism Q13 proves");
  assert.ok(p.travelerServiceFee.wouldHaveBeen > 0, "wouldHaveBeen states the REAL band-priced amount");

  await claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee });
  const claimed = await bookingRow(bookingId);
  const stamped = (claimed.booking_details ?? {}).travelerServiceFee;
  assert.equal(stamped.waived, true);
  assert.equal(stamped.waiverBasis, "trip_pass");
  assert.equal(stamped.charged, 0, "the −X fee_waiver ledger leg reads THIS number");
});

test("P6 · the EXISTING paid promotion flips the linked item to purchased and stamps booking_id — no new call site", async () => {
  const serviceId = await makeQuoteListing();
  const tripId = await makeTrip(ids.traveler);
  const itemId = await makeItem({ tripId, providerServiceId: serviceId });
  const { bookingId } = await acceptedQuoteBooking({ serviceId, amountCents: 15000, tripId, itineraryItemId: itemId });

  // Pre-condition P4 already proved: routing_status = 'ready_for_checkout'. This IS
  // `markItemPurchased`'s own guard (item-routing.service.ts) — no quote-specific branch exists.
  const flip = await markItemPurchased(itemId, bookingId);
  assert.equal(flip.flipped, true);

  const item = await itemRow(itemId);
  assert.equal(item.routing_status, "purchased");
  assert.equal(item.booking_id, bookingId);
});

test("P7 · a quote asked with NO plan in mind is byte-identical to today", async () => {
  const serviceId = await makeQuoteListing();
  const { bookingId } = await acceptedQuoteBooking({ serviceId, amountCents: 30000 }); // no tripId, no item

  const booking = await bookingRow(bookingId);
  assert.equal(booking.trip_id, null, "no writer sets trip_id on an unlinked quote-born booking");
  assert.equal("itineraryItemId" in (booking.booking_details ?? {}), false, "no key was planted");

  const p = ok(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  assert.equal(p.coveredByTripPass, false, "no trip_id on the row ⇒ never covered");
  assert.equal(p.travelerServiceFee.waived, false);
  assert.equal(
    p.travelerServiceFee.charged,
    p.travelerServiceFee.wouldHaveBeen,
    "not covered ⇒ the full fee rides the charge, exactly as before this lane",
  );
});
