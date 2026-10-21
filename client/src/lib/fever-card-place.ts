/**
 * Where a Fever card says the event is (ledger `2026-10-21-blog-checks-fever-area`).
 * The place line is the Kyoto area name. The street address is never the line. The OpenStreetMap
 * credit is shown only as the exact ODbL sentence the server sends.
 */
import { namedArea } from "@shared/fever-area";
import { isPartnerPriced } from "./partner-price";

export const FEVER_CARD_OSM_CREDIT = "© OpenStreetMap contributors";

/** The approved partner's stored name. Blank and Unknown are omitted; the name is never invented here. */
export function partnerDisplayName(value: unknown): string | null {
  return namedArea(value);
}

export function feverCardPlace(event: {
  provider?: unknown;
  priceSource?: unknown;
  areaName?: unknown;
  osmCredit?: unknown;
} | null | undefined): { label: string | null; credit: string | null } | null {
  if (!isPartnerPriced(event)) return null;
  const label = namedArea(event?.areaName);
  const raw = typeof event?.osmCredit === "string" ? event.osmCredit.trim() : "";
  const credit = raw === FEVER_CARD_OSM_CREDIT ? raw : null;
  return { label, credit };
}
