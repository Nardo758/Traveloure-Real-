/**
 * SH-1 item 7 (Q7.1): a Fever event's "See current price" opens the partner's page through the TRACKED redirect
 * (`POST /api/content/affiliate-redirect`, `itemType: "booking_token"`). The server resolves the opaque token, records
 * the click and answers the URL; the client never holds a partner link until the traveler asks for it (§16).
 *
 * Not yet shared with the map's PartnerPriceLink (`itemType: "affiliate"`): moving that call would edit a pinned
 * line in `step8b2-map-layout.test.ts`.
 */
import { apiRequest } from "@/lib/queryClient";

export type PartnerPriceItem = { itemId: string; itemType: "booking_token" | "affiliate" };

/** A Fever event shows its price only on the partner's page. */
export function isPartnerPriced(event: { priceSource?: unknown; provider?: unknown } | null | undefined): boolean {
  return event?.priceSource === "partner" || event?.provider === "fever";
}

/** Opens the partner's page in a new tab. Resolves false when the token expired or the request failed. */
export async function openPartnerPrice(item: PartnerPriceItem): Promise<boolean> {
  try {
    const res = await apiRequest("POST", "/api/content/affiliate-redirect", item);
    const data = (await res.json()) as { url?: string };
    if (!data?.url) return false;
    window.open(data.url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
