/**
 * SH-1 item 11 (rulings Q11.1–Q11.4): an expert call-to-action draws only when the server says there is an expert to
 * ask. ONE server answer (`GET /api/expert-availability`, the in-plan hook's own rule — `chooserHasExperts` behind the
 * city's switch) and ONE client reading of it here; no surface decides this for itself.
 *
 *   - A CTA about a city asks for that city. No city on such a CTA ⇒ hidden (nothing to ask about).
 *   - A CTA that names no city at all (landing, pricing, how-it-works…) asks with no city ⇒ "any live market".
 *   - Loading, an error or a "no" all hide — a hidden button is the safe failure, a dead one is not.
 *   - Addressed CTAs (a listed expert's own Ask, a curator's "Ask {name}", Message on a listing) obey the same answer.
 */
import { useQuery } from "@tanstack/react-query";

export const EXPERT_AVAILABILITY_ROUTE = "/api/expert-availability";

/** "any" = a call-to-action that names no city. */
export type ExpertAvailabilityScope = { city: string | null | undefined } | "any";

/** The URL to ask, or null when there is nothing to ask (a city CTA with no city). */
export function expertAvailabilityUrl(scope: ExpertAvailabilityScope): string | null {
  if (scope === "any") return EXPERT_AVAILABILITY_ROUTE;
  const city = scope.city?.trim();
  return city ? `${EXPERT_AVAILABILITY_ROUTE}?city=${encodeURIComponent(city)}` : null;
}

/** Pure: draw the CTA only on a settled, successful "yes". */
export function expertCtaVisible(q: { isLoading?: boolean; isError?: boolean; data?: { available?: unknown } | null }): boolean {
  if (q.isLoading || q.isError) return false;
  return q.data?.available === true;
}

/**
 * Pure: where `useAskExpert` may send someone it could not address. Only a "yes" earns the directory; a "no" (or no
 * answer) sends them nowhere, because the directory would be empty or hold no one to ask (Q11.2).
 */
export function askFallbackPath(city: string | null | undefined, available: boolean): string | null {
  if (!available) return null;
  return city ? `/local-experts?location=${encodeURIComponent(city)}` : "/local-experts";
}

/** One fetch of the answer, outside React (used by `useAskExpert`). A failure is "no". */
export async function fetchExpertAvailability(scope: ExpertAvailabilityScope): Promise<boolean> {
  const url = expertAvailabilityUrl(scope);
  if (!url) return false;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return false;
    return (await res.json())?.available === true;
  } catch {
    return false;
  }
}

/** The hook every expert CTA reads. */
export function useExpertAvailability(scope: ExpertAvailabilityScope): boolean {
  const url = expertAvailabilityUrl(scope);
  const q = useQuery<{ available: boolean }>({
    queryKey: [url ?? `${EXPERT_AVAILABILITY_ROUTE}#none`],
    enabled: !!url,
    staleTime: 60_000,
    retry: false,
  });
  if (!url) return false;
  return expertCtaVisible(q);
}
