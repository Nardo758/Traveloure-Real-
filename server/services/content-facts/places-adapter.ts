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
import type { FactDraft, FetchRequest, SourceAdapter } from "./source-adapter";
import {
  factTtlDays,
  placesCacheMaxDays,
  placesFactsEnabled,
  placesTextSearchCostCents,
} from "../../config/content-facts.config";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  // Smoke 7 (ledger `2026-10-03-no-ward-pins`): the result's types, so a rename can require a point of interest.
  "places.types",
  "places.location",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.priceLevel",
  "places.googleMapsUri",
  "places.reservable",
  "places.servesVegetarianFood",
  // Ledger `2026-09-30-places-address`: the two address fields, and nothing else added.
  "places.formattedAddress",
  "places.shortFormattedAddress",
].join(",");

const COVERS: ReadonlySet<ContentNeed> = new Set<ContentNeed>(["stop.hours", "dining", "neighbourhood"]);

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
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
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init) as any,
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
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: text, maxResultCount: 1, languageCode: "en" }),
    });
    if (!res.ok) throw new Error(`[places] searchText answered ${res.status}`);
    const body = await res.json();
    const p = Array.isArray(body?.places) ? body.places[0] : null;
    const fetchedAt = new Date();
    const cost = placesTextSearchCostCents();
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
      const types = Array.isArray(p.types) ? p.types.map(String) : [];
      push({ need: req.need, factType: "location", value: { lat, lng, name, query: text, types }, expiresAt: expiry(fetchedAt, factTtlDays("location")) });
    }
    const hours = p.regularOpeningHours?.weekdayDescriptions;
    if (Array.isArray(hours) && hours.length) {
      push({ need: req.need === "dining" ? "dining" : "stop.hours", factType: "hours", value: { weekdayDescriptions: hours.map(String), query: text }, expiresAt: expiry(fetchedAt, factTtlDays("hours")) });
    }
    if (typeof p.priceLevel === "string" && p.priceLevel !== "PRICE_LEVEL_UNSPECIFIED") {
      push({ need: req.need, factType: "price", value: { priceLevel: p.priceLevel, query: text }, expiresAt: expiry(fetchedAt, factTtlDays("price")) });
    }
    if (req.need === "dining" && (typeof p.reservable === "boolean" || typeof p.servesVegetarianFood === "boolean")) {
      const v: Record<string, unknown> = { query: text };
      if (typeof p.reservable === "boolean") v.reservable = p.reservable;
      if (typeof p.servesVegetarianFood === "boolean") v.servesVegetarianFood = p.servesVegetarianFood;
      push({ need: "dining", factType: "dining_basics", value: v, expiresAt: expiry(fetchedAt, factTtlDays("dining_basics")) });
    }
    // Ledger `2026-09-30-places-address`: the address as Google gave it, both forms kept verbatim; the
    // reader picks formatted → short → the draft's own text. Neither present ⇒ no address fact (§13).
    const formatted = typeof p.formattedAddress === "string" ? p.formattedAddress.trim() : "";
    const short = typeof p.shortFormattedAddress === "string" ? p.shortFormattedAddress.trim() : "";
    if (formatted || short) {
      const v: Record<string, unknown> = { query: text };
      if (formatted) v.formattedAddress = formatted;
      if (short) v.shortFormattedAddress = short;
      push({ need: req.need, factType: "address", value: v, expiresAt: expiry(fetchedAt, factTtlDays("address")) });
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
