/**
 * BOOKING AUTO-COMPLETION JOB — D8 timers (docs/DECISIONS.md ruling 63, executed by ruling 66).
 *
 * The job DETECTS; it does not decide and it does not implement completion. Every flip is driven
 * through the SHARED `completeBooking` in `booking-completion.service.ts` — the same function the
 * owner rail calls — with an actor tag so the diary and the booking row record which signal fired
 * (`auto_complete_pdf` / `auto_complete_property`). It contains NO method list of its own: which
 * rule a booking falls under comes from `completionRuleFor` in `shared/service-fundamentals.ts`.
 *
 * §15: re-running is a NO-OP. The completion flip is an atomic conditional
 * (`… WHERE id = ? AND status IN ('confirmed')`), so a second pass — or a pass racing the owner
 * rail, or two overlapping passes — produces exactly one flip, one earning set and one diary row.
 * There is no compensating rollback: a lost race simply changes nothing.
 *
 * §13: a candidate that lacks the data to decide is SKIPPED WITH ITS REASON, never guessed. The
 * reasons are counted and logged every run, so "nothing completed today" is distinguishable from
 * "everything is being skipped for want of a delivery timestamp".
 *
 * OBSERVABILITY (build charter §2, stated deliberately): there is NO runs table. Each flip is
 * durably recorded twice by the shared function (booking row + diary row), and each RUN emits one
 * structured log line including a run on which nothing happened — so a scheduler that has been
 * dead since the last deploy is visible as an absence of lines, not confused with a quiet day.
 * A runs table was considered and rejected as heavier than the fact it would record; if run-level
 * durability is ever needed, `reconciliation_runs` (§17 rule 2) is the precedent to copy.
 */
import { logger } from "../infrastructure/logger";
import {
  completeBooking,
  findAutoCompleteCandidates,
  resolveCompletionEligibility,
  timerActorFor,
} from "../services/booking-completion.service";

export interface AutoCompletionRunResult {
  ranAt: string;
  scanned: number;
  completed: number;
  /** reason → count. Every candidate the pass did NOT complete is accounted for here. */
  skipped: Record<string, number>;
  completedBookingIds: string[];
  error?: string;
}

export async function runBookingAutoCompletion(now: Date = new Date()): Promise<AutoCompletionRunResult> {
  const result: AutoCompletionRunResult = {
    ranAt: now.toISOString(),
    scanned: 0,
    completed: 0,
    skipped: {},
    completedBookingIds: [],
  };
  const bump = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  try {
    const candidates = await findAutoCompleteCandidates(now);
    result.scanned = candidates.length;

    for (const bookingId of candidates) {
      let eligibility;
      try {
        eligibility = await resolveCompletionEligibility(bookingId, now);
      } catch (err) {
        logger.error({ err, bookingId }, "[auto-complete] eligibility resolution failed — booking left untouched");
        bump("eligibility_error");
        continue;
      }
      if (!eligibility.rule) {
        bump(eligibility.reason ?? "unclassifiable_service");
        continue;
      }
      const actor = timerActorFor(eligibility.rule);
      if (!actor) {
        // A rule no timer may fire (in_person/hybrid stay traveler-driven; session_end, async and
        // bundles are owner-declared). The SQL pre-filter should not surface these, but the
        // authority is the shared predicate, never the query.
        bump("rule_not_timer_driven");
        continue;
      }
      if (!eligibility.eligible) {
        bump(eligibility.reason ?? "window_open");
        continue;
      }

      try {
        const outcome = await completeBooking({
          bookingId,
          actor,
          now,
          reason: `d8_auto_complete:${eligibility.rule}`,
        });
        if (outcome.completed) {
          result.completed += 1;
          result.completedBookingIds.push(bookingId);
        } else {
          bump(outcome.reason ?? "not_completed");
        }
      } catch (err) {
        // One bad booking must never abort the pass — the next run retries it, and the atomic
        // conditional makes that retry safe.
        logger.error({ err, bookingId }, "[auto-complete] completion failed — booking left untouched");
        bump("completion_error");
      }
    }
  } catch (err: any) {
    result.error = err?.message || String(err);
    logger.error({ err }, "[auto-complete] pass failed");
  }

  // ONE line per pass, including a pass that did nothing (§17 rule 2's spirit: silence must be
  // distinguishable from the job not having run).
  logger.info(
    {
      scanned: result.scanned,
      completed: result.completed,
      skipped: result.skipped,
      ...(result.error ? { error: result.error } : {}),
    },
    "[auto-complete] D8 booking auto-completion pass",
  );
  return result;
}
