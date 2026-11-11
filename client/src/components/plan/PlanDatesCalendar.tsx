/**
 * Cut-list #1, slice B — THE ONE RANGE CALENDAR.
 *
 * Every place a traveler picks a plan's dates draws this: the header chip's "Add dates", the slip's
 * dates panel (`InlineDatesPanel`, which every dates gate already opens) and PlanEntry's two date
 * steps. The two-field date inputs those surfaces carried are gone; there is no second picker.
 *
 *   value / onChange   the selection, as `YYYY-MM-DD` days (controlled)
 *   min / max          days outside are disabled (PlanEntry's "Next month" scope)
 *   onSave / saving    renders the existing "Save dates" button; omitted ⇒ no button (PlanEntry)
 *   onSkip             renders "Skip for now" — only slice C's first-add caller passes it
 *
 * Same-day trips are allowed: tap a day, then the same day again. The one refusal is a leave day
 * before the arrive day, said in words (`LEAVE_BEFORE_ARRIVE_MESSAGE`), never silently repaired.
 *
 * Copy: "When are you going?", "Add dates", "Leave date must be after your arrive date." —
 * Wording approved — Leon (Nov 10, 11:27 AM ET). "Skip for now" — Wording approved — Leon
 * (Nov 10, 11:44 AM ET). "Save dates" / "Saving…" are the panel's existing strings.
 *
 * 375px budget: seven 36px day cells + the calendar's 12px padding each side = 276px, inside the
 * 343px a phone gives after its 16px gutters. One month is shown at every width.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  LEAVE_BEFORE_ARRIVE_MESSAGE,
  dayNumber,
  dayFromNumber,
  nextRange,
  rangeSummary,
  validateRange,
  type DayRange,
} from "@/lib/plan-dates-range";

export const PLAN_DATES_CALENDAR_TITLE = "When are you going?";
export const PLAN_DATES_EMPTY_LABEL = "Add dates";
export const PLAN_DATES_SKIP_LABEL = "Skip for now";
const SAVE_LABEL = "Save dates";
const SAVING_LABEL = "Saving…";

/** A `YYYY-MM-DD` day as a local-midnight Date for the picker (it renders local calendar days). */
function toLocalDate(day: string | null | undefined): Date | undefined {
  const n = dayNumber(day);
  if (n == null) return undefined;
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The picker's local Date back to a `YYYY-MM-DD` day (read in local time, never shifted to UTC). */
function fromLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface PlanDatesCalendarProps {
  value: DayRange;
  onChange: (next: DayRange) => void;
  min?: string | null;
  max?: string | null;
  onSave?: (range: { startDate: string; endDate: string }) => void;
  saving?: boolean;
  onSkip?: () => void;
  /** Extra controls after Save / Skip (the panel's existing "Not now"). */
  trailing?: ReactNode;
  testId?: string;
}

export function PlanDatesCalendar({
  value,
  onChange,
  min,
  max,
  onSave,
  saving = false,
  onSkip,
  trailing,
  testId = "plan-dates-calendar",
}: PlanDatesCalendarProps) {
  const validity = validateRange(value.start, value.end);
  const summary = rangeSummary(value);
  const from = toLocalDate(value.start);
  const to = toLocalDate(value.end);
  const [month, setMonth] = useState<Date>(() => from ?? toLocalDate(min) ?? new Date());

  const disabled = useMemo(() => {
    const rules: Array<{ before: Date } | { after: Date }> = [];
    const lo = toLocalDate(min);
    const hi = toLocalDate(max);
    if (lo) rules.push({ before: lo });
    if (hi) rules.push({ after: hi });
    return rules;
  }, [min, max]);

  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-sm font-semibold" data-testid={`${testId}-title`}>
        {PLAN_DATES_CALENDAR_TITLE}
      </p>
      <p className="text-sm" data-testid={`${testId}-summary`} style={{ color: summary ? undefined : "var(--earn-muted, #7A7A72)" }}>
        {summary ?? PLAN_DATES_EMPTY_LABEL}
      </p>
      <Calendar
        mode="range"
        numberOfMonths={1}
        month={month}
        onMonthChange={setMonth}
        selected={from ? { from, to } : undefined}
        // The selection is ours (`nextRange`): the picker only reports which day was tapped.
        onSelect={() => {}}
        onDayClick={(day, modifiers) => {
          if (modifiers.disabled) return;
          onChange(nextRange(value, fromLocalDate(day)));
        }}
        disabled={disabled}
        fromDate={toLocalDate(min)}
        toDate={toLocalDate(max)}
        className="rounded-md border w-fit"
        data-testid={`${testId}-grid`}
      />
      {validity === "leave_before_arrive" ? (
        <p role="alert" className="text-xs text-destructive" data-testid={`${testId}-error`}>
          {LEAVE_BEFORE_ARRIVE_MESSAGE}
        </p>
      ) : null}
      {onSave || onSkip || trailing ? (
        <div className="flex flex-wrap gap-2">
          {onSave ? (
            <Button
              type="button"
              size="sm"
              disabled={validity !== "ok" || saving}
              onClick={() => {
                if (validity === "ok" && value.start && value.end) onSave({ startDate: value.start, endDate: value.end });
              }}
              data-testid="button-slip-dates-save"
            >
              {saving ? SAVING_LABEL : SAVE_LABEL}
            </Button>
          ) : null}
          {onSkip ? (
            <Button type="button" size="sm" variant="ghost" onClick={onSkip} data-testid={`${testId}-skip`}>
              {PLAN_DATES_SKIP_LABEL}
            </Button>
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

/** Test seam: the day the calendar renders for a stored day, and back (both local, never UTC-shifted). */
export const __calendarDays = { toLocalDate, fromLocalDate, dayFromNumber };
