/**
 * predicthq.adapter.ts — PredictHQ event attendance adapter.
 *
 * Source: predicthq | resale_class: licensed_no_resale | Status: DISABLED
 *
 * BLOCKED: PREDICTHQ_API_KEY returns 403 on /v1/accounts/self/ — token may be
 * missing the `account:read` scope, or the token format requires a different
 * auth mechanism. Enable after Leon confirms scope and monthly_cost_ceiling.
 *
 * ToS retention rule: PredictHQ data must not be stored beyond the permitted
 * retention window for the contracted plan tier. Check ToS before activation.
 *
 * Metrics: predicted_attendance (event attendance estimate per market per day)
 * Backfill: historical events are available if plan permits — report on activation.
 */

import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";

const SOURCE = "predicthq";

export class PredictHQAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.errors.push(
      "PredictHQ adapter is DISABLED: API key returns 403. " +
      "Confirm account:read scope and monthly_cost_ceiling before enabling.",
    );
    return result;
  }

  async backfill(_from: Date, _to: Date): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.errors.push(
      "PredictHQ adapter is DISABLED: credential issue unresolved.",
    );
    return result;
  }
}

export const predictHQAdapter = new PredictHQAdapter();
