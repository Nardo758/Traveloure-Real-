/**
 * job-heartbeats.service.ts — "did this scheduled job actually run?"
 *
 * Lane: internal-jobs-hardening, L6. Finding F5: GitHub `schedule` is best-effort and auto-disables
 * after 60 days of repository inactivity, and NOTHING detected a workflow that had stopped firing —
 * on the runner the ledger calls authoritative. A run row per success makes a dead cron channel
 * visible instead of silent.
 *
 * ── WHAT THIS MEASURES: THE LAST CRON-DRIVEN SUCCESS. DELIBERATE. DO NOT "FIX". ────────────────
 * The upsert is called from `runJob` — the /internal endpoint wrapper — so ONLY a pass driven by the
 * external cron stamps a heartbeat. The in-process defense-in-depth timers (server/index.ts and the
 * scheduler services) run the same jobs and deliberately do NOT stamp.
 *
 * That asymmetry IS the signal. If both paths stamped, a warm in-process timer would keep the
 * heartbeat fresh while the cron channel was dead — which is precisely the failure F5 names, and
 * the detector would be blind to the only thing it exists to detect. A future lane that "fixes"
 * this by stamping the timer path too would silently destroy the signal while making the tile
 * greener.
 *
 * The cost of that choice: a red row can mean "the cron is dead" while the work is in fact being
 * done by the timers. So every surface that renders this MUST say "last cron-driven success", never
 * "job health" — otherwise the first time a timer carries the load, someone reads a red tile as a
 * dead job.
 *
 * ── ROSTER-DRIVEN, NOT ROW-DRIVEN ──────────────────────────────────────────────────────────────
 * `computeJobHealth` iterates the CADENCE ROSTER and left-joins heartbeats. A job with no row is
 * reported `never_succeeded`, not omitted. Iterating table rows instead would mean a job that has
 * never once succeeded never appears and never alarms — the same absence-compared-to-absence shape
 * as the 200-HTML dead route this lane started from, one layer up.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { jobHeartbeats, type JobHeartbeat } from "@shared/schema";
import { logger } from "../infrastructure/logger";

/** A job's expected firing interval, from the cron bucket that fires it. */
export interface JobCadence {
  job: string;
  /** Expected seconds between successful cron-driven passes. */
  expectedIntervalSec: number;
  /** The jobs-cron.yml bucket this comes from, for the health read-out. */
  bucket: string;
}

export type JobHealthStatus = "ok" | "stale" | "never_succeeded";

export interface JobHealthRow {
  job: string;
  bucket: string;
  expectedIntervalSec: number;
  status: JobHealthStatus;
  lastSuccessAt: string | null;
  ageSec: number | null;
  lastResult: unknown | null;
}

/**
 * A job is STALE past 2x its expected interval — one missed pass is a delayed GitHub schedule
 * (they are best-effort), two is a pattern.
 */
export const STALENESS_MULTIPLIER = 2;

/**
 * ALLOWLIST for `last_result` — booleans, the bounded `reason` enum, and numeric leaves only.
 *
 * ⚠ PAIRED WITH `summarize()` IN scripts/ci/post-internal-jobs.sh. These two allowlists must move
 * together: they are the same rule (never persist/print a job's free-text or string payload,
 * because reconciliation and earnings results are money-shaped) expressed in the two languages the
 * two surfaces are written in. There is no way to share one implementation across bash and
 * TypeScript, so this comment is the coupling.
 */
export function summarizeJobResult(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ok: body.ok === true,
    skipped: body.skipped === true,
  };
  if (typeof body.reason === "string") out.reason = body.reason;

  const walk = (value: unknown, path: string[]): void => {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[path.join(".")] = value;
      return;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, [...path, k]);
    }
  };
  walk(body.result, ["result"]);
  return out;
}

/**
 * Stamp a successful cron-driven pass. Callers must NOT call this for a skip (L6/H2): a job stuck
 * in permanent overlap has to go stale, which is the whole point.
 *
 * Never throws — a heartbeat write must never turn a successful job into a 500.
 */
export async function recordJobSuccess(jobName: string, body: Record<string, unknown>): Promise<void> {
  try {
    const summary = summarizeJobResult(body);
    await db
      .insert(jobHeartbeats)
      .values({ jobName, lastSuccessAt: new Date(), lastResult: summary })
      .onConflictDoUpdate({
        target: jobHeartbeats.jobName,
        set: { lastSuccessAt: new Date(), lastResult: summary, updatedAt: new Date() },
      });
  } catch (err) {
    logger.error({ err, job: jobName }, "[job-heartbeats] failed to record success (non-fatal)");
  }
}

/**
 * Health for every job in the ROSTER (never merely for the rows that happen to exist).
 */
export async function computeJobHealth(roster: readonly JobCadence[], now: Date = new Date()): Promise<JobHealthRow[]> {
  let rows: JobHeartbeat[] = [];
  try {
    rows = await db.select().from(jobHeartbeats);
  } catch (err) {
    logger.error({ err }, "[job-heartbeats] health read failed");
    throw err;
  }
  const byName = new Map(rows.map((r) => [r.jobName, r]));

  return roster.map((entry) => {
    const row = byName.get(entry.job);
    if (!row) {
      return {
        job: entry.job,
        bucket: entry.bucket,
        expectedIntervalSec: entry.expectedIntervalSec,
        status: "never_succeeded" as const,
        lastSuccessAt: null,
        ageSec: null,
        lastResult: null,
      };
    }
    const ageSec = Math.max(0, Math.round((now.getTime() - new Date(row.lastSuccessAt).getTime()) / 1000));
    return {
      job: entry.job,
      bucket: entry.bucket,
      expectedIntervalSec: entry.expectedIntervalSec,
      status: ageSec > entry.expectedIntervalSec * STALENESS_MULTIPLIER ? ("stale" as const) : ("ok" as const),
      lastSuccessAt: new Date(row.lastSuccessAt).toISOString(),
      ageSec,
      lastResult: row.lastResult ?? null,
    };
  });
}

/** True when anything in the roster is not `ok` — the one boolean a tile needs. */
export function isAnyJobUnhealthy(rows: JobHealthRow[]): boolean {
  return rows.some((r) => r.status !== "ok");
}
