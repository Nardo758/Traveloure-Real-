/**
 * EXPERT WORK — the row-level form of CLAUDE.md Locked Decision 42 D3's protected class.
 *
 * D3 (decision-maker ratified Sep 5 2026): an `itinerary_items` row carrying `expert_note`
 * (ruling 21, migration 152) or `origin='expert'` (ruling 12, migration 181) is PAID HUMAN WORK
 * sitting in a row a machine may rewrite. Such rows join the optimizer baseline's PROTECTED set
 * and every rebuild/apply delete spares them.
 *
 * §18 rule 1 — ONE class, TWO forms of the same answer, beside each other:
 *   - THIS module is the row-level form (a row already in hand → boolean). Its consumer in the
 *     D3 lane is the optimizer baseline read-set (`server/services/optimizer-baseline.service.ts`).
 *   - The WHERE-clause form is `itineraryItemNotExpertWork()` in
 *     `server/services/itinerary-rebuild-guard.ts`, ANDed into `itineraryItemRebuildDeletable()`
 *     and into the apply-to-trip replace deletes. It expresses THE SAME class over the SAME two
 *     columns; `server/__tests__/expert-work-protected.test.ts` pins that the two forms agree.
 *
 * "Never a second predicate" (D3) means no THIRD expression of the class — a parallel
 * "is this expert work?" test written beside either of these is the derivation-drift class.
 */

/** The columns the class reads, and nothing else. */
export interface ExpertWorkProbe {
  expertNote?: string | null;
  origin?: string | null;
}

/**
 * True when the row carries expert work: a non-empty `expert_note` (an expert's words ON the row)
 * or `origin='expert'` (the row IS the expert's). An empty/whitespace note is the absence of a
 * note, honestly (§13) — a column that was touched but holds no words protects nothing.
 */
export function itineraryItemIsExpertWork(item: ExpertWorkProbe): boolean {
  if ((item.expertNote ?? "").trim().length > 0) return true;
  return item.origin === "expert";
}
