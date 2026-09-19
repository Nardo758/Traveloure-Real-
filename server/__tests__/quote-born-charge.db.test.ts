/**
 * THE QUOTE-BORN BOOKING CHARGE — behavioural proof of LD 49's filed charge lane
 * (ledger `2026-09-18-quote-born-charge`; the arm lives on `POST /api/checkout`, its decision and
 * claim in `server/services/quote-charge.service.ts`).
 *
 *   Q1  HAPPY PATH + ORDER. An accepted quote's booking resolves to a plan carrying the ROW's
 *       amount and the key `quote-buy-<bookingId>`; the §15 CLAIM flips `pending → payment_pending`
 *       with the A3 snapshot stamped and — critically — NO §15b marker yet; `markStripeAttempt`
 *       then writes the marker carrying `pi-quote-buy-<id>`; `stampAuthorization` stamps the PI
 *       atomically. That is the exact sequence `chargeQuoteBornBooking` → `authorizeAndPromote`
 *       runs, with the same four functions.
 *   Q2  WEBHOOK PROMOTION, UNCHANGED. `promotePaidCheckout` flips the quote-born row to
 *       `confirmed` exactly once; a second (double) signal promotes NOTHING and reports it
 *       already confirmed. No code in the promotion needed a change — it is generic over
 *       `service_bookings`, which is the point of the arm reusing the spine.
 *   Q3  CLIENT-FALLBACK PROMOTION + N17c. Actor `client` promotes the stamped row; a client-named
 *       PaymentIntent that is NOT the one the server stamped promotes nothing and stamps nothing.
 *   Q4  §14 — THE BODY IS IGNORED. The `.strict()` allowlist REFUSES `amount` / `price` / `userId`
 *       / `quoteId` outright, and the charged amount is the ROW's `total_amount`.
 *   Q5  EXPIRED QUOTE ⇒ 409 `quote_expired` with its expiry stated: NO claim, NO marker, the row
 *       still `pending`, and nothing repriced.
 *   Q6  SOMEONE ELSE'S BOOKING ⇒ ONE 404 (never a 403), and a booking with no quote behind it is
 *       the SAME 404 — so the rail cannot be used to probe which bookings exist.
 *   Q7  CONCURRENCY. Two simultaneous claims for one quote-born booking: EXACTLY ONE wins. The
 *       loser is refused by the claim's own WHERE clause (`AND status = 'pending'`), before any
 *       marker and before any Stripe call, so only one PaymentIntent can ever be created.
 *   Q8  DEPOSIT. A deposit-enabled listing's quote-born row charges the deposit the ACCEPT path
 *       pinned (never re-derived), deposit + balance === the full charge, and the claim leaves the
 *       balance columns exactly as the cart deposit path leaves them.
 *   Q9  TTL SWEEP. An UNMARKED quote-born claim is voided (provably un-attempted); a MARKED one is
 *       NEVER auto-voided — it is quarantined and reconciled. Identical treatment to a cart row.
 *   Q10 §17/§19b SEE IT AS A CART ROW. The drift job's own expected-charge derivation
 *       (`travelerChargeForRow`) on the claimed row equals what the arm charged — which is exactly
 *       what the A3 snapshot the claim stamps is for — and §19b's provenance clears via the marker.
 *   Q11 K1 RATCHET. The key template is pinned in `offering-contract-snapshot.test.ts`.
 *
 * WHAT THIS SUITE DELIBERATELY DOES NOT DO: it makes no Stripe call. The one Stripe creation site
 * is `stripePaymentService.createPaymentIntent`, which this lane did not touch and which
 * `checkout-oneclick.stripe.db.test.ts` proves against real Stripe. What IS this lane's own — the
 * decision, the claim, the order, the stamp, the promotion, the sweep — is proven here end to end
 * with the SAME functions the route calls. §12 of the brief's guard list (the fee gate and
 * `check-money-endpoints`) is CI's, not a test's.
 *
 * NO FEE LITERALS (§8): every expected split is computed from the row the accept rail wrote, never
 * from a number typed here. NO DAY LITERALS: the quote window is read off the config accessors.
 * DISPOSABLE DB ONLY — every row this file writes it deletes in after(). No Stripe key, no network.
 *
 * Run solo: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 \
 *   npx tsx --test server/__tests__/quote-born-charge.db.test.ts
 */

