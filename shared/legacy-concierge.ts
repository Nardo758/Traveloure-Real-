/**
 * The OLD done-for-you concierge's traveler entry points sit behind ONE switch, off by default (ledger
 * `2026-10-18-legacy-concierge-hidden`; decision-maker pre-ruling, Oct 18, 2026, CS-3 Step 0).
 *
 * The flow is live on production and takes payment (a coordination-fee PaymentIntent on /my-events) while its free-text
 * intent can carry hotel or transport asks, so its doors are HIDDEN until the switch is on. Hide only: no row is changed,
 * no route is removed, and an engagement that already exists keeps its card and its pay step on /my-events.
 *
 * A missing row, a read error, a loading read or any value other than "true" reads OFF.
 */
export const LEGACY_CONCIERGE_SETTING = "legacy_concierge_enabled";

/** The public read the traveler surfaces ask. Answers `{ enabled: boolean }` and nothing else. */
export const LEGACY_CONCIERGE_ROUTE = "/api/concierge/availability";

/** Shown only on an explicit `{ enabled: true }` answer. */
export function legacyConciergeShown(answer: unknown): boolean {
  return !!answer && typeof answer === "object" && (answer as { enabled?: unknown }).enabled === true;
}
