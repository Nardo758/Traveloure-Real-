/**
 * The slip map's BROWSE LAYER — what is around the plan (step 5; spec v1.2 §2.3; R-b: Browse is a
 * map layer on the slip). Pure mappers over the EXISTING public reads — `/api/services` (listings,
 * with their own coordinates), `/api/affiliate/products` (partner places, with theirs) and
 * `/api/experts` (hosts — no coordinates, so a list row, NEVER a pin). "Add" writes the plan through
 * the ONE add rail, `POST /api/trips/:tripId/itinerary-items` (LD 39).
 */
import type { BrowsePlace } from "@/lib/map-scene";
import { offeringPriceLabel } from "@/lib/expert-door";
import { resolvePriceUnit } from "@/lib/price-unit";

const coord = (v: unknown): number | null => {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A listing as Browse shows it. Step 8b-2 (ledger `2026-10-06-step8b2-map-layout`, rulings 9 and 10):
 *   · a property listing whose point is deliberately blurred (`locationApproximate`) is UNLOCATED here
 *     — no pin, and it adds unlocated — because a blurred point is not an exact location (ruling 7, §13);
 *   · the price label is the EXISTING "By quote" helper (`offeringPriceLabel`), so a hidden price or a
 *     quote-only listing never reads "$N"; a unit is shown only where the row states one;
 *   · `categoryKey` is resolved from `categoryId` through the catalog the caller read, never guessed.
 */
export function listingPlaces(
  rows: ReadonlyArray<any> | null | undefined,
  categoryKeyById?: ReadonlyMap<string, string> | null,
): BrowsePlace[] {
  return (rows ?? []).map((r) => {
    const approximate = r.locationApproximate === true;
    return {
      id: String(r.id),
      kind: "listing",
      name: String(r.serviceName ?? r.name ?? "Listing"),
      lat: approximate ? null : coord(r.latitude),
      lng: approximate ? null : coord(r.longitude),
      category: r.serviceType ?? null,
      categoryKey: r.categoryId != null ? categoryKeyById?.get(String(r.categoryId)) ?? null : null,
      priceLabel: listingPriceLabel(r),
      budget: listingBudget(r),
    };
  });
}

/** Price types that state ONE amount (ruling 10). Every other type is a quote or a range. */
export const SINGLE_AMOUNT_PRICE_TYPES: readonly string[] = ["fixed", "per_person", "per_event", "hourly"];

function listingPriceLabel(r: any): string {
  // A quote-only listing states no price at all, whatever its `price` column holds.
  const quoteOnly = r.priceType === "custom_quote";
  const base = quoteOnly ? "By quote" : offeringPriceLabel(r.price == null ? null : String(r.price), r.showPrice ?? null);
  if (base === "By quote") return base;
  const unit = resolvePriceUnit({ priceType: r.priceType, pricingUnit: r.pricingUnit, priceBasis: r.priceBasis });
  return unit ? `${base} / ${unit}` : base;
}

/**
 * How a row answers the Budget filter (ruling 10). `usd` = one shown amount in US dollars, the only kind
 * Budget can match; `quote` = quote-only or a range (left out, counted as "by quote"); `unpriced` = no
 * shown price, a hidden one, or another currency (left out, counted). A hidden price is never used.
 */
export type BrowseBudget = { kind: "usd"; amount: number } | { kind: "quote" } | { kind: "unpriced" };

function listingBudget(r: any): BrowseBudget {
  const type = r.priceType == null ? "fixed" : String(r.priceType);
  if (!SINGLE_AMOUNT_PRICE_TYPES.includes(type)) return { kind: "quote" };
  const n = coord(r.price);
  // `provider_services` has no currency column: a listing's shown price is the platform's US dollars.
  if (r.showPrice === false || n == null || n <= 0) return { kind: "unpriced" };
  return { kind: "usd", amount: n };
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
      partnerText: `${r.category ?? ""} ${r.subCategory ?? ""}`.toLowerCase(),
      priceLabel: coord(r.price) != null ? `${r.currency && r.currency !== "USD" ? `${r.currency} ` : "$"}${Number(r.price).toFixed(0)}` : null,
      budget: partnerBudget(r),
    }));
}

function partnerBudget(r: any): BrowseBudget {
  const n = coord(r.price);
  if (n == null || n <= 0 || r.currency !== "USD") return { kind: "unpriced" };
  return { kind: "usd", amount: n };
}

// ── STEP 8b-2: TABS, SEARCH AND BUDGET (brief item 14/15; rulings 8 and 10) ─────────────────────────

/** The four `aff_*` keys are affiliate SOURCES, not hireable roles (Locked Decision 31): never a tab. */
export const AFFILIATE_SOURCE_KEYS: readonly string[] = ["aff_activities", "aff_events", "aff_ground_transport", "aff_air_hotel"];

