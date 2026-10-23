/**
 * `content-expiry-census` — FD-2 ruling 8 (decision-maker, Oct 9, 2026; ledger
 * `2026-10-09-fd2-content-tier-tags`). Expired LOCAL items are hidden at build time by the draft readers
 * (`isLiveLocal` / `getDraftEligibleGems`); this nightly job only COUNTS them, per table, and logs one line.
 * It deletes nothing, writes no status column and changes no row. A table it cannot read is reported as
 * `null` with the reason — never as 0, which would claim nothing has expired (§13).
 *
 * SS-1a (ledger `2026-10-10-ss1a-registry-entry-sheet`), amended Oct 22, 2026 (ledger
 * `2026-10-22-census-missing-source`): it also validates the refresh targets config against the
 * registry. Each problem is its own line on `targetProblems` (a source id no row holds — above all
 * `ginkakuji_official` until that row is typed in admin — is one line). `status` is `failed` and the
 * lines are the record. That is SS-1 ruling 2's "fails loudly", and it is not an HTTP 500: the route
 * answers 200 `{ ok: false, error, result }` for a target problem. A table, the registry query, or a
 * coverage market that could not be read stays in `errors` and still 500s.
 *
 * FD-5 (ledger `2026-10-10-fd5-coverage-targets`): one more line per targeted market — how many targeted
 * neighbourhoods are at target on each day type, the unplaced gems and any target slug with no neighbourhood
 * row. The full table is `scripts/report-coverage-census.cjs <market>`. A market it cannot read is `null`.
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { logger } from "../infrastructure/logger";
import { contentSources } from "@shared/schema";
import { targetProblemLine, validateTargets, type ContentSourceTargets } from "@shared/content-source-targets";
import { CONTENT_SOURCE_TARGETS } from "../config/content-source-targets.config";
import { COVERAGE_TARGETS } from "../config/coverage-targets.config";
import { loadCoverageCensus } from "../services/coverage-census.service";
import { censusSummary } from "@shared/coverage-targets";

export interface ContentExpiryCensus {
  at: string;
  /**
   * `failed` when a refresh target is a problem or a read could not finish. `ok` when both are clean.
   * A target problem fails the run here; it does not throw and the route does not answer 500 for it.
   */
  status: "ok" | "failed";
  expiredLocal: Record<string, number | null>;
  untaggedGems: number | null;
  /** FD-5: per targeted market, `censusSummary`; null when the market could not be read. */
  coverage: Record<string, ReturnType<typeof censusSummary> | null>;
  /** Read failures only (a table, the registry query, a coverage market). These still HTTP 500. */
  errors: Record<string, string>;
  /**
   * One `targetProblemLine` per refresh-target problem, whole, never joined or truncated.
   * A missing source is one line. These mark `status: "failed"` and do not 500.
   */
  targetProblems: string[];
}

/** A census read that did not finish. The route answers 500 for this. A target problem is not one. */
export function contentExpiryCensusCrashed(r: { errors?: Record<string, string> } | null | undefined): boolean {
  return Object.keys(r?.errors ?? {}).length > 0;
}

/**
 * The `error` string for a finished run whose refresh targets are wrong: one line per problem.
 * Null when the run is clean, or when a read failure should 500 instead (that check wins).
 * The route returns this on HTTP 200 `{ ok: false, error, result }` — the jobs-cron caller already
 * treats 200 without `ok: true` as a reported failure (`scripts/ci/post-internal-jobs.sh`).
 */
export function contentExpiryCensusReportedFailure(
  r: { status?: string; targetProblems?: readonly string[]; errors?: Record<string, string> } | null | undefined,
): string | null {
  if (!r || r.status !== "failed" || contentExpiryCensusCrashed(r)) return null;
  const lines = r.targetProblems ?? [];
  return lines.length ? lines.join("\n") : null;
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

export async function runContentExpiryCensus(opts: { targets?: ContentSourceTargets } = {}): Promise<ContentExpiryCensus> {
  const config = opts.targets ?? CONTENT_SOURCE_TARGETS;
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
  let targetProblems: string[] = [];
  try {
    const rows = await db.select({ id: contentSources.id, homepage: contentSources.homepage, covers: contentSources.covers, doesNotCover: contentSources.doesNotCover }).from(contentSources);
    // One line per problem. Joining them into `errors.refresh_targets` and slicing at 500 dropped
    // later missing sources and made the whole run an HTTP 500.
    targetProblems = validateTargets(config, rows).map(targetProblemLine);
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
  const status: ContentExpiryCensus["status"] = targetProblems.length > 0 || Object.keys(errors).length > 0 ? "failed" : "ok";
  const out: ContentExpiryCensus = { at: new Date().toISOString(), status, expiredLocal, untaggedGems, coverage, errors, targetProblems };
  logger.info({ job: "content-expiry-census", ...out }, "[content-expiry-census] counts");
  return out;
}
