/**
 * Row P-7 (ledger `2026-11-02-p7-get-help-with-this-plan`): ONE expert-door string across the slip's
 * surfaces (empty slip, drafted-slip note, bottom bar), gated by `useExpertAvailability` — the one
 * reading of `GET /api/expert-availability`. Absent, never greyed, when no expert is live (row 223).
 *
 * Wording proposed; it ships only with Leon's wording approval on the PR. Every surface renders
 * these keys, so one edit here changes them all.
 */
export const EXPERT_DOOR_COPY = {
  getHelp: "Get help with this plan",
  draftedNote: "Want a local to check this?",
} as const;

/** The drafted-slip note shows for the owner of a plan with at least one stop, no advisor, and a live expert. */
export function getHelpNoteShown(opts: {
  isOwner: boolean;
  itemCount: number;
  expertsAvailable: boolean;
  hasAdvisor: boolean;
}): boolean {
  return opts.isOwner && opts.itemCount >= 1 && opts.expertsAvailable && !opts.hasAdvisor;
}

/** The bottom bar's expert slot: the advisor's thread, the help door, or nothing. */
export function bottomBarExpertSlot(opts: { hasAcceptedAdvisor: boolean; expertsAvailable: boolean }): "message" | "help" | null {
  if (opts.hasAcceptedAdvisor) return "message";
  return opts.expertsAvailable ? "help" : null;
}

/** The slip opens its one HandoffChooser from this link (`HandoffChooserHost` reads `?handoff=open`). */
export function getHelpHref(tripId: string): string {
  return `/plans/${encodeURIComponent(tripId)}?handoff=open`;
}
