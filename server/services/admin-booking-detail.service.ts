/**
 * PAY-1 §4 — ONE admin read of a booking across the three booking tables, and the ONE Resolve for a
 * row held at `needs_review` (ledger `2026-10-15-pay1-payment-checks`).
 *
 * kinds: `service` (service_bookings), `legacy` (bookings), `liteapi` (liteapi_bookings).
 *
 * The read says whether a Stripe PaymentIntent exists. With none, the page shows "Refund manually in
 * Stripe" text rather than a link to the exception-refund rail, which refunds only through a recorded
 * PaymentIntent. A LiteAPI booking is paid through Nuitée and carries no Stripe payment at all.
 *
 * The timeline is built only from facts already stored: the row's own timestamps, the markers merged
 * into `booking_details`, `refunds` rows, Stripe deliveries whose payload names the PaymentIntent, and
 * the admin audit log. Nothing is inferred to fill a gap (§13).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolveNeedsReviewServiceBooking, type NeedsReviewResolveOutcome } from "./checkout-claim.service";
import { releaseLiteapiStayItem } from "./liteapi-booking.service";
import { promoteTransportOptionForResolvedBooking } from "./transport-option-resolve";
import { bookingChargeShare, chargeShareTolerance } from "./booking-charge-share";
import { getStripeSecretKey } from "../utils/stripe-key";
import Stripe from "stripe";

class TransportOptionNotPromotableError extends Error {
  constructor(optionId: string, status: string | null) {
    super(`The transport option ${optionId} is "${status ?? "missing"}" and cannot be confirmed, so the booking was not confirmed either.`);
    this.name = "TransportOptionNotPromotableError";
  }
}

export const ADMIN_BOOKING_KINDS = ["service", "legacy", "liteapi"] as const;
export type AdminBookingKind = (typeof ADMIN_BOOKING_KINDS)[number];

export interface TimelineEntry {
  at: string;
  label: string;
  source: "booking" | "booking_details" | "refund" | "stripe_event" | "admin_audit";
  detail?: string | null;
}

export interface AdminBookingDetail {
  kind: AdminBookingKind;
  id: string;
  status: string | null;
  traveler: { id: string | null; name: string | null; email: string | null };
  service: { id: string | null; name: string | null };
  amount: { total: string | null; currency: string | null };
  paymentIntentId: string | null;
  hasPaymentIntent: boolean;
  paidThrough: "stripe" | "nuitee";
  needsReview: Record<string, unknown> | null;
  canResolve: boolean;
  timeline: TimelineEntry[];
}

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : (r?.rows ?? []));
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function readBase(kind: AdminBookingKind, id: string): Promise<any | null> {
  if (kind === "service") {
    return rowsOf(await db.execute(sql`
      SELECT sb.id, sb.status, sb.traveler_id AS traveler_id, sb.service_id, ps.service_name,
             sb.total_amount::text AS total, NULL::text AS currency,
             sb.stripe_payment_intent_id, sb.stripe_deposit_intent_id, sb.stripe_balance_intent_id,
             sb.booking_details, sb.created_at, sb.updated_at, sb.completed_at,
             u.first_name, u.last_name, u.email
      FROM service_bookings sb
      LEFT JOIN provider_services ps ON ps.id = sb.service_id
      LEFT JOIN users u ON u.id = sb.traveler_id
      WHERE sb.id = ${id}
    `))[0] ?? null;
  }
  if (kind === "legacy") {
    return rowsOf(await db.execute(sql`
      SELECT b.id, b.status, b.user_id AS traveler_id, NULL::text AS service_id, NULL::text AS service_name,
             b.total_amount::text AS total, NULL::text AS currency,
             b.stripe_payment_intent_id, b.stripe_deposit_intent_id, b.stripe_balance_intent_id,
             NULL::jsonb AS booking_details, b.created_at, NULL::timestamp AS updated_at, b.confirmed_at AS completed_at,
             u.first_name, u.last_name, u.email
      FROM bookings b
      LEFT JOIN users u ON u.id = b.user_id
      WHERE b.id::text = ${id}
    `))[0] ?? null;
  }
  return rowsOf(await db.execute(sql`
    SELECT lb.id, lb.status, lb.user_id AS traveler_id, lb.provider_hotel_id AS service_id, NULL::text AS service_name,
           (lb.amount_cents::numeric / 100)::text AS total, lb.currency,
           NULL::text AS stripe_payment_intent_id, NULL::text AS stripe_deposit_intent_id, NULL::text AS stripe_balance_intent_id,
           NULL::jsonb AS booking_details, lb.created_at, lb.updated_at, lb.booked_at AS completed_at,
           lb.failure_reason, lb.cancelling_at, lb.cancelled_at, lb.hotel_confirmation_code,
           u.first_name, u.last_name, u.email
    FROM liteapi_bookings lb
    LEFT JOIN users u ON u.id = lb.user_id
    WHERE lb.id = ${id}
  `))[0] ?? null;
}

export async function loadAdminBookingDetail(kind: AdminBookingKind, id: string): Promise<AdminBookingDetail | null> {
  const row = await readBase(kind, id);
  if (!row) return null;
  const pi: string | null = row.stripe_payment_intent_id ?? row.stripe_deposit_intent_id ?? null;
  const details = (row.booking_details && typeof row.booking_details === "object") ? row.booking_details : {};
  const timeline: TimelineEntry[] = [];
  const push = (at: unknown, label: string, source: TimelineEntry["source"], detail?: string | null) => {
    const when = iso(at);
    if (when) timeline.push({ at: when, label, source, detail: detail ?? null });
  };

  push(row.created_at, "Booking created", "booking");
  if (kind === "liteapi") {
    push(row.completed_at, "Booked with the hotel partner", "booking", row.hotel_confirmation_code ?? null);
    push(row.cancelling_at, "Cancellation started", "booking");
    push(row.cancelled_at, "Cancelled", "booking");
  } else {
    push(row.completed_at, kind === "legacy" ? "Confirmed" : "Completed", "booking");
  }
  for (const [key, value] of Object.entries(details as Record<string, any>)) {
    if (value && typeof value === "object" && typeof value.at === "string") {
      push(value.at, key, "booking_details", typeof value.reason === "string" ? value.reason : (typeof value.status === "string" ? value.status : null));
    }
  }
  if (kind === "service") {
    for (const r of rowsOf(await db.execute(sql`
      SELECT created_at, amount::text AS amount, status, reason, stripe_refund_id FROM refunds WHERE booking_id = ${id} ORDER BY created_at
    `))) {
      push(r.created_at, `Refund ${r.status ?? ""} $${r.amount}`.trim(), "refund", r.reason ?? r.stripe_refund_id ?? null);
    }
  }
  if (pi) {
    for (const e of rowsOf(await db.execute(sql`
      SELECT stripe_event_id, consumer, event_type, created_at, completed_at, error
      FROM platform_webhook_consumers
      WHERE raw_payload #>> '{data,object,id}' = ${pi} OR raw_payload #>> '{data,object,payment_intent}' = ${pi}
      ORDER BY created_at
      LIMIT 50
    `))) {
      push(e.created_at, `Stripe ${e.event_type} (${e.consumer})`, "stripe_event",
        e.error ? `error: ${e.error}` : e.completed_at ? "completed" : "not completed");
    }
  }
  for (const a of rowsOf(await db.execute(sql`
    SELECT action, actor_id, metadata, created_at FROM access_audit_logs
    WHERE resource_id = ${id} AND action LIKE 'booking_%'
    ORDER BY created_at
    LIMIT 50
  `))) {
    push(a.created_at, a.action, "admin_audit", typeof a.metadata?.reason === "string" ? a.metadata.reason : null);
  }
  timeline.sort((x, y) => x.at.localeCompare(y.at));

  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null;
  const needsReview = (details as any).needsReview && typeof (details as any).needsReview === "object"
    ? (details as any).needsReview
    : (kind === "liteapi" && row.status === "needs_review" ? { reason: row.failure_reason ?? null } : null);
  return {
    kind,
    id: String(row.id),
    status: row.status ?? null,
    traveler: { id: row.traveler_id ?? null, name, email: row.email ?? null },
    service: { id: row.service_id ?? null, name: row.service_name ?? null },
    amount: { total: row.total ?? null, currency: row.currency ?? null },
    paymentIntentId: pi,
    hasPaymentIntent: !!pi,
    paidThrough: kind === "liteapi" ? "nuitee" : "stripe",
    needsReview,
    canResolve: row.status === "needs_review",
    timeline,
  };
}

export type ResolveResult =
  | { ok: true; status: NeedsReviewResolveOutcome; paymentIntentId: string | null }
  | { ok: false; httpStatus: 404 | 409 | 422 | 503; reason: string; message: string; field?: PaymentIntentField };

// ── Verifying the PaymentIntent with Stripe before any confirm (decision-maker, Oct 15, 2026) ──────
// An id — the row's or the admin's — confirms a booking only when Stripe says it is real, paid (or
// authorized), and for this booking's amount in this booking's currency. Anything else is refused by
// name; Stripe being unreachable is refused too, because an unverified id never confirms.
export type PaymentIntentField = "id" | "status" | "amount" | "currency";
export interface RetrievedPaymentIntent { status: string; amount: number; currency: string }
export interface ResolveDeps {
  retrievePaymentIntent: (id: string) => Promise<RetrievedPaymentIntent | null>;
}
const VERIFIED_PAYMENT_INTENT_STATUSES = new Set(["succeeded", "requires_capture"]);

export const defaultResolveDeps: ResolveDeps = {
  async retrievePaymentIntent(id) {
    const key = getStripeSecretKey();
    if (!key) throw new Error("stripe_unconfigured");
    const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
    try {
      const pi = await stripe.paymentIntents.retrieve(id);
      return { status: pi.status, amount: pi.amount, currency: pi.currency };
    } catch (err: any) {
      if (err?.code === "resource_missing" || err?.statusCode === 404) return null;
      throw err;
    }
  },
};

/** What this booking charged, in cents and lower-case currency — server-derived from the row (§14). */
async function expectedCharge(kind: "service" | "legacy", id: string): Promise<{ cents: number; currency: string; toleranceCents: number } | null> {
  if (kind === "service") {
    const r = rowsOf(await db.execute(sql`
      SELECT total_amount, platform_fee, booking_details FROM service_bookings WHERE id = ${id}
    `))[0];
    if (!r) return null;
    const d = (r.booking_details ?? {}) as Record<string, any>;
    const dollars = bookingChargeShare({
      totalAmount: r.total_amount,
      platformFee: r.platform_fee,
      conciergeFeeSnapshot: d.travelerCharge?.conciergeFee ?? null,
      travelerFeeCharged: d.travelerServiceFee?.charged ?? null,
    });
    // The drift job's own rounding bound for one row — not a rate (§8).
    return { cents: Math.round(dollars * 100), currency: String(d.currency ?? "usd").toLowerCase(), toleranceCents: Math.round(chargeShareTolerance(1) * 100) };
  }
  const r = rowsOf(await db.execute(sql`SELECT total_amount FROM bookings WHERE id::text = ${id}`))[0];
  if (!r) return null;
  // The legacy table carries no currency column; every legacy charge was created in USD.
  return { cents: Math.round(Number(r.total_amount ?? 0) * 100), currency: "usd", toleranceCents: Math.round(chargeShareTolerance(1) * 100) };
}

