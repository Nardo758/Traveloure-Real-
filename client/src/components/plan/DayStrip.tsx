/**
 * THE PHONE'S DAY STRIP (A2; Leon, Nov 20, 2026; board R3_MovePhone, minus Ideas) - one chip per day, the
 * shown day filled, and the hint under it. Presentational; `lib/day-strip.ts` decides which day is shown.
 */
import { MOVE_STOP_COPY } from "@/lib/move-stop";
import { stripDayAria, stripDayLabel, type StripDay } from "@/lib/day-strip";
import { useStopDrag } from "@/components/plan/StopDrag";

export function DayStrip({ days, selectedKey, onSelect }: { days: readonly StripDay[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  // Hold-to-drag (Leon, Nov 21, 2026): with it on, each chip is a place to drop a held stop, the strip stays
  // in reach while one is held (the list may have scrolled it away), and the hint says so. Off - a visitor,
  // an advisor - the strip is tap-only and says only that.
  const drag = useStopDrag();
  const holding = !!drag?.dragging;
  // Ringed only where the drop would do something: not the stop's own day, not another day for a booked stop.
  const over = holding && drag?.plan && drag.target?.byTime ? drag.target.dayNumber : null;
  return (
    <div className={holding ? "sticky top-2 z-30 rounded-xl bg-white/95 p-1 shadow-md" : undefined} data-testid="slip-day-strip">
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
              data-drop-day={drag && d.dayNum != null ? d.dayNum : undefined}
              // The mouse's way onto a chip (a narrow desktop window); the finger's is the attribute above.
              onDragOver={(e) => {
                if (!drag?.dragging || d.dayNum == null) return;
                e.preventDefault();
                drag.over({ dayNumber: d.dayNum, afterId: null, byTime: true });
              }}
              onDrop={(e) => {
                if (!drag?.dragging) return;
                e.preventDefault();
                drag.drop();
              }}
              data-drop-over={over != null && over === d.dayNum ? "true" : undefined}
              className={`flex min-h-[48px] min-w-[76px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-1 text-sm font-semibold ${
                over != null && over === d.dayNum ? "ring-2 ring-[color:var(--slip-navy)] ring-offset-2 " : ""
              }${
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
        {drag ? MOVE_STOP_COPY.stripHint : MOVE_STOP_COPY.stripTapHint}
      </p>
    </div>
  );
}
