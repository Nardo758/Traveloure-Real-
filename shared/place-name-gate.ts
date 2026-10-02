/**
 * THE NAMED-PLACE GATE for Places lookups (ledger `2026-09-30-places-named-gate`; decision-maker, from
 * production smoke test 3: "Gate the lookup on a named place: skip items whose title/location carries
 * no proper noun or specific venue, and never attach a fact whose matched name is not present in the
 * item.").
 *
 * Pure, and the ONE home of both halves (§18 rule 1):
 *   · `namedPlaceTokens(item, city)` — the item's DISTINCTIVE words: its title and location with every
 *     generic word (meals, categories, activity verbs, adjectives, stopwords) and the city's own name
 *     removed. None left ⇒ the item names no place ⇒ NO lookup. "Dinner at Local Izakaya" names a
 *     kind of place, not a place; a Text Search for it returns whichever izakaya ranks first, and its
 *     hours would be a fact about somewhere the traveler never chose (§13).
 *   · `matchNamesItem(matchedName, itemTokens)` — a Places answer is attached only when MORE THAN HALF
 *     of the matched place's own distinctive words appear in the item (and at least one does). An
 *     answer naming somewhere else is dropped, never attached.
 *
 * NEGATIVE SPACE, stated: a word list cannot know every generic noun. A generic title using a word
 * not listed here passes the first half — which is why the second half exists: the matched place's
 * name must still be IN the item. Titles are Title Case from the drafter, so capitalisation is not a
 * signal and is not read.
 */

/** Words that describe a KIND of place or activity, never a specific one. Lower-case, ASCII-folded. */
export const GENERIC_PLACE_WORDS: ReadonlySet<string> = new Set([
  // stopwords
  "a", "an", "the", "at", "of", "in", "on", "to", "and", "or", "with", "for", "from", "near", "by",
  "around", "along", "into", "through", "your", "our", "my", "its", "via", "over", "under", "about",
  // meals and times
  "breakfast", "brunch", "lunch", "dinner", "supper", "meal", "snack", "drinks", "coffee", "tea",
  "morning", "afternoon", "evening", "night", "nighttime", "late", "early", "day", "half", "full",
  "sunset", "sunrise", "time", "break", "rest", "free", "leisure",
  // activity verbs and nouns
  "visit", "visiting", "explore", "exploring", "stroll", "strolling", "walk", "walking", "tour",
  "tours", "hike", "hiking", "shopping", "shop", "browse", "wander", "wandering", "see", "sightseeing",
  "experience", "experiences", "ceremony", "class", "workshop", "lesson", "tasting", "cooking",
  "check", "checkin", "checkout", "return", "arrive", "arrival", "depart", "departure", "transfer",
  "travel", "trip", "excursion", "outing", "session", "performance", "show", "viewing", "view",
  "relax", "relaxing", "enjoy", "discover", "try", "go", "head", "stay", "overnight",
  // kinds of place
  "restaurant", "restaurants", "cafe", "café", "bar", "bars", "pub", "bistro", "diner", "eatery",
  "izakaya", "ramen", "sushi", "kaiseki", "tempura", "yakitori", "noodle", "noodles", "food", "street",
  "market", "markets", "stall", "stalls", "hotel", "hostel", "ryokan", "inn", "guesthouse", "lodging",
  "accommodation", "onsen", "spa", "bath", "baths", "temple", "temples", "shrine", "shrines",
  "museum", "museums", "gallery", "garden", "gardens", "park", "parks", "castle", "palace", "station",
  "district", "neighbourhood", "neighborhood", "quarter", "area", "old", "town", "city", "downtown",
  "river", "riverside", "beach", "lake", "mountain", "hill", "forest", "village", "harbour", "harbor",
  "port", "square", "plaza", "alley", "lane", "road", "bridge", "tower", "house", "hall", "center",
  "centre", "mall", "store", "boutique", "sake", "brewery", "winery", "distillery", "teahouse",
  "tea-house", "bakery", "dessert", "sweets", "matcha", "wagashi", "craft", "crafts", "art", "arts",
  // adjectives
  "local", "traditional", "authentic", "famous", "popular", "historic", "historical", "classic",
  "cultural", "scenic", "hidden", "cozy", "cosy", "casual", "fine", "dining", "japanese", "indian",
  "scottish", "portuguese", "colombian", "best", "top", "small", "little", "great", "grand", "new",
  "modern", "private", "guided", "optional", "nearby", "vegetarian", "vegan", "seasonal", "family",
]);

