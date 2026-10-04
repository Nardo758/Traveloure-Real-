/**
 * AI place and description text is SANITISED AT STORAGE (ruling R-w, decision-maker Oct 3, 2026;
 * surface spec v1.2; ledger `2026-10-03-rw-ai-place-text`). PURE — no I/O.
 *
 * What a model writes about WHERE a stop is, and what it says about it, is unverified. Smoke 6
 * stored "Various locations arranged through Airbnb Experiences or Cookly" as a stop's location, and a
 * "Draft without a place to stay" stored "Hotel Gracery Kyoto Sanjo" and "Hotel breakfast" in its
 * payload. So before ANY of it is written — the item rows AND the stored draft JSON — it is cut to:
 *   · a location is its WARD/AREA only (`unverifiedAreaText` — the one rule the client already used
 *     for display, moved here so storage and display cannot disagree, §18 rule 1);
 *   · no third-party booking platform or brand is named (`THIRD_PARTY_BRANDS`);
 *   · no hotel is named (`namesAHotel`).
 * A segment or sentence that breaks a rule is DROPPED, never rewritten into something the model did
 * not say (§13). What is left may be nothing — and nothing is stored as nothing, never as the city.
 *
 * NEGATIVE SPACE: the brand list is a prompt-hygiene list of the platforms models reach for; it is not
 * the partner registry and grants or denies nothing. A brand it does not name is not caught — the
 * prompt line (`AI_PLACE_PROMPT_LINE`) is the first layer, this strip the second.
 */

/** Words that name an administrative area — a segment carrying one is a ward, district or city. */
const AREA_WORD = /\b(ward|wards|ku|district|prefecture|city|county|borough|province|region|area)\b|-ku\b|-shi\b|-fu\b|-ken\b/i;
/** Street-level words (a road, a block, a numbered lot) — a segment carrying one is never an area. */
const STREET_WORD =
  /\b(street|st|road|rd|avenue|ave|lane|ln|boulevard|blvd|drive|dr|way|alley|path|walk|dori|dōri|doori|chome|chōme|cho|chō|machi|banchi|go)\b|-(dori|dōri|doori|chome|chōme|cho|chō|machi)\b/i;

/**
 * The ward/area part of an UNVERIFIED location string, or null when it names none. Postcodes are
 * removed; then a comma segment with a digit (a lot, a block) or a street word is dropped. The FIRST
 * segment — where a draft puts the venue or its street — is kept only when it names an administrative
 * area or is the whole string ("Gion"); later segments (ward, city, country) are kept. Order is kept.
 */
export function unverifiedAreaText(text: string | null | undefined): string | null {
  const segs = (text ?? "")
    .split(",")
    .map((p) => p.replace(/〒?\s*\d{3}-?\d{4}\b|\b\d{5}(?:-\d{4})?\b/g, "").trim())
    .filter(Boolean);
  const kept = segs.filter((seg, i) => {
    if (/\d/.test(seg) || STREET_WORD.test(seg)) return false;
    return i > 0 || segs.length === 1 || AREA_WORD.test(seg);
  });
  return kept.length ? kept.join(", ") : null;
}

/** Third-party booking platforms and brands a model names in place of a venue. Lower-case. */
export const THIRD_PARTY_BRANDS: readonly string[] = [
  "airbnb",
  "cookly",
  "klook",
  "viator",
  "getyourguide",
  "get your guide",
  "tripadvisor",
  "trip advisor",
  "booking.com",
  "expedia",
  "agoda",
  "hotels.com",
  "trip.com",
  "kkday",
  "tiqets",
  "headout",
  "musement",
  "civitatis",
  "withlocals",
  "eatwith",
  "traveling spoon",
  "rakuten travel",
  "jalan",
  "uber",
  "lyft",
];

