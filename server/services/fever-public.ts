/**
 * SH-1 item 7 — the ONE traveler-facing shape of a Fever event (architect's rulings Q7.1–Q7.5, Oct 19, 2026).
 *
 * A Fever amount is never shown to a traveler: no price, no range, no currency and no "Free" (Q7.2) — the card says
 * "See current price" and the partner shows it. The partner URL never leaves the server (§16): it is vaulted and the
 * client gets an opaque, expiring `bookingToken`, resolved by the `booking_token` branch of
 * `POST /api/content/affiliate-redirect`, which records the click (Q7.1).
 *
 * This is an ALLOWLIST (§14 posture): a field the partner adds later is not published by default. Fever's own
 * coordinates are used first for the area match and are not copied onto the public card. OpenStreetMap Nominatim
 * runs only when those coordinates are missing and an address is present. The street address is not published
 * either — the card shows the area name (ledger `2026-10-21-blog-checks-fever-area`). Every traveler-reachable
 * payload that carries a Fever event goes through `toPublicFeverEvents` (Q7.4); the admin cache routes do not.
 */
import { feverTitleBlocked } from "@shared/fever-title-filter";
import { namedArea } from "@shared/fever-area";
import { mintBookingTokens, type VaultedBooking } from "./affiliate-url-vault.service";
import { resolveFeverAreas, type FeverAreaDeps } from "./fever-area";
import { approvedFeverPartnerName } from "./fever-partner-name";
import type { FeverEvent } from "./fever.service";
import { reviewedEditorialDescription, type EditorialFields } from "./partner-editorial";

/** Every Fever event a traveler sees says where its price lives: with the partner. */
export const FEVER_PRICE_SOURCE = "partner" as const;
/** The vault's provider label for a Fever token; the redirect's `booking_token` branch accepts only this. */
export const FEVER_PROVIDER = "fever" as const;

export interface PublicFeverEvent {
  id: string;
  title: string;
  /** PARTNER-1: our own reviewed editorial text (`fever_event_cache.editorial_description`), or null — never Fever's. */
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  subcategory: string | null;
  venueName: string | null;
  /** Kyoto neighbourhood from the point and `city_neighborhoods` centre+radius. Null when unplaced. */
  areaName: string | null;
  /** "© OpenStreetMap contributors" when the area or the point came from OpenStreetMap. */
  osmCredit: string | null;
  date: string | null;
  endDate: string | null;
  isSoldOut: boolean;
  provider: typeof FEVER_PROVIDER;
  priceSource: typeof FEVER_PRICE_SOURCE;
  /** The approved partner's stored name. Null when none is approved or the name is blank. */
  partnerName: string | null;
  bookingToken?: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function project(
  e: FeverEvent,
  area: { areaName: string | null; osmCredit: string | null },
  partnerName: string | null,
  editorial: EditorialFields | null,
): PublicFeverEvent {
  return {
    id: String(e.id),
    title: e.title,
    // PARTNER-1: no description, short description or highlights from Fever — only our reviewed editorial text.
    description: reviewedEditorialDescription(editorial),
    imageUrl: str(e.imageUrl),
    category: str(e.category),
    subcategory: str(e.subcategory),
    venueName: str(e.venue?.name),
    areaName: area.areaName,
    osmCredit: area.osmCredit,
    date: str(e.dates?.startDate),
    endDate: str(e.dates?.endDate),
    isSoldOut: e.isSoldOut === true,
    provider: FEVER_PROVIDER,
    priceSource: FEVER_PRICE_SOURCE,
    partnerName,
  };
}

/** undefined looks the name up. An explicit null skips the lookup (tests). A thrown lookup is null. */
async function shownPartnerName(deps: { partnerName?: string | null }): Promise<string | null> {
  if (Object.prototype.hasOwnProperty.call(deps, "partnerName")) return namedArea(deps.partnerName);
  try {
    return namedArea(await approvedFeverPartnerName());
  } catch {
    return null;
  }
}

export type FeverEditorialLookup = (eventIds: readonly string[]) => Promise<Map<string, EditorialFields>>;

/**
 * PARTNER-1: our reviewed editorial text for these events, from `fever_event_cache` (migration 432). Only reviewed rows
 * are read. A failed read is an empty map — no text is shown, never Fever's in its place (fails closed).
 */
export const loadFeverEditorial: FeverEditorialLookup = async (eventIds) => {
  const out = new Map<string, EditorialFields>();
  if (eventIds.length === 0) return out;
  try {
    const { db } = await import("../db");
    const { feverEventCache } = await import("@shared/schema");
    const { and, inArray, isNotNull } = await import("drizzle-orm");
    const rows = await db
      .select({
        eventId: feverEventCache.eventId,
        editorialDescription: feverEventCache.editorialDescription,
        editorialReviewedAt: feverEventCache.editorialReviewedAt,
      })
      .from(feverEventCache)
      .where(and(inArray(feverEventCache.eventId, [...eventIds]), isNotNull(feverEventCache.editorialReviewedAt)));
    for (const r of rows) out.set(String(r.eventId), { editorialDescription: r.editorialDescription, editorialReviewedAt: r.editorialReviewedAt });
  } catch {
    return new Map();
  }
  return out;
};

/** Project Fever events for a traveler: allowlisted fields, no amount, no street, and the partner URL swapped for a token. */
export async function toPublicFeverEvents(
  events: readonly FeverEvent[],
  deps: FeverAreaDeps & { partnerName?: string | null; editorial?: FeverEditorialLookup } = {},
): Promise<PublicFeverEvent[]> {
  // #1607 drops a title that hits geisha, hidden gem(s), back alley, trending, or illuminations.
  // Those phrases are read from SURFACE_COPY_REFUSALS, not a second list.
  const kept = events.filter((e) => !feverTitleBlocked(e.title));
  const areas = await resolveFeverAreas(kept, deps);
  const partnerName = await shownPartnerName(deps);
  const editorial = await (deps.editorial ?? loadFeverEditorial)(kept.map((e) => String(e.id)));
  const out = kept.map((e, i) =>
    project(e, areas[i] ?? { areaName: null, osmCredit: null }, partnerName, editorial.get(String(e.id)) ?? null),
  );
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

export async function toPublicFeverEvent(
  event: FeverEvent,
  deps: FeverAreaDeps & { partnerName?: string | null; editorial?: FeverEditorialLookup } = {},
): Promise<PublicFeverEvent> {
  const [one] = await toPublicFeverEvents([event], deps);
  return one;
}
