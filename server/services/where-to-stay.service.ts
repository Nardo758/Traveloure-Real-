/**
 * WHERE TO STAY — the read and the bind (smoke test 4, item 5; ledger `2026-10-02-smoke4-draft-fixes`).
 * The rules are pure in `shared/where-to-stay.ts`; this file only loads rows and composes the
 * EXISTING option-set rail for the bind (§18 rule 1 — no second way to put a stay on a plan).
 *
 *   · READ: a plan spanning 2+ days that has a draft (at least one non-stay item) and has not decided
 *     where to stay. Neighbourhoods are the city's `city_neighborhoods` centroids, ranked against the
 *     plan's located items (item coordinates, or an unexpired location fact — the same `fitItems`
 *     plan-fit reads). A8: when `TRAVEL_TIME_SERVICE_ENABLED` and the plan has a PAID optimizer run,
 *     the ranking reads the travel-time matrix instead; the response carries only the order and the
 *     basis, never a minute value (R242).
 *   · HOTELS from our own inventory only: located `hotel_cache` rows (the census anchors) and active,
 *     located affiliate listings whose category names lodging. No Places hotel search, no scraping.
 *   · BIND, through the option-set rail:
 *       stay_here  → an anchored accommodation set, the hotel as its option, then choose (the A7 /
 *                    #1200 rail: the chosen item carries the set and option). The client then offers
 *                    the free M8 "Build my days around this" (`/anchor/promote`).
 *       own        → the same, with a traveler-typed hotel or a neighbourhood. Neither gets
 *                    coordinates: a typed hotel is never guessed onto the map, and a neighbourhood's
 *                    centroid is not where anyone is staying — the option rail would record it as an
 *                    EXACT pin (§13). The neighbourhood is kept as the stay's location name.
 *       skip       → an anchored accommodation set, CLOSED with nothing chosen: "keep what the plan
 *                    has". Each day then starts from its first item, which is what a plan with no
 *                    stay already does.
 */
import { and, asc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  affiliateProducts,
  aiGeneratedItineraries,
  cityNeighborhoods,
  hotelCache,
  itineraryItems,
  placeFacts,
  planOptionSets,
  providerServices,
  serviceCategories,
  trips,
} from "@shared/schema";
import {
  HAND_ADDED_STAY_LINE,
  WHERE_TO_STAY_MIN_DAYS,
  distinguishingReasons,
  isLodgingItem,
  hotelsByNeighborhood,
  orderStaysByOrigin,
  topWonOnTieBreak,
  rankStayNeighborhoods,
  readStoredStayRanking,
  type RankedStayNeighborhood,
  type StoredStayRanking,
  type StayCost,
  type StayDay,
  type StayHotel,
  type StayNeighborhood,
  type WhereToStayIneligible,
  type WhereToStayStay,
  type WhereToStayView,
} from "@shared/where-to-stay";
import { haversineMeters } from "@shared/geo";
import { freeStayShortList, readStayPick, straightLineCloseness, toStayPickCandidate, type StayPickStop } from "@shared/stay-pick";
import { stayCloseStraightKm } from "../config/stay-closeness.config";
import { travelTimeServiceEnabled } from "../config/travel-time.config";
import { loadMatrixReader } from "./travel-time-matrix.service";
import { pendingLookupItemIds } from "./content-facts/lookup-progress.pure";
import { rankFactsByOrigin } from "./upsell-engine.service";
import {
  OptionSetError,
  addOption,
  chooseOption,
  closeOptionSet,
  createOptionSet,
  fitItems,
  planRole,
  reopenOptionSet,
} from "./plan-option-sets.service";
import { enrichPlanItems } from "./content-facts/place-facts.service";
import { itineraryItemNotMachineProtected } from "./itinerary-rebuild-guard";
import { OPTION_SET_CAP } from "@shared/plan-options";
import { rerouteAfterStayChange } from "./stay-reroute.service";
import { listStayLinks } from "./stay-link.service";

const LODGING_CATEGORY = /hotel|accommodation|lodging|ryokan|stay/i;

export function dayCount(start: unknown, end: unknown): number | null {
  const iso = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : String(v ?? "");
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const s = iso(start);
  const e = iso(end);
  if (s === null || e === null || e < s) return null;
  return Math.round((e - s) / 86_400_000) + 1;
}

function empty(reason: WhereToStayIneligible, city: string | null = null): WhereToStayView {
  return { eligible: false, reason, city, basis: "straight_line", hotelsAvailable: false, neighborhoods: [] };
}

/**
 * Has the plan decided where to stay? A stay item, or a lodging set that is still open or has a
 * choice. A lodging set CLOSED WITH NOTHING CHOSEN is a "Skip for now" (smoke 8 item 1): it answers
 * only the state it was pressed in (`lastSkipAt`), never the question for good.
 */
