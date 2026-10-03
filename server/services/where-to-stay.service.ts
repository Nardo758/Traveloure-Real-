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
  optimizerRuns,
  placeFacts,
  planOptionSets,
  providerServices,
  serviceCategories,
  trips,
} from "@shared/schema";
import {
  WHERE_TO_STAY_MIN_DAYS,
  distinguishingReasons,
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
  type WhereToStayView,
} from "@shared/where-to-stay";
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
} from "./plan-option-sets.service";

const LODGING_CATEGORY = /hotel|accommodation|lodging|ryokan|stay/i;

function dayCount(start: unknown, end: unknown): number | null {
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

/** Has the plan decided where to stay? A stay item, or a lodging set already chosen, closed or open. */
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
    .where(and(eq(planOptionSets.tripId, tripId), eq(planOptionSets.categoryKey, "accommodation")))
    .limit(1);
  return !!set;
}

async function hasPaidOptimizerRun(tripId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: optimizerRuns.id })
    .from(optimizerRuns)
    .where(and(eq(optimizerRuns.tripId, tripId), eq(optimizerRuns.authorizationBasis, "paid")))
    .limit(1);
  return !!row;
}

async function cityNeighborhoodRows(city: string): Promise<Array<StayNeighborhood & { description: string | null }>> {
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
async function cityHotels(city: string): Promise<Array<StayHotel & { lat: number; lng: number }>> {
  const [platform, cache, affiliate] = await Promise.all([
    // R-o: stays LISTED ON TRAVELOURE — the same public read gate every listing surface uses
    // (approved + active), in the accommodation category, in this city, with a confirmed pin.
    db
      .select({ id: providerServices.id, name: providerServices.serviceName, lat: providerServices.latitude, lng: providerServices.longitude })
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
    out.push({ kind: "platform", id: p.id, name: p.name, starRating: null, lat, lng });
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
    .select({ destination: trips.destination, startDate: trips.startDate, endDate: trips.endDate, marketSlug: trips.marketSlug })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return empty("not_found");
  const city = (trip.destination ?? "").split(",")[0].trim() || null;
  const days = dayCount(trip.startDate, trip.endDate);
  if (days === null || days < WHERE_TO_STAY_MIN_DAYS) return empty("single_day", city);

  // Surface step 3: "decided" is asked FIRST, so a Skip on the pre-draft AnchorPanel (a closed
  // lodging set) keeps the panel away on reload, before and after a draft alike.
  if (await stayDecided(tripId)) return empty("decided", city);
  const items = await fitItems(tripId);
  if (!items.length) return empty("no_draft", city);

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
    if (travelTimeServiceEnabled() && trip.marketSlug && (await hasPaidOptimizerRun(tripId))) {
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
  return {
    eligible: true,
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
  | { kind: "skip" };

/** Bind the traveler's answer through the option-set rail. Returns the set and, when one was made, the stay item. */
export async function bindWhereToStay(
  tripId: string,
  userId: string,
  binding: StayBinding,
): Promise<{ setId: string; itemId: string | null }> {
  if (!(await planRole(tripId, userId, "choose"))) throw new OptionSetError(404, "not_found", "No such plan");
  if (await stayDecided(tripId)) throw new OptionSetError(409, "stay_decided", "This plan already says where you're staying");
  const openSet = () => createOptionSet({ tripId, userId, categoryKey: "accommodation", label: "Where to stay", anchor: true });

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
  return { setId: set.id, itemId: chosen.itemId };
}

// Used by tests to assert the panel's inputs without a request.
export const __test = { dayCount, LODGING_CATEGORY, stayDecided };
