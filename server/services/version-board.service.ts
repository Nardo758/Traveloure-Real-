/**
 * THE VERSIONS BOARD — read, per-day apply, and the day re-time (surface step 5; spec v1.2 §2.4;
 * R-d, R-ac; ledger `2026-10-04-surface-step5-map-versions`; migrations 343/344). The rules are pure
 * in `shared/version-board.ts`; this module loads rows and writes.
 *
 *   · READ: the plan's LATEST run — its three AI versions (one `run_id`, else the three newest of one
 *     generate), labelled A/B/C by run order and dated by the run; older runs stay stored, not shown.
 *     "Your plan" is the LIVE plan, never the stored baseline row. Each version carries its stops per
 *     day, its diff against the plan, its one badge (where a metric strictly wins) and its anchor.
 *     No travel minute, hour or distance value leaves (R-h).
 *   · APPLY-DAYS: `{day, variantId}[]` replaces ONLY those days. A version stop that keeps a plan item
 *     MOVES that row (same id, its comments and facts with it); a new stop is inserted; a plan item
 *     the version dropped from the day is removed. Protected rows (booked, checked out, expert work,
 *     locked, held by an open set) are never moved or removed. Adopted rows carry `source_run_id` /
 *     `source_variant_id` (migration 343). The run and the stored draft are never touched; days not
 *     named are untouched. Where you stay follows the version most adopted days come from.
 *   · RE-TIME: one day, in the traveler's order, through the ONE spacing rule (`retimeDayInOrder`,
 *     no model call). Free `OPTIMIZER_FREE_RETIMES` times per version within 24 h of the run, counted
 *     in `plan_day_retimes` (migration 344) under the plan row's lock; past that it is REFUSED with
 *     the paid-run answer and nothing is written.
 */
import { stampItemSourceClass } from "@shared/content-tiers";
import crypto from "node:crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { feeLedger, itineraryComparisons, itineraryItems, itineraryVariantItems, itineraryVariantMetrics, itineraryVariants, planDayRetimes, trips } from "@shared/schema";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import { factPointsForTrip } from "./content-facts/place-facts.service";
import { VERSION_SANITY_KEYS, type VersionSanityKey } from "./version-sanity";
import {
  diffVersionDays,
  retimeIsFree,
  retimeLine,
  recommendedVersion,
  runChargeFromLedger,
  type RunCharge,
  versionBadges,
  versionLabel,
  type BoardStop,
  type DayDiff,
  type BadgeKey,
} from "@shared/version-board";
import { isPlanAnchorItemType } from "@shared/draft-basis";
import { itineraryItemIsMachineProtected } from "@shared/itinerary-item-lock";
import { optionPickOf } from "@shared/version-options";
import { CHECK_METRIC_PREFIX, HELD_VARIANT_STATUS, isShownVariantStatus, isVersionStayPick } from "@shared/version-check";
import { checkPlan, type PlanIssue } from "@shared/plan-check";
import { itineraryItemNotMachineProtected } from "./itinerary-rebuild-guard";
import { choosePickInTx, openSetHeldItemIds } from "./version-adopt.service";
import { planRole } from "./plan-option-sets.service";
import { recordRunOutcome } from "./optimizer-runs.service";
import { optimizerFreeRetimes } from "../config/optimizer-retimes.config";
import { complexityTier, retimeDayInOrder } from "./smart-sequencing.service";
import { getFee } from "./optimization-fee.service";
import { OPTIMIZER_RUN_TOLL_SOURCE_TYPE } from "./fee-ledger.service";
import { coversAction, tripHasPass } from "./trip-entitlement.service";

