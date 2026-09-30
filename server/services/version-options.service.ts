/**
 * THE PAID RUN, ONE VERSION PER HOTEL — the I/O half (Track A step A7; ledger
 * `2026-09-30-a7-version-per-option`; product map §M5 / §F2; R128). Every caller is gated on
 * `versionPerOptionEnabled()`; the rules themselves are pure in `shared/version-options.ts`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { planOptionSets, planOptions } from "@shared/schema";
import { toPoint } from "@shared/plan-fit";
import {
  earnedBadges,
  notRunOptionIds,
  versionOptionId,
  versionOptionSlots,
  type VersionBadge,
} from "@shared/version-options";
import { scoreAnchor, type AnchorScore, type StopPoint } from "./anchor-scoring";
import { listOptionSetsWithFit } from "./plan-option-sets.service";
import { versionPerOptionEnabled } from "../config/version-options.config";

/** One version's anchor option, scored against the plan's stops the same way the auto anchors are. */
export interface OptionSlot {
  optionId: string;
  setId: string;
  title: string;
  lat: number;
  lng: number;
  dayNumber: number;
  anchor: AnchorScore;
}

/**
 * The plan's open STAY comparison, turned into three version slots (§M5). Null when there is no
 * open accommodation set with a located option — the run then anchors exactly as before (R128).
 * Only LOCATED options can anchor a version: an unpinned option has nowhere to build around, so it
 * is listed "not run" rather than guessed onto the map (§13).
 */
export async function loadOpenSetSlots(
  tripId: string,
  stops: StopPoint[],
): Promise<{ setId: string; slots: OptionSlot[]; notRun: string[] } | null> {
  const sets = await listOptionSetsWithFit(tripId);
  const set = sets.find((s) => s.status === "open" && s.categoryKey === "accommodation");
  if (!set) return null;
  const located = set.options
    .map((o) => ({ o, p: toPoint(o.latitude, o.longitude) }))
    .filter((x): x is { o: (typeof set.options)[number]; p: { lat: number; lng: number } } => x.p !== null);
  if (located.length === 0) return null;
  const { slots, notRun } = versionOptionSlots(located.map(({ o }) => ({ id: o.id, fitRank: o.fitRank, position: o.position })));
  const byId = new Map(located.map((x) => [x.o.id, x]));
  const unlocated = set.options.filter((o) => !byId.has(o.id)).map((o) => o.id);
  return {
    setId: set.id,
    slots: slots.map((id) => {
      const { o, p } = byId.get(id)!;
      return {
        optionId: o.id,
        setId: set.id,
        title: o.title,
        lat: p.lat,
        lng: p.lng,
        dayNumber: set.dayNumber ?? 1,
        anchor: scoreAnchor({ id: `option:${o.id}`, type: "hotel", name: o.title, lat: p.lat, lng: p.lng }, stops),
      };
    }),
    notRun: [...notRun, ...unlocated],
  };
}

/** The ONE variant item that carries a version's pick (§F2 (2)): the stay itself, marked with its option. */
export function optionPickItem(variantId: string, slot: OptionSlot) {
  return {
    variantId,
    dayNumber: slot.dayNumber,
    name: slot.title,
    serviceType: "accommodation",
    latitude: slot.lat.toString(),
    longitude: slot.lng.toString(),
    metadata: { optionId: slot.optionId, setId: slot.setId },
    sortOrder: -1,
  };
}

export interface VersionDecoration {
  /** Per variant id: the option it anchors on (null = the set was left undecided), and its earned badges. */
  byVariant: Record<string, { optionId: string | null; badges: VersionBadge[] }>;
  /** The open set's options no version names ("not run", §M5), when the plan still has that set. */
  notRunOptionIds: string[] | null;
}

/** The comparison read's A7 fields — derived, never stored (R128 badges; §F2 picks; §M5 not-run). */
export async function decorateComparison(
  tripId: string | null,
  variants: ReadonlyArray<{ id: string; source: string | null; totalCost: unknown; totalTravelTime: unknown; averageRating: unknown; items: ReadonlyArray<{ metadata?: unknown }> }>,
): Promise<VersionDecoration> {
  const ai = variants.filter((v) => v.source !== "user");
  const badges = earnedBadges(
    ai.map((v) => ({
      id: v.id,
      totalCost: v.totalCost as number | null,
      totalTravelTime: v.totalTravelTime as number | null,
      averageRating: v.averageRating as number | null,
    })),
  );
  const byVariant: VersionDecoration["byVariant"] = {};
  const picks: Array<{ setId: string; optionId: string } | null> = [];
  for (const v of variants) {
    const pick = versionOptionId(v.items);
    picks.push(pick);
    byVariant[v.id] = { optionId: pick?.optionId ?? null, badges: badges[v.id] ?? [] };
  }
  const setIds = Array.from(new Set(picks.filter((p): p is NonNullable<typeof p> => !!p).map((p) => p.setId)));
  let notRun: string[] | null = null;
  if (tripId && setIds.length > 0) {
    const [set] = await db
      .select({ id: planOptionSets.id })
      .from(planOptionSets)
      .where(and(eq(planOptionSets.tripId, tripId), inArray(planOptionSets.id, setIds), eq(planOptionSets.status, "open")))
      .limit(1);
    if (set) {
      const opts = await db.select({ id: planOptions.id }).from(planOptions).where(eq(planOptions.setId, set.id));
      notRun = notRunOptionIds(
        opts.map((o) => o.id),
        picks.filter((p) => p?.setId === set.id).map((p) => p!.optionId),
      );
    }
  }
  return { byVariant, notRunOptionIds: notRun };
}

/**
 * The route's one call before a run: the open stay comparison's version slots, or undefined — with
 * the flag off, with a pinned anchor (the traveler's explicit "build around this" still wins), with
 * no trip, or when the lookup fails (fail-open: the run anchors exactly as before, never fails).
 */
export async function openSetSlotsForRun(
  tripId: string | null | undefined,
  baselineItems: ReadonlyArray<{ id: unknown; latitude?: unknown; longitude?: unknown }>,
  pinnedAnchor: unknown,
): Promise<OptionSlot[] | undefined> {
  if (!versionPerOptionEnabled() || pinnedAnchor || !tripId) return undefined;
  try {
    const stops: StopPoint[] = baselineItems.map((it) => {
      const p = toPoint(it.latitude, it.longitude);
      return { id: String(it.id), lat: p?.lat ?? null, lng: p?.lng ?? null };
    });
    const loaded = await loadOpenSetSlots(tripId, stops);
    return loaded && loaded.slots.length > 0 ? loaded.slots : undefined;
  } catch (err) {
    console.warn("[A7] open-set slots failed (non-critical):", (err as Error).message);
    return undefined;
  }
}