async function stayDecided(tripId: string): Promise<boolean> {
  const [stay] = await db
    .select({ id: itineraryItems.id })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.itemType, "accommodation")))
    .limit(1);
  if (stay) return true;
  const [set] = await db
    .select({ id: planOptionSets.id })
    .from(planOptionSets)
    .where(
      and(
        eq(planOptionSets.tripId, tripId),
        eq(planOptionSets.categoryKey, "accommodation"),
        or(sql`${planOptionSets.status} <> 'closed'`, isNotNull(planOptionSets.chosenOptionId)),
      ),
    )
    .limit(1);
  return !!set;
}

/** When the traveler last pressed "Skip for now" (a lodging set closed with nothing chosen), or null. */
async function lastSkipAt(tripId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${planOptionSets.createdAt})` })
    .from(planOptionSets)
    .where(
      and(
        eq(planOptionSets.tripId, tripId),
        eq(planOptionSets.categoryKey, "accommodation"),
        eq(planOptionSets.status, "closed"),
        isNull(planOptionSets.chosenOptionId),
      ),
    );
  return row?.at ? new Date(row.at as any) : null;
}

/**
 * When the plan entered its DRAFTED state: its latest draft row, else (a plan built by hand) its
 * earliest non-stay item. A skip at or after this instant was pressed on the drafted panel.
 */
async function draftedSince(tripId: string): Promise<Date | null> {
  const [draft] = await db
    .select({ at: aiGeneratedItineraries.createdAt })
    .from(aiGeneratedItineraries)
    .where(eq(aiGeneratedItineraries.tripId, tripId))
    .orderBy(sql`${aiGeneratedItineraries.createdAt} DESC NULLS LAST`)
    .limit(1);
  if (draft?.at) return new Date(draft.at as any);
  const [item] = await db
    .select({ at: sql<Date | null>`min(${itineraryItems.createdAt})` })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), sql`${itineraryItems.itemType} IS DISTINCT FROM 'accommodation'`));
  return item?.at ? new Date(item.at as any) : null;
}

/**
 * Smoke 9 S9-2: the plan's lodging set a CHANGE goes through — its accommodation set that is still
 * open or has a choice (the primary first). A closed set (a Skip) is not one.
 */
async function lodgingSetForChange(tripId: string): Promise<{ id: string; status: string } | null> {
  const [row] = await db
    .select({ id: planOptionSets.id, status: planOptionSets.status })
    .from(planOptionSets)
    .where(and(eq(planOptionSets.tripId, tripId), eq(planOptionSets.categoryKey, "accommodation"), sql`${planOptionSets.status} IN ('open', 'chosen')`))
    .orderBy(sql`CASE WHEN ${planOptionSets.anchorRole} = 'primary' THEN 0 ELSE 1 END`, asc(planOptionSets.createdAt))
    .limit(1);
  return row ?? null;
}

/** Is the stay a chosen lodging set put on the plan already being booked (never rewritten)? */
async function chosenStayIsBooked(tripId: string, setId: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1 FROM plan_option_sets s JOIN itinerary_items i ON i.id = s.itinerary_item_id
    WHERE s.id = ${setId} AND s.trip_id = ${tripId}
      AND (i.booking_id IS NOT NULL OR i.routing_status <> 'in_planning') LIMIT 1`);
  return ((r as any)?.rows?.length ?? 0) > 0;
}

/**
 * The paid tier is the step-9a predicate (`planGetsRoutedLegs`, through `tripGetsRoutedLegs`) — ruling 4 of
 * ledger `2026-10-09-s1-one-stay`; it replaced a paid-optimizer-run check that missed Trip Pass, handoff and
 * Ready Made plans (§18 rule 1: one answer to "is this plan paid"). Loaded lazily: the routing module pulls
 * the handoff and entitlement services.
 */
async function planIsRouted(tripId: string): Promise<boolean> {
  const { tripGetsRoutedLegs } = await import("./routing/plan-routed-legs.service");
  return tripGetsRoutedLegs(tripId);
}

/** Pure: the slug of the neighbourhood whose centroid is nearest the point (null when there are none). */
export function nearestNeighborhoodSlug(neighborhoods: readonly StayNeighborhood[], p: { lat: number; lng: number }): string | null {
  let best: string | null = null;
  let bestM = Infinity;
  for (const n of neighborhoods) {
    const m = haversineMeters(n.lat, n.lng, p.lat, p.lng);
    if (m < bestM) {
      bestM = m;
      best = n.slug;
    }
  }
  return best;
}

export async function cityNeighborhoodRows(city: string): Promise<Array<StayNeighborhood & { description: string | null }>> {
  const rows = await db
    .select({ slug: cityNeighborhoods.slug, name: cityNeighborhoods.name, lat: cityNeighborhoods.centroidLat, lng: cityNeighborhoods.centroidLng, description: cityNeighborhoods.description })
    .from(cityNeighborhoods)
    .where(sql`lower(${cityNeighborhoods.city}) = lower(${city})`)
    .orderBy(asc(cityNeighborhoods.slug));
  return rows
    .map((r) => ({ slug: r.slug, name: r.name, lat: Number(r.lat), lng: Number(r.lng), description: r.description ?? null }))
    .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng));
}

