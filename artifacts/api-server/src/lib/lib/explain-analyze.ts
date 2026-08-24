/**
 * EXPLAIN ANALYZE utility
 *
 * Wraps a raw SQL query with EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) and logs
 * the execution plan whenever the actual execution time exceeds THRESHOLD_MS.
 *
 * Usage:
 *   import { explainAnalyze } from "../lib/explain-analyze";
 *
 *   // One-shot check — runs your query then, if slow, re-runs with EXPLAIN ANALYZE
 *   const rows = await explainAnalyze(pool, "SELECT ...", [param1, param2], "my-query-label");
 *
 *   // Or use wrapQuery to only EXPLAIN when the live execution was already slow:
 *   const start = Date.now();
 *   const rows = await pool.query("SELECT ...", [params]);
 *   await maybeExplain(pool, Date.now() - start, "SELECT ...", [params], "my-query-label");
 *
 * Required env:
 *   SLOW_QUERY_EXPLAIN_THRESHOLD_MS  (optional, default 100)
 *   NODE_ENV !== "production"        set to "production" to silence in prod
 */

import { Pool, QueryResult } from "pg";

export const THRESHOLD_MS =
  parseInt(process.env.SLOW_QUERY_EXPLAIN_THRESHOLD_MS ?? "100", 10);

/**
 * Parse the actual total execution time out of EXPLAIN ANALYZE text output.
 * Looks for the line:  "Execution Time: 12.345 ms"
 */
function parseExecTime(plan: string): number | null {
  const match = plan.match(/Execution Time:\s*([\d.]+)\s*ms/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Run EXPLAIN (ANALYZE, BUFFERS) on an already-known slow query and log the plan.
 * Safe to call from anywhere — silently swallows explain errors.
 */
export async function explainQuery(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
  label = "query"
): Promise<void> {
  try {
    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`;
    const result: QueryResult = await pool.query(explainSql, params);
    const plan: string = result.rows.map((r: any) => Object.values(r)[0]).join("\n");
    const execTime = parseExecTime(plan);
    console.warn(
      `[EXPLAIN] ${label} — actual exec: ${execTime != null ? `${execTime}ms` : "unknown"}\n${plan}`
    );
  } catch (err) {
    console.error(`[EXPLAIN] Failed to explain "${label}":`, err);
  }
}

/**
 * Call after a query has already run. If durationMs >= THRESHOLD_MS,
 * re-runs the same query under EXPLAIN ANALYZE and logs the plan.
 */
export async function maybeExplain(
  pool: Pool,
  durationMs: number,
  sql: string,
  params: unknown[] = [],
  label = "query"
): Promise<void> {
  if (durationMs < THRESHOLD_MS) return;
  console.warn(`[EXPLAIN] "${label}" took ${durationMs}ms — running EXPLAIN ANALYZE…`);
  await explainQuery(pool, sql, params, label);
}

/**
 * Convenience wrapper: runs the query, measures wall-clock time, and
 * triggers EXPLAIN ANALYZE automatically if it exceeded THRESHOLD_MS.
 * Returns the original query result.
 */
export async function timedQuery<T extends QueryResult = QueryResult>(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
  label = "query"
): Promise<T> {
  const start = Date.now();
  const result = await pool.query(sql, params) as T;
  const duration = Date.now() - start;

  if (duration >= THRESHOLD_MS) {
    console.warn(`[SlowQuery] "${label}" — ${duration}ms (threshold: ${THRESHOLD_MS}ms)`);
    // Fire-and-forget explain — don't block the caller
    explainQuery(pool, sql, params, label).catch(() => {});
  }

  return result;
}