export class VersionBoardError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const num = (v: unknown): number | null => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The plan's latest run: its AI versions in run order. Null when the plan has none.
 * FB-1 step 3: the run is found counting HELD versions too, so a run whose every version failed the check is still
 * the latest run (never the previous run's versions shown in its place); `variants` are the shown ones only and
 * `held` the ones the check held.
 */
export async function latestRun(tripId: string): Promise<{
  comparisonId: string;
  runId: string | null;
  runAt: Date;
  variants: Array<typeof itineraryVariants.$inferSelect>;
  held: Array<typeof itineraryVariants.$inferSelect>;
} | null> {
  const rows = await db
    .select({ v: itineraryVariants })
    .from(itineraryVariants)
    .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
    .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryVariants.source, "ai_optimized"), inArray(itineraryVariants.status, ["generated", HELD_VARIANT_STATUS])))
    .orderBy(desc(itineraryVariants.createdAt))
    .limit(12);
  if (!rows.length) return null;
  const newest = rows[0].v;
  // One run: the same run_id when run records are on; otherwise the versions one generate wrote
  // (same comparison, created within minutes of the newest — a generate writes its three together).
  const sameRun = rows
    .map((r) => r.v)
    .filter((v) =>
      newest.runId
        ? v.runId === newest.runId
        : v.comparisonId === newest.comparisonId && Math.abs(new Date(v.createdAt as any).getTime() - new Date(newest.createdAt as any).getTime()) < 10 * 60_000,
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .slice(0, 3);
  const runAt = new Date(Math.min(...sameRun.map((v) => new Date(v.createdAt as any).getTime())));
  return {
    comparisonId: newest.comparisonId,
    runId: newest.runId ?? null,
    runAt,
    variants: sameRun.filter((v) => isShownVariantStatus(v.status)),
    held: sameRun.filter((v) => !isShownVariantStatus(v.status)),
  };
}

async function planStops(tripId: string, exec: any = db): Promise<Array<BoardStop & { routingStatus: string | null; title: string }>> {
  const rows = await exec
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder), asc(itineraryItems.startTime));
  return rows
    .filter((r: any) => r.dayNumber != null && !isPlanAnchorItemType(r.itemType))
    .map((r: any) => ({
      id: r.id,
      providerServiceId: r.providerServiceId ?? null,
      name: r.title,
      title: r.title,
      dayNumber: r.dayNumber,
      startTime: r.startTime || null,
      endTime: r.endTime || null,
      durationMinutes: r.durationMinutes ?? null,
      lat: num(r.latitude),
      lng: num(r.longitude),
      sourceVariantId: r.sourceVariantId ?? null,
      routingStatus: r.routingStatus ?? null,
      // A fixed point the optimizer never moves (the same classes apply-days never touches).
      fixed: r.routingStatus !== "in_planning" || !!r.bookingId || itineraryItemIsMachineProtected(r),
    }));
}

async function versionStops(variantIds: string[], exec: any = db) {
  if (!variantIds.length) return [];
  const rows = await exec
    .select()
    .from(itineraryVariantItems)
    .where(inArray(itineraryVariantItems.variantId, variantIds))
    .orderBy(asc(itineraryVariantItems.dayNumber), asc(itineraryVariantItems.sortOrder));
  return rows as Array<typeof itineraryVariantItems.$inferSelect>;
}

// FB-1 step 3: the ONE stay-pick rule lives in shared/version-check.ts, read by the board and the version check alike.
const isStayPick = isVersionStayPick;

function toBoardStop(r: typeof itineraryVariantItems.$inferSelect): BoardStop {
  return {
    id: r.id,
    sourceItemId: r.sourceItemId ?? null,
    providerServiceId: r.providerServiceId ?? null,
    name: r.name,
    dayNumber: r.dayNumber,
    startTime: r.startTime || null,
    endTime: r.endTime || null,
    durationMinutes: r.duration ?? null,
    lat: num(r.latitude),
    lng: num(r.longitude),
  };
}

type Point = { lat: number; lng: number };

/**
 * V-1: where the board draws a plan item, located the way the slip locates it — the row's own
 * point only when `rowCoordinatesTrusted`, else Google's cached `location` fact (30-day, LD 57). READ
 * ONLY: the apply and re-time paths never see these points, so a Google point is never written. Also
 * returns each row's raw point, so a version stop that saved an untrusted (area-centroid) copy of it
 * can be recognised and located properly.
 */
