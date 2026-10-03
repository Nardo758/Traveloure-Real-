/**
 * The slip's line for an item's facts (A5; ledger `2026-09-29-a5-draft-open-set`; content sourcing
 * brief §3: a fact is never shown without its provenance). Pure. The facts and their provenance
 * lines are the SERVER's (`placeFacts` on the plancard read); this only picks the words to show.
 *
 * §13: hours are shown for the plan DAY's own weekday, and only when the day has a date — a plan
 * with no dates has no weekday to name, so the hours line is omitted rather than guessed.
 */
import type { FactView } from "@shared/content-facts";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PRICE_LEVEL: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

export interface ItemFactLine {
  text: string;
  provenance: string;
  sourceUrl: string | null;
}

export function itemFactLine(facts: readonly FactView[] | undefined, dateIso: string | null): ItemFactLine | null {
  if (!facts?.length) return null;
  const parts: string[] = [];
  const used: FactView[] = [];
  const hours = facts.find((f) => f.factType === "hours");
  const days = Array.isArray(hours?.value?.weekdayDescriptions) ? (hours!.value.weekdayDescriptions as unknown[]).map(String) : [];
  if (hours && days.length && dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    const weekday = WEEKDAYS[new Date(`${dateIso}T12:00:00Z`).getUTCDay()];
    const line = days.find((d) => d.startsWith(`${weekday}:`));
    if (line) {
      parts.push(line.replace(`${weekday}:`, `${weekday.slice(0, 3)}:`).trim());
      used.push(hours);
    }
  }
  const price = facts.find((f) => f.factType === "price");
  const level = price ? PRICE_LEVEL[String(price.value?.priceLevel ?? "")] : undefined;
  if (price && level) {
    parts.push(level);
    used.push(price);
  }
  const dining = facts.find((f) => f.factType === "dining_basics");
  if (dining) {
    if (dining.value?.reservable === true) parts.push("takes reservations");
    if (dining.value?.servesVegetarianFood === true) parts.push("vegetarian options");
    if (dining.value?.reservable === true || dining.value?.servesVegetarianFood === true) used.push(dining);
  }
  if (!parts.length) return null;
  const first = used[0];
  return { text: parts.join(" · "), provenance: first.provenance, sourceUrl: first.sourceUrl };
}

export interface ItemAddressLine {
  text: string;
  /** The server's provenance line, present ONLY when the address is a stored Places fact. */
  provenance: string | null;
  sourceUrl: string | null;
}

/**
 * The item's address line (ledger `2026-09-30-places-address`; amended smoke 5 item 3, ledger
 * `2026-10-03-smoke5-fixes`). Pure. ONE chain, in this order:
 *   1. a stored address fact CHECKED BY GOOGLE (`origin: "places_api"`) — its `formattedAddress`, then
 *      its `shortFormattedAddress` — shown WITH the Maps attribution beside it. This is the ONLY way a
 *      street-level address reaches the slip;
 *   2. otherwise the item's own location text, shown with no attribution. When the AI wrote it
 *      (`origin: "ai"`) it is UNVERIFIED and is cut to its WARD/AREA (`unverifiedAreaText`): the AI
 *      drafted "Philosopher's Path Walk" at a street that was not the path, so the street is never
 *      printed and the ward still is (§13). Words a person typed (traveler, expert, assistant) are
 *      theirs and are shown as written.
 * Nothing at all ⇒ null.
 */
export function itemAddressLine(
  facts: readonly FactView[] | undefined,
  draftText: string | null | undefined,
  origin?: string | null,
): ItemAddressLine | null {
  const fact = facts?.find((f) => f.factType === "address" && f.origin === "places_api");
  const pick = (k: string) => (typeof fact?.value?.[k] === "string" ? String(fact.value[k]).trim() : "");
  const stored = pick("formattedAddress") || pick("shortFormattedAddress");
  if (fact && stored) return { text: stored, provenance: fact.provenance, sourceUrl: fact.sourceUrl };
  const text = origin === "ai" ? unverifiedAreaText(draftText) : (draftText ?? "").trim() || null;
  return text ? { text, provenance: null, sourceUrl: null } : null;
}

/** The map pin's location line: the same rule as the row's unattributed text (AI ⇒ ward/area only). */
export function pinLocationText(location: string | null | undefined, origin?: string | null): string | null {
  return origin === "ai" ? unverifiedAreaText(location) : (location ?? "").trim() || null;
}

/** Words that name an administrative area — a segment carrying one is a ward, district or city. */
const AREA_WORD = /\b(ward|wards|ku|district|prefecture|city|county|borough|province|region|area)\b|-ku\b|-shi\b|-fu\b|-ken\b/i;
/** Street-level words (a road, a block, a numbered lot) — a segment carrying one is never an area. */
const STREET_WORD =
  /\b(street|st|road|rd|avenue|ave|lane|ln|boulevard|blvd|drive|dr|way|alley|path|walk|dori|dōri|doori|chome|chōme|cho|chō|machi|banchi|go)\b|-(dori|dōri|doori|chome|chōme|cho|chō|machi)\b/i;

/**
 * Pure. The ward/area part of an UNVERIFIED location string, or null when it names none. Postcodes
 * are removed; then a comma segment with a digit (a lot, a block) or a street word is dropped. The
 * FIRST segment — where a draft puts the venue or its street — is kept only when it names an
 * administrative area or is the whole string ("Gion"); later segments (ward, city, country) are kept.
 * Order is kept; nothing is invented.
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
