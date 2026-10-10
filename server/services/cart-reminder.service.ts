import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { cartItems, emailOutbox, users } from "@shared/schema";
import { evaluateCartClock } from "./cart-email-state.service";
import { marketingPreferences } from "./itinerary-followup-email";
import {
  CART_REMINDERS, dueCartReminder, isCartReminder, cartReminderThreshold, buildCartReminderEmail,
  type CartReminderKind,
} from "./cart-reminder-email";
import {
  lockMarketingTraveler, marketingDayReserved, marketingWindow, nextCartMarketingWindow,
  reserveMarketingDay,
  type MarketingTx,
} from "./marketing-delivery-policy.service";
import type { SendEmailParams, SendEmailResult } from "./email.service";

type Reader = Pick<typeof db, "execute">;
export const PAYMENT_COVERAGE_DEFECTS = [
  "stripe_activity_before_local_persistence_or_unstamped_lifecycle",
  "off_platform_partner_payment_without_local_update",
  "fee_ledger_source_without_proven_traveler_ownership",
] as const;

// Identifiers are constant server code, never client input. This inventory is
// recorded activity only: it is NOT a claim of complete all-rail coverage.
export const READABLE_COMMERCE_RAILS = [
  { name: "canonical_provider", from: "service_bookings r", owner: "r.traveler_id", times: ["created_at", "updated_at"] },
  { name: "legacy_booking", from: "bookings r", owner: "r.user_id", times: ["created_at", "updated_at"] },
  { name: "stripe_intent_ledger", from: "payment_intents r", owner: "r.user_id", times: ["created_at", "updated_at"] },
  { name: "credits", from: "credit_transactions r LEFT JOIN wallets w ON w.id=r.wallet_id", owner: "w.user_id", times: ["created_at"] },
  { name: "wallet", from: "wallets r", owner: "r.user_id", times: ["created_at", "updated_at"] },
  { name: "trip_pass", from: "plan_memberships r", owner: "r.user_id", times: ["created_at", "updated_at"] },
  { name: "partner_request", from: "affiliate_booking_requests r", owner: "r.user_id", times: ["created_at", "updated_at"] },
  { name: "coordination", from: "coordination_states r", owner: "r.user_id", times: ["created_at", "updated_at"] },
  { name: "coordination_booking", from: "coordination_bookings r LEFT JOIN coordination_states c ON c.id=r.coordination_id", owner: "c.user_id", times: ["created_at", "updated_at"] },
  { name: "coordination_credit", from: "coordination_fee_credits r", owner: "r.user_id", times: ["created_at"] },
  { name: "ready_made_purchase", from: "ready_made_purchases r", owner: "r.buyer_id", times: ["purchased_at"] },
  { name: "template_purchase", from: "template_purchases r", owner: "r.buyer_id", times: ["purchased_at"] },
  { name: "expert_tip", from: "expert_tips r", owner: "r.traveler_id", times: ["created_at"] },
  { name: "expert_request", from: "expert_requests r", owner: "r.user_id", times: ["created_at"] },
  { name: "booking_request", from: "booking_requests r", owner: "r.user_id", times: ["created_at", "updated_at"] },
  { name: "provider_request", from: "provider_booking_requests r LEFT JOIN trips t ON t.id=r.trip_id", owner: "t.user_id", times: ["created_at", "updated_at"] },
  { name: "group_transaction", from: "trip_transactions r LEFT JOIN trips t ON t.id=r.trip_id LEFT JOIN trip_participants p ON p.id=r.paid_by_participant_id", owner: "coalesce(p.user_id,t.user_id)", times: ["created_at", "updated_at"] },
] as const;

export interface CommerceActivityCheck {
  allowed: boolean;
  recordedClear: boolean;
  activityRails: string[];
  unknownRails: string[];
  reason: string | null;
}

