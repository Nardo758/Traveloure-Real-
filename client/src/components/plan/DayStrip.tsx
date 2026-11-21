/**
 * THE PHONE'S DAY STRIP (A2; Leon, Nov 20, 2026; board R3_MovePhone, minus Ideas) - one chip per day, the
 * shown day filled, and the hint under it. Presentational; `lib/day-strip.ts` decides which day is shown.
 */
import { MOVE_STOP_COPY } from "@/lib/move-stop";
import { stripDayAria, stripDayLabel, type StripDay } from "@/lib/day-strip";

export function DayStrip({ days, selectedKey, onSelect }: { days: readonly StripDay[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  return (
    <div data-testid="slip-day-strip">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {days.map((d) => {
          const on = d.key === selectedKey;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={stripDayAria(d)}
              onClick={() => onSelect(d.key)}
              className={`flex min-h-[48px] min-w-[76px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-1 text-sm font-semibold ${
                on
                  ? "border-[color:var(--slip-ink)] bg-[color:var(--slip-ink)] text-white"
                  : "border-[color:var(--slip-line)] bg-[color:var(--slip-card)] text-[color:var(--slip-ink)]"
              }`}
              data-testid={`slip-day-chip-${d.dayNum ?? d.key}`}
            >
              <span>{stripDayLabel(d)}</span>
              <span className="text-xs font-medium opacity-80">{d.stops}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-[color:var(--slip-muted)]" data-testid="slip-day-strip-hint">
        {MOVE_STOP_COPY.stripTapHint}
      </p>
    </div>
  );
}