// `stripe.service.ts` constructs its client at IMPORT time and throws keyless — the promotion
// suite's own technique. No Stripe call is made anywhere in this file; the dummy exists so the
// module graph below can be loaded at all.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_quote_charge_suite";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { quoteCheckoutBodySchema } from "@shared/service-quotes";
import { TRAVELER_CHARGE_SNAPSHOT_KEY } from "@shared/booking-details-admission";

// Dynamic imports, deliberately AFTER the env guard above: a static `import` declaration hoists
// above every statement in ESM, so the dummy key would be set too late.
const { db } = await import("../db");
const { acceptQuote, issueQuote, requestQuote } = await import("../services/service-quotes.service");
const { claimQuoteBornBooking, resolveQuoteCharge, QUOTE_CHARGE_FROM_STATUSES } = await import(
  "../services/quote-charge.service"
);
const {
  markStripeAttempt,
  promotePaidCheckout,
  stampAuthorization,
  sweepExpiredCheckoutClaims,
  STRIPE_ATTEMPT_AT_KEY,
  CLAIM_EXPIRED_STATUS,
} = await import("../services/checkout-claim.service");
const { travelerChargeBasis, travelerChargeForRow } = await import("../services/traveler-charge");
// Ledger `2026-09-19-quote-born-traveler-fee`: NO LITERALS (§8) — every expected fee in Q12-Q14 is
// read off the SAME `fee_bands` row the resolver reads, never typed here.
const { requireBand, round2, TRAVELER_SERVICE_FEE_BAND } = await import("../services/fee-resolution.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `qc-${RUN}-prov`,
  traveler: `qc-${RUN}-trav`,
  other: `qc-${RUN}-other`,
};
const createdServiceIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdTripIds: string[] = [];
let categoryId: string;

// ── Disposable-DB guard (the service-quotes / booking-birth-provenance posture) ───────────────
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
      `[quote-born-charge] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function resolveCategoryId(key: string): Promise<string> {
  const found = await db.execute(sql`SELECT id FROM service_categories WHERE category_key = ${key} LIMIT 1`);
  const existing = (found.rows[0] as any)?.id as string | undefined;
  if (existing) return existing;
  const id = `qc-${RUN}-cat-${key}`;
  const inserted = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, category_key, commission_band_key)
    SELECT ${id}, ${`QC ${RUN} ${key}`}, ${`qc-${RUN}-${key}`}, ${key}, sc.commission_band_key
      FROM service_categories sc
     WHERE sc.commission_band_key IS NOT NULL
     LIMIT 1
    RETURNING id
  `);
  assert.ok(inserted.rows[0], `cannot create a disposable '${key}' category: taxonomy migrations not applied`);
  createdCategoryIds.push(id);
  return id;
}

/** A custom-quote listing: NULL price, request mode, approved + active. Deposits optional. */
async function makeQuoteListing(opts: { depositPercentage?: number } = {}): Promise<string> {
  const id = `qc-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  const depositEnabled = opts.depositPercentage !== undefined;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, price_type, booking_mode,
                                   delivery_method, category_id, status, approval_status,
                                   deposit_enabled, deposit_type, deposit_percentage)
    VALUES (${id}, ${ids.provider}, ${`QC listing ${RUN}`}, 'fixture', NULL, 'custom_quote', 'request',
            'in_person', ${categoryId}, 'active', 'approved',
            ${depositEnabled}, ${depositEnabled ? "percentage" : null}, ${opts.depositPercentage ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM service_bookings WHERE id = ${id}`);
  return r.rows[0];
}

/**
 * Request → issue → accept, the REAL rails, ending in the unpaid quote-born booking under test.
 * `amountCents` is fixture data (the provider's own price for this traveler), never a fee.
 * `tripId` (ledger `2026-09-19-quote-plan-link`) is OPTIONAL — passed straight to `requestQuote`
 * so `acceptQuote` copies it onto the booking through the real write path, exactly like every
 * other fact this helper already exercises through the live rails rather than a raw UPDATE.
 */
