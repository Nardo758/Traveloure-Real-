/**
 * THE Trend number a surface may show for a market — ONE derivation (§18 rule 1), shared by the
 * city rail (`getTrendingCities`), the landing hero and the destination page's eyebrow
 * (TravelPulse PR 1, ledger `2026-09-29-travelpulse-hygiene`; trend-engine audit §3/§5).
 *
 *   · Ranked only when the resolver produced a score AND its confidence clears the floor.
 *   · FRESH only when the row was computed within the max age (48 h by default): a stopped
 *     ingestion must not leave last month's score on the page forever (audit §5).
 *   · Mapped `clamp(round(score × 50), 0, 100)` — 1.0 (at baseline) → 50, 2.0 → 100.
 *   · Anything else is `null`: NO number, never 0 (§13). A 0 is a claim; an absent score is not one.
 */

export interface ResolverScore {
  score: number | null;
  confidence: number | null;
  computedAt: Date | string | null;
}

export function isFreshScore(computedAt: Date | string | null | undefined, maxAgeHours: number, now: Date = new Date()): boolean {
  if (computedAt == null || computedAt === "") return false;
  const t = computedAt instanceof Date ? computedAt.getTime() : Date.parse(computedAt);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= maxAgeHours * 3_600_000;
}

/** The displayed Trend number, or null when nothing may be shown. */
export function displayTrendScore(
  r: ResolverScore | null | undefined,
  opts: { confidenceFloor: number; maxAgeHours: number; now?: Date },
): number | null {
  if (!r || r.score == null || !Number.isFinite(r.score)) return null;
  if (r.confidence == null || !(r.confidence >= opts.confidenceFloor)) return null;
  if (!isFreshScore(r.computedAt, opts.maxAgeHours, opts.now)) return null;
  const mapped = Math.min(100, Math.max(0, Math.round(r.score * 50)));
  return mapped > 0 ? mapped : null;
}

/**
 * `/api/health`'s trend-score age block. `newestComputedAt: null` = no score row exists (or the
 * read failed): age and freshness are then null, never 0 and never "fresh" (§13).
 */
export function trendScoreAgeReport(
  newest: Date | string | null | undefined,
  maxAgeHours: number,
  now: Date = new Date(),
): { newestComputedAt: string | null; ageHours: number | null; maxAgeHours: number; fresh: boolean | null } {
  const t = newest == null || newest === "" ? NaN : newest instanceof Date ? newest.getTime() : Date.parse(newest);
  if (!Number.isFinite(t)) return { newestComputedAt: null, ageHours: null, maxAgeHours, fresh: null };
  const ageHours = Math.round(((now.getTime() - t) / 3_600_000) * 10) / 10;
  return { newestComputedAt: new Date(t).toISOString(), ageHours, maxAgeHours, fresh: isFreshScore(new Date(t), maxAgeHours, now) };
}

/**
 * THE crowd band a public surface may show for a market (TravelPulse PR 2, ledger
 * `2026-09-30-travelpulse-crowd-band`) — ONE derivation beside the Trend number's (§18 rule 1).
 * Shown only when the resolver wrote one of the four band words, its crowd confidence clears the
 * floor, and the row is as fresh as a Trend number must be. Anything else is `null`: no label,
 * never a guessed "moderate" (§13). The band is the only thing shown; no crowd value ever is.
 */
export const DISPLAY_CROWD_BANDS = ["low", "moderate", "high", "peak"] as const;
export type DisplayCrowdBand = (typeof DISPLAY_CROWD_BANDS)[number];

export function displayCrowdBand(
  r: { band: string | null; confidence: number | null; computedAt: Date | string | null } | null | undefined,
  opts: { confidenceFloor: number; maxAgeHours: number; now?: Date },
): DisplayCrowdBand | null {
  if (!r || r.band == null || !(DISPLAY_CROWD_BANDS as readonly string[]).includes(r.band)) return null;
  if (r.confidence == null || !(r.confidence >= opts.confidenceFloor)) return null;
  if (!isFreshScore(r.computedAt, opts.maxAgeHours, opts.now)) return null;
  return r.band as DisplayCrowdBand;
}
