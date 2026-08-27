/**
 * plan-membership.service.ts — the user-level entitlement read layer.
 *
 * Ledger 2026-08-27-plus-is-delivery. `plan_memberships` is the ONE entitlement record for the
 * recurring plans (`plus_annual` | `pro_monthly`). This lane READS it to gate scheduled occasion
 * drafts; the separate Plus-checkout lane later WRITES `source='stripe'` rows from the Stripe
 * subscription webhook. Trip Pass stays per-trip and is not modelled here.
 *
 * "Active" = a row with status='active' AND (current_period_end IS NULL OR current_period_end >
 * now()). A NULL period-end is treated as open-ended (a manual/beta grant with no explicit expiry);
 * a stripe row always carries the period end from the subscription.
 */
import { and, eq, gt, or, isNull } from "drizzle-orm";
import { db } from "../db";
import { planMemberships, type PlanMembership } from "@shared/schema";
import { PLAN_KEYS } from "./plans.service";

/** The live entitlement row for a user on a given plan, or null. Most-recent period wins. */
export async function getActiveMembership(
  userId: string,
  planKey: string,
): Promise<PlanMembership | null> {
  const rows = await db
    .select()
    .from(planMemberships)
    .where(
      and(
        eq(planMemberships.userId, userId),
        eq(planMemberships.planKey, planKey),
        eq(planMemberships.status, "active"),
        // NULL period-end = open-ended grant; otherwise it must not have lapsed.
        or(isNull(planMemberships.currentPeriodEnd), gt(planMemberships.currentPeriodEnd, new Date())),
      ),
    );
  // A user can accrue history (lapsed → re-subscribed) as separate rows; if more than one is live,
  // the one with the furthest period-end (or an open-ended one) is the operative grant.
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => {
    if (!best) return r;
    if (r.currentPeriodEnd === null) return r; // open-ended dominates
    if (best.currentPeriodEnd === null) return best;
    return r.currentPeriodEnd > best.currentPeriodEnd ? r : best;
  }, null as PlanMembership | null);
}

/** Is this user an active Plus (annual) member? The delivery gate for scheduled occasion drafts. */
export async function isActivePlus(userId: string): Promise<boolean> {
  return (await getActiveMembership(userId, PLAN_KEYS.PLUS_ANNUAL)) !== null;
}

/** Is this user an active Pro member? (Not used by this lane; provided for parity/reuse.) */
export async function isActivePro(userId: string): Promise<boolean> {
  return (await getActiveMembership(userId, PLAN_KEYS.PRO_MONTHLY)) !== null;
}
