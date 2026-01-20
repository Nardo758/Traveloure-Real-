import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Layers,
  CalendarDays,
  CalendarRange,
} from "lucide-react";

type FilterMode = "month" | "week" | "day";

interface EventHighlight {
  name: string;
  day: number;
  city?: string;
}

interface MonthSummary {
  month: number;
  monthName: string;
  eventCount: number;
  avgWeather: string;
  avgCrowdLevel: string;
  topRating: string;
  cityCount: number;
  eventDays?: number[];
  highlights?: EventHighlight[];
}

interface CompactYearCalendarProps {
  year: number;
  monthSummaries: MonthSummary[];
  selectedMonth: number;
  selectedWeek?: number;
  selectedDay?: number;
  filterMode: FilterMode;
  onFilterModeChange: (mode: FilterMode) => void;
  onMonthSelect: (month: number) => void;
  onWeekSelect: (month: number, week: number) => void;
  onDaySelect: (month: number, day: number) => void;
}

const monthAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getRatingColor(rating: string) {
  switch (rating) {
    case "best":
    case "excellent":
      return "bg-green-500";
    case "good":
      return "bg-blue-500";
    case "average":
      return "bg-amber-500";
    case "avoid":
    case "poor":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

function getMiniCalendarDays(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay();
  
  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];
  
  for (let i = 0; i < startDay; i++) {
    currentWeek.push(null);
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }
  
  return weeks;
}

function CompactMiniCalendar({ 
  year, 
  month, 
  eventDays = [],
  selectedWeek,
  selectedDay,
  filterMode,
  onWeekClick,
  onDayClick,
}: { 
  year: number; 
  month: number; 
  eventDays?: number[];
  selectedWeek?: number;
  selectedDay?: number;
  filterMode: FilterMode;
  onWeekClick?: (week: number) => void;
  onDayClick?: (day: number) => void;
}) {
  const weeks = getMiniCalendarDays(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const currentDay = today.getDate();
  
  return (
    <div className="mt-1">
      <div className="grid grid-cols-7 gap-px text-[7px] text-muted-foreground mb-0.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>
      <div className="space-y-px">
        {weeks.map((week, weekIdx) => {
          const isSelectedWeek = selectedWeek === weekIdx + 1;
          
          return (
            <div 
              key={weekIdx} 
              className={cn(
                "grid grid-cols-7 gap-px rounded-sm transition-colors",
                filterMode === "week" && "cursor-pointer hover:bg-primary/10",
                isSelectedWeek && "bg-primary/20 ring-1 ring-primary"
              )}
              onClick={(e) => {
                if (filterMode === "week" && onWeekClick) {
                  e.stopPropagation();
                  onWeekClick(weekIdx + 1);
                }
              }}
            >
              {week.map((day, dayIdx) => {
                const hasEvent = day !== null && eventDays.includes(day);
                const isToday = isCurrentMonth && day === currentDay;
                const isSelectedDay = selectedDay === day && day !== null;
                
                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "text-[7px] text-center py-px rounded-sm transition-colors",
                      day === null ? "" : filterMode === "day" ? "cursor-pointer hover:bg-primary/20" : "",
                      isToday && "bg-primary text-primary-foreground font-bold",
                      hasEvent && !isToday && !isSelectedDay && "bg-primary/20",
                      isSelectedDay && "bg-primary text-primary-foreground ring-1 ring-primary"
                    )}
                    onClick={(e) => {
                      if (day !== null && filterMode === "day" && onDayClick) {
                        e.stopPropagation();
                        onDayClick(day);
                      }
                    }}
                  >
                    {day || ""}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekZoomView({
  year,
  month,
  week,
  eventDays = [],
  highlights = [],
  selectedDay,
  onDayClick,
  onBack,
}: {
  year: number;
  month: number;
  week: number;
  eventDays?: number[];
  highlights?: EventHighlight[];
  selectedDay?: number;
  onDayClick: (day: number) => void;
  onBack: () => void;
}) {
  const weeks = getMiniCalendarDays(year, month);
  const weekDays = weeks[week - 1] || [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onBack}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <span className="text-xs font-medium">
          {monthAbbr[month - 1]} Week {week}
        </span>
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, idx) => {
          const hasEvent = day !== null && eventDays.includes(day);
          const isSelected = day === selectedDay;
          const eventForDay = highlights.find(h => h.day === day);
          
          return (
            <div
              key={idx}
              className={cn(
                "flex flex-col items-center p-1 rounded cursor-pointer transition-colors",
                day === null ? "opacity-30" : "hover:bg-muted",
                hasEvent && !isSelected && "bg-primary/10",
                isSelected && "bg-primary text-primary-foreground"
              )}
              onClick={() => day && onDayClick(day)}
            >
              <span className="text-[8px] text-muted-foreground">{dayNames[idx]}</span>
              <span className={cn("text-sm font-medium", isSelected && "text-primary-foreground")}>
                {day || "-"}
              </span>
              {hasEvent && (
                <div className={cn(
                  "w-1 h-1 rounded-full mt-0.5",
                  isSelected ? "bg-primary-foreground" : "bg-primary"
                )} />
              )}
            </div>
          );
        })}
      </div>
      
      {highlights.filter(h => weekDays.includes(h.day)).length > 0 && (
        <div className="space-y-1 pt-1 border-t">
          <span className="text-[9px] text-muted-foreground font-medium">This week:</span>
          {highlights.filter(h => weekDays.includes(h.day)).slice(0, 3).map((h, i) => (
            <div key={i} className="text-[9px] flex gap-1">
              <span className="text-primary font-medium">{h.day}:</span>
              <span className="truncate">{h.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DayZoomView({
  year,
  month,
  day,
  highlights = [],
  onBack,
  onPrevDay,
  onNextDay,
}: {
  year: number;
  month: number;
  day: number;
  highlights?: EventHighlight[];
  onBack: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
}) {
  const date = new Date(year, month - 1, day);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const eventsForDay = highlights.filter(h => h.day === day);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onBack}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <div className="text-center">
          <div className="text-lg font-bold">{day}</div>
          <div className="text-[10px] text-muted-foreground">{dayName}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onPrevDay}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onNextDay}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <div className="text-xs text-center text-muted-foreground">
        {monthAbbr[month - 1]} {day}, {year}
      </div>
      
      {eventsForDay.length > 0 ? (
        <div className="space-y-2">
          <span className="text-[10px] font-medium text-muted-foreground">Events:</span>
          {eventsForDay.map((event, i) => (
            <Card key={i} className="p-2">
              <div className="text-xs font-medium">{event.name}</div>
              {event.city && (
                <div className="text-[10px] text-muted-foreground">{event.city}</div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-xs text-muted-foreground">
          No specific events on this day
        </div>
      )}
    </div>
  );
}

export function CompactYearCalendar({
  year,
  monthSummaries,
  selectedMonth,
  selectedWeek,
  selectedDay,
  filterMode,
  onFilterModeChange,
  onMonthSelect,
  onWeekSelect,
  onDaySelect,
}: CompactYearCalendarProps) {
  const [zoomedMonth, setZoomedMonth] = useState<number | null>(null);
  const currentMonth = new Date().getMonth() + 1;
  
  const currentSummary = monthSummaries.find(s => s.month === (zoomedMonth || selectedMonth));
  
  if (filterMode === "day" && selectedDay && zoomedMonth) {
    return (
      <Card className="p-3" data-testid="compact-calendar-day-view">
        <DayZoomView
          year={year}
          month={zoomedMonth}
          day={selectedDay}
          highlights={currentSummary?.highlights}
          onBack={() => {
            setZoomedMonth(null);
            onFilterModeChange("month");
          }}
          onPrevDay={() => {
            const newDay = selectedDay - 1;
            if (newDay >= 1) {
              onDaySelect(zoomedMonth, newDay);
            }
          }}
          onNextDay={() => {
            const daysInMonth = new Date(year, zoomedMonth, 0).getDate();
            const newDay = selectedDay + 1;
            if (newDay <= daysInMonth) {
              onDaySelect(zoomedMonth, newDay);
            }
          }}
        />
      </Card>
    );
  }
  
  if (filterMode === "week" && selectedWeek && zoomedMonth) {
    return (
      <Card className="p-3" data-testid="compact-calendar-week-view">
        <WeekZoomView
          year={year}
          month={zoomedMonth}
          week={selectedWeek}
          eventDays={currentSummary?.eventDays}
          highlights={currentSummary?.highlights}
          selectedDay={selectedDay}
          onDayClick={(day) => {
            onFilterModeChange("day");
            onDaySelect(zoomedMonth, day);
          }}
          onBack={() => {
            setZoomedMonth(null);
            onFilterModeChange("month");
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="p-3" data-testid="compact-year-calendar">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">{year}</span>
        </div>
        
        <div className="flex gap-0.5">
          <Button
            variant={filterMode === "month" ? "default" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => onFilterModeChange("month")}
            title="Filter by Month"
            data-testid="button-filter-month"
          >
            <Layers className="h-3 w-3" />
          </Button>
          <Button
            variant={filterMode === "week" ? "default" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => onFilterModeChange("week")}
            title="Filter by Week"
            data-testid="button-filter-week"
          >
            <CalendarRange className="h-3 w-3" />
          </Button>
          <Button
            variant={filterMode === "day" ? "default" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => onFilterModeChange("day")}
            title="Filter by Day"
            data-testid="button-filter-day"
          >
            <CalendarDays className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-1.5">
        {monthAbbr.map((name, idx) => {
          const month = idx + 1;
          const summary = monthSummaries.find(s => s.month === month);
          const isCurrentMonth = month === currentMonth;
          const isSelected = month === selectedMonth;
          
          return (
            <div
              key={name}
              className={cn(
                "p-1.5 rounded cursor-pointer transition-all border",
                isSelected 
                  ? "border-primary bg-primary/5 ring-1 ring-primary" 
                  : "border-transparent hover:bg-muted",
                isCurrentMonth && !isSelected && "border-primary/30"
              )}
              onClick={() => {
                onMonthSelect(month);
                if (filterMode !== "month") {
                  setZoomedMonth(month);
                }
              }}
              data-testid={`compact-month-${month}`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={cn(
                  "text-[10px] font-medium",
                  isSelected && "text-primary"
                )}>
                  {name}
                </span>
                {summary && (
                  <div className={cn("w-1.5 h-1.5 rounded-full", getRatingColor(summary.topRating))} />
                )}
              </div>
              
              {summary && (
                <CompactMiniCalendar
                  year={year}
                  month={month}
                  eventDays={summary.eventDays || []}
                  selectedWeek={isSelected ? selectedWeek : undefined}
                  selectedDay={isSelected ? selectedDay : undefined}
                  filterMode={filterMode}
                  onWeekClick={(week) => {
                    setZoomedMonth(month);
                    onWeekSelect(month, week);
                  }}
                  onDayClick={(day) => {
                    setZoomedMonth(month);
                    onDaySelect(month, day);
                  }}
                />
              )}
              
              {summary && summary.highlights && summary.highlights.length > 0 && (
                <div className="mt-1 text-[7px] text-muted-foreground truncate">
                  {summary.highlights[0]?.name}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="flex items-center justify-center gap-2 pt-2 mt-2 border-t text-[8px] text-muted-foreground">
        <div className="flex items-center gap-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span>Best</span>
        </div>
        <div className="flex items-center gap-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>Good</span>
        </div>
        <div className="flex items-center gap-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>Avg</span>
        </div>
      </div>
    </Card>
  );
}