/** Pure timestamp proof, also used for missing/malformed timestamp fuzzing. */
export function recordedRailState(owner: unknown, times: readonly unknown[], start: number) {
  try {
    if (typeof owner !== "string" || !owner || !Array.isArray(times) || !times.length ||
        !Number.isSafeInteger(start) || start <= 0) return "unknown";
    const dates = times.map(time => {
      if (time instanceof Date) return time.getTime();
      if (typeof time !== "string") return NaN;
      // PostgreSQL timestamp-without-time-zone values use the existing ORM's
      // UTC convention, never the process/viewer's local time.
      const normalized = time.replace(" ", "T");
      return Date.parse(/(?:Z|[+-]\d\d(?::?\d\d)?)$/i.test(normalized) ? normalized : normalized + "Z");
    });
    if (dates.some(date => !Number.isFinite(date))) return "unknown";
    return dates.some(date => date >= start) ? "activity" : "clear";
  } catch { return "unknown"; }
}

/**
 * ONE reusable, SELECT-only function for sweep and future Part 6 verify-at-send.
 * No status exclusions: booking/payment activity of ANY status blocks.
 * No guessed cart association. Unknown external coverage prevents permission.
 * A query error throws to the sweep's FAILED heartbeat, never becomes [].
 */
export async function readTravelerCommerceActivity(
  reader: Reader, travelerId: string, sequenceStartMs: number, lastActivityMs: number,
): Promise<CommerceActivityCheck> {
  const unknown = new Set<string>(PAYMENT_COVERAGE_DEFECTS);
  const activity = new Set<string>();
  if (!travelerId || !Number.isSafeInteger(sequenceStartMs) || sequenceStartMs <= 0 ||
      !Number.isSafeInteger(lastActivityMs) || lastActivityMs < sequenceStartMs) {
    return { allowed: false, recordedClear: false, activityRails: [], unknownRails: ["invalid_sequence_time"],
      reason: "payment_correlation_ambiguous" };
  }
  const tables = await reader.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname=current_schema()`);
  const present = new Set(tables.rows.map(row => String(row.tablename)));
  const readable = READABLE_COMMERCE_RAILS.filter(rail => {
    const missing = !present.has(rail.from.split(" ")[0]);
    if (missing) unknown.add(rail.name);
    return !missing;
  });
  if (readable.length) {
    const queries = readable.map(rail => {
      const owner = rail.name === "group_transaction"
        ? sql`CASE WHEN t.user_id=${travelerId} OR p.user_id=${travelerId} THEN ${travelerId} ELSE ${sql.raw(rail.owner)} END`
        : sql.raw(rail.owner);
      return sql`SELECT ${rail.name}::text AS rail, ${owner}::text AS owner,
        to_jsonb(r) AS record FROM ${sql.raw(rail.from)}
        WHERE ${owner} = ${travelerId} OR ${owner} IS NULL`;
    });
    const rows = await reader.execute(sql.join(queries, sql` UNION ALL `));
    for (const row of rows.rows as { rail: string; owner: string | null; record: Record<string, unknown> }[]) {
      const rail = readable.find(source => source.name === row.rail)!;
      const state = recordedRailState(row.owner, rail.times.map(time => row.record[time]), sequenceStartMs);
      if (state === "unknown") unknown.add(rail.name);
      if (state === "activity") activity.add(rail.name);
    }
  }
  return {
    allowed: activity.size === 0 && unknown.size === 0,
    recordedClear: activity.size === 0 && unknown.size === PAYMENT_COVERAGE_DEFECTS.length,
    activityRails: Array.from(activity), unknownRails: Array.from(unknown),
    reason: activity.size ? "payment_or_booking_since_sequence_start" : "payment_rail_unknown",
  };
}

export interface CartReminderDecision {
  eligible: boolean; reason: string;
  kind?: CartReminderKind; sequenceId?: string; sequenceStartMs?: number;
}

/** Test seams only exercised in disposable, provider-free verification schemas. */
export const cartReminderVerification = {
  now: null as Date | null,
  recordedRailsOnly: false,
};
export function cartReminderVerificationEnabled() {
  return ["test", "development"].includes(process.env.NODE_ENV ?? "") &&
    /^automation_msg_[a-f0-9]{16}$/.test(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "");
}
export async function cartReminderNow(reader: Reader) {
  if (process.env.NODE_ENV === "test" && cartReminderVerificationEnabled() && cartReminderVerification.now) {
    return new Date(cartReminderVerification.now);
  }
  const result = await reader.execute(sql`SELECT statement_timestamp() AS now`);
  return new Date((result.rows[0] as { now: string | Date }).now);
}

export async function assessCartReminder(
  tx: MarketingTx, travelerId: string, scope: string | null, now: Date,
  requested?: { kind: string; sequenceId: string },
): Promise<CartReminderDecision> {
  const deny = (reason: string): CartReminderDecision => ({ eligible: false, reason });
  if (!cartReminderVerificationEnabled() ||
      (await tx.execute(sql`SELECT current_schema() AS name`)).rows[0].name !== process.env.MESSAGING_VERIFICATION_SCHEMA) {
    return deny("commerce_verification_disabled");
  }
  const [account] = await tx.select().from(users).where(eq(users.id, travelerId)).limit(1);
  if (!account || account.isDeleted) return deny("account_deleted");
  if (account.isSuspended) return deny("account_suspended");
  if (!account.email) return deny("no_account_recipient");
  if (!/^[^@\s]+@traveloure-qa\.test$/i.test(account.email)) return deny("non_qa_recipient");
  const input = (account.preferences as any)?.itineraryMarketing;
  if (input?.enabled !== true) return deny("marketing_unsubscribed");
  const preferences = marketingPreferences(account.preferences);
  if (!preferences) return deny("unknown_timezone_or_preferences");
  const rows = await tx.select().from(cartItems).where(and(eq(cartItems.userId, travelerId),
    scope === null ? sql`${cartItems.experienceSlug} IS NULL` : eq(cartItems.experienceSlug, scope)));
  const clock = evaluateCartClock(rows, now.getTime());
  if (!clock.eligible) return deny(clock.reason);
  if (rows.some(row => !row.tripId || !row.itineraryItemId) || !rows.some(row => row.serviceId)) {
    return deny("payment_correlation_ambiguous");
  }
  // Part 2 creates a fresh sequence on EVERY real activity; at_ms is both
  // the current sequence's start and last activity. No new JSONB field/backfill.
  const paid = await readTravelerCommerceActivity(tx, travelerId, clock.lastActivityMs, clock.lastActivityMs);
  const recordedOnly = process.env.NODE_ENV === "test" && cartReminderVerificationEnabled() &&
    cartReminderVerification.recordedRailsOnly;
  if (!(recordedOnly ? paid.recordedClear : paid.allowed)) return deny(paid.reason!);
  const { cartItemChangeSentToday } = await import("./marketing-delivery-policy.service");
  if (await cartItemChangeSentToday(tx, travelerId, now, preferences)) return deny("item_change_sent_today");
  const history = await tx.execute(sql`SELECT email_type, status, sent_at FROM email_outbox
    WHERE metadata->>'cartReminderVersion' = '1' AND metadata->>'travelerId' = ${travelerId}
      AND metadata->>'sequenceId' = ${clock.sequenceId}
      AND metadata->>'cartScopeRaw' IS NOT DISTINCT FROM ${scope}`);
  const sent = (history.rows as { email_type: string; status: string; sent_at: unknown }[])
    .filter(row => row.status === "sent" || row.sent_at != null).map(row => row.email_type);
  const kind = requested?.kind ?? dueCartReminder(clock.idleMs, sent);
  if (!kind || !isCartReminder(kind)) return deny("no_due_step_or_unsupported_step");
  if (requested && requested.sequenceId !== clock.sequenceId) return deny("sequence_superseded");
  if (sent.includes(kind)) return deny("step_already_sent");
  if (clock.idleMs < cartReminderThreshold(kind)) return deny("not_idle");
  // A forged later step cannot bypass the closed, oldest-unsent progression.
  if (kind !== dueCartReminder(clock.idleMs, sent)) return deny("step_out_of_order");
  const local = marketingWindow(now, preferences);
  if (local.quiet) return deny("outside_marketing_window");
  return { eligible: true, reason: "eligible", kind, sequenceId: clock.sequenceId, sequenceStartMs: clock.lastActivityMs };
}

export async function eligibleCartHasPriority(tx: MarketingTx, travelerId: string, now: Date) {
  if (!cartReminderVerificationEnabled()) return false; // no production activation
  const scopes = await tx.execute(sql`SELECT DISTINCT experience_slug AS scope FROM cart_items WHERE user_id=${travelerId}`);
  for (const row of scopes.rows as { scope: string | null }[]) {
    if ((await assessCartReminder(tx, travelerId, row.scope, now)).eligible) return true;
  }
  return false;
}

/**
 * Verification-only guarded delivery. With no synthetic sender, keep pending.
 * NEVER imports the real provider transport. Part 6/release remain blocked.
 */
export async function deliverCartReminder(
  outboxId: number, syntheticSender?: (params: SendEmailParams) => Promise<SendEmailResult>,
) {
  const [snapshot] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).limit(1);
  const meta = snapshot?.metadata as Record<string, any> | undefined;
  return db.transaction(async tx => {
    if (typeof meta?.travelerId === "string") await lockMarketingTraveler(tx, meta.travelerId);
    const [row] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).limit(1).for("update");
    if (!row || row.status !== "processing") return "skipped";
    const cancel = async (reason: string) => {
      await tx.update(emailOutbox).set({ status: "cancelled", lastError: reason, retryAfter: null, updatedAt: new Date() })
        .where(eq(emailOutbox.id, outboxId));
      return "cancelled";
    };
    if (row.sentAt) return cancel("step_already_sent");
    if (!cartReminderVerificationEnabled() || !isCartReminder(row.emailType) ||
        meta?.cartReminderVersion !== 1 || typeof meta.travelerId !== "string" ||
        typeof meta.sequenceId !== "string" || !(meta.cartScopeRaw === null || typeof meta.cartScopeRaw === "string")) {
      return cancel("unsupported_or_unreleased_cart_reminder");
    }
    const now = await cartReminderNow(tx);
    const decision = await assessCartReminder(tx, meta.travelerId, meta.cartScopeRaw, now,
      { kind: row.emailType, sequenceId: meta.sequenceId });
    const [account] = await tx.select().from(users).where(eq(users.id, meta.travelerId)).limit(1);
    if (account?.email !== row.toEmail) return cancel("recipient_changed");
    const preferences = marketingPreferences(account?.preferences);
    if (!decision.eligible && decision.reason !== "outside_marketing_window") return cancel(decision.reason);
    const local = marketingWindow(now, preferences!);
    const capped = await marketingDayReserved(tx, meta.travelerId, local.day, outboxId);
    if (!decision.eligible || capped || !syntheticSender || process.env.NODE_ENV !== "test") {
      const reason = capped ? "daily_marketing_cap" : !decision.eligible ? decision.reason : "verification_queue_only";
      await tx.update(emailOutbox).set({ status: "pending", lastError: reason,
        retryAfter: nextCartMarketingWindow(now, preferences!, capped ? local.day : undefined), updatedAt: new Date() })
        .where(eq(emailOutbox.id, outboxId));
      return "deferred";
    }
    const reserved = reserveMarketingDay(meta, local.day);
    await tx.update(emailOutbox).set({ metadata: reserved }).where(eq(emailOutbox.id, outboxId));
    let result: SendEmailResult;
    try { result = await syntheticSender({ to: row.toEmail, ...buildCartReminderEmail(), idempotencyKey: `cart-reminder-${outboxId}` }); }
    catch { result = { ok: false, error: "Synthetic provider attempt failed" }; }
    const attemptCount = row.attemptCount + 1, dead = attemptCount >= row.maxAttempts;
    await tx.update(emailOutbox).set({
      status: result.ok ? "sent" : dead ? "dead" : "failed", attemptCount,
      resendId: result.id ?? null, sentAt: result.ok ? now : null,
      lastError: result.ok ? null : "Synthetic provider attempt failed",
      retryAfter: result.ok || dead ? null : new Date(now.getTime() + 5 * 60_000), updatedAt: new Date(),
    }).where(eq(emailOutbox.id, outboxId));
    return result.ok ? "sent" : "failed";
  });
}
