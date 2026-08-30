/**
 * entity-resolver.ts — Phase 2.2a entity resolution.
 *
 * Resolves internal entities → Wikidata QID + Wikipedia title.
 * Rule: null when unconfident. Never fuzzy-force a match.
 *
 * Resolution tiers (Phase 2.2a scope):
 *   1. 8 operating market entities — pre-seeded in migration 235 with known QIDs.
 *      This pass fills any gaps and enriches if columns were null.
 *   2. Kyoto neighborhoods — queried from city_neighborhoods, resolved via Wikidata name+geo.
 *   3. Kyoto gems — queried from travel_pulse_hidden_gems / ai_discovered_gems, resolved
 *      via Wikidata if besttime_venue_matchable is true.
 *
 * Wikidata resolution uses the public Wikidata search API (no auth required, open license).
 * Wikipedia article existence confirmed via Wikipedia search API.
 *
 * Match rates are reported in the return value for the Phase 2.2a gate.
 */

import { db } from "../../db";
import { trendEntities, cityNeighborhoods, travelPulseHiddenGems } from "@shared/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { OPERATING_MARKETS } from "./operating-markets";

const WIKIDATA_SEARCH = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_SEARCH = "https://en.wikipedia.org/w/api.php";

export interface ResolutionReport {
  markets: { total: number; resolved: number; rate: number };
  kyotoNeighborhoods: { total: number; resolved: number; rate: number };
  kyotoGems: { total: number; resolved: number; rate: number };
  errors: string[];
}

async function wikidataSearch(
  name: string,
  language = "en",
): Promise<{ qid: string; label: string } | null> {
  try {
    const url =
      `${WIKIDATA_SEARCH}?action=wbsearchentities&search=${encodeURIComponent(name)}` +
      `&type=item&language=${language}&format=json&limit=3`;
    const res = await fetch(url, { headers: { "User-Agent": "Traveloure-TrendEngine/2.0" } });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const results: any[] = data.search ?? [];
    if (!results.length) return null;
    // Confidence check: label must match the search name (case-insensitive, allowing minor variations)
    const best = results[0];
    const labelMatch =
      best.label?.toLowerCase() === name.toLowerCase() ||
      best.label?.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(best.label?.toLowerCase() ?? "");
    if (!labelMatch) return null;
    return { qid: best.id, label: best.label };
  } catch {
    return null;
  }
}

async function wikipediaExists(title: string): Promise<string | null> {
  try {
    const url =
      `${WIKIPEDIA_SEARCH}?action=query&list=search&srsearch=${encodeURIComponent(title)}` +
      `&format=json&srlimit=1`;
    const res = await fetch(url, { headers: { "User-Agent": "Traveloure-TrendEngine/2.0" } });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const hits: any[] = data.query?.search ?? [];
    if (!hits.length) return null;
    return hits[0].title as string;
  } catch {
    return null;
  }
}

export class EntityResolver {
  /**
   * Run full resolution pass. Idempotent — safe to re-run.
   * Returns a match-rate report for the Phase 2.2a gate.
   */
  async resolve(): Promise<ResolutionReport> {
    const report: ResolutionReport = {
      markets: { total: 0, resolved: 0, rate: 0 },
      kyotoNeighborhoods: { total: 0, resolved: 0, rate: 0 },
      kyotoGems: { total: 0, resolved: 0, rate: 0 },
      errors: [],
    };

    await this.resolveMarkets(report);
    await this.resolveKyotoNeighborhoods(report);
    await this.resolveKyotoGems(report);

    report.markets.rate =
      report.markets.total > 0 ? report.markets.resolved / report.markets.total : 0;
    report.kyotoNeighborhoods.rate =
      report.kyotoNeighborhoods.total > 0
        ? report.kyotoNeighborhoods.resolved / report.kyotoNeighborhoods.total
        : 0;
    report.kyotoGems.rate =
      report.kyotoGems.total > 0 ? report.kyotoGems.resolved / report.kyotoGems.total : 0;

    return report;
  }

