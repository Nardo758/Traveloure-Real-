// LW-1d (ledger `2026-10-16-lw1d-source-and-referral`; hand-off Part B "Source tags on supply sign-up too"): the ONE
// reading of a supply sign-up's `?source=` tag, stored once on the new account as `users.signup_source` (migration
// 381). Allowed values: `<market>_waitlist_page`, `<market>_blog_cta:<post-slug>` (the market is the launch market's
// slug with `-` as `_` — `kyoto_…` for Kyoto, read from the setting, never a literal), `ig_dm`, `contact_form`,
// `email`. Anything else that was offered is stored as `other`, never as free text. No tag at all is NULL — "not
// recorded" — never `other`.

export const SIGNUP_SOURCE_FIXED = ["ig_dm", "contact_form", "email"] as const;
export const SIGNUP_SOURCE_OTHER = "other";

function marketPrefix(marketSlug: string | null | undefined): string | null {
  const slug = typeof marketSlug === "string" ? marketSlug.trim().toLowerCase() : "";
  return /^[a-z0-9-]{1,64}$/.test(slug) ? slug.replace(/-/g, "_") : null;
}

/** The value to store for a supply sign-up's tag, or null when no tag was offered. */
export function normalizeSignupSource(value: unknown, marketSlug: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if ((SIGNUP_SOURCE_FIXED as readonly string[]).includes(v)) return v;
  const prefix = marketPrefix(marketSlug);
  if (prefix) {
    if (v === `${prefix}_waitlist_page`) return v;
    const blog = `${prefix}_blog_cta:`;
    if (v.startsWith(blog) && /^[a-z0-9][a-z0-9-]{0,150}$/.test(v.slice(blog.length))) return v;
  }
  return SIGNUP_SOURCE_OTHER;
}
