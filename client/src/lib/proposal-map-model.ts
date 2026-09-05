export interface ProposalMapItem {
  id: string;
  dayNumber: number;
  startTime?: string | null;
  timeSlot?: string | null;
  name: string;
  serviceType?: string | null;
  price?: string | number | null;
  location?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface ProposalMapSource {
  id: string;
  name: string;
  items: ProposalMapItem[];
  /**
   * The traveler's own plan (the comparison's `source === "user"` variant). At most one source
   * carries it; it is the map's first tab and the only legal compare target (LD 41).
   */
  isBaseline?: boolean;
}

export interface LocatedProposalItem extends ProposalMapItem {
  lat: number;
  lng: number;
}

function parseCoordinate(
  value: string | number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

/** Pure §13 boundary: only persisted, valid coordinate pairs become pins. */
export function buildProposalMapModel(items: ProposalMapItem[]): {
  total: number;
  located: LocatedProposalItem[];
} {
  const located: LocatedProposalItem[] = [];
  for (const item of items) {
    const lat = parseCoordinate(item.latitude, -90, 90);
    const lng = parseCoordinate(item.longitude, -180, 180);
    if (lat == null || lng == null) continue;
    located.push({ ...item, lat, lng });
  }
  return { total: items.length, located };
}
/* ────────────────────────────────────────────────────────────────────────────────────────────
 * LD 41 (ledger `2026-09-05-comparison-map-baseline-compare`) — the review board's map gains
 * the traveler's OWN plan as a tab, and a compare toggle that draws it beneath a focused
 * proposal as a second sequence line. Everything below is PURE: no React, no DOM, no fetch —
 * the component reads these and never re-derives a count, a label or an ordering of its own
 * (§18 rule 1).
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Fallback label for the baseline tab. The baseline variant carries its own server-authored name
 * ("Your Plan", `server/itinerary-optimizer.ts`) and that name WINS — this is only what a
 * nameless baseline is called, and it is the ruling's own words, not a new vocabulary.
 */
export const DEFAULT_BASELINE_TAB_LABEL = "Your plan";

export function baselineTabLabel(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_BASELINE_TAB_LABEL;
}

export interface ProposalMapTab {
  source: ProposalMapSource;
  label: string;
}

export function findBaselineSource(
  sources: ProposalMapSource[],
): ProposalMapSource | null {
  return sources.find((source) => source.isBaseline) ?? null;
}

/**
 * Baseline FIRST, every other source in the order the board handed them over. Labels are minted
 * here once: the baseline takes its own name (or the ruling's fallback), and a nameless proposal
 * keeps the board's "Proposal N" numbering — N counts PROPOSALS, so putting the baseline in front
 * never renumbers them.
 */
export function buildProposalMapTabs(sources: ProposalMapSource[]): ProposalMapTab[] {
  const ordered = [
    ...sources.filter((source) => source.isBaseline),
    ...sources.filter((source) => !source.isBaseline),
  ];
  let proposalIndex = 0;
  return ordered.map((source) => {
    if (source.isBaseline) {
      return { source, label: baselineTabLabel(source.name) };
    }
    proposalIndex += 1;
    const named = (source.name ?? "").trim();
    return { source, label: named.length > 0 ? named : `Proposal ${proposalIndex}` };
  });
}

/**
 * Which tab opens. The board opened on a PROPOSAL before the baseline tab existed and still does
 * — adding "Your plan" as the first tab must not change what the traveler lands on. A board with
 * nothing but a baseline focuses the baseline.
 */
export function defaultFocusedProposalId(sources: ProposalMapSource[]): string {
  const tabs = buildProposalMapTabs(sources);
  const firstProposal = tabs.find((tab) => !tab.source.isBaseline);
  return (firstProposal ?? tabs[0])?.source.id ?? "";
}

/**
 * The compare toggle exists only when there is something to compare AGAINST something else: a
 * baseline must be present, and the focused tab must be a proposal. A plan is never compared with
 * itself, so the control is OMITTED (not disabled) on the baseline tab.
 */
export function canCompareWithBaseline(
  sources: ProposalMapSource[],
  focusedId: string,
): boolean {
  const baseline = findBaselineSource(sources);
  if (!baseline || baseline.id === focusedId) return false;
  return sources.some((source) => source.id === focusedId && !source.isBaseline);
}

export interface ProposalMapSeries {
  id: string;
  label: string;
  total: number;
  located: LocatedProposalItem[];
  isBaseline: boolean;
}

/** One labelled series: the §13 located/total split of one tab's stops. */
export function buildProposalMapSeries(tab: ProposalMapTab): ProposalMapSeries {
  const model = buildProposalMapModel(tab.source.items);
  return {
    id: tab.source.id,
    label: tab.label,
    total: model.total,
    located: model.located,
    isBaseline: !!tab.source.isBaseline,
  };
}

/** "Your plan: 3 of 5 located" — stated once, per series, never summed across the two (§13). */
export function locatedCountLine(series: ProposalMapSeries): string {
  return `${series.label}: ${series.located.length} of ${series.total} located`;
}

export interface ComparisonMapModel {
  /** The focused tab's series — the one drawn in the accent. */
  primary: ProposalMapSeries;
  /** The baseline drawn beneath it; null whenever compare is off or unavailable. */
  secondary: ProposalMapSeries | null;
  /**
   * §13: no located stop on EITHER side ⇒ no map at all. A map centred on a city the traveler
   * never placed a stop in would be a claim nobody made, so the surface renders its honest empty
   * state instead of a fallback centre.
   */
  hasAnyLocated: boolean;
}

export function buildComparisonMapModel(
  primary: ProposalMapSeries,
  baseline: ProposalMapSeries | null,
  compareEnabled: boolean,
): ComparisonMapModel {
  const secondary =
    compareEnabled && baseline && baseline.id !== primary.id ? baseline : null;
  return {
    primary,
    secondary,
    hasAnyLocated: primary.located.length > 0 || (secondary?.located.length ?? 0) > 0,
  };
}
