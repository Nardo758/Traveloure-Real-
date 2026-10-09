/**
 * THE ONE-STAY CARD'S WORDS (S1 "one stay on the plan", Locked Decision 64; brief
 * `docs/planning/briefs/s1-one-stay.md` ruling 6 — the card is the Conformance lane's Compare PR).
 *
 * Reads the server's `stay` block on `GET /api/trips/:tripId/where-to-stay` and computes nothing:
 * the pick, "scored N of M nearby" and `changed` are the server's (stay-pick.service.ts is the ONE
 * writer). Every sentence the card says lives here (§18 rule 1).
 *
 * §13: a routed plan with no pick yet draws NO card (never "no stay found"); "scored N of M" is
 * said only when both numbers are known and M > 0; no price and no commission is ever shown — the
 * payload carries none (ruling 5).
 *
 * "View on hotel's site" needs the hotel's own domain, which `StayHotel` does not carry yet — it
 * arrives with FU-S1-2's rail. Until then the link slot is the Maps fallback: a Google Maps search
 * for the hotel's name and the plan's city, labelled with its attribution beside it.
 */
import type { StayHotel, WhereToStayStay } from "@shared/where-to-stay";
import type { StayCloseness } from "@shared/stay-pick";
import { buildGoogleMapsDeepLink } from "@/lib/maps";

export const STAY_PICK_TITLE = "Our pick for your days";
export const STAY_PICK_SUBTITLE = "Closest to your stops on most days, by travel time.";
export const STAY_STRAIGHT_LINE_TITLE = "Closest to your stops";
export const STAY_STRAIGHT_LINE_SUBTITLE = "By straight line. Optimize scores stays by travel time to your stops.";
export const STAY_CHANGED_LINE = "Updated for your latest stops.";
export const STAY_HERE_LABEL = "Stay here";
export const STAY_SWAP_LEAD = "Rather pick yourself?";
/** The link slot until FU-S1-2 serves the hotel's own site. */
export const STAY_MAP_LINK_LABEL = "View on map";
/** Shown beside every link that opens Google Maps. */
export const GOOGLE_MAPS_ATTRIBUTION = "Google Maps";

/** "Scored 21 of 34 nearby" — null unless both counts are known and the total is positive. */
export function stayScoredLine(scored: number | null | undefined, total: number | null | undefined): string | null {
  if (typeof scored !== "number" || typeof total !== "number" || !Number.isFinite(scored) || !Number.isFinite(total)) return null;
  if (total <= 0 || scored < 0) return null;
  return `Scored ${Math.min(scored, total)} of ${total} nearby`;
}

/**
 * The Maps fallback for the link slot: a name search for the hotel in the plan's city, built by the ONE
 * canonical Maps builder (`@/lib/maps`; the trip-card-honesty guard). It is always a Google Maps link,
 * because the attribution beside it says "Google Maps".
 */
export function stayMapsHref(name: string, city?: string | null): string {
  const query = [name.trim(), (city ?? "").trim()].filter(Boolean).join(", ");
  return buildGoogleMapsDeepLink([{ name: query }]);
}

/**
 * "Close to N of M days" (R394, ruling Oct 9, 2026): read from S1's own `closeness` and never computed
 * here. A day is close when the stay is within the configured routed minutes (paid) or straight-line
 * kilometres (free) of every located stop that day; M = days with a located stop. The free tier says it
 * is by straight line. Absent, null or no located day ⇒ no line (§13) — never "0 of 0".
 */
export const STAY_CLOSE_STRAIGHT_SUFFIX = "by straight line";
export function stayClosenessLine(c: StayCloseness | null | undefined): string | null {
  if (!c) return null;
  const { closeDays, locatedDays, basis } = c;
  if (!Number.isInteger(closeDays) || !Number.isInteger(locatedDays) || locatedDays <= 0 || closeDays < 0) return null;
  const base = `Close to ${Math.min(closeDays, locatedDays)} of ${locatedDays} ${locatedDays === 1 ? "day" : "days"}`;
  return basis === "straight_line" ? `${base} ${STAY_CLOSE_STRAIGHT_SUFFIX}` : base;
}

export type StayCardHotel = StayHotel & { closeness?: StayCloseness | null };
export type StayCardModel =
  | { tier: "routed"; hotels: [StayCardHotel]; scoredLine: string | null; changed: boolean }
  | { tier: "straight_line"; hotels: StayCardHotel[]; scoredLine: null; changed: false };

/** What the card draws, or null when it draws nothing (no stay block, no pick, no hotels). */
export function stayCardModel(stay: WhereToStayStay | null | undefined): StayCardModel | null {
  if (!stay) return null;
  if (stay.tier === "routed") {
    if (!stay.pick) return null;
    return { tier: "routed", hotels: [{ ...stay.pick, closeness: stay.closeness ?? null }], scoredLine: stayScoredLine(stay.scoredCount, stay.candidateCount), changed: !!stay.changed };
  }
  const hotels = (stay.hotels ?? []).slice(0, 3);
  return hotels.length ? { tier: "straight_line", hotels, scoredLine: null, changed: false } : null;
}
