/**
 * FU-S1-2 — ONE LINK PER STAY CARD (decision-maker rulings, Oct 9, 2026; ledger
 * `2026-10-09-fu-s1-2-stay-link`). Pure: the order and the URL rules. The server half
 * (`server/services/stay-link.service.ts`) reads the provider's site and makes the one live Google call.
 *
 *   ON THE LIST (every card, NO Google call at all):
 *     · `own`  — a stay LISTED ON TRAVELOURE: the website its provider typed on their own intake form;
 *     · `maps` — otherwise "View on Google Maps": a Google Maps URL built from the hotel's name and city
 *                (and a place ID an earlier answer already resolved, when one is stored) — a URL, not a call.
 *   WHEN THE PICKED STAY'S CARD IS OPENED (S1's routed pick only — `GET /api/trips/:tripId/stay-pick/link`):
 *     · `own`    — the provider's site, still no call;
 *     · `google` — Google Places' website for the hotel, from ONE live Details call, never stored;
 *     · `maps`   — Google names no website: the same answer's `googleMapsUri`.
 *   A refused, failed, slow or wrong-hotel answer falls back to the list's own link (§13: never a guess).
 *
 * `google` and `maps` come from Google, so wherever the card draws them it shows the "Google Maps"
 * attribution (`PLACES_ATTRIBUTION`). Partner booking URLs never enter this (§16).
 */

export type StayLinkKind = "own" | "google" | "maps";
export interface StayLink {
  kind: StayLinkKind;
  url: string;
}

/** An http(s) URL, normalised; anything else (javascript:, data:, a bare word, a relative path) ⇒ null. */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  // A provider typing "www.example.com" means the web site; give it a scheme before parsing.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(text)) text = `https://${text}`;
  try {
    const u = new URL(text);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname || !u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** The ONE order (A → B → C). Each input is the raw value from its source; an unsafe one is skipped. */
export function chooseStayLink(input: { own?: unknown; googleWebsite?: unknown; googleMapsUri?: unknown }): StayLink | null {
  const own = safeHttpUrl(input.own);
  if (own) return { kind: "own", url: own };
  const google = safeHttpUrl(input.googleWebsite);
  if (google) return { kind: "google", url: google };
  const maps = safeHttpUrl(input.googleMapsUri);
  if (maps) return { kind: "maps", url: maps };
  return null;
}

/**
 * "View on Google Maps" with no API call: Google's documented Maps URL (`/maps/search/?api=1`), searched by
 * the hotel's name and city, pinned to a place ID when one is already known. Null without a name.
 */
export function googleMapsSearchUrl(name: string | null | undefined, city: string | null | undefined, placeId?: string | null): string | null {
  const q = [name?.trim(), city?.trim()].filter(Boolean).join(", ");
  if (!name?.trim()) return null;
  const params = new URLSearchParams({ api: "1", query: q });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
