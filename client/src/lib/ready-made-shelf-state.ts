/**
 * GATE-1 (ledger `2026-11-03-gate1-partner1`): the /ready-made shelf always says where it stands — loading, failed,
 * empty or ready — instead of rendering nothing. Never filled with sample listings (CITY-1 owns the market rule).
 */
export type ReadyMadeShelfState = "loading" | "error" | "empty" | "ready";

export function readyMadeShelfState(input: { isLoading: boolean; isError: boolean; listings: readonly unknown[] | null | undefined }): ReadyMadeShelfState {
  if (input.isError) return "error";
  if (input.isLoading || input.listings === undefined) return "loading";
  return input.listings && input.listings.length > 0 ? "ready" : "empty";
}

export const READY_MADE_SHELF_COPY = {
  /**
   * HELD for Leon (brief §6, which reads "No ready-made plans yet."). Written "Ready-Made" because the product name's
   * one spelling is guarded (check-us-spelling, ledger 2026-10-08-h1-home-copy).
   */
  empty: "No Ready-Made plans yet.",
  /** HELD for Leon (proposed in this PR; the brief names an error branch and no words for it). */
  error: "Couldn't load Ready-Made plans. Try again in a moment.",
} as const;
