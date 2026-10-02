/**
 * THE SLIP HEADER'S META LINE — "Nov 11 – Nov 15, 2026 · 5 days · 2 travelers · 3 events".
 *
 * Extracted from `SlipView`'s `SlipHeader` (smoke test 4, B5 — ledger
 * `2026-10-02-smoke4-draft-fixes`) so it can be rendered on its own in a test. Production smoke 4
 * read "Nov 11 – Nov 15, 2026 · " with an empty slot where the day count goes: #1210 gave the AI
 * form its span label but never reached this line, which printed the range and nothing after it.
 * The day count now comes from `planDayCountLabel` (`shared/plan-dates.ts`) — the SAME calendar-date
 * rule as `planSpanLabel` (§18 rule 1) — computed from the plan's own start and end dates, so a
 * freshly created plan with no items still has it.
 *
 * Every separator is drawn BETWEEN two segments that are both present, never after the last one.
 * §13 holds on every absence: an unparseable or inverted window prints no range and no day count,
 * an unstated party prints nothing (or the owner's "Who's coming?"), and zero events prints nothing.
 */
import { format } from "date-fns";
import { Users } from "lucide-react";
import { parseTripDate } from "@/lib/calendar-date";
import { eventCountLabel } from "@/lib/plan-vocabulary";
import { planDayCountLabel, type PlanDatesConfirmedAt } from "@shared/plan-dates";
import { SetPlanDates } from "./SetPlanDates";

export interface SlipHeaderMetaProps {
  tripId: string;
  startDate: string | null;
  endDate: string | null;
  datesConfirmed: PlanDatesConfirmedAt;
  isOwner: boolean;
  /** `""` when the plan states no party — the segment is then OMITTED (§13). */
  partyLabel: string;
  /** RC-12: set only for the OWNER of a plan with no stated party. */
  onAskParty?: () => void;
  eventCount: number;
}

export function SlipHeaderMeta({
  tripId,
  startDate,
  endDate,
  datesConfirmed,
  isOwner,
  partyLabel,
  onAskParty,
  eventCount,
}: SlipHeaderMetaProps) {
  const start = parseTripDate(startDate);
  const end = parseTripDate(endDate);
  const hasRange = Boolean(start && end);
  const dayCount = hasRange ? planDayCountLabel(startDate, endDate) : null;
  // Whether anything has been printed yet — the next segment takes a " · " only after one.
  let printed = hasRange;
  const sep = () => {
    const s = printed ? " · " : null;
    printed = true;
    return s;
  };

  return (
    <p className="text-sm text-muted-foreground" data-testid="slip-meta">
      {hasRange ? (
        <span data-testid="slip-meta-dates">{`${format(start!, "MMM d")} – ${format(end!, "MMM d, yyyy")}`}</span>
      ) : null}
      {dayCount ? (
        <>
          {sep()}
          <span data-testid="slip-meta-days">{dayCount}</span>
        </>
      ) : null}
      {/* ── DID ANYBODY CHOOSE THIS WINDOW? (punchlist D-22 + R-4, migration 302, ledger
          `2026-09-15-d22-dates-confirmed`.) Renders NOTHING for a confirmed plan (§13: the
          unmarked case stays quiet), and its CTA is the OWNER's alone (Locked Decision 42 D16). */}
      <SetPlanDates
        tripId={tripId}
        startDate={startDate}
        endDate={endDate}
        datesConfirmedAt={datesConfirmed}
        isOwner={isOwner}
        leadingSpace={hasRange}
      />
      {partyLabel ? (
        <>
          {sep()}
          <span className="inline-flex items-center gap-1" data-testid="slip-meta-party">
            <Users className="w-3.5 h-3.5 inline" />
            {partyLabel}
          </span>
        </>
      ) : null}
      {/* RC-12: nobody has said who is going, so the owner is ASKED rather than shown an invented
          "1 traveler" (§13). */}
      {onAskParty ? (
        <>
          {sep()}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={onAskParty}
            data-testid="slip-meta-ask-party"
          >
            <Users className="w-3.5 h-3.5 inline" />
            Who's coming?
          </button>
        </>
      ) : null}
      {/* THE EVENT COUNT (re-audit A16) — `eventCountLabel`, hidden at zero (§13). */}
      {eventCount > 0 ? (
        <span data-testid="slip-meta-events">
          {sep()}
          {eventCountLabel(eventCount)}
        </span>
      ) : null}
    </p>
  );
}
