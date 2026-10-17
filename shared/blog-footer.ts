/**
 * ED-1 footer count (decision-maker, Oct 16, 2026 — ledger `2026-10-16-blog-footer-count`): the footer
 * shows its Blog link only once at least this many posts are published. The minimum is an admin-editable
 * `platform_settings` row; an absent or invalid row reads the ruled default of 5. The count is read from
 * the post store, never a hand-flipped flag.
 */
export const BLOG_FOOTER_MIN_PUBLISHED_SETTING = "blog_footer_min_published" as const;
export const BLOG_FOOTER_MIN_PUBLISHED_DEFAULT = 5;

/** A whole number from 1 to 9999, as the admin settings screen stores it. */
export function isValidBlogFooterMinPublishedSetting(v: unknown): boolean {
  return typeof v === "string" && /^[1-9][0-9]{0,3}$/.test(v.trim());
}

/** The stored minimum, or the default when the row is absent or not a valid number. */
export function parseBlogFooterMinPublished(raw: string | null | undefined): number {
  return isValidBlogFooterMinPublishedSetting(raw) ? Number(String(raw).trim()) : BLOG_FOOTER_MIN_PUBLISHED_DEFAULT;
}

/** Shown only when a real count meets the minimum; anything that is not a count is hidden (fail-closed). */
export function blogFooterShown(publishedCount: unknown, minimum: number): boolean {
  return typeof publishedCount === "number" && Number.isFinite(publishedCount) && publishedCount >= minimum;
}
