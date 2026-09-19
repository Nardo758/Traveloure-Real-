/**
 * THE QUOTE-BORN BOOKING CHARGE — the DECISION and the CLAIM of `/api/checkout`'s second arm.
 *
 * Decision-maker ruling: LD 49's filed lane (ledger `2026-09-18-quote-born-charge`). D-28..D-31
 * (ledger `2026-09-15-d28-d31-service-quotes`) built the quote state machine and stated its own
 * negative space in `service-quotes.service.ts`'s header: *"THE CHARGE. The quote-born booking is
 * BORN unpaid (`pending`); feeding the quoted amount into `POST /api/checkout` … is a separate
 * lane."* This is that lane, and it is deliberately ONE ARM ON THE EXISTING CHECKOUT — not a
 * second checkout, not a second PaymentIntent creation site, not a second promotion.
 *
 * WHAT THIS MODULE IS. Two functions and nothing else:
 *   · `resolveQuoteCharge` — READ-ONLY. It answers "may this session user charge this booking, and
 *     for how much?" from the DB alone. It calls no Stripe, writes nothing, and holds no claim.
 *   · `claimQuoteBornBooking` — the §15 ATOMIC CONDITIONAL that moves the row from its birth state
 *     into the checkout spine's PROVISIONAL state. The statement is the guard.
 * Everything after the claim — the §15b pre-flight marker, `paymentIntents.create`, the atomic
 * `stampAuthorization`, the promotion — is the EXISTING `authorizeAndPromote` in
 * `payments.routes.ts`, called with one more set of arguments (§18 rule 1: one implementation, one
 * more caller). This module never imports Stripe.
 *
 * ── THE PROVENANCE, AND WHY NO NEW COLUMN WAS ADDED ───────────────────────────────────────────
 * "Was this booking born from an accepted quote?" already has a SERVER-WRITTEN answer:
 * `service_quotes.booking_id`, stamped inside the accept transaction beside the claim
 * (`acceptQuote` step 3) and reachable from no request body under any spelling (there is
 * deliberately no `createInsertSchema(serviceQuotes)` — see `shared/service-quotes.ts`). The arm
 * therefore JOINS to the quote rather than trusting a body-supplied quote id, and it must read
 * that row anyway to answer (d) — is the quote still `accepted` and unexpired. Writing a SECOND
 * copy of the same link into `booking_details.quoteId` would be the derivation-drift class §18
 * rule 1 names, on a money row, with no reader that the join does not already serve.
 *
 * ── §14 — THE ACTOR IS THE SESSION AND THE AMOUNT IS THE ROW'S ────────────────────────────────
 * The body carries ONE id and (optionally) the one-click preference. No amount, no price, no user
 * id and no quote id reaches any decision here: the traveler is `traveler_id` on the row compared
 * against the session, and the charge is composed from `total_amount` / `deposit_amount` — the
 * columns `acceptQuote` derived from the `service_quotes` row the PROVIDER issued. The listing's
 * live price is never re-read: a quote IS the price, and re-pricing it at charge time would charge
 * an amount nobody accepted.
 *
 * ── THE A3 SNAPSHOT IS STAMPED BY THE CLAIM, AND THAT IS NOT OPTIONAL ─────────────────────────
 * `booking_details.travelerCharge`'s PRESENCE is the era discriminator `travelerChargeBasis` reads
 * (§19d), and three live readers branch on it: the cancellation quote, the REFUND CEILING clamp
 * and the checkout re-drive. A quote-born row is born WITHOUT it (`createServiceBookingAtomic`
 * strips the key — §19d layer 2, correctly, because that is the client-facing birth rail), so
 * every one of those readers would read a row charged TODAY as `pre_a3_legacy` and add
 * `platform_fee` — the provider's WITHHELD share — to the traveler's side a second time. The claim
 * therefore stamps the snapshot in the SAME statement that takes the claim, exactly as the cart's
 * own claim stamps it at claim time. It is stamped by the SERVER, through a direct UPDATE, and no
 * request body reaches it.
 *
 * §13 — THE ABSENCES ARE ANSWERS.
 *   · A booking with no quote behind it, a booking that is not the caller's, and a booking that
 *     does not exist are ONE 404 (the LD 40 / custom-venues posture), so the arm cannot be used to
 *     probe which bookings exist.
 *   · An ACCEPTED quote past its `expires_at` is refused 409 `quote_expired` WITH the expiry
 *     stated, and is NEVER repriced — a new quote is the answer, not a silent honouring.
 *   · `deposit_amount` NULL is not "no deposit was offered": it is the answer `resolveDepositPlan`
 *     gave at accept time (deposits off for that listing, or a split that would have been the whole
 *     amount), and it means the full amount is due now. The split is READ, never re-derived.
 *   · `balance_due_at` is derived through the ONE `resolveBalanceDueAt` from facts the row actually
 *     carries; a quote-born row with no service date resolves to NULL and the column is LEFT NULL
 *     rather than given a guessed deadline.
 *
 * ── THE TRAVELER SERVICE FEE APPLIES HERE TOO (decision-maker ruling, ledger
 * `2026-09-19-quote-born-traveler-fee`) ────────────────────────────────────────────────────────
 * This entry originally recorded that NO traveler service fee was folded into this charge — a
 * quote states one number and the accept rail disclosed nothing on top of it, so charging more
 * felt like a bait-and-switch. The decision-maker ruled otherwise: a quote-born booking carries
 * the SAME ruled traveler service fee (ledger `2026-09-02-traveler-fee-applies-everywhere`) as
 * every other service booking, resolved through the SAME band-driven resolver, waived by the SAME
 * Trip Pass entitlement, and disclosed to the traveler BEFORE they complete payment (the quotes
 * panel's Pay sheet), exactly the same as the cart's own pre-checkout disclosure. `resolveQuoteCharge`
 * resolves it (read-only — see below) and `claimQuoteBornBooking` stamps it in the SAME statement
 * that takes the §15 claim, through the ONE shared `resolveTravelerServiceFeeSnapshot`
 * (`fee-resolution.service.ts`, §18 rule 1) — never a second computation of the fee shape.
 *
 * WHY A TRIP ID CAN BE CHECKED AT ALL: `service_bookings.trip_id` is nullable and a quote-born
 * booking is minted with none (no lane mints one — the quote/accept flow carries no trip context),
 * so `coversAction` is skipped and the fee is simply never waived UNLESS a future lane starts
 * associating a quote-born booking with a trip. The SELECT still reads `trip_id` off the row
 * (never a body value, §14) so that day requires no further change here.
 */
