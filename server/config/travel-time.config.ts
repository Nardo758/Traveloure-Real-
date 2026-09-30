/**
 * THE ONE TRAVEL-TIME SERVICE — its switch (Track A step A8; ledger
 * `2026-09-30-a8-travel-time-service`, R228).
 *
 * OFF unless an operator sets `TRAVEL_TIME_SERVICE_ENABLED=1` (R211: built behind a flag; nothing
 * user-visible past the A1 gate until the census passes). With it off, Finalize writes no legs,
 * activate-transport keeps its old variant path, a leg's mode switch keeps its old behaviour and
 * plan-fit keeps A2's reader — exactly today. With it on, all four go through ONE module
 * (`server/services/travel-time.service.ts`). The Routes tier additionally needs
 * `GOOGLE_MAPS_API_KEY`; without it an exact leg falls back to the matrix, then the labelled
 * estimate — never an invented route.
 *
 * The speeds themselves are the ONE table in `shared/travel-speeds.ts` (read by the client too, so
 * they are not env-tunable).
 */
export function travelTimeServiceEnabled(): boolean {
  return process.env.TRAVEL_TIME_SERVICE_ENABLED === "1";
}

export function travelTimeRoutesAvailable(): boolean {
  return travelTimeServiceEnabled() && !!process.env.GOOGLE_MAPS_API_KEY;
}