async function acceptedQuoteBooking(opts: {
  amountCents: number;
  depositPercentage?: number;
  tripId?: string;
}): Promise<{
  serviceId: string;
  quoteId: string;
  bookingId: string;
}> {
  const serviceId = await makeQuoteListing(
    opts.depositPercentage === undefined ? {} : { depositPercentage: opts.depositPercentage },
  );
  const requested = await requestQuote({
    serviceId,
    travelerId: ids.traveler,
    ...(opts.tripId ? { tripId: opts.tripId } : {}),
  });
  assert.equal(requested.ok, true, JSON.stringify(requested));
  const quoteId = (requested as any).quote.id as string;
  const issued = await issueQuote({ quoteId, actorUserId: ids.provider, amountCents: opts.amountCents });
  assert.equal(issued.ok, true, JSON.stringify(issued));
  const accepted = await acceptQuote({ quoteId, travelerId: ids.traveler });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  return { serviceId, quoteId, bookingId: (accepted as any).bookingId as string };
}

function plan<T extends { ok: boolean }>(r: T, label: string): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, `${label}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}
function refused<T extends { ok: boolean }>(r: T, label: string): Extract<T, { ok: false }> {
  assert.equal(r.ok, false, `${label}: expected a refusal, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: false }>;
}

before(async () => {
  await assertDisposableDb();
  categoryId = await resolveCategoryId("av_tech");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`qc-${RUN}-prov@t.test`}, 'QC', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`qc-${RUN}-trav@t.test`}, 'QC', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.other}, ${`qc-${RUN}-other@t.test`}, 'QC', 'Bystander')
  `);
});

after(async () => {
  for (const sid of createdServiceIds) {
    const bookings = await db.execute(sql`SELECT id FROM service_bookings WHERE service_id = ${sid}`);
    for (const b of bookings.rows as any[]) {
      await db.execute(sql`DELETE FROM item_transition_log WHERE booking_id = ${b.id}`).catch(() => {});
      await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${b.id}`).catch(() => {});
    }
    await db.execute(sql`DELETE FROM service_quotes WHERE service_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE service_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${sid}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${sid}`).catch(() => {});
  }
  for (const tid of createdTripIds) {
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id = ${tid}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${tid}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler}, ${ids.other})`).catch(() => {});
  for (const id of createdCategoryIds) {
    await db.execute(sql`DELETE FROM service_categories WHERE id = ${id}`).catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════

test("Q1 · happy path and ORDER: resolve → CLAIM (no marker yet) → marker → atomic stamp", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 41500 });
  const born = await bookingRow(bookingId);
  assert.equal(born.status, "pending", "the accept rail births it unpaid");
  assert.equal(born.stripe_payment_intent_id, null, "§19a: born with no PaymentIntent");

  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  assert.equal(p.bookingId, bookingId);
  assert.equal(
    p.subtotal,
    parseFloat(born.total_amount),
    "§14: the charge is the ROW's amount — the quote's, not the listing's live price",
  );
  assert.equal(p.idempotencyKey, `quote-buy-${bookingId}`, "the §15 key is derived from the booking");
  assert.equal(p.alreadyClaimed, false);
  assert.equal("authorizedPaymentIntentId" in p, false);
  assert.equal("chargeAmount" in p, false, "deposits are off for this listing ⇒ the full amount is due");

  // Resolving does not write: it is a read, and a refusal must cost nothing.
  assert.equal((await bookingRow(bookingId)).status, "pending");

  // THE CLAIM.
  assert.equal(
    await claimQuoteBornBooking({
      bookingId,
      actorUserId: ids.traveler,
      travelerServiceFee: p.travelerServiceFee,
      balanceDueAt: p.balanceDueAt,
    }),
    true,
  );
  const claimed = await bookingRow(bookingId);
  assert.equal(claimed.status, "payment_pending");
  assert.equal(claimed.stripe_payment_intent_id, null);
  assert.equal(
    (claimed.booking_details ?? {})[STRIPE_ATTEMPT_AT_KEY],
    undefined,
    "§15b ORDER: the claim precedes the marker — an unmarked claim is provably un-attempted",
  );
  const snap = (claimed.booking_details ?? {})[TRAVELER_CHARGE_SNAPSHOT_KEY];
  assert.ok(snap, "the A3 era snapshot is stamped BY THE CLAIM (see quote-charge.service.ts's header)");
  assert.equal(
    travelerChargeBasis((snap as any).conciergeFee),
    "a3_snapshot",
    "a row charged today must not read back as the pre-A3 era, which would add platform_fee twice",
  );
  assert.equal(
    (claimed.booking_details ?? {}).notes,
    born.booking_details?.notes,
    "the jsonb concat preserves what the accept rail wrote — it never replaces it",
  );

  // THE MARKER, then the STAMP — the two `authorizeAndPromote` runs around the Stripe call.
  await markStripeAttempt([bookingId], `pi-${p.idempotencyKey}`);
  const marked = await bookingRow(bookingId);
  assert.ok((marked.booking_details ?? {})[STRIPE_ATTEMPT_AT_KEY], "§15b marker written before Stripe");
  assert.equal((marked.booking_details ?? {}).stripeIdempotencyKey, `pi-quote-buy-${bookingId}`);

  const pi = `pi_qc_${RUN}_q1`;
  assert.equal(await stampAuthorization([bookingId], pi), true);
  assert.equal((await bookingRow(bookingId)).stripe_payment_intent_id, pi);
  // The stamp is an atomic conditional on the provisional predicate, so a SECOND stamp (a stale
  // retry, a racing sweep) matches zero rows and refuses — it never re-points a stamped row.
  assert.equal(await stampAuthorization([bookingId], `${pi}_second`), false);
  assert.equal((await bookingRow(bookingId)).stripe_payment_intent_id, pi);
});

test("Q2 · the WEBHOOK promotion is UNCHANGED: one flip, and a double signal is a no-op", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 22000 });
  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  await claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee });
  const pi = `pi_qc_${RUN}_q2`;
  await markStripeAttempt([bookingId], `pi-${p.idempotencyKey}`);
  await stampAuthorization([bookingId], pi);

  const first = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [bookingId] });
  assert.deepEqual(first.promoted, [bookingId], "the quote-born row promotes through the SHARED promotion");
  assert.equal((await bookingRow(bookingId)).status, "confirmed");

  const second = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [bookingId] });
  assert.deepEqual(second.promoted, [], "a double signal promotes nothing");
  assert.deepEqual(second.alreadyConfirmed, [bookingId]);
  assert.equal((await bookingRow(bookingId)).status, "confirmed");
});

test("Q3 · the CLIENT fallback promotes too — and a client-named PaymentIntent that is not the stamped one does nothing (N17c)", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 19000 });
  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  await claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee });
  const pi = `pi_qc_${RUN}_q3`;
  await markStripeAttempt([bookingId], `pi-${p.idempotencyKey}`);
  await stampAuthorization([bookingId], pi);

  // A client naming a PaymentIntent this row does not carry resolves NOTHING and stamps NOTHING —
  // only a server-verified actor may resolve from metadata (§15c ordering 1 / §17b).
  const forged = await promotePaidCheckout({
    paymentIntentId: `pi_qc_${RUN}_q3_forged`,
    actor: "client",
    actorId: ids.traveler,
    metadataBookingIds: [bookingId],
    bookingIds: [bookingId],
  });
  assert.deepEqual(forged.promoted, []);
  assert.deepEqual(forged.lateAuthorized, []);
  assert.equal((await bookingRow(bookingId)).status, "payment_pending");
  assert.equal((await bookingRow(bookingId)).stripe_payment_intent_id, pi, "unchanged");

  const real = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "client",
    actorId: ids.traveler,
    bookingIds: [bookingId],
  });
  assert.deepEqual(real.promoted, [bookingId]);
  assert.equal((await bookingRow(bookingId)).status, "confirmed");
});

test("Q4 · §14: the body is an allowlist — no amount, price, userId or quote id is admissible, and the charge is the ROW's", async () => {
  for (const body of [
    { quoteBookingId: "b1", amount: 1 },
    { quoteBookingId: "b1", price: "0.01" },
    { quoteBookingId: "b1", userId: "someone-else" },
    { quoteBookingId: "b1", quoteId: "q1" },
    { quoteBookingId: "b1", idempotencyKey: "mine" },
    { quoteBookingId: "b1", chargeAmount: 0 },
  ]) {
    assert.equal(
      quoteCheckoutBodySchema.safeParse(body).success,
      false,
      `.strict() must REFUSE ${JSON.stringify(body)} rather than silently strip it`,
    );
  }
  assert.equal(quoteCheckoutBodySchema.safeParse({ quoteBookingId: "b1" }).success, true);
  assert.equal(quoteCheckoutBodySchema.safeParse({ quoteBookingId: "b1", useSavedCard: true }).success, true);

  // And the amount actually resolved is the row's, whatever a caller might wish.
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 77700 });
  const row = await bookingRow(bookingId);
  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  assert.equal(p.subtotal, parseFloat(row.total_amount));
});

test("Q5 · an EXPIRED quote refuses 409 `quote_expired` with its expiry — no claim, no marker, nothing repriced", async () => {
  const { quoteId, bookingId } = await acceptedQuoteBooking({ amountCents: 30000 });
  // Move the ACCEPTED quote's window into the past. The accept itself happened inside the window
  // (its claim carries `expires_at > NOW()`); this is the charge arriving after it lapsed.
  await db.execute(sql`UPDATE service_quotes SET expires_at = NOW() - interval '1 hour' WHERE id = ${quoteId}`);

  const r = refused(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "expired");
  assert.equal(r.status, 409);
  assert.equal(r.code, "quote_expired");
  assert.ok(r.expiresAt, "§13: the refusal states WHEN it expired");
  assert.match(r.message, /not repriced/);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "pending", "no claim was taken");
  assert.equal((row.booking_details ?? {})[STRIPE_ATTEMPT_AT_KEY], undefined, "no §15b marker");
  assert.equal(row.stripe_payment_intent_id, null);

  // A quote in any non-accepted state is its own, differently-named refusal.
  await db.execute(sql`UPDATE service_quotes SET status = 'withdrawn' WHERE id = ${quoteId}`);
  const w = refused(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "withdrawn");
  assert.equal(w.code, "quote_not_accepted");
});

test("Q6 · someone else's booking, and a booking no quote names, are the SAME 404 — never a 403", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 15000 });
  const notYours = refused(await resolveQuoteCharge({ bookingId, actorUserId: ids.other }), "not yours");
  assert.equal(notYours.status, 404, "§13/LD 40: 'no such thing' and 'not yours' are one sentence");
  assert.equal(notYours.code, "not_found");
  assert.equal((await bookingRow(bookingId)).status, "pending", "and it cost nothing");
  // The claim ITSELF is actor-scoped too — a defence in depth, not only the read above. The fee
  // snapshot is read as the OWNER (a real, resolved one — never a fabricated test literal); the
  // claim is expected to match zero rows on the actor mismatch before it is ever written.
  const ownerPlan = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "as owner");
  assert.equal(
    await claimQuoteBornBooking({ bookingId, actorUserId: ids.other, travelerServiceFee: ownerPlan.travelerServiceFee }),
    false,
  );
  assert.equal((await bookingRow(bookingId)).status, "pending");

  const missing = refused(await resolveQuoteCharge({ bookingId: `qc-${RUN}-nope`, actorUserId: ids.traveler }), "missing");
  assert.equal(missing.status, 404);
  assert.equal(missing.code, "not_found");

  // A booking with NO quote behind it (the ordinary cart rail's shape) is not addressable here:
  // the provenance is the JOIN, and there is no body-supplied quote id to trust.
  const orphanId = `qc-${RUN}-orphan`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount)
    VALUES (${orphanId}, ${createdServiceIds[createdServiceIds.length - 1]}, ${ids.traveler}, ${ids.provider}, 'pending', '10.00')
  `);
  const orphan = refused(await resolveQuoteCharge({ bookingId: orphanId, actorUserId: ids.traveler }), "orphan");
  assert.equal(orphan.status, 404);
  assert.equal(orphan.code, "not_found");
});

