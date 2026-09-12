/**
 * PS15 — BOOKING-BIRTH PROVENANCE (DECISIONS.md ruling 46).
 *
 * Ruling 41 states the checkout invariant as PROVENANCE, not transport: the ordering-1 capability is
 * gated on the platform itself having obtained the PaymentIntent id from Stripe as a verified actor,
 * and — the clause that does not move — "a CLIENT-supplied PaymentIntent id may never resolve or
 * stamp anything."
 *
 * ── THE PAIRING, and why this file exists next to the promotion suite ────────────────────────────
 * `checkout-payment-promotion.db.test.ts` **N17c** ("a CLIENT may not stamp a PaymentIntent onto an
 * unstamped claim") guards the **PROMOTION** side of that clause: a client id handed to
 * `promotePaidCheckout` resolves nothing and stamps nothing. This file guards the **BIRTH** side.
 *
 * They are not redundant, and N17c could never have caught PS15. `POST /api/bookings` parsed the
 * `.omit()`-based `insertServiceBookingSchema` off `req.body` and SPREAD it into
 * `createServiceBooking`, so a crafted request created a booking that ALREADY CARRIED its own
 * `stripe_payment_intent_id`. That is not a promotion — no promotion code runs, so no promotion
 * assertion fires — it is simply a row that looks authorized to every consumer keyed on that column:
 * the TTL sweep skips it (it is not an unstamped claim), `promotePaidCheckout` matches it, and the
 * drift job trusts it as linkage. N17c watches the door; PS15 came through the wall.
 *
 * B1–B3 prove the field is unreachable at birth, in all three layers (schema `.omit()`, storage
 * strip, route allowlist). B4/B5 prove the rows already on disk — which no fix can reach — surface
 * as the new `payment_provenance_unverified` drift classification, and that a legitimately
 * spine-written row does NOT (the discriminating half). B6 is the committed negative fixture for the
 * schema-posture follow-up (`#PS18`): the same fake privileged column, reachable under `.omit()` and
 * unreachable under `.pick()`.
 *
 * ── B7–B9, THE TWO HOLES THE SAME HANDLER STILL HAD (punchlist V-10/V-11; ledger
 * `2026-09-12-booking-birth-holes`) ──────────────────────────────────────────────────────────────
 * B6 pins the route's allowlist at five keys — and two of those five are FREE-FORM jsonb, so the
 * allowlist stops at the COLUMN boundary. **B7** is V-10: a body planting
 * `bookingDetails.travelerCharge` (the era discriminator the refund ceiling, the cancellation quote
 * and the checkout re-drive all branch on) and its server-authored family, stripped at the schema
 * (layer 1) and in `createServiceBookingAtomic` (layer 2). **B8** is the discriminating half, and
 * it is the reason the strip is NOT in `createServiceBooking`: that writer belongs to the checkout
 * claim, which COMPOSES `travelerCharge` server-side on every real purchase, and a blanket strip
 * would erase a genuine money fact from every checkout row while passing B7 perfectly. **B9** is
 * V-11: a listing that publishes no price no longer books at `0.00` — `resolveBuyAction` row 11
 * already rules that a priceless listing can only ever be REQUESTED, and the rail now consults the
 * ONE price predicate rather than rendering NULL as "free".
 *
 * NO FEE LITERALS (§8): B3's expected split is computed from a `fee_bands` row SELECTed at assertion
 * time via the same `resolveServiceOwnerShareRate` the route delegates to.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key and no network: the drift job's Stripe half is injected, as in the detection suite.
 *
 * Run solo: npx tsx --test server/__tests__/booking-birth-provenance.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
// STRIPE TEST MODE ONLY, and never actually called: the drift job's Stripe half is injected below
// and no assertion here touches the network. Same posture as the promotion and console-sigma
// suites — a live key is refused, not merely left unused.
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_birth_provenance_suite";
}
import { z } from "zod";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { pgTable, varchar, decimal } from "drizzle-orm/pg-core";
import { db } from "../db";
import { storage } from "../storage";
import { insertServiceBookingSchema, createBookingRequestSchema } from "@shared/schema";
import {
  SERVER_AUTHORED_BOOKING_DETAIL_KEYS,
  TRAVELER_CHARGE_SNAPSHOT_KEY,
  stripServerAuthoredBookingDetails,
} from "@shared/booking-details-admission";
import type { BuyRefusalReason } from "@shared/buy-action";
import { resolveServiceOwnerShareRate } from "../services/commission";
import { hasPublishedPrice } from "../services/buy-action-payload";
import { BALANCE_PAYER_DETAIL_KEY } from "../services/checkout-claim.service";
import { travelerChargeBasis } from "../services/traveler-charge";
import { runStripeReconciliation, type StripeReader } from "../jobs/stripeReconciliation";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `bbp-${RUN}-prov`,
  traveler: `bbp-${RUN}-trav`,
  trip: `bbp-${RUN}-trip`,
};
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];
const dedupeKeys: string[] = [];

/** The PaymentIntent id a hostile caller would plant. Deliberately well-formed: the defect was never
 *  about the string's shape, it was about nobody being able to say where it came from. */
