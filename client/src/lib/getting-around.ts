/**
 * "Getting around" (step 9c D7, ledger `2026-10-07-step9c-leg-options`) — the plan's shown legs by day,
 * each as ONE line: the routed line the slip draws, or the minutes-only line (D5). Pure; no calls.
 */
import { routedLegLine } from "@shared/routing-engine";
import { normalizeLegMode } from "@shared/travel-speeds";
import { unroutedLegLine } from "./slip-legs";

export const GETTING_AROUND_EMPTY = "No travel between your stops yet. Times appear here once your plan's legs are worked out.";

export interface GettingAroundDay {
  dayNumber: number;
  legs: Array<{ legId: string; title: string; line: string }>;
}

export function gettingAroundDays(days: readonly any[] | null | undefined, timeZone: string | null): GettingAroundDay[] {
  const out: GettingAroundDay[] = [];
  for (const d of days ?? []) {
    const dayNumber = Number(d?.dayNumber ?? d?.dayNum);
    const legs: GettingAroundDay["legs"] = [];
    for (const l of d?.transports ?? []) {
      const minutes = Number(l?.estimatedDurationMinutes ?? l?.durationMin);
      if (!Number.isFinite(minutes) || minutes <= 0) continue;
      const mode = normalizeLegMode(l.userSelectedMode ?? l.recommendedMode ?? l.mode ?? null);
      const line =
        l.routed && mode
          ? routedLegLine({ mode, route: { durationMin: minutes, distanceM: Number(l.distanceMeters ?? 0), line: l.routed.line, fare: l.routed.fare, provenance: l.routed.provenance } }, timeZone)
          : unroutedLegLine(mode, Math.round(minutes));
      legs.push({ legId: String(l.id), title: [l.fromName, l.toName].filter(Boolean).join(" → ") || "Leg", line });
    }
    if (legs.length && Number.isFinite(dayNumber)) out.push({ dayNumber, legs });
  }
  return out.sort((a, b) => a.dayNumber - b.dayNumber);
}
