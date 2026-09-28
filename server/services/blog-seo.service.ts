/**
 * What the blog tells crawlers (Lane C brief: "Empty and unreviewed states noindex; sitemap lists
 * published only"; ledger `2026-09-27-blog-reactions-ask`).
 *
 * Every decision here reads ONE predicate — `status = 'published'` — so the sitemap, the index's
 * robots header and a post's robots header can never disagree about what is public. The decisions
 * are PURE (`robotsForIndex`, `robotsForPost`) and the loaders only count; a count that fails to
 * load is treated as "nothing published", which answers `noindex` (§13 — the failure mode delays
 * indexing, it never indexes an empty or unreviewed page).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { BLOG_SLUG_RE } from "@shared/blog";

export const BLOG_NOINDEX = "noindex, follow";

/** null = no robots header (indexable). */
export function robotsForIndex(publishedCount: number | null): string | null {
  return publishedCount && publishedCount > 0 ? null : BLOG_NOINDEX;
}
export function robotsForPost(isPublished: boolean | null): string | null {
  return isPublished === true ? null : BLOG_NOINDEX;
}

export async function blogIndexRobots(): Promise<string | null> {
  try {
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM blog_posts WHERE status = 'published'`);
    return robotsForIndex(Number((r.rows[0] as any)?.n ?? 0));
  } catch {
    return robotsForIndex(null);
  }
}

export async function blogPostRobots(slug: string): Promise<string | null> {
  if (typeof slug !== "string" || !BLOG_SLUG_RE.test(slug)) return robotsForPost(false);
  try {
    const r = await db.execute(sql`SELECT 1 FROM blog_posts WHERE slug = ${slug} AND status = 'published' LIMIT 1`);
    return robotsForPost(r.rows.length > 0);
  } catch {
    return robotsForPost(null);
  }
}

/** `/blog` plus one entry per PUBLISHED post, or nothing at all while none is published. */
export async function publishedBlogSitemapEntries(): Promise<{ path: string; lastmod?: string }[]> {
  const r = await db.execute(sql`
    SELECT slug, published_at, updated_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC NULLS LAST
  `);
  const rows = r.rows as any[];
  if (rows.length === 0) return [];
  const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : undefined);
  return [
    { path: "/blog" },
    ...rows.map((row) => ({ path: `/blog/${row.slug}`, lastmod: day(row.updated_at ?? row.published_at) })),
  ];
}