import { sql } from "drizzle-orm";

import { db } from "../db";
import { TRAVELER_CHARGE_SNAPSHOT_KEY } from "@shared/booking-details-admission";
import { composeTravelerCharge, travelerChargeBasis, travelerChargeForRow } from "./traveler-charge";
import { resolveBalanceDueAt } from "./deposit.service";
import { resolveServiceDate } from "./booking-completion.service";
// Ledger `2026-09-19-quote-born-traveler-fee`: the SAME band-driven resolver/snapshot shape the
// cart arm uses (§18 rule 1) and the SAME Trip Pass entitlement check the cart's pre-pass makes —
// neither is re-implemented here.
import { resolveTravelerServiceFeeSnapshot, round2, type TravelerServiceFeeSnapshot } from "./fee-resolution.service";
import { coversAction } from "./trip-entitlement.service";

/**
 * The `conciergeFee` portion of a quote-born row's traveler charge. A custom quote is a provider
 * pricing their own work for one traveler; no booking-concierge line is sold on it, so the portion
 * is genuinely nothing — which is a different fact from "we did not record one" and is why it is
 * written rather than left absent (an absent snapshot reads as the pre-A3 era, see the header).
 * Not a fee literal (§8): no rate is resolved, selected or multiplied anywhere in this file.
 */
const QUOTE_BORN_CONCIERGE_PORTION = "0.00";

/** The states a quote-born row may be CHARGED from. Declared once, read once (the transport-stamp
 *  precedent in `checkout-claim.service.ts`: same column, same discipline, its own from-state list).
 *  `pending` is the birth state `acceptQuote` writes; `payment_pending` is a claim already taken by
 *  an earlier attempt of the SAME traveler, which is re-driven rather than refused. */
export const QUOTE_CHARGE_FROM_STATUSES = ["pending", "payment_pending"] as const;

export type QuoteChargeRefusalCode =
  | "not_found"
  | "quote_not_accepted"
  | "quote_expired"
  | "not_chargeable";

export interface QuoteChargeRefusal {
  ok: false;
  status: number;
  code: QuoteChargeRefusalCode;
  message: string;
  /** Present on `quote_expired` only — WHEN it expired, stated (§13). */
  expiresAt?: string;
  /** Present on `not_chargeable` only — the status that refused, named rather than generalised. */
  bookingStatus?: string;
}