test("Q7 · two concurrent charges: EXACTLY ONE claim wins — the loser is refused by `AND status = 'pending'`", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 51000 });
  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  const [a, b] = await Promise.all([
    claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee }),
    claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee }),
  ]);
  assert.equal([a, b].filter(Boolean).length, 1, "the atomic conditional is the guard, not a prior read");
  const row = await bookingRow(bookingId);
  assert.equal(row.status, "payment_pending");
  assert.equal(row.stripe_payment_intent_id, null, "the loser never reached Stripe");

  // The winner's own RETRY is not a second checkout: the row now reads `alreadyClaimed`, so the arm
  // RE-DRIVES against the same rows and the SAME key rather than claiming again.
  const again = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "re-drive");
  assert.equal(again.alreadyClaimed, true);
  assert.equal(again.idempotencyKey, `quote-buy-${bookingId}`, "a retry rebuilds the key verbatim");
  assert.equal(again.subtotal, parseFloat(row.total_amount), "and charges the same amount");
  assert.ok(QUOTE_CHARGE_FROM_STATUSES.includes(row.status), "payment_pending is a chargeable from-state");
});

test("Q8 · a DEPOSIT-enabled listing charges the deposit the ACCEPT path pinned; deposit + balance === the full charge", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 120000, depositPercentage: 25 });
  const row = await bookingRow(bookingId);
  assert.ok(row.deposit_amount, "the accept rail pinned the split through the ONE resolveDepositPlan");

  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  // Ledger `2026-09-19-quote-born-traveler-fee`: the fee is assessed ONCE, at the deposit charge —
  // the amount due NOW is the deposit the accept path pinned (READ, never re-derived) PLUS the
  // fee `resolveTravelerServiceFeeSnapshot` resolved, never the deposit alone.
  assert.equal(
    p.chargeAmount,
    Math.round((parseFloat(row.deposit_amount) + p.travelerServiceFee.charged) * 100) / 100,
    "the amount due NOW is the deposit (READ, never re-derived) plus the traveler service fee",
  );
  assert.ok(p.chargeAmount! < p.subtotal, "a deposit is a PARTIAL payment by definition");
  assert.equal(
    Math.round((parseFloat(row.deposit_amount) + parseFloat(row.balance_amount)) * 100),
    Math.round(p.subtotal * 100),
    "the traveler pays the same total, split in time — the fee rides ON TOP of that total, not inside it",
  );

  await claimQuoteBornBooking({
    bookingId,
    actorUserId: ids.traveler,
    travelerServiceFee: p.travelerServiceFee,
    balanceDueAt: p.balanceDueAt,
  });
  const claimed = await bookingRow(bookingId);
  assert.equal(claimed.deposit_amount, row.deposit_amount, "the claim does not re-split");
  assert.equal(claimed.balance_amount, row.balance_amount);
  // §13: a quote-born row carries no booked slot and no scheduled date, so no honest cutoff exists
  // and the column is LEFT NULL rather than given a guessed deadline.
  assert.equal(p.balanceDueAt, null);
  assert.equal(claimed.balance_due_at, null);
});

