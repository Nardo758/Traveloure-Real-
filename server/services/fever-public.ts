/**
 * SH-1 item 7 — the ONE traveler-facing shape of a Fever event (architect's rulings Q7.1–Q7.5, Oct 19, 2026).
 *
 * A Fever amount is never shown to a traveler: no price, no range, no currency and no "Free" (Q7.2) — the card says
 * "See current price" and the partner shows it. The partner URL never leaves the server (§16): it is vaulted and the
 * client gets an opaque, expiring `bookingToken`, resolved by the `booking_token` branch of
 * `POST /api/content/affiliate-redirect`, which records the click (Q7.1).
 *
 * This is an ALLOWLIST (§14 posture): a field the partner adds later is not published by default. Coordinates are not
 * published either. Every traveler-reachable payload that carries a Fever event goes through `toPublicFeverEvents`
 * (Q7.4); the admin cache routes do not.
 */
import { feverTitleBlocked } from "@shared/fever-title-filter";
import { mintBookingTokens, type VaultedBooking } from "./affiliate-url-vault.service";
import type { FeverEvent } from "./fever.service";

/** Every Fever event a traveler sees says where its price lives: with the partner. */
export const FEVER_PRICE_SOURCE = "partner" as const;
/** The vault's provider label for a Fever token; the redirect's `booking_token` branch accepts only this. */
export const FEVER_PROVIDER = "fever" as const;

export interface PublicFeverEvent {
  id: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  category: string | null;
  subcategory: string | null;
  venueName: string | null;
  venueAddress: string | null;
  date: string | null;
  endDate: string | null;
  isSoldOut: boolean;
  provider: typeof FEVER_PROVIDER;
  priceSource: typeof FEVER_PRICE_SOURCE;
  bookingToken?: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function project(e: FeverEvent): PublicFeverEvent {
  return {
    id: String(e.id),
    title: e.title,
    description: str(e.description),
    shortDescription: str(e.shortDescription),
    imageUrl: str(e.imageUrl),
    category: str(e.category),
    subcategory: str(e.subcategory),
    venueName: str(e.venue?.name),
    venueAddress: str(e.venue?.address),
    date: str(e.dates?.startDate),
    endDate: str(e.dates?.endDate),
    isSoldOut: e.isSoldOut === true,
    provider: FEVER_PROVIDER,
    priceSource: FEVER_PRICE_SOURCE,
  };
}

/** Project Fever events for a traveler: allowlisted fields, no amount, and the partner URL swapped for a token. */
export async function toPublicFeverEvents(events: readonly FeverEvent[]): Promise<PublicFeverEvent[]> {
  // Titles with the banned marketing phrases never get a token (ledger 2026-10-20-kyoto-feed-cleanup).
  const kept = events.filter((e) => !feverTitleBlocked(e.title));
  const out = kept.map(project);
  const entries: VaultedBooking[] = [];
  const at: number[] = [];
  kept.forEach((e, i) => {
    const url = str(e.affiliateUrl) ?? str(e.bookingUrl);
    if (!url) return;
    at.push(i);
    entries.push({ url, name: e.title ?? null, provider: FEVER_PROVIDER });
  });
  const tokens = await mintBookingTokens(entries);
  at.forEach((i, k) => {
    out[i].bookingToken = tokens[k];
  });
  return out;
}

export async function toPublicFeverEvent(event: FeverEvent): Promise<PublicFeverEvent> {
  const [one] = await toPublicFeverEvents([event]);
  return one;
}
