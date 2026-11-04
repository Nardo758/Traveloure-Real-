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
import { LIVE_MARKETS_ROUTE } from "@shared/live-markets";
import { launchCityName, type MarketStatusSettings } from "@shared/ticker";
import { statusSettingsFrom } from "./waitlist-markets";

export type SignupMode = "waitlist" | "open";

/** What GET /api/public/signup-mode answers. */
export interface SignupModeAnswer {
  mode?: SignupMode | string | null;
  launchMarketSlug?: string | null;
  /** COPY-1 §4k: the launch market has an approved, non-test expert. Absent ⇒ false (the lines stay omitted). */
  expertsLive?: boolean | null;
}

/** COPY-1 §4k, pure: local-expert lines show only on an explicit `true` (unread or absent ⇒ omitted). */
export function expertsLiveFrom(data: SignupModeAnswer | null | undefined): boolean {
  return data?.expertsLive === true;
}

/** The hook: whether the local-expert lines may show. */
export function useExpertsLive(): boolean {
  return expertsLiveFrom(useSignupMode().data);
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

/**
 * Lane 2 (ledger `2026-11-05-lane2-mode-read`; briefs A-3 / K-10 / A-28): the ONE rule every booking, purchase and
 * availability action on a traveler surface is drawn behind. In waitlist mode — for every viewer, signed in or not —
 * those actions and the copy that supports them are HIDDEN, never relabelled. Fail-closed: an unread mode hides them.
 * Seller and admin consoles are not traveler surfaces and do not read it.
 */
export function bookingActionsShown(mode: SignupMode): boolean {
  return mode === "open";
}

/** The hook form of `bookingActionsShown` — the one read a component makes. */
export function useBookingActionsShown(): boolean {
  return bookingActionsShown(useSignupMode().mode);
}

/** A-7: traveler sign-up is offered only in open mode (provider and expert sign-up are not traveler paths). */
export function useTravelerSignupShown(): boolean {
  return useSignupMode().mode === "open";
}

/**
 * GATE-1 (ledger `2026-11-03-gate1-partner1`; Leon, Nov 3: "the waitlist is the only gate for travelers, with no
 * traveler sign-in wall"): on a PUBLIC browse surface, a signed-out viewer in waitlist mode gets "Save to plan" —
 * a toast, no dialog, no sign-in modal. Signed-in viewers, and every viewer in open mode, keep today's path.
 * Pure, so a card, the page and the dialog decide it once.
 */
export function browseSavesToPlan(mode: SignupMode, signedIn: boolean): boolean {
  return mode === "waitlist" && !signedIn;
}

// ── CITY-1 (ledger `2026-11-04-city1-marquee-defaults`): the marquee market and market status, from ONE read ─────
/**
 * The public live-markets answer (`GET /api/public/live-markets`, WAIT-1): the marquee (`launch`), live, beta and
 * launch months. `loaded` is false until it answers; a picker treats every market as selectable until then (the
 * server refuses a non-open market at the trip mint on its own — the client only reflects that).
 */
export function useMarketStatusSettings(): { settings: MarketStatusSettings; loaded: boolean; settled: boolean } {
  const client = useContext(QueryClientContext);
  const q = useQuery<unknown>(
    { queryKey: [LIVE_MARKETS_ROUTE], retry: false, staleTime: 60_000, enabled: !!client },
    client ?? NO_PROVIDER_CLIENT,
  );
  // `settled`: the read has answered or failed (a failed read is the honest empty — nothing is open).
  return { settings: statusSettingsFrom(q.data), loaded: q.data !== undefined, settled: !q.isLoading };
}

/**
 * The marquee market — the default city wherever a city is picked — from the live-markets answer, else the
 * signup-mode answer's `launchMarketSlug`. Null until either names an operating market: a caller then shows no
 * city rather than a typed one.
 */
export function useLaunchMarket(): { slug: string; cityName: string } | null {
  const { settings } = useMarketStatusSettings();
  const { data } = useSignupMode();
  const slug = settings.launch ?? data?.launchMarketSlug ?? null;
  const cityName = launchCityName(slug);
  return slug && cityName ? { slug, cityName } : null;
}

/** CITY-1, pure: the marquee for a settings answer, else null. */
export function launchMarketFrom(settings: MarketStatusSettings): { slug: string; cityName: string } | null {
  const cityName = launchCityName(settings.launch);
  return settings.launch && cityName ? { slug: settings.launch, cityName } : null;
}
