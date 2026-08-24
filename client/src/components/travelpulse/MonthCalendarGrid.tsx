import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Ticket,
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  MapPin,
} from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  eventType: string | null;
  city?: string | null;
  country: string;
  specificDate?: string | null;
  startMonth?: number | null;
  endMonth?: number | null;
}

interface SeasonInfo {
  city: string;
  country: string;
  rating: string;
  weatherDescription?: string | null;
  crowdLevel?: string | null;
  priceLevel?: string | null;
}

interface MonthCalendarGridProps {
  year: number;
  month: number;
  monthName: string;
  events: CalendarEvent[];
  seasonInfo: SeasonInfo[];
  onDateClick: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onBack: () => void;
  selectedDate?: Date | null;
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function getEventsForDate(events: CalendarEvent[], year: number, month: number, day: number): CalendarEvent[] {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  return events.filter(event => {
    if (event.specificDate) {
      return event.specificDate === dateStr;
    }
    if (event.startMonth && event.endMonth) {
      return month >= event.startMonth && month <= event.endMonth;
    }
    if (event.startMonth) {
      return month === event.startMonth;
    }
    return false;
  });
}

function getEventTypeColor(type: string | null) {
  switch (type?.toLowerCase()) {
    case "festival":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "holiday":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "cultural":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "sporting":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "weather":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

export function MonthCalendarGrid({
  year,
  month,
  monthName,
  events,
  seasonInfo,
  onDateClick,
  onPrevMonth,
  onNextMonth,
  onBack,
  selectedDate,
}: MonthCalendarGridProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  while (weeks[weeks.length - 1]?.length < 7) {
    weeks[weeks.length - 1].push(null);
  }

  const getSeasonSummary = () => {
    if (seasonInfo.length === 0) return null;
    const ratings = seasonInfo.map(s => s.rating);
    const bestCount = ratings.filter(r => r === "best").length;
    const goodCount = ratings.filter(r => r === "good").length;
    if (bestCount > goodCount) return "Best time for many destinations";
    if (goodCount > 0) return "Good travel conditions";
    return "Mixed conditions";
  };

  return (
    <div className="space-y-4" data-testid="month-calendar-grid">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            data-testid="button-back-month"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{monthName} {year}</h2>
            <p className="text-sm text-muted-foreground">
              {getSeasonSummary() || "Click a date to see destinations"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onPrevMonth}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onNextMonth}
            data-testid="button-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="min-h-11" />;
            }

            const dayEvents = getEventsForDate(events, year, month, day);
            const isToday = isCurrentMonth && day === today.getDate();
            const isSelected = selectedDate && 
              selectedDate.getDate() === day && 
              selectedDate.getMonth() + 1 === month &&
              selectedDate.getFullYear() === year;
            const hasEvents = dayEvents.length > 0;

            return (
              <div 
                key={`day-${day}`}
                className="relative flex items-center justify-center"
              >
                <Button
                  variant={isSelected ? "default" : "ghost"}
                  size="xl"
                  onClick={() => onDateClick(new Date(year, month - 1, day))}
                  className={isToday ? "ring-2 ring-primary font-bold" : ""}
                  data-testid={`date-cell-${day}`}
                >
                  {day}
                </Button>
                {hasEvents && (
                  <span className="absolute top-0 right-0 flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-primary text-primary-foreground rounded-full pointer-events-none">
                    {dayEvents.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {events.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Ticket className="h-4 w-4 text-muted-foreground" />
            Events this month ({events.length})
          </h3>
          <ScrollArea className="max-h-48">
            <div className="space-y-2">
              {events.slice(0, 8).map(event => (
                <div 
                  key={event.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                  data-testid={`event-item-${event.id}`}
                >
                  <Badge variant="secondary" className={`text-xs ${getEventTypeColor(event.eventType)}`}>
                    {event.eventType || "Event"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {event.city ? `${event.city}, ` : ""}{event.country}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
