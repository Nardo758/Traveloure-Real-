/**
 * The ADVISORY half of the ready-made readiness read (work plan L1-9, enhancement 1; ruling R-bi).
 * Pure. Advisory lines never stop a submit; the BLOCKING half is the publish gate itself
 * (`assertReadyMadeComplete`), so submit's 400 and the readiness read cannot drift.
 *
 * Every line names what it is about so a checklist can jump to it (`dayNumber`, `itemId`, the leg's
 * stops, `anchorId`).
 *
 * STATED LIMITS (§13):
 *  · "legs not checked in 90 days" needs `transport_legs.checked_at` (migration 346, L1-1), which is
 *    not on this branch's base — it is not reported here.
 *  · photos (step 6, `place_photos`): read from what is already on hand — the listing's own image, a
 *    cached Google photo reference, a cached Commons row — and NEVER by a network call from this read.
 *    A stop whose photo was never looked up is "not checked yet", never "no photo" (§13).
 *  · reachability (Slice A2, ledger `2026-10-05-reachability-from-legs`): a stop the build's own leg
 *    can't reach in time, read by `unreachableStops` — the SAME rule and the SAME leg minutes the
 *    Finish card reads; a pair with no leg or no times is not checked, never called reachable.
 */
import { anchorConflicts } from "@shared/optimizer-lead";
import { isLodgingItem } from "@shared/where-to-stay";
import { unreachableLine, unreachableStops, type ReachLeg } from "@shared/leg-reachability";
import type { ReadyMadeLegLine } from "./trip-transport-legs.service";

export type ReadinessLine = {
  requirement: string;
  message: string;
  dayNumber?: number;
  itemId?: string;
  fromItemId?: string;
  toItemId?: string;
  legId?: string;
  anchorId?: string;
};

/**
 * A stop's photo as far as this read can tell without fetching: `has` (ours, a cached Google
 * reference or a cached Commons photo), `none` (looked, nothing usable), `unchecked` (never looked).
 */
export type StopPhotoState = "has" | "none" | "unchecked";

type Item = {
  id: string;
  title: string;
  dayNumber: number;
  itemType?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
};
type Anchor = {
  id: string;
  anchorType: string;
  anchorDatetime: string | Date;
  bufferBefore?: number | null;
  bufferAfter?: number | null;
  description?: string | null;
};

function located(i: Item): boolean {
  const la = Number(i.latitude);
  const ln = Number(i.longitude);
  return i.latitude != null && i.longitude != null && Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
}