test("Q9 · the TTL sweep treats it as a cart row: an UNMARKED claim voids, a MARKED one is never auto-voided", async () => {
  const unmarked = await acceptedQuoteBooking({ amountCents: 9000 });
  const marked = await acceptedQuoteBooking({ amountCents: 9500 });
  for (const b of [unmarked, marked]) {
    const bp = plan(await resolveQuoteCharge({ bookingId: b.bookingId, actorUserId: ids.traveler }), "resolve");
    await claimQuoteBornBooking({ bookingId: b.bookingId, actorUserId: ids.traveler, travelerServiceFee: bp.travelerServiceFee });
    await db.execute(sql`UPDATE service_bookings SET created_at = NOW() - interval '2 hours' WHERE id = ${b.bookingId}`);
  }
  await markStripeAttempt([marked.bookingId], `pi-quote-buy-${marked.bookingId}`);

  const swept = await sweepExpiredCheckoutClaims({
    onlyBookingIds: [unmarked.bookingId, marked.bookingId],
    // Stripe is deliberately UNREACHABLE for the marked row — the lookup THROWS, which is how the
    // contract spells "could not be consulted". The sweep's answer under uncertainty is always
    // "do nothing", so it must quarantine rather than void.
    stripeIntentLookup: async () => {
      throw new Error("stripe unreachable (fixture)");
    },
  });
  assert.equal(swept.voidedUnreached, 1, "the unmarked quote-born claim is provably un-attempted and is reclaimed");
  assert.equal(swept.quarantined, 1, "the marked one is quarantined — a paid booking is never voided");
  assert.equal((await bookingRow(unmarked.bookingId)).status, CLAIM_EXPIRED_STATUS);
  assert.equal((await bookingRow(marked.bookingId)).status, "payment_pending", "still reclaimable, never destroyed");
});

