/**
 * run-health.ts — the recorded outcome of one adapter run (trend-engine audit, Sep 29 2026;
 * ledger `2026-09-29-travelpulse-hygiene`). Pure, so it is proven without a database.
 */
import type { AdapterRunResult } from "./adapters/base.adapter";

/** Max length of the stored `last_run_error` (the failure branch caps at the same length). */
export const LAST_RUN_ERROR_MAX = 500;

/**
 * THE RUN'S RECORDED OUTCOME. Pure. A run with any per-market error is `partial` and carries
 * the messages (joined, capped); a run with none is `success`. A thrown adapter is `failure`
 * and is recorded by the runner's catch, not here.
 */
export function runHealthFor(r: Pick<AdapterRunResult, "errors">):
  | { status: "success"; error: null }
  | { status: "partial"; error: string } {
  if (!r.errors.length) return { status: "success", error: null };
  return { status: "partial", error: r.errors.join(" | ").slice(0, LAST_RUN_ERROR_MAX) };
}

