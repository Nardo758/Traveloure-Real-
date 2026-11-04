/**
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`): the guest plan's words. Every string here carries
 * "Wording approved — Leon" (session ruling, Nov 4, 2026). No other new guest-plan string ships without a further
 * approval; existing approved words ("Save to plan", "Saved to plan") stay in `client/src/lib/waitlist-copy.ts`.
 */
export const GUEST_PLAN_COPY = {
  /** Privacy line when GUEST_PLAN_RETENTION_DAYS is set. */
  keptForDays: (days: number) => `This plan is kept for ${days} days from your last change. Sign in to keep it.`,
  /** Privacy line when it is unset (the retention job is disabled). */
  keptUntilSignIn: "This plan is kept until you sign in or clear it.",
  emptyTitle: "Nothing saved yet",
  emptyBody: "Add places from the Kyoto page or the map to start.",
  saveFailed: "Couldn't save that. Try again.",
  rateLimited: "You've added a lot in a short time. Give it a minute and try again.",
} as const;

/** The privacy line for a retention setting (null = unset). */
export function guestPlanKeptLine(retentionDays: number | null): string {
  return retentionDays != null ? GUEST_PLAN_COPY.keptForDays(retentionDays) : GUEST_PLAN_COPY.keptUntilSignIn;
}
