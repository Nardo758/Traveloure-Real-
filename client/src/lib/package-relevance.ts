/**
 * Package relevance ranking (Discover feed).
 *
 * Packages (expert itinerary templates) already appear in the Discover feed, but
 * they used to be spliced in at fixed positions in the server's GLOBAL order
 * (`featured → salesCount → rating → recency`) — the same top-2 for every trip,
 * regardless of what the traveler is browsing. This ranks a city's packages by
 * relevance to the CURRENT context so the surfaced ones fit the browse.
 *
 * The score mirrors the *kinds* of signals the upsell engine uses, on
 * package-native fields:
 *
 *   relevance = 0.40·destinationMatch + 0.25·tripTypeFit + 0.15·dateFit + 0.20·quality
 *
 * Honesty about effective signal on the Discover surface (§13 — no fake precision):
 *  - `destinationMatch` is ~constant there because the feed already fetches packages
 *    filtered by destination server-side (`?destination=city`). It's kept as a scored
 *    component (not a hard gate) so the SAME function discriminates by destination when
 *    reused on a non-destination-filtered set.
 *  - `dateFit` is neutral today: expert_templates carry `duration` but NO season/date
 *    metadata, so a specific date can't honestly be scored against them. Kept as a named
 *    component so the formula gains the signal for free if temporal metadata is added.
 *  - So on the Discover feed the effective discriminators are `tripTypeFit` (the active
 *    category filter) + `quality`. When no category filter is active and packages are
 *    all city-matched, this degrades gracefully to the quality order (≈ today's default).
 *
 * Pure + deterministic (no Date.now / Math.random) → unit-testable and safe in render.
 */

export interface PackageRelevanceContext {
  /** The city being browsed. */
  city?: string | null;
  /** The active Discover category filter, or "all"/null when unfiltered. */
  category?: string | null;
  /** The traveler's selected date (YYYY-MM-DD), if any. Reserved for dateFit. */
  scheduledDate?: string | null;
}

export interface RankablePackage {
  id: string;
  destination?: string | null;
  category?: string | null;
  tags?: unknown; // string[] | null on the wire
  duration?: number | null;
  salesCount?: number | null;
  averageRating?: string | number | null;
  reviewCount?: number | null;
  isFeatured?: boolean | null;
  createdAt?: string | null;
}

export const PACKAGE_RELEVANCE_WEIGHTS = {
  destination: 0.4,
  tripType: 0.25,
  date: 0.15,
  quality: 0.2,
} as const;

function norm(s?: string | null): string {
  return (s ?? "").toLowerCase().trim();
}

/** 1 when the package destination matches the browsed city (substring either way), else 0. */
export function destinationMatch(pkg: RankablePackage, ctx: PackageRelevanceContext): number {
  const c = norm(ctx.city);
  const d = norm(pkg.destination);
  if (!c || !d) return 0;
  return d.includes(c) || c.includes(d) ? 1 : 0;
}

/**
 * Package category/tags vs the active feed category filter. Neutral (0.5) when no
 * category filter is active — absence of a filter is not evidence against any package.
 */
export function tripTypeFit(pkg: RankablePackage, ctx: PackageRelevanceContext): number {
  const f = norm(ctx.category);
  if (!f || f === "all") return 0.5;
  const tags = Array.isArray(pkg.tags) ? (pkg.tags as unknown[]).map((t) => norm(String(t))) : [];
  const hay = [norm(pkg.category), ...tags].join(" ");
  if (!hay.trim()) return 0;
  return hay.includes(f) || f.includes(norm(pkg.category)) ? 1 : 0;
}

/**
 * Date fit — neutral today (packages have no season/date metadata; see file header).
 * Named + kept so the weighting is honest about what exists and gains signal later.
 */
export function dateFit(_pkg: RankablePackage, _ctx: PackageRelevanceContext): number {
  return 0.5;
}

/**
 * Own-signal quality in [0,1]: log-damped sales share + review-backed rating + featured.
 * Rating contributes 0 when the package has no reviews (§13 — never a fabricated score).
 */
export function qualityScore(pkg: RankablePackage, maxSales: number): number {
  const sales = Number(pkg.salesCount ?? 0);
  const salesN = maxSales > 0 ? Math.log1p(Math.max(0, sales)) / Math.log1p(maxSales) : 0;
  const rc = Number(pkg.reviewCount ?? 0);
  const rating = rc > 0 && pkg.averageRating != null ? Number(pkg.averageRating) / 5 : 0;
  const featured = pkg.isFeatured ? 1 : 0;
  return 0.5 * salesN + 0.3 * clamp01(rating) + 0.2 * featured;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** The blended relevance score for one package in [0,1]. */
export function packageRelevanceScore(
  pkg: RankablePackage,
  ctx: PackageRelevanceContext,
  maxSales: number,
): number {
  const w = PACKAGE_RELEVANCE_WEIGHTS;
  return (
    w.destination * destinationMatch(pkg, ctx) +
    w.tripType * tripTypeFit(pkg, ctx) +
    w.date * dateFit(pkg, ctx) +
    w.quality * qualityScore(pkg, maxSales)
  );
}

/**
 * Rank packages by context relevance (descending). Stable + deterministic; ties fall back
 * to featured → salesCount → original order (the server's global quality order), so an
 * unfiltered browse with equal-relevance packages preserves the existing default.
 * Returns a new array; never mutates the input.
 */
export function rankPackagesByRelevance<T extends RankablePackage>(
  packages: T[],
  ctx: PackageRelevanceContext,
): T[] {
  if (!Array.isArray(packages) || packages.length <= 1) return (packages ?? []).slice();
  const maxSales = Math.max(0, ...packages.map((p) => Number(p.salesCount ?? 0)));
  return packages
    .map((p, i) => ({ p, i, score: packageRelevanceScore(p, ctx, maxSales) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(!!b.p.isFeatured) - Number(!!a.p.isFeatured) ||
        Number(b.p.salesCount ?? 0) - Number(a.p.salesCount ?? 0) ||
        a.i - b.i,
    )
    .map((s) => s.p);
}
