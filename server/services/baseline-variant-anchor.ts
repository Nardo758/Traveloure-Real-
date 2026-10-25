/**
 * Baseline "Your Plan" anchor columns (ledger 2026-10-25-baseline-variant-anchor).
 *
 * The traveler's pin is the only source. The optimizer's auto anchors (`chosenAnchors`
 * from `pickAutoAnchors` / open-set slots) are never written on this row. AI-variant
 * rows keep writing `chosenAnchors[v]` themselves.
 *
 * Median metres uses the same Math.round as the AI insert, and only when at least two
 * stops were located. Fewer than that, or a non-finite median, stays null.
 *
 * anchor_type mirrors the pin the traveler chose. A catalog pin keeps its kind
 * (hotel, neighborhood, activity). Only a geocoded free-text pin — the scorer's
 * `custom:` anchor id — is stored as custom.
 */

import type { AnchorScore } from "./anchor-scoring";

export interface BaselineVariantAnchorFields {
  anchorType: string | null;
  anchorName: string | null;
  anchorLat: string | null;
  anchorLng: string | null;
  anchorMedianMeters: number | null;
}

const EMPTY: BaselineVariantAnchorFields = {
  anchorType: null,
  anchorName: null,
  anchorLat: null,
  anchorLng: null,
  anchorMedianMeters: null,
};

export function baselineVariantAnchorFields(
  pinnedAnchor: AnchorScore | null | undefined,
): BaselineVariantAnchorFields {
  if (!pinnedAnchor) return { ...EMPTY };
  if (!Number.isFinite(pinnedAnchor.lat) || !Number.isFinite(pinnedAnchor.lng)) return { ...EMPTY };
  const median =
    pinnedAnchor.locatedStops >= 2 &&
    pinnedAnchor.medianMeters != null &&
    Number.isFinite(pinnedAnchor.medianMeters)
      ? Math.round(pinnedAnchor.medianMeters)
      : null;
  return {
    anchorType: pinnedAnchor.anchorId.startsWith("custom:") ? "custom" : pinnedAnchor.type,
    anchorName: pinnedAnchor.name.slice(0, 200),
    anchorLat: pinnedAnchor.lat.toString(),
    anchorLng: pinnedAnchor.lng.toString(),
    anchorMedianMeters: median,
  };
}