function fold(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Pure. The distinctive words of a text: folded, split, generic words and the city's words removed. */
// Unicode-safe word boundary (ledger `2026-10-02-city-events-venue-relookup` follow-on): a word is a run
// of letters, digits or combining marks in ANY script. The ASCII-only split this replaced dropped every
// non-Latin name — "京都観世会館" had no words at all, so it was never looked up and could never match.
// Marks stay inside the word because NFKD splits a kana's voicing mark off its letter (ジ → シ + ゙).
// Latin diacritics are still folded away first, so "Café" and "Cafe" remain one word.
// Built with the constructor: the tsconfig target rejects the `u` flag on a literal.
const WORD_SPLIT = new RegExp("[^\\p{L}\\p{N}\\p{M}]+", "u");
const ALL_DIGITS = new RegExp("^\\p{N}+$", "u");

export function distinctiveTokens(text: string | null | undefined, city: string | null | undefined): Set<string> {
  const cityWords = new Set(fold(city ?? "").split(WORD_SPLIT).filter(Boolean));
  const out = new Set<string>();
  for (const w of fold(text ?? "").split(WORD_SPLIT)) {
    if (Array.from(w).length < 3 || ALL_DIGITS.test(w)) continue;
    if (GENERIC_PLACE_WORDS.has(w) || cityWords.has(w)) continue;
    out.add(w);
  }
  return out;
}

/**
 * THE PLACE BEING VISITED (smoke test 4, P2 — ledger `2026-10-02-smoke4-draft-fixes`). A drafted title
 * "Fushimi Inari Taisha Alternative: Kiyomizu-dera Temple" names two places; the one the traveler is
 * visiting is the one AFTER "Alternative:". Matching on the whole title let Google's top hit for the
 * first name (Fushimi Inari) pass the gate, and its address and hours were attached to an item that is
 * a visit to Kiyomizu-dera. Pure; returns the title unchanged when it carries no such clause, and the
 * whole title when nothing follows the marker (§13: never an empty name).
 */
const ALTERNATIVE_MARKER = /\balternative\s*:/i;

export function hasAlternativeClause(title: string | null | undefined): boolean {
  return ALTERNATIVE_MARKER.test(title ?? "");
}

export function visitedPlaceTitle(title: string): string {
  const parts = title.split(new RegExp(ALTERNATIVE_MARKER.source, "gi"));
  if (parts.length < 2) return title;
  const visited = parts[parts.length - 1].replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "");
  return visited || title;
}

/**
 * Pure. The item's distinctive words from its title and location. Empty ⇒ the item names no place.
 * A title with an "Alternative:" clause resolves against its VISITED place only — the location field
 * is then not read, because a drafter that wrote two places into a title may have put the other one
 * there (P2).
 */
export function namedPlaceTokens(
  item: { title: string; locationName?: string | null },
  city: string | null | undefined,
): Set<string> {
  if (hasAlternativeClause(item.title)) return distinctiveTokens(visitedPlaceTitle(item.title), city);
  const out = distinctiveTokens(item.title, city);
  distinctiveTokens(item.locationName ?? null, city).forEach((t) => out.add(t));
  return out;
}

/** Pure. The text a Places lookup searches for: the visited place, never the whole two-place title. */
export function placeLookupText(title: string): string {
  return visitedPlaceTitle(title);
}

/** Pure. Does a Places answer's name name THIS item? More than half its distinctive words must be in it. */
export function matchNamesItem(
  matchedName: string | null | undefined,
  itemTokens: ReadonlySet<string>,
  city: string | null | undefined,
): boolean {
  const own = Array.from(distinctiveTokens(matchedName ?? "", city));
  if (own.length === 0) return false;
  const shared = own.filter((t) => itemTokens.has(t)).length;
  return shared >= 1 && shared * 2 > own.length;
}
