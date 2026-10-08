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
import { planDatesAreConfirmed, planDayCountLabel, type PlanDatesConfirmedAt } from "@shared/plan-dates";
import { slipZoneAbbrev } from "@/lib/slip-meta";
import { SetPlanDates } from "./SetPlanDates";

/** The Empty board's subline when nobody has chosen the plan's dates (canvas note s12). */
export const SLIP_DATES_NOT_SET = "Dates not set yet";

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
  /**
   * `trips.timezone`, read only by the placeholder-dates subline ("Dates not set yet · JST", slip
   * conformance ruling 3). NULL means not captured: no zone is printed (LD 30).
   */
  timezone?: string | null;
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
  timezone = null,
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

  /**
   * PLACEHOLDER DATES — the Empty board (slip conformance, ledger
   * `2026-10-08-conformance-slip-phase0`; canvas note s12). A plan whose window nobody chose says
   * so in words, "Dates not set yet", and does not print the filled-in range, which would read as
   * a choice (LD 30, as amended). The owner gets the two chips under it. Both are the existing
   * doors: the ONE dates dialog and the ONE plan modal's party step. A non-owner gets the sentence
   * only (D16).
   */
  const datesUnset = !planDatesAreConfirmed(datesConfirmed);
  const askParty = onAskParty ? (
    <button
      type="button"
      className={
        datesUnset
          ? "inline-flex h-[34px] items-center rounded-[var(--slip-radius-chip)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-3 text-[13px] font-medium text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-ground)]"
          : "inline-flex items-center gap-1 text-primary hover:underline"
      }
      onClick={onAskParty}
      data-testid="slip-meta-ask-party"
    >
      {datesUnset ? null : <Users className="w-3.5 h-3.5 inline" />}
      Who's coming?
    </button>
  ) : null;

  if (datesUnset) {
    const zone = slipZoneAbbrev(timezone);
    return (
      <div className="space-y-2">
        <p className="text-[15px] font-medium text-[color:var(--slip-navy)]" data-testid="slip-meta">
          <span data-testid="slip-meta-dates-unset">{SLIP_DATES_NOT_SET}</span>
          {partyLabel ? (
            <>
              {" · "}
              <span data-testid="slip-meta-party">{partyLabel}</span>
            </>
          ) : null}
          {eventCount > 0 ? (
            <span data-testid="slip-meta-events">
              {" · "}
              {eventCountLabel(eventCount)}
            </span>
          ) : null}
          {zone ? (
            <>
              {" · "}
              <span data-testid="slip-meta-zone">{zone}</span>
            </>
          ) : null}
        </p>
        {isOwner ? (
          <div className="flex flex-wrap gap-2" data-testid="slip-meta-chips">
            <SetPlanDates
              tripId={tripId}
              startDate={startDate}
              endDate={endDate}
              datesConfirmedAt={datesConfirmed}
              isOwner={isOwner}
            />
            {askParty}
          </div>
        ) : null}
      </div>
    );
  }

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
      {askParty ? (
        <>
          {sep()}
          {askParty}
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
