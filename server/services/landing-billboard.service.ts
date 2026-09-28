/**
 * landing-billboard.service.ts — which real expert, if any, has taken a billboard market (landing
 * reorder, ledger `2026-09-28-landing-reorder`, dispatch item 5).
 *
 * The billboard is CURATED (shared/landing-billboard.ts). A real expert replaces a market's tile
 * only when they pass the BYLINE GATE for that market — approved, a claimed handle, a live
 * storefront, a verified neighbourhood there — asked of `checkBylineEligibility` itself, never a
 * second copy of its rules (§18 rule 1). Until one passes, the answer is empty and every tile
 * stays curated. The response carries a handle and an initial only: no id, no name, no price.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { BILLBOARD_TILES, type BillboardExpert } from "@shared/landing-billboard";
import { checkBylineEligibility } from "./blog-byline-gate.service";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

/** Candidates: experts with a VERIFIED neighbourhood whose city resolves to the market. */
async function candidateExpertIds(marketKey: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT en.expert_id AS id, cn.city AS city
      FROM expert_neighborhoods en
      JOIN city_neighborhoods cn ON cn.id = en.neighborhood_id
     WHERE en.verified_at IS NOT NULL
  `);
  return Array.from(
    new Set(
      (rows.rows as any[])
        .filter((r) => resolveMarketSlug(String(r.city ?? "")) === marketKey)
        .map((r) => String(r.id)),
    ),
  ).sort();
}

export async function resolveBillboardExperts(): Promise<BillboardExpert[]> {
  const markets = Array.from(new Set(BILLBOARD_TILES.map((t) => t.marketKey)));
  const out: BillboardExpert[] = [];
  for (const marketKey of markets) {
    for (const id of await candidateExpertIds(marketKey)) {
      const decision = await checkBylineEligibility(id, marketKey);
      if (!decision.eligible) continue;
      const u = await db.execute(sql`SELECT handle, first_name, last_name FROM users WHERE id = ${id} LIMIT 1`);
      const row = u.rows[0] as any;
      const handle = row?.handle as string | null;
      if (!handle) continue;
      const name = String(row?.first_name ?? row?.last_name ?? handle).trim();
      out.push({ marketKey, handle, initial: (name.charAt(0) || handle.charAt(0)).toUpperCase() });
      break;
    }
  }
  return out;
}