const HOSTILE_PI = `pi_${RUN}_client_supplied`;

// ── Disposable-DB guard (mirrors provider-money-hardening.db.test.ts; never defaults open) ─────
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
      `[booking-birth-provenance] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

async function makeService(price: string | null = "100.00"): Promise<string> {
  const id = `bbp-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status)
    VALUES (${id}, ${ids.provider}, ${`BBP service ${RUN}`}, 'fixture', ${price}, 'active', 'approved')
  `);
  createdServiceIds.push(id);
  return id;
}

/** What the rail answers instead of committing a row it cannot price (V-11). Carries the
 *  resolver's OWN vocabulary, so a rename of `BuyRefusalReason` fails to compile here. */
class RailRefusal extends Error {
  constructor(readonly reason: BuyRefusalReason) {
    super(`rail refused: ${reason}`);
  }
}

/** Reproduces EXACTLY what `POST /api/bookings` does with a body: the exported allowlist schema the
 *  route parses with, the price gate it applies, and the storage writer it calls, with the same
 *  server-derived amount/identity. Nothing here is a reconstruction of the route's logic — every
 *  half is the route's own object, imported.
 *
 *  The writer is `createServiceBookingAtomic`, which is what the route actually calls (and its only
 *  caller) — corrected here by the V-10 lane, because that is where layer 2 of the booking-detail
 *  strip lives. `createServiceBooking` is the CHECKOUT CLAIM's writer and is deliberately not
 *  stripped; B8 is the assertion that keeps it that way. */
async function postBooking(body: Record<string, unknown>): Promise<string> {
  const input = createBookingRequestSchema.parse(body);
  const service = await storage.getProviderServiceById(input.serviceId!);
  assert.ok(service, "fixture service must exist");
  // V-11: the route's OWN gate, its own imported predicate — the ONE translation of the price
  // column into `resolveBuyAction`'s `hasPrice` fact. Placed here, above the amount derivation,
  // exactly as the handler places it, so this helper cannot drift into proving a rail that no
  // longer exists. (`B9` pins the handler itself against the same predicate.)
  if (!hasPublishedPrice(service!.price)) throw new RailRefusal("no_published_price");
  const totalAmount = Number(service!.price) || 0;
  const ownerShareRate = await resolveServiceOwnerShareRate({
    ownerUserId: service!.userId ?? null,
    ownerIsProvider: true, // the fixture owner is a service_provider (seeded below)
    feeCategory: null,
  });
  const booking = await storage.createServiceBookingAtomic({
    ...input,
    travelerId: ids.traveler,
    providerId: service!.userId,
    totalAmount: totalAmount.toFixed(2),
    ...(ownerShareRate !== null
      ? {
          platformFee: (totalAmount * (1 - ownerShareRate)).toFixed(2),
          providerEarnings: (totalAmount * ownerShareRate).toFixed(2),
        }
      : {}),
  } as any);
  createdBookingIds.push(booking.id);
  return booking.id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, total_amount, platform_fee, provider_earnings,
           idempotency_key, slot_id, confirmed_at, booking_details, booking_metadata,
           (COALESCE(booking_details, '{}'::jsonb) ? 'stripeAttemptAt') AS has_attempt
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

/** Seeds a booking row DIRECTLY, bypassing every layer — the archaeology case. This is what a row
 *  written before ruling 38, by the beta seeder, or by the pre-fix PS15 mass-assignment looks like
 *  on disk: a stamped PaymentIntent with no §15b `stripeAttemptAt` marker behind it. */
async function seedStampedRow(opts: {
  serviceId: string;
  paymentIntentId: string;
  status: string;
  withAttemptMarker: boolean;
}): Promise<string> {
  const id = `bbp-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  const details = opts.withAttemptMarker
    ? JSON.stringify({ stripeAttemptAt: new Date().toISOString(), stripeIdempotencyKey: `pi-${id}` })
    : JSON.stringify({ notes: "no pre-flight marker" });
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, status,
                                  total_amount, platform_fee, provider_earnings,
                                  stripe_payment_intent_id, booking_details)
    VALUES (${id}, ${opts.serviceId}, ${ids.traveler}, ${ids.provider}, ${ids.trip}, ${opts.status},
            '100.00', '10.00', '90.00', ${opts.paymentIntentId}, ${details}::jsonb)
  `);
  createdBookingIds.push(id);
  return id;
}

function reader(view: { paymentIntents?: any[]; charges?: any[]; refunds?: any[] }): StripeReader {
  return {
    listPaymentIntents: async () => (view.paymentIntents ?? []) as any,
    listCharges: async () => (view.charges ?? []) as any,
    listRefunds: async () => (view.refunds ?? []) as any,
  };
}

/** Scoped to the ids this file seeded, so a neighbouring row can never change a per-pass count. */
async function scan(view: Parameters<typeof reader>[0], bookingIds: string[]) {
  dedupeKeys.push(`%${RUN}%`);
  return runStripeReconciliation({
    triggeredBy: "test",
    stripeReader: reader(view),
    onlyBookingIds: bookingIds,
  });
}

async function exceptionsForRun(runId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT rail, kind, severity, dedupe_key, booking_id, payment_intent_id, expected_amount, details
    FROM reconciliation_exceptions WHERE run_id = ${runId} ORDER BY kind ASC
  `);
  return r.rows as any[];
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`bbp-${RUN}-prov@t.test`}, 'BBP', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`bbp-${RUN}-trav@t.test`}, 'BBP', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'BBP fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const k of dedupeKeys) {
    await db.execute(sql`DELETE FROM reconciliation_exceptions WHERE dedupe_key LIKE ${k}`).catch(() => {});
  }
  await db
    .execute(sql`DELETE FROM reconciliation_runs WHERE triggered_by = 'test' AND id NOT IN (SELECT run_id FROM reconciliation_exceptions)`)
    .catch(() => {});
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B1–B3 — THE BIRTH SIDE: a booking can never be born carrying a PaymentIntent
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("B1: POST /api/bookings with stripePaymentIntentId in the body — field stripped, row created with NULL PI, no promotion, no diary flip", async () => {
  const serviceId = await makeService();

  // The exact hostile body PS15 describes. `serviceId` and `bookingDetails` are legitimate; the rest
  // is the mass-assignment. Ruling 41: a client-supplied PaymentIntent id may never resolve or stamp
  // anything — and, per ruling 46, may never be BORN onto a row either.
  const bookingId = await postBooking({
    serviceId,
    tripId: ids.trip,
    bookingDetails: { notes: "legitimate field" },
    stripePaymentIntentId: HOSTILE_PI,
  });

  const row = await readBooking(bookingId);
  assert.equal(
    row.stripe_payment_intent_id,
    null,
    "the client's PaymentIntent id must NOT be on the row — this is ruling 41's clause on the birth side",
  );
  // "Row created (if otherwise valid)": the strip is silent to the caller, not a rejection. The
  // legitimate part of the body still lands, so no real client is broken by the fix.
  assert.ok(row, "the booking row itself is still created");

  // NO PROMOTION and NO DIARY FLIP. A born-stamped row would have looked promoted to everything
  // downstream; a born-clean row is simply a pending request.
  assert.equal(row.status, "pending", "born `pending` from the column default — never a claim state");
  assert.equal(row.confirmed_at, null, "nothing confirmed this booking");
  const diary = await db.execute(sql`
    SELECT count(*)::int AS n FROM item_transition_log WHERE trip_id = ${ids.trip}
  `);
  assert.equal((diary.rows[0] as any).n, 0, "no diary row: birth is not a transition");

  // And the row is NOT mistakable for a spine-written one.
  assert.equal(row.has_attempt, false, "no §15b pre-flight marker — nothing pretended to reach Stripe");
});