async function planPointsForRead(tripId: string): Promise<{ point: Map<string, Point>; untrustedRaw: Map<string, Point> }> {
  const rows = await db
    .select({
      id: itineraryItems.id,
      latitude: itineraryItems.latitude,
      longitude: itineraryItems.longitude,
      origin: itineraryItems.origin,
      locationName: itineraryItems.locationName,
      locationAddress: itineraryItems.locationAddress,
    })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId));
  const point = new Map<string, Point>();
  const untrustedRaw = new Map<string, Point>();
  const missing: string[] = [];
  for (const r of rows) {
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    const raw = lat != null && lng != null ? { lat, lng } : null;
    if (raw && rowCoordinatesTrusted(r)) point.set(r.id, raw);
    else {
      if (raw) untrustedRaw.set(r.id, raw);
      missing.push(r.id);
    }
  }
  if (missing.length) {
    const facts = await factPointsForTrip(tripId).catch(() => new Map<string, Point>());
    for (const id of missing) {
      const f = facts.get(id);
      if (f) point.set(id, f);
    }
  }
  return { point, untrustedRaw };
}

/** A version stop's point: its saved one, unless that is a copy of its kept plan item's untrusted
 *  (centroid) point; then, or when it saved none, its kept plan item's read-time point. */
function locateVersionStop(stop: BoardStop, pts: { point: Map<string, Point>; untrustedRaw: Map<string, Point> }): BoardStop {
  const kept = stop.sourceItemId ?? null;
  const saved = stop.lat != null && stop.lng != null ? { lat: stop.lat, lng: stop.lng } : null;
  const raw = kept ? pts.untrustedRaw.get(kept) : undefined;
  const savedIsCentroid = !!saved && !!raw && raw.lat === saved.lat && raw.lng === saved.lng;
  if (saved && !savedIsCentroid) return stop;
  const p = kept ? pts.point.get(kept) ?? null : null;
  return { ...stop, lat: p?.lat ?? null, lng: p?.lng ?? null };
}

/** V-1: a version's sanity flags, read from its metric rows (one per flag type). */
export interface VersionFlag {
  key: VersionSanityKey;
  count: number;
  stopNames: string[];
}

/** FB-1 step 3: the versions whose `check_coverage_reduced` row says fewer checks ran than on the draft. */
async function versionCoverageReduced(variantIds: string[]): Promise<Set<string>> {
  if (!variantIds.length) return new Set();
  const rows = await db
    .select({ variantId: itineraryVariantMetrics.variantId, value: itineraryVariantMetrics.value })
    .from(itineraryVariantMetrics)
    .where(and(inArray(itineraryVariantMetrics.variantId, variantIds), eq(itineraryVariantMetrics.metricKey, `${CHECK_METRIC_PREFIX}coverage_reduced`)));
  return new Set(rows.filter((r) => num(r.value) === 1).map((r) => r.variantId));
}

async function versionFlags(variantIds: string[]): Promise<Map<string, VersionFlag[]>> {
  const out = new Map<string, VersionFlag[]>();
  if (!variantIds.length) return out;
  const rows = await db
    .select({
      variantId: itineraryVariantMetrics.variantId,
      metricKey: itineraryVariantMetrics.metricKey,
      value: itineraryVariantMetrics.value,
      description: itineraryVariantMetrics.description,
    })
    .from(itineraryVariantMetrics)
    .where(and(inArray(itineraryVariantMetrics.variantId, variantIds), inArray(itineraryVariantMetrics.metricKey, [...VERSION_SANITY_KEYS])));
  for (const r of rows) {
    const count = num(r.value);
    if (count == null || count <= 0) continue;
    const stopNames = (r.description ?? "").split(", ").map((x) => x.trim()).filter(Boolean);
    out.set(r.variantId, [...(out.get(r.variantId) ?? []), { key: r.metricKey as VersionSanityKey, count, stopNames }]);
  }
  for (const [id, list] of Array.from(out.entries())) {
    out.set(id, list.sort((a, b) => VERSION_SANITY_KEYS.indexOf(a.key) - VERSION_SANITY_KEYS.indexOf(b.key)));
  }
  return out;
}

