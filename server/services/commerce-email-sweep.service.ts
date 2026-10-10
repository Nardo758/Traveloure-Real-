/**
 * Development-only sweep: stored-state SELECTs and durable outbox enqueue only.
 * Unknown rail coverage blocks eligibility; no provider transport or new timer.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { enqueuePendingCommerceReminder } from "./email-outbox.service";
import { messagingAutomationRegistry } from "../automations/messaging";
import { runScheduledAutomation } from "../automations/scheduler-wrapper";
import { assessCartReminder, cartReminderNow } from "./cart-reminder.service";
import { lockMarketingTraveler, marketingDayReserved, marketingWindow } from "./marketing-delivery-policy.service";
import { marketingPreferences } from "./itinerary-followup-email";
import { assessCartItemChanges } from "./cart-item-change.service";
import { enqueuePendingCartItemChange } from "./email-outbox.service";

export const COMMERCE_SWEEP_JOB = "commerce-email-sweep";
export interface CommerceCandidate {
  user_id: string | null;
  guest_session_id: string | null;
  scope: string | null;
  email: string | null;
  items: { contentMeta?: unknown }[];
  now_ms: string;
}
export interface CommerceSweepCounts {
  candidates: number; enqueued: number; duplicates: number; skipped: number;
  skipReasons: Record<string, number>;
  /** Existing top-level counters remain reminder-only for backward compatibility. */
  itemChanges?: { enqueued: number; duplicates: number; skipped: number; skipReasons: Record<string, number> };
}

/** Reuse the retained verification runner's existing opt-in, default off. */
export function commerceVerificationEnabled(): boolean {
  return ["test", "development"].includes(process.env.NODE_ENV ?? "") &&
    /^automation_msg_[a-f0-9]{16}$/.test(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "");
}

async function assertIsolatedDevelopment(): Promise<void> {
  if (!commerceVerificationEnabled()) throw new Error("Commerce sweep is not released");
  const result = await db.execute(sql`SELECT current_schema() AS schema`);
  if ((result.rows[0] as { schema: string }).schema !== process.env.MESSAGING_VERIFICATION_SCHEMA) {
    throw new Error("Commerce sweep requires a disposable verification schema");
  }
}

/** Different experience scopes remain separate; NULL cannot collide with a named slug. */
export function commerceCartScopeId(scope: string | null): string {
  return scope === null ? "unscoped" : `experience:${Buffer.from(scope).toString("base64url")}`;
}

export async function selectCommerceCandidates(): Promise<CommerceCandidate[]> {
  const result = await db.execute(sql`
    SELECT c.user_id,
      CASE WHEN c.user_id IS NULL THEN c.guest_session_id ELSE NULL END AS guest_session_id,
      c.experience_slug AS scope, u.email,
      jsonb_agg(jsonb_build_object('contentMeta', c.content_meta)) AS items,
      (extract(epoch FROM statement_timestamp()) * 1000)::bigint AS now_ms
    FROM cart_items c LEFT JOIN users u ON u.id = c.user_id
    GROUP BY c.user_id,
      CASE WHEN c.user_id IS NULL THEN c.guest_session_id ELSE NULL END,
      c.experience_slug, u.email
    ORDER BY 1, 2, 3`);
  return result.rows as unknown as CommerceCandidate[];
}

/** Test seam replaces only the SELECT; isolation cannot be bypassed by it. */
export const commerceSweepDependencies = { selectCandidates: selectCommerceCandidates };

