/**
 * P0-e item 4 (ledger `2026-10-12-p0e-findings-and-gaps`): the names of a market's own areas — its
 * `city_neighborhoods` rows for the city plus its wards (`MARKET_WARDS`) — read by the ONE "does this item
 * name a place?" decision (`unnamedPlaceReason`). Never throws: a failed read is "no area names known",
 * which only means a neighbourhood-only title is treated as it was before P0-e.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { cityNeighborhoods } from "@shared/schema";
import { MARKET_WARDS } from "@shared/market-wards";

export async function loadMarketAreaNames(market: string | null | undefined, city: string | null | undefined): Promise<string[]> {
  const out = new Set<string>(market ? MARKET_WARDS[market] ?? [] : []);
  const c = (city ?? "").split(",")[0].trim();
  if (c) {
    try {
      const rows = await db
        .select({ name: cityNeighborhoods.name })
        .from(cityNeighborhoods)
        .where(sql`lower(${cityNeighborhoods.city}) = lower(${c})`);
      for (const r of rows) if (r.name) out.add(r.name);
    } catch (err) {
      console.error(`[market-areas] neighbourhood read failed city=${c}:`, (err as Error)?.message ?? err);
    }
  }
  return Array.from(out);
}
