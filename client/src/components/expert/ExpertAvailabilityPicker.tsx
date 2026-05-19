import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, AlertCircle } from "lucide-react";
import { format, addDays, isWithinInterval, parseISO, startOfDay, isBefore } from "date-fns";

interface ScheduleEntry {
  id: string;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
  isAvailable: boolean;
  preferredSlots: {
    label: string;
    startTime: string;
    endTime: string;
    isPreferred: boolean;
    reason: string;
  }[];
}

interface BlackoutDate {
  id: string;
  startDate: string; // "2026-05-20"
  endDate: string;
  reason: string | null;
}

interface ExpertAvailabilityPickerProps {
  expertId: string;
  onSlotSelect: (date: Date, timeSlot: string) => void;
}

// Generate 30-min slots between startTime and endTime ("09:00" → "17:00")
function generateSlots(startTime: string, endTime: string): string[] {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const slots: string[] = [];
  let h = startH;
  let m = startM;
  while (h < endH || (h === endH && m < endM)) {
    const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    slots.push(label);
    m += 30;
    if (m >= 60) { m -= 60; h++; }
  }
  return slots;
}

function formatSlotLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, "0")} ${ampm}`;
}

function isDateBlackedOut(date: Date, blackoutDates: BlackoutDate[]): boolean {
  const d = startOfDay(date);
  return blackoutDates.some((b) => {
    const start = startOfDay(parseISO(b.startDate));
    const end = startOfDay(parseISO(b.endDate));
    return isWithinInterval(d, { start, end });
  });
}

function getScheduleForDay(date: Date, schedule: ScheduleEntry[]): ScheduleEntry | null {
  const dow = date.getDay(); // 0 = Sunday
  return schedule.find((s) => s.dayOfWeek === dow && s.isAvailable) ?? null;
}

export function ExpertAvailabilityPicker({ expertId, onSlotSelect }: ExpertAvailabilityPickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ schedule: ScheduleEntry[]; blackoutDates: BlackoutDate[] }>({
    queryKey: ["/api/experts", expertId, "availability"],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertId}/availability`);
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
    enabled: !!expertId,
  });

  const schedule = data?.schedule ?? [];
  const blackoutDates = data?.blackoutDates ?? [];
  const hasAnySchedule = schedule.length > 0;

  const today = startOfDay(new Date());
  const maxDate = addDays(today, 60);

  // Build sets of available / unavailable dates for the next 60 days
  const { availableDates, unavailableDates } = useMemo(() => {
    const available: Date[] = [];
    const unavailable: Date[] = [];
    for (let i = 0; i <= 60; i++) {
      const d = addDays(today, i);
      if (isBefore(d, today)) continue;
      const hasSchedule = getScheduleForDay(d, schedule) !== null;
      const blacked = isDateBlackedOut(d, blackoutDates);
      if (hasSchedule && !blacked) {
        available.push(d);
      } else {
        unavailable.push(d);
      }
    }
    return { availableDates: available, unavailableDates: unavailable };
  }, [schedule, blackoutDates]);

  const slotsForSelectedDate = useMemo((): string[] => {
    if (!selectedDate) return [];
    const entry = getScheduleForDay(selectedDate, schedule);
    if (!entry) return [];
    if (entry.preferredSlots && entry.preferredSlots.length > 0) {
      return entry.preferredSlots.map((s) => s.startTime);
    }
    return generateSlots(entry.startTime, entry.endTime);
  }, [selectedDate, schedule]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleSlotClick = (slot: string) => {
    setSelectedSlot(slot);
    if (selectedDate) onSlotSelect(selectedDate, slot);
  };

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="availability-loading">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!hasAnySchedule) {
    return (
      <div
        className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center space-y-2"
        data-testid="availability-empty"
      >
        <AlertCircle className="w-6 h-6 mx-auto text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">No availability set</p>
        <p className="text-xs text-muted-foreground/70">
          This expert hasn't configured their schedule yet. Contact them directly to arrange a time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="availability-picker">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Choose a date</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-700 inline-block" />
          Unavailable
        </span>
      </div>

      {/* Calendar */}
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleDateSelect}
        fromDate={today}
        toDate={maxDate}
        disabled={(date) => {
          if (isBefore(startOfDay(date), today)) return true;
          const entry = getScheduleForDay(date, schedule);
          if (!entry) return true;
          if (isDateBlackedOut(date, blackoutDates)) return true;
          return false;
        }}
        modifiers={{
          available: availableDates,
          unavailable: unavailableDates,
        }}
        modifiersClassNames={{
          available: "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 font-semibold hover:bg-green-100 dark:hover:bg-green-900/50",
          unavailable: "text-muted-foreground/40 line-through",
        }}
        className="rounded-md border w-full"
        data-testid="calendar-availability"
      />

      {/* Time Slots */}
      {selectedDate && (
        <div className="space-y-2" data-testid="time-slots-container">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {format(selectedDate, "EEEE, MMM d")} — pick a time
            </span>
          </div>

          {slotsForSelectedDate.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slots available for this day.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2" data-testid="slot-grid">
              {slotsForSelectedDate.map((slot) => (
                <Button
                  key={slot}
                  size="sm"
                  variant={selectedSlot === slot ? "default" : "outline"}
                  className={
                    selectedSlot === slot
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:border-primary hover:text-primary"
                  }
                  onClick={() => handleSlotClick(slot)}
                  data-testid={`slot-${slot}`}
                >
                  {formatSlotLabel(slot)}
                </Button>
              ))}
            </div>
          )}

          {selectedSlot && (
            <div
              className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-800 dark:text-green-200 flex items-center gap-2"
              data-testid="selected-slot-summary"
            >
              <CalendarDays className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{format(selectedDate, "MMM d, yyyy")}</strong> at{" "}
                <strong>{formatSlotLabel(selectedSlot)}</strong> selected
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