async function verifyPaymentIntent(
  kind: "service" | "legacy",
  bookingId: string,
  paymentIntentId: string,
  deps: ResolveDeps,
): Promise<{ ok: true } | Extract<ResolveResult, { ok: false }>> {
  const mismatch = (field: PaymentIntentField, message: string) =>
    ({ ok: false as const, httpStatus: 422 as const, reason: "payment_intent_mismatch", field, message });
  let pi: RetrievedPaymentIntent | null;
  try {
    pi = await deps.retrievePaymentIntent(paymentIntentId);
  } catch {
    return { ok: false, httpStatus: 503, reason: "payment_intent_unverified", message: "Stripe could not be reached to check this PaymentIntent, so the booking was not confirmed. Try again." };
  }
  if (!pi) return mismatch("id", `Stripe has no PaymentIntent ${paymentIntentId}.`);
  if (!VERIFIED_PAYMENT_INTENT_STATUSES.has(pi.status)) return mismatch("status", `PaymentIntent ${paymentIntentId} is "${pi.status}", not succeeded or requires_capture.`);
  const expected = await expectedCharge(kind, bookingId);
  if (!expected) return { ok: false, httpStatus: 404, reason: "not_found", message: "No such booking." };
  if (pi.currency.toLowerCase() !== expected.currency) return mismatch("currency", `PaymentIntent is in ${pi.currency.toUpperCase()}; this booking is in ${expected.currency.toUpperCase()}.`);
  if (Math.abs(pi.amount - expected.cents) > expected.toleranceCents) {
    return mismatch("amount", `PaymentIntent is for ${(pi.amount / 100).toFixed(2)}; this booking charged ${(expected.cents / 100).toFixed(2)}.`);
  }
  return { ok: true };
}

