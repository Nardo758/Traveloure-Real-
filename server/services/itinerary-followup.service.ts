import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox, itineraryComparisons, users } from "@shared/schema";
import { dispatchMessagingEvent } from "../automations/messaging/runtime";
import type { SendEmailParams, SendEmailResult } from "./email.service";
import { canQueueGenerationNotice } from "./itinerary-outcome-email";
import {
  ITINERARY_FOLLOWUPS, buildItineraryFollowupEmail, isItineraryFollowup,
  marketingPreferences, localMarketingClock, nextMarketingWindow,
} from "./itinerary-followup-email";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface FollowupMetadata {
  travelerFollowupVersion: 1;
  marketing: true;
  travelerId: string;
  itineraryId: string;
  readyAt: string;
  unsubscribeToken: string;
  deliveryCalendarDay?: string;
}

/** Same row lock as migration 351's booking triggers. Do not substitute a process-local mutex. */
export async function lockFollowupTraveler(tx: Tx, travelerId: string) {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${travelerId} FOR UPDATE`);
}

export async function cancelItineraryFollowups(tx: Tx, travelerId: string, reason: string, exceptItinerary?: string) {
  await tx.execute(sql`
    UPDATE email_outbox SET status = 'cancelled', retry_after = NULL,
      last_error = ${reason}, updated_at = NOW()
    WHERE metadata->>'travelerFollowupVersion' = '1' AND metadata->>'travelerId' = ${travelerId}
      AND status IN ('pending', 'failed', 'processing')
      AND (${exceptItinerary ?? null}::text IS NULL OR metadata->>'itineraryId' <> ${exceptItinerary ?? null})
  `);
}

/** An older worker finishing late must not cancel the newer itinerary's sequence. */
async function latestReadyItinerary(tx: Tx, travelerId: string) {
  const result = await tx.execute(sql`SELECT id FROM itinerary_comparisons
    WHERE user_id = ${travelerId} AND status IN ('generated', 'selected')
    ORDER BY created_at DESC NULLS LAST, optimized_at DESC NULLS LAST, id DESC LIMIT 1`);
  return (result.rows[0] as { id: string } | undefined)?.id;
}

/** Called within the ready-outcome transaction, not by a best-effort timer. */
export async function scheduleItineraryFollowups(tx: Tx, input: {
  itineraryId: string; travelerId: string; email: string; readyAt: Date;
}) {
  await lockFollowupTraveler(tx, input.travelerId);
  const latest = await latestReadyItinerary(tx, input.travelerId);
  if (!latest) throw new Error("Cannot schedule follow-ups without a ready itinerary");
  const superseded = latest !== input.itineraryId;
  await cancelItineraryFollowups(tx, input.travelerId, "Cancelled by a newer ready itinerary", latest);
  for (const entry of ITINERARY_FOLLOWUPS) {
    const [existing] = await tx.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(sql`${emailOutbox.metadata}->>'travelerFollowupVersion' = '1'
        AND ${emailOutbox.metadata}->>'itineraryId' = ${input.itineraryId}
        AND ${emailOutbox.emailType} = ${entry.kind}`).limit(1);
    if (existing) continue;
    const metadata: FollowupMetadata = {
      travelerFollowupVersion: 1, marketing: true, travelerId: input.travelerId,
      itineraryId: input.itineraryId, readyAt: input.readyAt.toISOString(), unsubscribeToken: randomUUID(),
    };
    await dispatchMessagingEvent("messaging.email-outbox-enqueue", "email.enqueue",
      { emailType: entry.kind }, {}, async () => {
        await tx.insert(emailOutbox).values({
          emailType: entry.kind, toEmail: input.email,
          // Copy is constructed from live state at delivery, never at scheduling.
          subject: "Itinerary follow-up", html: "", status: superseded ? "cancelled" : "pending", maxAttempts: 6,
          lastError: superseded ? "Cancelled by a newer ready itinerary" : null,
          retryAfter: superseded ? null : new Date(input.readyAt.getTime() + entry.hours * 3_600_000), metadata,
        });
      });
  }
}

async function bookingExists(tx: Tx, travelerId: string, itineraryId: string, readyAt: string) {
  const result = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM service_bookings b
      WHERE b.traveler_id = ${travelerId}
        AND COALESCE(b.status, 'pending') NOT IN ('cancelled','canceled','failed','declined','rejected','expired','refunded','payment_failed')
        AND (b.created_at >= (SELECT created_at FROM itinerary_comparisons WHERE id = ${itineraryId})
          OR b.trip_id = (SELECT trip_id FROM itinerary_comparisons WHERE id = ${itineraryId}))
      UNION ALL
      SELECT 1 FROM bookings b
      WHERE b.user_id = ${travelerId}
        AND COALESCE(b.status, 'pending') NOT IN ('cancelled','canceled','failed','declined','rejected','expired','refunded','payment_failed')
        AND (b.created_at >= (SELECT created_at FROM itinerary_comparisons WHERE id = ${itineraryId})
          OR b.trip_id = (SELECT trip_id FROM itinerary_comparisons WHERE id = ${itineraryId}))
      UNION ALL
      SELECT 1 FROM affiliate_booking_requests b WHERE b.user_id = ${travelerId}
        AND b.status NOT IN ('cancelled','canceled','failed','declined','rejected','expired','refunded','payment_failed')
        AND (b.created_at >= (SELECT created_at FROM itinerary_comparisons WHERE id = ${itineraryId})
          OR b.trip_id = (SELECT trip_id FROM itinerary_comparisons WHERE id = ${itineraryId}))
      UNION ALL
      SELECT 1 FROM coordination_bookings b JOIN coordination_states c ON c.id = b.coordination_id
        WHERE c.user_id = ${travelerId}
        AND b.status NOT IN ('cancelled','canceled','failed','declined','rejected','expired','refunded','payment_failed')
        AND (b.created_at >= (SELECT created_at FROM itinerary_comparisons WHERE id = ${itineraryId})
          OR c.trip_id = (SELECT trip_id FROM itinerary_comparisons WHERE id = ${itineraryId}))
    ) AS booked
  `);
  return Boolean((result.rows[0] as { booked: boolean }).booked);
}

