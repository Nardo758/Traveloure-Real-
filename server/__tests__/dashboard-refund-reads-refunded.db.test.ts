/**
 * dashboard-refund-reads-refunded.db.test.ts — R163: a refund issued from the STRIPE DASHBOARD reads
 * "Refunded", through the refund reconciliation rule (ledger `2026-09-27-dashboard-refund-reads-refunded`;
 * decision-maker ruled Sep 27, 2026; supersedes #1288's leave-for-human reading for the LABEL).
 *
 * THE DEFECT (status-trace gap G4). `charge.refunded` for a refund our code did not issue changes no
 * `service_bookings.status` — #1288 (`2026-09-24-out-of-band-refund-blocks-mint`) only stamps
 * `booking_details.outOfBandRefund` and holds the earnings. So an item whose money went back to the
 * traveler still read "Booked" on the slip, the Trip Card and My Bookings.
 *
 * THE RULE. `outOfBandRefundCoversShare` (server/services/booking-charge-share.ts): the stamp's
 * cumulative cents against every still-live share on the PaymentIntent (`bookingChargeShare`, the
 * drift job's own per-row derivation). Covered ⇒ the DTO carries `refundedOutOfBand: true` and the
 * ONE shared reading `itemBookingLabelStatus` reads it as `refunded`. A partial refund never does.
 *
 * Proves against a real database, stamping through the REAL #1288 writer (`recordOutOfBandRefund`)
 * and reading the REAL plancard assembler, the admin kind count and the client's ONE reading:
 *   D1. a FULL dashboard refund on a one-booking payment ⇒ the item reads "Refunded" (no `booking`,
 *       `endedBooking.refundedOutOfBand`), the Purchases row reads refunded, the kind count is not
 *       `included` — and `service_bookings.status` is STILL `confirmed` (label only, no status write).
 *   D2. a PARTIAL dashboard refund ⇒ still "Booked".
 *   D3. two bookings on one payment, a refund equal to ONE share ⇒ NEITHER reads refunded (§13:
 *       Stripe does not say which); the whole charge refunded ⇒ BOTH do.
 *   D4. a sibling our own rail already refunded + a dashboard refund of the remaining share ⇒ the
 *       remaining booking reads refunded.
 *   D5. an admin CLEAR of the stamp ⇒ back to "Booked".
 *   D6. the refund lands while the booking is still `payment_pending` ⇒ it reads "Refunded", never
 *       "Payment processing" — the flag outranks every non-final status.
 *   H1. (needs the running app, as CI's suite-server-tests job provides) a SIGNED `charge.refunded`
 *       delivered to the platform endpoint flips the label end to end: `GET /api/my-bookings` carries
 *       `refundedOutOfBand` and the plancard reads "Refunded"; a partial one flips nothing.
 *   H2. the traveler's cancel and dispute rails refuse a fully dashboard-refunded booking with a 409
 *       `refunded_out_of_band` BEFORE any write or Stripe call (§14 — the hidden button is not the
 *       guard); a partial refund is not refused that way.
 *   H3. the same for a flagged `payment_pending` booking, read through My Bookings; and, because a
 *       Stripe call cannot be seen from outside the app, the source the app was built from is pinned
 *       so each refusal returns before the handler's first refund, ledger or status write.
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test --test-force-exit server/__tests__/dashboard-refund-reads-refunded.db.test.ts
 * H1 additionally needs JOURNEY_BASE_URL (the running app) and STRIPE_WEBHOOK_SECRET_TEST.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";

const { db, pool } = await import("../db");
const { sql, eq } = await import("drizzle-orm");
const { trips, users, itineraryItems, serviceBookings } = await import("../../shared/schema");
const { assembleTripPlan } = await import("../services/trip-plan.service");
const { recordOutOfBandRefund, clearOutOfBandRefund } = await import("../services/out-of-band-refund.service");
const { countItemKindsForTrip } = await import("../services/item-kind-counts.service");
const { itemBookingLabelStatus } = await import("../../shared/booking-visibility");
const { itemBookingState } = await import("../../client/src/lib/item-booking-state");
const { readPurchaseStatus } = await import("../../client/src/lib/purchase-status");

const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[dashboard-refund-reads-refunded] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let userId: string;
const createdUsers: string[] = [];
const createdTrips: string[] = [];
const createdIntents: string[] = [];

function newIntent(): string {
  const pi = `pi_r163_${RUN}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  createdIntents.push(pi);
  return pi;
}

async function seedTrip(owner: string): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId: owner,
    title: `Dashboard refund ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-11-01",
    endDate: "2026-11-03",
    numberOfTravelers: 2,
  } as any).returning();
  createdTrips.push(t.id);
  return t.id;
}

/** One purchased item bought through one CONFIRMED booking paid by `paymentIntentId`. */
async function seedBookedItem(
  tripId: string,
  owner: string,
  paymentIntentId: string,
  title: string,
  totalAmount = "120.00",
  status = "confirmed",
): Promise<{ itemId: string; bookingId: string }> {
  const [b] = await db.insert(serviceBookings).values({
    travelerId: owner,
    tripId,
    totalAmount,
    status,
    stripePaymentIntentId: paymentIntentId,
  } as any).returning();
  const [it] = await db.insert(itineraryItems).values({
    tripId,
    title,
    dayNumber: 1,
    origin: "traveler",
    routingStatus: "purchased",
    bookingId: b.id,
    status: "planned",
  } as any).returning();
  return { itemId: it.id, bookingId: b.id };
}

