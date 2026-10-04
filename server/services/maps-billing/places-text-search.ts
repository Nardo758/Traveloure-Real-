/**
 * The expert workspace's Google search (`GET /api/search/experiences`, the google arm) — R298.
 *
 * Was the LEGACY Text Search (`maps/api/place/textsearch/json`: no field mask, every field billed)
 * plus a LEGACY Place Photo URL per result with the server key inside it, handed to the browser —
 * every image load was a billed "Places Photo" request outside R-aq, and the key was public. Now:
 * Places API (New) Text Search with an explicit mask (`WORKSPACE_TEXT_SEARCH_FIELDS` — Enterprise,
 * because the list shows rating, review count and price band), behind the Maps billing gate
 * (`places_text_search`), and NO photo: `photoUrl` is null and the row draws its pin icon (§13).
 */
import { WORKSPACE_TEXT_SEARCH_FIELDS } from "@shared/maps-billing";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const PRICE_LEVEL: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};
const PRICE_LABEL: Record<number, string> = { 0: "Free", 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

export interface WorkspaceSearchResult {
  id: string;
  source: "google_places";
  placeId: string;
  name: string;
  address: string | null;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  priceLabel: string | null;
  location: { lat: number; lng: number } | null;
  photoUrl: null;
  mapsUrl: string;
}

function categoryFromTypes(types: string[]): string {
  if (types.some((t) => ["restaurant", "food", "cafe", "bakery", "bar"].includes(t))) return "dining";
  if (types.some((t) => ["lodging", "hotel"].includes(t))) return "hotel";
  if (types.some((t) => ["museum", "art_gallery", "place_of_worship", "tourist_attraction"].includes(t))) return "culture";
  return "activity";
}

/** Pure. One Places (New) answer → the row shape the workspace list already reads. */
export function workspaceResultFrom(p: any): WorkspaceSearchResult | null {
  if (!p || typeof p.id !== "string" || !p.id) return null;
  const lat = Number(p.location?.latitude);
  const lng = Number(p.location?.longitude);
  const types: string[] = Array.isArray(p.types) ? p.types.map(String) : [];
  const priceLevel = typeof p.priceLevel === "string" && p.priceLevel in PRICE_LEVEL ? PRICE_LEVEL[p.priceLevel] : null;
  return {
    id: `gp_${p.id}`,
    source: "google_places",
    placeId: p.id,
    name: typeof p.displayName?.text === "string" ? p.displayName.text : p.id,
    address: typeof p.formattedAddress === "string" ? p.formattedAddress : null,
    category: categoryFromTypes(types),
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    priceLevel,
    priceLabel: priceLevel != null ? PRICE_LABEL[priceLevel] : null,
    location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    photoUrl: null,
    mapsUrl: `https://www.google.com/maps/place/?q=place_id:${p.id}`,
  };
}

/** Pure. The request body (one optional included type, at most 15 results). */
export function workspaceSearchBody(textQuery: string, includedType: string | null) {
  return { textQuery, maxResultCount: 15, languageCode: "en", ...(includedType ? { includedType } : {}) };
}

/** The gated call. Refused or failed ⇒ an empty list (the platform arm still answers). */
export async function searchWorkspacePlaces(textQuery: string, includedType: string | null): Promise<WorkspaceSearchResult[]> {
  try {
    // Imported here so the pure half of this module loads without a database (the tier test).
    const { gatedMapsCall } = await import("./maps-billing.service");
    const out = await gatedMapsCall("places_text_search", async (apiKey) => {
      const resp = await fetch(TEXT_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": WORKSPACE_TEXT_SEARCH_FIELDS.join(",") },
        body: JSON.stringify(workspaceSearchBody(textQuery, includedType)),
      });
      if (!resp.ok) return { value: [] as WorkspaceSearchResult[], success: false };
      const data: any = await resp.json();
      const rows = (Array.isArray(data?.places) ? data.places : []).map(workspaceResultFrom).filter(Boolean) as WorkspaceSearchResult[];
      return { value: rows };
    });
    return "refused" in out ? [] : out.value;
  } catch (err: any) {
    console.error("[places-text-search] failed:", err?.message ?? err);
    return [];
  }
}
