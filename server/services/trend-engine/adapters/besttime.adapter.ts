/**
 * besttime.adapter.ts — BestTime.app busyness forecast adapter.
 *
 * Source: besttime | resale_class: licensed_no_resale | Status: DISABLED
 *
 * BLOCKED: Awaiting valid api_key_private (current BESTTIME_API_KEY is 36 chars;
 * BestTime private keys are 64+ chars — likely the public key was added instead).
 * Enable only after Leon confirms the private key is set and monthly_cost_ceiling
 * is confirmed in trend_source_config.
 *
 * ToS retention rule: BestTime forecast data must not be stored beyond 90 days
 * (standard no-resale clause). The pre_launch flag does not apply to BestTime
 * (licensed_no_resale, not first_party).
 *
 * Metrics: busyness_index (0–100 scale, venue or market aggregate)
 * No meaningful backfill — daily-forward only per 2.2b spec.
 */

import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";

const SOURCE = "besttime";

export class BestTimeAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.errors.push(
      "BestTime adapter is DISABLED: api_key_private not confirmed. " +
      "BESTTIME_API_KEY must be the private key (64+ chars). " +
      "Enable in trend_source_config after key and ceiling are confirmed.",
    );
    return result;
  }

  async backfill(_from: Date, _to: Date): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.errors.push(
      "BestTime has no meaningful historical backfill — daily-forward only.",
    );
    return result;
  }
}

export const bestTimeAdapter = new BestTimeAdapter();
