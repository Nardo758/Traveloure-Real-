/**
 * R-1 — THE TRANSPORT RAIL RECORDS ITS PaymentIntent (ledger `2026-09-14-transport-confirm-stamps-pi`).
 *
 * THE DEFECT. `handleStripePaymentSuccess` — the `checkout.session.completed` handler for
 * platform transport — promoted the booking to `confirmed` and wrote `confirmationCode: session.id`
 * (the CHECKOUT SESSION id) and nothing else about the payment. `service_bookings.
 * stripe_payment_intent_id` stayed NULL on a row the traveler had genuinely paid for, and two
 * consumers key on that column:
 *
 *   · `POST /api/bookings/:id/cancel` computes a policy quote, then gates the refund on
 *     `!!booking.stripePaymentIntentId`. A transport row failed that third conjunct, so a
 *     cancellation the policy said was 100% refundable went STATUS-ONLY and the traveler's money
 *     stayed put — with no error anywhere, because the else-branch is a legitimate outcome for a
 *     non-refundable booking.
 *   · `stripeReconciliation.ts`'s B-arm raises `booking_confirmed_no_pi` at CRITICAL for exactly
 *     this shape, so the rail also generated a standing drift exception that was never drift.
 *
 * THE FIX, AND WHY IT IS ONE LINE OF CALL AND NOT ONE LINE OF UPDATE. §19a makes
 * `checkout-claim.service.ts` the SOLE writer of that column, so the transport stamp was added
 * THERE (`stampTransportPaymentIntent`) and the handler is one more caller. It could not reuse
 * `stampAuthorization`, whose from-state is the cart claim's `payment_pending` + NULL: a transport
 * row is born `pending` and never enters that state, so the shared writer would have matched zero
 * rows and silently done nothing — the same disjoint-predicate failure §15c fixed one layer up.
 *
 * ── THE SIX PROOFS ───────────────────────────────────────────────────────────────────────────
 *   T1  a completed session records the id EXACTLY ONCE; the replay is a no-op that writes nothing.
 *   T2  the from-state list is honest: a terminal row is REFUSED (V-8's rule, one column over) and
 *       a `confirmed`-with-no-id row is the CATCH-UP case and is stamped.
 *   T3  a foreign PaymentIntent never overwrites one already recorded.
 *   T4  the cancel path: before the stamp `refundServiceBooking` refuses outright ("no payment
 *       intent to refund") — the status-only outcome R-1 names — and after it the row carries the
 *       id the route's third conjunct reads, with the quote SERVER-derived from the row (§14).
 *   T5  the route's own shape: the three conjuncts, the server-derived amount, the idempotency key
 *       and the atomic claim, pinned so a later edit cannot quietly drop one.
 *   T6  N17c's posture on this rail: the id can only ever be Stripe's own word — the handler takes
 *       a session id and re-retrieves the session server-side, its only caller is the
 *       signature-verified webhook, and `service_bookings.stripe_payment_intent_id` still has ONE
 *       writer file across the whole of `server/`.
 *   T7  (R-2, ledger `2026-09-14-transport-card-cancel`) the cancel route's NON-refund branch —
 *       the one this file's own R-1 note recorded as a check-then-update with no
 *       `expectedFromStatuses` (§18b shape). The flip now carries the SHARED from-state list, so a
 *       row that left a cancellable state between the handler's read and its write is REFUSED and
 *       writes nothing, rather than a second cancellation landing on a completed or already
 *       cancelled booking. Proven against a real database, both directions, plus the route shape.
 *
 * ONE FINDING BEYOND R-1'S TEXT, recorded and not repaired: R-1 reads the handler as storing the
 * checkout SESSION id as the confirmation code. It stores NOTHING — `service_bookings` has no
 * `confirmation_code` column, and the `serviceBookings as any` on that UPDATE makes drizzle drop the
 * unknown key in silence (the V-14 shape). T1 pins the column's absence so the day someone adds one,
 * the question of what a transport confirmation code should be gets ANSWERED rather than assumed.
 *
 * NEGATIVE SPACE, stated because it is the load-bearing half. No live Stripe refund is executed:
 * CI has no Stripe key and no network to Stripe, so T4 proves the refund branch's INPUTS (the
 * refusal that the missing id caused, and its disappearance) rather than a completed refund. T5 and
 * T6 are STATIC pins over the file set with comments stripped — they see the shape of the code, not
 * its behaviour, and a rail that reaches the column under a different spelling is outside T6's
 * predicate. Nothing here asserts anything about rows already on disk: they are §19b's business and
 * this lane leaves their detection exactly as it found it.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by it and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/transport-payment-intent.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
// STRIPE TEST MODE ONLY, and never actually called — the same posture as the promotion and
// birth-provenance suites: a live key is REFUSED, not merely left unused.
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_transport_pi_suite";
}
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  stampTransportPaymentIntent,
  TRANSPORT_PI_STAMPABLE_FROM,
} from "../services/checkout-claim.service";
import { quoteCancellationForBooking } from "../services/cancellation-policy.service";
import { storage } from "../storage";
import { BOOKING_CANCELLABLE_FROM_STATUSES } from "@shared/booking-cancellation";
import { travelerChargeForRow } from "../services/traveler-charge";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  traveler: `tpi-${RUN}-trav`,
  trip: `tpi-${RUN}-trip`,
};
const createdBookingIds: string[] = [];

/** The id a hostile caller would plant. Well-formed on purpose: the defect was never the string's
 *  shape, it was that nobody could say where it came from. */