test("B2: layer 2 — storage strips the field for EVERY caller, including one that bypasses the schema", async () => {
  const serviceId = await makeService();

  // Ruling 42's placement rationale, applied here: the schema `.omit()` (layer 1) cannot reach the
  // two internal callers that pass `as any` (payments.routes.ts, routes.ts). This proves the storage
  // writer is the backstop — an `as any` caller planting a PI still lands a NULL column.
  const booking = await storage.createServiceBooking({
    serviceId,
    travelerId: ids.traveler,
    providerId: ids.provider,
    tripId: ids.trip,
    totalAmount: "100.00",
    stripePaymentIntentId: HOSTILE_PI,
  } as any);
  createdBookingIds.push(booking.id);

  const row = await readBooking(booking.id);
  assert.equal(row.stripe_payment_intent_id, null, "storage strips it regardless of how the caller got here");

  // Layer 1, asserted independently: the field is not even in the schema's output type/shape.
  const parsed = insertServiceBookingSchema.parse({
    serviceId,
    totalAmount: "100.00",
    stripePaymentIntentId: HOSTILE_PI,
  }) as Record<string, unknown>;
  assert.equal(
    "stripePaymentIntentId" in parsed,
    false,
    "insertServiceBookingSchema must not admit the field at all (layer 1)",
  );
});

