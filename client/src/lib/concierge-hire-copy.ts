/**
 * CN-1d-UI (ledger `2026-11-01-cn1d-ui-hire-for-this-trip`): "Hire for this trip" — every new traveler-facing
 * string for the concierge hire, in ONE object, and the pure rules the screen reads.
 *
 * PAYMENT MODEL (Leon, Nov 1, 2026, 2:56 PM ET; LD 49 as amended by #1852): a concierge hire is CHARGED at
 * checkout and awaits the expert's acceptance; a decline or the CONCIERGE_ACCEPT_HOURS timeout refunds it in
 * full. There is no hold, so nothing here says "authorized", "hold" or "released", and CN1_COPY.hireAuthNote /
 * CN1_COPY.hireReleased are deliberately NOT re-exported (they stay in shared/cn1-copy.ts, unused).
 *
 * Approved strings are CN1_COPY keys, read and never restated. Everything marked HELD is a placeholder pending
 * Leon and is listed in the PR body under NEEDS LEON APPROVAL.
 */
import { CN1_COPY } from "@shared/cn1-copy";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { formatTripDates } from "@/lib/trip-dates";

export const CONCIERGE_HIRE_COPY = {
  // ── Approved (CN-1 table; render verbatim) ──
  cta: CN1_COPY.hireCta,
  consent: CN1_COPY.hireConsent,
  accessDates: CN1_COPY.hireAccessDates,
  pricePerTrip: CN1_COPY.pricePerTrip,
  responseHours: CN1_COPY.responseHours,
  taskLinkOnly: CN1_COPY.taskLinkOnly,
  // ── HELD (pending Leon) ──
  /** H1 — no plan with chosen dates to hire for. */
  noEligiblePlan: "Add dates to a plan first, then you can hire {name} for it.",
  /** H2 — the charge/refund rule, beneath the consent tick. */
  chargeRule: "You're charged now. If {name} can't take this trip, you get a full refund.",
  /** H3 — CN1_COPY.hireCancelRule with "release" read as refund (shared/cn1-copy.ts is not edited). */
  cancelRule: "You can cancel for a full refund until {name} completes a task. After that, we review cancellations case by case.",
  /** H4 — the consent dialog's confirm button. */
  confirm: "Hire {name}",
  /** H5 — the trip page once a concierge's access has ended. */
  accessEnded: "{name}'s access to this trip ended on {end_date}.",
  /** H6 — a task's cap, after its label. */
  taskCap: "up to {cap}",
  /** H7 — the plan picker's line in hire mode (the existing line minus its "or start a new plan" clause). */
  pickerDescription: 'Choose which plan "{item}" is for.',
} as const;

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), template);

/** The calendar day a DATE column carries ("2027-04-05", or that day at UTC midnight) — never `new Date()` on it. */
export function calendarDay(value: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return m ? m[1] : null;
}

/**
 * A trip day as the traveler reads it ("Apr 5"). The stored value IS the trip's own local calendar day (a DATE
 * in the trip's zone), so it is formatted as that day — no instant, no shift into the viewer's zone.
 */
export function formatTripDay(value: string | null | undefined): string | null {
  const day = calendarDay(value);
  return day ? formatTripDates(day) : null;
}

/** The first word of a display name ("Aya Local" → "Aya"); null when there is none. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

export interface HirePlan {
  id: string;
  endDate?: string | null;
  datesConfirmedAt?: string | Date | boolean | null;
}

/**
 * A hire needs the access window, so only a plan whose dates the traveler CHOSE (LD 30: `dates_confirmed_at`,
 * read through the ONE `planDatesAreConfirmed`) and that has a last day can be hired for. A placeholder window is
 * not a trip anyone planned.
 */
export function hireEligiblePlan(plan: HirePlan): boolean {
  return planDatesAreConfirmed(plan.datesConfirmedAt ?? null) && calendarDay(plan.endDate) !== null;
}

export const noEligiblePlanLine = (name: string) => fill(CONCIERGE_HIRE_COPY.noEligiblePlan, { name });
export const chargeRuleLine = (name: string) => fill(CONCIERGE_HIRE_COPY.chargeRule, { name });
export const cancelRuleLine = (name: string) => fill(CONCIERGE_HIRE_COPY.cancelRule, { name });
export const confirmLabel = (name: string) => fill(CONCIERGE_HIRE_COPY.confirm, { name });
export const taskCapLine = (cap: number) => fill(CONCIERGE_HIRE_COPY.taskCap, { cap });
export const pickerDescriptionLine = (item: string) => fill(CONCIERGE_HIRE_COPY.pickerDescription, { item });
export const taskLinkOnlyLine = (name: string) => fill(CONCIERGE_HIRE_COPY.taskLinkOnly, { name });

/** The consent tick's text: {name} and {end_date} = the trip's last day. */
export function consentLine(name: string, tripEndDate: string | null | undefined): string | null {
  const end = formatTripDay(tripEndDate);
  return end ? fill(CONCIERGE_HIRE_COPY.consent, { name, end_date: end }) : null;
}

export interface ConciergeAdvisorRow {
  source?: string | null;
  accessUntil?: string | null;
  first_name?: string | null;
}

/**
 * The trip page's concierge line: the access window while it runs (approved hireAccessDates), the ended line once
 * `accessUntil` has passed (H5). A handoff advisor (source 'handoff' or null) gets null — its card is unchanged.
 */
export function conciergeAccessLine(
  advisor: ConciergeAdvisorRow | null | undefined,
  trip: { startDate?: string | null; endDate?: string | null } | null | undefined,
  now: Date,
): { kind: "active" | "ended"; text: string } | null {
  if (!advisor || advisor.source !== "concierge") return null;
  const name = (advisor.first_name ?? "").trim();
  const start = formatTripDay(trip?.startDate);
  const end = formatTripDay(trip?.endDate);
  if (!name || !end) return null;
  const until = advisor.accessUntil ? new Date(advisor.accessUntil) : null;
  if (until && !Number.isNaN(until.getTime()) && now.getTime() > until.getTime()) {
    return { kind: "ended", text: fill(CONCIERGE_HIRE_COPY.accessEnded, { name, end_date: end }) };
  }
  if (!start) return null;
  return { kind: "active", text: fill(CONCIERGE_HIRE_COPY.accessDates, { name, start_date: start, end_date: end }) };
}

/**
 * The server's own sentence out of an `apiRequest` failure ("409: {\"message\":…}"). Falls back to the raw text,
 * never to a sentence of ours.
 */
export function serverMessageOf(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m = /^\d{3}:\s*([\s\S]*)$/.exec(raw);
  const body = m ? m[1] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string" && parsed.message) return parsed.message;
  } catch {
    /* not JSON */
  }
  return body.trim() || null;
}

/** The ONE cart body a hire sends: the listing, one unit, and the plan it is for. Nothing priced client-side (§14). */
export function hireCartBody(serviceId: string, tripId: string): { serviceId: string; quantity: 1; tripId: string } {
  return { serviceId, quantity: 1, tripId };
}

/**
 * A single-flight latch for the confirm: `tryStart()` answers true once until `settle()`, so a double click sends one
 * request. Pure, so the guard itself is testable without a DOM.
 */
export function createSingleFlight(): { tryStart: () => boolean; settle: () => void; inFlight: () => boolean } {
  let busy = false;
  return {
    tryStart: () => {
      if (busy) return false;
      busy = true;
      return true;
    },
    settle: () => {
      busy = false;
    },
    inFlight: () => busy,
  };
}