/** `YYYY-MM-DD` of `start` plus `days`. */
function addDays(start: string, days: number): string {
  return new Date(Date.parse(`${start.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function readinessAdvisory(input: {
  items: readonly Item[];
  legAdvisory: readonly ReadyMadeLegLine[];
  /** item id → the fact types the plan already holds for it (`factsForTrip`). */
  factTypesByItem: ReadonlyMap<string, ReadonlySet<string>>;
  /** item id → its photo state (`stopPhotoStates`); an item absent from the map is not a photo stop. */
  photoStateByItem?: ReadonlyMap<string, StopPhotoState>;
  anchors: readonly Anchor[];
  buildStartDate: string | null;
  durationDays: number;
  /** The build's trip-scoped legs with their minutes — reachability reads nothing else. */
  legs?: readonly ReachLeg[];
}): ReadinessLine[] {
  const out: ReadinessLine[] = [...input.legAdvisory];

  if (input.legs?.length) {
    for (const u of unreachableStops(input.items, input.legs).unreachable) {
      out.push({ requirement: "reachability", message: unreachableLine(u), dayNumber: u.dayNumber, itemId: u.toItemId, fromItemId: u.fromItemId, toItemId: u.toItemId, legId: u.legId });
    }
  }

  // Stops with no opening hours on file: located, non-lodging stops only (a hotel or a transfer has
  // no opening hours to check).
  for (const i of input.items) {
    if (!located(i) || isLodgingItem({ type: i.itemType ?? null, title: i.title })) continue;
    if (input.factTypesByItem.get(i.id)?.has("hours")) continue;
    out.push({ requirement: "hours", message: `Day ${i.dayNumber}: ${i.title} has no opening hours checked`, dayNumber: i.dayNumber, itemId: i.id });
  }

  for (const i of input.items) {
    const state = input.photoStateByItem?.get(i.id);
    if (!state || state === "has") continue;
    out.push({
      requirement: "photos",
      message: state === "none" ? `Day ${i.dayNumber}: no photo found for ${i.title}` : `Day ${i.dayNumber}: ${i.title}'s photo hasn't been looked up yet`,
      dayNumber: i.dayNumber,
      itemId: i.id,
    });
  }

  if (input.buildStartDate) {
    const first = input.buildStartDate.slice(0, 10);
    const last = addDays(first, Math.max(0, input.durationDays - 1));
    // Anchors outside the build's day window would land on no day of the buyer's copy (R-bg).
    for (const a of input.anchors) {
      // `anchor_datetime` is a plain timestamp; drizzle maps it as UTC, so its stored calendar day is
      // the UTC day of the Date it returns.
      const day = new Date(a.anchorDatetime).toISOString().slice(0, 10);
      if (day < first || day > last) {
        out.push({ requirement: "anchor_window", message: `${a.anchorType.replace(/_/g, " ")} falls outside the trip's ${input.durationDays} day(s)`, anchorId: a.id });
      }
    }
    // Activities inside an anchor's buffer — THE rule `validate-schedule` runs (`anchorConflicts`).
    const scheduled = input.items.map((i) => ({ ...i, date: addDays(first, i.dayNumber - 1) }));
    for (const c of anchorConflicts(input.anchors, scheduled)) {
      out.push({ requirement: "schedule", message: c.conflict, anchorId: c.anchorId, ...(c.dayNumber != null ? { dayNumber: c.dayNumber } : {}) });
    }
  }
  return out;
}

/**
 * The photo state of each located, non-lodging stop, from the cache only (no Commons search, no Google
 * call). Reads the SAME inputs as the plan's photo read (`GET /api/trips/:tripId/place-photos`): the
 * listing image, the cached Google photo reference (`placeRefsForTrip`) and the `place_photos` row
 * through `photoCacheKey` and the service's own cache read.
 */
export async function stopPhotoStates(
  tripId: string,
  items: ReadonlyArray<Item & { providerServiceId?: string | null }>,
): Promise<Map<string, StopPhotoState>> {
  const { db } = await import("../db");
  const { providerServices } = await import("@shared/schema");
  const { inArray } = await import("drizzle-orm");
  const { placeRefsForTrip } = await import("./content-facts/place-facts.service");
  const { defaultPhotoDeps, photoCacheKey } = await import("./place-photos.service");
  const stops = items.filter((i) => located(i) && !isLodgingItem({ type: i.itemType ?? null, title: i.title }));
  const out = new Map<string, StopPhotoState>();
  if (!stops.length) return out;
  const serviceIds = stops.map((i) => i.providerServiceId).filter((x): x is string => !!x);
  const images = serviceIds.length
    ? new Map(
        (await db.select({ id: providerServices.id, image: providerServices.serviceImage }).from(providerServices).where(inArray(providerServices.id, serviceIds))).map(
          (r) => [r.id, r.image] as const,
        ),
      )
    : new Map<string, string | null>();
  const refs = await placeRefsForTrip(tripId, stops.map((i) => i.id));
  for (const i of stops) {
    const own = i.providerServiceId ? images.get(i.providerServiceId) : null;
    const ref = refs.get(i.id);
    if ((own && /^https?:\/\//i.test(own)) || ref?.photoRef) {
      out.set(i.id, "has");
      continue;
    }
    const key = photoCacheKey({ name: i.title, placeId: ref?.placeId ?? null, lat: ref?.lat ?? Number(i.latitude), lng: ref?.lng ?? Number(i.longitude) });
    const cached = key ? await defaultPhotoDeps.cacheGet(key) : undefined;
    out.set(i.id, cached ? "has" : cached === null ? "none" : "unchecked");
  }
  return out;
}
