/**
 * Shared limit/offset query-param parsing for list endpoints (task: bounded list responses).
 * Defaults: limit=50 (max 200), offset=0. Invalid/negative values fall back to defaults —
 * a client can never request an unbounded page.
 */
export const MAX_PAGE_LIMIT = 200;

export function parsePagination(
  query: Record<string, unknown>,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): { limit: number; offset: number } {
  const maxLimit = Math.min(opts.maxLimit ?? MAX_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const defaultLimit = Math.min(opts.defaultLimit ?? 50, maxLimit);
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}
