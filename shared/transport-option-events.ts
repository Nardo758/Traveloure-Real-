/**
 * TC-3b (ledger `2026-10-11-tc3b-ride-recommender`; migration 370): the ride recommender's event value set,
 * stated ONCE. `offered` — the plan card first served the suggestion; `accepted` — the ride was inserted through
 * the ride route; `skipped` — the owner dismissed it, which also closes the corridor for this trip (ruling 3).
 */
export const TRANSPORT_OPTION_EVENTS = ["offered", "accepted", "skipped"] as const;
export type TransportOptionEventKind = (typeof TRANSPORT_OPTION_EVENTS)[number];
