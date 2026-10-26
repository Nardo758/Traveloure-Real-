/**
 * "Getting around" (step 9c D7, ledger `2026-10-07-step9c-leg-options`; production smoke F1, ledger
 * `2026-10-08-getting-around-every-gap`) — the plan's days, each listing EVERY gap between consecutive
 * stops, in slip order. A gap reads:
 *   · a routed leg → the same line the slip and the Trip Card draw (`routedLegLine`)
 *   · a shown leg with minutes but no routed facts → minutes only ("15 min · walk", D5)
 *   · the engine's straight-line stand-in (`estimate`) → "{mode} · Not checked yet" — no minutes (audit B8)
 *   · a leg the server names as having no time (a stop with no open point, LG-2 Ask 6) → "Travel time not checked yet"
 *   · no leg, or a leg with no minutes → "not worked out yet" — never dropped, never guessed (§13)
 * Days never vanish: a day with one stop (or none) is still listed, with no gaps. On a plan that does
 * not earn routed legs (`routedLegs` absent on the plancard), one header line says where times come
 * from. Pure; no calls.
 */
import { routedLegLine } from "@shared/routing-engine";
import { TRAVEL_TIME_NOT_CHECKED_LINE, slipLegBetween, unroutedLegLine } from "./slip-legs";
import { TRAVEL_TIMES_COME_WITH_OPTIMIZE } from "@shared/optimizer-lead";
import { PLAN_COMPARE_MINUTE_COPY } from "./plan-compare";

export const GETTING_AROUND_EMPTY = "No stops on this plan yet.";
export const GETTING_AROUND_PENDING = "not worked out yet";
/** One home for the words (P0-d): the Optimize card's free-plan line reads the same constant. */
export const GETTING_AROUND_OPTIMIZE_HEADER = TRAVEL_TIMES_COME_WITH_OPTIMIZE;
/**
 * P0-b item 1 (ledger `2026-10-11-p0b-routing-follow-ups`): the header says WHY a plan's legs are not
 * worked out, from the server's `legsSkipped` (the engine's own skip reason). A free plan keeps the
 * Optimize line; `no_trip` cannot reach a rendered plan and draws the Optimize line too.
 */
export const GETTING_AROUND_ENGINE_OFF_HEADER = "Travel times aren't being worked out right now.";
export const GETTING_AROUND_DATES_HEADER = "Set your dates to work out travel times.";
/** P0-b item 2: a gap whose stop has no point on the map — say which, never guess a route (§13). */
export function gettingAroundUnlocatedLine(stop: string): string {
  return `${GETTING_AROUND_PENDING} — ${stop} isn't on the map`;
}

export interface GettingAroundGap {
  key: string;
  title: string;
  line: string;
  /** `not_checked` (LG-2 Ask 6): a stop has no open point, so the leg exists with no time. */
  kind: "routed" | "unrouted" | "not_checked" | "pending";
}

export interface GettingAroundDay {
  dayNumber: number;
  gaps: GettingAroundGap[];
}

const stopName = (a: any): string => String(a?.name ?? a?.title ?? "Stop");
const finite = (v: unknown): boolean => v != null && v !== "" && Number.isFinite(Number(v));
const hasPoint = (a: any): boolean => finite(a?.lat) && finite(a?.lng);

export function gettingAroundDays(days: readonly any[] | null | undefined, timeZone: string | null): GettingAroundDay[] {
  const out: GettingAroundDay[] = [];
  for (const d of days ?? []) {
    const dayNumber = Number(d?.dayNumber ?? d?.dayNum);
    if (!Number.isFinite(dayNumber)) continue;
    const stops: any[] = Array.isArray(d?.activities) ? d.activities.filter((a: any) => a?.id) : [];
    const gaps: GettingAroundGap[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i];
      const to = stops[i + 1];
      const leg = slipLegBetween([d], String(from.id), String(to.id));
      // LG-2 Ask 6: every gap is its own two stops — no leg goes round a stop with no point.
      const title = `${stopName(from)} → ${stopName(to)}`;
      const key = `${from.id}>${to.id}`;
      if (leg?.kind === "routed") gaps.push({ key, title, kind: "routed", line: routedLegLine({ mode: leg.mode, route: leg.route }, timeZone) });
      else if (leg?.kind === "unrouted") {
        // Audit B8: a straight-line estimate is not a checked travel time, so it prints no minutes.
        const line = leg.estimate === true
          ? [leg.mode, PLAN_COMPARE_MINUTE_COPY.notCheckedYet].filter(Boolean).join(" · ")
          : unroutedLegLine(leg.mode, leg.minutes);
        gaps.push({ key, title, kind: "unrouted", line });
      }
      else if (leg?.kind === "not_checked") gaps.push({ key, title, kind: "not_checked", line: TRAVEL_TIME_NOT_CHECKED_LINE });
      else {
        const unlocated = [from, to].find((a) => !hasPoint(a));
        gaps.push({ key, title, kind: "pending", line: unlocated ? gettingAroundUnlocatedLine(stopName(unlocated)) : GETTING_AROUND_PENDING });
      }
    }
    out.push({ dayNumber, gaps });
  }
  return out.sort((a, b) => a.dayNumber - b.dayNumber);
}

/** The header line: why legs are skipped, null on a plan whose legs are worked out. */
export function gettingAroundHeader(plan: { routedLegs?: boolean; legsSkipped?: string } | null | undefined): string | null {
  switch (plan?.legsSkipped) {
    case "engine_off":
      return GETTING_AROUND_ENGINE_OFF_HEADER;
    case "dates_not_confirmed":
      return GETTING_AROUND_DATES_HEADER;
    case "free_plan":
    case "no_trip":
      return GETTING_AROUND_OPTIMIZE_HEADER;
  }
  return plan?.routedLegs === true ? null : GETTING_AROUND_OPTIMIZE_HEADER;
}