/**
 * R-x (surface step 3): each ranked neighbourhood's one line. A registry `neighbourhood` fact wins —
 * a `description` fact under need `neighbourhood`, keyed by the neighbourhood's slug or name,
 * unexpired and not superseded, best origin first (`rankFactsByOrigin`, the one ranker) — else the
 * spine's own `city_neighborhoods.description`. Neither ⇒ null, never an invented line (§13).
 */
async function neighbourhoodOneLiners(
  ranked: ReadonlyArray<{ slug: string; name: string }>,
  spine: ReadonlyArray<{ slug: string; description: string | null }>,
): Promise<Map<string, { text: string; source: "registry" | "spine" }>> {
  const out = new Map<string, { text: string; source: "registry" | "spine" }>();
  if (!ranked.length) return out;
  const keys = ranked.flatMap((r) => [r.slug.toLowerCase(), r.name.toLowerCase()]);
  let rows: Array<typeof placeFacts.$inferSelect> = [];
  try {
    rows = await db
      .select()
      .from(placeFacts)
      .where(
        and(
          eq(placeFacts.need, "neighbourhood"),
          eq(placeFacts.factType, "description"),
          // The REGISTRY's line, never Google's: a Places row is display-inside-a-plan data with its
          // own provenance line, and is not what R-x means by a registry fact.
          sql`${placeFacts.origin} <> 'places_api'`,
          isNull(placeFacts.supersededBy),
          sql`lower(${placeFacts.placeRef}) IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`,
          sql`(${placeFacts.expiresAt} IS NULL OR ${placeFacts.expiresAt} > now())`,
        ),
      );
  } catch (err) {
    console.error("[where-to-stay] neighbourhood facts read failed:", (err as Error)?.message ?? err);
  }
  for (const r of ranked) {
    const mine = rows.filter((f) => [r.slug.toLowerCase(), r.name.toLowerCase()].includes(f.placeRef.toLowerCase()));
    const best = rankFactsByOrigin(mine)[0];
    const text = typeof (best?.value as any)?.text === "string" ? ((best!.value as any).text as string).trim() : "";
    if (text) {
      out.set(r.slug, { text, source: "registry" });
      continue;
    }
    const d = spine.find((n) => n.slug === r.slug)?.description?.trim();
    if (d) out.set(r.slug, { text: d, source: "spine" });
  }
  return out;
}

/** Our own inventory for a city, located rows only: census hotel anchors + affiliate lodging listings. */
export async function cityHotels(city: string): Promise<Array<StayHotel & { lat: number; lng: number }>> {
  const [platform, cache, affiliate] = await Promise.all([
    // R-o: stays LISTED ON TRAVELOURE — the same public read gate every listing surface uses
    // (approved + active), in the accommodation category, in this city, with a confirmed pin.
    db
      .select({ id: providerServices.id, name: providerServices.serviceName, lat: providerServices.latitude, lng: providerServices.longitude, image: providerServices.serviceImage })
      .from(providerServices)
      .innerJoin(serviceCategories, eq(providerServices.categoryId, serviceCategories.id))
      .where(
        and(
          eq(serviceCategories.categoryKey, "accommodation"),
          eq(providerServices.approvalStatus, "approved"),
          eq(providerServices.status, "active"),
          ilike(providerServices.city, city),
          isNotNull(providerServices.latitude),
          isNotNull(providerServices.longitude),
        ),
      )
      .orderBy(asc(providerServices.id))
      .limit(200),
    db
      .select({ id: hotelCache.id, name: hotelCache.name, lat: hotelCache.latitude, lng: hotelCache.longitude, starRating: hotelCache.starRating })
      .from(hotelCache)
      .where(and(or(ilike(hotelCache.city, city), ilike(hotelCache.cityCode, city)), isNotNull(hotelCache.latitude), isNotNull(hotelCache.longitude)))
      .orderBy(asc(hotelCache.id))
      .limit(500),
    db
      .select({ id: affiliateProducts.id, name: affiliateProducts.name, category: affiliateProducts.category, subCategory: affiliateProducts.subCategory, coordinates: affiliateProducts.coordinates })
      .from(affiliateProducts)
      .where(and(ilike(affiliateProducts.city, city), eq(affiliateProducts.isActive, true), isNotNull(affiliateProducts.coordinates)))
      .orderBy(asc(affiliateProducts.id))
      .limit(500),
  ]);
  const out: Array<StayHotel & { lat: number; lng: number }> = [];
  for (const p of platform) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // Step 6 R-aq: a platform stay's thumbnail is OUR listing's own image (the first source), with
    // its attribution; partner stays carry none — their images are not among R-aq's sources.
    const image = typeof p.image === "string" && /^https?:\/\//i.test(p.image) ? p.image : null;
    out.push({
      kind: "platform",
      id: p.id,
      name: p.name,
      starRating: null,
      lat,
      lng,
      ...(image ? { photo: { source: "ours" as const, url: image, licence: null, attribution: "From the host's listing", sourceUrl: null } } : {}),
    });
  }
  for (const h of cache) {
    const lat = Number(h.lat);
    const lng = Number(h.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const star = h.starRating == null ? null : Number(h.starRating);
    out.push({ kind: "hotel_cache", id: h.id, name: h.name, starRating: Number.isFinite(star as number) ? star : null, lat, lng });
  }
  for (const a of affiliate) {
    if (!LODGING_CATEGORY.test(`${a.category ?? ""} ${a.subCategory ?? ""}`)) continue;
    const lat = Number((a.coordinates as any)?.lat);
    const lng = Number((a.coordinates as any)?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ kind: "affiliate", id: a.id, name: a.name, starRating: null, lat, lng });
  }
  return out;
}

