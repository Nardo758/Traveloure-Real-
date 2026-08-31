// Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the ItineraryCard renderer and its
// ItineraryMapView sibling were deleted as dead (no live importers). This file is kept ONLY as
// the type home for the diff shapes still consumed by the two comparison pages —
// itinerary.tsx and itinerary-view.tsx (`import type { ActivityDiff, TransportDiff }`). The
// card/activity/day/transport-summary types went with the renderer that was their sole consumer.

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