export function namesABrand(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase();
  return THIRD_PARTY_BRANDS.some((b) => new RegExp(`(^|[^a-z])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t));
}

/** Lodging words. Any of them names a place to stay. */
const LODGING_WORD = /\b(hotels?|ryokans?|hostels?|inns?|resorts?|guest\s?houses?|minshuku|capsule)\b/i;
/**
 * A NAMED hotel: a lodging word with a capitalised name beside it ("Hotel Gracery", "Mitsui Garden
 * Hotel", "Ryokan Yachiyo"). Generic words ("near your hotel", "hotel breakfast") are not a name.
 */
const NAMED_LODGING =
  /\b(?:Hotel|Ryokan|Hostel|Inn|Resort|Guesthouse|Guest House)\s+[A-Z][\w'’-]*|\b[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*\s+(?:Hotel|Ryokan|Hostel|Inn|Resort|Guesthouse|Guest House)\b/;

export function namesAHotel(text: string | null | undefined): boolean {
  return NAMED_LODGING.test(text ?? "");
}

/** Mentions lodging at all — used only where the traveler has NO place to stay. */
export function mentionsLodging(text: string | null | undefined): boolean {
  return LODGING_WORD.test(text ?? "");
}

/** Words that say the model named no venue ("Various locations", "arranged through …"). */
const NO_VENUE = /\b(various|multiple|several)\s+(locations?|venues?|places?)\b|\barranged\s+(through|via|by)\b|\bbooked\s+(through|via|on)\b|\b(depends|varies)\b/i;

/**
 * An AI-written location, sanitised: segments that name a brand, a hotel or no venue at all are
 * dropped, then the rest is cut to its ward/area. Null ⇒ nothing true is left to store.
 */
export function sanitizeAiLocation(text: string | null | undefined, city?: string | null): string | null {
  // The plan's own city is an area, wherever it sits in the string ("Kyoto, Japan" stays "Kyoto,
  // Japan" — the first-segment rule would otherwise cut a city to its country).
  const cityName = (city ?? "").split(",")[0].trim().toLowerCase();
  const once = (t: string | null | undefined) => {
    const segs = (t ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !namesABrand(s) && !namesAHotel(s) && !NO_VENUE.test(s));
    if (cityName && segs.length > 1 && segs[0].toLowerCase() === cityName) {
      const rest = unverifiedAreaText(segs.slice(1).join(", "));
      return rest ? `${segs[0]}, ${rest}` : segs[0];
    }
    return unverifiedAreaText(segs.join(", "));
  };
  // To a fixed point: dropping a numbered lot can promote a street descriptor to the first segment
  // ("541 Nijocho, Horikawa-nishi-iru, Shimogyo Ward" — the second pass drops "Horikawa-nishi-iru"),
  // and stored text must already be what a second pass would leave (storage runs it twice).
  let cur = once(text);
  for (let i = 0; i < 4; i++) {
    const next = once(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/**
 * AI prose (a description, a tip, a summary), sanitised SENTENCE by sentence: a sentence naming a
 * brand or a hotel — or, when the traveler has no place to stay, mentioning lodging at all — is
 * dropped. Null when nothing is left.
 */
export function sanitizeAiProse(text: string | null | undefined, opts: { noLodging?: boolean } = {}): string | null {
  const src = (text ?? "").trim();
  if (!src) return null;
  const sentences = src.match(/[^.!?]+[.!?]*\s*/g) ?? [src];
  const kept = sentences.filter((s) => !namesABrand(s) && !namesAHotel(s) && !(opts.noLodging && mentionsLodging(s)));
  const out = kept.join("").trim();
  return out || null;
}

/** The draft prompt's location rule (first layer; `sanitizeAiLocation` is the second). */
export const AI_PLACE_PROMPT_LINE =
  "For every location give only the neighbourhood or ward (e.g. \"Higashiyama Ward, Kyoto\"), never a street address. Never name a booking platform or third-party site (Airbnb, Cookly, Klook, Viator, GetYourGuide and the like) and never name a hotel. If an activity has no single venue, leave its location empty.";

/**
 * R-w — a SUPPLY SLOT: an AI-drafted item with no venue of its own (the model named none, or named
 * only a platform / "various locations", which storage now drops). Nothing on it is a place — no
 * stored location, no coordinates — and nothing is booked or linked to a listing yet. DERIVED from
 * the row, never stored (no column: a second copy of the same fact would be free to disagree, §18
 * rule 1). The slip draws such an item as a slot to fill ("Find a host") in a later surface step.
 */
export function isSupplySlot(item: {
  origin?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
  bookingId?: string | null;
}): boolean {
  const blank = (v: unknown) => v == null || String(v).trim() === "";
  return (
    item.origin === "ai" &&
    blank(item.locationName) &&
    blank(item.locationAddress) &&
    (blank(item.latitude) || blank(item.longitude)) &&
    blank(item.providerServiceId) &&
    blank(item.affiliateProductId) &&
    blank(item.bookingId)
  );
}

/**
 * Is this location text ONLY an area (a ward, a district, a city)? True when the area cut keeps
 * all of it — nothing street-level or venue-like was there to drop. Used so an area is never
 * geocoded as if it were a place (ledger `2026-10-03-no-ward-pins`).
 */
export function isAreaOnlyLocation(text: string | null | undefined): boolean {
  const norm = (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  if (!norm) return false;
  return unverifiedAreaText(norm) === norm;
}

/**
 * SMOKE 7 (ledger `2026-10-03-no-ward-pins`): are an item ROW's own coordinates a real place? Not
 * for an AI stop whose stored location is only an AREA — R-w stores that, and the only thing that
 * could have put coordinates on such a row is a geocode of the ward or the city (the centroid smoke 7
 * showed as pins). Such a stop is located ONLY by Google: its Places location fact. Every reader of
 * "is this stop located" asks this ONE predicate — the plancard's pins and its "N of M located",
 * plan-fit, the coordinate backfill and "Build my days around this" (§18 rule 1).
 */
export function rowCoordinatesTrusted(item: {
  origin?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
}): boolean {
  if (item.origin !== "ai") return true;
  const own = [item.locationName, item.locationAddress].filter((v) => (v ?? "").trim());
  // No location at all ⇒ nothing was geocoded from an area; whatever coordinate the row holds came
  // from elsewhere (a listing, a placement) and is not a centroid.
  if (own.length === 0) return true; // a venue-less AI stop has no place of its own
  return !own.every((v) => isAreaOnlyLocation(v));
}

/**
 * Ledger `2026-10-03-no-ward-pins` (smoke 7): an activity whose row coordinate is not trusted takes
 * its pin from Google's own `location` fact (origin `places_api`) — never a centroid, and never
 * copied onto the row (LD 57). Such a pin is marked `pinSource: "places"`. "Build my days around
 * this" is offered on it: the promote reads the same live fact and stores no coordinate (ledger
 * `2026-10-03-build-around-places`). Pure; mutates nothing — returns new day objects.
 */
export function applyGooglePins<
  A extends { id: string; lat: number | null; lng: number | null },
  D extends { activities: A[] },
>(days: D[], placeFacts: Record<string, Array<{ factType: string; origin: string; value: Record<string, unknown> }>>): D[] {
  return days.map((d) => ({
    ...d,
    activities: d.activities.map((a) => {
      if (a.lat != null && a.lng != null) return a;
      const loc = (placeFacts[a.id] ?? []).find((f) => f.factType === "location" && f.origin === "places_api");
      const lat = Number(loc?.value?.lat);
      const lng = Number(loc?.value?.lng);
      if (!loc || !Number.isFinite(lat) || !Number.isFinite(lng)) return a;
      return { ...a, lat, lng, pinSource: "places" as const };
    }),
  }));
}

// ── Smoke 9 S9-8 (extends R-w; ledger `2026-10-04-smoke9-addendum`) ────────────────────────────────
//
// A drafted title naming a FESTIVAL / MATSURI / EVENT is a claim that something is ON while the
// traveler is there. The model cannot know that, so the title stands only when an R-p event fact (a
// crawled `event` fact from an official, public_ok source — `isOfficialPublicFact`) COVERS the trip's
// dates; otherwise it is reduced to its non-event fallback, and with no fallback the item becomes a
// SUPPLY SLOT (no venue, no event name). Never rewritten into words the model did not write (§13): the
// fallback is one of the model's own alternatives, picked whole.

/** Words that name an event in a title. */
const EVENT_WORD = /\b(festivals?|matsuri|events?)\b|matsuri\b/i;

export function namesAnEvent(text: string | null | undefined): boolean {
  return EVENT_WORD.test(text ?? "");
}

/**
 * The model's own non-event alternative in a two-option title, or null. Splits on " or ", " / " and
 * "Alternative:" (the shapes drafts use), and returns the FIRST part that names no event.
 * "Gion Matsuri Festival grounds or Gion walking tour" → "Gion walking tour".
 */
export function eventFallbackTitle(title: string | null | undefined): string | null {
  const parts = String(title ?? "")
    .split(/\s+or\s+|\s+\/\s+|\s*\balternative:\s*/i)
    .map((p) => p.trim().replace(/^[-–—:,;]+|[-–—:,;]+$/g, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return parts.find((p) => !namesAnEvent(p)) ?? null;
}

/** An event the plan may name: its name (from the fact) — only facts already proven to cover the dates. */
export interface CoveringEvent {
  name: string;
}

const tokens = (s: string) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !EVENT_WORD.test(t));

/** Does a covering event name this title? Every distinctive word of the event's name is in the title. */
export function titleNamesCoveredEvent(title: string, covering: readonly CoveringEvent[]): boolean {
  const have = new Set(tokens(title));
  return covering.some((e) => {
    const need = tokens(e.name);
    return need.length > 0 && need.every((t) => have.has(t));
  });
}

/** The title an event-naming drafted item may keep, or `{ supplySlot: true }`. Non-event titles pass through. */
export function reduceUncoveredEvent(
  title: string,
  covering: readonly CoveringEvent[],
): { title: string; reduced: boolean; supplySlot: boolean } {
  if (!namesAnEvent(title) || titleNamesCoveredEvent(title, covering)) return { title, reduced: false, supplySlot: false };
  const fallback = eventFallbackTitle(title);
  if (fallback) return { title: fallback, reduced: true, supplySlot: false };
  return { title: SUPPLY_SLOT_EVENT_TITLE, reduced: true, supplySlot: true };
}

/** The title of an event-named item with no fallback: a slot to fill, naming no event. */
export const SUPPLY_SLOT_EVENT_TITLE = "Open slot — something local";

/**
 * Pure. Does an event fact's value cover the trip's dates? Only STRUCTURED dates count
 * (`startDate`/`endDate`, "YYYY-MM-DD"); a fact with none covers nothing — its prose is never parsed
 * into a date (§13). Covers = the event's window overlaps the trip's.
 */
export function eventFactCoversDates(value: unknown, tripStart: string | null | undefined, tripEnd: string | null | undefined): boolean {
  const v = (value ?? {}) as Record<string, unknown>;
  const iso = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null);
  const s = iso(v.startDate);
  const e = iso(v.endDate) ?? s;
  const ts = iso(tripStart);
  const te = iso(tripEnd) ?? ts;
  if (!s || !e || !ts || !te) return false;
  return s <= te && e >= ts;
}

/** The draft prompt's event rule (first layer; `reduceUncoveredEvent` at storage is the second). */
export function aiEventPromptLine(tripStart: string | null | undefined, tripEnd: string | null | undefined, listed: readonly CoveringEvent[]): string {
  const dates = tripStart && tripEnd ? `The trip runs ${tripStart} to ${tripEnd}. ` : "";
  const list = listed.length ? `Events confirmed on those dates: ${listed.map((e) => e.name).join("; ")}.` : "No events are confirmed on those dates.";
  return `${dates}No festivals or events unless listed here. ${list} Never title a stop after a festival, matsuri or event that is not listed.`;
}


// ── Smoke 10 S10-7 (ledger `2026-10-04-smoke10-fixes`) ─────────────────────────────────────────────
/**
 * The drafting prompt's meal windows — breakfast before 09:30, lunch 11:30–14:30, dinner from 17:30.
 * A PROMPT rule only: nothing on the server renames or re-times a drafted meal (decision-maker,
 * smoke 10). Stated once; the prompt reads this line.
 */
export const AI_MEAL_WINDOWS = {
  breakfast: { before: "09:30" },
  lunch: { from: "11:30", to: "14:30" },
  dinner: { from: "17:30" },
} as const;
export const AI_MEAL_PROMPT_LINE =
  `Meal times: breakfast starts before ${AI_MEAL_WINDOWS.breakfast.before}, lunch between ${AI_MEAL_WINDOWS.lunch.from} and ${AI_MEAL_WINDOWS.lunch.to}, ` +
  `dinner from ${AI_MEAL_WINDOWS.dinner.from} — this applies to the "meals" list AND to any activity that is a meal ("Breakfast at …", "Lunch at …", "Dinner at …"). ` +
  `Never schedule a breakfast late in the morning; if the morning is taken, leave breakfast out.`;
