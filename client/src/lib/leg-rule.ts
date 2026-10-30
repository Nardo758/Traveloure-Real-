/**
 * P0-c item 4: the rule a leg line draws on its left edge. Dashed means UNROUTED — a minutes-only or
 * mode-only line nobody asked the routing engine for. A routed leg (the engine's own answer, with its
 * provenance) draws a solid rule. ONE class per state, read by the slip's `LegRow` rows and the Trip
 * Card's `LegLine`, so no routed leg can carry the dashed look (§18 rule 1).
 */
export const LEG_RULE_ROUTED = "border-l-2 border-solid border-border";
export const LEG_RULE_UNROUTED = "border-l-2 border-dashed border-border";

export function legRuleClass(routed: boolean): string {
  return routed ? LEG_RULE_ROUTED : LEG_RULE_UNROUTED;
}

/** A stored leg is routed when the engine wrote it (a `source`) with real minutes — the server's `legIsRouted` test. */
export function storedLegIsRouted(leg: { source?: string | null; estimatedDurationMinutes?: number | string | null }): boolean {
  const minutes = Number(leg.estimatedDurationMinutes);
  return leg.source != null && Number.isFinite(minutes) && minutes > 0;
}

/**
 * Row 247 (ledger `2026-10-29-leg-minutes-est`): the mark an EXPERT surface prints after minutes that
 * are not a routed answer (a straight-line estimate). Expert-facing only; the Architect approved the
 * word Oct 29, 2026. The traveler surfaces do not print such minutes at all (audit B8).
 */
export const LEG_ESTIMATE_MARK = "est.";
