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
  | { ok: false; httpStatus: 404 | 409 | 422; reason: string; message: string };

/**
 * The ONLY path out of `needs_review`. Each kind's flip is an atomic conditional on
 * `status = 'needs_review'`. `cancelled` moves status only — refunds stay on the exception-refund rail.
 */
export async function resolveNeedsReviewBooking(
  kind: AdminBookingKind,
  id: string,
  outcome: NeedsReviewResolveOutcome,
  paymentIntentId: string | null,
): Promise<ResolveResult> {
  if (kind === "service") return resolveNeedsReviewServiceBooking(id, outcome, paymentIntentId);

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
