/**
 * The slip map's BROWSE LAYER — what is around the plan (step 5; spec v1.2 §2.3; R-b: Browse is a
 * map layer on the slip). Pure mappers over the EXISTING public reads — `/api/services` (listings,
 * with their own coordinates), `/api/affiliate/products` (partner places, with theirs) and
 * `/api/experts` (hosts — no coordinates, so a list row, NEVER a pin). "Add" writes the plan through
 * the ONE add rail, `POST /api/trips/:tripId/itinerary-items` (LD 39).
 */
import type { BrowsePlace } from "@/lib/map-scene";
import { stripPartnerCardPhrase } from "@shared/banned-copy";
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
    .flatMap((r) => {
      if (words) {
        const text = `${r.category ?? ""} ${r.subCategory ?? ""}`.toLowerCase();
        if (!words.some((w) => text.includes(w))) return [];
      }
      const rawName = r?.name == null || r.name === "" ? "" : String(r.name);
      const name = rawName ? stripPartnerCardPhrase(rawName) : "Place";
      if (!name) return [];
      return [{
      id: String(r.id),
      kind: "partner" as const,
      name,
      lat: coord(r.coordinates?.lat),
      lng: coord(r.coordinates?.lng),
      category: r.category ?? null,
      partnerText: `${r.category ?? ""} ${r.subCategory ?? ""}`.toLowerCase(),
      // PX-1 (decision-maker, Oct 17, 2026, ruling 3): a partner place's STORED price has no source and
      // no as-of time, so it is never shown and never filters the budget. The card offers the
      // partner's current price instead (`PARTNER_PRICE_LINK_LABEL`). Provider listings keep theirs.
      priceLabel: null,
      budget: { kind: "unpriced" as const },
    }];
    });
}

/** The partner card's price line: the partner's own current price, behind the tracked redirect. */
export const PARTNER_PRICE_LINK_LABEL = "See current price";
/** Said beside it, because the partner link earns us a commission. */
export const PARTNER_COMMISSION_NOTE = "Traveloure earns a commission on this booking";

/**
 * GATE-1 (ledger `2026-11-03-gate1-partner1`): the commission line is said only where a partner link is usable AND
 * purchases are on sale. In waitlist mode purchases are refused, so there is no booking and nothing to disclose.
 * Public pages pass the public mode (`useSignupMode().mode === "open"`); a plan's map passes its capabilities'
 * `signup.purchasesAllowed`.
 */
export const BROWSE_EMPTY_COPY = {
  /** GATE-1: a browse tab whose filtered list is empty. HELD for Leon (brief §6). */
  tab: (city: string) => `Nothing here yet for ${city}.`,
} as const;

/**
 * GATE-1: a browse tab draws its empty state only once both reads have answered, the filtered list is empty and the
 * city is known — never sample rows, and never while the reads are still in flight.
 */
export function browseTabEmptyShown(input: { browseOn: boolean; loaded: boolean; count: number; city: string | null | undefined }): boolean {
  return input.browseOn && input.loaded && input.count === 0 && !!input.city?.trim();
}

export function partnerCommissionShown(linkUsable: boolean, purchasesAllowed: boolean): boolean {
  return linkUsable && purchasesAllowed;
}

// ── VD-1: LIVE VIATOR ROW (ledger `2026-10-18-viator-direct-live`) ───────────────────────────────

export const VIATOR_LIVE_HEADING = "Viator · live";
export const VIATOR_ATTRIBUTION_LINE = "From Viator";
export const VIATOR_LINK_LABEL = "View on Viator";

/** The server's live answer (`GET /api/viator/live/products`). */
export interface ViatorLiveResponse {
  status?: string;
  asOf?: string | null;
  items?: Array<{
    id?: string;
    productCode?: string;
    title?: string;
    price?: number | null;
    currency?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    productUrl?: string | null;
  }>;
}

export interface ViatorLiveCard {
  id: string;
  productCode: string;
  title: string;
  /** "From USD 45 · price as of 15:42" — only when Viator stated a price AND the read time is known. */
  priceLine: string | null;
  ratingLine: string | null;
  url: string | null;
}

