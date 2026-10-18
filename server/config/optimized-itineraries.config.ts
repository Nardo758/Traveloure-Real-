/**
 * FB-1 step 0 (decision-maker, Oct 17, 2026 — ledger `2026-10-17-fb1-optimized-itineraries-off`):
 * `POST /api/ai/generate-optimized-itineraries` is switched OFF. No deployed client calls it — its only
 * caller is `artifacts/traveloure` (a reference workspace the root build does not include) — so it
 * answers 410 before reading the body, writing a row or calling a model. The handler is kept, not
 * deleted; `AI_GENERATE_OPTIMIZED_ITINERARIES_ENABLED=1` turns it back on.
 */
export const OPTIMIZED_ITINERARIES_ENABLED_ENV = "AI_GENERATE_OPTIMIZED_ITINERARIES_ENABLED";

export const OPTIMIZED_ITINERARIES_RETIRED_BODY = {
  message: "This endpoint is retired. Plan versions are made by Optimize on the plan.",
  code: "endpoint_retired",
} as const;

/** null ⇒ the route runs; otherwise the 410 it answers. */
export function optimizedItinerariesGate(
  env: Record<string, string | undefined> = process.env,
): { status: 410; body: typeof OPTIMIZED_ITINERARIES_RETIRED_BODY } | null {
  return env[OPTIMIZED_ITINERARIES_ENABLED_ENV]?.trim() === "1"
    ? null
    : { status: 410, body: OPTIMIZED_ITINERARIES_RETIRED_BODY };
}