test("Q10 · §17/§19b see it as a cart row: the drift job's expected charge matches, and the marker clears provenance", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 64000 });
  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  await claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee });
  await markStripeAttempt([bookingId], `pi-${p.idempotencyKey}`);
  await stampAuthorization([bookingId], `pi_qc_${RUN}_q10`);
  const row = await bookingRow(bookingId);

  // §17 rule 3: the expected charge is SERVER-DERIVED through the ONE `travelerChargeForRow` the
  // drift job itself calls. It equals what the arm charged BECAUSE the claim stamped the A3
  // snapshot — without it this row would read pre-A3 and the job would expect total + platform_fee.
  const expected = travelerChargeForRow({
    totalAmount: row.total_amount,
    platformFee: row.platform_fee,
    conciergeFeeSnapshot: (row.booking_details ?? {})[TRAVELER_CHARGE_SNAPSHOT_KEY]?.conciergeFee ?? null,
  });
  assert.equal(expected.basis, "a3_snapshot");
  assert.equal(expected.amount, p.subtotal, "the drift job and the charge agree, so no phantom exception");

  // §19b: the row's payment provenance clears via the §15b marker the spine wrote — the same
  // predicate a cart row clears by. (Stripe's own `metadata.bookingIds` is the second, independent
  // form; the arm supplies it too, through the unchanged `createPaymentIntent`.)
  assert.ok((row.booking_details ?? {})[STRIPE_ATTEMPT_AT_KEY], "the marker is the provenance §19b reads");
  assert.ok(row.stripe_payment_intent_id, "and the column the §17 scan keys on is populated");
});

