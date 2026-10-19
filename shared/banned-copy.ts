/**
 * LG-2 Ask 9 (decision-maker, Oct 18, 2026 — ledger `2026-10-18-lg2-banned-phrases`): phrases a generated item's
 * title or description never carries. PURE. Applied at storage time by `server/utils/ai-draft-sanitize.ts` on every
 * drafting path; the rules live here once.
 *
 *   · "geisha spotting" + a place ⇒ "<place> District Walk" ("Geisha Spotting in Gion", "Gion District Stroll &
 *     Geisha Spotting" ⇒ "Gion District Walk");
 *   · "hidden gem(s)", "secret", "insider", "no hidden fees", "no markup" and the five certification words
 *     (vetted, verified, certified, licensed, authenticated) are removed from a title, and the title tidied — the
 *     certification words everywhere, since generated text cannot say whom a word is about;
 *   · "Trending" ⇒ "In season";
 *   · a title left empty falls back to the item's place name alone; with no place name it is left for
 *     regeneration (`null` — the item is not stored), never a placeholder phrase;
 *   · in a description, a sentence carrying any banned phrase is dropped.
 */

const GEISHA = /\bgeisha[\s-]+spotting\b/i;

/** Removed from a title wherever they appear. Order matters: "no hidden fees" before "hidden gem". */
const REMOVED: readonly RegExp[] = [
  /\bno\s+hidden\s+fees?\b/gi,
  /\bno\s+mark-?ups?\b/gi,
  /\bhidden\s+gems?\b/gi,
  /\bsecrets?\b/gi,
  /\binsiders?(?:['’]s)?\b/gi,
  /\b(?:vetted|verified|certified|licensed|authenticated)\b/gi,
];
const TRENDING = /\btrending\b/gi;

/** Every banned phrase, for the description rule and the guard. */
const ANY_BANNED: readonly RegExp[] = [GEISHA, ...REMOVED, TRENDING].map((r) => new RegExp(r.source, "i"));

export function containsBannedCopy(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  return ANY_BANNED.some((r) => r.test(t));
}

const JOINER = /^(?:and|with|&|\+|of|in|at|to|for|the|a|an)$/i;

function tidy(title: string): string {
  let t = title
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,:;!?.])/g, "$1")
    .trim();
  // Joiners and punctuation left dangling at either end ("& Tea House", "Garden Walk &", "of Kyoto").
  for (;;) {
    const before = t;
    t = t.replace(/^[\s&+,:;–—\-·|/]+|[\s&+,:;–—\-·|/]+$/g, "").trim();
    const words = t.split(" ");
    if (words.length > 1 && JOINER.test(words[0])) t = words.slice(1).join(" ");
    const w = t.split(" ");
    if (w.length > 1 && JOINER.test(w[w.length - 1])) t = w.slice(0, -1).join(" ");
    if (t === before) break;
  }
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** The place a "geisha spotting" title is about: "in/around/through <Place>", else the words before "District". */
function geishaPlace(title: string): string | null {
  const m = /\b(?:in|around|through|of)\s+([A-Z][A-Za-z\u00C0-\u024F'’-]*(?:\s+[A-Z][A-Za-z\u00C0-\u024F'’-]*)*)/.exec(title);
  if (m && !GEISHA.test(m[1])) return m[1];
  const d = /^([A-Z][A-Za-z\u00C0-\u024F'’-]*(?:\s+[A-Z][A-Za-z\u00C0-\u024F'’-]*)*?)\s+District\b/.exec(title.trim());
  if (d) return d[1];
  return null;
}

function placeOnly(place: string | null | undefined): string | null {
  const p = String(place ?? "").split(",")[0].trim();
  return p || null;
}

/**
 * A generated title with the banned phrases reworded, or `null` when nothing is left and the item has no place
 * name (left for regeneration). An untouched title is returned as it was.
 */
export function rewordBannedTitle(title: string, placeName?: string | null): string | null {
  if (!containsBannedCopy(title)) return title;
  if (GEISHA.test(title)) {
    const place = (geishaPlace(title) ?? placeOnly(placeName))?.replace(/\s+District$/i, "").trim();
    return place ? `${place} District Walk` : null;
  }
  let t = title;
  for (const r of REMOVED) t = t.replace(r, " ");
  // "In season" goes in after the tidy, which would otherwise read its "In" as a dangling joiner.
  t = t.replace(TRENDING, "\u0001");
  const out = tidy(t).replace(/\u0001/g, "In season").replace(/^in season/, "In season");
  return out || placeOnly(placeName);
}

/** A description with every sentence that carries a banned phrase dropped. */
export function dropBannedSentences(text: string | null | undefined): string {
  const t = String(text ?? "");
  if (!containsBannedCopy(t)) return t;
  return t
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !containsBannedCopy(s))
    .join(" ")
    .trim();
}

/**
 * FB-1 expert hook (decision-maker, Oct 18, 2026 — ledger `2026-10-18-fb1-expert-hook`): the never-say list for the
 * copy WE write on a surface (the hook's lines and button). Every phrase above, plus "coming soon", and no transit-time,
 * live-checking, offline or app claim. A surface's strings are tested against `containsNeverSayCopy`; generated item
 * text keeps the narrower rules above (a title may well name a place's opening hours or a train).
 */
const NEVER_SAY_EXTRA: readonly RegExp[] = [
  /\bcoming\s+soon\b/i,
  // Transit-time claims: a number of minutes or hours, or "N min away / walk / drive / ride".
  /\b\d+\s*(?:min|mins|minutes?|hrs?|hours?)\b/i,
  /\b(?:minutes?|hours?)\s+(?:away|walk|drive|ride|by\s+train)\b/i,
  // Live checking.
  /\blive\b/i,
  /\breal[\s-]?time\b/i,
  /\bchecked\s+(?:just\s+now|today|right\s+now)\b/i,
  /\bup[\s-]to[\s-]the[\s-]minute\b/i,
  // Offline and app claims.
  /\boffline\b/i,
  /\bapps?\b/i,
  /\bdownload\b/i,
];

export function containsNeverSayCopy(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  return containsBannedCopy(t) || NEVER_SAY_EXTRA.some((r) => r.test(t));
}