/** Pure. Nothing but an `ok` answer draws a card; a price is never shown without its as-of time (§13). */
export function viatorLiveCards(res: ViatorLiveResponse | null | undefined, locale?: string): ViatorLiveCard[] {
  if (!res || res.status !== "ok" || !Array.isArray(res.items)) return [];
  const asOf = res.asOf ? new Date(res.asOf) : null;
  const asOfText = asOf && !Number.isNaN(asOf.getTime()) ? asOf.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : null;
  return res.items
    .filter((i) => typeof i.productCode === "string" && i.productCode)
    .flatMap((i) => {
      const rawTitle = typeof i.title === "string" ? i.title : "";
      const title = rawTitle ? stripPartnerCardPhrase(rawTitle) : "Activity";
      if (!title) return [];
      return [{
      id: String(i.id ?? `viator-${i.productCode}`),
      productCode: String(i.productCode),
      title,
      priceLine:
        typeof i.price === "number" && Number.isFinite(i.price) && i.price > 0 && i.currency && asOfText
          ? `From ${i.currency} ${i.price} · price as of ${asOfText}`
          : null,
      ratingLine:
        typeof i.rating === "number" && typeof i.reviewCount === "number" && i.reviewCount > 0
          ? `${i.rating.toFixed(1)} rating · ${i.reviewCount} reviews on Viator`
          : null,
      url: typeof i.productUrl === "string" && i.productUrl.startsWith("https://") ? i.productUrl : null,
    }];
    });
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
    // GATE-1B: a gem or event is in exactly its own tab, and in none while "Find a host" narrows to a category.
    if (p.kind === "gem" || p.kind === "event") return !categoryKey && p.tabKey === tab;
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

/**
 * The ONE add body for a Browse place onto a day of the plan (LD 39's rail).
 *
 * CAP-2 (ledger `2026-11-05-cap2-plan-item-ref`): the place sends its PlanItemRef (`ref`) and the server re-reads the
 * row for the item's name, point and link. No coordinate is ever sent: R323's client-coordinate path for a map-added
 * listing is retired — the listing's point is the `provider_services` row's own (a property's blurred point saves
 * unlocated, as the browse map shows it). The title and link fields stay only as the plan item's display while the
 * request is in flight and for a plan in no known city; the server overrides them from the row.
 */
export function browseAddBody(place: BrowsePlace, dayNumber: number, city?: string | null): Record<string, unknown> {
  const c = (city ?? "").split(",")[0].trim();
  const kind = place.kind === "gem" || place.kind === "event" || place.kind === "listing" ? place.kind : "affiliate_product";
  const ref = c ? { kind, source_id: place.id, city: c, placement: { day_number: dayNumber } } : null;
  return {
    title: place.name,
    itemType: "activity",
    dayNumber,
    ...(place.kind === "listing" ? { providerServiceId: place.id } : {}),
    ...(place.kind !== "listing" && place.kind !== "gem" && place.kind !== "event" ? { affiliateProductId: place.id } : {}),
    ...(ref ? { ref } : {}),
  };
}

// ── GATE-1B (ledger `2026-11-04-gate1b-guest-plan`; architect ruling 2): the city page's own gems and events as a tab
// source, and empty tabs hidden. ─────────────────────────────────────────────────────────────────────────────────────

/** A gem's tab from its place type, by the city page's own category rule (`gemCategory`): eat ⇒ Dining, stay ⇒ Hotels. */
export function gemTabKey(category: string): BrowseTabKey {
  if (category === "eat") return "dining";
  if (category === "stay") return "hotels";
  return "activities";
}

/**
 * The city payload's gems and events as browse places. Gems are the payload's visible (moderated) gems; an event is
 * included only when its description is our reviewed editorial text (PARTNER-1: `description` is published only once
 * `editorial_reviewed_at` is set). Neither carries a point in the public payload; A-33: each carries `located`, so only an
 * unlocated one lists "not on the map".
 */
export function cityContentPlaces(
  payload: { gems?: { data?: unknown } | null; events?: { data?: { events?: unknown } | null } | null } | null | undefined,
  gemCategoryOf: (placeType: string | null | undefined) => string,
): BrowsePlace[] {
  const gems = Array.isArray(payload?.gems?.data) ? (payload!.gems!.data as any[]) : [];
  const events = Array.isArray(payload?.events?.data?.events) ? (payload!.events!.data!.events as any[]) : [];
  const out: BrowsePlace[] = [];
  for (const g of gems) {
    const name = typeof g?.placeName === "string" ? g.placeName.trim() : "";
    if (!g?.id || !name) continue;
    out.push({ id: String(g.id), kind: "gem", name, lat: null, lng: null, located: g.located === true, category: typeof g.placeType === "string" ? g.placeType : null, tabKey: gemTabKey(gemCategoryOf(g.placeType)) });
  }
  for (const e of events) {
    const name = typeof e?.title === "string" ? e.title.trim() : typeof e?.name === "string" ? e.name.trim() : "";
    const reviewed = typeof e?.description === "string" && e.description.trim() !== "";
    if (!e?.id || !name || !reviewed) continue;
    out.push({ id: String(e.id), kind: "event", name, lat: null, lng: null, located: e.located === true, category: null, tabKey: "activities" });
  }
  return out;
}

/** Ruling 2: the tabs that have at least one place. Until every read has answered, every tab shows (no flicker). */
export function visibleBrowseTabs(places: readonly BrowsePlace[], loaded: boolean): BrowseTab[] {
  if (!loaded) return [...BROWSE_TABS];
  return BROWSE_TABS.filter((t) => placesInTab(places, t.key).some((p) => p.kind !== "candidate"));
}

