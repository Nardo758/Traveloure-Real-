/**
 * THE PLACE ADDRESS RULES (R321 — smoke 11 S11-10 / S11-11). Pure; read by the Places adapter when
 * it records an address fact, by facts-attach when it adopts Google's area onto an item, and by the
 * client's fact reader — one rule, three callers (§18 rule 1).
 *
 *   · S11-11: an address line is built from Google's ENGLISH `addressComponents` (every call asks
 *     `languageCode=en`), and any component containing CJK script is DROPPED — the formatted address
 *     can still come back in the local script, and a line half in kanji is not one a traveler can
 *     read or a driver can be shown in English.
 *   · S11-10: a ward's name is canonical. Google romanises one ward two ways ("Nakagyou Ward" on one
 *     stop, "Nakagyo" on the next), so two stops in the same ward read as two places. A ward-shaped
 *     component (Google type `ward`, or text ending "Ward" / "-ku") keeps one spelling: macrons and
 *     doubled long vowels collapsed (ō/ou → o, ū/uu → u), and always the "<Name> Ward" form.
 *     STATED LIMIT: the neighbourhood spine (`city_neighborhoods`) carries no ward rows in any market
 *     today, so the canonical spelling is this rule, not a spine lookup; the long-vowel collapse is
 *     applied to ward-shaped components only, never to a street, a venue or a city.
 */

/** CJK ideographs, kana, hangul and full-width forms. */
const CJK = /[　-〿぀-ヿㇰ-ㇿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/;

export function containsCjk(text: string | null | undefined): boolean {
  return typeof text === "string" && CJK.test(text);
}

const WARD_SUFFIX = /(\s+ward|-ku|\s+ku)$/i;

function collapseLongVowels(stem: string): string {
  return stem
    .replace(/[ōŌ]/g, (c) => (c === "Ō" ? "O" : "o"))
    .replace(/[ūŪ]/g, (c) => (c === "Ū" ? "U" : "u"))
    .replace(/ou/g, "o")
    .replace(/uu/g, "u");
}

/** Pure. The canonical "<Name> Ward" for a ward-shaped name; any other text unchanged. */
export function canonicalWardName(text: string, isWardType = false): string {
  const t = text.trim();
  if (!t) return t;
  const suffixed = WARD_SUFFIX.test(t);
  if (!suffixed && !isWardType) return t;
  const stem = collapseLongVowels(t.replace(WARD_SUFFIX, "").trim());
  return stem ? `${stem} Ward` : t;
}

/** Canonicalise each comma part of an area line that names a ward ("Nakagyou Ward, Kyoto"). */
export function canonicalAreaLine(area: string): string {
  const parts: string[] = [];
  for (const raw of area.split(",")) {
    const p = canonicalWardName(raw);
    if (p && !containsCjk(p) && !parts.includes(p)) parts.push(p);
  }
  return parts.join(", ");
}

interface Component {
  longText?: unknown;
  types?: unknown;
}

function componentText(c: Component): string {
  const t = typeof c?.longText === "string" ? c.longText.trim() : "";
  if (!t || containsCjk(t)) return "";
  const isWard = Array.isArray(c?.types) && (c.types as unknown[]).includes("ward");
  return canonicalWardName(t, isWard);
}

/** Area types, most specific first (smoke 8 item 2). */
export const PLACES_AREA_COMPONENT_TYPES = ["ward", "sublocality_level_1", "locality"] as const;

/** Pure. The area text (ward, sublocality, locality) from the components; CJK parts dropped. */
export function placesAreaText(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  const out: string[] = [];
  for (const type of PLACES_AREA_COMPONENT_TYPES) {
    const c = components.find((x: any) => Array.isArray(x?.types) && x.types.includes(type));
    const t = c ? componentText(c) : "";
    if (t && !out.includes(t)) out.push(t);
  }
  return out.length ? out.join(", ") : null;
}

/** Pure (S11-11). The address line, in Google's component order, CJK components dropped. */
export function placesAddressLine(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  const out: string[] = [];
  for (const c of components) {
    if (Array.isArray(c?.types) && c.types.includes("plus_code")) continue;
    const t = componentText(c);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.length ? out.join(", ") : null;
}
