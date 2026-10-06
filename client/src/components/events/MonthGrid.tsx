/**
 * MonthGrid.tsx — one month of the /events calendar, Monday weeks (ledger
 * `2026-10-06-events-calendar`; boards `Main`, `Mobile`). Marks come from `dayMarks`, the same
 * range test "What's on" lists with, so a marked day always has a row behind it.
 *
 * Marks: one event (light wash), two or more (strong wash), a long run (underline, not a count),
 * today (filled), the selected day or week (an outline). Colours are tokens only.
 */
import { dayMarks, mondayColumn, monthFirst, addDays, formatDayShort, type CalendarEvent, type PeriodKind } from "@shared/events-calendar";

const WASH_ONE = "color-mix(in srgb, var(--earn-teal) 16%, transparent)";
const WASH_MANY = "color-mix(in srgb, var(--earn-teal) 50%, transparent)";
const OUTLINE = "var(--earn-coral-ink)";

export const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function MonthGrid({
  ym,
  events,
  mode,
  selectedDay,
  selectedWeek,
  today,
  onPickDay,
  testIdPrefix,
}: {
  ym: string;
  events: readonly CalendarEvent[];
  mode: PeriodKind;
  selectedDay: string | null;
  selectedWeek: string | null;
  today: string;
  onPickDay: (date: string) => void;
  testIdPrefix: string;
}) {
  const marks = dayMarks(events, ym);
  const lead = mondayColumn(monthFirst(ym));
  const weekEnd = selectedWeek ? addDays(selectedWeek, 6) : null;
  return (
    <div>
      <div aria-hidden="true" className="grid grid-cols-7 text-center text-[10px]" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-[3px]">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden="true" />
        ))}
        {marks.map((mk) => {
          const isToday = mk.date === today;
          const total = mk.count + (mk.longRun ? 1 : 0);
          const picked = mode === "day" && selectedDay === mk.date;
          const inWeek = mode === "week" && selectedWeek !== null && weekEnd !== null && mk.date >= selectedWeek && mk.date <= weekEnd;
          const shadows: string[] = [];
          if (mk.longRun && !isToday) shadows.push("inset 0 -2px 0 0 var(--earn-teal)");
          if (picked || inWeek) shadows.push(`inset 0 0 0 2px ${OUTLINE}`);
          return (
            <button
              key={mk.date}
              type="button"
              onClick={() => onPickDay(mk.date)}
              aria-label={`${formatDayShort(mk.date)} ${ym.slice(0, 4)}${total ? `, ${total} ${total === 1 ? "event" : "events"}` : ""}`}
              aria-pressed={picked || inWeek}
              className="mx-auto flex h-[30px] w-full max-w-[40px] items-center justify-center rounded-[6px] text-[12px]"
              style={{
                background: isToday ? "var(--earn-navy)" : mk.count === 0 ? "transparent" : mk.count === 1 ? WASH_ONE : WASH_MANY,
                color: isToday ? "var(--earn-card)" : "var(--earn-ink)",
                fontWeight: mk.count > 1 ? 700 : total > 0 || isToday ? 600 : 400,
                boxShadow: shadows.length ? shadows.join(", ") : undefined,
              }}
              data-testid={`${testIdPrefix}-${mk.date}`}
              data-marks={mk.count}
              data-long-run={mk.longRun ? "true" : undefined}
            >
              {Number(mk.date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

