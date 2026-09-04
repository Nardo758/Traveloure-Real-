/**
 * TRIP-ADVISOR STATUS PRECEDENCE — the rule a conflicting write obeys.
 *
 * Ledger `2026-09-04-advisor-row-one-author`; CLAUDE.md Locked Decision 32 (CORRECTION
 * paragraph) and §18 rule 1. Companion to `server/utils/trip-advisor.ts`, which owns the
 * READ side (which statuses grant access); this file owns the WRITE side (which status
 * survives when two writers name the same (trip, expert) pair).
 *
 * WHY A SEPARATE, DEPENDENCY-FREE FILE.
 * The rule is consumed twice — once in TypeScript (so it can be reasoned about and tested
 * without a database) and once as the `CASE` expression inside the upsert's
 * `ON CONFLICT DO UPDATE`. Writing the ladder out twice is exactly the derivation-drift
 * class §18 rule 1 names, so the SQL is GENERATED from the same map the predicate reads
 * (`buildTripAdvisorStatusRankSql`). This module imports nothing — no `db`, no schema — so
 * `server/__tests__/trip-advisor-row.test.ts` can exercise it as pure `node:test`.
 *
 * THE LADDER.
 *   rank 2 — `accepted`, `assigned`  (the two §12 WRITE-access statuses)
 *   rank 1 — `pending`, `rejected`   (a decided or awaited state; neither grants write)
 *   rank 0 — NULL / anything unrecognised
 *
 * THE RULE. A conflicting write NEVER DOWNGRADES: the incoming status replaces the stored one
 * ONLY when its rank is strictly HIGHER. Consequences, each deliberate:
 *   • an invitation (`pending`) never overwrites an `accepted` or `assigned` row — the expert's
 *     own acceptance and an admin's confirmation both outrank an invite;
 *   • `accepted` and `assigned` share a rank, so neither overwrites the other — the FIRST of the
 *     two to land stands, and a re-confirm or a re-grant is a no-op rather than a rewrite;
 *   • the same status arriving twice is a no-op (equal rank), which is what makes every caller
 *     idempotent by construction (§15);
 *   • `rejected` sits at the SAME rank as `pending`, not below it, so a fresh invitation cannot
 *     silently clear an expert's refusal — only a deliberate grant (`accepted`/`assigned`, e.g.
 *     the seller of a ready-made trip being granted write access to fulfil a paid revision, or an
 *     admin confirming a routed lead) outranks a refusal;
 *   • a NULL or unrecognised stored status ranks 0, so any real status replaces it. NULL is not
 *     treated as a state that has to be respected — nothing writes it, and the read side already
 *     denies on it.
 *
 * `rejected` is deliberately NOT in `TripAdvisorRowStatus`: it is a state the rule must REASON
 * about but not a status this write path may ever ASSERT. It is written by the expert's own
 * decline path (`server/routes/booking-actions.ts`), never by an upsert.
 */

/** The statuses the one author may WRITE. `rejected` is reachable only by the expert's decline. */
export type TripAdvisorRowStatus = "pending" | "accepted" | "assigned";

/** The writable set as a value, for runtime validation and for tests. */
export const TRIP_ADVISOR_ROW_STATUSES: readonly TripAdvisorRowStatus[] = [
  "pending",
  "accepted",
  "assigned",
] as const;

/**
 * The precedence ladder. Higher wins; equal is a no-op. This map is the SINGLE source of the
 * rule — the SQL `CASE` below is generated from it, so the two can never disagree.
 */
export const TRIP_ADVISOR_STATUS_RANK: Readonly<Record<string, number>> = Object.freeze({
  rejected: 1,
  pending: 1,
  accepted: 2,
  assigned: 2,
});

/** Rank of a stored/incoming status. Fails closed: NULL, undefined and unknown values rank 0. */
export function tripAdvisorStatusRank(status: unknown): number {
  if (typeof status !== "string") return 0;
  return TRIP_ADVISOR_STATUS_RANK[status] ?? 0;
}

/**
 * The rule, in one place: what the row's status should be after a write of `incoming` lands on a
 * row currently holding `existing`. Never downgrades; equal rank keeps what is already stored.
 */
export function resolveTripAdvisorStatus(
  existing: unknown,
  incoming: TripAdvisorRowStatus,
): string {
  if (typeof existing !== "string") return incoming;
  return tripAdvisorStatusRank(incoming) > tripAdvisorStatusRank(existing) ? incoming : existing;
}

/**
 * The same ladder as a SQL scalar over `operand` (e.g. `excluded.status`). GENERATED from
 * `TRIP_ADVISOR_STATUS_RANK` so the upsert's `ON CONFLICT DO UPDATE` cannot drift from the
 * TypeScript predicate above. `operand` is a caller-supplied SQL identifier, never user input —
 * the only two call sites pass a literal column reference.
 */
export function buildTripAdvisorStatusRankSql(operand: string): string {
  const whens = Object.entries(TRIP_ADVISOR_STATUS_RANK)
    .map(([status, rank]) => `WHEN '${status}' THEN ${rank}`)
    .join(" ");
  return `CASE ${operand} ${whens} ELSE 0 END`;
}