/**
 * The checks that come before Stripe is asked anything: the row exists, is held, and has exactly one
 * PaymentIntent to verify (its own, or the admin's when it carries none). The atomic writer repeats
 * every one of them; these exist so the Stripe call is made for the id the writer will record.
 */
async function preflightConfirm(
  kind: "service" | "legacy",
  id: string,
  supplied: string | null,
): Promise<{ ok: true; paymentIntentId: string } | Extract<ResolveResult, { ok: false }>> {
  const cur = kind === "service"
    ? rowsOf(await db.execute(sql`SELECT status, stripe_payment_intent_id FROM service_bookings WHERE id = ${id}`))[0]
    : rowsOf(await db.execute(sql`SELECT status, stripe_payment_intent_id FROM bookings WHERE id::text = ${id}`))[0];
  if (!cur) return { ok: false, httpStatus: 404, reason: "not_found", message: "No such booking." };
  if (cur.status !== "needs_review") return { ok: false, httpStatus: 409, reason: "not_needs_review", message: `This booking is "${cur.status}", not needs_review; nothing was changed.` };
  const onRow: string | null = cur.stripe_payment_intent_id ?? null;
  if (onRow && supplied && onRow !== supplied) {
    return { ok: false, httpStatus: 409, reason: "different_payment_intent", message: `This booking already records ${onRow}; a different PaymentIntent is never written over it.` };
  }
  const pi = onRow ?? supplied;
  if (!pi) return { ok: false, httpStatus: 422, reason: "no_payment_intent", message: "A booking is never confirmed without a PaymentIntent. Enter the pi_… id from Stripe." };
  return { ok: true, paymentIntentId: pi };
}

