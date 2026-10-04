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
import crypto from "node:crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryComparisons, itineraryItems, itineraryVariantItems, itineraryVariants, planDayRetimes, trips } from "@shared/schema";
import {
  diffVersionDays,
  retimeIsFree,
  retimeLine,
  versionBadges,
  versionLabel,
  type BoardStop,
  type DayDiff,
  type BadgeKey,
} from "@shared/version-board";
import { isPlanAnchorItemType } from "@shared/draft-basis";
import { itineraryItemIsMachineProtected } from "@shared/itinerary-item-lock";
import { optionPickOf } from "@shared/version-options";
import { itineraryItemNotMachineProtected } from "./itinerary-rebuild-guard";
import { choosePickInTx, openSetHeldItemIds } from "./version-adopt.service";
import { planRole } from "./plan-option-sets.service";
import { recordRunOutcome } from "./optimizer-runs.service";
import { optimizerFreeRetimes } from "../config/optimizer-retimes.config";
import { complexityTier, retimeDayInOrder } from "./smart-sequencing.service";
import { getFee } from "./optimization-fee.service";
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

/** The plan's latest run: its AI versions in run order. Null when the plan has none. */
export async function latestRun(tripId: string): Promise<{
  comparisonId: string;
  runId: string | null;
  runAt: Date;
  variants: Array<typeof itineraryVariants.$inferSelect>;
} | null> {
  const rows = await db
    .select({ v: itineraryVariants })
    .from(itineraryVariants)
    .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
    .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryVariants.source, "ai_optimized"), eq(itineraryVariants.status, "generated")))
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
  return { comparisonId: newest.comparisonId, runId: newest.runId ?? null, runAt, variants: sameRun };
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

const isStayPick = (r: { sortOrder: number | null; serviceType: string | null; metadata: unknown }) =>
  (r.sortOrder ?? 0) < 0 || !!optionPickOf(r.metadata) || isPlanAnchorItemType(r.serviceType);

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
  run: { comparisonId: string; runId: string | null; runAt: string } | null;
  plan: { stops: BoardStop[] };
  versions: Array<{
    variantId: string;
    label: string;
    name: string;
    badge: BadgeKey | null;
    anchor: { name: string; lat: number | null; lng: number | null } | null;
    stops: BoardStop[];
    days: DayDiff[];
  }>;
  retimes: { limit: number; used: Record<string, number>; windowEndsAt: string | null; free: Record<string, boolean>; unlimited?: boolean };
}

export async function loadVersionsBoard(tripId: string, now = new Date()): Promise<VersionsBoardView> {
  const plan = await planStops(tripId);
  const run = await latestRun(tripId);
  const limit = optimizerFreeRetimes();
  if (!run) return { run: null, plan: { stops: plan }, versions: [], retimes: { limit, used: {}, windowEndsAt: null, free: {} } };
  const items = (await versionStops(run.variants.map((v) => v.id))).filter((r) => !isStayPick(r as any));
  const versions = run.variants.map((v, i) => {
    const stops = items.filter((r) => r.variantId === v.id).map(toBoardStop);
    return { v, i, stops };
  });
  const badges = versionBadges(versions.map((x) => ({ id: x.v.id, stops: x.stops })));
  const used = await retimeCounts(tripId, run.runAt);
  const free: Record<string, boolean> = {};
  const unlimited = await tripHasPass(tripId).catch(() => false);
  for (const x of versions) free[x.v.id] = retimeIsFree({ runAt: run.runAt, now, used: used[x.v.id] ?? 0, limit, unlimited });
  const anchorOf = (v: (typeof run.variants)[number]) =>
    v.anchorName ? { name: v.anchorName, lat: num(v.anchorLat), lng: num(v.anchorLng) } : null;
  return {
    run: { comparisonId: run.comparisonId, runId: run.runId, runAt: run.runAt.toISOString() },
    plan: { stops: plan },
    versions: versions.map(({ v, i, stops }) => ({
      variantId: v.id,
      label: versionLabel(i),
      name: v.name,
      badge: badges.get(v.id) ?? null,
      anchor: anchorOf(v),
      stops,
      days: diffVersionDays(plan, stops),
    })),
    retimes: { limit, used, windowEndsAt: new Date(run.runAt.getTime() + 24 * 3600_000).toISOString(), free, unlimited },
  };
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

export async function applyDays(input: {
  tripId: string;
  userId: string;
  days: Array<{ day: number; variantId: string }>;
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
        await tx.insert(itineraryItems).values({
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
        } as any);
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
          .values({
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
          } as any)
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