test("Q11 · the §15 key template is RATCHETED into the K1 pinned set, with its reason", async () => {
  const k1 = fs.readFileSync(
    path.join(process.cwd(), "server/__tests__/offering-contract-snapshot.test.ts"),
    "utf8",
  );
  assert.ok(
    k1.includes('"quote-buy-${String(row.id)}"'),
    "K1 pins the exact key-template SET; a new key must be ratcheted in deliberately, never by a superset",
  );
  assert.ok(k1.includes("2026-09-18-quote-born-charge"), "and the pin names the ledger row that added it");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Q12–Q14 — LD 49's DELIBERATE NEGATIVE SPACE, CLOSED (decision-maker ruling, ledger
// `2026-09-19-quote-born-traveler-fee`): the ruled traveler service fee now applies to a
// quote-born booking exactly like every other service booking, resolved through the SAME
// `resolveTravelerServiceFeeSnapshot` the cart arm calls (§18 rule 1), waived by the SAME Trip
// Pass entitlement check. See quote-charge.service.ts's rewritten header section.
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("Q12 · the ruled traveler service fee is ADDED and SNAPSHOTTED (no waiver): amount = quote + fee, band-derived, never a literal", async () => {
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 50000 }); // $500, deposits off
  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");

  // NO LITERAL (§8): the expected fee is read straight off the SAME `fee_bands` row the resolver
  // itself reads — never typed here as "7%" or "$25".
  const band = await requireBand(TRAVELER_SERVICE_FEE_BAND);
  const uncapped = round2(p.subtotal * band.rate);
  const expectedFee = band.maxAmount !== null && uncapped > band.maxAmount ? band.maxAmount : uncapped;

  assert.equal(p.travelerServiceFee.bandKey, band.bandKey);
  assert.equal(p.travelerServiceFee.rate, band.rate);
  assert.equal(p.travelerServiceFee.wouldHaveBeen, expectedFee);
  assert.equal(p.travelerServiceFee.charged, expectedFee, "not covered ⇒ the full fee rides the charge");
  assert.equal(p.travelerServiceFee.waived, false);
  assert.equal(p.travelerServiceFee.waiverBasis, null);
  assert.equal(p.coveredByTripPass, false, "no trip_id on the row (see the header) ⇒ never covered");
  assert.equal("chargeAmount" in p, false, "deposits are off for this listing ⇒ the full amount+fee is due");

  await claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee });
  const claimed = await bookingRow(bookingId);
  const stamped = (claimed.booking_details ?? {}).travelerServiceFee;
  assert.ok(stamped, "the claim stamps the SAME snapshot the resolve computed, in the SAME statement as the A3 one");
  assert.equal(stamped.charged, expectedFee);
  assert.equal(stamped.bandKey, band.bandKey);
  assert.equal(stamped.waived, false);

  // A RE-DRIVE (already claimed, unauthorized) reads the STAMPED snapshot BACK rather than
  // re-resolving it — the same band-drift-safety posture the A3 `travelerCharge` read takes (§13).
  const redrive = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "redrive");
  assert.equal(redrive.alreadyClaimed, true);
  assert.deepEqual(redrive.travelerServiceFee, p.travelerServiceFee);
});

