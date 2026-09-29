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
 *   · `draftBasis` and `heldSlots` — built by A5; see `freeDraftRunEventData` below;
 *   · `modelTier` is OMITTED: the doc names "the env-configured tier name", and no such setting
 *     exists on `main` — the generator reports a model, not a tier, and a model name is not the
 *     fact the doc asked for.
 */
export const FREE_DRAFT_RUN_EVENT = "slip_free_draft_run";
export const SLIP_FUNNEL_STAGE = "SLIP";

export type FreeDraftOutcome = "drafted" | "refused_not_empty" | "provider_failed" | "anchor_asked";

/**
 * A5 (ledger `2026-09-29-a5-draft-open-set`): `draftBasis` and `heldSlots` are now built.
 *   · `draftBasis` — `open_anchor_set` | `none_asked`, only when the plan is a lodging-anchored Trip
 *     (the one case this lane decides); OMITTED otherwise (§13). `chosen_anchor` cannot occur on the
 *     free path: a chosen stay is an item, and a plan with an item is not drafted (LD 41 (b)).
 *   · `heldSlots` — how many OPEN option sets the draft built around (R126); written on a plan-bound
 *     draft, 0 included, because the draft did read the sets.
 *   · `anchor_asked` — a NEW outcome: the draft asked where the traveler is staying instead of
 *     drafting (§M5); no model call was made.
 */
export function freeDraftRunEventData(
  input:
    | { outcome: "drafted"; itemsWritten: number; draftBasis?: string | null; heldSlots?: number }
    | { outcome: "refused_not_empty" | "provider_failed" | "anchor_asked" },
): Record<string, unknown> {
  if (input.outcome === "drafted") {
    const out: Record<string, unknown> = { outcome: "drafted", itemsWritten: input.itemsWritten };
    if (input.draftBasis) out.draftBasis = input.draftBasis;
    if (typeof input.heldSlots === "number") out.heldSlots = input.heldSlots;
    return out;
  }
  return { outcome: input.outcome };
}
