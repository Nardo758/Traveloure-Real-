/**
 * E6 — the slip's FREE DRAFT RUN funnel event (`docs/planning/slip-funnel-events.md` §3.6; ledger
 * `2026-09-28-kyoto-s4-draft-ci`). Written by `POST /api/ai/generate-itinerary` for a plan-bound
 * request, on each of its three outcomes, through the one `trackFunnelEvent` writer (which never
 * throws — §15b).
 *
 * Stage is `SLIP` (doc §2 rule 10: none of the slip events is one of ADR-004's T0–T7 steps).
 *
 * §13 — only facts this request holds are written:
 *   · `itemsWritten` only on `drafted` (the count of rows the snapshot inserted);
 *   · `draftBasis` (Part 2 M) and `heldSlots` (R126) are OMITTED until they are built, as the doc says;
 *   · `modelTier` is OMITTED: the doc names "the env-configured tier name", and no such setting
 *     exists on `main` — the generator reports a model, not a tier, and a model name is not the
 *     fact the doc asked for.
 */
export const FREE_DRAFT_RUN_EVENT = "slip_free_draft_run";
export const SLIP_FUNNEL_STAGE = "SLIP";

export type FreeDraftOutcome = "drafted" | "refused_not_empty" | "provider_failed";

export function freeDraftRunEventData(
  input: { outcome: "drafted"; itemsWritten: number } | { outcome: "refused_not_empty" | "provider_failed" },
): Record<string, unknown> {
  if (input.outcome === "drafted") return { outcome: "drafted", itemsWritten: input.itemsWritten };
  return { outcome: input.outcome };
}
