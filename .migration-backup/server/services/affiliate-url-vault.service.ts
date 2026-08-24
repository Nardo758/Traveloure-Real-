/**
 * Affiliate-URL vault (§16 closure — "the affiliate URL is deliberately never returned to the
 * client").
 *
 * Live catalog feeds (the /api/catalog/* Travelpayouts endpoints, the experience-catalog search
 * family, TravelPulse booking options, …) are API-feed results, not DB rows — so when a "book"
 * action later reaches the booking-agent rail there is no server-side record to re-derive the
 * partner deep link from. Historically the feeds therefore shipped `affiliateUrl`/`bookingUrl`
 * on every DTO and the rail trusted the client to POST the URL back — the §16 divergence
 * (any user could lift the partner URL from the network tab and book direct, and the rail
 * trusted client-supplied data for the transaction the agent performs, §14-adjacent).
 *
 * This module closes both ends with a short-lived SERVER-SIDE resolution cache:
 *   • At feed-response time, `vaultAndStripItems()` moves each item's partner URL into the
 *     shared DB-backed cache (survives restarts; same store the TP feed caches use) and replaces
 *     it with an opaque `bookingToken` — `<uuid>.<index>` — that carries NO url material.
 *   • At booking time, the rail resolves the token back to the URL with `resolveBookingToken()`
 *     entirely server-side. The URL never round-trips through the client.
 *
 * Token TTL matches the 24h TP feed cache: a token can never outlive the feed snapshot it was
 * minted from by more than the feed's own staleness window. A vault miss (expired/unknown token)
 * is answered by the rail with 404 "no longer available — refresh", the same posture the
 * pre-existing /from-catalog re-resolution endpoint established.
 */
import crypto from "crypto";
import { sharedCache } from "./shared-cache.service";

const VAULT_NAMESPACE = "affiliate-url-vault";
const VAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h — same as the TP feed cache the items came from

/** What the vault stores per token: enough for the rail to server-derive the record it writes. */
export interface VaultedBooking {
  /** The partner/affiliate deep link — server-side only, never sent to a traveler client. */
  url: string;
  /** Item display name at vault time (server-derived itemName for the rail). */
  name: string | null;
  /** Partner/provider label at vault time (server-derived partnerName for the rail). */
  provider: string | null;
}

/**
 * Mint opaque booking tokens for a batch of vault entries. One shared-cache write per call
 * (the whole batch lives under a single random UUID; each token is `<uuid>.<index>`).
 */
export async function mintBookingTokens(entries: VaultedBooking[]): Promise<string[]> {
  if (entries.length === 0) return [];
  const batchId = crypto.randomUUID();
  await sharedCache.set(VAULT_NAMESPACE, batchId, entries, VAULT_TTL_MS);
  return entries.map((_, i) => `${batchId}.${i}`);
}

/** Resolve a booking token minted by `mintBookingTokens`. Null on expiry/unknown/garbage. */
export async function resolveBookingToken(token: string): Promise<VaultedBooking | null> {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const batchId = token.slice(0, dot);
  const index = Number(token.slice(dot + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  const entries = await sharedCache.get<VaultedBooking[]>(VAULT_NAMESPACE, batchId);
  if (!entries || !Array.isArray(entries)) return null;
  const entry = entries[index];
  if (!entry || typeof entry.url !== "string" || !entry.url) return null;
  return entry;
}

/** DTO fields that carry partner URLs and must never reach the client (§16). */
const URL_FIELDS = ["affiliateUrl", "bookingUrl"] as const;

/**
 * §16 response filter for catalog-item feeds: strips `affiliateUrl`/`bookingUrl` from every item
 * and attaches an opaque `bookingToken` to each item that had one, so the card's "book via agent"
 * action stays possible without the client ever holding the URL. Items without a URL pass through
 * (minus the null url fields) with no token. One cache write per call.
 */
export async function vaultAndStripItems<T extends Record<string, any>>(
  items: T[],
): Promise<Array<Omit<T, "affiliateUrl" | "bookingUrl"> & { bookingToken?: string }>> {
  const entries: VaultedBooking[] = [];
  const entryIndexByItem = new Map<number, number>();
  items.forEach((item, i) => {
    const url = firstUrl(item);
    if (url) {
      entryIndexByItem.set(i, entries.length);
      entries.push({
        url,
        name: typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : null,
        provider: typeof item.provider === "string" ? item.provider : typeof item.source === "string" ? item.source : null,
      });
    }
  });
  const tokens = await mintBookingTokens(entries);
  return items.map((item, i) => {
    const { affiliateUrl: _a, bookingUrl: _b, ...rest } = item;
    const entryIdx = entryIndexByItem.get(i);
    return entryIdx === undefined ? rest : { ...rest, bookingToken: tokens[entryIdx] };
  });
}

function firstUrl(item: Record<string, any>): string | null {
  for (const f of URL_FIELDS) {
    const v = item[f];
    if (typeof v === "string" && v) return v;
  }
  return null;
}