export interface QuoteChargePlan {
  ok: true;
  bookingId: string;
  quoteId: string;
  /** The traveler's FULL charge for this row, EXCLUDING the traveler service fee — through the
   *  shared composition/reading (§18 rule 1). */
  subtotal: number;
  /** The provider's WITHHELD share. DISCLOSED in the response; never a term of the charge (A3). */
  platformFee: number;
  /** Present only when the row carries a deposit split — the amount due NOW (deposit + the fee
   *  below, "assessed ONCE, at the deposit charge" — the same posture the cart's Ruling D takes),
   *  read off the row plus the resolved fee, never re-derived from a listing config that may have
   *  moved since. */
  chargeAmount?: number;
  /** Ledger `2026-09-19-quote-born-traveler-fee`: the ONE shared snapshot shape, resolved here
   *  (read-only) and stamped by the claim in the SAME statement (§18 rule 1). */
  travelerServiceFee: TravelerServiceFeeSnapshot;
  /** Derived from `travelerServiceFee.waiverBasis` — never a second entitlement check. */
  coveredByTripPass: boolean;
  /** The §15 Stripe/DB idempotency key for this booking's charge. A retry rebuilds it verbatim. */
  idempotencyKey: string;
  /** true ⇒ an earlier attempt already holds the provisional claim; re-drive, do not re-claim. */
  alreadyClaimed: boolean;
  /** Set ⇒ an earlier attempt already authorized; hand back THAT PaymentIntent, never a second. */
  authorizedPaymentIntentId?: string;
  /** The deposit cutoff to stamp with the claim, or null when no honest one can be derived (§13). */
  balanceDueAt: Date | null;
}

const refuse = (
  status: number,
  code: QuoteChargeRefusalCode,
  message: string,
  extra: Partial<Pick<QuoteChargeRefusal, "expiresAt" | "bookingStatus">> = {},
): QuoteChargeRefusal => ({ ok: false, status, code, message, ...extra });

/** "No such booking", "not yours" and "not quote-born" are the SAME sentence (LD 40 posture). */
const NOT_FOUND = () =>
  refuse(404, "not_found", "No quoted booking to pay for was found.");

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * MAY this session user charge this quote-born booking, and for how much? Read-only.
 *
 * The four gates the lane's brief names, in order, each answered from a column and never from a
 * body: (a) the row is quote-born (the JOIN itself), (b) it belongs to the session user,
 * (c) it is in a chargeable state, (d) the quote is still `accepted` and unexpired.
 */