/** A refund made in the Stripe dashboard: no `metadata.source` tag. */
function dashboardRefund(amountCents: number) {
  return { id: `re_r163_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, amount: amountCents, metadata: {} };
}

async function activityOf(tripId: string, itemId: string): Promise<{ plan: any; a: any }> {
  const plan: any = await assembleTripPlan(tripId, "full");
  const a = (plan.days ?? []).flatMap((d: any) => d.activities ?? []).find((x: any) => x.id === itemId);
  assert.ok(a, "the item is on the assembled plan");
  return { plan, a };
}

async function rowStatus(bookingId: string): Promise<string> {
  const [row] = await db.select({ status: serviceBookings.status }).from(serviceBookings).where(eq(serviceBookings.id, bookingId));
  return row.status as string;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `r163-${RUN}@t.test` } as any).returning();
  userId = u.id;
  createdUsers.push(u.id);
});

after(async () => {
  for (const pi of createdIntents) {
    await db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'paymentIntentId' = ${pi}`).catch(() => {});
    await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
  }
  for (const t of createdTrips) {
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${t}`).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
    await db.delete(serviceBookings).where(eq(serviceBookings.tripId, t)).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  for (const u of createdUsers) await db.delete(users).where(eq(users.id, u)).catch(() => {});
  await pool.end().catch(() => {});
});

test("D1 a FULL dashboard refund reads Refunded everywhere, and the status column is not rewritten", async () => {
  const tripId = await seedTrip(userId);
  const pi = newIntent();
  const { itemId, bookingId } = await seedBookedItem(tripId, userId, pi, `Tea ceremony ${RUN}`);

  const recorded = await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_d1`, refunds: [dashboardRefund(12000)] });
  assert.deepEqual(recorded.bookingIds, [bookingId], "#1288 stamped the booking");

  const { plan, a } = await activityOf(tripId, itemId);
  assert.equal(a.booking, undefined, `a fully refunded item carries no \`booking\` (got ${JSON.stringify(a.booking)})`);
  assert.equal(a.endedBooking?.id, bookingId);
  assert.equal(a.endedBooking?.refundedOutOfBand, true, "the server says the dashboard refund covered the share");
  assert.equal(a.endedBooking?.status, "confirmed", "the DTO keeps the row's own status (§13)");
  assert.equal(itemBookingState(a), "refunded", "the slip / PlanCard row reads Refunded");

  const listed = (plan.bookings ?? []).find((b: any) => b.id === bookingId);
  assert.equal(readPurchaseStatus(itemBookingLabelStatus(listed))?.label, "refunded", "the Purchases row reads refunded");

  const byKind = await countItemKindsForTrip(tripId);
  assert.equal(byKind.included ?? 0, 0, `a refunded item is not counted included (got ${JSON.stringify(byKind)})`);

  assert.equal(await rowStatus(bookingId), "confirmed", "LABEL ONLY: service_bookings.status is not written");
});

