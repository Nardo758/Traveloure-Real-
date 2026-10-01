/**
 * The blog's reader-side rules (Lane C.3b; ledger `2026-09-27-blog-pages`, Locked Decision 57).
 * PURE, so the rules are proven without React. Every sentence and decision the two pages share has
 * ONE home here (§18 rule 1).
 *
 * The server owns every judgment about what is public: the pages render its allowlist projection
 * and decide nothing about publication, ranking or eligibility. They carry NO count of reactions or
 * readers anywhere (ruling 6), and they print no user id — the byline is a HANDLE (LD 40).
 */
import { BLOG_REACTION_KINDS, type BlogReactionKind } from "@shared/blog";

export interface PublicBlogByline {
  handle: string;
  displayName: string;
}
export interface PublicBlogSource {
  url: string;
  title: string | null;
  publisher: string | null;
  quote: string | null;
}
export interface PublicBlogPost {
  slug: string;
  contentType: string;
  marketSlug: string | null;
  occasionSlug: string | null;
  title: string;
  summary: string | null;
  body: string;
  publishedAt: string | null;
  byline: PublicBlogByline | null;
  platformLabel: string | null;
  sources: PublicBlogSource[];
  /**
   * An event post's "Start this plan" door, read by the server from the LIVE event row (ledger
   * `2026-09-30-blog-event-guide`). Null for every other post, and for a withdrawn or past event.
   */
  planDoor?: BlogPlanDoor | null;
  /**
   * A series follow's doors, one per LIVE upcoming instance of the series, soonest first (ledger
   * `2026-09-30-blog-series-follow`). Null for every other post, and when no instance is live.
   */
  seriesDoors?: BlogPlanDoor[] | null;
}

/** What a "Start this plan" door carries — exactly the events strip's "Plan around it" fields, no id. */
export interface BlogPlanDoor {
  title: string;
  city: string;
  marketKey: string | null;
  firstDate: string;
  lastDate: string;
  startTime: string;
  venue: string;
}

/**
 * The index is `noindex` unless it has LOADED at least one post. Loading, an error and an empty list
 * all say `noindex` — an empty or broken page is never offered to a crawler (the server's header
 * reads the same fact, `server/services/blog-seo.service.ts`).
 */
export function blogIndexNoindex(posts: readonly unknown[] | undefined | null): boolean {
  return !Array.isArray(posts) || posts.length === 0;
}

/** A post page is indexable only once the post itself has loaded. */
export function blogPostNoindex(post: PublicBlogPost | null | undefined): boolean {
  return !post;
}

export function blogPostPath(slug: string): string {
  return `/blog/${encodeURIComponent(slug)}`;
}

/** The byline links to the expert's storefront by HANDLE — never by id (LD 40). */
export function bylinePath(byline: PublicBlogByline | null | undefined): string | null {
  return byline?.handle ? `/s/${encodeURIComponent(byline.handle)}` : null;
}

/** "Ask the local" exists only where there IS a local: an expert-authored post with a byline. */
export function canAskTheLocal(post: Pick<PublicBlogPost, "byline"> | null | undefined): boolean {
  return !!post?.byline?.handle;
}

/** Outbound source links: attribution, not endorsement, and no referrer handed to a third party. */
export const BLOG_SOURCE_LINK_REL = "nofollow noopener noreferrer";

/** One label per reaction kind — keyed by the shared vocabulary, so a new kind cannot go unlabelled. */
export const BLOG_REACTION_LABELS: Record<BlogReactionKind, string> = {
  useful: "Useful",
  been_there: "Been there",
  want_this: "Want to go",
};
export const BLOG_REACTION_ORDER: readonly BlogReactionKind[] = BLOG_REACTION_KINDS;

/** Plain-text body → paragraphs. The body is never rendered as HTML. */
export function bodyParagraphs(body: string | null | undefined): string[] {
  return String(body ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** The date line, or null when the post carries no publication date (never "today" — §13). */
export function publishedLabel(iso: string | null | undefined, locale = "en-US"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

/** Who wrote it, as one line: the expert's name, or the platform's own label (ruling 5). */
export function authorLine(post: Pick<PublicBlogPost, "byline" | "platformLabel">): string | null {
  if (post.byline) return post.byline.displayName;
  return post.platformLabel ?? null;
}
