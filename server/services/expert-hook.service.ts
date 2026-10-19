/**
 * FB-1 expert hook, server half (decision-maker Leon, Oct 18, 2026 — ledger `2026-10-18-fb1-expert-hook`).
 *
 * `expertHookForTrip` — what the plancard carries so the slip can draw the locked "With local picks" section under each
 * day. Only for the plan's OWNER and only on a FREE plan (not `tripGetsRoutedLegs`, the same test the FD-1 teaser
 * uses); every other viewer, a paid plan, and any failure get `null` — no section at all (§13). The button is offered
 * only when the city's switch is on AND its expert chooser would have someone in it (`chooserHasExperts`, the chooser's
 * own candidates and gate), so it never opens an empty chooser.
 *
 * `inSeasonAdditionsForTrip` — the per-day count behind "[n] in-season additions for Day [d] · See them". Its source is
 * FB-1 step 8's official-calendar `content_sources` rows (kind `event`): the stops or evenings in the latest run's
 * in-season version for a day that the draft does not already hold, transport never counted
 * (`countInSeasonAdditions`). That kind does not exist yet, so no run has an in-season version and every day is 0 —
 * an EMPTY map, which draws nothing. Step 8 fills this in; nothing here invents a count.
 */
import type { ExpertHook } from "@shared/expert-hook";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { getExpertHookCities } from "./platform-flags";

export async function expertHookForTrip(tripId: string, userId: string | null | undefined): Promise<ExpertHook | null> {
  try {
    if (!userId) return null;
    if (!(await verifyTripOwnership(tripId, userId))) return null;
    const { tripGetsRoutedLegs } = await import("./routing/plan-routed-legs.service");
    if (await tripGetsRoutedLegs(tripId)) return null;
    const { planMarketForTrip, chooserHasExperts } = await import("./expert-door.service");
    const market = await planMarketForTrip(tripId);
    const cities = await getExpertHookCities();
    const switchOn = !!market.key && cities.includes(market.key);
    const canAsk = switchOn ? await chooserHasExperts(market.key!) : false;
    return { switchOn, cityName: market.cityName, canAsk };
  } catch (err: any) {
    console.warn(`[expert-hook] ${tripId}: not computed: ${String(err?.message ?? err).slice(0, 200)}`);
    return null;
  }
}

/** Per day, `{ count, href }` for the in-season line. Empty until FB-1 step 8 — see the file note. */
export async function inSeasonAdditionsForTrip(_tripId: string): Promise<Map<number, { count: number; href: string }>> {
  return new Map();
}