test("D2 a PARTIAL dashboard refund still reads Booked", async () => {
  const tripId = await seedTrip(userId);
  const pi = newIntent();
  const { itemId, bookingId } = await seedBookedItem(tripId, userId, pi, `Kaiseki ${RUN}`);
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_d2`, refunds: [dashboardRefund(5000)] });

  const { a } = await activityOf(tripId, itemId);
  assert.equal(a.booking?.id, bookingId, "a partial refund leaves the booking attached");
  assert.equal(a.booking?.refundedOutOfBand, undefined);
  assert.equal(itemBookingState(a), "booked");
  assert.equal(await rowStatus(bookingId), "confirmed");
});

test("D3 two bookings on one payment: one share refunded says nothing; the whole charge says both", async () => {
  const tripId = await seedTrip(userId);
  const pi = newIntent();
  const one = await seedBookedItem(tripId, userId, pi, `Temple tour ${RUN}`, "120.00");
  const two = await seedBookedItem(tripId, userId, pi, `Sake tasting ${RUN}`, "80.00");

  const first = dashboardRefund(8000);
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_d3`, refunds: [first] });
  for (const x of [one, two]) {
    const { a } = await activityOf(tripId, x.itemId);
    assert.equal(itemBookingState(a), "booked", "Stripe does not say which booking a partial refund was for (§13)");
  }

  // Stripe reports the charge's refunds cumulatively: the second delivery lists both.
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_d3`, refunds: [first, dashboardRefund(12000)] });
  for (const x of [one, two]) {
    const { a } = await activityOf(tripId, x.itemId);
    assert.equal(itemBookingState(a), "refunded", "the whole charge refunded covers every share");
  }
});

test("D4 a sibling our rail refunded + a dashboard refund of the rest reads the rest Refunded", async () => {
  const tripId = await seedTrip(userId);
  const pi = newIntent();
  const one = await seedBookedItem(tripId, userId, pi, `Bamboo walk ${RUN}`, "120.00");
  const two = await seedBookedItem(tripId, userId, pi, `Cooking class ${RUN}`, "80.00");
  // Our own refund rail's end state for `one` (its Stripe refund carries metadata.source, so it is
  // never in the out-of-band cents).
  await db.update(serviceBookings).set({ status: "refunded" } as any).where(eq(serviceBookings.id, one.bookingId));
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_d4`, refunds: [dashboardRefund(8000)] });

  const { a } = await activityOf(tripId, two.itemId);
  assert.equal(itemBookingState(a), "refunded");
  assert.equal(await rowStatus(two.bookingId), "confirmed");
});

test("D5 an admin CLEAR of the stamp reads Booked again", async () => {
  const tripId = await seedTrip(userId);
  const pi = newIntent();
  const { itemId, bookingId } = await seedBookedItem(tripId, userId, pi, `Onsen ${RUN}`);
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_d5`, refunds: [dashboardRefund(12000)] });
  assert.equal(itemBookingState((await activityOf(tripId, itemId)).a), "refunded");

  const cleared = await clearOutOfBandRefund({ bookingId, actorId: userId, note: "goodwill refund, seller still paid" });
  assert.equal(cleared.cleared, true);
  assert.equal(itemBookingState((await activityOf(tripId, itemId)).a), "booked");
});

test("D6 a full dashboard refund on a payment_pending booking reads Refunded, NOT Payment processing", async () => {
  const tripId = await seedTrip(userId);
  const pi = newIntent();
  // Authorized (the PI is stamped) but not yet promoted: the `charge.refunded` arrives first.
  const { itemId, bookingId } = await seedBookedItem(tripId, userId, pi, `Night market ${RUN}`, "120.00", "payment_pending");
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_d6`, refunds: [dashboardRefund(12000)] });

  const { plan, a } = await activityOf(tripId, itemId);
  assert.equal(a.endedBooking?.refundedOutOfBand, true);
  assert.equal(a.endedBooking?.status, "payment_pending", "the row's own status is untouched");
  assert.equal(itemBookingState(a), "refunded", "the refund flag takes precedence over payment_pending");
  const listed = (plan.bookings ?? []).find((b: any) => b.id === bookingId);
  assert.equal(readPurchaseStatus(itemBookingLabelStatus(listed))?.label, "refunded", "never 'Prepared · awaiting purchase'");
  assert.equal(await rowStatus(bookingId), "payment_pending", "LABEL ONLY: no status write");
});

