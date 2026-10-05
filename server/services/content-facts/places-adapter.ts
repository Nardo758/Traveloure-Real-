/**
 * PlacesAdapter — the structured spine (content sourcing brief §2/§6; ledger
 * `2026-09-29-a5-draft-open-set`). Google Places API (New) Text Search, for `stop.hours`, dining
 * basics and coordinates.
 *
 * Google's terms, applied here and nowhere else:
 *   · display inside a plan only, beside the "Google Maps" attribution — `isPublishable` is false for
 *     every row this writes (origin `places_api`, license `restricted`);
 *   · cached at most 30 days — `expires_at` is capped by `placesCacheMaxDays()` whatever the type's TTL;
 *   · no directory building — the adapter answers one query for one plan item, never a sweep.
 *
 * OFF unless `PLACE_FACTS_PLACES_ENABLED=1` and `GOOGLE_MAPS_API_KEY` are set. `fetchImpl` is
 * injectable so tests make no network call. A result that does not answer is no facts, never a
 * guessed one (§13).
 */
import type { ContentNeed } from "@shared/content-facts";
import { PLACES_ATTRIBUTION } from "@shared/content-facts";
import { placesAddressLine, placesAreaText } from "@shared/place-address";
import type { FactDraft, FetchRequest, SourceAdapter } from "./source-adapter";
import {
  factTtlDays,
  placesCacheMaxDays,
  placesDetailsAtmosphereCostCents,
  placesDetailsCostCents,
  placesFactsEnabled,
  placesTextSearchCostCents,
} from "../../config/content-facts.config";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
/**
 * THE FIELD MASK (decision-maker ruling, Oct 3, 2026, from Replit's SKU read): a call is billed at
 * the HIGHEST tier any requested field belongs to, so the mask decides the price.
 *   · DEFAULT — displayName, location, formattedAddress, shortFormattedAddress, regularOpeningHours:
 *     Google's ENTERPRISE tier (opening hours lift it there). Nothing from Atmosphere. `id` (IDs
 *     Only), `types` (Essentials — the smoke-7 point-of-interest rename gate) and `googleMapsUri`
 *     (Pro — the "Google Maps" provenance link) ride along: each sits BELOW Enterprise, so none
 *     changes the tier. `priceLevel`, `servesVegetarianFood` and every other field are not asked.
 *   · DINING (the item's need is `dining`) adds `reservable` ONLY — the dining need carries
 *     reservation policy — which moves THAT call to ENTERPRISE + ATMOSPHERE. No other item asks it.
 */
export type PlacesSku = "details_enterprise" | "details_enterprise_atmosphere";
export const PLACES_BASE_FIELDS = [
  "id",
  "displayName",
  "location",
  "formattedAddress",
  "shortFormattedAddress",
  "regularOpeningHours.weekdayDescriptions",
  "types",
  "googleMapsUri",
  // Smoke 8 item 2: the AREA (ward / sublocality / locality) is read from the structured components,
  // never parsed out of the formatted string. Essentials tier — below Enterprise, so no tier change.
  "addressComponents",
  // R297 (ledger `2026-10-04-photo-references`): the photo REFERENCES (resource names + author
  // attributions), stored with the facts cache entry. An Essentials-tier field, so the call stays
  // billed at Enterprise (the hours field already sets the tier) — pinned by the price test F6.
  "photos",
] as const;

/**
 * Smoke 8 item 2 — the area text, from `addressComponents` ONLY, in this order: `ward`,
 * `sublocality_level_1`, `locality` (each Google component type; duplicates dropped). Every call
 * asks `languageCode=en`, so these are English names even where `formattedAddress` comes back in the
 * local script. Never parsed from the formatted string; no components ⇒ null (§13).
 */
/** R297: how many photo references one Details answer keeps. */
export const PLACES_PHOTO_REFS_MAX = 3;

// R321: the area and address-line rules moved to `@shared/place-address` (CJK dropped, wards canonical).
export { PLACES_AREA_COMPONENT_TYPES, placesAreaText, placesAddressLine } from "@shared/place-address";
/** Atmosphere-tier fields — named so a test can prove the default asks none of them. */
export const PLACES_ATMOSPHERE_FIELDS = [
  "reservable",
  "servesVegetarianFood",
  "servesBeer",
  "servesWine",
  "servesBreakfast",
  "servesLunch",
  "servesDinner",
  "takeout",
  "delivery",
  "dineIn",
  "outdoorSeating",
  "liveMusic",
  "goodForChildren",
  "goodForGroups",
  "allowsDogs",
  "restroom",
  "reviews",
  "editorialSummary",
  "paymentOptions",
  "parkingOptions",
  "accessibilityOptions",
  "fuelOptions",
  "evChargeOptions",
] as const;

