/**
 * `official-refresh` — SS-1b, THE MARKET-LEVEL OFFICIAL REFRESH (decision-maker SS-1 ruling 1, Oct 10, 2026;
 * ledger `2026-10-10-ss1b-official-refresh`). A NEW SPEND PATH beside A6-3A, bounded:
 *
 *   · it reads ONLY sources that are active, `official`, terms-checked, state a `refresh_interval_days` and a
 *     `cost_ceiling_cents_per_day`, and use an adapter the refresh can drive (`refreshEligibleSource`);
 *   · it fetches ONLY the targets the config names for that source (`CONTENT_SOURCE_TARGETS`, SS-1a), after
 *     the config passes `validateTargets` — a target the check refuses is never read;
 *   · a target is read when DUE — never read, or its last read (the last attempt logged, or the last fact
 *     stored) is a full interval old — so a page that yields nothing is not hammered daily;
 *   · every read is inside the source's daily ceiling, measured off `api_usage_logs` (the one meter both this
 *     job and the plan-scoped fetch write to, so the ceiling covers both); an unreadable meter is SPENT;
 *   · it is OUTSIDE ANY PLAN: no trip id, no plan row, no item; the free draft's own budget stays 0 and it
 *     only READS what this job stored.
 *
 * Facts are written by the ONE writer, `recordFacts`, which refuses an unsourced refresh fact
 * (`admitRefreshFact`) and an unsourced feasibility fact (`admitFeasibilityFact`). Each fact is born
 * `official_refresh` with `verified_at` = the read and `expires_at` = that plus the row's interval.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { contentSources } from "@shared/schema";
import { logger } from "../infrastructure/logger";
import { CONTENT_SOURCE_TARGETS } from "../config/content-source-targets.config";
import { validateTargets, targetProblemLine, type ContentSourceTargets } from "@shared/content-source-targets";
import { REFRESH_ORIGIN, refreshBudgetCents, refreshDue, refreshEligibleSource } from "@shared/official-refresh";
import { CONTENT_FACTS_USAGE_PURPOSE } from "../services/content-facts/fresh-fetch";
import { TavilyExtractAdapter, tavilyExtractCostCents, type TavilyExtractDeps } from "../services/content-facts/tavily-extract-adapter";
import { defaultTavilyExtractDeps, recordFacts } from "../services/content-facts/place-facts.service";

export interface OfficialRefreshSourceResult {
  sourceId: string;
  skipped?: string;
  read: number;
  notDue: number;
  facts: number;
  stoppedAt?: "ceiling_reached" | "meter_unreadable";
  outcomes: Record<string, number>;
}

export interface OfficialRefreshResult {
  at: string;
  sources: OfficialRefreshSourceResult[];
  targetProblems: string[];
  error?: string;
}

/** Cents this source has spent today, off `api_usage_logs` (tenths of a cent). null = unreadable. */
export async function readSourceDaySpendCents(sourceId: string): Promise<number | null> {
  try {
    const r: any = await db.execute(sql`
      SELECT COALESCE(SUM(estimated_cost_cents), 0) AS tenths
        FROM api_usage_logs
       WHERE provider = 'tavily'
         AND metadata->>'purpose' = ${CONTENT_FACTS_USAGE_PURPOSE}
         AND metadata->>'sourceId' = ${sourceId}
         AND created_at >= date_trunc('day', now())`);
    return Number(((r.rows ?? r)[0] ?? {}).tenths) / 10;
  } catch (err) {
    logger.error({ job: "official-refresh", sourceId, err: String((err as Error)?.message ?? err).slice(0, 200) }, "[official-refresh] spend meter unreadable");
    return null;
  }
}

/** The last read of one target: the later of its last logged attempt and its last stored fact. null = never. */
export async function readLastRefreshOf(sourceId: string, url: string): Promise<Date | null> {
  const r: any = await db.execute(sql`
    SELECT GREATEST(
      (SELECT max(created_at) FROM api_usage_logs
        WHERE provider = 'tavily' AND metadata->>'purpose' = ${CONTENT_FACTS_USAGE_PURPOSE}
          AND metadata->>'basis' = ${REFRESH_ORIGIN} AND metadata->>'sourceId' = ${sourceId}
          AND metadata->>'targetUrl' = ${url}),
      (SELECT max(fetched_at) FROM place_facts
        WHERE origin = ${REFRESH_ORIGIN} AND source_id = ${sourceId} AND source_url = ${url})
    ) AS last`);
  const v = ((r.rows ?? r)[0] ?? {}).last;
  return v ? new Date(v) : null;
}

export async function runOfficialRefresh(opts: {
  now?: Date;
  targets?: ContentSourceTargets;
  adapterDeps?: TavilyExtractDeps;
} = {}): Promise<OfficialRefreshResult> {
  const now = opts.now ?? new Date();
  const config = opts.targets ?? CONTENT_SOURCE_TARGETS;
  const out: OfficialRefreshResult = { at: now.toISOString(), sources: [], targetProblems: [] };
  try {
    const rows = await db.select().from(contentSources);
    // SS-1a's one check: a target it refuses is never read, and the problem is reported on the run.
    const problems = validateTargets(config, rows);
    out.targetProblems = problems.map(targetProblemLine);
    const badTarget = new Set(problems.filter((p) => "index" in p).map((p) => `${p.sourceId}#${(p as any).index}`));
    const unknown = new Set(problems.filter((p) => !("index" in p)).map((p) => p.sourceId));
    const deps = opts.adapterDeps ?? defaultTavilyExtractDeps();
    const extractCost = tavilyExtractCostCents();

    for (const [sourceId, targets] of Object.entries(config)) {
      if (unknown.has(sourceId)) continue;
      const row = rows.find((r) => r.id === sourceId)!;
      const res: OfficialRefreshSourceResult = { sourceId, read: 0, notDue: 0, facts: 0, outcomes: {} };
      out.sources.push(res);
      const eligible = refreshEligibleSource(row);
      if (!eligible.ok) {
        res.skipped = eligible.reason;
        continue;
      }
      const interval = row.refreshIntervalDays as number;
      for (let i = 0; i < targets.length; i++) {
        if (badTarget.has(`${sourceId}#${i}`)) continue;
        const target = targets[i];
        if (!refreshDue(await readLastRefreshOf(sourceId, target.url), interval, now)) {
          res.notDue++;
          continue;
        }
        // The ceiling is re-read before EVERY read: the meter is the record, never a running tally here.
        const spent = await readSourceDaySpendCents(sourceId);
        if (spent === null) {
          res.stoppedAt = "meter_unreadable";
          break;
        }
        const budget = refreshBudgetCents(row.costCeilingCentsPerDay, spent);
        if (budget < extractCost) {
          res.stoppedAt = "ceiling_reached";
          break;
        }
        const adapter = new TavilyExtractAdapter(row, deps);
        const drafts = await adapter.fetchTarget({ target, market: row.market, intervalDays: interval, budgetCents: budget });
        res.read++;
        res.outcomes[adapter.lastOutcome ?? "no_facts"] = (res.outcomes[adapter.lastOutcome ?? "no_facts"] ?? 0) + 1;
        if (drafts.length) res.facts += await recordFacts(drafts, { planId: null, itemId: null });
      }
    }
  } catch (err: any) {
    out.error = String(err?.message ?? err).slice(0, 300);
  }
  logger.info({ job: "official-refresh", ...out }, "[official-refresh] pass");
  return out;
}
