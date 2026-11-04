/**
 * A-1 (ledger `2026-11-05-lane1-guest-save-rail`): what a guest save names, read back from its own row.
 *
 * A guest save carries a KIND and the SOURCE ROW's id — never a title, a point or a link the server keeps. The server
 * re-reads that row for the item's name and point and stamps the item's link back to it, so a save that names nothing
 * the server can find is refused (4xx) and "Saved to plan" never fires on nothing. The full contract is CAP-2 (after
 * round 3); this is its minimum.
 *
 *   · gem              → `travel_pulse_hidden_gems` (visible rows only); content link `gem` / gem id.
 *   · event            → `fever_event_cache` by Fever event id; content link `event` / event id.
 *   · listing          → `provider_services` (approved, active, not a catalog ride); `provider_service_id`. No point:
 *                        a listing's exact pin belongs to its owner and a booked traveler (LD 22 as amended), and a
 *                        public read only ever carries an approximate one, which the browse map already treats as
 *                        unlocated.
 *   · partner_product  → `affiliate_products` (active) ⇒ `affiliate_product_id`; else a partner hotel
 *                        (`hotel_cache`) ⇒ content link `hotel`; else a partner activity (`activity_cache`) ⇒
 *                        content link `activity`.
 *
 * Coordinates are copied from the source row as stored, with no source stamp (`coord_source` NULL), exactly as gem
 * saves have done since GATE-1B. A row with no point saves unlocated, never a guessed or city-centre point (§13).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { activityCache, affiliateProducts, feverEventCache, hotelCache, providerServices, travelPulseHiddenGems } from "@shared/schema";
import { visibleGemCondition } from "./gem-visibility";
import { notRideListingSql } from "./ride-listings";

export const GUEST_ITEM_KINDS = ["gem", "event", "listing", "partner_product"] as const;
export type GuestItemKind = (typeof GUEST_ITEM_KINDS)[number];

export interface ResolvedGuestSource {
  title: string;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  itemType: "activity" | "accommodation" | null;
  /** Exactly one of these names the row the item came from. */
  contentType: "gem" | "event" | "hotel" | "activity" | null;
  contentId: string | null;
  providerServiceId: string | null;
  affiliateProductId: string | null;
}

const ID_MAX = 200;

/** Pure: a point only as a complete, finite pair; otherwise none (§13). */
export function pointOf(lat: unknown, lng: unknown): { latitude: string; longitude: string } | null {
  if (lat == null || lng == null) return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { latitude: String(lat), longitude: String(lng) };
}

function clean(name: unknown): string {
  return typeof name === "string" ? name.trim().slice(0, 255) : "";
}

function base(title: string, point: { latitude: string; longitude: string } | null): Omit<ResolvedGuestSource, "contentType" | "contentId" | "providerServiceId" | "affiliateProductId" | "itemType"> {
  return { title, locationName: title, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null };
}

async function gem(id: string): Promise<ResolvedGuestSource | null> {
  const [row] = await db
    .select({ placeName: travelPulseHiddenGems.placeName, latitude: travelPulseHiddenGems.latitude, longitude: travelPulseHiddenGems.longitude })
    .from(travelPulseHiddenGems)
    .where(and(eq(travelPulseHiddenGems.id, id), visibleGemCondition()))
    .limit(1);
  const title = clean(row?.placeName);
  if (!row || !title) return null;
  return { ...base(title, pointOf(row.latitude, row.longitude)), itemType: "activity", contentType: "gem", contentId: id, providerServiceId: null, affiliateProductId: null };
}

async function event(id: string): Promise<ResolvedGuestSource | null> {
  const [row] = await db
    .select({ title: feverEventCache.title, venueName: feverEventCache.venueName, latitude: feverEventCache.latitude, longitude: feverEventCache.longitude })
    .from(feverEventCache)
    .where(eq(feverEventCache.eventId, id))
    .limit(1);
  const title = clean(row?.title);
  if (!row || !title) return null;
  return {
    ...base(title, pointOf(row.latitude, row.longitude)),
    locationName: clean(row.venueName) || title,
    itemType: "activity",
    contentType: "event",
    contentId: id,
    providerServiceId: null,
    affiliateProductId: null,
  };
}

async function listing(id: string): Promise<ResolvedGuestSource | null> {
  const [row] = await db
    .select({ serviceName: providerServices.serviceName })
    .from(providerServices)
    .where(and(eq(providerServices.id, id), eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved"), notRideListingSql(providerServices.id)))
    .limit(1);
  const title = clean(row?.serviceName);
  if (!row || !title) return null;
  return { title, locationName: null, latitude: null, longitude: null, itemType: "activity", contentType: null, contentId: null, providerServiceId: id, affiliateProductId: null };
}

async function partnerProduct(id: string): Promise<ResolvedGuestSource | null> {
  const [aff] = await db
    .select({ name: affiliateProducts.name, coordinates: affiliateProducts.coordinates })
    .from(affiliateProducts)
    .where(and(eq(affiliateProducts.id, id), sql`coalesce(${affiliateProducts.isActive}, true) = true`))
    .limit(1);
  if (aff && clean(aff.name)) {
    const c = aff.coordinates as { lat?: unknown; lng?: unknown } | null;
    return { ...base(clean(aff.name), pointOf(c?.lat, c?.lng)), itemType: "activity", contentType: null, contentId: null, providerServiceId: null, affiliateProductId: id };
  }
  const [hotel] = await db
    .select({ name: hotelCache.name, latitude: hotelCache.latitude, longitude: hotelCache.longitude })
    .from(hotelCache)
    .where(eq(hotelCache.id, id))
    .limit(1);
  if (hotel && clean(hotel.name)) {
    return { ...base(clean(hotel.name), pointOf(hotel.latitude, hotel.longitude)), itemType: "accommodation", contentType: "hotel", contentId: id, providerServiceId: null, affiliateProductId: null };
  }
  const [act] = await db
    .select({ title: activityCache.title, latitude: activityCache.latitude, longitude: activityCache.longitude })
    .from(activityCache)
    .where(eq(activityCache.id, id))
    .limit(1);
  if (act && clean(act.title)) {
    return { ...base(clean(act.title), pointOf(act.latitude, act.longitude)), itemType: "activity", contentType: "activity", contentId: id, providerServiceId: null, affiliateProductId: null };
  }
  return null;
}

/** The source row a guest save names, or null when there is no such row (the route answers 4xx). */
export async function resolveGuestItemSource(kind: GuestItemKind, sourceId: string): Promise<ResolvedGuestSource | null> {
  const id = typeof sourceId === "string" ? sourceId.trim() : "";
  if (!id || id.length > ID_MAX) return null;
  switch (kind) {
    case "gem":
      return gem(id);
    case "event":
      return event(id);
    case "listing":
      return listing(id);
    case "partner_product":
      return partnerProduct(id);
    default:
      return null;
  }
}
