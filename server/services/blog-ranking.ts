/**
 * Blog index ranking (Lane C ruling 6; ledger `2026-09-27-blog-reactions-ask`). PURE.
 *
 * Reactions and impressions feed the ORDER of the blog index and nothing else: no count is ever
 * shown to a reader, and a post's score is never published (no displayed counts — ruling 6).
 *
 * The score follows `featured-sort`'s null-until-N pattern: until a post has
 * `BLOG_RANK_MIN_IMPRESSIONS` impressions its quality is UNMEASURED (null), not 0 — three reactions
 * from four readers is not a signal, and treating it as one would let the first handful of readers
 * pin a post to the top. Measured quality is distinct reactions per impression, on a 0–100 scale,
 * with every reaction kind weighted the same (no ruling weights one kind over another, so none is
 * invented here). The comparator is `featured-sort`'s own; blog posts carry no featured flag, so
 * the boost never applies and the order is score, then recency.
 */
import { makeFeaturedSorter } from "./featured-sort";

export interface BlogRankInput {
  slug: string;
  publishedAt: Date | string | null;
  impressions: number;
  reactions: number;
}

/** null = unmeasured (fewer impressions than the floor). Never a guessed 0 (§13). */
export function blogQualityScore(
  p: Pick<BlogRankInput, "impressions" | "reactions">,
  minImpressions: number,
): number | null {
  if (!Number.isFinite(p.impressions) || p.impressions < minImpressions || p.impressions <= 0) return null;
  const ratio = Math.max(0, p.reactions) / p.impressions;
  return Math.min(100, Math.round(ratio * 100));
}

function time(v: Date | string | null): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Sorted copy: measured quality first (featured-sort comparator), newest first among equals. */
export function rankBlogPosts<T extends BlogRankInput>(posts: readonly T[], minImpressions: number): T[] {
  const byScore = makeFeaturedSorter<T & { isFeatured?: null }>((p) => blogQualityScore(p, minImpressions));
  return [...posts].sort((a, b) => byScore(a, b) || time(b.publishedAt) - time(a.publishedAt));
}