export type BrowseTabKey = "activities" | "hotels" | "services" | "dining" | "transportation";

export interface BrowseTab {
  key: BrowseTabKey;
  label: string;
  /** Listing category keys; `null` = every key the other tabs do not name (Services), minus `aff_*`. */
  listingKeys: readonly string[] | null;
  /** The `PARTNER_CATEGORY_WORDS` key partner places are matched through; `null` = no partner places. */
  partnerKey: string | null;
}

/** Ruling 8. ONE table, in the board's order. */
export const BROWSE_TABS: readonly BrowseTab[] = [
  { key: "activities", label: "Activities", listingKeys: ["activity_provider", "tour_guide"], partnerKey: "activity_provider" },
  { key: "hotels", label: "Hotels", listingKeys: ["accommodation"], partnerKey: "accommodation" },
  { key: "services", label: "Services", listingKeys: null, partnerKey: null },
  { key: "dining", label: "Dining", listingKeys: ["dining_venue"], partnerKey: "dining_venue" },
  { key: "transportation", label: "Transportation", listingKeys: ["private_transportation"], partnerKey: "private_transportation" },
];

const NAMED_KEYS = new Set(BROWSE_TABS.flatMap((t) => t.listingKeys ?? []));

/** The tab a category key belongs to ("Find a host" opens Browse on it). */
export function browseTabForCategory(categoryKey: string | null | undefined): BrowseTabKey {
  if (!categoryKey) return "activities";
  return BROWSE_TABS.find((t) => t.listingKeys?.includes(categoryKey))?.key ?? "services";
}

/**
 * The places one tab shows. A listing with no resolved key is in no tab (never guessed in); a partner
 * place is matched only through `PARTNER_CATEGORY_WORDS`, and one with no category text stays out.
 * `categoryKey` (from "Find a host") narrows within the tab to that one key.
 */
export function placesInTab(places: readonly BrowsePlace[], tab: BrowseTabKey, categoryKey?: string | null): BrowsePlace[] {
  const def = BROWSE_TABS.find((t) => t.key === tab)!;
  return places.filter((p) => {
    if (p.kind === "candidate") return true;
    if (p.kind === "listing") {
      const key = p.categoryKey ?? null;
      if (!key) return false;
      if (categoryKey) return key === categoryKey;
      return def.listingKeys ? def.listingKeys.includes(key) : !NAMED_KEYS.has(key) && !AFFILIATE_SOURCE_KEYS.includes(key);
    }
    const wordsKey = categoryKey ?? def.partnerKey;
    if (!wordsKey) return false;
    const words = PARTNER_CATEGORY_WORDS[wordsKey] ?? [];
    const text = p.partnerText ?? "";
    return text.trim().length > 0 && words.some((w) => text.includes(w));
  });
}

/** Search over a tab's rows: the place's own name or category, case-insensitive. */
export function searchPlaces(places: readonly BrowsePlace[], query: string): BrowsePlace[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...places];
  return places.filter((p) => `${p.name} ${p.category ?? ""}`.toLowerCase().includes(q));
}

/**
 * Ruling 10: Budget matches ONLY rows with one shown USD amount at or under the limit. Everything else
 * is left out and COUNTED, by reason — quote-only and range prices ("by quote"), and rows with no shown
 * USD price (hidden, missing, or another currency). `null` limit ⇒ no filter, nothing counted.
 */
export function applyBudget(
  places: readonly BrowsePlace[],
  maxUsd: number | null,
): { shown: BrowsePlace[]; byQuote: number; noUsdPrice: number } {
  if (maxUsd == null || !Number.isFinite(maxUsd)) return { shown: [...places], byQuote: 0, noUsdPrice: 0 };
  let byQuote = 0;
  let noUsdPrice = 0;
  const shown: BrowsePlace[] = [];
  for (const p of places) {
    if (p.kind === "candidate") {
      shown.push(p);
      continue;
    }
    const b = p.budget ?? { kind: "unpriced" as const };
    if (b.kind === "quote") byQuote += 1;
    else if (b.kind === "unpriced") noUsdPrice += 1;
    else if (b.amount <= maxUsd) shown.push(p);
  }
  return { shown, byQuote, noUsdPrice };
}

/** The plan item this place was already added as, if any (by the listing / partner id it names). */
export function addedItemFor(
  place: BrowsePlace,
  items: ReadonlyArray<{ id: string; providerServiceId?: string | null; affiliateProductId?: string | null; dayNum: number }>,
): { itemId: string; dayNum: number } | null {
  const hit = items.find((i) =>
    place.kind === "listing" ? i.providerServiceId === place.id : place.kind === "partner" ? i.affiliateProductId === place.id : false,
  );
  return hit ? { itemId: hit.id, dayNum: hit.dayNum } : null;
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