test("B3: the route body is an ALLOWLIST — the whole privileged family is unreachable and amounts are server-derived", async () => {
  const serviceId = await makeService("250.00");

  // Everything a denylist schema would have let through. NONE of it may reach the row.
  const bookingId = await postBooking({
    serviceId,
    tripId: ids.trip,
    bookingDetails: { notes: "legit" },
    stripePaymentIntentId: HOSTILE_PI,
    totalAmount: "0.01",
    platformFee: "0.00",
    providerEarnings: "999999.00",
    insuranceFee: "0.00",
    status: "confirmed",
    idempotencyKey: `bbp-${RUN}-forged-key`,
    slotId: "some-slot",
    source: "link",
    acquisitionRef: "FORGED",
    trackingNumber: "TRV-FORGED",
  });

  const row = await readBooking(bookingId);

  // §14 — the amount comes from the catalog record, not the body.
  assert.equal(row.total_amount, "250.00", "totalAmount is the SERVICE's price, never the body's 0.01");
  // §15b — the body could not birth a claim state or a paid one.
  assert.equal(row.status, "pending", "status is not client-settable: no `confirmed`, no `payment_pending`");
  assert.equal(row.confirmed_at, null);
  // §15 — the checkout spine's claim machinery is not this rail's to touch.
  assert.equal(row.idempotency_key, null, "the checkout idempotency key is not settable here");
  assert.equal(row.slot_id, null, "inventory claims belong to checkout's atomic bookSlot (§18c)");
  // Rulings 41/46.
  assert.equal(row.stripe_payment_intent_id, null);

  // §8 — the split is the fee_bands value, read through the SAME resolver the route delegates to.
  // Never a literal in this file, and never the client's 999999.00.
  const bandShare = await resolveServiceOwnerShareRate({
    ownerUserId: ids.provider,
    ownerIsProvider: true,
    feeCategory: null,
  });
  assert.ok(bandShare !== null && bandShare > 0, "the provider band must resolve from fee_bands");
  assert.equal(row.provider_earnings, (250 * bandShare!).toFixed(2), "provider earnings derived from fee_bands");
  assert.equal(row.platform_fee, (250 * (1 - bandShare!)).toFixed(2), "platform fee derived from fee_bands");
  assert.notEqual(row.provider_earnings, "999999.00");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B4–B5 — THE ROWS ALREADY ON DISK: detection, not repair (§17)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("B4: a row with a PaymentIntent and no pre-flight marker surfaces as payment_provenance_unverified on the next detection run", async () => {
  const serviceId = await makeService();
  // The archaeology case: stamped, but nothing in the row can vouch for where the id came from.
  // Indistinguishable causes — the pre-fix PS15 mass-assignment, the beta seeder's synthetic
  // `pi_…`, or a row predating ruling 38 — which is precisely why the kind is *unverified*.
  const bookingId = await seedStampedRow({
    serviceId,
    paymentIntentId: HOSTILE_PI,
    status: "pending",
    withAttemptMarker: false,
  });

  const result = await scan({}, [bookingId]);
  assert.equal(result.status, "completed");
  assert.ok(result.runId, "every pass writes a run row, including this one (§17 rule 2)");

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "payment_provenance_unverified");
  assert.ok(hit, `expected a payment_provenance_unverified row, got: ${rows.map((r) => r.kind).join(", ") || "(none)"}`);
  assert.equal(hit.rail, "cart");
  assert.equal(hit.severity, "warning", "the row may be fine; what is not fine is that nothing can tell");
  assert.equal(hit.booking_id, bookingId);
  assert.equal(hit.payment_intent_id, HOSTILE_PI);
  assert.equal(
    hit.dedupe_key,
    `cart:payment_provenance_unverified:${bookingId}:${HOSTILE_PI}`,
    "keyed on the (booking, PI) PAIR so a month-long drift is ONE append-only row (§17 rule 1)",
  );
  // Stripe never saw this id in the window; the detail records that WITHOUT claiming it is absent
  // from Stripe (the sweep's never-guess-about-unseen-PIs discipline).
  assert.equal((hit.details as any).paymentIntentSeenInWindow, false);

  // DETECT, DON'T REPAIR: the job touched nothing.
  const after = await readBooking(bookingId);
  assert.equal(after.status, "pending", "the job did not promote, void, cancel or refund");
  assert.equal(after.stripe_payment_intent_id, HOSTILE_PI, "and it did not scrub the evidence either");
  assert.equal(result.promoted, 0, "the one narrow repair exception does not apply to this kind");
});

test("B4b: STRIPE'S OWN CORROBORATION is the second form of provenance — a PI whose metadata names the booking is not drift", async () => {
  const serviceId = await makeService();
  // No pre-flight marker, but the drift job reads this PaymentIntent from Stripe with the PLATFORM'S
  // OWN key (a SERVER_VERIFIED_ACTORS read, §17b) and Stripe's `metadata.bookingIds` names this very
  // booking. Ruling 41: what gates the capability is the PROVENANCE of the id — that the platform
  // obtained it from Stripe — NOT the transport, and not any one implementation of the evidence.
  // Marker-only would have indicted every booking whose PI predates ruling 38 but which Stripe can
  // still vouch for.
  const corroboratedPi = `pi_${RUN}_corroborated`;
  const bookingId = await seedStampedRow({
    serviceId,
    paymentIntentId: corroboratedPi,
    status: "pending",
    withAttemptMarker: false,
  });

  const intent = {
    id: corroboratedPi,
    object: "payment_intent",
    status: "requires_payment_method",
    amount: 11000,
    amount_received: 0,
    currency: "usd",
    created: Math.floor(Date.now() / 1000),
    metadata: { bookingIds: bookingId },
  };

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);
  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "payment_provenance_unverified").length,
    0,
    "Stripe naming this booking in the PaymentIntent's own metadata IS server provenance",
  );

  // And the corroboration is not a loophole: the SAME PaymentIntent, naming a DIFFERENT booking, is
  // exactly the forger's move (lift a real PI, plant it on your own row) and must still be caught.
  const otherBookingId = await seedStampedRow({
    serviceId,
    paymentIntentId: corroboratedPi,
    status: "pending",
    withAttemptMarker: false,
  });
  const result2 = await scan({ paymentIntents: [intent] }, [otherBookingId]);
  const rows2 = await exceptionsForRun(result2.runId!);
  assert.ok(
    rows2.find((r) => r.kind === "payment_provenance_unverified" && r.booking_id === otherBookingId),
    "a real PaymentIntent planted on a row its metadata does NOT name is still unverifiable",
  );
});

