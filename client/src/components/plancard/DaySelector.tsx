import { useEffect, useRef } from "react";
import { getEnergyProfile, ENERGY_COLORS, type PlanCardDay } from "./plancard-types";
import { todayIso } from "./plancard-temporal";

interface DaySelectorProps {
  tripId: string;
  days: PlanCardDay[];
  selectedDay: number;
  onSelectDay: (i: number) => void;
  showActivityCounts?: boolean;
}

export function DaySelector({ tripId, days, selectedDay, onSelectDay, showActivityCounts }: DaySelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // CLAUDE.md §18 item 1: real date comparison (not the currently-selected index) drives
  // "today's chip highlighted" + "past days dimmed" — independent of which day the
  // traveler happens to be viewing.
  const todayStr = todayIso(new Date());

  useEffect(() => {
    const btn = buttonRefs.current[selectedDay];
    if (btn && scrollRef.current) {
      btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedDay]);

  if (days.length === 0) return null;

  return (
    <div ref={scrollRef} className="flex gap-1 px-4 pt-3 overflow-x-auto" data-testid={`day-selector-${tripId}`}>
      {days.map((d, i) => {
        const energy = getEnergyProfile(d);
        const ec = ENERGY_COLORS[energy];
        const actCount = d.activities?.length || 0;
        const isSelected = selectedDay === i;
        const isToday = d.date === todayStr;
        const isPast = d.date < todayStr;
        return (
          <button
            key={i}
            ref={(el) => { buttonRefs.current[i] = el; }}
            onClick={() => onSelectDay(i)}
            className={`relative px-2.5 sm:px-4 py-2 rounded-t-xl border-b-2 cursor-pointer whitespace-nowrap transition-all text-xs sm:text-sm font-medium flex flex-col items-center gap-0.5 ${
              isSelected
                ? "bg-primary/10 border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            } ${isPast && !isSelected ? "opacity-60" : ""}`}
            data-testid={`button-day-${d.dayNum}-${tripId}`}
            data-is-today={isToday || undefined}
          >
            {isToday && (
              <span
                className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-green-500"
                title="Today"
                data-testid={`dot-today-${d.dayNum}-${tripId}`}
              />
            )}
            <span className="flex items-center gap-1" data-testid={`text-day-num-${d.dayNum}-${tripId}`}>
              D{d.dayNum}
              {showActivityCounts && (
                <span className="text-[9px] bg-muted text-muted-foreground px-1 py-0.5 rounded-full font-semibold" data-testid={`badge-activity-count-${d.dayNum}-${tripId}`}>
                  {actCount}
                </span>
              )}
            </span>
            <span className="hidden sm:block text-[10px] opacity-70" data-testid={`text-day-label-${d.dayNum}-${tripId}`}>{d.label}</span>
            <span className={`text-[9px] px-1 py-0.5 rounded-full font-semibold ${ec.bg} ${ec.fg}`} data-testid={`badge-energy-${d.dayNum}-${tripId}`}>
              {ec.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
