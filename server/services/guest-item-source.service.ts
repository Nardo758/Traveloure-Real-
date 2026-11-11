/**
 * CAP-2 (ledger `2026-11-05-cap2-plan-item-ref`): the ONE resolver for a PlanItemRef (`@shared/plan-item-ref`), on both
 * save rails — the guest save (`POST /api/guest-plans/current/items`) and the signed-in item create
 * (`POST /api/trips/:tripId/itinerary-items`). Extended from Lane 1's guest resolver (A-1, ledger
 * `2026-11-05-lane1-guest-save-rail`), not duplicated.
 *
 * One function per kind, each re-reading its own row (ruling 8 — no first-match across tables):
 *   · gem               → `travel_pulse_hidden_gems`; a hidden row is `source_withdrawn`. Link `gem` / gem id.
 *   · event             → `fever_event_cache.event_id`, else Fever's own lookup of that id (R3-2). Link `event` / id.
 *   · city_event        → `city_events.source_id` (one row only; a withdrawn row is `source_withdrawn`). Link
 *                         `city_event` / source_id; its start lands as a placement (A-29).
 *   · listing           → `provider_services` (approved, active, not a catalog ride); `provider_service_id`. Its point
 *                         is the listing's own stored pin — except a property, whose public point is blurred, which
 *                         saves unlocated (the browse map's own rule). R323's client-coordinate path is retired.
 *   · affiliate_product → `affiliate_products` (active, not paused) ⇒ `affiliate_product_id`.
 *   · hotel             → `hotel_cache` ⇒ link `hotel` / id.   · activity → `activity_cache` ⇒ link `activity` / id.
 *
 * Refusals (`PLAN_ITEM_REJECT_REASONS`): no such row ⇒ `unknown_source`; a row taken down ⇒ `source_withdrawn`; a row
 * (or the envelope's city) in an operating market the plan is not in ⇒ `city_mismatch`; a row with nothing to name the
 * item by, or a chosen day the plan does not have ⇒ `unplaceable`. A city or row that names no operating market is not
 * a mismatch (§13 — only a known, different market is).
 *
 * Coordinates are copied from the source row as stored, with no source stamp (`coord_source` NULL), as gem saves have
 * done since GATE-1B. A row with no point saves unlocated, never a guessed or city-centre point (§13). A client's
 * coordinates are never read on this path.
 */
import { marketToday } from "@shared/market-today";
import { MARKET_TIMEZONES, resolveMarketSlug } from "./trend-engine/operating-markets";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { activityCache, affiliateProducts, cityEvents, feverEventCache, hotelCache, providerServices, travelPulseHiddenGems, tripDestinations, trips } from "@shared/schema";
import { notRideListingSql } from "./ride-listings";
import { affiliateProductNotPausedWhere } from "./partner-pause.service";
import type { PlanItemRef, PlanItemRejectReason } from "@shared/plan-item-ref";

export interface ResolvedPlanSource {
  title: string;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  itemType: "activity" | "accommodation" | null;
  /** Exactly one of these names the row the item came from. */
  contentType: "gem" | "event" | "city_event" | "hotel" | "activity" | null;
  contentId: string | null;
  providerServiceId: string | null;
  affiliateProductId: string | null;
  /** The row's own city, for the market check. */
  rowCity?: string | null;
  /**
   * R3-17: an event's own day, in its market's calendar (YYYY-MM-DD), from the event row's start. Absent for every other
   * kind and for an event with no stated start (§13 — never today, never a guess).
   */
  eventDate?: string | null;
  /**
   * QA round 3 major 1: an event's LAST day, in the same market calendar, from the row's own end. Absent when the row
   * states no end — the save rails then keep the start-only rule (§13: never a guessed length).
   */
  eventEndDate?: string | null;
  /** A-29: a city event's wall-clock start ("HH:MM", market zone), only when the row says its time is known. */
  startTime?: string | null;
}


type Resolved = { ok: true; source: ResolvedPlanSource } | { ok: false; reason: PlanItemRejectReason };
const refuse = (reason: PlanItemRejectReason): Resolved => ({ ok: false, reason });
const accept = (source: ResolvedPlanSource): Resolved => ({ ok: true, source });

/** R3-17, pure: an instant → its calendar day in the market's own zone (UTC with no market). Null for no instant. */
export function eventDayInMarket(start: Date | string | null | undefined, marketKey: string | null | undefined): string | null {
  if (start == null || start === "") return null;
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  return marketToday(marketKey, d);
}