export async function resolveQuoteCharge(input: {
  bookingId: string;
  actorUserId: string;
  now?: Date;
}): Promise<QuoteChargePlan | QuoteChargeRefusal> {
  const now = input.now ?? new Date();

  // (a) THE PROVENANCE IS THE JOIN. `service_quotes.booking_id` is written only inside the accept
  // transaction; a booking no quote names simply does not come back here.
  const found = await db.execute(sql`
    SELECT b.id,
           b.traveler_id,
           b.status,
           b.total_amount,
           b.platform_fee,
           b.deposit_amount,
           b.balance_due_at,
           b.slot_id,
           b.booking_details,
           b.stripe_payment_intent_id,
           b.trip_id,
           q.id            AS quote_id,
           q.status        AS quote_status,
           q.expires_at    AS quote_expires_at,
           s.change_cutoff_hours,
           s.lead_time_hours
      FROM service_bookings b
      JOIN service_quotes q ON q.booking_id = b.id
      LEFT JOIN provider_services s ON s.id = b.service_id
     WHERE b.id = ${input.bookingId}
     LIMIT 1
  `);
  const row = found.rows[0] as Record<string, unknown> | undefined;
  if (!row) return NOT_FOUND();

  // (b) §14 — the actor is the SESSION. A mismatch is the SAME 404, never a 403.
  if (String(row.traveler_id ?? "") !== input.actorUserId) return NOT_FOUND();

  // (d) THE QUOTE'S OWN STATE. Checked before the booking's, because "your quote lapsed" is the
  // more specific and more useful fact, and because an expired quote must refuse with NO claim
  // taken, NO marker written and NO Stripe call made.
  if (String(row.quote_status ?? "") !== "accepted") {
    return refuse(
      409,
      "quote_not_accepted",
      `This booking's quote is ${String(row.quote_status ?? "unknown")}, so there is nothing to pay for yet.`,
    );
  }
  const expiresAt = toDate(row.quote_expires_at);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return refuse(
      409,
      "quote_expired",
      `This quote expired on ${expiresAt.toISOString()} and is not repriced. Ask the provider for a new one.`,
      { expiresAt: expiresAt.toISOString() },
    );
  }

  // (c) THE BOOKING'S STATE.
  const status = String(row.status ?? "");
  const paymentIntentId = row.stripe_payment_intent_id ? String(row.stripe_payment_intent_id) : null;
  if (!(QUOTE_CHARGE_FROM_STATUSES as readonly string[]).includes(status)) {
    return refuse(
      409,
      "not_chargeable",
      `This booking is ${status || "in an unknown state"} and cannot be paid for through this rail.`,
      { bookingStatus: status },
    );
  }

  // THE AMOUNT (§14). `total_amount` IS the quoted amount `acceptQuote` wrote. A row whose claim
  // already stamped the A3 snapshot is read back through the ONE reading; an unclaimed one is
  // composed through the ONE composition with the terms a quote-born row genuinely has (no
  // concierge line, no travel surcharge, no traveler service fee — see the header). The two are the
  // same number by construction, and neither is a third formula (§18 rule 1).
  const details = (row.booking_details ?? {}) as Record<string, unknown>;
  const snapshot = details[TRAVELER_CHARGE_SNAPSHOT_KEY] as { conciergeFee?: string | number } | undefined;
  const conciergeSnapshot = snapshot?.conciergeFee ?? null;
  const subtotal =
    travelerChargeBasis(conciergeSnapshot) === "a3_snapshot"
      ? travelerChargeForRow({
          totalAmount: String(row.total_amount ?? "0"),
          platformFee: String(row.platform_fee ?? "0"),
          conciergeFeeSnapshot: conciergeSnapshot as string | number,
        }).amount
      : composeTravelerCharge({
          subtotal: num(row.total_amount),
          conciergeFee: 0,
          surchargeTotal: 0,
          travelerFee: 0,
        });

  // THE DEPOSIT SPLIT IS READ, NEVER RE-DERIVED (§13). `acceptQuote` already fed the quoted amount
  // through the ONE `resolveDepositPlan`; re-running it here against a listing whose config may
  // have changed since would charge a split the traveler never saw.
  const depositAmount = row.deposit_amount === null || row.deposit_amount === undefined
    ? null
    : num(row.deposit_amount);

  // THE TRAVELER SERVICE FEE (ledger `2026-09-19-quote-born-traveler-fee`). A row already CLAIMED
  // (its booking_details already carries the stamp `claimQuoteBornBooking` wrote) reads that
  // snapshot BACK rather than re-resolving it — exactly the A3 `travelerCharge` posture above, and
  // for the same reason: a re-drive must never disagree with what the claim already stamped and
  // what the fee-ledger write at authorization will read, even if the band moved in between (§13).
  // Only a genuinely FIRST attempt resolves it fresh.
  const existingFeeSnapshot = details.travelerServiceFee as TravelerServiceFeeSnapshot | undefined;
  let travelerServiceFee: TravelerServiceFeeSnapshot;
  if (existingFeeSnapshot && typeof existingFeeSnapshot.charged === "number") {
    travelerServiceFee = existingFeeSnapshot;
  } else {
    // §14: the trip id comes from the ROW, never the body. Ledger `2026-09-19-quote-plan-link`
    // (migration 314): a quote-born booking NOW carries one when the quote was asked from a plan —
    // `acceptQuote` copies `service_quotes.trip_id` onto this exact column, the same spelling the
    // cart rail uses — so the waiver fires here with no change to this function. A quote asked
    // with no plan in mind still carries none, and this resolves `false` and the fee is charged in
    // full, exactly as before.
    const tripId = row.trip_id ? String(row.trip_id) : null;
    let tripPassCovers = false;
    try {
      tripPassCovers = tripId ? await coversAction(tripId, "traveler_service_fee") : false;
    } catch (tpErr: any) {
      // Best-effort, the SAME posture the cart's own trip-pass pre-pass takes: a coverage-check
      // failure never fails the charge — it just means no waiver is offered this attempt.
      console.error(
        `[quote-charge] trip-pass coverage check failed for booking ${String(row.id)} (no waiver offered):`,
        tpErr?.message ?? tpErr,
      );
      tripPassCovers = false;
    }
    travelerServiceFee = await resolveTravelerServiceFeeSnapshot(subtotal, tripPassCovers ? "trip_pass" : null);
  }
  const coveredByTripPass = travelerServiceFee.waiverBasis === "trip_pass";

  // The cutoff, through the ONE derivation. A quote-born row carries no booked slot and no
  // `scheduledDate` snapshot, so this ordinarily resolves NULL and the column stays NULL — an
  // honest "the platform holds no date this can key on", never a guessed deadline.
  let balanceDueAt: Date | null = null;
  if (depositAmount !== null && !row.balance_due_at) {
    const serviceDate = await resolveServiceDate({
      slotId: (row.slot_id ?? null) as string | null,
      bookingDetails: details,
    } as Parameters<typeof resolveServiceDate>[0]);
    balanceDueAt = resolveBalanceDueAt({
      serviceDate: serviceDate?.date ?? null,
      changeCutoffHours: row.change_cutoff_hours as number | null,
      leadTimeHours: row.lead_time_hours as number | null,
    });
  }

  return {
    ok: true,
    bookingId: String(row.id),
    quoteId: String(row.quote_id),
    subtotal,
    platformFee: num(row.platform_fee),
    // The fee is assessed ONCE, at the deposit charge (the cart's own Ruling D posture) — so it
    // rides the amount due NOW here, and the balance leg (pay-balance) adds nothing on top of it.
    ...(depositAmount !== null ? { chargeAmount: round2(depositAmount + travelerServiceFee.charged) } : {}),
    travelerServiceFee,
    coveredByTripPass,
    // §15 layer (a). ONE booking, ONE charge, so the booking id IS the scope: a retry of the same
    // traveler's same charge rebuilds this key verbatim and Stripe hands back the SAME
    // PaymentIntent rather than creating a second one. Pinned in the K1 key-template set.
    idempotencyKey: `quote-buy-${String(row.id)}`,
    alreadyClaimed: status === "payment_pending",
    ...(paymentIntentId ? { authorizedPaymentIntentId: paymentIntentId } : {}),
    balanceDueAt,
  };
}