/**
 * The ONLY path out of `needs_review`. Each kind's flip is an atomic conditional on
 * `status = 'needs_review'`. `cancelled` moves status only — refunds stay on the exception-refund rail.
 */
export async function resolveNeedsReviewBooking(
  kind: AdminBookingKind,
  id: string,
  outcome: NeedsReviewResolveOutcome,
  paymentIntentId: string | null,
  deps: ResolveDeps = defaultResolveDeps,
): Promise<ResolveResult> {
  const supplied = paymentIntentId?.trim() || null;
  if (outcome === "confirmed" && (kind === "service" || kind === "legacy")) {
    const pre = await preflightConfirm(kind, id, supplied);
    if (!pre.ok) return pre;
    const verified = await verifyPaymentIntent(kind, id, pre.paymentIntentId, deps);
    if (!verified.ok) return verified;
  }
  if (kind === "service") {
    // A transport booking's option is confirmed in the SAME transaction as the booking (as ruled).
    return resolveNeedsReviewServiceBooking(id, outcome, supplied, async (tx, details) => {
      const optionId = typeof details?.optionId === "string" ? details.optionId : null;
      if (details?.bookingType !== "transport" || !optionId) return;
      const option = await promoteTransportOptionForResolvedBooking(tx, optionId);
      if (!option.promoted && option.bookingStatus !== "confirmed") {
        // Refusing here rolls the booking's flip back too: the two are confirmed together or not at all.
        throw new TransportOptionNotPromotableError(optionId, option.bookingStatus);
      }
    }).catch((err) => {
      if (err instanceof TransportOptionNotPromotableError) {
        return { ok: false as const, httpStatus: 409 as const, reason: "transport_option_not_promotable", message: err.message };
      }
      throw err;
    });
  }

  if (kind === "legacy") {
    const pi = paymentIntentId?.trim() || null;
    const moved = outcome === "cancelled"
      ? rowsOf(await db.execute(sql`
          UPDATE bookings SET status = 'cancelled' WHERE id::text = ${id} AND status = 'needs_review'
          RETURNING stripe_payment_intent_id`))
      : rowsOf(await db.execute(sql`
          UPDATE bookings
          SET status = 'confirmed', stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ${pi}::text), confirmed_at = COALESCE(confirmed_at, NOW())
          WHERE id::text = ${id} AND status = 'needs_review'
            AND (
              (stripe_payment_intent_id IS NOT NULL AND (${pi}::text IS NULL OR stripe_payment_intent_id = ${pi}::text))
              OR (stripe_payment_intent_id IS NULL AND ${pi}::text IS NOT NULL)
            )
          RETURNING stripe_payment_intent_id`));
    if (moved[0]) return { ok: true, status: outcome, paymentIntentId: moved[0].stripe_payment_intent_id ?? null };
    const cur = rowsOf(await db.execute(sql`SELECT status, stripe_payment_intent_id FROM bookings WHERE id::text = ${id}`))[0];
    if (!cur) return { ok: false, httpStatus: 404, reason: "not_found", message: "No such booking." };
    if (cur.status !== "needs_review") return { ok: false, httpStatus: 409, reason: "not_needs_review", message: `This booking is "${cur.status}", not needs_review; nothing was changed.` };
    if (!cur.stripe_payment_intent_id && !pi) return { ok: false, httpStatus: 422, reason: "no_payment_intent", message: "A booking is never confirmed without a PaymentIntent. Enter the pi_… id from Stripe." };
    return { ok: false, httpStatus: 409, reason: "different_payment_intent", message: `This booking already records ${cur.stripe_payment_intent_id}; a different PaymentIntent is never written over it.` };
  }

  // liteapi — paid through Nuitée; no PaymentIntent is involved.
  if (outcome === "cancelled") {
    // Status only, plus the ONE release rail (`releaseLiteapiStayItem`, shared with `cancelStay`) in
    // the SAME transaction, so the plan item goes back to the traveler exactly when the row ends. No
    // money moves: a LiteAPI refund is Nuitée's.
    const released = await db.transaction(async (tx) => {
      const peek = rowsOf(await tx.execute(sql`SELECT trip_id FROM liteapi_bookings WHERE id = ${id}`))[0];
      if (peek?.trip_id) {
        const { lockTripRow } = await import("./trip-row-lock");
        await lockTripRow(tx, peek.trip_id);
      }
      const ended = rowsOf(await tx.execute(sql`
        UPDATE liteapi_bookings SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
        WHERE id = ${id} AND status = 'needs_review'
        RETURNING trip_id, itinerary_item_id, hotel_confirmation_code`))[0];
      if (!ended) return false;
      await releaseLiteapiStayItem(tx, {
        tripId: ended.trip_id,
        itemId: ended.itinerary_item_id,
        hotelConfirmationCode: ended.hotel_confirmation_code ?? null,
      });
      return true;
    });
    if (released) return { ok: true, status: "cancelled", paymentIntentId: null };
    const cur = rowsOf(await db.execute(sql`SELECT status FROM liteapi_bookings WHERE id = ${id}`))[0];
    if (!cur) return { ok: false, httpStatus: 404, reason: "not_found", message: "No such booking." };
    return { ok: false, httpStatus: 409, reason: "not_needs_review", message: `This booking is "${cur.status}", not needs_review; nothing was changed.` };
  }
  const moved = rowsOf(await db.execute(sql`
    UPDATE liteapi_bookings SET status = 'confirmed', updated_at = NOW()
    WHERE id = ${id} AND status = 'needs_review'
    RETURNING id`));
  if (moved[0]) return { ok: true, status: "confirmed", paymentIntentId: null };
  const cur = rowsOf(await db.execute(sql`SELECT status FROM liteapi_bookings WHERE id = ${id}`))[0];
  if (!cur) return { ok: false, httpStatus: 404, reason: "not_found", message: "No such booking." };
  return { ok: false, httpStatus: 409, reason: "not_needs_review", message: `This booking is "${cur.status}", not needs_review; nothing was changed.` };
}