/**
 * Past the free re-times, a re-time is the EXISTING paid optimizer run — this states its price from
 * the one fee resolver (`getFee`, §8 — no literal here) and the Trip Pass coverage the charge path
 * itself reads, so the refusal names what the run would cost. No charge happens here.
 */
export async function paidRetimeFee(tripId: string): Promise<{ priceCents: number | null; currency: string | null; coveredByTripPass: boolean; label: string | null }> {
  const [trip] = await db.select({ eventType: trips.eventType }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const eventType = trip?.eventType ?? undefined;
  const covered = await coversAction(tripId, "optimizer_run").catch(() => false);
  if (covered) return { priceCents: null, currency: null, coveredByTripPass: true, label: "covered by your Trip Pass" };
  const resolved = await getFee(eventType, complexityTier(eventType)).catch(() => null);
  if (!resolved || resolved.isDisabled || !(resolved.priceCents > 0)) return { priceCents: null, currency: null, coveredByTripPass: false, label: null };
  const amount = (resolved.priceCents / 100).toFixed(2);
  const label = resolved.currency && resolved.currency.toUpperCase() !== "USD" ? `${resolved.currency.toUpperCase()} ${amount}` : `$${amount}`;
  return { priceCents: resolved.priceCents, currency: resolved.currency, coveredByTripPass: false, label };
}

export interface VersionsBoardView {
  /** `charge` is present for the plan's OWNER only (held-batch-1 item 23) — what they paid is theirs. */
  run: { comparisonId: string; runId: string | null; runAt: string; charge?: RunCharge | null } | null;
  plan: { stops: BoardStop[] };
  versions: Array<{
    variantId: string;
    label: string;
    name: string;
    badge: BadgeKey | null;
    /** Held-batch-1 item 22: the strict winner by S1's tiebreak (`recommendedVersion`); at most one. */
    recommended: boolean;
    /** V-1: `type` is the stored anchor kind (hotel | neighborhood | activity), null when unknown. */
    anchor: { name: string; type: string | null; lat: number | null; lng: number | null } | null;
    /** V-1: the version's sanity flags; empty when none fired (or the run predates them). */
    flags: VersionFlag[];
    /** FB-1 step 3: fewer checks ran on this version than on the draft (it passed, and says so). */
    coverageReduced: boolean;
    stops: BoardStop[];
    days: DayDiff[];
  }>;
  /**
   * FB-1 step 3 (ruling 4): present only when the run's every version was held — the draft's own open issues, each
   * with its one fix, for "We couldn't make a version of this plan that clears every problem." Never a partial version.
   */
  blocked?: { heldCount: number; openIssues: PlanIssue[] };
  retimes: { limit: number; used: Record<string, number>; windowEndsAt: string | null; free: Record<string, boolean>; unlimited?: boolean };
}

export async function loadVersionsBoard(tripId: string, now = new Date(), viewerId: string | null = null): Promise<VersionsBoardView> {
  const pts = await planPointsForRead(tripId);
  const plan = (await planStops(tripId)).map((p) => {
    const at = pts.point.get(p.id) ?? null;
    return { ...p, lat: at?.lat ?? null, lng: at?.lng ?? null };
  });
  const run = await latestRun(tripId);
  const limit = optimizerFreeRetimes();
  if (!run) return { run: null, plan: { stops: plan }, versions: [], retimes: { limit, used: {}, windowEndsAt: null, free: {} } };
  const items = (await versionStops(run.variants.map((v) => v.id))).filter((r) => !isStayPick(r as any));
  const versions = run.variants.map((v, i) => {
    const stops = items.filter((r) => r.variantId === v.id).map((r) => locateVersionStop(toBoardStop(r), pts));
    return { v, i, stops };
  });
  const badges = versionBadges(versions.map((x) => ({ id: x.v.id, stops: x.stops })));
  const recommendedId = recommendedVersion(versions.map((x) => ({ id: x.v.id, stops: x.stops })));
  const used = await retimeCounts(tripId, run.runAt);
  const free: Record<string, boolean> = {};
  const unlimited = await tripHasPass(tripId).catch(() => false);
  for (const x of versions) free[x.v.id] = retimeIsFree({ runAt: run.runAt, now, used: used[x.v.id] ?? 0, limit, unlimited });
  const anchorOf = (v: (typeof run.variants)[number]) =>
    v.anchorName ? { name: v.anchorName, type: v.anchorType ?? null, lat: num(v.anchorLat), lng: num(v.anchorLng) } : null;
  const flags = await versionFlags(run.variants.map((v) => v.id));
  const reduced = await versionCoverageReduced(run.variants.map((v) => v.id));
  // FB-1 step 3 ruling 4: no version cleared every problem ⇒ the draft's own open issues and fixes.
  let blocked: VersionsBoardView["blocked"];
  if (run.variants.length === 0 && run.held.length > 0) {
    const { loadPlanCheckInput } = await import("./optimizer-lead.service");
    const { input } = await loadPlanCheckInput(tripId);
    blocked = { heldCount: run.held.length, openIssues: checkPlan(input).issues };
  }
  return {
    run: {
      comparisonId: run.comparisonId,
      runId: run.runId,
      runAt: run.runAt.toISOString(),
      ...((await viewerOwnsPlan(tripId, viewerId)) ? { charge: await runCharge(run.comparisonId, run.runAt) } : {}),
    },
    plan: { stops: plan },
    versions: versions.map(({ v, i, stops }) => ({
      variantId: v.id,
      // FB-1 step 3: the label follows the version's own slot, so a held A never relabels B as "A".
      label: versionLabel(v.sortOrder != null && v.sortOrder >= 1 ? v.sortOrder - 1 : i),
      name: v.name,
      badge: badges.get(v.id) ?? null,
      recommended: recommendedId === v.id,
      anchor: anchorOf(v),
      flags: flags.get(v.id) ?? [],
      coverageReduced: reduced.has(v.id),
      stops,
      days: diffVersionDays(plan, stops),
    })),
    ...(blocked ? { blocked } : {}),
    retimes: { limit, used, windowEndsAt: new Date(run.runAt.getTime() + 24 * 3600_000).toISOString(), free, unlimited },
  };
}

async function viewerOwnsPlan(tripId: string, viewerId: string | null): Promise<boolean> {
  if (!viewerId) return false;
  const [t] = await db.select({ userId: trips.userId }).from(trips).where(eq(trips.id, tripId)).limit(1);
  return !!t && t.userId === viewerId;
}

/** The latest run's charge from its optimizer toll rows; NULL when unreadable (§13 — never "free"). */
async function runCharge(comparisonId: string, runAt: Date): Promise<RunCharge | null> {
  try {
    const rows = await db
      .select({
        id: feeLedger.id,
        feeType: feeLedger.feeType,
        amount: feeLedger.amount,
        currency: feeLedger.currency,
        createdAt: feeLedger.createdAt,
        stripePaymentRef: feeLedger.stripePaymentRef,
        reversesLedgerId: feeLedger.reversesLedgerId,
        metadata: feeLedger.metadata,
      })
      .from(feeLedger)
      .where(and(eq(feeLedger.sourceType, OPTIMIZER_RUN_TOLL_SOURCE_TYPE), eq(feeLedger.sourceId, comparisonId)));
    return runChargeFromLedger(rows as any, runAt);
  } catch {
    return null;
  }
}

async function retimeCounts(tripId: string, since: Date, exec: any = db): Promise<Record<string, number>> {
  const rows = await exec
    .select({ variantId: planDayRetimes.variantId, n: sql<number>`count(*)::int` })
    .from(planDayRetimes)
    .where(and(eq(planDayRetimes.tripId, tripId), gte(planDayRetimes.createdAt, since)))
    .groupBy(planDayRetimes.variantId);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.variantId ?? ""] = Number(r.n);
  return out;
}

