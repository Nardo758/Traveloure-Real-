import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  Users,
  Ticket,
  TrendingUp,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonthSummary {
  month: number;
  monthName: string;
  eventCount: number;
  avgWeather: string;
  avgCrowdLevel: string;
  topRating: string;
  cityCount: number;
  eventDays?: number[];
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

function MiniCalendar({ 
  year, 
  month, 
  eventDays = [],
  onDayClick 
}: { 
  year: number; 
  month: number; 
  eventDays?: number[];
  onDayClick?: (day: number) => void;
}) {
  const weeks = getMiniCalendarDays(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const currentDay = today.getDate();
  
  return (
    <div className="mt-2">
      <div className="grid grid-cols-7 gap-0.5 text-[9px] text-muted-foreground mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center font-medium">{d}</div>
        ))}
      </div>
      <div className="space-y-0.5">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-7 gap-0.5">
            {week.map((day, dayIdx) => {
              const hasEvent = day !== null && eventDays.includes(day);
              const isToday = isCurrentMonth && day === currentDay;
              
              return (
                <div
                  key={dayIdx}
                  className={`
                    text-[9px] text-center py-0.5 rounded-sm
                    ${day === null ? "" : "cursor-pointer hover:bg-muted"}
                    ${isToday ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${hasEvent && !isToday ? "bg-primary/20 font-medium" : ""}
                  `}
                  onClick={(e) => {
                    if (day !== null && onDayClick) {
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
        ))}
      </div>
    </div>
  );
}

interface YearOverviewCalendarProps {
  year: number;
  monthSummaries: MonthSummary[];
  onMonthClick: (month: number) => void;
  onBack?: () => void;
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getWeatherIcon(weather: string) {
  const lower = weather.toLowerCase();
  if (lower.includes("snow") || lower.includes("cold")) return <Snowflake className="h-4 w-4 text-blue-400" />;
  if (lower.includes("rain") || lower.includes("monsoon") || lower.includes("wet")) return <CloudRain className="h-4 w-4 text-blue-500" />;
  if (lower.includes("cloud") || lower.includes("overcast")) return <Cloud className="h-4 w-4 text-gray-400" />;
  return <Sun className="h-4 w-4 text-yellow-500" />;
}

function getCrowdIcon(level: string) {
  const lower = level.toLowerCase();
  if (lower.includes("high") || lower.includes("peak")) {
    return <Users className="h-3.5 w-3.5 text-red-500" />;
  }
  if (lower.includes("moderate") || lower.includes("medium")) {
    return <Users className="h-3.5 w-3.5 text-amber-500" />;
  }
  return <Users className="h-3.5 w-3.5 text-green-500" />;
}

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

export function YearOverviewCalendar({ 
  year, 
  monthSummaries, 
  onMonthClick,
  onBack 
}: YearOverviewCalendarProps) {
  const currentMonth = new Date().getMonth();

  return (
    <div className="space-y-4" data-testid="year-overview-calendar">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onBack}
              data-testid="button-back-year"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-bold">{year} Travel Calendar</h2>
            <p className="text-sm text-muted-foreground">
              Click any month to see the best destinations and events
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {months.map((monthName, idx) => {
          const summary = monthSummaries.find(s => s.month === idx + 1);
          const isCurrentMonthCard = idx === currentMonth;
          
          return (
            <Card
              key={monthName}
              className={`p-4 cursor-pointer hover-elevate transition-all ${
                isCurrentMonthCard ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => onMonthClick(idx + 1)}
              data-testid={`month-card-${idx + 1}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{monthName}</span>
                {summary && (
                  <div className={`w-2.5 h-2.5 rounded-full ${getRatingColor(summary.topRating)}`} />
                )}
              </div>
              
              {summary ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {getWeatherIcon(summary.avgWeather)}
                      <span className="truncate">{summary.avgWeather || "Varied"}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {getCrowdIcon(summary.avgCrowdLevel)}
                      <span>{summary.avgCrowdLevel || "Normal"}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {summary.eventCount > 0 && (
                      <div className="flex items-center gap-1 text-primary">
                        <Ticket className="h-3 w-3" />
                        <span className="font-medium">
                          {summary.eventCount} event{summary.eventCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span>{summary.cityCount} destinations</span>
                    </div>
                  </div>
                  
                  <MiniCalendar 
                    year={year} 
                    month={idx + 1}
                    eventDays={summary.eventDays || []}
                    onDayClick={(day) => {
                      onMonthClick(idx + 1);
                    }}
                  />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Loading...
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span>Best time</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span>Good time</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>Average</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span>Off season</span>
        </div>
      </div>
    </div>
  );
}
