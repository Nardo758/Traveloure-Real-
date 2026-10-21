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

/**
 * THE ONE LIST (§18 rule 1): each banned phrase as a person reads it (`words`, which the drafting prompts name at
 * runtime — `bannedCopyPromptLine`) and the pattern that finds it. Order matters for removal: "no hidden fees"
 * before "hidden gem".
 */
const BANNED: ReadonlyArray<{ words: string; re: RegExp; rule: "geisha" | "remove" | "trending" }> = [
  { words: "geisha spotting", re: /\bgeisha[\s-]+spotting\b/i, rule: "geisha" },
  { words: "no hidden fees", re: /\bno\s+hidden\s+fees?\b/gi, rule: "remove" },
  { words: "no markup", re: /\bno\s+mark-?ups?\b/gi, rule: "remove" },
  { words: "hidden gem(s)", re: /\bhidden\s+gems?\b/gi, rule: "remove" },
  { words: "secret", re: /\bsecrets?\b/gi, rule: "remove" },
  { words: "insider", re: /\binsiders?(?:['’]s)?\b/gi, rule: "remove" },
  { words: "vetted", re: /\bvetted\b/gi, rule: "remove" },
  { words: "verified", re: /\bverified\b/gi, rule: "remove" },
  { words: "certified", re: /\bcertified\b/gi, rule: "remove" },
  { words: "licensed", re: /\blicensed\b/gi, rule: "remove" },
  { words: "authenticated", re: /\bauthenticated\b/gi, rule: "remove" },
  { words: "trending", re: /\btrending\b/gi, rule: "trending" },
];

const GEISHA = BANNED.find((b) => b.rule === "geisha")!.re;
const REMOVED: readonly RegExp[] = BANNED.filter((b) => b.rule === "remove").map((b) => b.re);
const TRENDING = BANNED.find((b) => b.rule === "trending")!.re;

/** Every banned phrase, for the description rule and the guard. */
const ANY_BANNED: readonly RegExp[] = BANNED.map((b) => new RegExp(b.re.source, "i"));

/**
 * FB-1 step 5 (ledger `2026-10-19-fb1-prompt-cleanup`): the one line every drafting prompt carries, naming the words
 * from THE ONE LIST above — built at runtime, never retyped. Storage-time rewording stays the backstop.
 */
export function bannedCopyPromptLine(): string {
  return `Never use these words or phrases in any title or description: ${BANNED.map((b) => `"${b.words}"`).join(", ")}.`;
}

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
const COMING_SOON = /\bcoming\s+soon\b/i;

const NEVER_SAY_EXTRA: readonly RegExp[] = [
  COMING_SOON,
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

/**
 * SH-1 item 1 (ledger `2026-10-19-sh1-banned-copy`): the SITE never-say list — the THIRD export, used ONLY by the
 * seed / UI / email CI scan (`scripts/check-never-say-copy.ts`). It is deliberately NOT the AI-draft rule above
 * (`containsBannedCopy`, which bans only the phrase "geisha spotting") and not the expert hook's list
 * (`containsNeverSayCopy`); both are unchanged. Phrases the draft list already carries are taken from `BANNED`, never
 * retyped; this list adds "TREND <n>", "geisha sightings", "coming soon", and bare "geisha" and "maiko".
 * Exceptions ("licensed" on legal pages and operator licence fields) live in the scan, not here.
 */
const SITE_FROM_DRAFT_LIST: ReadonlyArray<string> = [
  "vetted", "verified", "certified", "licensed", "authenticated", "hidden gem(s)", "secret", "insider",
  "no hidden fees", "no markup", "trending", "geisha spotting",
];

export const SITE_NEVER_SAY: ReadonlyArray<{ words: string; re: RegExp }> = [
  ...SITE_FROM_DRAFT_LIST.map((words) => {
    const entry = BANNED.find((b) => b.words === words);
    if (!entry) throw new Error(`SITE_NEVER_SAY: "${words}" is not on the draft list`);
    return { words, re: new RegExp(entry.re.source, "i") };
  }),
  { words: "TREND <n>", re: /\btrend\s+\d+\b/i },
  { words: "geisha sightings", re: /\bgeisha\s+sightings?\b/i },
  { words: "coming soon", re: new RegExp(COMING_SOON.source, "i") },
  { words: "geisha", re: /\bgeishas?\b/i },
  { words: "maiko", re: /\bmaikos?\b/i },
];

/** The site never-say phrases a text carries (their `words`), in list order; empty when it carries none. */
export function siteNeverSayHits(text: string | null | undefined): string[] {
  const t = String(text ?? "");
  return SITE_NEVER_SAY.filter((e) => e.re.test(t)).map((e) => e.words);
}

export function containsSiteNeverSay(text: string | null | undefined): boolean {
  return siteNeverSayHits(text).length > 0;
}

/**
 * Phrases that are not on the draft list or the site scan. They stay out of `BANNED` and
 * `SITE_NEVER_SAY` so item titles and the seed scan keep their own rules.
 */
const BLOG_ONLY: ReadonlyArray<{ words: string; re: RegExp }> = [
  { words: "back alley", re: /\bback[\s-]+alleys?\b/i },
  { words: "illuminations", re: /\billuminations?\b/i },
];

function draftSource(words: string): string {
  const entry = BANNED.find((b) => b.words === words);
  if (!entry) throw new Error(`SURFACE_COPY_REFUSALS: "${words}" is not on the draft list`);
  return entry.re.source;
}

function siteSource(words: string): string {
  const entry = SITE_NEVER_SAY.find((b) => b.words === words);
  if (!entry) throw new Error(`SURFACE_COPY_REFUSALS: "${words}" is not on the site list`);
  return entry.re.source;
}

function blogOnlySource(words: string): string {
  const entry = BLOG_ONLY.find((b) => b.words === words);
  if (!entry) throw new Error(`SURFACE_COPY_REFUSALS: "${words}" is not a blog-only pattern`);
  return entry.re.source;
}

/**
 * A currency amount or a percent beside a fee, commission, or earnings word, in either order,
 * inside one sentence. A bare number with neither a currency mark nor a percent is not a claim.
 */
const FEE_OR_EARNINGS_AMOUNT = String.raw`(?:\b(?:fees?|commissions?|earn(?:ed|ing|ings)?)\b[^.\n]{0,40}?(?:(?:[$€£¥]|\b(?:USD|EUR|GBP|JPY)\b)\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:%|percent|\b(?:USD|EUR|GBP|JPY)\b))|(?:(?:[$€£¥]|\b(?:USD|EUR|GBP|JPY)\b)\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:%|percent|\b(?:USD|EUR|GBP|JPY)\b))[^.\n]{0,40}?\b(?:fees?|commissions?|earn(?:ed|ing|ings)?)\b)`;

/**
 * The ONE list a platform blog and a feed activity title are refused for
 * (ledger `2026-10-21-blog-fever-followup`). Every phrase that already has a pattern takes that
 * pattern's source — `BANNED`, then `SITE_NEVER_SAY`, then the two blog-only patterns — and is not
 * spelled again. `checkPlatformDraft` and `publishPost` read it through `blogBannedHits`. The feed
 * title filter reads the same array. Nothing here is added to the item-title sanitizer or the site scan.
 */
export const SURFACE_COPY_REFUSALS: readonly { words: string; source: string }[] = [
  { words: "vetted", source: draftSource("vetted") },
  { words: "verified", source: draftSource("verified") },
  { words: "certified", source: draftSource("certified") },
  { words: "licensed", source: draftSource("licensed") },
  { words: "authenticated", source: draftSource("authenticated") },
  { words: "hidden gem(s)", source: draftSource("hidden gem(s)") },
  { words: "secret", source: draftSource("secret") },
  { words: "insider", source: draftSource("insider") },
  { words: "no hidden fees", source: draftSource("no hidden fees") },
  { words: "no markup", source: draftSource("no markup") },
  { words: "trending", source: draftSource("trending") },
  { words: "TREND", source: `(?:${siteSource("TREND <n>")}|\\btrend\\b)` },
  { words: "geisha", source: siteSource("geisha") },
  { words: "maiko", source: siteSource("maiko") },
  { words: "geiko", source: String.raw`\bgeikos?\b` },
  { words: "spotting/sightings", source: String.raw`\b(?:spotting|sightings?)\b` },
  { words: "back alley", source: blogOnlySource("back alley") },
  { words: "coming soon", source: siteSource("coming soon") },
  { words: "illuminations", source: blogOnlySource("illuminations") },
  { words: "fee or earnings amount", source: FEE_OR_EARNINGS_AMOUNT },
];

function refusalPattern(source: string, flags: string): RegExp {
  return new RegExp(source, flags);
}

/** The shared-list phrases a text carries, in list order. Empty when it carries none. */
export function blogBannedHits(text: string | null | undefined): string[] {
  const t = String(text ?? "");
  const hits: string[] = [];
  for (const entry of SURFACE_COPY_REFUSALS) {
    if (refusalPattern(entry.source, "i").test(t)) hits.push(entry.words);
  }
  return hits;
}

/** Drop shared-list phrases from a feed title and tidy what remains. An untouched string is returned as it was. */
export function stripSurfaceCopy(text: string | null | undefined): string {
  const original = String(text ?? "");
  if (!original) return "";
  let t = original;
  let hit = false;
  for (const entry of SURFACE_COPY_REFUSALS) {
    const next = t.replace(refusalPattern(entry.source, "gi"), " ");
    if (next !== t) hit = true;
    t = next;
  }
  if (!hit) return original;
  t = t.replace(/\b(?:and|with|of|in|at|to|for|the|a|an)\b(?=\s*[,:;!?.])/gi, " ");
  const out = tidy(t);
  if (!/[A-Za-z0-9]/.test(out)) return "";
  if (/^(?:a|an|the|and|with|of|in|at|to|for)$/i.test(out)) return "";
  return out;
}

/**
 * Feed title filter. The activity's title and name are cleaned with `stripSurfaceCopy`. The card is
 * omitted when a name was present and nothing of it remains, or when only a title was present and
 * nothing of it remains.
 */
export function filterFeedActivity<T extends { name?: unknown; title?: unknown }>(record: T): T | null {
  if (!record || typeof record !== "object") return record;
  const out = { ...record } as T & { name?: unknown; title?: unknown };
  if (typeof record.title === "string") out.title = stripSurfaceCopy(record.title);
  if (typeof record.name === "string") out.name = stripSurfaceCopy(record.name);
  const hadName = typeof record.name === "string";
  const hadTitle = typeof record.title === "string";
  const name = typeof out.name === "string" ? out.name.trim() : "";
  const title = typeof out.title === "string" ? out.title.trim() : "";
  if (hadName && !name) return null;
  if (!hadName && hadTitle && !title) return null;
  return out;
}

/**
 * G-02 (ledger `2026-10-20-g02-g06-copy`): phrases a partner / affiliate activity card never shows.
 * The patterns are THE existing draft-list entries for "hidden gem(s)" and "secret", plus the site
 * never-say "geisha" rule (which covers "geisha culture"). No new word list. A fresh RegExp per
 * call — the shared ones are stateful under /g.
 */
const PARTNER_CARD_PHRASE_SOURCES: readonly string[] = [
  BANNED.find((b) => b.words === "hidden gem(s)")!.re.source,
  BANNED.find((b) => b.words === "secret")!.re.source,
  SITE_NEVER_SAY.find((e) => e.words === "geisha")!.re.source,
];

/** Drop those phrases and tidy what remains. An untouched string is returned as it was. */
export function stripPartnerCardPhrase(text: string | null | undefined): string {
  const original = String(text ?? "");
  if (!original) return "";
  let t = original;
  let hit = false;
  for (const source of PARTNER_CARD_PHRASE_SOURCES) {
    const next = t.replace(new RegExp(source, "gi"), " ");
    if (next !== t) hit = true;
    t = next;
  }
  if (!hit) return original;
  // A joiner left glued to the sentence's punctuation ("and.") is not a word.
  t = t.replace(/\b(?:and|with|of|in|at|to|for|the|a|an)\b(?=\s*[,:;!?.])/gi, " ");
  const out = tidy(t);
  if (!/[A-Za-z0-9]/.test(out)) return "";
  // A lone article left behind ("a secret" → "A") is not a card.
  if (/^(?:a|an|the|and|with|of|in|at|to|for)$/i.test(out)) return "";
  return out;
}

const SKIP_STRING_KEY = /(url|uri|href|src|token|password|email|phone)$/i;

function skipPartnerStringKey(key: string | undefined): boolean {
  if (!key) return false;
  if (SKIP_STRING_KEY.test(key)) return true;
  if (/(?:Id|ID|Url|URL|Code)$/.test(key) || key === "id" || key === "slug" || key === "currency") return true;
  // Image addresses are not card copy. A hyphen is a word boundary, so "secret-garden.jpg" would otherwise be rewritten.
  return /image|cover|photo|logo|icon|media|avatar/i.test(key);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function stripPartnerStrings(value: unknown, key?: string): unknown {
  if (typeof value === "string") return skipPartnerStringKey(key) ? value : stripPartnerCardPhrase(value);
  if (Array.isArray(value)) return value.map((item) => stripPartnerStrings(item)).filter((item) => item !== "");
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripPartnerStrings(v, k);
    return out;
  }
  return value;
}

/**
 * Public partner/activity copy with those phrases removed. Returns null when a name or a title
 * was present and nothing of either remains — the card is omitted, not shown blank.
 */
export function sanitizePartnerCardCopy<T>(record: T): T | null {
  if (!record || typeof record !== "object") return record;
  const src = record as { name?: unknown; title?: unknown };
  const out = stripPartnerStrings(record) as { name?: unknown; title?: unknown };
  const hadName = typeof src.name === "string";
  const hadTitle = typeof src.title === "string";
  const name = typeof out.name === "string" ? out.name.trim() : "";
  const title = typeof out.title === "string" ? out.title.trim() : "";
  if (hadName && !name) return null;
  if (!hadName && hadTitle && !title) return null;
  return out as T;
}
