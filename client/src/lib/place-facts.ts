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
 * The item's address line (ledger `2026-09-30-places-address`). Pure. ONE chain, in this order:
 * the stored Places `address` fact's `formattedAddress`, then its `shortFormattedAddress` — both
 * shown WITH the Maps attribution beside them — and only then the draft's own location text, which
 * is the plan's words and carries no attribution (§13: an address Google did not give is never
 * labelled as Google's). Nothing at all ⇒ null.
 */
export function itemAddressLine(facts: readonly FactView[] | undefined, draftText: string | null | undefined): ItemAddressLine | null {
  const fact = facts?.find((f) => f.factType === "address");
  const pick = (k: string) => (typeof fact?.value?.[k] === "string" ? String(fact.value[k]).trim() : "");
  const stored = pick("formattedAddress") || pick("shortFormattedAddress");
  if (fact && stored) return { text: stored, provenance: fact.provenance, sourceUrl: fact.sourceUrl };
  const draft = (draftText ?? "").trim();
  return draft ? { text: draft, provenance: null, sourceUrl: null } : null;
}