export async function loadWhereToStay(tripId: string, userId: string | null | undefined): Promise<WhereToStayView> {
  if (!(await planRole(tripId, userId, "read"))) return empty("not_found");
  const [trip] = await db
    .select({ destination: trips.destination, startDate: trips.startDate, endDate: trips.endDate, marketSlug: trips.marketSlug, stayPick: trips.stayPick })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return empty("not_found");
  const city = (trip.destination ?? "").split(",")[0].trim() || null;
  const days = dayCount(trip.startDate, trip.endDate);
  if (days === null || days < WHERE_TO_STAY_MIN_DAYS) return empty("single_day", city);

  // "decided" is asked FIRST (a stay, or a lodging set open or chosen). A Skip is NOT a decision
  // (smoke 8 item 1): it dismisses the state it was pressed in, and the drafted panel still appears
  // once after the draft.
  if (await stayDecided(tripId)) return empty("decided", city);
  const skippedAt = await lastSkipAt(tripId);
  const items = await fitItems(tripId);
  if (!items.length) return { ...empty("no_draft", city), ...(skippedAt ? { dismissed: true as const } : {}) };
  const since = skippedAt ? await draftedSince(tripId) : null;
  const dismissed = !!skippedAt && (!since || skippedAt.getTime() >= since.getTime());

  const byDay = new Map<number, StayDay>();
  for (const it of items) {
    if (it.lat === null || it.lng === null) continue;
    const d = it.dayNumber ?? 1;
    const day = byDay.get(d) ?? { dayNumber: d, points: [] };
    day.points.push({ lat: it.lat, lng: it.lng });
    byDay.set(d, day);
  }

  const neighborhoods = city ? await cityNeighborhoodRows(city) : [];
  // Smoke 5 item 6 (migration 340): the ranking is computed ONCE per draft and stored on the draft's
  // row; a reload reads it back. It is stored only once the draft's place-facts run has finished
  // (its stops' coordinates have landed) and only when it ranked something — an empty or half-located
  // ranking is never frozen as the draft's answer.
  const draft = await latestDraft(tripId);
  const stored = draft ? readStoredStayRanking(draft.whereToStay, draft.id) : null;
  let ranked: RankedStayNeighborhood[];
  let basis: "straight_line" | "travel_time";
  if (stored) {
    ranked = stored.ranked;
    basis = stored.basis;
  } else {
    let cost: StayCost | undefined;
    if (travelTimeServiceEnabled() && trip.marketSlug && (await planIsRouted(tripId))) {
      const reader = await loadMatrixReader(trip.marketSlug);
      // Minutes ORDER the neighbourhoods and never leave this function (R242).
      cost = (n, p) => {
        const t = reader({ lat: n.lat, lng: n.lng }, p, "transit");
        return Number.isFinite(t?.minutes) ? t.minutes : null;
      };
    }
    ({ ranked, basis } = rankStayNeighborhoods({ neighborhoods, days: Array.from(byDay.values()), cost }));
    if (draft && ranked.length && pendingLookupItemIds(draft.factsLookup).length === 0) {
      await storeStayRanking(draft.id, { draftId: draft.id, computedAt: new Date().toISOString(), basis, ranked });
    }
  }
  const hotels = city ? await cityHotels(city) : [];
  const placed = hotelsByNeighborhood(hotels, neighborhoods, ranked.map((r) => r.slug));
  const oneLiners = await neighbourhoodOneLiners(ranked, neighborhoods);
  const tied = topWonOnTieBreak(ranked);
  const stay = await stayBlock(tripId, trip.stayPick, hotels, neighborhoods, ranked, byDay, days, city);
  return {
    eligible: true,
    ...(dismissed ? { dismissed: true as const } : {}),
    city,
    basis,
    hotelsAvailable: hotels.length > 0,
    ...(ranked.length === 0 ? { unranked: neighborhoods.length === 0 ? ("no_neighborhoods" as const) : ("no_located_items" as const) } : {}),
    neighborhoods: distinguishingReasons(ranked).map((r, i) => ({
      slug: r.slug,
      name: r.name,
      reason: r.reason,
      // R-o: within this neighbourhood's band, platform-listed stays first.
      hotels: orderStaysByOrigin(placed[r.slug] ?? []),
      oneLiner: oneLiners.get(r.slug) ?? null,
      ...(i === 0 && tied ? { tieBreak: true as const } : {}),
    })),
    stay,
  };
}

