import Stripe from "stripe";
import { db } from "../db";
import { adminNotifications, bookings, serviceBookings } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * Shared dispute implementation for the platform and Connect webhook rails.
 * A charge can represent a cart containing several canonical bookings, while
 * legacy charges continue to identify one booking in metadata.
 */
export async function handleStripeDispute(
  dispute: Stripe.Dispute,
  stripe: Stripe,
  options: { closed: boolean; eventId?: string } = { closed: false },
  transaction?: any,
): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const charge = typeof dispute.charge === "string"
    ? await stripe.charges.retrieve(chargeId)
    : dispute.charge;
  const conn = transaction ?? db;
  const paymentIntent =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  const canonical = paymentIntent
     ? await conn
        .select({ id: serviceBookings.id, status: serviceBookings.status })
        .from(serviceBookings)
        .where(eq(serviceBookings.stripePaymentIntentId, paymentIntent))
    : [];
  const legacyId = charge.metadata?.bookingId;
  const ids = canonical.map((row: { id: string }) => row.id);
  const won = options.closed && dispute.status === "won";
  const manualReview = options.closed && dispute.status === "lost";
   await conn.execute(sql`
    INSERT INTO stripe_dispute_lifecycle (dispute_id, terminal_outcome, booking_status)
    VALUES (${dispute.id}, NULL, ${JSON.stringify(Object.fromEntries(canonical.map((row: { id: string; status: string | null }) => [row.id, row.status])))}::jsonb)
    ON CONFLICT (dispute_id) DO NOTHING
  `);
  // Serialize the lifecycle decision. A stale created/updated delivery must
  // not reopen a dispute after its terminal closed event.
  const lifecycleRow = await conn.execute(sql`
    SELECT terminal_outcome, booking_status FROM stripe_dispute_lifecycle
    WHERE dispute_id = ${dispute.id} FOR UPDATE
  `);
  const terminal = (lifecycleRow.rows[0] as any)?.terminal_outcome;
  if (terminal && !options.closed) return;
  if (options.closed && terminal) return;
  const status = won ? "confirmed" : dispute.status === "lost" && options.closed ? "dispute_lost" : "disputed";
  const priorStatuses = ((lifecycleRow.rows[0] as any)?.booking_status ?? {}) as Record<string, string | null>;
  // A lost dispute remains held forever until an operator decides what to do.
  // In particular, an updated/reinstated object must not release just because
  // Stripe happens to report status=won before the explicit closed event.
  const open = !won;

  if (ids.length) {
    for (const id of ids) {
      await conn.update(serviceBookings).set({ status: won ? (priorStatuses[id] ?? "confirmed") : status }).where(eq(serviceBookings.id, id));
    }
    for (const id of ids) {
      if (open) {
        await conn.execute(sql`
          UPDATE provider_earnings SET status = 'held', dispute_state = 'open', updated_at = NOW()
          WHERE source_id = ${id} AND status IN ('held', 'releasable')
        `);
        await conn.execute(sql`
          UPDATE expert_earnings SET status = 'held', dispute_state = 'open'
          WHERE reference_id = ${id} AND status IN ('held', 'releasable')
        `);
      } else {
        // A won dispute immediately restores earnings whose normal hold has
        // matured; immature earnings remain held but are no longer disputed.
        await conn.execute(sql`
          UPDATE provider_earnings SET status = 'releasable'
          WHERE source_id = ${id} AND status = 'held' AND dispute_state = 'open'
            AND available_at IS NOT NULL AND available_at <= NOW()
        `);
        await conn.execute(sql`
          UPDATE expert_earnings SET status = 'releasable'
          WHERE reference_id = ${id} AND status = 'held' AND dispute_state = 'open'
            AND available_at IS NOT NULL AND available_at <= NOW()
        `);
        await conn.execute(sql`
          UPDATE provider_earnings SET dispute_state = 'none', updated_at = NOW()
          WHERE source_id = ${id} AND dispute_state = 'open'
        `);
        await conn.execute(sql`
          UPDATE expert_earnings SET dispute_state = 'none'
          WHERE reference_id = ${id} AND dispute_state = 'open'
        `);
      }
       // These reservations are already processing or paid. They cannot be
       // stopped safely; include their payout IDs in the dispute audit.
       const linked = await conn.execute(sql`
         SELECT payout_id FROM provider_earnings
         WHERE source_id = ${id} AND payout_id IS NOT NULL
         UNION SELECT payout_id FROM expert_earnings
         WHERE reference_id = ${id} AND payout_id IS NOT NULL
       `);
       const payoutIds = (linked.rows as Array<{ payout_id: string }>).map(row => row.payout_id);
       if (manualReview) {
         // Only already-paid earnings move to manual_review. Reserved unpaid
         // earnings remain dispute_state=open so they cannot be released by
         // the normal completion/escrow jobs after a lost dispute.
         await conn.execute(sql`
          UPDATE provider_earnings
          SET dispute_state = 'manual_review', updated_at = NOW()
           WHERE source_id = ${id} AND status = 'paid_out'
        `);
         await conn.execute(sql`
          UPDATE expert_earnings
          SET dispute_state = 'manual_review'
           WHERE reference_id = ${id} AND status = 'paid_out'
        `);
      }
      await conn.execute(sql`
        INSERT INTO admin_notifications (type, message, reason, metadata)
         SELECT ${manualReview ? "dispute_manual_review" : open ? "dispute_hold" : "dispute_release"},
           ${manualReview
             ? `Dispute ${dispute.id} was lost for booking ${id}; review any paid-out or processing transfers manually.`
             : open
             ? `Unpaid earnings held for booking ${id}; dispute ${dispute.id}.`
             : `Earnings hold released for booking ${id}; dispute ${dispute.id} was won.`},
          ${manualReview ? "manual_review" : open ? "dispute_hold" : dispute.status},
           ${JSON.stringify({ disputeId: dispute.id, bookingId: id, eventId: options.eventId, action: manualReview ? "manual_review" : open ? "hold" : "release", payoutIds })}::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM admin_notifications
          WHERE metadata->>'eventId' = ${options.eventId ?? ""}
            AND metadata->>'bookingId' = ${id}
        )
      `);
       if (open && !manualReview && payoutIds.length) {
         await conn.execute(sql`
           INSERT INTO admin_notifications (type, message, reason, metadata)
           VALUES ('dispute_transfer_review',
             ${`Dispute ${dispute.id} for booking ${id}: a transfer is processing or already sent. Reconcile manually; do not retry or reverse automatically.`},
             'possible_transfer_sent',
             ${JSON.stringify({ disputeId: dispute.id, bookingId: id, eventId: options.eventId, action: "manual_review", payoutIds })}::jsonb)
         `);
       }
    }
  }
  await conn.execute(sql`
    UPDATE stripe_dispute_lifecycle
    SET terminal_outcome = ${options.closed ? dispute.status : null},
        closed_at = CASE WHEN ${options.closed} THEN NOW() ELSE closed_at END,
        updated_at = NOW()
    WHERE dispute_id = ${dispute.id}
  `);

  // Preserve the legacy rail and its historical notifications.
  if (legacyId) {
    await conn.update(bookings).set({
      status,
      disputeId: dispute.id,
      disputeReason: dispute.reason,
    }).where(eq(bookings.id, legacyId));
    await conn.execute(sql`
      INSERT INTO admin_notifications (type, message, reason, metadata)
        SELECT ${manualReview ? "dispute_manual_review" : open ? "dispute_created" : "dispute_closed"},
          ${manualReview ? `Dispute ${dispute.id} was lost for booking ${legacyId}; manual reversal review required.` : `Dispute ${dispute.id} for booking ${legacyId}: ${dispute.status}.`},
          ${manualReview ? "manual_review" : dispute.reason ?? dispute.status},
          ${JSON.stringify({ disputeId: dispute.id, bookingId: legacyId, eventId: options.eventId, action: manualReview ? "manual_review" : open ? "hold" : "release" })}::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM admin_notifications
        WHERE metadata->>'eventId' = ${options.eventId ?? ""}
          AND metadata->>'bookingId' = ${legacyId}
      )
    `);
  }
}

