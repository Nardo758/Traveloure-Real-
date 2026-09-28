/**
 * The Help center's slugs, the ONE link builder, and the PUBLISH GATE (Lane B; decision-maker
 * rulings of Sep 27, 2026). Small on purpose: every in-app link site imports THIS file, so the
 * article bodies (shared/help-articles.ts) load only with the /help pages.
 *
 * NO ARTICLE DESCRIBES A FEATURE BEFORE IT IS ON `main` (decision-maker, Sep 27, 2026). An article
 * about an unshipped feature is HELD: it stays in the module, but it is not listed, not searchable,
 * not in the sitemap, its page answers "not found", and any `helpArticlePath` reference to it fails
 * `client/src/lib/__tests__/help-article-links.test.ts`. An article is released by adding the
 * Track A step that ships its feature to `SHIPPED_TRACK_A_STEPS` in the SAME PR that lands the
 * feature — never before, and never by deleting the hold.
 */

export const HELP_ARTICLE_SLUGS = [
  "how-planning-works",
  "what-a-local-does",
  "comparing-options",
  "free-vs-paid",
  "trip-pass-and-fees",
  "booking-through-us",
  "cancellations-and-refunds",
  "payment-didnt-go-through",
  "disputes-and-under-review",
  "become-a-local-expert",
] as const;
export type HelpArticleSlug = (typeof HELP_ARTICLE_SLUGS)[number];

/** The Track A steps an article can wait on. */
export type TrackAStep =
  /** Comparing up to three candidates on a plan slot (article 3). */
  | "compare-options"
  /** The optimizer's three complete versions — best value, least travel, best fit (article 4). */
  | "three-versions-delta";

/** Held articles, each naming the Track A step that ships the feature it describes. */
export const HELP_ARTICLE_PUBLISHED_FROM: Readonly<Partial<Record<HelpArticleSlug, TrackAStep>>> = {
  "comparing-options": "compare-options",
  "free-vs-paid": "three-versions-delta",
};

/**
 * The Track A steps that are on `main`. EMPTY today: neither feature has shipped. Add a step here
 * in the PR that lands it, and its article publishes with it.
 */
export const SHIPPED_TRACK_A_STEPS: ReadonlySet<TrackAStep> = new Set<TrackAStep>([]);

export function isHelpArticleSlug(value: string): value is HelpArticleSlug {
  return (HELP_ARTICLE_SLUGS as readonly string[]).includes(value);
}

export function isHelpArticlePublished(
  slug: HelpArticleSlug,
  shipped: ReadonlySet<TrackAStep> = SHIPPED_TRACK_A_STEPS,
): boolean {
  const step = HELP_ARTICLE_PUBLISHED_FROM[slug];
  return step === undefined || shipped.has(step);
}

export const PUBLISHED_HELP_ARTICLE_SLUGS: readonly HelpArticleSlug[] = HELP_ARTICLE_SLUGS.filter((s) =>
  isHelpArticlePublished(s),
);

/** The ONE way the app links to an article. A held article must not be linked (the link test fails). */
export function helpArticlePath(slug: HelpArticleSlug): string {
  return `/help/${slug}`;
}