export async function runCommerceEmailSweep(): Promise<CommerceSweepCounts> {
  await assertIsolatedDevelopment();
  // Do not catch and return []. A failure must reach the endpoint's FAILED recorder.
  const candidates = await commerceSweepDependencies.selectCandidates();
  const counts: CommerceSweepCounts = {
    candidates: candidates.length, enqueued: 0, duplicates: 0, skipped: 0, skipReasons: {},
  };
  const skip = (reason: string) => {
    counts.skipped++; counts.skipReasons[reason] = (counts.skipReasons[reason] ?? 0) + 1;
  };
  if (candidates.length) counts.itemChanges = { enqueued: 0, duplicates: 0, skipped: 0, skipReasons: {} };
  const skipItem = (reason: string) => {
    counts.itemChanges!.skipped++;
    counts.itemChanges!.skipReasons[reason] = (counts.itemChanges!.skipReasons[reason] ?? 0) + 1;
  };
  for (const candidate of candidates) {
    if (!candidate.user_id || !candidate.email) {
      skip("no_account_recipient"); skipItem("no_account_recipient"); continue;
    }
    // Even an accidental data-bearing clone must never queue a real address.
    if (!/^[^@\s]+@traveloure-qa\.test$/i.test(candidate.email)) {
      skip("non_qa_recipient"); skipItem("non_qa_recipient"); continue;
    }
    // Re-read the authoritative cart under the recipient lock below. Do not
    // decide from an earlier candidate snapshot or a caller-supplied clock.
    const cartScope = commerceCartScopeId(candidate.scope);
    // Must-have family comes first; it does not consult marketing consent/window/cap.
    // Query/marker failures throw to the SAME job's FAILED heartbeat recorder.
    const itemChanges = await db.transaction(async tx => {
      await lockMarketingTraveler(tx, candidate.user_id!);
      const assessed = await assessCartItemChanges(tx, candidate.user_id!, candidate.scope, await cartReminderNow(tx));
      let enqueued = 0, duplicates = 0;
      for (const change of assessed.changes) {
        if (await enqueuePendingCartItemChange(change, tx)) enqueued++;
        else duplicates++;
      }
      return { enqueued, duplicates, skipped: assessed.skipped };
    });
    counts.itemChanges!.enqueued += itemChanges.enqueued;
    counts.itemChanges!.duplicates += itemChanges.duplicates;
    for (const [reason, number] of Object.entries(itemChanges.skipped)) {
      counts.itemChanges!.skipped += number;
      counts.itemChanges!.skipReasons[reason] = (counts.itemChanges!.skipReasons[reason] ?? 0) + number;
    }
    const result = await db.transaction(async tx => {
      await lockMarketingTraveler(tx, candidate.user_id!);
      const now = await cartReminderNow(tx);
      const decision = await assessCartReminder(tx, candidate.user_id!, candidate.scope, now);
      if (!decision.eligible) return { reason: decision.reason };
      const account = (await tx.execute(sql`SELECT email, preferences FROM users WHERE id=${candidate.user_id}`)).rows[0] as
        { email: string; preferences: unknown };
      const local = marketingWindow(now, marketingPreferences(account.preferences)!);
      if (await marketingDayReserved(tx, candidate.user_id!, local.day)) return { reason: "daily_marketing_cap" };
      const key = `${decision.kind!.replaceAll("_", "-")}:user:${candidate.user_id}:cart:${cartScope}:${decision.sequenceId}`;
      const queued = await enqueuePendingCommerceReminder(account.email, key, decision.sequenceId!, cartScope, {
        kind: decision.kind!, travelerId: candidate.user_id!, scope: candidate.scope,
        sequenceStartMs: decision.sequenceStartMs!,
      }, tx);
      return { queued };
    });
    if ("reason" in result) skip(result.reason!);
    else if (result.queued) counts.enqueued++;
    else counts.duplicates++;
  }
  return counts;
}

export function runCommerceEmailSweepSchedule() {
  return runScheduledAutomation(messagingAutomationRegistry,
    "messaging.commerce-email-sweep",
    { scheduleId: COMMERCE_SWEEP_JOB, isolatedDevelopment: commerceVerificationEnabled() },
    () => runCommerceEmailSweep(), { scheduleId: COMMERCE_SWEEP_JOB });
}
