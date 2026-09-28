/**
 * Expert-signed blog — the ONE statement of its value sets (ledger `2026-09-27-blog-lifecycle`,
 * Locked Decision 57; rulings in docs/planning/briefs/lane-c.md). App-enforced: the tables carry no
 * DB CHECK, so these arrays are the only authority (§18 rule 1).
 */

/** Content types (brief: "Content types"). Third-party republishing is not a type. */
export const BLOG_CONTENT_TYPES = [
  "occasion_market_guide",
  "field_knowledge",
  "travelpulse_weekly",
  "gems_roundup",
  "link_roundup",
] as const;
export type BlogContentType = (typeof BLOG_CONTENT_TYPES)[number];

/** Who wrote it. `platform` is TravelPulse weekly only (ruling 5); everything else carries an expert byline. */
export const BLOG_AUTHORSHIPS = ["expert", "platform"] as const;
export type BlogAuthorship = (typeof BLOG_AUTHORSHIPS)[number];

export function authorshipFor(contentType: BlogContentType): BlogAuthorship {
  return contentType === "travelpulse_weekly" ? "platform" : "expert";
}

/** The label a platform-authored post carries instead of a byline (ruling 5). */
export const PLATFORM_POST_LABEL = "AI signal from public data";

/**
 * Lifecycle. draft → in_review (expert posts) → signed → published → withdrawn. Platform posts go
 * draft → published. Any edit to a signed or published post returns it to in_review (ruling 3).
 * `withdrawn` is kept, never deleted.
 */
export const BLOG_POST_STATUSES = ["draft", "in_review", "signed", "published", "withdrawn"] as const;
export type BlogPostStatus = (typeof BLOG_POST_STATUSES)[number];

/** Reader reactions (ruling 6). No comments exist. */
export const BLOG_REACTION_KINDS = ["useful", "been_there", "want_this"] as const;
export type BlogReactionKind = (typeof BLOG_REACTION_KINDS)[number];

export function isBlogContentType(v: unknown): v is BlogContentType {
  return typeof v === "string" && (BLOG_CONTENT_TYPES as readonly string[]).includes(v);
}
export function isBlogReactionKind(v: unknown): v is BlogReactionKind {
  return typeof v === "string" && (BLOG_REACTION_KINDS as readonly string[]).includes(v);
}

/** URL slug rule for posts: lower-case words joined by single hyphens. */
export const BLOG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The `content_impressions.content_type` a blog post is counted under (ruling 6). The impression's
 * `content_id` is the post's public SLUG — the id a reader's page already holds — never the row id,
 * which no public payload carries.
 */
export const BLOG_IMPRESSION_CONTENT_TYPE = "blog_post";
