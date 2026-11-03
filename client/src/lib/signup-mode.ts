/**
 * Row P-1c (ledger `2026-11-02-p1c-waitlist-save-to-plan`): the ONE read of GET /api/public/signup-mode.
 *
 * `mode` is FAIL-CLOSED: no answer yet, an error, or anything but "open" reads as "waitlist", so a planning surface
 * never draws a paid action it cannot confirm is on sale. `data` is the raw answer for the callers that already had
 * their own rule for an unread mode (the Ready-Made page buys as usual then; the ticker and the earn page read the
 * launch market) — they keep exactly that behaviour.
 *
 * The server refuses a waitlist-mode purchase on its own (P-1s, `waitlistPurchaseDecisionFor`); admin and QA-domain
 * accounts pass there, not here — the client shows the waitlist labels to them too.
 */
import { useContext } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";

export type SignupMode = "waitlist" | "open";

/** What GET /api/public/signup-mode answers. */
export interface SignupModeAnswer {
  mode?: SignupMode | string | null;
  launchMarketSlug?: string | null;
}

export const SIGNUP_MODE_QUERY_KEY = ["/api/public/signup-mode"] as const;

/** Pure: the fail-closed mode for an answer (or none). */
export function signupModeFrom(data: SignupModeAnswer | null | undefined): SignupMode {
  return data?.mode === "open" ? "open" : "waitlist";
}

/** Used only where no QueryClientProvider is mounted (a static render): nothing is fetched, so the mode fails closed. */
const NO_PROVIDER_CLIENT = new QueryClient();

export function useSignupMode(): { mode: SignupMode; data: SignupModeAnswer | undefined; isLoading: boolean } {
  const client = useContext(QueryClientContext);
  const q = useQuery<SignupModeAnswer>(
    { queryKey: SIGNUP_MODE_QUERY_KEY, retry: false, staleTime: 30_000, enabled: !!client },
    client ?? NO_PROVIDER_CLIENT,
  );
  return { mode: signupModeFrom(q.data), data: q.data, isLoading: q.isLoading };
}
