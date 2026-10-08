/**
 * "Getting around" (step 9c D7, ledger `2026-10-07-step9c-leg-options`; production smoke F1, ledger
 * `2026-10-08-getting-around-every-gap`) — the plan's days, each listing EVERY gap between consecutive
 * stops, in slip order. A gap reads:
 *   · a routed leg → the same line the slip and the Trip Card draw (`routedLegLine`)
 *   · a shown leg with minutes but no routed facts → minutes only ("15 min · walk", D5)
 *   · no leg, or a leg with no minutes → "not worked out yet" — never dropped, never guessed (§13)
 * Days never vanish: a day with one stop (or none) is still listed, with no gaps. On a plan that does
 * not earn routed legs (`routedLegs` absent on the plancard), one header line says where times come
 * from. Pure; no calls.
 */
import { routedLegLine } from "@shared/routing-engine";
import { slipLegBetween, unroutedLegLine } from "./slip-legs";

export const GETTING_AROUND_EMPTY = "No stops on this plan yet.";
export const GETTING_AROUND_PENDING = "not worked out yet";
export const GETTING_AROUND_OPTIMIZE_HEADER = "Travel times come with Optimize";

export interface GettingAroundGap {
  key: string;
  title: string;
  line: string;
  kind: "routed" | "unrouted" | "pending";
}

export interface GettingAroundDay {
  dayNumber: number;
  gaps: GettingAroundGap[];
}

const stopName = (a: any): string => String(a?.name ?? a?.title ?? "Stop");

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
      const title = `${stopName(from)} → ${stopName(to)}`;
      const key = `${from.id}>${to.id}`;
      if (leg?.kind === "routed") gaps.push({ key, title, kind: "routed", line: routedLegLine({ mode: leg.mode, route: leg.route }, timeZone) });
      else if (leg?.kind === "unrouted") gaps.push({ key, title, kind: "unrouted", line: unroutedLegLine(leg.mode, leg.minutes) });
      else gaps.push({ key, title, kind: "pending", line: GETTING_AROUND_PENDING });
    }
    out.push({ dayNumber, gaps });
  }
  return out.sort((a, b) => a.dayNumber - b.dayNumber);
}

/** The header line, or null on a plan that earns routed legs. */
export function gettingAroundHeader(plan: { routedLegs?: boolean } | null | undefined): string | null {
  return plan?.routedLegs === true ? null : GETTING_AROUND_OPTIMIZE_HEADER;
}