const FOREIGN_PI = `pi_${RUN}_not_this_session`;

const SERVER = path.join(process.cwd(), "server");
const STRIPE_SERVICE = path.join(SERVER, "services", "stripe.service.ts");
const CLAIM_SERVICE = path.join(SERVER, "services", "checkout-claim.service.ts");
const PAYMENT_SERVICE = path.join(SERVER, "services", "stripe-payment.service.ts");
const ROUTES = path.join(SERVER, "routes.ts");

/** Comments stripped so a pin can never be satisfied by the prose that RECORDS a removal — the
 *  trap `2026-09-13-punchlist-reverified` wrote down. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1"))
    .join("\n");
}
function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ─────
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
      `[transport-payment-intent] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/**
 * A transport booking exactly as `createTransportBookingCheckout` births one: `service_id` NULL
 * (the documented transport-commerce exception), `status='pending'`, no PaymentIntent, and the
 * locked traveler-service-fee snapshot in `booking_details`.
 */
async function seedTransportBooking(opts: {
  status: string;
  paymentIntentId?: string | null;
  totalAmount?: string;
}): Promise<string> {
  const id = `booking-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  const details = JSON.stringify({
    bookingType: "transport",
    optionId: `tpi-${RUN}-opt`,
    travelers: 2,
    transportMode: "train",
    currency: "USD",
    travelerServiceFee: {
      charged: 9.99,
      wouldHaveBeen: 9.99,
      rate: null,
      bandId: null,
      bandKey: "traveler_service_fee",
      capApplied: false,
      waived: false,
      waiverBasis: null,
    },
  });
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, trip_id, status, total_amount,
                                  stripe_payment_intent_id, booking_details)
    VALUES (${id}, NULL, ${ids.traveler}, ${ids.trip}, ${opts.status},
            ${opts.totalAmount ?? "240.00"}, ${opts.paymentIntentId ?? null}, ${details}::jsonb)
  `);
  createdBookingIds.push(id);
  return id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, total_amount, platform_fee,
           insurance_fee, updated_at, booking_details
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`tpi-${RUN}-trav@t.test`}, 'TPI', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'TPI fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.traveler}`).catch(() => {});
});

