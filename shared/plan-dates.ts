/**
 * plan-dates.ts — WERE THIS PLAN'S DATES CHOSEN, OR FILLED IN FOR IT?
 *
 * Ledger `2026-09-15-d22-dates-confirmed` (punchlist **D-22** = yes, **R-4**); migration 302;
 * CLAUDE.md §13, §18 rule 1, Locked Decisions 30 and 45 (6). Pure: no drizzle, no fetch, no React,
 * no clock of its own.
 *
 * WHY THIS FILE EXISTS. `trips.start_date` / `trips.end_date` are NOT NULL, so every plan has a
 * window — and three mint paths fill one in because the columns demand it rather than because
 * anybody answered: the ready-made CLONE (`new Date()` + `duration_days - 1`), the two expert
 * AUTHORING builds (a synthetic window on a template that is not scheduled travel), and the cart /
 * experience mints that fall back to today. Migration 302 added the fact that tells those apart:
 * `trips.dates_confirmed_at`. This module is the ONE place that fact becomes a rendering decision.
 *
 * A SECOND COPY IS THE DRIFT §18 RULE 1 NAMES. "Are these dates real?" is asked by the slip header,
 * the My-plans row, the Trip Card, the `.ics` exporter, the Home time axis and the countdown. If
 * each answers it locally, they disagree the day the rule moves — and the failure mode is a surface
 * quietly re-certifying a window nobody picked. Every one of them calls in here.
 *
 * §13 — WHAT THE ABSENCE MEANS, AND WHAT IT DOES NOT.
 *   * NULL = **NOT CONFIRMED**, a finished answer: the plan HAS a window and nobody chose it.
 *   * NULL is **never** "this plan has no dates" — that is false, the columns are NOT NULL.
 *   * NULL **withholds** two claims rather than substituting anything: no pinned `.ics` DTSTART
 *     (the floating output Locked Decision 30 rules for a plan with no zone, for the same reason
 *     one derivative over — a pinned instant needs a real DAY as much as a real zone), and no
 *     countdown at all (Locked Decision 45 (6): no instant, no countdown).
 *   * A row that does not carry the field (an older payload, a caller that has not been widened)
 *     is `undefined`, which reads as NOT CONFIRMED here — the same direction as NULL, because the
 *     safe failure mode for a CLAIM is to withhold it.
 */

/**
 * What a reader hands in. Four shapes, and the fourth is the reason this is a union rather than a
 * timestamp: a SERVER reader holds `trips.dates_confirmed_at` itself (a `Date`, or an ISO string
 * off the wire, or `null`), while a CLIENT surface holds the plancard DTO's `trip.datesConfirmed`
 * — a BOOLEAN, which is this same predicate already run once on the server. Accepting both keeps
 * the answer in one place instead of making the client re-derive it or the server publish the
 * timestamp (when the dates were certified is nobody's business on a read surface).
 */
export type PlanDatesConfirmedAt = string | Date | boolean | null | undefined;

/**
 * THE PREDICATE. Were these dates chosen by the traveler?
 *
 * A present, parseable timestamp is the only "yes". An unparseable value answers NO rather than
 * throwing or trusting the mere presence of a string: a stamp we cannot read is a stamp we cannot
 * vouch for, and the column carries no DB CHECK (publish-trap posture), so a junk value is
 * reachable in principle.
 */
export function planDatesAreConfirmed(datesConfirmedAt: PlanDatesConfirmedAt): boolean {
  if (datesConfirmedAt == null) return false;
  // The server's own already-resolved answer, passed straight through — see the type's note.
  if (typeof datesConfirmedAt === "boolean") return datesConfirmedAt;
  if (datesConfirmedAt instanceof Date) return !Number.isNaN(datesConfirmedAt.getTime());
  const raw = String(datesConfirmedAt).trim();
  if (!raw) return false;
  return !Number.isNaN(new Date(raw).getTime());
}

/**
 * MAY A READER PIN AN INSTANT TO THIS PLAN? — the one question the `.ics` exporter and every
 * countdown ask, and they ask it together because they need BOTH halves of the same fact:
 *
 *   * a usable zone (Locked Decision 30 — otherwise the wall clock has no instant), and
 *   * a day somebody actually chose (this ruling — otherwise the instant is pinned to a guess).
 *
 * BOTH ARGUMENTS ARE ALREADY-RESOLVED ANSWERS, deliberately. Neither half is re-implemented here:
 * the zone answer comes from `isUsableTimeZone` (`shared/plan-timing.ts`) and the date answer from
 * `planDatesAreConfirmed` above (or, on a client surface, from the plancard DTO's own
 * `trip.datesConfirmed`, which is that same predicate run once on the server). This function owns
 * only the CONJUNCTION — that a pinned instant needs both — which is the part that was previously
 * written out at each caller.
 */
export function planInstantIsClaimable(
  hasUsableTimezone: boolean,
  datesAreConfirmed: boolean,
): boolean {
  return hasUsableTimezone && datesAreConfirmed;
}

/** The short chip a surface renders beside an unconfirmed window. */
export const PLAN_DATES_PLACEHOLDER_CHIP = "placeholder dates";

/** The sentence that explains the chip. Said once, so every surface explains it the same way. */
export const PLAN_DATES_PLACEHOLDER_NOTE =
  "These dates are a placeholder — nobody has chosen them yet.";

/** The owner-only call to action that opens the re-date rail (punchlist R-4). */
export const PLAN_DATES_SET_CTA = "Set your dates";

export interface PlanDatesLabel {
  /** true when the traveler chose this window; false when it is the platform's placeholder. */
  confirmed: boolean;
  /**
   * The chip to render beside the window, or null when there is nothing to add. A CONFIRMED plan
   * gets NO chip: "confirmed dates" is a label nobody needs, and the unmarked case must stay the
   * quiet one.
   */
  chip: string | null;
  /** The explanatory sentence (tooltip / helper line), or null for a confirmed plan. */
  note: string | null;
  /**
   * The call to action, or null. Present ONLY for the OWNER of an unconfirmed plan — Locked
   * Decision 42 D16 puts the plan's edit controls on the owner's slip and nobody else's, and an
   * advisor pressing "Set your dates" would be choosing the traveler's dates for them.
   */
  cta: string | null;
}

/**
 * THE LABEL DERIVATION — the whole of what a surface renders about the *status* of a window.
 *
 * It deliberately does NOT format the dates themselves: `MMM d – MMM d, yyyy` is presentation and
 * already lives at each surface, and pulling it in here would make this module a date formatter
 * with a locale question attached. What it owns is the part that is a RULE.
 */
export function planDatesLabel(
  datesConfirmedAt: PlanDatesConfirmedAt,
  isOwner: boolean = false,
): PlanDatesLabel {
  if (planDatesAreConfirmed(datesConfirmedAt)) {
    return { confirmed: true, chip: null, note: null, cta: null };
  }
  return {
    confirmed: false,
    chip: PLAN_DATES_PLACEHOLDER_CHIP,
    note: PLAN_DATES_PLACEHOLDER_NOTE,
    cta: isOwner ? PLAN_DATES_SET_CTA : null,
  };
}
