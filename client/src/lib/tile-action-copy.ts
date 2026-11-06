/**
 * Row 302a (ledger `2026-10-31-tile-action-map`): the labels for a bento tile's one primary action, for the kinds whose
 * action is not PlanActions'. `tileAction` / `tileActionLabel` in `bento-action-state.ts` choose among them by kind.
 * Save / book / hire words are PlanActions' (CAP-2 Phase 3, `lib/plan-actions.ts`); "Add to plan" is retired (Nov 6).
 */
export const TILE_ACTION_COPY = {
  getThisTrip: "Get this trip",
  askThisExpert: "Ask this expert",
  viewProfile: "View profile",
  apply: "Apply",
} as const;