export async function followupPersonalization(tx: Tx, itineraryId: string, destination: string | null) {
  const items = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM itinerary_variant_items i JOIN itinerary_variants v ON v.id = i.variant_id
      JOIN provider_services s ON s.id = i.provider_service_id
      WHERE v.comparison_id = ${itineraryId}
        AND s.approval_status = 'approved' AND s.status = 'active'
    ) AS bookable
  `);
  const expert = destination ? await tx.execute(sql`
    SELECT COALESCE(NULLIF(f.display_name, ''), NULLIF(f.first_name, ''), NULLIF(u.first_name, '')) AS name
    FROM local_expert_forms f JOIN users u ON u.id = f.user_id
    WHERE f.status = 'approved' AND lower(trim(f.city)) = lower(trim(${destination}))
      AND u.role IN ('expert','local_expert','travel_expert')
      AND COALESCE(u.is_deleted, false) = false AND COALESCE(u.is_suspended, false) = false
      AND f.accepts_new_handoffs = true
      AND (SELECT count(*) FROM expert_handoffs h WHERE h.expert_id = u.id
        AND h.status NOT IN ('completed','cancelled','canceled','declined','rejected')) < f.max_concurrent_handoffs
    ORDER BY f.id LIMIT 1
  `) : null;
  return { bookable: Boolean((items.rows[0] as { bookable: boolean }).bookable),
    expertName: (expert?.rows[0] as { name?: string } | undefined)?.name ?? null };
}

/** Transaction spans the provider attempt: a booking cannot commit between check and send. */
export async function deliverItineraryFollowup(outboxId: number, sender: (params: SendEmailParams) => Promise<SendEmailResult>) {
  const [snapshot] = await db.select({ metadata: emailOutbox.metadata }).from(emailOutbox)
    .where(eq(emailOutbox.id, outboxId)).limit(1);
  const meta = snapshot?.metadata as FollowupMetadata | undefined;
  if (!meta?.travelerId || !meta.itineraryId || meta.travelerFollowupVersion !== 1) throw new Error("Missing follow-up identity");
  return db.transaction(async (tx) => {
    await lockFollowupTraveler(tx, meta.travelerId);
    const [row] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).limit(1).for("update");
    if (!row || row.status !== "processing" || !isItineraryFollowup(row.emailType)) return "skipped" as const;
    const [user] = await tx.select().from(users).where(eq(users.id, meta.travelerId)).limit(1);
    const [itinerary] = await tx.select().from(itineraryComparisons).where(and(
      eq(itineraryComparisons.id, meta.itineraryId), eq(itineraryComparisons.userId, meta.travelerId),
    )).limit(1);
    const preferences = marketingPreferences(user?.preferences);
    const cancel = async (reason: string) => {
      await tx.update(emailOutbox).set({ status: "cancelled", lastError: reason, retryAfter: null, updatedAt: new Date() })
        .where(eq(emailOutbox.id, outboxId));
      return "cancelled" as const;
    };
    if (!user || user.isDeleted || user.isSuspended || user.email !== row.toEmail ||
        !preferences || !canQueueGenerationNotice(row.toEmail)) return cancel("No consent, valid recipient, or approved development inbox");
    if (!itinerary || !["generated", "selected"].includes(itinerary.status ?? "")) return cancel("Itinerary removed or no longer ready");
    const latest = await latestReadyItinerary(tx, meta.travelerId);
    if (latest !== meta.itineraryId) {
      await cancelItineraryFollowups(tx, meta.travelerId, "Cancelled by a newer ready itinerary", latest);
      return "cancelled" as const;
    }
    if (await bookingExists(tx, meta.travelerId, meta.itineraryId, meta.readyAt)) {
      await cancelItineraryFollowups(tx, meta.travelerId, "Booking or payment started");
      return "cancelled" as const;
    }
    const now = new Date();
    const clock = localMarketingClock(now, preferences);
    const reservations = await tx.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(sql`${emailOutbox.id} <> ${outboxId} AND ${emailOutbox.metadata}->>'travelerId' = ${meta.travelerId}
        AND ${emailOutbox.metadata}->>'marketing' = 'true'
        AND ${emailOutbox.metadata}->>'deliveryCalendarDay' = ${clock.day}`).limit(1);
    if (clock.quiet || reservations.length > 0) {
      await tx.update(emailOutbox).set({
        status: "pending", retryAfter: nextMarketingWindow(now, preferences, reservations.length ? clock.day : undefined),
        lastError: reservations.length ? "Deferred by daily marketing cap" : "Deferred by recipient quiet hours", updatedAt: now,
      }).where(eq(emailOutbox.id, outboxId));
      return "deferred" as const;
    }
    const facts = await followupPersonalization(tx, meta.itineraryId, itinerary.destination);
    const { getAppBaseUrl } = await import("./email.service");
    const message = buildItineraryFollowupEmail({
      kind: row.emailType, itineraryId: meta.itineraryId, firstName: user.firstName,
      destination: itinerary.destination, ...facts, baseUrl: getAppBaseUrl(), unsubscribeToken: meta.unsubscribeToken,
    });
    if (!message) return cancel("No currently bookable itinerary items");
    const definition = ITINERARY_FOLLOWUPS.find((entry) => entry.kind === row.emailType)!;
    const deliveryMetadata = { ...meta, deliveryCalendarDay: clock.day };
    await tx.update(emailOutbox).set({
      metadata: deliveryMetadata, subject: message.subject, html: message.html, textBody: message.text,
    })
      .where(eq(emailOutbox.id, outboxId));
    const attemptCount = row.attemptCount + 1;
    // Reserve the calendar day even for ambiguous failures; retry only this same row/key.
    const result = await dispatchMessagingEvent(definition.automationId, "itinerary.followup_due",
      { itineraryId: meta.itineraryId }, { eligible: true }, async () => {
        try { return await sender({ to: row.toEmail, ...message, idempotencyKey: `itinerary-followup-${outboxId}` }); }
        catch { return { ok: false, error: "Provider attempt failed" } as SendEmailResult; }
      });
    const dead = attemptCount >= row.maxAttempts;
    await tx.update(emailOutbox).set({
      status: result.ok ? "sent" : dead ? "dead" : "failed", attemptCount,
      resendId: result.id ?? null, sentAt: result.ok ? new Date() : null,
      lastError: result.ok ? null : result.error ?? "Provider attempt failed",
      retryAfter: result.ok || dead ? null : new Date(now.getTime() + [5, 15, 45, 120, 360][Math.min(attemptCount - 1, 4)] * 60_000),
      updatedAt: new Date(),
    }).where(eq(emailOutbox.id, outboxId));
    return result.ok ? "sent" as const : "failed" as const;
  });
}