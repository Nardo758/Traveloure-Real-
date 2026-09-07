/**
 * Itinerary diff shapes consumed by the two comparison pages (itinerary.tsx, itinerary-view.tsx).
 *
 * L4 trip-card honesty (ledger `2026-09-07-trip-card-honesty`): these lived in
 * `components/itinerary/ItineraryCard.tsx`, a file kept after Phase 3b
 * (ledger 2026-08-31-manifest-is-the-boundary) deleted the ItineraryCard RENDERER as dead —
 * a component-named file carrying only types invited the next agent to "revive" the card.
 * The file is now deleted; types live here, named for what they are.
 */

export interface ActivityDiff {
  name?: string;
  startTime?: string;
  note?: string;
  originalName: string;
  originalStartTime?: string;
}

export interface TransportDiff {
  originalMode: string;
  newMode: string;
  legOrder: number;
}