/**
 * S1 (ledger `2026-10-09-s1-one-stay`): the view's ONE-stay block. READ ONLY — a routed plan's pick is
 * whatever `stay-pick.service.ts` stored; no Maps call is made here (ruling 3: never on read). A free plan's
 * short list is pure straight line over the hotels and stops already loaded.
 */
async function stayBlock(
  tripId: string,
  stored: unknown,
  hotels: Array<StayHotel & { lat: number; lng: number }>,
  neighborhoods: readonly StayNeighborhood[],
  ranked: readonly RankedStayNeighborhood[],
  byDay: Map<number, StayDay>,
  days: number,
  city: string | null,
): Promise<WhereToStayStay> {
  const byKey = new Map(hotels.map((h) => [`${h.kind}:${h.id}`, h]));
  const strip = (h: StayHotel & { lat: number; lng: number }): StayHotel => {
    const { lat: _lat, lng: _lng, ...rest } = h;
    return rest;
  };
  if (await planIsRouted(tripId)) {
    const pick = readStayPick(stored);
    if (!pick) return { tier: "routed", pick: null, scoredCount: null, candidateCount: null, changed: false, computedAt: null, closeness: null };
    const hotel = byKey.get(`${pick.hotelKind}:${pick.hotelId}`);
    // FU-S1-2 (ledger `2026-10-09-fu-s1-2-stay-link`): the card's list link — own or Google Maps, NO Google
    // call; its Google website is fetched only when the card is opened (`GET …/stay-pick/link`).
    const [linked] = hotel ? await listStayLinks([strip(hotel)], city) : [];
    return {
      tier: "routed",
      pick: linked ?? null,
      scoredCount: pick.scoredCount,
      candidateCount: pick.candidateCount,
      changed: pick.changed,
      computedAt: pick.computedAt,
      // FU-S1-3: stored by the one writer; null when the pick left our inventory or predates FU-S1-3.
      closeness: hotel ? (pick.closeness ?? null) : null,
    };
  }
  const top = new Set(ranked.map((r) => r.slug));
  // The plan's dates only — the same stops the routed scorer reads (ruling 1).
  const stops: StayPickStop[] = Array.from(byDay.values())
    .filter((d) => d.dayNumber >= 1 && d.dayNumber <= days)
    .flatMap((d) => d.points.map((p) => ({ dayNumber: d.dayNumber, lat: p.lat, lng: p.lng })));
  const inTop = hotels.filter((h) => {
    const slug = nearestNeighborhoodSlug(neighborhoods, h);
    return !!slug && top.has(slug);
  });
  const list = freeStayShortList(inTop.map((h) => toStayPickCandidate(h)), stops);
  // FU-S1-2: one link per card — own or Google Maps; no Google call on list render.
  // FU-S1-3: each listed stay's straight-line closeness over the same stops (no Maps call).
  const km = stayCloseStraightKm();
  return {
    tier: "straight_line",
    hotels: await listStayLinks(
      list.map((c) => ({ ...strip(byKey.get(`${c.kind}:${c.id}`)!), closeness: straightLineCloseness(c, stops, km) })),
      city,
    ),
  };
}

/** The plan's latest draft row — the one its ranking and lookup progress belong to. */
async function latestDraft(tripId: string): Promise<{ id: string; whereToStay: unknown; factsLookup: unknown } | null> {
  const [row] = await db
    .select({ id: aiGeneratedItineraries.id, whereToStay: aiGeneratedItineraries.whereToStay, factsLookup: aiGeneratedItineraries.factsLookup })
    .from(aiGeneratedItineraries)
    .where(eq(aiGeneratedItineraries.tripId, tripId))
    .orderBy(sql`${aiGeneratedItineraries.createdAt} DESC NULLS LAST`)
    .limit(1);
  return row ?? null;
}

/**
 * Store once: the statement only writes a draft whose ranking is still unset, so two first reads
 * racing each other leave the first answer (and both computed the same order — the ranking is
 * deterministic). Never throws: a failed store only means the next read computes again.
 */
async function storeStayRanking(draftId: string, value: StoredStayRanking): Promise<void> {
  try {
    await db
      .update(aiGeneratedItineraries)
      .set({ whereToStay: value })
      .where(and(eq(aiGeneratedItineraries.id, draftId), isNull(aiGeneratedItineraries.whereToStay)));
  } catch (err) {
    console.error(`[where-to-stay] store failed draft_id=${draftId}:`, (err as Error)?.message ?? err);
  }
}