/** Pure. The fields a Details call asks for this need, and the SKU tier that bills it. */
export function placesFieldMask(need: ContentNeed): { fields: string[]; sku: PlacesSku } {
  if (need === "dining") return { fields: [...PLACES_BASE_FIELDS, "reservable"], sku: "details_enterprise_atmosphere" };
  return { fields: [...PLACES_BASE_FIELDS], sku: "details_enterprise" };
}

/** The legacy text-search mask: the same fields under `places.`, by need. */
function textSearchMask(need: ContentNeed): string {
  return placesFieldMask(need).fields.map((f) => `places.${f}`).join(",");
}

const DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places/";

const COVERS: ReadonlySet<ContentNeed> = new Set<ContentNeed>(["stop.hours", "dining", "neighbourhood"]);

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

function expiry(fetchedAt: Date, ttlDays: number | null): Date {
  const cap = placesCacheMaxDays();
  const days = ttlDays === null ? cap : Math.min(ttlDays, cap);
  return new Date(fetchedAt.getTime() + days * 86_400_000);
}

export class PlacesAdapter implements SourceAdapter {
  readonly id = "google_places";
  constructor(
    // A GET (Place Details) carries no body — Node's fetch refuses one.
    private readonly fetchImpl: FetchLike = (url, init) =>
      fetch(url, init.method === "GET" ? { method: "GET", headers: init.headers } : (init as any)) as any,
    private readonly apiKey: () => string | undefined = () => process.env.GOOGLE_MAPS_API_KEY,
    private readonly enabled: () => boolean = placesFactsEnabled,
  ) {}

  covers(need: ContentNeed): boolean {
    return this.enabled() && COVERS.has(need);
  }

  attribution(fact: FactDraft) {
    return { sourceName: PLACES_ATTRIBUTION, sourceUrl: fact.sourceUrl, license: "restricted" as const };
  }

