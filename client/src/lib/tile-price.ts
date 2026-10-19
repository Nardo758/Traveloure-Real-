/**
 * The destination page's price filter and price sorts (moved out of `pages/discover-location.tsx` so it can be tested).
 *
 * SH-1 item 7 (Q7.3): a Fever event's price is the partner's, never ours, so it has no tile price at all — and when
 * the traveler chooses a price band, Fever events are LEFT OUT rather than passed through as "unpriced".
 */
import { isPartnerPriced } from "./partner-price";

export interface PricedTile {
  kind: string;
  data?: any;
}

/** Price bands the popover offers. A tile with NO price is outside the priced domain and is never dropped by a
 *  price filter (§13), except a partner-priced event (Q7.3). */
export const PRICE_OPTIONS: { id: string; label: string; min: number; max: number }[] = [
  { id: "any", label: "Any price", min: 0, max: Number.POSITIVE_INFINITY },
  { id: "under50", label: "Under $50", min: 0, max: 50 },
  { id: "50to150", label: "$50–150", min: 50, max: 150 },
  { id: "over150", label: "$150+", min: 150, max: Number.POSITIVE_INFINITY },
];

/**
 * A tile's price when it carries a REAL one (§13 — never inferred): used by the popover's price filter and price
 * sorts. Editorial tiles (gems, recs, panels) and partner-priced events have no price and return null.
 */
export function extractTilePrice(item: PricedTile): number | null {
  const d: any = item.data ?? {};
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return !isNaN(n) && n > 0 ? n : null;
  };
  switch (item.kind) {
    case "vendor-service":
      return num(d.price);
    case "package":
      return num(d.price);
    case "event":
      if (isPartnerPriced(d)) return null;
      if (d.isFree) return 0;
      return num(d.minPrice);
    case "supply-hotel":
    case "supply-activity":
      return num(d.price) ?? num(d.pricePerNight) ?? num(d.priceFrom);
    default:
      return null;
  }
}

export function priceMatches(item: PricedTile, priceId: string): boolean {
  if (priceId === "any") return true;
  const band = PRICE_OPTIONS.find((o) => o.id === priceId);
  if (!band) return true;
  // Q7.3: a chosen band leaves Fever events out.
  if (item.kind === "event" && isPartnerPriced(item.data)) return false;
  const p = extractTilePrice(item);
  if (p === null) return true; // unpriced tiles are outside the priced domain
  return p >= band.min && p < band.max;
}
