/**
 * draft-facts-check.ts — THE rule that an AI-drafted platform post may state no number and no link
 * its facts do not carry (TravelPulse PR 3's checker, generalised for the blog generator lane —
 * ledger `2026-09-30-blog-event-guide`; §18 rule 1: one rule, every generator calls it).
 *
 * Every number (a digit run, a decimal kept whole) in the draft must appear as one in the facts (leading zeros
 * ignored, so "09" and "9" are one number). A draft that invents one is REFUSED WHOLE by the caller,
 * never trimmed. Every http(s) link in the draft must be one of the facts' own links, so a model can
 * never add a URL — a resale host least of all (R208).
 */

const DIGITS = /\d+(?:\.\d+)?/g;
const LINK = /https?:\/\/[^\s)\]>"']+/g;

const norm = (d: string) => d.replace(/^0+(?=\d)/, "");

/** The digit runs a fact set carries, normalised. Walks every string/number in the value. */
export function numbersInFacts(facts: unknown, extra: readonly (string | number)[] = []): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => {
    for (const m of s.match(DIGITS) ?? []) out.add(norm(m));
  };
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "number" || typeof v === "string") add(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(facts);
  extra.forEach((e) => add(String(e)));
  return out;
}

/** The first number in `text` the allowed set does not carry, or null when every number is a fact. */
export function firstInventedNumber(text: string, allowed: ReadonlySet<string>): string | null {
  for (const m of text.match(DIGITS) ?? []) if (!allowed.has(norm(m))) return m;
  return null;
}

/** The links a draft states, for comparison with the facts' own links. */
export function linksIn(text: string): string[] {
  return (text.match(LINK) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""));
}

/** The first link in `text` that is not one of `allowedLinks`, or null. */
export function firstForeignLink(text: string, allowedLinks: readonly string[]): string | null {
  const ok = new Set(allowedLinks);
  for (const u of linksIn(text)) if (!ok.has(u)) return u;
  return null;
}
