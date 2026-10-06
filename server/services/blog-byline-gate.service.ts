/**
 * The byline gate (Lane C ruling 9; ledger `2026-09-27-blog-lifecycle`). An expert may carry a byline
 * in a market only when ALL of these hold:
 *   1. an APPROVED expert application (`isExpertApproved` — the one existing predicate);
 *   2. a claimed handle;
 *   3. a LIVE storefront — asked of the storefront loader itself (`loadStorefront(handle)` non-null),
 *      never a second copy of its rules (§18 rule 1: the loader already refuses unverified owners when
 *      the platform requires it, and owners with no approved inventory);
 *   4. a VERIFIED neighbourhood in that market (`expert_neighborhoods.verified_at IS NOT NULL`, born
 *      only by admin ratification — Locked Decision 27), whose city resolves to the market through the
 *      one operating-markets resolver.
 * The decision is PURE (`decideBylineEligibility`) so it is proven without a database; the loader
 * gathers the four facts.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isExpertApproved } from "./booking-actions.service";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

export type BylineRefusal =
  | "no_market"
  | "not_approved"
  | "no_handle"
  | "storefront_not_live"
  | "no_verified_neighborhood_in_market";

export interface BylineFacts {
  marketSlug: string | null;
  approved: boolean;
  handle: string | null;
  storefrontLive: boolean;
  verifiedMarkets: readonly string[];
}

export type BylineDecision = { eligible: true } | { eligible: false; reason: BylineRefusal };

/** Pure. Ordered so the reason names the FIRST missing fact an admin can act on. */
export function decideBylineEligibility(f: BylineFacts): BylineDecision {
  if (!f.marketSlug) return { eligible: false, reason: "no_market" };
  if (!f.approved) return { eligible: false, reason: "not_approved" };
  if (!f.handle) return { eligible: false, reason: "no_handle" };
  if (!f.storefrontLive) return { eligible: false, reason: "storefront_not_live" };
  if (!f.verifiedMarkets.includes(f.marketSlug)) return { eligible: false, reason: "no_verified_neighborhood_in_market" };
  return { eligible: true };
}

/**
 * The markets in which this expert holds a VERIFIED neighbourhood (`expert_neighborhoods.verified_at`,
 * LD 27) — the byline gate's fact 4, and the Ready Made preview's "local · verified" stamp (Slice B1).
 * ONE reading of "verified in a market" (§18 rule 1).
 */
export async function loadVerifiedMarkets(expertId: string): Promise<string[]> {
  const n = await db.execute(sql`
    SELECT DISTINCT cn.city
      FROM expert_neighborhoods en
      JOIN city_neighborhoods cn ON cn.id = en.neighborhood_id
     WHERE en.expert_id = ${expertId}
       AND en.verified_at IS NOT NULL
  `);
  return Array.from(
    new Set(
      (n.rows as any[])
        .map((r) => resolveMarketSlug(String(r.city ?? "")))
        .filter((m): m is string => typeof m === "string" && m.length > 0),
    ),
  );
}

export async function loadBylineFacts(expertId: string, marketSlug: string | null): Promise<BylineFacts> {
  const approved = await isExpertApproved(expertId);
  const u = await db.execute(sql`SELECT handle FROM users WHERE id = ${expertId} LIMIT 1`);
  const handle = ((u.rows[0] as any)?.handle as string | null | undefined) ?? null;
  let storefrontLive = false;
  if (handle) {
    // Imported lazily: the storefront module is a routes file with a heavy graph.
    const { loadStorefront } = await import("../routes/storefront.routes");
    storefrontLive = (await loadStorefront(handle)) != null;
  }
  const verifiedMarkets = await loadVerifiedMarkets(expertId);
  return { marketSlug, approved, handle, storefrontLive, verifiedMarkets };
}

export async function checkBylineEligibility(expertId: string, marketSlug: string | null): Promise<BylineDecision> {
  return decideBylineEligibility(await loadBylineFacts(expertId, marketSlug));
}
