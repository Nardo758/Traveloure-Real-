/**
 * `content-expiry-census` — FD-2 ruling 8 (decision-maker, Oct 9, 2026; ledger
 * `2026-10-09-fd2-content-tier-tags`). Expired LOCAL items are hidden at build time by the draft readers
 * (`isLiveLocal` / `getDraftEligibleGems`); this nightly job only COUNTS them, per table, and logs one line.
 * It deletes nothing, writes no status column and changes no row. A table it cannot read is reported as
 * `null` with the reason — never as 0, which would claim nothing has expired (§13).
 *
 * SS-1a (ledger `2026-10-10-ss1a-registry-entry-sheet`): it also validates the refresh targets config
 * against the registry; any problem (above all a source id no row holds) is an `errors` entry, which
 * marks the run failed on `/internal/jobs/health` — SS-1 ruling 2's "fails loudly".
 *
 * FD-5 (ledger `2026-10-10-fd5-coverage-targets`): one more line per targeted market — how many targeted
 * neighbourhoods are at target on each day type, the unplaced gems and any target slug with no neighbourhood
 * row. The full table is `scripts/report-coverage-census.cjs <market>`. A market it cannot read is `null`.
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { logger } from "../infrastructure/logger";
import { contentSources } from "@shared/schema";
import { targetProblemLine, validateTargets } from "@shared/content-source-targets";
import { CONTENT_SOURCE_TARGETS } from "../config/content-source-targets.config";
import { COVERAGE_TARGETS } from "../config/coverage-targets.config";
import { loadCoverageCensus } from "../services/coverage-census.service";
import { censusSummary } from "@shared/coverage-targets";

export interface ContentExpiryCensus {
  at: string;
  expiredLocal: Record<string, number | null>;
  untaggedGems: number | null;
  /** FD-5: per targeted market, `censusSummary`; null when the market could not be read. */
  coverage: Record<string, ReturnType<typeof censusSummary> | null>;
  errors: Record<string, string>;
}

const TABLES = ["travel_pulse_hidden_gems", "local_knowledge_nuggets", "place_facts"] as const;

async function countOrNull(query: ReturnType<typeof sql>, key: string, errors: Record<string, string>): Promise<number | null> {
  try {
    const r = await db.execute(query);
    return Number((r.rows[0] as any)?.n ?? 0);
  } catch (err: any) {
    errors[key] = String(err?.message ?? err).slice(0, 200);
    return null;
  }
}

export async function runContentExpiryCensus(): Promise<ContentExpiryCensus> {
  const errors: Record<string, string> = {};
  const expiredLocal: Record<string, number | null> = {};
  for (const t of TABLES) {
    expiredLocal[t] = await countOrNull(
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)} WHERE source_class = 'local' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
      t,
      errors,
    );
  }
  const untaggedGems = await countOrNull(
    sql`SELECT count(*)::int AS n FROM travel_pulse_hidden_gems WHERE source_class IS NULL`,
    "untagged_gems",
    errors,
  );
  try {
    const rows = await db.select({ id: contentSources.id, homepage: contentSources.homepage, covers: contentSources.covers, doesNotCover: contentSources.doesNotCover }).from(contentSources);
    const problems = validateTargets(CONTENT_SOURCE_TARGETS, rows);
    if (problems.length) errors.refresh_targets = problems.map(targetProblemLine).join("; ").slice(0, 500);
  } catch (err: any) {
    errors.refresh_targets = `not checked: ${String(err?.message ?? err).slice(0, 200)}`;
  }
  const coverage: ContentExpiryCensus["coverage"] = {};
  for (const [market, targets] of Object.entries(COVERAGE_TARGETS)) {
    try {
      coverage[market] = censusSummary(await loadCoverageCensus(market, targets, (text, params) => pool.query(text, params as any[])));
    } catch (err: any) {
      coverage[market] = null;
      errors[`coverage_${market}`] = String(err?.message ?? err).slice(0, 200);
    }
  }
  const out: ContentExpiryCensus = { at: new Date().toISOString(), expiredLocal, untaggedGems, coverage, errors };
  logger.info({ job: "content-expiry-census", ...out }, "[content-expiry-census] counts");
  return out;
}