test("B5: a spine-written row (with the §15b pre-flight marker) is NOT classified — the discriminating half", async () => {
  const serviceId = await makeService();
  // Identical in every way except the marker `markStripeAttempt` writes before paymentIntents.create.
  // Without this assertion, a classification that flagged EVERY stamped row would pass B4 just as
  // well and would bury the real ones under every legitimate purchase on the platform.
  const legitPi = `pi_${RUN}_spine_written`;
  const bookingId = await seedStampedRow({
    serviceId,
    paymentIntentId: legitPi,
    status: "pending",
    withAttemptMarker: true,
  });

  const result = await scan({}, [bookingId]);
  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "payment_provenance_unverified").length,
    0,
    "a row the checkout spine marked before calling Stripe has verifiable provenance and is not drift",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B6 — COMMITTED NEGATIVE FIXTURE for the schema-posture follow-up (#PS18)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("B6: the omit-vs-pick class — a NEW privileged column is reachable under .omit() and unreachable under .pick()", () => {
  // EVIDENCE, not a regression guard. Ruling 46 records that all 186 `createInsertSchema(...)` calls
  // in shared/schema.ts are `.omit()`-based and ZERO are `.pick()`-based, and that converting the
  // layer is a named follow-up (`#PS18`), not this lane. This fixture is the demonstration that
  // follow-up is built on, captured here while the trace is fresh.
  //
  // The mechanism in miniature: a table gains a privileged column AFTER its insert schema was
  // written. Nobody edits the schema — there is nothing to edit, the omit list is already "complete"
  // for the columns that existed. That is how `revenueShareRate`, the dormant fee/payout family, and
  // `stripePaymentIntentId` all became client-settable without anyone deciding they should be.
  const futureTable = pgTable("bbp_fixture_future_table", {
    id: varchar("id").primaryKey(),
    // Fields a client legitimately sends.
    note: varchar("note"),
    // The privileged column added later — never mentioned in the omit list below, because the omit
    // list predates it.
    payoutOverrideRate: decimal("payout_override_rate", { precision: 5, scale: 4 }),
  });

  const denylistSchema = createInsertSchema(futureTable).omit({ id: true });
  const allowlistSchema = createInsertSchema(futureTable).pick({ note: true });

  const hostileBody = { note: "hello", payoutOverrideRate: "1.0000" };

  const viaOmit = denylistSchema.parse(hostileBody) as Record<string, unknown>;
  assert.equal(
    viaOmit.payoutOverrideRate,
    "1.0000",
    "DENYLIST FAILS OPEN: the privileged column the omit list never heard of passes straight through",
  );

  const viaPick = allowlistSchema.parse(hostileBody) as Record<string, unknown>;
  assert.equal(
    "payoutOverrideRate" in viaPick,
    false,
    "ALLOWLIST FAILS CLOSED: an unnamed column is unreachable by default — the structural fix (#PS18)",
  );

  // And the posture claim ruling 46 rests on, asserted rather than asserted-in-prose: the route's
  // real allowlist admits exactly its five named keys and nothing else.
  const routeShape = Object.keys((createBookingRequestSchema as unknown as z.ZodObject<any>).shape).sort();
  assert.deepEqual(
    routeShape,
    ["bookingDetails", "bookingMetadata", "contractId", "serviceId", "tripId"],
    "POST /api/bookings' body allowlist — extend deliberately, never by adding a column elsewhere",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B7–B8 — V-10: THE ALLOWLIST STOPS AT THE COLUMN, so the jsonb gets its own strip
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("B7: a body planting server-authored booking-detail keys — travelerCharge and its family never reach the row", async () => {
  const serviceId = await makeService();

  // `bookingDetails` and `bookingMetadata` ARE in the route's allowlist (they are the traveler's
  // own notes), so the pick that closed PS15 says nothing about what is inside them. The hostile
  // body below is the V-10 move: no money COLUMN is touched — every value lands inside a jsonb the
  // allowlist admits — and `travelerCharge`'s mere PRESENCE flips the row to `a3_snapshot`, which
  // moves its refund ceiling (stripe-payment.service.ts), its cancellation quote
  // (cancellation-policy.service.ts) and what a checkout re-drive charges (checkout-claim.service.ts).
  const bookingId = await postBooking({
    serviceId,
    tripId: ids.trip,
    bookingDetails: {
      notes: "legitimate field",
      // The era discriminator. A concierge fee nobody resolved, on a row nobody charged.
      [TRAVELER_CHARGE_SNAPSHOT_KEY]: { conciergeFee: "999.00" },
      // The §15b pre-flight marker — planting it would forge exactly the provenance §19b's
      // `payment_provenance_unverified` classification exists to test (B4/B5 above).
      stripeAttemptAt: new Date().toISOString(),
      stripeIdempotencyKey: `pi-${RUN}-forged`,
      // The rest of the family, each one a fact only a server path may state.
      travelerServiceFee: { charged: "0.00" },
      claimedSlotIds: ["some-slot"],
      reconciliationException: { note: "forged" },
      railsAttribution: { lane: "forged" },
      directRateResolution: { shareRate: "1.0000" },
      [BALANCE_PAYER_DETAIL_KEY]: ids.provider,
      completion: { rule: "forged", actor: ids.traveler },
      itineraryItemId: "some-item",
    },
    bookingMetadata: {
      visaType: "legitimate field",
      [TRAVELER_CHARGE_SNAPSHOT_KEY]: { conciergeFee: "999.00" },
    },
  });

  const row = await readBooking(bookingId);
  const details = (row.booking_details ?? {}) as Record<string, unknown>;
  const metadata = (row.booking_metadata ?? {}) as Record<string, unknown>;

  for (const key of SERVER_AUTHORED_BOOKING_DETAIL_KEYS) {
    assert.equal(key in details, false, `booking_details must not carry a client-supplied '${key}'`);
    assert.equal(key in metadata, false, `booking_metadata must not carry a client-supplied '${key}'`);
  }

  // THE STRIP IS NOT A REJECTION (the PS15 posture): the legitimate half of the body still lands,
  // so no real client is broken by the fix.
  assert.equal(details.notes, "legitimate field", "the traveler's own fields are untouched");
  assert.equal(metadata.visaType, "legitimate field");

  // AND THE READER'S ANSWER IS THE HONEST ONE. `travelerChargeBasis` reads the key's presence and
  // nothing else, so a stripped row reads back as the era it actually is: nothing priced it under
  // the A3 composition, because nothing priced it at all.
  assert.equal(
    travelerChargeBasis((details as any)[TRAVELER_CHARGE_SNAPSHOT_KEY]?.conciergeFee ?? null),
    "pre_a3_legacy",
    "a born row carries no A3 snapshot — the discriminator is the checkout claim's to write",
  );

  // LAYER 2, ASSERTED ON ITS OWN: a caller that bypasses the schema with `as any` — the case a
  // type-level strip cannot reach (ruling 42's placement rationale, B2's shape one column over).
  const direct = await storage.createServiceBookingAtomic({
    serviceId,
    travelerId: ids.traveler,
    providerId: ids.provider,
    tripId: ids.trip,
    totalAmount: "100.00",
    bookingDetails: { notes: "n", [TRAVELER_CHARGE_SNAPSHOT_KEY]: { conciergeFee: "999.00" } },
  } as any);
  createdBookingIds.push(direct.id);
  const directRow = await readBooking(direct.id);
  assert.equal(
    TRAVELER_CHARGE_SNAPSHOT_KEY in ((directRow.booking_details ?? {}) as Record<string, unknown>),
    false,
    "storage strips it regardless of how the caller got here (layer 2)",
  );
  assert.equal((directRow.booking_details as any).notes, "n", "and the rest of the object survives");

  // LAYER 1, ASSERTED INDEPENDENTLY OF THE DATABASE: the admission schema alone already strips,
  // so a caller that never reaches storage is covered too.
  const parsed = createBookingRequestSchema.parse({
    serviceId,
    bookingDetails: { notes: "n", [TRAVELER_CHARGE_SNAPSHOT_KEY]: { conciergeFee: "1.00" } },
  });
  assert.deepEqual(parsed.bookingDetails, { notes: "n" }, "layer 1 (createBookingRequestSchema)");

  // THE SET ITSELF, pinned. Widening or narrowing it is a decision someone makes on purpose — and
  // the two keys that carry their own declared constants must be MEMBERS, so renaming either
  // spelling fails here rather than quietly leaving the key admissible under its new name.
  assert.deepEqual(
    [...SERVER_AUTHORED_BOOKING_DETAIL_KEYS],
    [
      "travelerCharge",
      "travelerServiceFee",
      "stripeAttemptAt",
      "stripeIdempotencyKey",
      "claimedSlotIds",
      "reconciliationException",
      "railsAttribution",
      "directRateResolution",
      "balancePaidByUserId",
      "completion",
      "itineraryItemId",
    ],
    "the server-authored key family — see shared/booking-details-admission.ts for each one's reader",
  );
  assert.ok(
    (SERVER_AUTHORED_BOOKING_DETAIL_KEYS as readonly string[]).includes(TRAVELER_CHARGE_SNAPSHOT_KEY),
  );
  assert.ok(
    (SERVER_AUTHORED_BOOKING_DETAIL_KEYS as readonly string[]).includes(BALANCE_PAYER_DETAIL_KEY),
  );

  // STATED NEGATIVE SPACE, asserted rather than only written down: the strip is TOP-LEVEL, because
  // every reader of these keys reads them at the top level. A nested copy survives — and is inert.
  const nested = stripServerAuthoredBookingDetails({
    notes: { [TRAVELER_CHARGE_SNAPSHOT_KEY]: { conciergeFee: "1.00" } },
  });
  assert.deepEqual(nested.stripped, [], "a nested key is not scrubbed — matching the readers, not exceeding them");
});

test("B8: THE DISCRIMINATING HALF — the checkout claim's own writer still records a SERVER-COMPOSED travelerCharge", async () => {
  const serviceId = await makeService();

  // Without this assertion a blanket strip would pass B7 just as well — and would erase the A3 era
  // discriminator from every real purchase, silently re-reading the whole platform as pre-A3 and
  // changing every refund ceiling and every re-drive. The claim spine composes `travelerCharge`
  // server-side and passes it through `storage.createServiceBooking` (payments.routes.ts), which is
  // why the V-10 strip is placed on `createServiceBookingAtomic` — the writer the CLIENT-facing
  // birth rail uses, and its only caller — with the client body stopped at layer 1 before it can
  // reach the other one.
  const booking = await storage.createServiceBooking({
    serviceId,
    travelerId: ids.traveler,
    providerId: ids.provider,
    tripId: ids.trip,
    totalAmount: "100.00",
    bookingDetails: {
      notes: "server-composed claim row",
      [TRAVELER_CHARGE_SNAPSHOT_KEY]: { conciergeFee: "12.00" },
    },
  } as any);
  createdBookingIds.push(booking.id);

  const row = await readBooking(booking.id);
  const details = (row.booking_details ?? {}) as any;
  assert.deepEqual(
    details[TRAVELER_CHARGE_SNAPSHOT_KEY],
    { conciergeFee: "12.00" },
    "a checkout-composed snapshot must SURVIVE — this is the fact the refund and the re-drive read",
  );
  assert.equal(
    travelerChargeBasis(details[TRAVELER_CHARGE_SNAPSHOT_KEY]?.conciergeFee ?? null),
    "a3_snapshot",
    "and it still reads back as the A3 era it was priced under",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B9 — V-11: a listing with no price is REQUESTED, never committed at 0.00
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("B9: a listing that publishes no price does not produce a booking at all — and a priced one is unchanged", async () => {
  // `resolveBuyAction` row 11 already rules that a priceless listing can only ever be REQUESTED,
  // never charged (§14 — the resolver invents no price). The rail read the same column through
  // `Number(service.price) || 0` and rendered "no price stated" as "free" (§13), which is the only
  // thing §9.2's "do not send a quote through generic checkout" had standing behind it.
  const pricelessId = await makeService(null);
  await assert.rejects(
    () => postBooking({ serviceId: pricelessId, tripId: ids.trip, bookingDetails: { notes: "quote me" } }),
    (err: unknown) => err instanceof RailRefusal && err.reason === "no_published_price",
    "a NULL price is refused in the resolver's own vocabulary, not committed at 0.00",
  );
  const created = await db.execute(sql`
    SELECT count(*)::int AS n FROM service_bookings WHERE service_id = ${pricelessId}
  `);
  assert.equal((created.rows[0] as any).n, 0, "and NO row exists — a refusal is not a $0 purchase");

  // A ZERO price is the same fact wearing a number: nobody published a price of nothing.
  const zeroId = await makeService("0.00");
  await assert.rejects(
    () => postBooking({ serviceId: zeroId, tripId: ids.trip, bookingDetails: {} }),
    (err: unknown) => err instanceof RailRefusal && err.reason === "no_published_price",
  );

  // THE PREDICATE, directly — the ONE translation both the button and the rail read.
  assert.equal(hasPublishedPrice(null), false);
  assert.equal(hasPublishedPrice(undefined), false);
  assert.equal(hasPublishedPrice("0.00"), false);
  assert.equal(hasPublishedPrice(""), false);
  assert.equal(hasPublishedPrice("not a number"), false);
  assert.equal(hasPublishedPrice("250.00"), true);
  assert.equal(hasPublishedPrice(250), true);

  // A PRICED LISTING IS BYTE-IDENTICAL: it passes the gate, and the amount below it is the same
  // catalog-derived number it has always been (§14). B3 asserts the full birth invariants.
  const pricedId = await makeService("250.00");
  const bookingId = await postBooking({ serviceId: pricedId, tripId: ids.trip, bookingDetails: { notes: "n" } });
  const row = await readBooking(bookingId);
  assert.equal(row.total_amount, "250.00");
  assert.equal(row.status, "pending");
  assert.equal(row.stripe_payment_intent_id, null);

  // THE RAIL IS PINNED TO THE PREDICATE, over the file SET rather than by a call-site count: any
  // server route or service that derives a booking amount from a listing price with the
  // `|| 0` fallback must also consult `hasPublishedPrice`, or the fallback is once again free to
  // state a price nobody set. Comments stripped, so a mention in prose cannot satisfy it.
  const roots = ["server/routes.ts", "server/routes", "server/services"];
  const files: string[] = [];
  for (const root of roots) {
    const abs = path.join(process.cwd(), root);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) files.push(root);
    else {
      for (const f of fs.readdirSync(abs)) {
        if (f.endsWith(".ts")) files.push(path.join(root, f));
      }
    }
  }
  assert.ok(files.length > 20, `expected the route/service file set, found ${files.length}`);
  const zeroFallback = /Number\(\s*service!?\.price\s*\)\s*\|\|\s*0/;
  const derivers = files.filter((rel) => {
    const src = fs
      .readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    return zeroFallback.test(src);
  });
  assert.ok(derivers.length > 0, "the amount derivation this pin guards has moved — repair the pin, do not delete it");
  for (const rel of derivers) {
    const src = fs
      .readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.ok(
      src.includes("hasPublishedPrice"),
      `${rel} prices a booking off a listing price with a || 0 fallback and never consults hasPublishedPrice (V-11)`,
    );
  }
});