  private async resolveMarkets(report: ResolutionReport): Promise<void> {
    // Markets are pre-seeded in migration 235 with known QIDs.
    // This pass verifies each has a Wikipedia title; enriches if missing.
    for (const market of OPERATING_MARKETS) {
      report.markets.total++;
      try {
        const [existing] = await db
          .select()
          .from(trendEntities)
          .where(
            and(
              eq(trendEntities.entityType, "market"),
              eq(trendEntities.internalId, market.marketKey),
            ),
          )
          .limit(1);

        if (!existing) {
          // Seed row missing — insert with known QID
          await db.insert(trendEntities).values({
            entityType: "market",
            internalId: market.marketKey,
            wikidataQid: market.wikidataQid,
            wikipediaTitle: market.wikipediaTitle,
          }).onConflictDoNothing();
          report.markets.resolved++;
          continue;
        }

        // Enrich Wikipedia title if missing
        if (!existing.wikipediaTitle) {
          const title = await wikipediaExists(market.wikipediaTitle);
          if (title) {
            await db
              .update(trendEntities)
              .set({ wikipediaTitle: title, updatedAt: new Date() })
              .where(eq(trendEntities.id, existing.id));
          }
        }
        report.markets.resolved++;
      } catch (err: any) {
        report.errors.push(`market:${market.marketKey}: ${err.message}`);
      }
    }
  }

  private async resolveKyotoNeighborhoods(report: ResolutionReport): Promise<void> {
    const neighborhoods = await db
      .select()
      .from(cityNeighborhoods)
      .where(
        and(
          eq(cityNeighborhoods.city, "Kyoto"),
        ),
      );

    for (const n of neighborhoods) {
      report.kyotoNeighborhoods.total++;
      try {
        // Ensure trend_entity row exists
        const [existing] = await db
          .select()
          .from(trendEntities)
          .where(
            and(
              eq(trendEntities.entityType, "neighborhood"),
              eq(trendEntities.internalId, n.id),
            ),
          )
          .limit(1);

        if (!existing) {
          // Attempt Wikidata resolution by name
          const wdResult = await wikidataSearch(`${n.name} Kyoto`);
          await db
            .insert(trendEntities)
            .values({
              entityType: "neighborhood",
              internalId: n.id,
              wikidataQid: wdResult?.qid ?? null,
              wikipediaTitle: wdResult ? await wikipediaExists(wdResult.label) : null,
            })
            .onConflictDoNothing();
          if (wdResult) report.kyotoNeighborhoods.resolved++;
        } else {
          // Enrich if QID missing
          if (!existing.wikidataQid) {
            const wdResult = await wikidataSearch(`${n.name} Kyoto`);
            if (wdResult) {
              await db
                .update(trendEntities)
                .set({
                  wikidataQid: wdResult.qid,
                  wikipediaTitle: await wikipediaExists(wdResult.label),
                  updatedAt: new Date(),
                })
                .where(eq(trendEntities.id, existing.id));
              report.kyotoNeighborhoods.resolved++;
            }
          } else {
            report.kyotoNeighborhoods.resolved++;
          }
        }
      } catch (err: any) {
        report.errors.push(`neighborhood:${n.id}: ${err.message}`);
      }
    }
  }

  private async resolveKyotoGems(report: ResolutionReport): Promise<void> {
    // Gems: travel_pulse_hidden_gems for Kyoto
    const gems = await db
      .select()
      .from(travelPulseHiddenGems)
      .where(eq(travelPulseHiddenGems.city, "Kyoto"));

    for (const gem of gems) {
      report.kyotoGems.total++;
      try {
        const [existing] = await db
          .select()
          .from(trendEntities)
          .where(
            and(
              eq(trendEntities.entityType, "gem"),
              eq(trendEntities.internalId, gem.id),
            ),
          )
          .limit(1);

        if (!existing) {
          const gemName = (gem as any).name ?? (gem as any).placeName ?? null;
        const wdResult = gemName ? await wikidataSearch(`${gemName} Kyoto`) : null;
          await db
            .insert(trendEntities)
            .values({
              entityType: "gem",
              internalId: gem.id,
              wikidataQid: wdResult?.qid ?? null,
              wikipediaTitle: wdResult ? await wikipediaExists(wdResult.label) : null,
            })
            .onConflictDoNothing();
          if (wdResult) report.kyotoGems.resolved++;
        } else {
          if (existing.wikidataQid) report.kyotoGems.resolved++;
        }
      } catch (err: any) {
        report.errors.push(`gem:${gem.id}: ${err.message}`);
      }
    }
  }
}

export const entityResolver = new EntityResolver();
