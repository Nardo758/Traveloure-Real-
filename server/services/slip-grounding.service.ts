// Item 2 Phase 1 (ledger 2026-08-23-item2-grounding): ground a free-text AI itinerary build.
//
// The AI build a traveler triggers (POST /api/trips/:id/generate-itinerary) returns pure free text —
// nothing bookable, nothing on the map. This resolver runs ONE fail-closed pass over the generated
// items before they're written, matching each against the real destination catalog (bookable
// provider_services) and the market's DMO extracted places (recognized, informational). A confident
// match links the item; anything else stays an honest AI suggestion (§13 — never a fake link, never
// an invented pin).
//
// Ratified defaults (decision-maker Aug 23, mock sign-off):
//   Q1 automatic in the build pass · Q2 mark bookable, never auto-cart (we only stamp the link, the
//   cart projection already turns providerServiceId into an add-to-cart affordance the traveler
//   chooses) · Q3 DMO informational only (dmoExtractedPlaceId + pin, never a platform booking) ·
//   Q4 conservative / fail-closed (a high threshold; no match ⇒ no link).
//
// Grounding priority: CATALOG first (a bookable platform service is the strongest outcome), then
// DMO place. The two links are mutually exclusive on an item.

import { loadOptimizerCatalog } from "./optimizer-baseline.service";
import { getExtractedPlacesForMarket } from "./dmo-extracted-places.service";
import { similarity, MATCH_THRESHOLD } from "./slip-grounding-match";

// The pure matcher lives in slip-grounding-match.ts (no DB import — unit-testable). Re-exported here
// so existing importers of this service keep working.
export { similarity, MATCH_THRESHOLD };

/** The shape the build loop hands us and gets back (a superset is fine — we only add link fields). */
export interface GroundableItem {
  title?: string | null;
  locationName?: string | null;
  itemType?: string | null;
  providerServiceId?: string | null;
  dmoExtractedPlaceId?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

/** The candidate name for an item: prefer the specific location name, fall back to the title. */
function itemName(item: GroundableItem): string {
  return (item.locationName || item.title || "").trim();
}

export interface GroundingResult {
  items: GroundableItem[];
  groundedToCatalog: number;
  groundedToDmo: number;
}

/**
 * Ground an AI-built item set in place. Returns the same items with link fields populated on the
 * confident matches. Loads the catalog + DMO places ONCE for the whole set. Never throws — a
 * grounding failure degrades to "all items ungrounded" (the pre-Phase-1 behavior), never blocks
 * the build.
 */
export async function groundAiItems(
  items: GroundableItem[],
  destination: string | null | undefined,
): Promise<GroundingResult> {
  let groundedToCatalog = 0;
  let groundedToDmo = 0;
  if (items.length === 0) return { items, groundedToCatalog, groundedToDmo };

  let catalog: Awaited<ReturnType<typeof loadOptimizerCatalog>> = [];
  let places: Awaited<ReturnType<typeof getExtractedPlacesForMarket>> = [];
  try {
    [catalog, places] = await Promise.all([
      loadOptimizerCatalog(destination),
      getExtractedPlacesForMarket(destination),
    ]);
  } catch (err) {
    console.error("[slip-grounding] load failed — items stay ungrounded:", (err as any)?.message);
    return { items, groundedToCatalog, groundedToDmo };
  }

  for (const item of items) {
    const name = itemName(item);
    if (!name) continue;

    // 1) CATALOG (strongest outcome — bookable). Best confident match by name.
    let bestSvc: { id: string; lat: string | null; lng: string | null; score: number } | null = null;
    for (const svc of catalog as any[]) {
      const score = similarity(name, svc.serviceName ?? "");
      if (score >= MATCH_THRESHOLD && (!bestSvc || score > bestSvc.score)) {
        bestSvc = { id: svc.id, lat: svc.latitude ?? null, lng: svc.longitude ?? null, score };
      }
    }
    if (bestSvc) {
      item.providerServiceId = bestSvc.id;
      // Copy the linked service's REAL coords so the item pins with no client change (§13/§22 —
      // a real located entity, never a guess). Leave item coords untouched if the service has none.
      if (bestSvc.lat != null && bestSvc.lng != null && item.latitude == null && item.longitude == null) {
        item.latitude = bestSvc.lat;
        item.longitude = bestSvc.lng;
      }
      groundedToCatalog++;
      continue; // catalog and DMO links are mutually exclusive.
    }

    // 2) DMO place (informational — pin + official/ticketing link, never a platform booking, Q3).
    let bestPlace: { id: string; lat: string | null; lng: string | null; score: number } | null = null;
    for (const p of places) {
      const score = similarity(name, p.name ?? "");
      if (score >= MATCH_THRESHOLD && (!bestPlace || score > bestPlace.score)) {
        bestPlace = { id: p.id, lat: p.latitude ?? null, lng: p.longitude ?? null, score };
      }
    }
    if (bestPlace) {
      item.dmoExtractedPlaceId = bestPlace.id;
      if (bestPlace.lat != null && bestPlace.lng != null && item.latitude == null && item.longitude == null) {
        item.latitude = bestPlace.lat;
        item.longitude = bestPlace.lng;
      }
      groundedToDmo++;
    }
    // else: no confident match — item stays an honest AI suggestion (fail-closed).
  }

  return { items, groundedToCatalog, groundedToDmo };
}