// ══ T1 — recorded exactly once; the replay writes nothing ════════════════════════════════════
test("T1: a completed session records the PaymentIntent once; a replayed delivery is a no-op", async () => {
  const bookingId = await seedTransportBooking({ status: "pending" });
  const pi = `pi_${RUN}_first`;

  const first = await stampTransportPaymentIntent(bookingId, pi);
  assert.equal(first.stamped, true, "the first delivery must record the id");
  assert.equal(first.alreadyStamped, false);
  assert.equal(first.refusedReason, null);

  const afterFirst = await readBooking(bookingId);
  assert.equal(afterFirst.stripe_payment_intent_id, pi, "the column must carry Stripe's own id");
  assert.equal(afterFirst.status, "pending", "the stamp alone must not move the status");

  // RECORDED, NOT FIXED (this lane's one finding beyond R-1's text). R-1 reads the handler as
  // storing the CHECKOUT SESSION id as the confirmation code. It stores nothing at all:
  // `service_bookings` has NO `confirmation_code` column — `shared/schema.ts` does not declare one
  // — and the handler's UPDATE is written `.update(serviceBookings as any)`, so drizzle silently
  // DROPS the unknown key (the V-14 shape: an `as any` hiding an inert write). The assertion below
  // is the tripwire: whether a transport booking should carry a confirmation code AT ALL, and what
  // it should be, is a decision-maker's ruling, and it is not taken here. If the column appears,
  // this fails and the question has to be answered rather than assumed.
  const col = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_bookings' AND column_name = 'confirmation_code'
  `);
  assert.equal(
    col.rows.length,
    0,
    "service_bookings carries no confirmation_code column, so the transport handler's " +
      "`confirmationCode: session.id` is INERT — recorded as an open question, not repaired here",
  );

  const second = await stampTransportPaymentIntent(bookingId, pi);
  assert.equal(second.stamped, false, "a replay must not write a second time");
  assert.equal(second.alreadyStamped, true, "a replay of the SAME id is an idempotent no-op, not a refusal");
  assert.equal(second.refusedReason, null);

  const afterSecond = await readBooking(bookingId);
  assert.equal(afterSecond.stripe_payment_intent_id, pi);
  assert.equal(
    new Date(afterSecond.updated_at).getTime(),
    new Date(afterFirst.updated_at).getTime(),
    "a replay must touch NOTHING — an updated_at bump means the UPDATE matched, which is the " +
      "check-then-write shape §15 forbids",
  );
});

// ══ T2 — the from-state list is honest in both directions ════════════════════════════════════
test("T2: a terminal row is refused; a confirmed row with no id is the catch-up case", async () => {
  // The declared list IS the from-state, read from the module, never restated here (§18 rule 1).
  assert.deepEqual(
    [...TRANSPORT_PI_STAMPABLE_FROM].slice().sort(),
    ["confirmed", "pending"],
    "the stampable set is the birth state plus the catch-up state, and nothing terminal",
  );

  for (const terminal of ["cancelled", "refunded", "expired", "failed"]) {
    const id = await seedTransportBooking({ status: terminal });
    const res = await stampTransportPaymentIntent(id, `pi_${RUN}_${terminal}`);
    assert.equal(res.stamped, false, `${terminal}: a row that left the promotable set is never stamped`);
    assert.equal(res.alreadyStamped, false);
    assert.equal(res.refusedReason, "not_stampable_status");
    assert.equal(res.status, terminal, "§13: the refusal reports the row's real status, never a guess");
    const row = await readBooking(id);
    assert.equal(row.stripe_payment_intent_id, null, `${terminal}: nothing may be written`);
  }

  // The CATCH-UP case: a row an earlier delivery already promoted (or one confirmed before this
  // lane existed) still accepts Stripe's own id for that session. A recovery, never a backfill.
  const legacy = await seedTransportBooking({ status: "confirmed" });
  const pi = `pi_${RUN}_catchup`;
  const res = await stampTransportPaymentIntent(legacy, pi);
  assert.equal(res.stamped, true, "a confirmed-with-no-id row is exactly what this lane exists to repair");
  assert.equal((await readBooking(legacy)).stripe_payment_intent_id, pi);

  // A booking that does not exist is a NAMED refusal, not a silent success.
  const gone = await stampTransportPaymentIntent(`tpi-${RUN}-nope`, pi);
  assert.equal(gone.stamped, false);
  assert.equal(gone.refusedReason, "booking_absent");
});

// ══ T3 — a foreign PaymentIntent never overwrites one already recorded ═══════════════════════
test("T3: an id already on the row is never replaced by a different one", async () => {
  const bookingId = await seedTransportBooking({ status: "confirmed", paymentIntentId: `pi_${RUN}_real` });
  const res = await stampTransportPaymentIntent(bookingId, FOREIGN_PI);
  assert.equal(res.stamped, false);
  assert.equal(res.alreadyStamped, false);
  assert.equal(res.refusedReason, "different_payment_intent");
  assert.equal(res.existingPaymentIntentId, `pi_${RUN}_real`);
  assert.equal(
    (await readBooking(bookingId)).stripe_payment_intent_id,
    `pi_${RUN}_real`,
    "the NULL predicate in the UPDATE is what makes this structural, not a code path someone must remember",
  );
});

// ══ T4 — the cancel path, before and after ═══════════════════════════════════════════════════
test("T4: the refund branch — refused without the id, reachable with it, amount server-derived", async () => {
  const bookingId = await seedTransportBooking({ status: "confirmed", totalAmount: "240.00" });

  // The policy quote is server-derived and says a refund IS owed: a transport row has no
  // `service_id`, so the policy defaults to `flexible`, and it carries no `scheduledDate`, so the
  // most generous tier applies (cancellation-policy.service.ts's documented edge cases).
  const quote = await quoteCancellationForBooking(bookingId);
  assert.ok(quote, "the quote must resolve for a transport row");
  assert.equal(quote!.automaticRefundAllowed, true);
  assert.ok(quote!.refundAmount > 0, "a refund is OWED here — this is the case R-1 says went status-only");

  // §14: the amount is composed from the ROW by the ONE `travelerChargeForRow`, never from a
  // request. Recomputed here from the persisted columns, so a quote that started reading anything
  // else would fail this.
  const row = await readBooking(bookingId);
  const { amount: charged } = travelerChargeForRow({
    totalAmount: row.total_amount,
    platformFee: row.platform_fee,
    insuranceFee: row.insurance_fee,
    conciergeFeeSnapshot: (row.booking_details as any)?.travelerCharge?.conciergeFee ?? null,
  });
  assert.equal(quote!.refundAmount, charged, "the refund basis is the row's own charged amount");

  // BEFORE the stamp: the refunder refuses outright. This is the defect, reproduced at the
  // service — the route never even reaches here, because its third conjunct is false first.
  assert.equal(row.stripe_payment_intent_id, null);
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await assert.rejects(
    () => stripePaymentService.refundServiceBooking(bookingId, "requested_by_customer", {
      amountOverride: quote!.refundAmount,
      feeRefundPercent: quote!.refundPercent,
    }),
    /no payment intent to refund/i,
    "without the id there is nothing to refund against — the traveler's money stays put",
  );
  assert.equal(
    (await readBooking(bookingId)).status,
    "confirmed",
    "the refusal must not have moved the row (the claim is taken AFTER this gate)",
  );

  // AFTER the stamp: the column the route's third conjunct reads is populated, so the refund
  // branch is the one taken. (The live Stripe call is deliberately not executed — see the header.)
  const pi = `pi_${RUN}_cancel`;
  assert.equal((await stampTransportPaymentIntent(bookingId, pi)).stamped, true);
  assert.equal((await readBooking(bookingId)).stripe_payment_intent_id, pi);
});

// ══ T5 — the route and the refunder keep their §14/§15 shape ═════════════════════════════════
test("T5: the cancel route derives its amount, and the refunder carries a key and a claim", () => {
  const routes = stripComments(read(ROUTES));

  // The three conjuncts, unchanged — this lane fixed the INPUT to the third, not the gate.
  assert.match(
    routes,
    /const refundDue =\s*quote\.automaticRefundAllowed && quote\.refundAmount > 0 && !!booking\.stripePaymentIntentId;/,
    "the refund gate must still read the policy quote AND the row's own PaymentIntent",
  );
  // §14: what is refunded comes from the server-derived quote, never from the request.
  assert.match(routes, /amountOverride: quote\.refundAmount/, "the refund amount is the quote's, not the body's");
  assert.match(routes, /feeRefundPercent: quote\.refundPercent/);
  const cancelHandler = routes.slice(routes.indexOf('app.post("/api/bookings/:id/cancel"'));
  const handlerBody = cancelHandler.slice(0, cancelHandler.indexOf('app.post("/api/expert/reviews/:id/respond"'));
  assert.ok(handlerBody.length > 0, "the cancel handler must still be locatable");
  assert.ok(
    !/req\.body\.(amount|price|refund|total)/i.test(handlerBody),
    "§14: no money term may be read from the request body on this path",
  );
  assert.ok(
    !/money-derive-ok/.test(handlerBody),
    "this lane added no escape hatch, and none should appear here",
  );

  const payment = stripComments(read(PAYMENT_SERVICE));
  const refunder = payment.slice(payment.indexOf("async refundServiceBooking("));
  assert.ok(refunder.length > 0, "refundServiceBooking must still exist");
  // §15, both layers: a deterministic Stripe idempotency key AND an atomic status claim.
  assert.match(refunder, /\{ idempotencyKey \}/, "the Stripe refund must carry an idempotency key");
  assert.match(
    refunder,
    /UPDATE service_bookings SET status = 'refunded', updated_at = NOW\(\)\s*\n?\s*WHERE id = \$\{bookingId\} AND status <> 'refunded'/,
    "the status claim must be the atomic conditional, never a check-then-update",
  );
});

// ══ T6 — provenance: the id can only ever be Stripe's own word, and ONE file writes the column ══
test("T6: a client-supplied PaymentIntent can never reach this column", () => {
  const stripeSvc = stripComments(read(STRIPE_SERVICE));
  const handler = stripeSvc.slice(stripeSvc.indexOf("export async function handleStripePaymentSuccess"));
  assert.ok(handler.length > 0, "handleStripePaymentSuccess must still exist");

  // (a) The handler's only input is a session ID, and the session is RE-RETRIEVED server-side with
  //     the platform's own key — the id is Stripe's word, twice over (§17b).
  assert.match(
    stripeSvc,
    /export async function handleStripePaymentSuccess\(sessionId: string\): Promise<void>/,
    "the handler takes a session id and nothing else — no PaymentIntent parameter exists to pass",
  );
  assert.match(
    handler,
    /await stripe\.checkout\.sessions\.retrieve\(sessionId\)/,
    "the session must be re-read from Stripe, never trusted from a caller's object",
  );
  assert.match(
    handler,
    /session\.payment_intent/,
    "the id must be read off that retrieved session",
  );
  assert.ok(!/req\./.test(handler), "no request object reaches this handler at all");

  // (b) Its only caller is the signature-verified webhook, on the transport branch.
  const payment = stripComments(read(PAYMENT_SERVICE));
  assert.match(
    payment,
    /metadata\?\.type === 'transport_booking'\)\s*\{\s*await handleStripePaymentSuccess\(session\.id\)/,
    "the handler is reached from the verified checkout.session.completed delivery and nowhere else",
  );

  // (c) THE ONE-WRITER PIN (§19a). Across every .ts under server/ (comments stripped, tests and
  //     seeds excluded), the ONLY file that SETs service_bookings.stripe_payment_intent_id — in a
  //     drizzle `.update(serviceBookings).set({…})` or a raw `UPDATE service_bookings … SET` — is
  //     checkout-claim.service.ts. The transport stamp added a from-state list there, not a second
  //     writer here.
  //
  //     NEGATIVE SPACE: this is a SHAPE scan. It sees the two ways this codebase writes the column
  //     today; a rail reaching it through an unrecognised spelling (a dynamic table name, a helper
  //     that builds the SET clause) is outside the predicate. It also says nothing about INSERTs —
  //     birth is ruling 46's subject and `booking-birth-provenance.db.test.ts` B1–B3 own it.
  const writers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__" || entry === "dist" || entry === "seeds") continue;
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts")) {
        const text = stripComments(fs.readFileSync(full, "utf8"));
        let hit = false;
        for (const seg of text.split(/\.update\(\s*serviceBookings/).slice(1)) {
          const i = seg.indexOf(".where(");
          if (/stripePaymentIntentId/.test(i < 0 ? seg : seg.slice(0, i))) hit = true;
        }
        for (const seg of text.split(/UPDATE\s+service_bookings/i).slice(1)) {
          const i = seg.search(/\bWHERE\b/i);
          if (/stripe_payment_intent_id/.test(i < 0 ? seg : seg.slice(0, i))) hit = true;
        }
        if (hit) writers.push(path.relative(SERVER, full));
      }
    }
  };
  walk(SERVER);
  assert.deepEqual(
    writers.sort(),
    ["services/checkout-claim.service.ts"],
    "§19a: stripe_payment_intent_id keeps ONE writer file. A second UPDATE site — however " +
      "well-intentioned — is the violation, not a convenience.",
  );
  assert.match(
    stripComments(read(CLAIM_SERVICE)),
    /export async function stampTransportPaymentIntent\(/,
    "the transport stamp lives in that one writer file",
  );
  assert.match(
    stripComments(read(STRIPE_SERVICE)),
    /import \{ stampTransportPaymentIntent \} from "\.\/checkout-claim\.service";/,
    "and the transport handler is a CALLER of it",
  );
});

// ══ T7 — the NON-refund branch's transition is the guard (R-2; §18b) ═════════════════════════
//
// R-1 recorded this as a finding and did not fix it: `POST /api/bookings/:id/cancel` checked the
// booking's status at the TOP of the handler and then, on the else-branch, called
// `updateServiceBookingStatus(id, "cancelled", reason)` with no from-state list — a check-then-
// update, which §15 names as the TOCTOU bug rather than a guard. The two are separated by an
// awaited policy quote, so a concurrent cancellation, a provider status flip or a late paid
// signal can move the row in between, and the second write would land on it unconditionally.
//
// The refund branch never had this problem: `refundServiceBooking` takes its own atomic claim
// (`... AND status <> 'refunded'`, pinned by T5). This closes the other branch with the SAME
// list the handler's 400 reads, so the check and the guard cannot disagree (§18 rule 1).
test("T7: a row that has left a cancellable state is REFUSED, and writes nothing", async () => {
  // (a) FROM a cancellable state: the flip lands, exactly once.
  const live = await seedTransportBooking({ status: "pending" });
  const flipped = await storage.updateServiceBookingStatus(
    live,
    "cancelled",
    "T7 first cancellation",
    BOOKING_CANCELLABLE_FROM_STATUSES,
  );
  assert.ok(flipped, "a pending transport booking must still be cancellable");
  assert.equal(flipped!.status, "cancelled");
  const afterFirst = await readBooking(live);
  assert.equal(afterFirst.status, "cancelled");

  // (b) The SECOND attempt on the same row — the concurrent-caller case — matches nothing.
  //     Before this lane it re-wrote `cancelled_at` and `cancellation_reason` on an already
  //     cancelled booking and reported success to a traveler who had cancelled nothing.
  const replay = await storage.updateServiceBookingStatus(
    live,
    "cancelled",
    "T7 replayed cancellation",
    BOOKING_CANCELLABLE_FROM_STATUSES,
  );
  assert.equal(replay, undefined, "the UPDATE must match zero rows, so nothing comes back");
  const afterReplay = await readBooking(live);
  assert.equal(afterReplay.status, "cancelled");
  assert.equal(
    String(afterReplay.updated_at),
    String(afterFirst.updated_at),
    "a refused transition must not touch the row at all — not even its timestamps",
  );

  // (c) A row in a state the cancel rail never accepts is refused the same way. `completed` is the
  //     one that matters: a booking whose money has been released is not a cancellation away from
  //     anything, and a status-only flip there would strand released earnings against a
  //     'cancelled' row.
  for (const terminal of ["completed", "refunded"]) {
    const id = await seedTransportBooking({ status: terminal });
    const refused = await storage.updateServiceBookingStatus(
      id,
      "cancelled",
      "T7 terminal",
      BOOKING_CANCELLABLE_FROM_STATUSES,
    );
    assert.equal(refused, undefined, `${terminal} must not be cancellable through this rail`);
    assert.equal((await readBooking(id)).status, terminal, `${terminal} must be unchanged`);
  }

  // (d) THE ROUTE'S OWN SHAPE. The list is the shared one, it reaches the UPDATE, and a refused
  //     transition is REPORTED (§13) rather than dressed up as a successful cancellation with a
  //     notification and a refund line behind it.
  const routes = stripComments(read(ROUTES));
  assert.match(
    routes,
    /import \{ BOOKING_CANCELLABLE_FROM_STATUSES, isBookingCancellable \} from "@shared\/booking-cancellation";/,
    "the route reads the shared from-state list rather than restating the statuses",
  );
  const cancelAt = routes.indexOf('app.post("/api/bookings/:id/cancel"');
  const handler = routes.slice(cancelAt, routes.indexOf('app.post("/api/expert/reviews/:id/respond"'));
  assert.ok(handler.length > 0, "the cancel handler must still be locatable");
  assert.match(
    handler,
    /updateServiceBookingStatus\(\s*req\.params\.id,\s*"cancelled",\s*reason,\s*BOOKING_CANCELLABLE_FROM_STATUSES,\s*\)/,
    "§18b: the non-refund branch's UPDATE carries its from-state list",
  );
  assert.match(
    handler,
    /if \(!updated\) \{[\s\S]{0,400}?res\.status\(409\)/,
    "a refused transition answers 409 and stops — never a notification for a cancellation that did not happen",
  );
  assert.ok(
    !/booking\.status !== "pending" && booking\.status !== "confirmed"/.test(handler),
    "the re-typed status pair must be gone, not merely shadowed by the shared predicate",
  );
});
