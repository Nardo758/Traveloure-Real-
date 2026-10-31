/**
 * Kyoto gem copy (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 * Approved swaps, and only these, may rewrite stored text: "geisha district" → "district",
 * "back alleys" → "lanes", "back alley" → "lane". "hidden gem(s)" and any remaining "geisha"
 * word are not rewritten and not deleted. The row keeps the original sentence.
 * `description_hidden_at` is what takes that sentence off the card.
 *
 * The migration's regexp is the writer on stored rows. These functions are the same
 * replacements, so the pin can see the two drift.
 */

const HIDDEN_GEM = /\bhidden\s+gems?\b/i;
const GEISHA_WORD = /\bgeishas?\b/i;

/** Approved swaps only. The input's other words, including "hidden gem(s)", stay. */
export function rewordKyotoBannedCopy(input: string | null | undefined): string | null {
  if (input == null) return null;
  return input
    .replace(/\bgeisha\s+district\b/gi, "district")
    .replace(/\bback\s+alleys\b/gi, "lanes")
    .replace(/\bback\s+alley\b/gi, "lane");
}

/**
 * The first banned phrase that has no approved swap, after the swaps are applied.
 * Null means the text can be shown.
 */
export function kyotoUnswappedPhrase(text: string | null | undefined): string | null {
  if (typeof text !== "string" || text.trim() === "") return null;
  const swapped = rewordKyotoBannedCopy(text) ?? "";
  const hidden = swapped.match(HIDDEN_GEM);
  if (hidden) return hidden[0];
  const geisha = swapped.match(GEISHA_WORD);
  if (geisha) return geisha[0];
  return null;
}

export function kyotoCopyNeedsDescriptionHide(
  ...texts: Array<string | null | undefined>
): boolean {
  return texts.some((text) => kyotoUnswappedPhrase(text) != null);
}

/**
 * Row 300a. Phrases removed from Kyoto gem copy. `rewordKyotoBannedCopy` does not
 * touch these — that function stays the approved geisha/alley swaps. This list is
 * what stops the removed lines coming back in a seed or a stored field.
 * "5am" is the Fushimi dawn claim. A Kyoto gem that says 4:30am or 7am is not a hit.
 */
export const KYOTO_REMOVED_PHRASES: readonly { id: string; pattern: RegExp }[] = [
  { id: "5am", pattern: /\b5\s*am\b/i },
  { id: "200 queuing", pattern: /200\s+people\s+queuing|\b200\s+queuing\b/i },
  { id: "best in Japan", pattern: /best\s+in\s+japan|best\s+photo\s+opportunity\s+in\s+all\s+of\s+japan/i },
  { id: "no crowds", pattern: /\bno crowds\b/i },
  { id: "less visited", pattern: /less visited/i },
  { id: "overcrowded", pattern: /overcrowded/i },
  { id: "completely alone", pattern: /completely alone/i },
  { id: "most tourists", pattern: /most tourists only/i },
  { id: "avoiding crowds", pattern: /avoiding crowds/i },
  { id: "most photogenic", pattern: /most photogenic/i },
  { id: "school ¥500", pattern: /school\s*¥\s*500/i },
  { id: "Shimoadachi", pattern: /Shimoadachi/i },
];

/** The first removed phrase still in the text, or null. */
export function kyotoRemovedPhrase(text: string | null | undefined): string | null {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const phrase of KYOTO_REMOVED_PHRASES) {
    const hit = text.match(phrase.pattern);
    if (hit) return phrase.id;
  }
  return null;
}

/** Traveler payload: a flagged row shows no description and no why-text. The row itself is unchanged. */
export function gemCopyForTraveler<T extends { descriptionHiddenAt?: Date | string | null; description?: string | null; whyLocalsLoveIt?: string | null }>(
  row: T,
): T {
  if (row.descriptionHiddenAt == null || row.descriptionHiddenAt === "") return row;
  return { ...row, description: null, whyLocalsLoveIt: null };
}

export interface KyotoUnswappedCopyRow {
  id: string;
  title: string;
  description: string;
  matchedPhrase: string;
  field: "description" | "whyLocalsLoveIt";
}

/**
 * Pull Kyoto gem objects out of a seed or fixture source. A row is reported only when
 * it has a place name and a description or why-text that still matches an unswapped phrase.
 * Neighbourhood blurbs with no place name are not gem rows and are not listed.
 */
