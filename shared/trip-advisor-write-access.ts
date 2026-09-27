/**
 * THE §12 WRITE-ACCESS ADVISOR STATUSES, stated once for server AND client (ledger
 * `2026-09-26-send-to-expert-needs-expert`; CLAUDE.md Locked Decision 12).
 *
 * `server/utils/trip-advisor.ts` owns the canonical predicates and re-exports this list; it moved
 * here so the slip can decide whether "Send to expert" has anyone to send to WITHOUT restating the
 * list (§18 rule 1) — the server refuses the same transition on the same answer.
 */
export const TRIP_ADVISOR_WRITE_ACCESS_STATUSES = ["accepted", "assigned"] as const;

/** Fails closed: NULL, undefined and any unrecognised value grant nothing. */
export function advisorStatusGrantsWriteAccess(status: unknown): boolean {
  return typeof status === "string" && (TRIP_ADVISOR_WRITE_ACCESS_STATUSES as readonly string[]).includes(status);
}
