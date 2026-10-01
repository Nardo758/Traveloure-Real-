/**
 * crowd-band.ts — TravelPulse PR 2 (ledger `2026-09-30-travelpulse-crowd-band`): the ONE computation
 * of a market's crowd band, written to `trend_scores.crowd_band` by the resolver. Pure; no DB, no
 * clock except the `now` passed in; identical inputs → identical outputs (Phase 4 gate).
 *
 * WHAT COUNTS AS A CROWD SIGNAL, and why the list is short. A crowd band says how busy the place is,
 * so it reads ONLY metrics that measure people present: BestTime's foot-traffic forecast and live
 * reading, and PredictHQ's attendance forecast. Interest signals (X mentions, Wikipedia pageviews,
 * GDELT coverage) measure attention, not crowds, and feed the Trend number only. Our own
 * `platform_travelers_active` is a tiny, self-selected sample and is excluded (§13: it would call a
 * city quiet because few of OUR travelers are there).
 *
 * THE RULE, per market:
 *   1. For each crowd (source, metric) group in the 90-day window, with at least
 *      `minBaselinePoints` observations, a positive mean, and a newest observation no older than
 *      `maxSignalAgeDays`: deviation = newest ÷ 90-day mean.
 *   2. Combined deviation = the source-weighted mean of those deviations (weights from
 *      `trend_source_config`, the same config the Trend number reads; a source with no positive
 *      weight is skipped, never defaulted).
 *   3. Band = the highest `crowd_band_config` band whose `lower_bound_vs_baseline` ≤ the combined
 *      deviation, for this entity type. The four bands must all be configured, or no band.
 *   4. Confidence = 0.6 × source breadth (qualifying crowd sources ÷ crowd sources) + 0.4 × depth
 *      (mean observations per qualifying group ÷ 30, capped at 1).
 * No qualifying group ⇒ band NULL with a stated reason. NULL is "we do not know", never "low".
 *
 * NEVER RAW (the dispatch: "PredictHQ/BestTime are never displayed raw"): the result carries the
 * band word, a confidence and a `why` naming the SOURCES only — no value, no ratio, no venue.
 */

export const CROWD_BANDS = ["low", "moderate", "high", "peak"] as const;
export type CrowdBand = (typeof CROWD_BANDS)[number];

/** The crowd-class metrics, by source. The ONLY metrics this function reads. */
export const CROWD_METRICS: Readonly<Record<string, readonly string[]>> = {
  besttime: ["foot_traffic_forecast_mean", "foot_traffic_live"],
  predicthq: ["phq_attendance_forecast"],
};

const SOURCE_LABELS: Record<string, string> = {
  besttime: "venue foot-traffic forecasts",
  predicthq: "scheduled-event attendance forecasts",
};

export interface CrowdSignal {
  source: string;
  metric: string;
  value: number;
  observedAt: Date;
}

export interface CrowdCutoff {
  band: string;
  lowerBoundVsBaseline: number;
}

export interface CrowdBandOptions {
  now: Date;
  baselineWindowDays: number;
  maxSignalAgeDays: number;
  minBaselinePoints: number;
}

export type CrowdBandMissing = "no_crowd_signals" | "no_fresh_crowd_signals" | "cutoffs_incomplete";

export interface CrowdBandResult {
  band: CrowdBand | null;
  confidence: number | null;
  why: string | null;
  missing: CrowdBandMissing | null;
}

const DAY = 86_400_000;

function isCrowdMetric(source: string, metric: string): boolean {
  return (CROWD_METRICS[source] ?? []).includes(metric);
}

/** The band for a combined deviation, or null when the four cutoffs are not all configured. */
export function bandForDeviation(deviation: number, cutoffs: readonly CrowdCutoff[]): CrowdBand | null {
  const byBand = new Map<string, number>();
  for (const c of cutoffs) {
    if ((CROWD_BANDS as readonly string[]).includes(c.band) && Number.isFinite(c.lowerBoundVsBaseline)) {
      byBand.set(c.band, c.lowerBoundVsBaseline);
    }
  }
  if (byBand.size !== CROWD_BANDS.length) return null;
  let chosen: CrowdBand | null = null;
  let chosenBound = -Infinity;
  for (const band of CROWD_BANDS) {
    const bound = byBand.get(band)!;
    if (deviation >= bound && bound >= chosenBound) {
      chosen = band;
      chosenBound = bound;
    }
  }
  // A deviation below every configured lower bound is unplaced and says nothing.
  return chosen;
}

export function computeCrowdBand(
  signals: readonly CrowdSignal[],
  sourceWeights: ReadonlyMap<string, number>,
  cutoffs: readonly CrowdCutoff[],
  opts: CrowdBandOptions,
): CrowdBandResult {
  const nowMs = opts.now.getTime();
  const windowStart = nowMs - opts.baselineWindowDays * DAY;
  const groups = new Map<string, CrowdSignal[]>();
  for (const s of signals) {
    if (!isCrowdMetric(s.source, s.metric)) continue;
    if (!Number.isFinite(s.value)) continue;
    const t = s.observedAt.getTime();
    if (t < windowStart || t > nowMs) continue;
    const key = `${s.source}|${s.metric}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  if (groups.size === 0) return { band: null, confidence: null, why: null, missing: "no_crowd_signals" };

  let weighted = 0;
  let weightSum = 0;
  const sources = new Set<string>();
  const points: number[] = [];
  for (const [key, rows] of Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const source = key.split("|")[0];
    const weight = sourceWeights.get(source) ?? 0;
    if (!(weight > 0)) continue;
    if (rows.length < opts.minBaselinePoints) continue;
    const mean = rows.reduce((a, r) => a + r.value, 0) / rows.length;
    if (!(mean > 0)) continue;
    const newest = rows.reduce((a, b) => (a.observedAt.getTime() >= b.observedAt.getTime() ? a : b));
    if (nowMs - newest.observedAt.getTime() > opts.maxSignalAgeDays * DAY) continue;
    weighted += weight * (newest.value / mean);
    weightSum += weight;
    sources.add(source);
    points.push(rows.length);
  }
  if (weightSum === 0) return { band: null, confidence: null, why: null, missing: "no_fresh_crowd_signals" };

  const band = bandForDeviation(weighted / weightSum, cutoffs);
  if (!band) return { band: null, confidence: null, why: null, missing: "cutoffs_incomplete" };

  const breadth = Math.min(1, sources.size / Object.keys(CROWD_METRICS).length);
  const depth = Math.min(1, points.reduce((a, b) => a + b, 0) / points.length / 30);
  const confidence = Math.round((0.6 * breadth + 0.4 * depth) * 10000) / 10000;
  const why = `From ${Array.from(sources).sort().map((s) => SOURCE_LABELS[s] ?? s).join(" and ")}, against this market's usual level over the last three months.`;
  return { band, confidence, why, missing: null };
}
