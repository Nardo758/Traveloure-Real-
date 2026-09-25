/**
 * RESUME AFTER DISMISS (audit R-3; `docs/audits/GAP_REGISTER.md` `plan-modal:dialog-on-open-change`,
 * J6-F1: "no confirm or draft on dismiss — Escape: writes=0; reopened at step 1 empty").
 *
 * Two decisions, each stated ONCE here and read by the plan modal (§18 rule 1):
 *
 *  1. WHEN A DISMISS HOLDS A DRAFT. Closing the modal (✕ / Escape / backdrop) still CREATES NOTHING —
 *     no `trips` row, ever (RC-1). What it may do is keep the traveler's answers in the pre-trip pen,
 *     exactly where "Save" already keeps them for a plan that does not exist yet. It does so only
 *     when (a) no plan is bound — a bound plan's pen mirrors a real row, and a dismiss must never
 *     re-describe it (the #972 / RC-6 class) — and (b) the traveler actually changed an answer in
 *     this sitting. An untouched form, including a city a DOOR pre-filled and a home city the modal
 *     SUGGESTED, is not an answer and is not held (§13).
 *
 *  2. WHAT THE RESUME PROMPT MAY SAY. Only the pen's own destination and dates — never a party size
 *     (RC-12: an unstated count is not a count), never an occasion guessed from a slug, and never a
 *     date that is not a real calendar day. No destination and no start date ⇒ nothing to resume.
 */
import { sameCity } from "./plan-city";
import type { PlanStepId } from "./plan-steps";

/** The slice of the pen the prompt reads. Structural, so the pure tests need no React. */
export interface ResumePen {
  tripId?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface PenDraft {
  /** The pen's destination, verbatim (trimmed). `null` = the traveler has not said where. */
  destination: string | null;
  /** `YYYY-MM-DD`, or `null` when the pen holds no real day. */
  startDate: string | null;
  /** `YYYY-MM-DD`, or `null`. Never present without a start date. */
  endDate: string | null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day, or null — "2026-02-30" is not one, and a malformed string is not one. */
export function realDay(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !YMD.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === value ? value : null;
}

/**
 * The draft an UNMINTED pen holds, or `null` when there is nothing to resume.
 * A pen bound to a plan is not a draft — it is that plan, and the slip is where it resumes.
 */
export function resumablePenDraft(pen: ResumePen | null | undefined): PenDraft | null {
  if (!pen || pen.tripId) return null;
  const destination = typeof pen.destination === "string" && pen.destination.trim() ? pen.destination.trim() : null;
  const startDate = realDay(pen.startDate);
  // An end date means nothing without the start it closes, and one before it is not a range.
  const rawEnd = startDate ? realDay(pen.endDate) : null;
  const endDate = rawEnd && startDate && rawEnd >= startDate ? rawEnd : null;
  if (!destination && !startDate) return null;
  return { destination, startDate, endDate };
}

/**
 * Whether reopening the modal OFFERS the pen's draft. Only when the form is actually showing it: a
 * door that names a DIFFERENT city is the traveler asking for a different plan, and a prompt to
 * "resume Osaka" over a form that says Kyoto would contradict the screen it sits on.
 */
export function offersResume(
  draft: PenDraft | null,
  opts: { boundTripId?: string | null; doorDestination?: string | null },
): boolean {
  if (!draft || opts.boundTripId) return false;
  const door = opts.doorDestination?.trim();
  if (!door) return true;
  return draft.destination !== null && sameCity(draft.destination, door);
}

/**
 * Whether a dismiss holds the form's answers in the pen. `changed` is the modal's own comparison of
 * what the traveler now has on screen against what the form was seeded with at open.
 */
export function holdsDraftOnDismiss(opts: {
  boundTripId?: string | null;
  saving: boolean;
  changed: boolean;
}): boolean {
  if (opts.boundTripId) return false;
  // A save in flight owns the write; a dismiss racing it must not write a second, older picture.
  if (opts.saving) return false;
  return opts.changed;
}

/**
 * The answers a comparison looks at, normalised so "the same form" always yields the same string.
 * Built twice by the modal — from the pen at seed time and from state at dismiss — and compared here.
 */
export interface DraftAnswers {
  title: string;
  stops: readonly string[];
  startDate: string;
  endDate: string;
  adults: string;
  kids: string;
  budgetApproverName: string;
  budgetApproverEmail: string;
  accessibilityNote: string;
  mainMomentTime: string;
  mainMomentDate: string;
  events: ReadonlyArray<{ title: string; eventDate?: string | null; startTime?: string | null; location?: string | null }>;
  occasionSlug: string;
}

export function draftSignature(a: DraftAnswers): string {
  return JSON.stringify([
    a.title.trim(),
    a.stops.map((s) => s.trim()),
    a.startDate,
    a.endDate,
    a.adults,
    a.kids,
    a.budgetApproverName.trim(),
    a.budgetApproverEmail.trim(),
    a.accessibilityNote.trim(),
    a.mainMomentTime,
    a.mainMomentDate,
    a.events.map((e) => [e.title, e.eventDate ?? null, e.startTime ?? null, e.location ?? null]),
    a.occasionSlug,
  ]);
}

/**
 * Where "Continue" lands: the first basic the draft has not answered, in flow order — else the
 * last visible step, where the finish is. Only steps the modal actually shows are candidates.
 */
export function resumeStep(
  visibleSteps: readonly PlanStepId[],
  answered: { occasion: boolean; where: boolean; when: boolean },
): PlanStepId {
  for (const s of ["occasion", "where", "when"] as const) {
    if (visibleSteps.includes(s) && !answered[s]) return s;
  }
  return visibleSteps[visibleSteps.length - 1] ?? "occasion";
}
