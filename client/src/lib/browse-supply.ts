/**
 * The slip map's BROWSE LAYER — what is around the plan (step 5; spec v1.2 §2.3; R-b: Browse is a
 * map layer on the slip). Pure mappers over the EXISTING public reads — `/api/services` (listings,
 * with their own coordinates), `/api/affiliate/products` (partner places, with theirs) and
 * `/api/experts` (hosts — no coordinates, so a list row, NEVER a pin). "Add" writes the plan through
 * the ONE add rail, `POST /api/trips/:tripId/itinerary-items` (LD 39).
 */
import type { BrowsePlace } from "@/lib/map-scene";

const coord = (v: unknown): number | null => {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function listingPlaces(rows: ReadonlyArray<any> | null | undefined): BrowsePlace[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    kind: "listing",
    name: String(r.serviceName ?? r.name ?? "Listing"),
    lat: coord(r.latitude),
    lng: coord(r.longitude),
    category: r.serviceType ?? null,
    priceLabel: coord(r.price) != null ? `$${Number(r.price).toFixed(0)}` : null,
  }));
}

/**
 * Partner places have free-text categories, not `service_categories` keys, so a category filter
 * reads them through this short word list. A key with no words here filters partner places OUT —
 * a partner place is never shown under a category nobody mapped it to (§13).
 */
export const PARTNER_CATEGORY_WORDS: Readonly<Record<string, readonly string[]>> = {
  activity_provider: ["activity", "activities", "tour", "tours", "experience", "attraction", "ticket"],
  dining_venue: ["restaurant", "dining", "food", "cafe", "bar"],
  accommodation: ["hotel", "hotels", "lodging", "accommodation", "ryokan", "hostel"],
  private_transportation: ["transfer", "transport", "car", "taxi"],
};

export function partnerPlaces(rows: ReadonlyArray<any> | null | undefined, categoryKey?: string | null): BrowsePlace[] {
  const words = categoryKey ? PARTNER_CATEGORY_WORDS[categoryKey] ?? [] : null;
  return (rows ?? [])
    .filter((r) => {
      if (!words) return true;
      const text = `${r.category ?? ""} ${r.subCategory ?? ""}`.toLowerCase();
      return words.some((w) => text.includes(w));
    })
    .map((r) => ({
      id: String(r.id),
      kind: "partner",
      name: String(r.name ?? "Place"),
      lat: coord(r.coordinates?.lat),
      lng: coord(r.coordinates?.lng),
      category: r.category ?? null,
      priceLabel: coord(r.price) != null ? `${r.currency && r.currency !== "USD" ? `${r.currency} ` : "$"}${Number(r.price).toFixed(0)}` : null,
    }));
}

/** Hosts for the sheet's list — never pinned (no coordinates). */
export function hostRows(rows: ReadonlyArray<any> | null | undefined): Array<{ id: string; name: string; handle: string | null }> {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.handle || "Local expert",
    handle: r.handle ?? null,
  }));
}

/** The ONE add body for a Browse place onto a day of the plan (LD 39's rail). */
export function browseAddBody(place: BrowsePlace, dayNumber: number): Record<string, unknown> {
  const located = place.lat != null && place.lng != null;
  if (place.kind === "listing") {
    // R323 (R322 carry-over): a listing placed from its OWN coordinates carries them, so the stop is
    // located and can have a leg; an unlocated listing still adds, unlocated (§13 — never a guess).
    return {
      title: place.name,
      itemType: "activity",
      providerServiceId: place.id,
      dayNumber,
      locationName: place.name,
      ...(located ? { latitude: String(place.lat), longitude: String(place.lng) } : {}),
    };
  }
  return {
    title: place.name,
    itemType: "activity",
    affiliateProductId: place.id,
    dayNumber,
    locationName: place.name,
    ...(located ? { latitude: String(place.lat), longitude: String(place.lng) } : {}),
  };
}