test("H1 a SIGNED charge.refunded through the platform endpoint flips the label end to end", async (t) => {
  const baseUrl = process.env.JOURNEY_BASE_URL;
  const secret = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  if (!baseUrl || !secret) {
    t.skip("needs the running app (JOURNEY_BASE_URL) and STRIPE_WEBHOOK_SECRET_TEST — CI's suite-server-tests job sets both");
    return;
  }
  assert.notEqual(process.env.NODE_ENV, "production");

  // A real traveler account on the running app, so My Bookings is read through its own route.
  const email = `r163-h1-${RUN}@t.test`;
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: `R163-${RUN}-pass!`, firstName: "R163", lastName: "Traveler" }),
  });
  const regText = await reg.text();
  assert.equal(reg.status, 201, regText);
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const traveler = (JSON.parse(regText) as any).user.id as string;
  createdUsers.push(traveler);

  const tripId = await seedTrip(traveler);
  const fullPi = newIntent();
  const partialPi = newIntent();
  const full = await seedBookedItem(tripId, traveler, fullPi, `Geisha show ${RUN}`);
  const partial = await seedBookedItem(tripId, traveler, partialPi, `Tofu lunch ${RUN}`);

  async function deliver(pi: string, amountCents: number): Promise<void> {
    const eventId = `evt_r163_${crypto.randomUUID().replaceAll("-", "")}`;
    const chargeId = `ch_r163_${crypto.randomUUID().replaceAll("-", "")}`;
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: chargeId,
          object: "charge",
          payment_intent: pi,
          // R163 amendment: the webhook refuses a charge with no trustworthy cents; a real charge has its amount.
          amount: amountCents,
          amount_refunded: amountCents,
          currency: "usd",
          refunds: { data: [dashboardRefund(amountCents)], has_more: false },
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: secret! });
    try {
      const res = await fetch(`${baseUrl}/api/bookings/webhooks/stripe`, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": signature },
        body: payload,
      });
      assert.equal(res.status, 200, await res.text());
    } finally {
      await db.execute(sql`DELETE FROM webhook_events WHERE stripe_event_id = ${eventId}`).catch(() => {});
    }
  }

  await deliver(fullPi, 12000);
  await deliver(partialPi, 4000);

  const res = await fetch(`${baseUrl}/api/my-bookings`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const rows = (await res.json()) as any[];
  const fullRow = rows.find((r) => r.id === full.bookingId);
  const partialRow = rows.find((r) => r.id === partial.bookingId);
  assert.equal(fullRow?.status, "confirmed", "My Bookings keeps the row's own status");
  assert.equal(fullRow?.refundedOutOfBand, true, "My Bookings carries the server's refund answer");
  assert.equal(itemBookingLabelStatus(fullRow), "refunded", "…which the page reads as Refunded");
  assert.equal(partialRow?.refundedOutOfBand, undefined, "a partial refund carries no flag");
  assert.equal(itemBookingLabelStatus(partialRow), "confirmed");

  assert.equal(itemBookingState((await activityOf(tripId, full.itemId)).a), "refunded");
  assert.equal(itemBookingState((await activityOf(tripId, partial.itemId)).a), "booked");
});