export type StayBinding =
  | { kind: "stay_here"; hotel: { kind: "platform" | "hotel_cache" | "affiliate"; id: string } }
  | { kind: "own"; hotelName?: string | null; neighborhoodSlug?: string | null }
  | { kind: "skip" }
  | { kind: "this_item"; itemId: string };

/**
 * Smoke 9 S9-2 amendment (ledger `2026-10-04-smoke9-addendum`): "Set as where you're staying" on a
 * HAND-ADDED lodging item. The item becomes the plan's stay row through the SAME lodging-set path the
 * chooser uses — a lodging set bound to THIS item (its incumbent option is the item itself), chosen —
 * so the stay then changes from Where to stay like any other, and the "added by hand" refusal has
 * somewhere to point. The item is never copied or replaced; nothing on it changes except that it is
 * now typed as the stay. Refused when the plan already has a stay from a lodging set, and when the
 * item is not lodging, not still being planned, or already the stay.
 */
async function setItemAsStay(
  tripId: string,
  userId: string,
  itemId: string,
): Promise<{ setId: string; itemId: string; replaced: string | null }> {
  const [item] = await db
    .select({
      id: itineraryItems.id,
      title: itineraryItems.title,
      itemType: itineraryItems.itemType,
      routingStatus: itineraryItems.routingStatus,
      bookingId: itineraryItems.bookingId,
      locationName: itineraryItems.locationName,
      latitude: itineraryItems.latitude,
      longitude: itineraryItems.longitude,
    })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
    .limit(1);
  if (!item) throw new OptionSetError(404, "not_found", "No such item on this plan");
  if (!isLodgingItem({ type: item.itemType, title: item.title })) throw new OptionSetError(409, "not_lodging", "Only a place to stay can be where you're staying");
  if (item.routingStatus !== "in_planning" || item.bookingId) throw new OptionSetError(409, "item_not_in_planning", "The place on your plan is already being booked");
  const [bound] = await db
    .select({ id: planOptionSets.id })
    .from(planOptionSets)
    .where(and(eq(planOptionSets.tripId, tripId), eq(planOptionSets.itineraryItemId, itemId)))
    .limit(1);
  if (bound) throw new OptionSetError(409, "stay_decided", "This is already where you're staying");

  // Smoke 10 S10-6: the plan's CURRENT stay row — the lodging set's item, else another accommodation
  // row added by hand. With one, this item REPLACES it: the same stay row is rewritten in place
  // through a lodging set (S9-2's path), never a second stay.
  const set = await lodgingSetForChange(tripId);
  let stay: { id: string; title: string; routingStatus: string | null; bookingId: string | null } | null = null;
  const stayCols = { id: itineraryItems.id, title: itineraryItems.title, routingStatus: itineraryItems.routingStatus, bookingId: itineraryItems.bookingId };
  if (set) {
    const [row] = await db
      .select(stayCols)
      .from(itineraryItems)
      .innerJoin(planOptionSets, eq(planOptionSets.itineraryItemId, itineraryItems.id))
      .where(eq(planOptionSets.id, set.id))
      .limit(1);
    stay = row ?? null;
  } else {
    const [row] = await db
      .select(stayCols)
      .from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.itemType, "accommodation"), sql`${itineraryItems.id} <> ${itemId}`))
      .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder))
      .limit(1);
    stay = row ?? null;
  }

  if (!stay) {
    // S9-2: no stay yet — this item becomes it (a lodging set bound to the item, chosen).
    const created = await createOptionSet({ tripId, userId, itineraryItemId: itemId, categoryKey: "accommodation", label: "Where to stay", anchor: true });
    const incumbent = created.options[0];
    if (!incumbent) throw new OptionSetError(409, "item_not_in_planning", "The place on your plan is already being booked");
    await chooseOption({ tripId, setId: created.id, optionId: incumbent.id, userId });
    if (item.itemType !== "accommodation") {
      await db
        .update(itineraryItems)
        .set({ itemType: "accommodation", updatedAt: new Date() })
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId), sql`routing_status = 'in_planning'`, sql`booking_id IS NULL`));
    }
    return { setId: created.id, itemId, replaced: null };
  }

  if (stay.routingStatus !== "in_planning" || stay.bookingId) {
    throw new OptionSetError(409, "item_not_in_planning", "The place on your plan is already being booked");
  }
  let setId: string;
  if (set) {
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM plan_options WHERE set_id = ${set.id}`)).rows as any[];
    if (Number(n) >= OPTION_SET_CAP) {
      throw new OptionSetError(409, "set_full", `A comparison holds up to ${OPTION_SET_CAP} places — remove one to add yours`, { cap: OPTION_SET_CAP });
    }
    setId = set.status === "chosen" ? (await reopenOptionSet({ tripId, setId: set.id, userId })).id : set.id;
  } else {
    // The current stay was itself added by hand: bind a set to IT, so it is the row rewritten.
    setId = (await createOptionSet({ tripId, userId, itineraryItemId: stay.id, categoryKey: "accommodation", label: "Where to stay", anchor: true })).id;
  }
  const option = await addOption({
    tripId,
    setId,
    userId,
    source: { kind: "custom", title: item.title, locationName: item.locationName ?? null, lat: item.latitude ?? null, lng: item.longitude ?? null },
  });
  const chosen = await chooseOption({ tripId, setId, optionId: option.id, userId });
  // The replacing item's place now lives on the stay row; the hand-added row it came from goes.
  // rebuild-guard-exempt: in_planning-only AND unbooked AND not machine-protected (expert work, locked) —
  // one traveler-chosen row moved into the stay, never a rebuild.
  // item-removed:replace — the place MOVES into the plan's stay row (one operation); it is not removed.
  await db
    .delete(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId), sql`routing_status = 'in_planning'`, sql`booking_id IS NULL`, itineraryItemNotMachineProtected()));
  return { setId, itemId: chosen.itemId, replaced: stay.title };
}

/**
 * Smoke 10 S10-3 (ledger `2026-10-04-smoke10-fixes`): a stay set BY NAME gets the same place lookup
 * drafted items get — the ID-only search, then Details on a miss, cached by Google's place ID and
 * counted against the per-call cap (`enrichPlanItems`) — so its location and area are stored as facts
 * on the stay item and the map can draw its anchor. Coordinates stay on the FACT, never copied onto the
 * row (LD 57). Awaited, so the plan the client re-reads already carries the pin; never throws (the
 * stay is already set — a failed lookup leaves it unlocated, said honestly).
 */
async function lookUpStayPlace(tripId: string, itemId: string | null): Promise<void> {
  if (!itemId) return;
  try {
    const [row] = await db
      .select({ id: itineraryItems.id, title: itineraryItems.title, dayNumber: itineraryItems.dayNumber, locationName: itineraryItems.locationName, destination: trips.destination, marketSlug: trips.marketSlug })
      .from(itineraryItems)
      .innerJoin(trips, eq(trips.id, itineraryItems.tripId))
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
      .limit(1);
    if (!row) return;
    await enrichPlanItems({
      tripId,
      market: row.marketSlug ?? null,
      city: row.destination ?? null,
      items: [{ id: row.id, title: row.title, type: "accommodation", dayNumber: row.dayNumber ?? 1, locationName: row.locationName ?? null }],
    });
  } catch (err) {
    console.error(`[where-to-stay] stay lookup failed plan_id=${tripId} item_id=${itemId}:`, (err as Error)?.message ?? err);
  }
}

/** Bind the traveler's answer through the option-set rail. Returns the set and, when one was made, the stay item. */
export async function bindWhereToStay(
  tripId: string,
  userId: string,
  binding: StayBinding,
): Promise<{ setId: string; itemId: string | null; replaced?: string | null }> {
  const out = await bindWhereToStayInner(tripId, userId, binding);
  // R-ba (work plan L1-4; ledger `2026-10-04-stay-item-reroute`): on a ready-made copy the new stay
  // re-routes the first and last legs — AFTER the stay's own place lookup above has run, so a stay
  // typed by name is routed from its Google point. Best-effort, never fails the bind (§15b).
  if (out.itemId) await rerouteAfterStayChange(tripId);
  return out;
}

async function bindWhereToStayInner(
  tripId: string,
  userId: string,
  binding: StayBinding,
): Promise<{ setId: string; itemId: string | null; replaced?: string | null }> {
  if (!(await planRole(tripId, userId, "choose"))) throw new OptionSetError(404, "not_found", "No such plan");
  if (binding.kind === "this_item") {
    const out = await setItemAsStay(tripId, userId, binding.itemId);
    await lookUpStayPlace(tripId, out.itemId);
    return out;
  }
  // Smoke 9 S9-2: a plan that already says where it stays can still CHANGE it from the chooser —
  // through its existing lodging set (reopened if chosen; the choice then rewrites the same stay
  // item in place), never a second set or a second stay. Skip has nothing to dismiss there, a
  // booked stay is not rewritten, and a stay added by hand (no set) changes from its own ⋯ menu.
  let reuse: { id: string; status: string } | null = null;
  if (await stayDecided(tripId)) {
    if (binding.kind === "skip") throw new OptionSetError(409, "stay_decided", "This plan already says where you're staying");
    reuse = await lodgingSetForChange(tripId);
    if (!reuse) throw new OptionSetError(409, "stay_decided", HAND_ADDED_STAY_LINE);
    if (reuse.status === "chosen" && (await chosenStayIsBooked(tripId, reuse.id))) {
      throw new OptionSetError(409, "item_not_in_planning", "The place on your plan is already being booked");
    }
    // Refused BEFORE a reopen, so a full comparison is never left reopened by a failed add.
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM plan_options WHERE set_id = ${reuse.id}`)).rows as any[];
    if (Number(n) >= OPTION_SET_CAP) {
      throw new OptionSetError(409, "set_full", `A comparison holds up to ${OPTION_SET_CAP} places — remove one to add yours`, { cap: OPTION_SET_CAP });
    }
  }
  const openSet = async (): Promise<{ id: string }> => {
    if (!reuse) return createOptionSet({ tripId, userId, categoryKey: "accommodation", label: "Where to stay", anchor: true });
    if (reuse.status === "chosen") return reopenOptionSet({ tripId, setId: reuse.id, userId });
    return { id: reuse.id };
  };

  if (binding.kind === "skip") {
    const set = await openSet();
    await closeOptionSet({ tripId, setId: set.id, userId });
    return { setId: set.id, itemId: null };
  }

  let source: Parameters<typeof addOption>[0]["source"];
  if (binding.kind === "stay_here") {
    const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
    const city = (trip?.destination ?? "").split(",")[0].trim();
    if (binding.hotel.kind === "platform") {
      // R-o: a platform-listed stay — the SAME gate the panel lists by (approved, active,
      // accommodation, this city). The option is the listing itself (`addOption`'s listing source).
      const [row] = await db
        .select({ id: providerServices.id })
        .from(providerServices)
        .innerJoin(serviceCategories, eq(providerServices.categoryId, serviceCategories.id))
        .where(
          and(
            eq(providerServices.id, binding.hotel.id),
            eq(serviceCategories.categoryKey, "accommodation"),
            eq(providerServices.approvalStatus, "approved"),
            eq(providerServices.status, "active"),
            ilike(providerServices.city, city),
          ),
        )
        .limit(1);
      if (!city || !row) throw new OptionSetError(404, "not_found", "No such place to stay in this plan's city");
      source = { kind: "listing", providerServiceId: row.id };
    } else if (binding.hotel.kind === "hotel_cache") {
      // Only a hotel in this plan's own city (the panel's own inventory rule).
      const [h] = await db
        .select({ id: hotelCache.id })
        .from(hotelCache)
        .where(and(eq(hotelCache.id, binding.hotel.id), or(ilike(hotelCache.city, city), ilike(hotelCache.cityCode, city))))
        .limit(1);
      if (!city || !h) throw new OptionSetError(404, "not_found", "No such place to stay in this plan's city");
      source = { kind: "hotel_cache", hotelCacheId: binding.hotel.id };
    } else {
      // §14: name and coordinates come from OUR row, never the body — and only a lodging listing in
      // this plan's own city is accepted.
      const [row] = await db
        .select({ name: affiliateProducts.name, city: affiliateProducts.city, category: affiliateProducts.category, subCategory: affiliateProducts.subCategory, coordinates: affiliateProducts.coordinates, location: affiliateProducts.location })
        .from(affiliateProducts)
        .where(and(eq(affiliateProducts.id, binding.hotel.id), eq(affiliateProducts.isActive, true)))
        .limit(1);
      if (!row || !city || (row.city ?? "").toLowerCase() !== city.toLowerCase() || !LODGING_CATEGORY.test(`${row.category ?? ""} ${row.subCategory ?? ""}`)) {
        throw new OptionSetError(404, "not_found", "No such place to stay in this plan's city");
      }
      const lat = Number((row.coordinates as any)?.lat);
      const lng = Number((row.coordinates as any)?.lng);
      source = {
        kind: "custom",
        title: row.name,
        locationName: typeof row.location === "string" ? row.location : null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      };
    }
  } else {
    const hotelName = (binding.hotelName ?? "").trim();
    let neighborhood: { name: string } | null = null;
    if (binding.neighborhoodSlug) {
      const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
      const city = (trip?.destination ?? "").split(",")[0].trim();
      const found = city ? (await cityNeighborhoodRows(city)).find((n) => n.slug === binding.neighborhoodSlug) : undefined;
      if (!found) throw new OptionSetError(404, "not_found", "No such neighbourhood in this plan's city");
      neighborhood = found;
    }
    if (!hotelName && !neighborhood) throw new OptionSetError(400, "invalid_body", "Name your hotel or pick a neighbourhood");
    source = {
      kind: "custom",
      title: hotelName || `Staying in ${neighborhood!.name}`,
      locationName: neighborhood?.name ?? null,
      lat: null,
      lng: null,
    };
  }
  // The source is resolved and validated BEFORE anything is written, so a refusal leaves no set.
  const set = await openSet();
  const option = await addOption({ tripId, setId: set.id, userId, source });
  const chosen = await chooseOption({ tripId, setId: set.id, optionId: option.id, userId });
  // S10-3: a stay typed by name (no listing, no coordinates) is looked up like any drafted stop.
  if (binding.kind === "own" && (binding.hotelName ?? "").trim()) await lookUpStayPlace(tripId, chosen.itemId);
  return { setId: set.id, itemId: chosen.itemId };
}

// Used by tests to assert the panel's inputs without a request.
export const __test = { dayCount, LODGING_CATEGORY, stayDecided };