  async fetch(req: FetchRequest): Promise<FactDraft[]> {
    const key = this.apiKey();
    if (!this.enabled() || !key) return [];
    const text = [req.query.text, req.query.city].filter(Boolean).join(", ").slice(0, 300);
    if (!text.trim()) return [];
    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": textSearchMask(req.need) },
      body: JSON.stringify({ textQuery: text, maxResultCount: 1, languageCode: "en" }),
    });
    if (!res.ok) throw new Error(`[places] searchText answered ${res.status}`);
    const body = await res.json();
    const p = Array.isArray(body?.places) ? body.places[0] : null;
    return this.draftsFrom(p, req, text, placesTextSearchCostCents());
  }

  /**
   * R-u (surface step 3): resolve a query to Google's PLACE ID — a Text Search asking for `places.id`
   * ONLY (Google's no-charge "IDs Only" SKU). The place ID is the cache key: facts are then reused by
   * ID across every plan, whatever each plan called the place. Null when nothing answers.
   */
  async resolvePlaceId(req: FetchRequest): Promise<string | null> {
    const key = this.apiKey();
    if (!this.enabled() || !key) return null;
    const text = [req.query.text, req.query.city].filter(Boolean).join(", ").slice(0, 300);
    if (!text.trim()) return null;
    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
      body: JSON.stringify({ textQuery: text, maxResultCount: 1, languageCode: "en" }),
    });
    if (!res.ok) throw new Error(`[places] searchText (ids) answered ${res.status}`);
    const body = await res.json();
    const id = Array.isArray(body?.places) ? body.places[0]?.id : null;
    return typeof id === "string" && id ? id : null;
  }

  /** R-u: the BILLED fetch, by place ID (Place Details) — only on a cache miss. */
  async fetchByPlaceId(placeId: string, req: FetchRequest): Promise<FactDraft[]> {
    const key = this.apiKey();
    if (!this.enabled() || !key) return [];
    const text = [req.query.text, req.query.city].filter(Boolean).join(", ").slice(0, 300);
    const mask = placesFieldMask(req.need);
    const res = await this.fetchImpl(`${DETAILS_ENDPOINT}${encodeURIComponent(placeId)}?languageCode=en`, {
      method: "GET",
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask.fields.join(",") },
    });
    if (!res.ok) throw new Error(`[places] details answered ${res.status}`);
    // The cost column follows the call's own SKU tier, and the tier rides each draft for the log.
    const cost = mask.sku === "details_enterprise_atmosphere" ? placesDetailsAtmosphereCostCents() : placesDetailsCostCents();
    return this.draftsFrom(await res.json(), req, text, cost).map((d) => ({ ...d, sku: mask.sku }));
  }

  private draftsFrom(p: any, req: FetchRequest, text: string, cost: number): FactDraft[] {
    const fetchedAt = new Date();
    if (!p?.id) return [];
    const lat = Number(p.location?.latitude);
    const lng = Number(p.location?.longitude);
    const located = Number.isFinite(lat) && Number.isFinite(lng);
    const base = {
      placeRefKind: "place_id" as const,
      placeRef: String(p.id),
      placeLat: located ? lat : null,
      placeLng: located ? lng : null,
      market: req.market,
      origin: "places_api" as const,
      sourceId: null,
      sourceUrl: typeof p.googleMapsUri === "string" ? p.googleMapsUri : null,
      license: "restricted" as const,
      fetchedAt,
    };
    const name = typeof p.displayName?.text === "string" ? p.displayName.text : null;
    const out: FactDraft[] = [];
    // The call's cost rides the FIRST draft only, so a sum over rows is the real spend.
    const push = (d: Omit<FactDraft, keyof typeof base | "costCents">) =>
      out.push({ ...base, ...d, costCents: out.length === 0 ? cost : 0 });
    if (located) {
      // §13: an answer that names no types stores none (never an empty list read as "not a place").
      const types = Array.isArray(p.types) && p.types.length ? p.types.map(String) : null;
      push({ need: req.need, factType: "location", value: { lat, lng, name, query: text, ...(types ? { types } : {}) }, expiresAt: expiry(fetchedAt, factTtlDays("location")) });
    }
    const hours = p.regularOpeningHours?.weekdayDescriptions;
    if (Array.isArray(hours) && hours.length) {
      push({ need: req.need === "dining" ? "dining" : "stop.hours", factType: "hours", value: { weekdayDescriptions: hours.map(String), query: text }, expiresAt: expiry(fetchedAt, factTtlDays("hours")) });
    }
    if (req.need === "dining" && typeof p.reservable === "boolean") {
      // Field-mask ruling: dining asks `reservable` only (no `servesVegetarianFood`).
      const v: Record<string, unknown> = { query: text, reservable: p.reservable };
      push({ need: "dining", factType: "dining_basics", value: v, expiresAt: expiry(fetchedAt, factTtlDays("dining_basics")) });
    }
    // Ledger `2026-09-30-places-address`: the address as Google gave it, both forms kept verbatim; the
    // reader picks formatted → short → the draft's own text. Neither present ⇒ no address fact (§13).
    const formatted = typeof p.formattedAddress === "string" ? p.formattedAddress.trim() : "";
    const short = typeof p.shortFormattedAddress === "string" ? p.shortFormattedAddress.trim() : "";
    const area = placesAreaText(p.addressComponents);
    // R321 S11-11: the line a traveler reads, built from the English components, CJK dropped.
    const addressLine = placesAddressLine(p.addressComponents);
    if (formatted || short || area || addressLine) {
      const v: Record<string, unknown> = { query: text };
      if (formatted) v.formattedAddress = formatted;
      if (short) v.shortFormattedAddress = short;
      if (addressLine) v.addressLine = addressLine;
      if (area) v.area = area;
      push({ need: req.need, factType: "address", value: v, expiresAt: expiry(fetchedAt, factTtlDays("address")) });
    }
    // R297: the photo REFERENCES (never an image) — at most PLACES_PHOTO_REFS_MAX, each with the
    // author attributions Google requires shown beside it. Same place-ID key and TTL as the rest.
    const photos = Array.isArray(p.photos)
      ? p.photos
          .filter((x: any) => typeof x?.name === "string" && x.name)
          .slice(0, PLACES_PHOTO_REFS_MAX)
          .map((x: any) => ({
            name: String(x.name),
            authors: Array.isArray(x.authorAttributions)
              ? x.authorAttributions
                  .map((a: any) => ({ displayName: typeof a?.displayName === "string" ? a.displayName : "", uri: typeof a?.uri === "string" ? a.uri : null }))
                  .filter((a: { displayName: string }) => a.displayName)
              : [],
          }))
      : [];
    if (photos.length) {
      push({ need: req.need, factType: "photo_ref", value: { photos, query: text }, expiresAt: expiry(fetchedAt, factTtlDays("photo_ref")) });
    }
    // A located place with nothing else still cost a call — record it on a location row; a place
    // with no coordinates and no facts records nothing (there is nothing true to keep).
    return out;
  }
}

/**
 * The registry lookup (brief §6). In A5 the only adapter is the Places spine, held by env switch
 * rather than a `content_sources` row: the registry surface that registers sources is A6, and a
 * deploy never adds one. When A6 lands, the spine moves under its registry row.
 */
export function sourcesForNeed(need: ContentNeed, market: string | null, adapters: SourceAdapter[] = [new PlacesAdapter()]): SourceAdapter[] {
  return adapters.filter((a) => a.covers(need, market));
}
