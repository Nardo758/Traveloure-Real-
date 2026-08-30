/**
 * trend-score.service.ts — Phase 4 resolver, v0 (market entity grain only).
 *
 * Implements §4.1 of the Trend Engine Lane Brief:
 *   1. 90-day trailing baseline per entity per metric.
 *   2. deviation = most_recent_value / baseline.
 *   3. source-weighted, decay-adjusted composite across all (source, metric) pairs.
 *   4. ÷ seasonal-expected from market_season_calendars.
 *   5. trend_score + trend_confidence → written to trend_scores (upsert).
 *
 * Rules enforced:
 *   L2: 90-day baseline window (config constant, not buried in logic).
 *   L6: Only place trend math lives. No weights/half-lives as literals elsewhere.
 *   L8: surface_origin exclusion — signals with surface_origin NOT NULL are excluded from scoring.
 *   R2: No LLM anywhere in this path.
 *   Phase 4 gate: identical inputs → identical outputs (deterministic).
 *
 * Phase 4 will extend this resolver to neighborhood / experience entity types.
 * Nothing in this file gets thrown away — callers pass entity_type filter.
 */

import { db } from "../../db";
import {
  trendEntities,
  trendSignals,
  trendSourceConfig,
  trendScores,
  marketSeasonCalendars,
} from "@shared/schema";
import { eq, and, gte, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { OPERATING_MARKETS } from "./operating-markets";

// ─── Config constants (L6 — these are the only place these values live) ────────

/** Markets below this confidence score render as unranked — no badge, no position.
 *  Config: only Leon adjusts this value. */
export const CONFIDENCE_FLOOR = 0.30;

/** Trailing window for baseline computation (L2). */
const BASELINE_WINDOW_DAYS = 90;

/** Maximum number of enabled sources — used to normalise confidence. */
const MAX_SOURCES = 8;

// ─── Seasonal helpers ──────────────────────────────────────────────────────────

/** Returns today's date in "MM-DD" format (UTC). */
function todayMonthDay(): string {
  const now = new Date();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${m}-${d}`;
}

/** Returns true when `md` (MM-DD) falls within [start, end], handling year-wrap. */
function isInSeason(md: string, start: string, end: string): boolean {
  if (start <= end) {
    return md >= start && md <= end;
  }
  // Year-wrapping season (e.g. start=11-01, end=01-31)
  return md >= start || md <= end;
}

/** Returns the maximum expected_demand_multiplier for the market's active seasons
 *  on today's date. Falls back to 1.0 (neutral) if no season covers today. */
function getSeasonalMultiplier(
  marketKey: string,
  allSeasons: Array<{ marketKey: string; startMonthDay: string; endMonthDay: string; expectedDemandMultiplier: string }>,
  todayMD: string,
): number {
  const activeMultipliers = allSeasons
    .filter(
      s =>
        s.marketKey === marketKey &&
        isInSeason(todayMD, s.startMonthDay, s.endMonthDay),
    )
    .map(s => parseFloat(s.expectedDemandMultiplier));

  if (activeMultipliers.length === 0) return 1.0;
  // Peak-season wins (maximum multiplier) when multiple seasons overlap.
  return Math.max(...activeMultipliers);
}

// ─── Core scoring ──────────────────────────────────────────────────────────────

export interface TrendScoreResult {
  trendScore: number | null;        // null = below confidence floor
  trendConfidence: number;
  isRanked: boolean;
  seasonalExpected: number;
  contributingSources: string[];
  whyText: string;
}

interface SourceConfig {
  source: string;
  weight: number;
  decayHalfLifeDays: number;
}

interface SignalRow {
  source: string;
  metric: string;
  value: number;
  observedAt: Date;
}

/** Compute trend score for one entity given its 90-day signal history. */
function computeScore(
  signals: SignalRow[],
  sourceConfigs: SourceConfig[],
  seasonalExpected: number,
): TrendScoreResult {
  const sourceConfigMap = new Map(sourceConfigs.map(s => [s.source, s]));
  const now = Date.now();

  // Group signals by (source, metric)
  const groups = new Map<string, SignalRow[]>();
  for (const sig of signals) {
    if (sig.observedAt.getTime() < now - BASELINE_WINDOW_DAYS * 86_400_000) continue;
    const key = `${sig.source}|${sig.metric}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sig);
  }

  let weightedSum = 0;
  let weightSum = 0;
  const usedSources = new Set<string>();
  const contributions: Array<{ source: string; metric: string; deviation: number; weight: number }> = [];

  for (const [key, rows] of Array.from(groups.entries())) {
    const [source, metric] = key.split("|");
    const cfg = sourceConfigMap.get(source);
    if (!cfg || cfg.weight <= 0) continue;

    // Baseline = mean of all values in the 90-day window
    const values: number[] = (rows as SignalRow[]).map((r: SignalRow) => r.value);
    const baseline = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    if (baseline <= 0) continue;

    // Most recent value for this (source, metric)
    const mostRecent = (rows as SignalRow[]).reduce((a: SignalRow, b: SignalRow) =>
      a.observedAt.getTime() > b.observedAt.getTime() ? a : b,
    );
    const deviation = mostRecent.value / baseline;

    // Age-based decay: weight * 2^(-age_days / half_life)
    const ageDays =
      (now - mostRecent.observedAt.getTime()) / 86_400_000;
    const halfLife = cfg.decayHalfLifeDays > 0 ? cfg.decayHalfLifeDays : 30;
    const decayFactor = Math.pow(2, -ageDays / halfLife);
    const effectiveWeight = cfg.weight * decayFactor;

    weightedSum += effectiveWeight * deviation;
    weightSum += effectiveWeight;
    usedSources.add(source);
    contributions.push({ source, metric, deviation, weight: effectiveWeight });
  }

  // Composite: weighted average deviation across all (source, metric) pairs
  const composite = weightSum > 0 ? weightedSum / weightSum : 0;

  // trend_score = composite / seasonal_expected (seasonal adjusts for expected highs)
  const rawScore = seasonalExpected > 0 ? composite / seasonalExpected : composite;

  // Confidence: blend of source breadth, signal density, baseline depth
  const nSources = usedSources.size;
  const totalDays = signals.length > 0
    ? (now - Math.min(...signals.map(s => s.observedAt.getTime()))) / 86_400_000
    : 0;
  const sourceBreadth = Math.min(1, nSources / MAX_SOURCES);
  const densityFactor = Math.min(1, signals.length / (nSources > 0 ? nSources * 30 : 30));
  const depthFactor = Math.min(1, totalDays / BASELINE_WINDOW_DAYS);
  const trendConfidence = sourceBreadth * 0.5 + densityFactor * 0.3 + depthFactor * 0.2;

  const isRanked = trendConfidence >= CONFIDENCE_FLOOR;

  // why_text: top 3 contributors by effective weight
  const topContribs = contributions
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(c => `${c.source} ${c.metric} ${c.deviation.toFixed(2)}× baseline`);
  const whyText = topContribs.join("; ") || "no data";

  return {
    trendScore: isRanked ? Math.round(rawScore * 1000) / 1000 : null,
    trendConfidence: Math.round(trendConfidence * 10000) / 10000,
    isRanked,
    seasonalExpected,
    contributingSources: Array.from(usedSources),
    whyText,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TrendScoreService {
  /**
   * Score all 8 operating market entities and upsert trend_scores.
   * Called nightly from the scheduler after ingestion completes.
   */
  async runMarkets(): Promise<{
    scored: number;
    unranked: number;
    errors: string[];
    scoringRunId: string;
  }> {
    const scoringRunId = `market_${new Date().toISOString().replace(/[:.]/g, "_")}`;
    const errors: string[] = [];
    let scored = 0;
    let unranked = 0;

    // Fetch all enabled source configs
    const sourceRows = await db
      .select({
        source: trendSourceConfig.source,
        weight: trendSourceConfig.weight,
        decayHalfLifeDays: trendSourceConfig.decayHalfLifeDays,
      })
      .from(trendSourceConfig)
      .where(eq(trendSourceConfig.enabled, true));

    const sourceConfigs: SourceConfig[] = sourceRows
      .map(r => ({
        source: r.source,
        weight: r.weight != null ? parseFloat(r.weight) : 0,
        decayHalfLifeDays: r.decayHalfLifeDays != null ? parseFloat(r.decayHalfLifeDays) : 30,
      }))
      .filter(r => r.weight > 0);

    // Fetch all market season calendars
    const allSeasons = await db
      .select({
        marketKey: marketSeasonCalendars.marketKey,
        startMonthDay: marketSeasonCalendars.startMonthDay,
        endMonthDay: marketSeasonCalendars.endMonthDay,
        expectedDemandMultiplier: marketSeasonCalendars.expectedDemandMultiplier,
      })
      .from(marketSeasonCalendars);

    // Fetch market entities
    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    const todayMD = todayMonthDay();
    const baselineStart = new Date(Date.now() - BASELINE_WINDOW_DAYS * 86_400_000);

    for (const entity of marketEntities) {
      // Skip entities not in OPERATING_MARKETS
      const market = OPERATING_MARKETS.find(m => m.marketKey === entity.internalId);
      if (!market) continue;

      try {
        // Fetch 90-day signals for this entity.
        // L8: exclude signals where surface_origin is set (feedback-loop exclusion).
        const rawSignals = await db
          .select({
            source: trendSignals.source,
            metric: trendSignals.metric,
            value: trendSignals.value,
            observedAt: trendSignals.observedAt,
          })
          .from(trendSignals)
          .where(
            and(
              eq(trendSignals.trendEntityId, entity.id),
              gte(trendSignals.observedAt, baselineStart),
              isNull(trendSignals.surfaceOrigin), // L8
            ),
          );

        const signals: SignalRow[] = rawSignals.map(r => ({
          source: r.source,
          metric: r.metric,
          value: parseFloat(r.value),
          observedAt: r.observedAt,
        }));

        const seasonalExpected = getSeasonalMultiplier(entity.internalId, allSeasons, todayMD);
        const result = computeScore(signals, sourceConfigs, seasonalExpected);

        // Upsert trend_scores (one row per entity, rewritten each run)
        await db
          .insert(trendScores)
          .values({
            trendEntityId: entity.id,
            trendScore: result.trendScore != null ? String(result.trendScore) : null,
            trendConfidence: String(result.trendConfidence),
            crowdBand: null,  // Phase 4 crowd bands — not v0 scope
            crowdConfidence: null,
            contributingSources: result.contributingSources,
            whyText: result.whyText,
            crowdWhy: null,
            seasonalExpected: String(result.seasonalExpected),
            scoringRunId,
          })
          .onConflictDoUpdate({
            target: trendScores.trendEntityId,
            set: {
              trendScore: result.trendScore != null ? String(result.trendScore) : null,
              trendConfidence: String(result.trendConfidence),
              crowdBand: null,
              crowdConfidence: null,
              contributingSources: result.contributingSources,
              whyText: result.whyText,
              crowdWhy: null,
              seasonalExpected: String(result.seasonalExpected),
              computedAt: sql`NOW()`,
              scoringRunId,
            },
          });

        if (result.isRanked) scored++;
        else unranked++;

        console.log(
          `[TrendScore] ${entity.internalId}: score=${result.trendScore ?? "unranked"} conf=${result.trendConfidence.toFixed(3)} seasonal=${result.seasonalExpected} sources=${result.contributingSources.length}`,
        );
      } catch (err: any) {
        errors.push(`${entity.internalId}: ${err.message}`);
        console.error(`[TrendScore] ${entity.internalId} error:`, err.message);
      }
    }

    console.log(
      `[TrendScore] Run ${scoringRunId} complete: scored=${scored} unranked=${unranked} errors=${errors.length}`,
    );
    return { scored, unranked, errors, scoringRunId };
  }
}

export const trendScoreService = new TrendScoreService();