// ── apply-days ──────────────────────────────────────────────────────────────────────────────────

const updatableWhere = (tripId: string, id: string) =>
  and(eq(itineraryItems.id, id), eq(itineraryItems.tripId, tripId), eq(itineraryItems.routingStatus, "in_planning"), sql`${itineraryItems.bookingId} IS NULL`, itineraryItemNotMachineProtected());

/** FB-1 step 4: a dry run's way out of `applyDays`' transaction — the counts leave, every write rolls back. */
class ApplyDaysDryRun extends Error {
  constructor(readonly result: { days: Array<{ day: number; variantId: string; moved: number; added: number; removed: number; kept: number }>; stay: unknown }) {
    super("apply-days dry run");
  }
}

export async function applyDays(input: {
  tripId: string;
  userId: string;
  days: Array<{ day: number; variantId: string }>;
  /**
   * FB-1 step 4 (confirm before apply): run the SAME diff and roll it back — the counts a confirm screen shows are
   * the counts the write would make, and nothing is written.
   */
  dryRun?: boolean;
}): Promise<{ days: Array<{ day: number; variantId: string; moved: number; added: number; removed: number; kept: number }>; stay: unknown }> {
  try {
    return await applyDaysTx(input);
  } catch (err) {
    if (err instanceof ApplyDaysDryRun) return err.result;
    throw err;
  }
}

