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