export interface AdminBookingListRow {
  kind: AdminBookingKind;
  id: string;
  status: string | null;
  travelerName: string | null;
  travelerEmail: string | null;
  serviceName: string | null;
  total: string | null;
  currency: string | null;
  createdAt: string | null;
}

/** The list cap. Filters narrow it; the page says when it is reached. */
export const ADMIN_BOOKING_LIST_LIMIT = 200;

/**
 * PAY-1c — the admin bookings list: one table at a time (the same three the detail page reads),
 * newest first, filtered by status and by the UTC day the booking was created (both ends inclusive).
 */
export async function listAdminBookings(filters: {
  kind: AdminBookingKind;
  status: string | null;
  from: string | null;
  to: string | null;
}): Promise<AdminBookingListRow[]> {
  // created_at is a timestamp without time zone holding UTC; a day is compared as a date.
  const conds = (alias: "sb" | "b" | "lb") => {
    const col = sql.raw(alias);
    const parts = [sql`TRUE`];
    if (filters.status) parts.push(sql`${col}.status = ${filters.status}`);
    if (filters.from) parts.push(sql`${col}.created_at >= ${filters.from}::date`);
    if (filters.to) parts.push(sql`${col}.created_at < (${filters.to}::date + 1)`);
    return sql.join(parts, sql` AND `);
  };

  let rows: any[];
  if (filters.kind === "service") {
    rows = rowsOf(await db.execute(sql`
      SELECT sb.id::text AS id, sb.status, ps.service_name, sb.total_amount::text AS total, NULL::text AS currency,
             sb.created_at, u.first_name, u.last_name, u.email
        FROM service_bookings sb
        LEFT JOIN provider_services ps ON ps.id = sb.service_id
        LEFT JOIN users u ON u.id = sb.traveler_id
       WHERE ${conds("sb")}
       ORDER BY sb.created_at DESC NULLS LAST
       LIMIT ${ADMIN_BOOKING_LIST_LIMIT}
    `));
  } else if (filters.kind === "legacy") {
    rows = rowsOf(await db.execute(sql`
      SELECT b.id::text AS id, b.status, b.title AS service_name, b.total_amount::text AS total, NULL::text AS currency,
             b.created_at, u.first_name, u.last_name, u.email
        FROM bookings b
        LEFT JOIN users u ON u.id = b.user_id
       WHERE ${conds("b")}
       ORDER BY b.created_at DESC NULLS LAST
       LIMIT ${ADMIN_BOOKING_LIST_LIMIT}
    `));
  } else {
    rows = rowsOf(await db.execute(sql`
      SELECT lb.id::text AS id, lb.status, lb.provider_hotel_id AS service_name,
             (lb.amount_cents::numeric / 100)::text AS total, lb.currency,
             lb.created_at, u.first_name, u.last_name, u.email
        FROM liteapi_bookings lb
        LEFT JOIN users u ON u.id = lb.user_id
       WHERE ${conds("lb")}
       ORDER BY lb.created_at DESC NULLS LAST
       LIMIT ${ADMIN_BOOKING_LIST_LIMIT}
    `));
  }
  return rows.map((r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
    return {
      kind: filters.kind,
      id: String(r.id),
      status: r.status ?? null,
      travelerName: name || null,
      travelerEmail: r.email ?? null,
      serviceName: r.service_name ?? null,
      total: r.total ?? null,
      currency: r.currency ?? null,
      createdAt: iso(r.created_at),
    };
  });
}
