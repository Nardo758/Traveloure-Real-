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
  // Blog generator lane (decision-maker dispatch, Sep 30, 2026; ledger `2026-09-30-blog-event-guide`):
  // three event types drafted by the platform from platform data, never auto-published.
  "event_weekend_guide",
  "series_follow",
  "race_weekend",
] as const;
export type BlogContentType = (typeof BLOG_CONTENT_TYPES)[number];

/** Who wrote it. `platform` is TravelPulse weekly only (ruling 5); everything else carries an expert byline. */
export const BLOG_AUTHORSHIPS = ["expert", "platform"] as const;
export type BlogAuthorship = (typeof BLOG_AUTHORSHIPS)[number];

/**
 * The platform-authored types. Ruling 5 named TravelPulse weekly alone; the blog generator lane
 * (decision-maker dispatch, Sep 30, 2026 — ledger `2026-09-30-blog-event-guide`) adds the three event
 * types, which are drafted from platform data (city_events, publishable place_facts, the travel-time
 * matrix's ORDER), carry the platform label and no byline, and publish only through the admin rail.
 */
export const PLATFORM_AUTHORED_TYPES: readonly BlogContentType[] = [
  "travelpulse_weekly",
  "event_weekend_guide",
  "series_follow",
  "race_weekend",
];

export function authorshipFor(contentType: BlogContentType): BlogAuthorship {
  return PLATFORM_AUTHORED_TYPES.includes(contentType) ? "platform" : "expert";
}

/** The label a platform-authored post carries instead of a byline (ruling 5). */
export const PLATFORM_POST_LABEL = "AI-drafted from public and licensed data sources";

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