/**
 * THE §15 CLAIM. One atomic conditional UPDATE, and the statement IS the guard:
 *
 *   UPDATE service_bookings
 *      SET status = 'payment_pending', booking_details = … || {travelerCharge}, …
 *    WHERE id = ? AND traveler_id = ? AND status = 'pending'
 *      AND stripe_payment_intent_id IS NULL
 *
 * Two concurrent charges for one quote-born booking: the first matches and flips the row out of
 * `pending`; the second matches ZERO rows, is refused, and never reaches Stripe. There is no
 * check-then-update anywhere on this path — `resolveQuoteCharge`'s read is a fast path for the
 * refusal SENTENCE, never the concurrency guard.
 *
 * It lands the row in exactly the state the checkout spine already understands
 * (`payment_pending` + `stripe_payment_intent_id IS NULL` = an unauthorized claim by construction,
 * §15b), so from this point a quote-born row is indistinguishable from a cart row to the TTL
 * sweep, `stampAuthorization`, `promotePaidCheckout`, the §17 drift job and §19b's provenance
 * predicate. Nothing in any of them needed a change.
 */
export async function claimQuoteBornBooking(input: {
  bookingId: string;
  actorUserId: string;
  /** Ledger `2026-09-19-quote-born-traveler-fee`: the snapshot `resolveQuoteCharge` resolved —
   *  stamped in this SAME statement, exactly as the A3 `travelerCharge` snapshot beside it, so a
   *  re-drive and the fee-ledger write at authorization both read back what THIS claim decided
   *  rather than a band that may have moved since. REQUIRED, not optional: a claim with no fee
   *  snapshot is exactly the silent-drift shape §18 rule 1 exists to refuse. */
  travelerServiceFee: TravelerServiceFeeSnapshot;
  balanceDueAt?: Date | null;
}): Promise<boolean> {
  const setBalanceDue = input.balanceDueAt
    ? sql`, balance_due_at = ${input.balanceDueAt}`
    : sql``;
  const claimed = await db.execute(sql`
    UPDATE service_bookings
       SET status = 'payment_pending',
           booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
             ${TRAVELER_CHARGE_SNAPSHOT_KEY}::text,
             jsonb_build_object('conciergeFee', ${QUOTE_BORN_CONCIERGE_PORTION}::text),
             'travelerServiceFee', ${JSON.stringify(input.travelerServiceFee)}::jsonb
           ),
           updated_at = NOW()${setBalanceDue}
     WHERE id = ${input.bookingId}
       AND traveler_id = ${input.actorUserId}
       AND status = 'pending'
       AND stripe_payment_intent_id IS NULL
    RETURNING id
  `);
  return claimed.rows.length === 1;
}