test("H2 cancel and dispute refuse a fully dashboard-refunded booking with a 409 and write nothing", async (t) => {
  const baseUrl = process.env.JOURNEY_BASE_URL;
  if (!baseUrl) {
    t.skip("needs the running app (JOURNEY_BASE_URL) — CI's suite-server-tests job sets it");
    return;
  }
  const email = `r163-h2-${RUN}@t.test`;
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: `R163-${RUN}-pass!`, firstName: "R163", lastName: "Canceller" }),
  });
  const regText = await reg.text();
  assert.equal(reg.status, 201, regText);
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const traveler = (JSON.parse(regText) as any).user.id as string;
  createdUsers.push(traveler);

  const tripId = await seedTrip(traveler);
  const pi = newIntent();
  const { bookingId } = await seedBookedItem(tripId, traveler, pi, `Kimono rental ${RUN}`);
  // The #1288 writer exactly as the webhook arm calls it, with the whole charge refunded.
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_h2`, refunds: [dashboardRefund(12000)] });

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

  const cancel = await post(`/api/bookings/${bookingId}/cancel`, { reason: "changed plans" });
  const cancelBody = (await cancel.json()) as any;
  assert.equal(cancel.status, 409, JSON.stringify(cancelBody));
  assert.equal(cancelBody.error, "refunded_out_of_band");

  const dispute = await post(`/api/bookings/${bookingId}/dispute`, { reason: "never happened" });
  const disputeBody = (await dispute.json()) as any;
  assert.equal(dispute.status, 409, JSON.stringify(disputeBody));
  assert.equal(disputeBody.error, "refunded_out_of_band");

  const [row] = await db
    .select({
      status: serviceBookings.status,
      meta: serviceBookings.bookingMetadata,
      cancelledAt: serviceBookings.cancelledAt,
    })
    .from(serviceBookings)
    .where(eq(serviceBookings.id, bookingId));
  assert.equal(row.status, "confirmed", "no status was written");
  assert.equal((row.meta as any)?.disputeReason, undefined, "the dispute wrote nothing");
  assert.equal(row.cancelledAt ?? null, null, "the cancel wrote nothing");
  const refunds = await db.execute(sql`SELECT count(*)::int AS n FROM refunds WHERE stripe_payment_intent_id = ${pi}`);
  assert.equal((refunds.rows[0] as any).n, 0, "no second refund was attempted or recorded");

  // Control: a PARTIAL dashboard refund leaves the cancel rail alone (it reaches the ordinary path,
  // which on this stub key cannot reach Stripe — so only the refusal's ABSENCE is asserted).
  const partialPi = newIntent();
  const partial = await seedBookedItem(tripId, traveler, partialPi, `Tea set ${RUN}`);
  await recordOutOfBandRefund({ paymentIntentId: partialPi, chargeId: `ch_${RUN}_h2p`, refunds: [dashboardRefund(3000)] });
  const partialDispute = await post(`/api/bookings/${partial.bookingId}/dispute`, { reason: "late" });
  const partialBody = (await partialDispute.json()) as any;
  assert.notEqual(partialBody.error, "refunded_out_of_band", "a partial refund is not refused as refunded");
});

test("H3 a flagged payment_pending booking: My Bookings reads Refunded, and cancel/dispute are refused before any Stripe call", async (t) => {
  const baseUrl = process.env.JOURNEY_BASE_URL;
  if (!baseUrl) {
    t.skip("needs the running app (JOURNEY_BASE_URL) — CI's suite-server-tests job sets it");
    return;
  }
  const email = `r163-h3-${RUN}@t.test`;
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: `R163-${RUN}-pass!`, firstName: "R163", lastName: "Pending" }),
  });
  const regText = await reg.text();
  assert.equal(reg.status, 201, regText);
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const traveler = (JSON.parse(regText) as any).user.id as string;
  createdUsers.push(traveler);

  const tripId = await seedTrip(traveler);
  const pi = newIntent();
  const { bookingId } = await seedBookedItem(tripId, traveler, pi, `Pottery class ${RUN}`, "120.00", "payment_pending");
  await recordOutOfBandRefund({ paymentIntentId: pi, chargeId: `ch_${RUN}_h3`, refunds: [dashboardRefund(12000)] });

  const res = await fetch(`${baseUrl}/api/my-bookings`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const row = ((await res.json()) as any[]).find((r) => r.id === bookingId);
  assert.equal(row?.status, "payment_pending");
  assert.equal(row?.refundedOutOfBand, true);
  assert.equal(itemBookingLabelStatus(row), "refunded", "My Bookings reads Refunded, not Payment pending");

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  for (const path of [`/api/bookings/${bookingId}/cancel`, `/api/bookings/${bookingId}/dispute`]) {
    const r = await post(path, { reason: "r163" });
    const body = (await r.json()) as any;
    assert.equal(r.status, 409, `${path}: ${JSON.stringify(body)}`);
    assert.equal(body.error, "refunded_out_of_band", path);
  }
  assert.equal(await rowStatus(bookingId), "payment_pending", "nothing was written");
  const refunds = await db.execute(sql`SELECT count(*)::int AS n FROM refunds WHERE stripe_payment_intent_id = ${pi}`);
  assert.equal((refunds.rows[0] as any).n, 0, "no refund row");

  // NO STRIPE CALL, structurally: in each handler the refusal returns before the first line that can
  // reach Stripe or move the ledger. (Over HTTP a Stripe call cannot be observed from outside the
  // process, so the order is pinned in the source the app was built from.)
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const ROOT = resolve(import.meta.dirname, "../..");
  const routes = readFileSync(resolve(ROOT, "server/routes.ts"), "utf8");
  const cancelStart = routes.indexOf('app.post("/api/bookings/:id/cancel"');
  const cancel = routes.slice(cancelStart, routes.indexOf("\n  app.", cancelStart + 10));
  const cancelGuard = cancel.indexOf("REFUNDED_OUT_OF_BAND_REFUSAL })");
  assert.ok(cancelGuard > 0, "the cancel handler carries the refusal");
  for (const effect of ["refundServiceBooking(", "reversePlatformRevenueForBooking(", "reverseEarningsForBooking(", "updateServiceBookingStatus("]) {
    const at = cancel.indexOf(effect);
    assert.ok(at > cancelGuard, `cancel: the refusal precedes ${effect}`);
  }
  const bookingsRouter = readFileSync(resolve(ROOT, "server/routes/bookings.ts"), "utf8");
  const disputeStart = bookingsRouter.indexOf("router.post('/:id/dispute'");
  const dispute = bookingsRouter.slice(disputeStart, bookingsRouter.indexOf("\nrouter.", disputeStart + 10));
  const disputeGuard = dispute.indexOf("REFUNDED_OUT_OF_BAND_REFUSAL })");
  assert.ok(disputeGuard > 0, "the dispute handler carries the refusal");
  for (const effect of ["db.update(", "setBookingEarningsDispute("]) {
    const at = dispute.indexOf(effect);
    assert.ok(at > disputeGuard, `dispute: the refusal precedes ${effect}`);
  }
});
