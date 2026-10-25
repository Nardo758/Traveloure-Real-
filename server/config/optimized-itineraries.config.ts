/**
 * FB-1 step 0 (decision-maker, Oct 17, 2026 — ledger `2026-10-17-fb1-optimized-itineraries-off`):
 * `POST /api/ai/generate-optimized-itineraries` returns 410 `{ code: "endpoint_retired" }` unless
 * `AI_GENERATE_OPTIMIZED_ITINERARIES_ENABLED=1`. Nothing under `client/src` calls it. The former
 * caller lived in `artifacts/traveloure`, deleted 2026-10-25 (ledger
 * `2026-10-25-delete-artifacts-traveloure`). The handler stays and answers 410 before reading the
 * body, writing a row, or calling a model.
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
