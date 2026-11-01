/**
 * Row 305 (CS-3 brief 8, D): catalogue single-search. Pure rules, no database and no network.
 *
 * One search box over the catalogue a traveler can act on: our own listings, places with checked facts,
 * official sites, Viator (link-out only) and hotels (links only). Every result carries EXACTLY ONE action:
 *   · `book`          — our own provider's listing, bookable with us (never a partner);
 *   · `book_on_site`  — a link out to the partner's or the official site;
 *   · `add_to_plan`   — nothing to book here; the result can still be added to the plan.
 * Every result also carries the body the existing add-to-plan rail takes, so any result can be added.
 *
 * Never: a "Request this booking" action (it returns only if row 298 unparks), a traveler fee line, a stored
 * Viator price / review / rating / photo, GetYourGuide or Booking.com, anything stored from Travelpayouts,
 * or Google Places data feeding a result.
 */

/** The approved strings (Leon, Oct 31, 2026, 8:51 PM ET). The client fills `{city}`. */
export const CATALOGUE_SEARCH_COPY = {
  placeholder: (city: string) => `Search places, tours and tickets in ${city}`,
  empty: "Nothing matched. Try another word, or browse the city page.",
} as const;

export const CATALOGUE_RESULT_KINDS = ["listing", "checked_place", "official_site", "partner_viator", "hotel"] as const;
export type CatalogueResultKind = (typeof CATALOGUE_RESULT_KINDS)[number];

export const CATALOGUE_ACTION_TYPES = ["book", "book_on_site", "add_to_plan"] as const;
export type CatalogueActionType = (typeof CATALOGUE_ACTION_TYPES)[number];

export type CatalogueAction =
  | { type: "book"; href: string }
  | { type: "book_on_site"; site: string; href: string }
  | { type: "add_to_plan" };

/** The add-to-plan body for the existing rail (`POST /api/trips/:tripId/itinerary-items`). */
export interface CatalogueAddToPlan {
  title: string;
  providerServiceId?: string;
  viatorProductCode?: string;
  locationName?: string;
}

export interface CatalogueCheckedLine {
  sourceName: string;
  sourceUrl: string;
  /** "checked 1 Oct 2026", from the one public attribution rule. */
  checked: string;
}

export interface CatalogueResult {
  id: string;
  kind: CatalogueResultKind;
  title: string;
  action: CatalogueAction;
  addToPlan: CatalogueAddToPlan;
  /** Who the result comes from, shown beside it (e.g. "Viator"). */
  attribution?: string;
  /** A checked place's newest live, attributed fact. */
  checked?: CatalogueCheckedLine;
  /** A place whose facts have all expired: shown as not checked yet, with the official site when known. */
  notChecked?: { officialUrl: string | null };
  /** Viator only: the LIVE price as read now. Never stored. */
  livePrice?: { amount: number; currency: string; asOf: string };
}

/** The response. `results` is empty when nothing matched; the client shows `CATALOGUE_SEARCH_COPY.empty`. */
export interface CatalogueSearchResponse {
  city: string | null;
  query: string;
  results: CatalogueResult[];
}

/** Which action a result kind may carry. A listing is the only kind that may say `book`. */
const ALLOWED: Record<CatalogueResultKind, readonly CatalogueActionType[]> = {
  listing: ["book", "add_to_plan"],
  checked_place: ["add_to_plan"],
  official_site: ["book_on_site", "add_to_plan"],
  partner_viator: ["book_on_site"],
  // Hotels are links only (CN-1): never booked here.
  hotel: ["add_to_plan"],
};

export function actionAllowedFor(kind: CatalogueResultKind, action: CatalogueAction): boolean {
  return ALLOWED[kind].includes(action.type);
}

/** The partners a result may name; GetYourGuide and Booking.com are excluded by ruling. */
export const CATALOGUE_EXCLUDED_PARTNERS = ["getyourguide", "booking.com", "booking"] as const;

/** The longest query the server reads; longer input is cut, never refused. */
export const CATALOGUE_QUERY_MAX = 80;
/** Fewer characters than this matches nothing (a one-letter search is noise). */
export const CATALOGUE_QUERY_MIN = 2;
/** At most this many results from each source. */
export const CATALOGUE_PER_SOURCE_LIMIT = 10;

export function normalizeCatalogueQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, CATALOGUE_QUERY_MAX);
}

/** Case-insensitive "the text contains the query". */
export function catalogueMatches(text: string | null | undefined, query: string): boolean {
  if (!text || !query) return false;
  return text.toLocaleLowerCase("en").includes(query.toLocaleLowerCase("en"));
}

/**
 * The response the server sends: results in source order, each with exactly one allowed action, no excluded
 * partner, and no duplicate id. A result that breaks a rule is dropped, never repaired into something else.
 */
export function assembleCatalogueResults(groups: ReadonlyArray<ReadonlyArray<CatalogueResult>>): CatalogueResult[] {
  const seen = new Set<string>();
  const out: CatalogueResult[] = [];
  for (const group of groups) {
    for (const r of group.slice(0, CATALOGUE_PER_SOURCE_LIMIT)) {
      if (!actionAllowedFor(r.kind, r.action)) continue;
      const named = `${r.attribution ?? ""} ${r.action.type === "book_on_site" ? r.action.site : ""}`.toLowerCase();
      if (CATALOGUE_EXCLUDED_PARTNERS.some((p) => named.includes(p))) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}
