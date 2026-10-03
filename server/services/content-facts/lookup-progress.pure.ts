/**
 * Pure reader of a draft's `facts_lookup` (smoke 5 item 8; writer: `lookup-progress.ts`).
 */

/** A run older than this that never said "done" is treated as over. */
export const LOOKUP_PROGRESS_STALE_MS = 3 * 60 * 1000;

/**
 * Pure. The item ids still being checked, from a draft row's `facts_lookup`, or an empty list when
 * nothing is (no run, a finished run, a stale run, or an unreadable value — never a guess).
 */
export function pendingLookupItemIds(factsLookup: unknown, now: Date = new Date()): string[] {
  const v = factsLookup as { status?: unknown; startedAt?: unknown; pending?: unknown } | null;
  if (!v || v.status !== "running" || !Array.isArray(v.pending)) return [];
  const started = typeof v.startedAt === "string" ? Date.parse(v.startedAt) : NaN;
  if (!Number.isFinite(started) || now.getTime() - started > LOOKUP_PROGRESS_STALE_MS) return [];
  return v.pending.filter((x): x is string => typeof x === "string");
}
