/**
 * Blog pipeline configuration (Lane C ruling 4). Numbers live here, never at a call site.
 * `BLOG_QUOTE_MAX_CHARS` caps any quoted excerpt of a third-party source; env-overridable.
 */
function positiveInt(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const BLOG_QUOTE_MAX_CHARS = positiveInt(process.env.BLOG_QUOTE_MAX_CHARS, 300);
