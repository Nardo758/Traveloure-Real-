/**
 * run-health.ts — the recorded outcome of one adapter run (trend-engine audit, Sep 29 2026;
 * ledger `2026-09-29-travelpulse-hygiene`). Pure, so it is proven without a database.
 */
import type { AdapterRunResult } from "./adapters/base.adapter";

/** Max length of ONE market's stored error message (the thrown-run branch caps at the same length). */
export const LAST_RUN_ERROR_MAX = 500;

export interface MarketRunError {
  /** The market the adapter named (its "<market>: …" prefix), or null when the message names none. */
  market: string | null;
  error: string;
}

/** Pure. One entry per error, market split from the adapter's "<market>: <message>" shape, each capped. */
export function perMarketErrors(errors: readonly string[]): MarketRunError[] {
  return errors.map((e) => {
    const m = /^([a-z0-9_-]+):\s*(.*)$/s.exec(e);
    return m
      ? { market: m[1], error: m[2].slice(0, LAST_RUN_ERROR_MAX) }
      : { market: null, error: e.slice(0, LAST_RUN_ERROR_MAX) };
  });
}

/**
 * THE RUN'S RECORDED OUTCOME. Pure. A run with any per-market error is `partial` and carries
 * the messages as a JSON array of `{ market, error }`, each message capped at `LAST_RUN_ERROR_MAX`
 * (decision-maker, Sep 30, 2026: per-market errors, never one concatenated blob in which the first
 * market's text crowds out the rest); a run with none is `success`. A thrown adapter is `failure`
 * and is recorded by the runner's catch, not here.
 */
export function runHealthFor(r: Pick<AdapterRunResult, "errors">):
  | { status: "success"; error: null }
  | { status: "partial"; error: string } {
  if (!r.errors.length) return { status: "success", error: null };
  return { status: "partial", error: JSON.stringify(perMarketErrors(r.errors)) };
}

