/**
 * x-api.adapter.ts — X (Twitter) mention/post count adapter via xAI.
 *
 * Source: x_api | resale_class: licensed_no_resale | Status: DISABLED
 *
 * BLOCKED: xAI live_search (the replacement for the deprecated search_parameters
 * endpoint) returns HTTP 410 "deprecated" on the current XAI_API_KEY at Tier 1.
 * Two resolution paths:
 *   (a) Upgrade xAI to Tier 2+ ($180 more spend) — live_search may unlock.
 *   (b) Obtain X API v2 Bearer Token (Basic/Pro tier) for counts/recent-search endpoints.
 * Leon picks. Adapter design differs:
 *   xAI path: grok model call with live_search sources:[{type:"x"}], extract mention
 *             counts from response text (server-side; cost is per token, not per search).
 *   X v2 path: POST /2/tweets/counts/recent with query={city} and granularity=day.
 *
 * Metrics: x_mention_count (daily integer), x_post_velocity (posts/hour peak daily)
 * Counts and velocities only — NO LLM summarization or scoring of X content (R2).
 *
 * ToS retention rule: X API data must not be stored beyond 30 days (standard
 * developer agreement). Set a data-expiry job before activation.
 */

import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";

const SOURCE = "x_api";

export class XApiAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.errors.push(
      "X adapter is DISABLED: xAI live_search returns 410 on Tier 1. " +
      "Options: (a) upgrade xAI to Tier 2+, or (b) add X API v2 Bearer Token. " +
      "No LLM scoring of X content allowed (R2). Enable after credential decision.",
    );
    return result;
  }

  async backfill(_from: Date, _to: Date): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.errors.push(
      "X adapter is DISABLED: credential issue unresolved.",
    );
    return result;
  }
}

export const xApiAdapter = new XApiAdapter();