export function scanKyotoGemSeedSource(source: string): KyotoUnswappedCopyRow[] {
  const parts = source.split(/(?:"placeName"|placeName):\s*"/);
  const found: Array<{ id: string; placeName: string; description?: string | null; whyLocalsLoveIt?: string | null }> = [];
  for (let i = 1; i < parts.length; i++) {
    const titleEnd = parts[i].indexOf('"');
    if (titleEnd < 0) continue;
    const placeName = parts[i].slice(0, titleEnd);
    const cityPattern = /city:\s*"([^"]+)"|"city":\s*"([^"]+)"/g;
    let city = "";
    let cityMatch: RegExpExecArray | null;
    while ((cityMatch = cityPattern.exec(parts[i - 1])) !== null) {
      city = cityMatch[1] || cityMatch[2] || "";
    }
    if (city.trim().toLowerCase() !== "kyoto") continue;
    const description = readSeedString(parts[i], "description");
    const whyLocalsLoveIt = readSeedString(parts[i], "whyLocalsLoveIt");
    const id = readSeedString(parts[i], "id") ?? "";
    found.push({ id, placeName, description, whyLocalsLoveIt });
  }
  return kyotoUnswappedCopyReport(found);
}

/** Kyoto gem fields that still carry a row-300a removed phrase. One hit per field. */
export function scanKyotoGemRemovedPhrases(source: string): KyotoRemovedPhraseRow[] {
  const parts = source.split(/(?:"placeName"|placeName):\s*"/);
  const out: KyotoRemovedPhraseRow[] = [];
  for (let i = 1; i < parts.length; i++) {
    const titleEnd = parts[i].indexOf('"');
    if (titleEnd < 0) continue;
    const placeName = parts[i].slice(0, titleEnd);
    const cityPattern = /city:\s*"([^"]+)"|"city":\s*"([^"]+)"/g;
    let city = "";
    let cityMatch: RegExpExecArray | null;
    while ((cityMatch = cityPattern.exec(parts[i - 1])) !== null) {
      city = cityMatch[1] || cityMatch[2] || "";
    }
    if (city.trim().toLowerCase() !== "kyoto") continue;
    const fields: Array<["description" | "whyLocalsLoveIt" | "address" | "bestFor", string | null]> = [
      ["description", readSeedString(parts[i], "description")],
      ["whyLocalsLoveIt", readSeedString(parts[i], "whyLocalsLoveIt")],
      ["address", readSeedString(parts[i], "address")],
      ["bestFor", readSeedArray(parts[i], "bestFor")],
    ];
    for (const [field, text] of fields) {
      const matchedPhrase = kyotoRemovedPhrase(text);
      if (matchedPhrase && text) {
        out.push({ placeName, field, matchedPhrase, text });
      }
    }
  }
  return out;
}

export interface KyotoRemovedPhraseRow {
  placeName: string;
  field: "description" | "whyLocalsLoveIt" | "address" | "bestFor";
  matchedPhrase: string;
  text: string;
}

function readSeedString(chunk: string, name: string): string | null {
  const pattern = new RegExp(`(?:"${name}"|${name}):\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = chunk.match(pattern);
  return match ? match[1].replace(/\\"/g, '"') : null;
}

/** The inside of a seed array literal, or null when the field is absent. */
function readSeedArray(chunk: string, name: string): string | null {
  const pattern = new RegExp(`(?:"${name}"|${name}):\\s*\\[([^\\]]*)\\]`);
  const match = chunk.match(pattern);
  return match ? match[1] : null;
}

/** One report line per matching field. The description is the stored text, not a rewrite. */
export function kyotoUnswappedCopyReport(
  rows: Array<{
    id: string;
    placeName: string;
    description?: string | null;
    whyLocalsLoveIt?: string | null;
  }>,
): KyotoUnswappedCopyRow[] {
  const out: KyotoUnswappedCopyRow[] = [];
  for (const row of rows) {
    for (const field of ["description", "whyLocalsLoveIt"] as const) {
      const text = row[field];
      const matchedPhrase = kyotoUnswappedPhrase(text);
      if (matchedPhrase && typeof text === "string") {
        out.push({ id: row.id, title: row.placeName, description: text, matchedPhrase, field });
      }
    }
  }
  return out;
}