test("Q13 · Trip Pass coverage WAIVES the fee, exactly as on the cart — charged 0, wouldHaveBeen the real amount", async () => {
  // Ledger `2026-09-19-quote-plan-link` (migration 314; supersedes this test's earlier raw-SQL
  // `UPDATE service_bookings SET trip_id = …` fixture): a quote asked FROM a plan now carries that
  // plan onto its booking through the REAL request → issue → accept rails, the same live path
  // `acceptedQuoteBooking` already exercises for every other fact in this file. This is no longer
  // a simulation of a future lane's write — `acceptQuote` is the writer, today, on `main`.
  const tripId = `qc-${RUN}-trip`;
  createdTripIds.push(tripId);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${tripId}, ${ids.traveler}, ${`QC trip ${RUN}`}, '2030-01-01', '2030-01-05', 'Kyoto, Japan')
  `);
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 80000, tripId }); // $800, deposits off

  await db.execute(sql`
    INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source_payment_id, allowances_snapshot)
    VALUES (${`qc-${RUN}-tp`}, ${tripId}, 'trip_pass', 'active', ${`pi_qc_tp_${RUN}`}, '{}'::jsonb)
  `);

  const p = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "resolve");
  assert.equal(p.coveredByTripPass, true);
  assert.equal(p.travelerServiceFee.waived, true);
  assert.equal(p.travelerServiceFee.waiverBasis, "trip_pass");
  assert.equal(p.travelerServiceFee.charged, 0, "a covered line charges NO fee — nothing rides the Stripe total");
  assert.ok(
    p.travelerServiceFee.wouldHaveBeen > 0,
    "wouldHaveBeen states the REAL band-priced amount — never 0-because-waived masquerading as 0-because-the-band-said-so",
  );

  await claimQuoteBornBooking({ bookingId, actorUserId: ids.traveler, travelerServiceFee: p.travelerServiceFee });
  const claimed = await bookingRow(bookingId);
  const stamped = (claimed.booking_details ?? {}).travelerServiceFee;
  assert.equal(stamped.waived, true);
  assert.equal(stamped.waiverBasis, "trip_pass");
  assert.equal(stamped.charged, 0);
  assert.equal(stamped.wouldHaveBeen, p.travelerServiceFee.wouldHaveBeen, "the −X fee_waiver ledger leg reads THIS number");
});

test("Q14 · the fee is resolved from the fee_bands ROW — editing the band changes the fee, never a code literal", async () => {
  const band = await requireBand(TRAVELER_SERVICE_FEE_BAND);
  // $100 at either the current rate or double it stays well under the band's $-cap, so this test
  // proves the RATE relationship without also exercising the cap (A5 in fee-resolution-authority
  // already proves the cap on its own).
  const { bookingId } = await acceptedQuoteBooking({ amountCents: 10000 });

  const before1 = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "before the band edit");
  assert.equal(before1.travelerServiceFee.rate, band.rate);
  assert.equal(before1.travelerServiceFee.charged, round2(before1.subtotal * band.rate));

  const doubledRate = round2(band.rate * 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${doubledRate} WHERE band_key = ${TRAVELER_SERVICE_FEE_BAND}`);
  try {
    // The SAME booking, still unclaimed — a fresh resolve reads the band again rather than
    // caching anything, exactly as a service-category band edit reaches `resolveProviderRate`
    // with no service row touched (ruling 32's own A1 proof, one band over).
    const after1 = plan(await resolveQuoteCharge({ bookingId, actorUserId: ids.traveler }), "after the band edit");
    assert.equal(after1.travelerServiceFee.rate, doubledRate);
    assert.equal(after1.travelerServiceFee.charged, round2(after1.subtotal * doubledRate));
    assert.equal(
      Math.round(after1.travelerServiceFee.charged * 100),
      Math.round(before1.travelerServiceFee.charged * 2 * 100),
      "doubling the band rate doubles the resolved fee — no per-service snapshot outranks it, no code literal stands in for it",
    );
  } finally {
    // Restore ALWAYS, even on assertion failure, so a red run never leaves a mutated band for the
    // suites that run after this one.
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${band.rate} WHERE band_key = ${TRAVELER_SERVICE_FEE_BAND}`);
  }
});