export const PLATFORM_DISPUTE_TYPES = new Set([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
]);

export const PLATFORM_EVENT_TYPES = new Set<string>([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "payout.paid",
  "payout.failed",
]);

/** Process the platform-only event family with its own durable event claim. */
export async function processPlatformWebhookEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  return db.transaction(async (tx) => {
  // Hold the advisory lock for the entire transaction callback, including the
  // external charge lookup and durable notification writes. A lease/boolean
  // checked outside a transaction would let two deliveries run concurrently.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${event.id}))`);
  const claim = await tx.execute(sql`
    INSERT INTO platform_webhook_consumers (stripe_event_id, consumer, event_type, raw_payload)
    VALUES (${event.id}, 'platform-disputes', ${event.type}, ${JSON.stringify(event)}::jsonb)
    ON CONFLICT (stripe_event_id, consumer) DO NOTHING
    RETURNING stripe_event_id
  `);
  if (!claim.rows.length) {
    const prior = await tx.execute(sql`
      SELECT completed_at FROM platform_webhook_consumers
      WHERE stripe_event_id = ${event.id} AND consumer = 'platform-disputes'
    `);
    if ((prior.rows[0] as any)?.completed_at) return;
  }

  try {
    if (PLATFORM_DISPUTE_TYPES.has(event.type)) {
      await handleStripeDispute(event.data.object as Stripe.Dispute, stripe, { closed: event.type === "charge.dispute.closed", eventId: event.id }, tx);
    } else if (event.type === "payout.paid" || event.type === "payout.failed") {
      const payout = event.data.object as Stripe.Payout;
      await tx.insert(adminNotifications).values({
        type: event.type === "payout.failed" ? "stripe_platform_payout_failed" : "stripe_platform_payout_paid",
        message: `Platform Stripe payout ${payout.id} ${event.type === "payout.failed" ? "failed" : "paid"}; this is a bank payout and not a provider transfer.`,
        reason: event.type,
        metadata: { stripePayoutId: payout.id, eventId: event.id, failureCode: (payout as any).failure_code ?? null },
      } as any);
    }
    await tx.execute(sql`
      UPDATE platform_webhook_consumers SET completed_at = NOW(), error = NULL
      WHERE stripe_event_id = ${event.id} AND consumer = 'platform-disputes'
    `);
  } catch (error: any) {
    await tx.execute(sql`
      UPDATE platform_webhook_consumers SET error = ${error?.message ?? String(error)}
      WHERE stripe_event_id = ${event.id} AND consumer = 'platform-disputes'
    `);
    throw error;
  }
  });
}