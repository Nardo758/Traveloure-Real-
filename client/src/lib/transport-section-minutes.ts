/**
 * Audit B8 follow-up (architect dispatch CB-M; rulings 2026-10-25 22:50 ET and 2026-10-26 01:15 ET; ledger
 * `2026-10-25-b8-transport-section`). The Transport section, the hero "Travel time" and the shared link's
 * expert copy print minutes only for a CHECKED leg; any other leg prints its mode label.
 *
 * A checked leg is exactly what the Trip Card's `LegLine` draws as routed (`TripCardDays.tsx`):
 * `routedLegBetween` finds it — `routed` present (the server sends it only for a routing-engine leg), a
 * known mode and positive minutes. This file wraps that rule; it adds no predicate of its own. Pure.
 */
import { routedLegBetween } from "./slip-legs";
import { TRANSPORT_MODE_LABELS } from "./maps-platform";
import type { PlanCardDay, PlanCardTransport } from "@/components/plancard/plancard-types";

/** Traveler-facing words on the Transport section. */
export const TRANSPORT_SECTION_COPY = {
  suggested: "Suggested",
} as const;

/** The leg's mode label — the same lookup `LegLine` prints. */
export function transportModeLabel(tr: PlanCardTransport): string {
  const mode = String((tr as any).userSelectedMode ?? (tr as any).recommendedMode ?? (tr as any).mode ?? "");
  return (TRANSPORT_MODE_LABELS as Record<string, string>)[mode] ?? mode;
}

/** True when the Trip Card's `LegLine` would draw this leg as routed (checked). */
export function isCheckedTransport(tr: PlanCardTransport): boolean {
  const fromId = (tr as any).fromActivityId ?? (tr as any).from;
  const toId = (tr as any).toActivityId ?? (tr as any).to;
  return !!(fromId && toId && routedLegBetween([{ transports: [tr as any] }], fromId, toId));
}

export interface TransportLegMinutes {
  id: string;
  checked: boolean;
  /** The leg's own minutes, only when checked. */
  minutes: number | null;
  label: string;
}

export interface TransportModeMinutes {
  mode: string;
  label: string;
  /** The mode's summed minutes, only when EVERY leg of that mode is checked (OP-4). */
  minutes: number | null;
}

export interface TransportMinutesView {
  legs: TransportLegMinutes[];
  /** The day's summed minutes, only when there is at least one leg and every leg is checked (OP-2). */
  totalMinutes: number | null;
  modes: TransportModeMinutes[];
}

/** Pure. What a day's Transport section may print. Sums read `duration`, as the section always has. */
export function transportMinutesView(transports: readonly PlanCardTransport[] | null | undefined): TransportMinutesView {
  const list = transports ?? [];
  const legs = list.map((tr) => {
    const checked = isCheckedTransport(tr);
    return { id: tr.id, checked, minutes: checked ? tr.duration || 0 : null, label: transportModeLabel(tr) };
  });
  const allChecked = legs.length > 0 && legs.every((l) => l.checked);
  const totalMinutes = allChecked ? list.reduce((s, t) => s + (t.duration || 0), 0) : null;
  const modes = Array.from(new Set(list.map((t) => t.mode))).map((mode) => {
    const ofMode = list.filter((t) => t.mode === mode);
    const every = ofMode.every((t) => isCheckedTransport(t));
    return {
      mode,
      label: (TRANSPORT_MODE_LABELS as Record<string, string>)[mode] ?? mode,
      minutes: every ? ofMode.reduce((s, t) => s + (t.duration || 0), 0) : null,
    };
  });
  return { legs, totalMinutes, modes };
}

/**
 * Pure. The hero "Travel time": the caller's sum, unchanged, when the plan has at least one leg and every
 * leg of every day is checked; otherwise null, and the cell is omitted.
 */
export function heroTravelMinutes(days: readonly PlanCardDay[] | null | undefined, totalMinutes: number): number | null {
  const legs = (days ?? []).flatMap((d) => d?.transports ?? []);
  if (legs.length === 0) return null;
  return legs.every((tr) => isCheckedTransport(tr)) ? totalMinutes : null;
}
