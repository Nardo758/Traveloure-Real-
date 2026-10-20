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

/** A 3-letter source currency, or null when the partner did not state one. Never invents USD. */
export function sourceCurrencyCode(currency: unknown): string | null {
  if (typeof currency !== "string") return null;
  const code = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function positiveAmount(amount: unknown): number | null {
  const n = typeof amount === "number" ? amount : typeof amount === "string" && amount.trim() !== "" ? Number(amount) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A partner amount in its own currency (¥ for JPY). Null when there is no positive amount
 * or the source named no currency — the caller then says "See current price" instead of "$".
 */
export function formatSourceAmount(amount: unknown, currency: unknown): string | null {
  const n = positiveAmount(amount);
  const code = sourceCurrencyCode(currency);
  if (n === null || !code) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "JPY" ? 0 : 2,
    }).format(n);
  } catch {
    return null;
  }
}

/** The price line for a partner activity: source currency, or `unpricedLabel` when the amount has none. */
export function partnerActivityPriceLabel(amount: unknown, currency: unknown, unpricedLabel: string): string | null {
  if (positiveAmount(amount) === null) return null;
  return formatSourceAmount(amount, currency) ?? unpricedLabel;
}

/** Dollar bands compare USD only. A positive amount in any other currency, or with none stated, is outside them. */
export function amountOutsideDollarBand(amount: unknown, currency: unknown): boolean {
  if (positiveAmount(amount) === null) return false;
  return sourceCurrencyCode(currency) !== "USD";
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
