/**
 * Where a Fever card says the event is (ledger `2026-10-21-blog-checks-fever-area`).
 * The place line is the Kyoto area name. The street address is never the line. The OpenStreetMap
 * credit is shown only as the exact ODbL sentence the server sends.
 */
import { isPartnerPriced } from "./partner-price";

export const FEVER_CARD_OSM_CREDIT = "© OpenStreetMap contributors";

export function feverCardPlace(event: {
  provider?: unknown;
  priceSource?: unknown;
  areaName?: unknown;
  osmCredit?: unknown;
} | null | undefined): { label: string | null; credit: string | null } | null {
  if (!isPartnerPriced(event)) return null;
  const label = typeof event?.areaName === "string" && event.areaName.trim() ? event.areaName.trim() : null;
  const raw = typeof event?.osmCredit === "string" ? event.osmCredit.trim() : "";
  const credit = raw === FEVER_CARD_OSM_CREDIT ? raw : null;
  return { label, credit };
}
