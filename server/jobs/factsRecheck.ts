/**
 * `facts-recheck` — the T-3 re-check (surface spec v1.3.4 R-ad / R-v / §9 Jobs; step 6 — ledger
 * `2026-10-04-step6-trip-card`). The authenticated internal route registers this function with
 * `runJob`, the daily `JOB_CADENCE` roster and the cron script's daily `BUCKET_ROUTES`.
 * Only a real endpoint-driven success stamps its heartbeat; the banner requires a conflict notice.
 *
 * For every plan that starts in 3 days (UTC calendar): re-run the facts lookups for its stops (cache
 * first — the Places spine's shared 30-day cache, a miss billed under its own cap), then compute the
 * plan's findings with the ONE findings reader the optimizer preview uses. A conflict (a stop reached
 * while closed, a timed entry that clashes) is recorded ONCE per plan as a `trip_recheck_conflict`
 * notice — idempotent on its dedupe key, so a re-run or a second tick writes nothing — and pushed
 * once (LD 53: the push sender claims each notice exactly once). Legs join under R-aw in step 9.
 * A plan with no conflict writes nothing. Never throws for one plan: a failed plan is counted.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { FACTS_RECHECK_DAYS_BEFORE, FACTS_RECHECK_NOTICE_TYPE, recheckBannerLine, recheckConflicts } from "@shared/facts-recheck";
import type { Finding } from "@shared/optimizer-lead";

export interface FactsRecheckResult {
  checked: number;
  conflicts: number;
  notified: number;
  failed: number;
  error?: string;
}

export interface FactsRecheckDeps {
  candidates: (now: Date) => Promise<Array<{ id: string; userId: string; destination: string | null; marketSlug: string | null }>>;
  relookup: (trip: { id: string; destination: string | null; marketSlug: string | null }) => Promise<void>;
  findings: (tripId: string) => Promise<Finding[]>;
  notifyOnce: (n: { tripId: string; userId: string; destination: string | null; conflicts: Finding[]; checkedAt: Date }) => Promise<boolean>;
}

export const defaultFactsRecheckDeps: FactsRecheckDeps = {
  async candidates(now) {
    const r = await db.execute(sql`
      SELECT t.id, t.user_id, t.destination, t.market_slug
      FROM trips t
      WHERE t.user_id IS NOT NULL
        AND t.start_date IS NOT NULL
        AND (t.start_date::date) = ((${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date + ${FACTS_RECHECK_DAYS_BEFORE}::int)
    `);
    return ((r as any).rows ?? []).map((x: any) => ({ id: x.id, userId: x.user_id, destination: x.destination ?? null, marketSlug: x.market_slug ?? null }));
  },
  async relookup(trip) {
    const { enrichPlanItems } = await import("../services/content-facts/place-facts.service");
    const items = await storage.getItineraryItems(trip.id);
    await enrichPlanItems({
      tripId: trip.id,
      market: trip.marketSlug,
      city: trip.destination,
      items: items.map((it: any) => ({ id: it.id, title: it.title, type: it.itemType ?? null, dayNumber: it.dayNumber ?? null, locationName: it.locationName ?? null, googlePlaceId: it.googlePlaceId ?? null })),
    });
  },
  async findings(tripId) {
    const { loadOptimizerFindings } = await import("../services/optimizer-lead.service");
    return (await loadOptimizerFindings(tripId)).findings;
  },
  async notifyOnce(n) {
    const line = recheckBannerLine(n.conflicts, null) ?? "Something on your plan changed";
    const { inserted } = await storage.createNotificationOnce({
      userId: n.userId,
      type: FACTS_RECHECK_NOTICE_TYPE,
      title: `A change on your ${n.destination ? `${n.destination.split(",")[0].trim()} ` : ""}plan`,
      message: line,
      relatedId: n.tripId,
      relatedType: "trip",
      data: { tripId: n.tripId, workspacePath: `/trip/${n.tripId}`, findings: n.conflicts, checkedAt: n.checkedAt.toISOString() },
      dedupeKey: `facts-recheck:${n.tripId}`,
    } as any);
    if (inserted) {
      // LD 53: the push sender claims the notice once; a failure never fails the job (§15b).
      void import("../services/web-push.service")
        .then(async ({ dispatchPushForNotification }) => {
          const [row] = ((await db.execute(sql`SELECT id FROM notifications WHERE dedupe_key = ${`facts-recheck:${n.tripId}`} LIMIT 1`)) as any).rows ?? [];
          if (row?.id) await dispatchPushForNotification(row.id);
        })
        .catch(() => undefined);
    }
    return inserted;
  },
};

export async function runFactsRecheck(now: Date = new Date(), deps: FactsRecheckDeps = defaultFactsRecheckDeps): Promise<FactsRecheckResult> {
  const result: FactsRecheckResult = { checked: 0, conflicts: 0, notified: 0, failed: 0 };
  let plans: Awaited<ReturnType<FactsRecheckDeps["candidates"]>>;
  try {
    plans = await deps.candidates(now);
  } catch (err: any) {
    return { ...result, error: err?.message ?? String(err) };
  }
  for (const trip of plans) {
    try {
      await deps.relookup(trip);
      const conflicts = recheckConflicts(await deps.findings(trip.id));
      result.checked += 1;
      if (!conflicts.length) continue;
      result.conflicts += 1;
      if (await deps.notifyOnce({ tripId: trip.id, userId: trip.userId, destination: trip.destination, conflicts, checkedAt: now })) result.notified += 1;
    } catch (err) {
      result.failed += 1;
      console.error(`[facts-recheck] plan ${trip.id} failed:`, (err as Error)?.message ?? err);
    }
  }
  return result;
}
