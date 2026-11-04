/**
 * C-1 (round 2, ledger `2026-11-04-round2-exp-qa`): a gem's stored photo credit, compact. The stored text reads
 * "Author / Site, Licence. Source: <url> License: <url>". The card shows "Author / Site, Licence" with the attribution
 * linked to the source page and the licence name linked to the licence — the same attribution (title, author, source,
 * licence), with no raw URL on the card. A credit in any other shape shows its words with every URL removed (§13: the
 * credit is never dropped, only shortened).
 */
export interface CompactCredit {
  /** "Author / Site" (or the whole text when it has no licence part). */
  who: string;
  /** "CC BY-SA 4.0", or null. */
  licence: string | null;
  sourceUrl: string | null;
  licenceUrl: string | null;
}

const URL_RE = /https?:\/\/\S+/g;

export function compactCredit(raw: string | null | undefined): CompactCredit | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const m = /^(.*?)\.\s*Source:\s*(https?:\/\/\S+)\s*License:\s*(https?:\/\/\S+)\s*$/i.exec(text);
  const head = (m ? m[1] : text.replace(URL_RE, "").replace(/\b(Source|License):\s*/gi, "")).replace(/\s+/g, " ").trim().replace(/[.,;:\s]+$/, "");
  if (!head) return null;
  const comma = head.lastIndexOf(",");
  const who = comma > 0 ? head.slice(0, comma).trim() : head;
  const licence = comma > 0 ? head.slice(comma + 1).trim() || null : null;
  return { who, licence, sourceUrl: m ? m[2] : null, licenceUrl: m ? m[3] : null };
}
