/**
 * Concierge admin-queue tier views (Lane C / C2).
 *
 * GET /api/admin/concierge-requests historically filtered
 * `WHERE cr.chosen_tier IN ('expert','full')`, which made Platform-tier
 * ('ai') requests invisible to staff. Under the Platform/Destination ruling
 * the Platform tier is a HYBRID (AI starts, a human steps in), so its
 * requests are real staff work and must be reachable from the same queue.
 *
 * One query, tier as a parameter (never a forked route): the route resolves
 * the requested view to a tier list here and injects it as a single
 * `= ANY($n)` parameter. The DEFAULT view is unchanged for staff
 * muscle-memory — human tiers (expert/full) first.
 */
import { conciergeTiers, type ConciergeTier } from "@workspace/db";

export type ConciergeTierView = "human" | "ai" | "expert" | "full" | "all";

export const CONCIERGE_TIER_VIEWS: Record<ConciergeTierView, readonly ConciergeTier[]> = {
  /** Default — the pre-existing queue behavior (expert + full). */
  human: ["expert", "full"],
  /** Platform Concierge — powered by our platform (hybrid: human end of AI chat). */
  ai: ["ai"],
  /** Destination Concierge — powered by local experts. */
  expert: ["expert"],
  /** Full / Done-for-You. */
  full: ["full"],
  all: [...conciergeTiers],
};

/**
 * Resolve a raw `?tier=` query value to the tier list the SQL filters on.
 * Unknown/absent values fall back to the default human view — the queue never
 * errors or widens on a bad parameter.
 */
export function resolveConciergeTierView(raw: unknown): readonly ConciergeTier[] {
  if (typeof raw === "string" && raw in CONCIERGE_TIER_VIEWS) {
    return CONCIERGE_TIER_VIEWS[raw as ConciergeTierView];
  }
  return CONCIERGE_TIER_VIEWS.human;
}
