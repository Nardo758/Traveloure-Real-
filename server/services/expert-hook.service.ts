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
    const { planMarketForTrip } = await import("./expert-door.service");
    const market = await planMarketForTrip(tripId);
    const { switchOn, canAsk } = await expertAvailabilityForMarket(market.key);
    return { switchOn, cityName: market.cityName, canAsk };
  } catch (err: any) {
    console.warn(`[expert-hook] ${tripId}: not computed: ${String(err?.message ?? err).slice(0, 200)}`);
    return null;
  }
}

/**
 * SH-1 item 11 (rulings Q11.1–Q11.3): THE one answer to "does this market have an expert to ask?", read by the in-plan
 * hook above and by every expert call-to-action on the site (`GET /api/expert-availability`). The city's switch must be
 * on AND its chooser must have someone in it (`chooserHasExperts`). No market ⇒ no.
 */
export async function expertAvailabilityForMarket(marketKey: string | null | undefined): Promise<{ switchOn: boolean; canAsk: boolean }> {
  if (!marketKey) return { switchOn: false, canAsk: false };
  const cities = await getExpertHookCities();
  const switchOn = cities.includes(marketKey);
  if (!switchOn) return { switchOn, canAsk: false };
  const { chooserHasExperts } = await import("./expert-door.service");
  return { switchOn, canAsk: await chooserHasExperts(marketKey) };
}

/** Q11.3: a call-to-action that names no city shows when ANY switched-on market answers yes. */
export async function anyMarketHasExperts(): Promise<boolean> {
  for (const key of await getExpertHookCities()) {
    if ((await expertAvailabilityForMarket(key)).canAsk) return true;
  }
  return false;
}

/** Per day, `{ count, href }` for the in-season line. Empty until FB-1 step 8 — see the file note. */
export async function inSeasonAdditionsForTrip(_tripId: string): Promise<Map<number, { count: number; href: string }>> {
  return new Map();
}