async function applyDaysTx(input: {
  tripId: string;
  userId: string;
  days: Array<{ day: number; variantId: string }>;
  dryRun?: boolean;
}): Promise<{ days: Array<{ day: number; variantId: string; moved: number; added: number; removed: number; kept: number }>; stay: unknown }> {
  const run = await latestRun(input.tripId);
  if (!run) throw new VersionBoardError(409, "no_run", "This plan has no optimized versions to adopt from");
  const byId = new Map(run.variants.map((v) => [v.id, v]));
  const seen = new Set<number>();
  for (const d of input.days) {
    if (!byId.has(d.variantId)) throw new VersionBoardError(404, "not_found", "No such version on this plan");
    if (seen.has(d.day)) throw new VersionBoardError(400, "duplicate_day", "Each day can be adopted from one version");
    seen.add(d.day);
  }
  const role = await planRole(input.tripId, input.userId, "choose");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM trips WHERE id = ${input.tripId} FOR UPDATE`);
    const held = new Set(await openSetHeldItemIds(tx, input.tripId));
    const items = await versionStops(input.days.map((d) => d.variantId), tx);
    const results: Array<{ day: number; variantId: string; moved: number; added: number; removed: number; kept: number }> = [];
    for (const { day, variantId } of input.days) {
      const plan = await planStops(input.tripId, tx);
      const planIds = new Set(plan.map((p) => p.id));
      const vDay = items.filter((r) => r.variantId === variantId && r.dayNumber === day && !isStayPick(r as any));
      const keeps = new Set(vDay.map((r) => r.sourceItemId).filter((x): x is string => !!x && planIds.has(x)));
      const v = byId.get(variantId)!;
      let moved = 0;
      let added = 0;
      let removed = 0;
      let kept = 0;
      // 1. The day's plan items the version does not keep are removed — unless protected or held.
      // item-removed:replace — adopting a version's day replaces that day's in_planning set.
      for (const p of plan.filter((x) => x.dayNumber === day && !keeps.has(x.id) && !held.has(x.id))) {
        const del = await tx.delete(itineraryItems).where(updatableWhere(input.tripId, p.id)).returning({ id: itineraryItems.id });
        removed += del.length;
      }
      // 2. Each version stop: move the plan row it keeps, else insert it (deduped against survivors).
      const survivors = await planStops(input.tripId, tx);
      const survivorServiceIds = new Set(survivors.map((s) => s.providerServiceId).filter(Boolean));
      const survivorTitles = new Set(survivors.filter((s) => s.dayNumber === day).map((s) => s.title.trim().toLowerCase()));
      for (let sortOrder = 0; sortOrder < vDay.length; sortOrder++) {
        const r = vDay[sortOrder];
        const provenance = { sourceRunId: v.runId ?? null, sourceVariantId: v.id };
        if (r.sourceItemId && keeps.has(r.sourceItemId)) {
          const prior = plan.find((p) => p.id === r.sourceItemId)!;
          const upd = await tx
            .update(itineraryItems)
            .set({ dayNumber: day, startTime: r.startTime || "", endTime: r.endTime || null, sortOrder, ...provenance, updatedAt: new Date() } as any)
            .where(updatableWhere(input.tripId, r.sourceItemId))
            .returning({ id: itineraryItems.id });
          if (upd.length) {
            if (prior.dayNumber === day && (prior.startTime || null) === (r.startTime || null)) kept++;
            else moved++;
          }
          continue;
        }
        if (r.providerServiceId && survivorServiceIds.has(r.providerServiceId)) continue;
        if (survivorTitles.has(r.name.trim().toLowerCase())) continue;
        // FD-2 ruling 9: stamped from the row's origin.
        await tx.insert(itineraryItems).values(stampItemSourceClass({
          tripId: input.tripId,
          providerServiceId: r.providerServiceId ?? null,
          title: r.name,
          description: r.description || "",
          itemType: r.serviceType || "activity",
          status: "planned",
          dayNumber: day,
          startTime: r.startTime || "",
          endTime: r.endTime || null,
          durationMinutes: r.duration ?? null,
          locationName: r.location || "",
          estimatedCost: r.price ? String(r.price) : null,
          currency: "USD",
          sortOrder,
          suggestedBy: "AI Optimizer",
          origin: "ai",
          latitude: r.latitude ? String(r.latitude) : null,
          longitude: r.longitude ? String(r.longitude) : null,
          ...provenance,
        }) as any);
        added++;
      }
      await recordRunOutcome(tx, { variantId, kind: "adopted_part", actorId: input.userId, variantItemIds: vDay.map((r) => r.id) });
      results.push({ day, variantId, moved, added, removed, kept });
    }
    // 3. Where you stay follows the version most adopted days come from (ties → the earliest label).
    const tally = new Map<string, number>();
    for (const d of input.days) tally.set(d.variantId, (tally.get(d.variantId) ?? 0) + 1);
    const lead = run.variants.filter((x) => tally.has(x.id)).sort((a, b) => (tally.get(b.id)! - tally.get(a.id)!) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)))[0];
    let stay: unknown = null;
    if (lead) {
      const pickRow = items.find((r) => r.variantId === lead.id && optionPickOf(r.metadata));
      const pick = pickRow ? optionPickOf(pickRow.metadata) : null;
      if (pick) stay = await choosePickInTx(tx, { tripId: input.tripId, userId: input.userId, role, pick, via: "version_whole" });
    }
    if (input.dryRun) throw new ApplyDaysDryRun({ days: results, stay: null });
    return { days: results, stay };
  });
}

// ── re-time (R-ac) ──────────────────────────────────────────────────────────────────────────────

export async function retimeDay(input: {
  tripId: string;
  userId: string;
  day: number;
  order: string[];
  swapIn?: { variantItemId: string } | null;
  now?: Date;
}): Promise<{ day: number; items: Array<{ id: string; startTime: string; endTime: string }>; remaining: number }> {
  const now = input.now ?? new Date();
  const run = await latestRun(input.tripId);
  if (!run) throw new VersionBoardError(409, "no_run", "Re-timing a day works on an optimized plan");
  const limit = optimizerFreeRetimes();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM trips WHERE id = ${input.tripId} FOR UPDATE`);
    const plan = (await planStops(input.tripId, tx)).filter((p) => p.dayNumber === input.day);
    // "Same version": the version this day was adopted from (its rows' provenance); a day never
    // adopted counts under no version.
    const [prov] = await tx
      .select({ variantId: itineraryItems.sourceVariantId, runId: itineraryItems.sourceRunId })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, input.tripId), eq(itineraryItems.dayNumber, input.day), sql`${itineraryItems.sourceVariantId} IS NOT NULL`))
      .limit(1);
    const variantId = prov?.variantId ?? null;
    const used = (await retimeCounts(input.tripId, run.runAt, tx))[variantId ?? ""] ?? 0;
    if (!retimeIsFree({ runAt: run.runAt, now, used, limit, unlimited: await tripHasPass(input.tripId).catch(() => false) })) {
      const fee = await paidRetimeFee(input.tripId);
      throw new VersionBoardError(409, "retime_paid", retimeLine({ free: false, remaining: 0, feeLabel: fee.label }), { limit, used, fee });
    }
    // A swap-in: the version's stop joins this day (moved if it keeps a plan row elsewhere, else inserted).
    let order = [...input.order];
    if (input.swapIn) {
      const [vs] = await tx.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.id, input.swapIn.variantItemId)).limit(1);
      if (!vs || !run.variants.some((v) => v.id === vs.variantId)) throw new VersionBoardError(404, "not_found", "No such stop in this plan's versions");
      const v = run.variants.find((x) => x.id === vs.variantId)!;
      const allPlan = await planStops(input.tripId, tx);
      if (vs.sourceItemId && allPlan.some((p) => p.id === vs.sourceItemId)) {
        await tx.update(itineraryItems).set({ dayNumber: input.day, sourceRunId: v.runId ?? null, sourceVariantId: v.id, updatedAt: new Date() } as any).where(updatableWhere(input.tripId, vs.sourceItemId));
        if (!order.includes(vs.sourceItemId)) order.push(vs.sourceItemId);
      } else {
        const [row] = await tx
          .insert(itineraryItems)
          .values(stampItemSourceClass({
            tripId: input.tripId,
            providerServiceId: vs.providerServiceId ?? null,
            title: vs.name,
            description: vs.description || "",
            itemType: vs.serviceType || "activity",
            status: "planned",
            dayNumber: input.day,
            startTime: vs.startTime || "",
            durationMinutes: vs.duration ?? null,
            locationName: vs.location || "",
            sortOrder: order.length,
            suggestedBy: "AI Optimizer",
            origin: "ai",
            latitude: vs.latitude ? String(vs.latitude) : null,
            longitude: vs.longitude ? String(vs.longitude) : null,
            sourceRunId: v.runId ?? null,
            sourceVariantId: v.id,
          }) as any)
          .returning({ id: itineraryItems.id });
        order.push(row.id);
      }
    }
    const dayRows = await tx.select().from(itineraryItems).where(and(eq(itineraryItems.tripId, input.tripId), eq(itineraryItems.dayNumber, input.day)));
    const byIdRow = new Map(dayRows.filter((r: any) => !isPlanAnchorItemType(r.itemType)).map((r: any) => [r.id, r]));
    const ordered = order.filter((id) => byIdRow.has(id));
    for (const p of plan) if (!ordered.includes(p.id) && byIdRow.has(p.id)) ordered.push(p.id);
    const timed = retimeDayInOrder(
      ordered.map((id) => {
        const r: any = byIdRow.get(id);
        return { id, name: r.title, serviceType: r.itemType || "activity", dayNumber: input.day, startTime: r.startTime || undefined, endTime: r.endTime || undefined, duration: r.durationMinutes ?? undefined };
      }),
    );
    const out: Array<{ id: string; startTime: string; endTime: string }> = [];
    for (let sortOrder = 0; sortOrder < timed.length; sortOrder++) {
      const t = timed[sortOrder];
      const upd = await tx
        .update(itineraryItems)
        .set({ sortOrder, startTime: t.startTime!, endTime: t.endTime!, updatedAt: new Date() } as any)
        .where(updatableWhere(input.tripId, t.id!))
        .returning({ id: itineraryItems.id });
      if (upd.length) out.push({ id: t.id!, startTime: t.startTime!, endTime: t.endTime! });
    }
    await tx.insert(planDayRetimes).values({
      id: crypto.randomUUID(),
      tripId: input.tripId,
      runId: prov?.runId ?? run.runId,
      variantId,
      day: input.day,
      userId: input.userId,
      createdAt: now,
    });
    return { day: input.day, items: out, remaining: Math.max(0, limit - used - 1) };
  });
}
