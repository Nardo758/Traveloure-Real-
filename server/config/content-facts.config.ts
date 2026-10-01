/**
 * Content facts — the knobs (content sourcing brief §3/§7; ledger `2026-09-29-a5-draft-open-set`).
 * Config, never a literal at a call site; env-overridable.
 */
import type { FactType } from "@shared/content-facts";

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/**
 * Brief §3 — TTL by fact type, in days. `closure` and `event` expire at their own end date (the
 * adapter sets it); `tip` lasts until superseded (no expiry). A NULL here means "no TTL by type".
 * Override one with `PLACE_FACT_TTL_DAYS_<TYPE>` (e.g. `PLACE_FACT_TTL_DAYS_HOURS=3`).
 */
const TTL_DAYS: Record<FactType, number | null> = {
  hours: 7,
  closure: null,
  price: 14,
  ticketing_rule: 30,
  transit: 30,
  event: null,
  description: 90,
  tip: null,
  location: 30,
  dining_basics: 30,
  address: 30,
};

export function factTtlDays(type: FactType): number | null {
  const fallback = TTL_DAYS[type];
  const raw = process.env[`PLACE_FACT_TTL_DAYS_${type.toUpperCase()}`];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Google Places terms: a Places fact is cached for at most 30 days, whatever the type's TTL. */
export function placesCacheMaxDays(): number {
  return Math.min(envNumber("PLACES_CACHE_MAX_DAYS", 30), 30);
}

/**
 * The PLACES SPINE IS OFF until an operator turns it on (`PLACE_FACTS_PLACES_ENABLED=1`) — it needs
 * Places API (New) enabled on the key's Google Cloud project, and every call is a billed request.
 * With the switch off (or no `GOOGLE_MAPS_API_KEY`), nothing calls Google and plans show no Places
 * facts — never a guessed one.
 */
export function placesFactsEnabled(): boolean {
  return process.env.PLACE_FACTS_PLACES_ENABLED === "1" && !!process.env.GOOGLE_MAPS_API_KEY;
}

/** The most Places lookups one free draft may make (brief §7: the free path reads the cache and Places only). */
export function placesLookupsPerDraft(): number {
  return Math.floor(envNumber("PLACES_LOOKUPS_PER_DRAFT", 12));
}

/**
 * What one Text Search call is recorded as costing, in cents (`place_facts.cost_cents`). The field
 * mask asks for opening hours, price level and two atmosphere fields — Google's "Text Search
 * Enterprise + Atmosphere" SKU. The operator confirms the billed rate in the Cloud console.
 */
export function placesTextSearchCostCents(): number {
  return envNumber("PLACES_TEXT_SEARCH_COST_CENTS", 4);
}

/**
 * A6 (3) — fresh-fetch spend caps (ledger `2026-10-01-a6-tavily-extract`; brief §7, decision 3A).
 * A fresh fetch happens only inside a paid run or an expert action (`mayFetchFresh`), and even
 * then it is capped per plan and per day across all sources. A registry row's own
 * `cost_ceiling_cents_per_day` caps that source further. Cents; env-overridable; 0 turns fresh
 * fetching off entirely.
 */
export function freshFetchPlanCapCents(): number {
  return envNumber("CONTENT_FETCH_PLAN_CAP_CENTS", 25);
}
export function freshFetchDayCapCents(): number {
  return envNumber("CONTENT_FETCH_DAY_CAP_CENTS", 300);
}

/** The longest verbatim quote a crawled fact may store (a6-design §4: the 300-char cap). Refused, never trimmed. */
export function factQuoteMaxChars(): number {
  return envNumber("CONTENT_FACT_QUOTE_MAX_CHARS", 300);
}
