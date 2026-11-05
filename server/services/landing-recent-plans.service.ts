/**
 * R3-12 (round 3 ruling, Nov 5, 2026; ledger `2026-11-05-r3-entry-city`): the landing rail's order. One read over
 * `trips`: for each listed occasion slug, its newest plan in the market inside the window. Only the ORDER leaves this
 * file — no count, no id, no timestamp (`orderRecentPlanOccasions`).
 */
import { and, gt, inArray, eq, max } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { RECENT_PLANS_OCCASION_SLUGS, orderRecentPlanOccasions, type RecentPlansOccasionSlug } from "@shared/landing-recent-plans";
import { recentPlansWindowDays } from "../config/landing-recent-plans.config";

/** An operating market key, else null (the rail then draws nothing). */
export function recentPlansMarket(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return OPERATING_MARKETS.some((m) => m.marketKey === v) ? v : null;
}

export async function listRecentPlanOccasions(market: string, now: Date = new Date()): Promise<RecentPlansOccasionSlug[]> {
  const since = new Date(now.getTime() - recentPlansWindowDays() * 86_400_000);
  const rows = await db
    .select({ slug: trips.occasionSlug, latest: max(trips.createdAt) })
    .from(trips)
    .where(and(eq(trips.marketSlug, market), inArray(trips.occasionSlug, [...RECENT_PLANS_OCCASION_SLUGS]), gt(trips.createdAt, since)))
    .groupBy(trips.occasionSlug);
  return orderRecentPlanOccasions(rows);
}