/** A-29, pure: an instant → its "HH:MM" wall clock in the market's zone. Null for no instant or no market zone. */
export function eventTimeInMarket(start: Date | string | null | undefined, marketKey: string | null | undefined): string | null {
  if (start == null || start === "" || !marketKey) return null;
  const tz = MARKET_TIMEZONES[marketKey];
  if (!tz) return null;
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  const m = parts.find((p) => p.type === "minute")?.value;
  return h && m ? `${h === "24" ? "00" : h}:${m}` : null;
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

function base(title: string, point: { latitude: string; longitude: string } | null): Pick<ResolvedPlanSource, "title" | "locationName" | "latitude" | "longitude"> {
  return { title, locationName: title, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null };
}

const NO_LINK = { contentType: null, contentId: null, providerServiceId: null, affiliateProductId: null } as const;

async function gem(id: string): Promise<Resolved> {
  const [row] = await db
    .select({ placeName: travelPulseHiddenGems.placeName, city: travelPulseHiddenGems.city, latitude: travelPulseHiddenGems.latitude, longitude: travelPulseHiddenGems.longitude, hiddenAt: travelPulseHiddenGems.hiddenAt })
    .from(travelPulseHiddenGems)
    .where(eq(travelPulseHiddenGems.id, id))
    .limit(1);
  if (!row) return refuse("unknown_source");
  // The same flag the public reads keep a gem by (`visibleGemCondition`, hidden_at IS NULL).
  if (row.hiddenAt != null) return refuse("source_withdrawn");
  const title = clean(row.placeName);
  if (!title) return refuse("unplaceable");
  return accept({ ...base(title, pointOf(row.latitude, row.longitude)), itemType: "activity", ...NO_LINK, contentType: "gem", contentId: id, rowCity: row.city });
}

/**
 * R3-2 (round 3): the live Fever lookup an event save falls back to when the cache holds no row for that id. The city
 * page lists Fever's catalog live (`location-view.service.ts`), so an event shown there need not have been cached yet.
 * Swappable for tests; a lookup that throws or finds nothing is "no such event".
 */
type FeverLookup = (eventId: string) => Promise<{ title?: string | null; venue?: { name?: string | null; coordinates?: { lat?: unknown; lng?: unknown } | null } | null } | null>;
const liveFeverLookup: FeverLookup = async (eventId) => {
  const { feverService } = await import("./fever.service");
  // Only a live catalog answers: an unconfigured service would hand back a generated demo event for any id.
  if (!feverService.isCatalogReady()) return null;
  return (await feverService.getEventById(eventId)) as any;
};
let feverLookup: FeverLookup = liveFeverLookup;
export function setFeverEventLookupForTests(fn: FeverLookup | null): void {
  feverLookup = fn ?? liveFeverLookup;
}

async function event(id: string): Promise<Resolved> {
  // ONE id per kind (CAP-2 input): an event is named by its Fever event id — `fever_event_cache.event_id`, the same id
  // the public event payload carries as `id`. The cache answers first; a miss asks Fever for that same id.
  const [row] = await db
    .select({ title: feverEventCache.title, venueName: feverEventCache.venueName, latitude: feverEventCache.latitude, longitude: feverEventCache.longitude, startDate: feverEventCache.startDate, endDate: feverEventCache.endDate, city: feverEventCache.city })
    .from(feverEventCache)
    .where(eq(feverEventCache.eventId, id))
    .limit(1);
  let title = clean(row?.title);
  let venueName = clean(row?.venueName);
  let point = row ? pointOf(row.latitude, row.longitude) : null;
  let eventDate = row ? eventDayInMarket(row.startDate, resolveMarketSlug(row.city ?? "")) : null;
  let eventEndDate = row ? eventDayInMarket(row.endDate, resolveMarketSlug(row.city ?? "")) : null;
  let rowCity: string | null = row?.city ?? null;
  if (!row || !title) {
    const live = await feverLookup(id).catch(() => null);
    if (!live) return refuse("unknown_source");
    title = clean(live?.title);
    if (!title) return refuse("unplaceable");
    rowCity = clean((live as any).city?.name) || null;
    venueName = clean(live.venue?.name);
    point = pointOf(live.venue?.coordinates?.lat, live.venue?.coordinates?.lng);
    eventDate = eventDayInMarket((live as any).dates?.startDate ?? null, resolveMarketSlug((live as any).city?.name ?? ""));
    eventEndDate = eventDayInMarket((live as any).dates?.endDate ?? null, resolveMarketSlug((live as any).city?.name ?? ""));
  }
  return accept({
    ...base(title, point),
    locationName: venueName || title,
    itemType: "activity",
    ...NO_LINK,
    contentType: "event",
    contentId: id,
    eventDate,
    eventEndDate,
    rowCity,
  });
}

/** Ruling 9: a city event (migration 439's Kyoto rows among them) is named by its `source_id`; exactly one row answers. */
async function cityEvent(id: string): Promise<Resolved> {
  const rows = await db
    .select({ title: cityEvents.title, city: cityEvents.city, venue: cityEvents.venue, venueLat: cityEvents.venueLat, venueLng: cityEvents.venueLng, startsAt: cityEvents.startsAt, endsAt: cityEvents.endsAt, startTimeKnown: cityEvents.startTimeKnown, withdrawnAt: cityEvents.withdrawnAt })
    .from(cityEvents)
    .where(eq(cityEvents.sourceId, id))
    .limit(2);
  // Two sources sharing one source_id is not a row we can name (ruling 8: no first match).
  if (rows.length !== 1) return refuse("unknown_source");
  const row = rows[0];
  if (row.withdrawnAt != null) return refuse("source_withdrawn");
  const title = clean(row.title);
  if (!title) return refuse("unplaceable");
  const market = resolveMarketSlug(row.city ?? "");
  return accept({
    ...base(title, pointOf(row.venueLat, row.venueLng)),
    locationName: clean(row.venue) || title,
    itemType: "activity",
    ...NO_LINK,
    contentType: "city_event",
    contentId: id,
    eventDate: eventDayInMarket(row.startsAt, market),
    eventEndDate: eventDayInMarket(row.endsAt, market),
    startTime: row.startTimeKnown === true ? eventTimeInMarket(row.startsAt, market) : null,
    rowCity: row.city,
  });
}

async function listing(id: string): Promise<Resolved> {
  const [row] = await db
    .select({
      serviceName: providerServices.serviceName,
      city: providerServices.city,
      latitude: providerServices.latitude,
      longitude: providerServices.longitude,
      productShape: providerServices.productShape,
      status: providerServices.status,
      approvalStatus: providerServices.approvalStatus,
      notRide: sql<boolean>`${notRideListingSql(providerServices.id)}`,
    })
    .from(providerServices)
    .where(eq(providerServices.id, id))
    .limit(1);
  // A catalog ride is not a saveable listing (it lands only through the ride rail).
  if (!row || row.notRide === false) return refuse("unknown_source");
  if (row.status !== "active" || row.approvalStatus !== "approved") return refuse("source_withdrawn");
  const title = clean(row.serviceName);
  if (!title) return refuse("unplaceable");
  // A property's public point is blurred (property-location-privacy); it saves unlocated, as the browse map shows it.
  const property = row.productShape === "property" || row.productShape === "property_room";
  const point = property ? null : pointOf(row.latitude, row.longitude);
  return accept({ ...base(title, point), locationName: point ? title : null, itemType: "activity", ...NO_LINK, providerServiceId: id, rowCity: row.city });
}

async function affiliateProduct(id: string): Promise<Resolved> {
  const [row] = await db
    .select({ name: affiliateProducts.name, city: affiliateProducts.city, coordinates: affiliateProducts.coordinates, isActive: affiliateProducts.isActive, live: sql<boolean>`${affiliateProductNotPausedWhere()}` })
    .from(affiliateProducts)
    .where(eq(affiliateProducts.id, id))
    .limit(1);
  if (!row) return refuse("unknown_source");
  if (row.isActive === false || row.live === false) return refuse("source_withdrawn");
  const title = clean(row.name);
  if (!title) return refuse("unplaceable");
  const c = row.coordinates as { lat?: unknown; lng?: unknown } | null;
  return accept({ ...base(title, pointOf(c?.lat, c?.lng)), itemType: "activity", ...NO_LINK, affiliateProductId: id, rowCity: row.city });
}

async function hotel(id: string): Promise<Resolved> {
  const [row] = await db
    .select({ name: hotelCache.name, city: hotelCache.city, latitude: hotelCache.latitude, longitude: hotelCache.longitude })
    .from(hotelCache)
    .where(eq(hotelCache.id, id))
    .limit(1);
  if (!row) return refuse("unknown_source");
  const title = clean(row.name);
  if (!title) return refuse("unplaceable");
  return accept({ ...base(title, pointOf(row.latitude, row.longitude)), itemType: "accommodation", ...NO_LINK, contentType: "hotel", contentId: id, rowCity: row.city });
}

async function activity(id: string): Promise<Resolved> {
  const [row] = await db
    .select({ title: activityCache.title, city: activityCache.city, destination: activityCache.destination, latitude: activityCache.latitude, longitude: activityCache.longitude })
    .from(activityCache)
    .where(eq(activityCache.id, id))
    .limit(1);
  if (!row) return refuse("unknown_source");
  const title = clean(row.title);
  if (!title) return refuse("unplaceable");
  return accept({ ...base(title, pointOf(row.latitude, row.longitude)), itemType: "activity", ...NO_LINK, contentType: "activity", contentId: id, rowCity: row.city ?? row.destination });
}

/** The operating markets a plan is in: its own market, its destination and every ordered stop (LD 34). */
export async function planMarkets(tripId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const [trip] = await db.select({ marketSlug: trips.marketSlug, destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (trip?.marketSlug) out.add(trip.marketSlug);
  const d = resolveMarketSlug(trip?.destination ?? "");
  if (d) out.add(d);
  const stops = await db.select({ name: tripDestinations.name }).from(tripDestinations).where(eq(tripDestinations.tripId, tripId));
  for (const s of stops) {
    const m = resolveMarketSlug(s.name ?? "");
    if (m) out.add(m);
  }
  return out;
}

/** Pure: a known market the plan is not in. A city that names no operating market, or a plan in none, is no mismatch. */
export function isCityMismatch(city: string | null | undefined, markets: ReadonlySet<string>): boolean {
  if (markets.size === 0) return false;
  const m = resolveMarketSlug(city ?? "");
  return !!m && !markets.has(m);
}

/**
 * The ONE resolver: a PlanItemRef → the row's identity, name, point and placement, or the reason it cannot be placed.
 * `markets` is the plan's operating markets (`planMarkets`); `planDays` its length, for a chosen day.
 */
export async function resolvePlanItemRef(
  ref: PlanItemRef,
  ctx: { markets: ReadonlySet<string>; planDays?: number | null },
): Promise<Resolved> {
  const id = typeof ref.source_id === "string" ? ref.source_id.trim() : "";
  if (!id || id.length > ID_MAX) return refuse("unknown_source");
  // The envelope's own city first: a card shown in another market's page names that market.
  if (isCityMismatch(ref.city, ctx.markets)) return refuse("city_mismatch");
  const day = ref.placement?.day_number;
  if (day != null && ctx.planDays != null && day > ctx.planDays) return refuse("unplaceable");
  let out: Resolved;
  switch (ref.kind) {
    case "gem": out = await gem(id); break;
    case "event": out = await event(id); break;
    case "city_event": out = await cityEvent(id); break;
    case "listing": out = await listing(id); break;
    case "affiliate_product": out = await affiliateProduct(id); break;
    case "hotel": out = await hotel(id); break;
    case "activity": out = await activity(id); break;
    default: return refuse("unknown_kind");
  }
  if (out.ok && isCityMismatch(out.source.rowCity, ctx.markets)) return refuse("city_mismatch");
  // A-29 (CAP-2 Phase 2): an event's start is a PLACEMENT HINT from the card. The row's own start wins; the hint's day
  // is used only when the row states none (a live Fever answer with no dates). It never sets a time.
  if (out.ok && (ref.kind === "event" || ref.kind === "city_event") && !out.source.eventDate && ref.placement?.starts_at) {
    out.source.eventDate = eventDayInMarket(ref.placement.starts_at, resolveMarketSlug(out.source.rowCity ?? ref.city));
  }
  // QA round 3 major 1 — THE CARD-END RULE: the card's end date is used only when the row has no end AND the start also
  // came from the card. Never a row start with a card end: the two would come from different sources, and the pair
  // could claim an overlap neither source states. The row's own end always wins.
  if (out.ok && (ref.kind === "event" || ref.kind === "city_event") && !out.source.eventEndDate && ref.placement?.ends_at && ref.placement?.starts_at && out.source.eventDate === eventDayInMarket(ref.placement.starts_at, resolveMarketSlug(out.source.rowCity ?? ref.city))) {
    out.source.eventEndDate = eventDayInMarket(ref.placement.ends_at, resolveMarketSlug(out.source.rowCity ?? ref.city));
  }
  return out;
}
