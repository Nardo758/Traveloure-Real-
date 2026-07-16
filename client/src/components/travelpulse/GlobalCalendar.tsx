import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Calendar,
  MapPin,
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Sparkles,
  Heart,
  Compass,
  BookOpen,
  Waves,
  Mountain,
  Utensils,
  Plane,
  Grid3X3,
  CalendarDays,
  Eye,
  EyeOff,
  Info,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { YearOverviewCalendar } from "./YearOverviewCalendar";
import { MonthCalendarGrid } from "./MonthCalendarGrid";
import { CompactYearCalendar } from "./CompactYearCalendar";

type CalendarView = "year" | "month-grid" | "month-destinations";
type FilterMode = "month" | "week" | "day";

interface GlobalCity {
  id: string;
  cityName: string;
  country: string;
  countryCode?: string | null;
  heroImage?: string | null;
  pulseScore?: number | null;
  trendingScore?: number | null;
  vibeTags: string[];
  weatherScore?: number | null;
  crowdLevel?: string | null;
  currentHighlight?: string | null;
  highlightEmoji?: string | null;
  seasonalRating: string | null;
  weatherDescription?: string | null;
  averageTemp?: string | null;
  rainfall?: string | null;
  seasonCrowdLevel?: string | null;
  priceLevel?: string | null;
  highlights: string[];
  events: { id: string; title: string; eventType: string | null; description?: string | null; specificDate?: string | null }[];
  aiBestTimeToVisit?: string | null;
  aiBudgetEstimate?: { daily?: { min?: number; max?: number } } | null;
  // D3 honest counts (real aggregates from the server; hidden when 0)
  packagesCount?: number;
  expertsCount?: number;
}

interface GlobalEvent {
  id: string;
  title: string;
  description?: string | null;
  eventType?: string | null;
  city?: string | null;
  country: string;
  startMonth?: number | null;
  endMonth?: number | null;
  specificDate?: string | null;
}

interface TimeRelevantMatch {
  city: string;
  country: string;
  month: number;
  providers: Array<{
    serviceId: string;
    serviceName: string;
    serviceType: string | null;
    price: string | null;
    priceType: string | null;
    location: string | null;
    averageRating: string | null;
    providerName: string;
  }>;
  experts: Array<{
    expertId: string;
    expertName: string;
    totalScore: number;
  }>;
}

interface GlobalCalendarResponse {
  month: number;
  monthName: string;
  totalCities: number;
  vibeFilter: string | null;
  cities: GlobalCity[];
  grouped: {
    best: GlobalCity[];
    good: GlobalCity[];
    average: GlobalCity[];
    eventsOnly: GlobalCity[];
    avoid: GlobalCity[];
  };
  allEvents: GlobalEvent[];
  timeRelevantMatches?: TimeRelevantMatch[];
}

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
  // D10: best-time cities for this month (top 2 + full count)
  bestCities?: { cityName: string; country: string }[];
  bestCitiesTotal?: number;
}

const vibeFilters = [
  { id: "all", label: "All Destinations", icon: Compass },
  { id: "romantic", label: "Romantic", icon: Heart },
  { id: "adventure", label: "Adventure", icon: Mountain },
  { id: "cultural", label: "Cultural", icon: BookOpen },
  { id: "beach", label: "Beach", icon: Waves },
  { id: "foodie", label: "Foodie", icon: Utensils },
  { id: "nightlife", label: "Nightlife", icon: Sparkles },
  { id: "family", label: "Family", icon: Users },
  { id: "nature", label: "Nature", icon: Mountain },
];

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getWeatherIcon(description: string | null | undefined) {
  if (!description) return <Sun className="h-4 w-4 text-yellow-500" />;
  const lower = description.toLowerCase();
  if (lower.includes("snow") || lower.includes("cold")) return <Snowflake className="h-4 w-4 text-blue-400" />;
  if (lower.includes("rain") || lower.includes("monsoon") || lower.includes("wet")) return <CloudRain className="h-4 w-4 text-blue-500" />;
  if (lower.includes("cloud") || lower.includes("overcast")) return <Cloud className="h-4 w-4 text-gray-400" />;
  return <Sun className="h-4 w-4 text-yellow-500" />;
}

function getRatingColor(rating: string) {
  switch (rating) {
    case "best":
    case "excellent":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    case "good":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    case "average":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    case "events-only":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800";
    case "avoid":
    case "poor":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

function getRatingLabel(rating: string) {
  switch (rating) {
    case "best":
    case "excellent":
      return "Best Time";
    case "good":
      return "Good Time";
    case "average":
      return "Average";
    case "events-only":
      return "Events";
    case "avoid":
    case "poor":
      return "Off Season";
    default:
      return "Unknown";
  }
}

interface GlobalCalendarProps {
  onCityClick?: (cityName: string, country: string) => void;
}

export function GlobalCalendar({ onCityClick }: GlobalCalendarProps) {
  const currentYear = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;
  const [view, setView] = useState<CalendarView>("month-destinations");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedVibe, setSelectedVibe] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [selectedWeek, setSelectedWeek] = useState<number | undefined>(undefined);
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);
  const [calendarVisible, setCalendarVisible] = useState(true);

  const { data, isLoading, error, refetch } = useQuery<GlobalCalendarResponse>({
    queryKey: [`/api/travelpulse/global-calendar?month=${selectedMonth}&vibe=${selectedVibe}&limit=30`],
  });

  const { data: yearData } = useQuery<{ summaries: MonthSummary[] }>({
    queryKey: ["/api/travelpulse/year-summary", currentYear],
    queryFn: async () => {
      // D10: best-time cities per month from the server year-summary endpoint
      // (one grouped query server-side); merged into the per-month summaries below.
      const bestByMonth = new Map<number, { bestCities: { cityName: string; country: string }[]; bestCitiesTotal: number }>();
      try {
        const bestRes = await fetch(`/api/travelpulse/year-summary`);
        if (bestRes.ok) {
          const bestData: { months?: { month: number; bestCities: { cityName: string; country: string }[]; bestCitiesTotal: number }[] } = await bestRes.json();
          for (const entry of bestData.months || []) {
            bestByMonth.set(entry.month, entry);
          }
        }
      } catch {
        // best-effort — mini-calendar city lines simply stay hidden
      }

      const summaries: MonthSummary[] = [];
      for (let m = 1; m <= 12; m++) {
        const res = await fetch(`/api/travelpulse/global-calendar?month=${m}&limit=10`);
        if (res.ok) {
          const monthData: GlobalCalendarResponse = await res.json();
          const allCities = [...monthData.grouped.best, ...monthData.grouped.good, ...monthData.grouped.average, ...monthData.grouped.eventsOnly];
          const topRating = monthData.grouped.best.length > 0 ? "best" :
                           monthData.grouped.good.length > 0 ? "good" :
                           monthData.grouped.average.length > 0 ? "average" : "avoid";
          
          const avgWeather = allCities.length > 0 && allCities[0].weatherDescription 
            ? allCities[0].weatherDescription 
            : "Varied";
          const avgCrowd = allCities.length > 0 && allCities[0].seasonCrowdLevel
            ? allCities[0].seasonCrowdLevel
            : "Normal";

          const eventDays: number[] = [];
          const highlights: EventHighlight[] = [];
          
          if (monthData.allEvents) {
            monthData.allEvents.forEach(event => {
              if (event.specificDate) {
                const eventDate = new Date(event.specificDate);
                if (eventDate.getMonth() + 1 === m) {
                  const day = eventDate.getDate();
                  eventDays.push(day);
                  if (highlights.length < 3) {
                    highlights.push({
                      name: event.title,
                      day,
                      city: event.city || undefined,
                    });
                  }
                }
              } else if (event.startMonth === m || event.endMonth === m) {
                for (let d = 1; d <= 28; d += 7) {
                  eventDays.push(d);
                }
                if (highlights.length < 3) {
                  highlights.push({
                    name: event.title,
                    day: event.startMonth === m ? 1 : 15,
                    city: event.city || undefined,
                  });
                }
              }
            });
          }

          summaries.push({
            month: m,
            monthName: months[m - 1],
            eventCount: monthData.allEvents?.length || 0,
            avgWeather,
            avgCrowdLevel: avgCrowd,
            topRating,
            cityCount: monthData.totalCities || allCities.length,
            eventDays: Array.from(new Set(eventDays)),
            highlights,
            bestCities: bestByMonth.get(m)?.bestCities || [],
            bestCitiesTotal: bestByMonth.get(m)?.bestCitiesTotal || 0,
          });
        }
      }
      return { summaries };
    },
    staleTime: 1000 * 60 * 30,
  });

  const [, navigate] = useLocation();

  const handleCityClick = (cityName: string, country: string) => {
    // Build a date string to activate the date-aware feed on the location page
    let dateParam = "";
    if (filterMode === "day" && selectedDay) {
      // User selected a specific day — use it exactly
      const mm = String(selectedMonth).padStart(2, "0");
      const dd = String(selectedDay).padStart(2, "0");
      dateParam = `${currentYear}-${mm}-${dd}`;
    } else if (selectedDate) {
      // Date was clicked on the month-grid calendar view
      const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const dd = String(selectedDate.getDate()).padStart(2, "0");
      dateParam = `${selectedDate.getFullYear()}-${mm}-${dd}`;
    } else {
      // Month view — use the 1st of the selected month as a "this month" signal
      const mm = String(selectedMonth).padStart(2, "0");
      dateParam = `${currentYear}-${mm}-01`;
    }

    onCityClick?.(cityName, country);
    navigate(
      `/discover/location/${encodeURIComponent(cityName)}?country=${encodeURIComponent(country)}&date=${dateParam}`
    );
  };

  const handleMonthClick = (month: number) => {
    setSelectedMonth(month);
    setView("month-grid");
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setView("month-destinations");
  };

  const handleBackToYear = () => {
    setView("year");
    setSelectedDate(null);
  };

  const handleBackToMonthGrid = () => {
    setView("month-grid");
    setSelectedDate(null);
  };

  const handlePrevMonth = () => {
    setSelectedMonth((prev) => (prev === 1 ? 12 : prev - 1));
    setSelectedWeek(undefined);
    setSelectedDay(undefined);
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => (prev === 12 ? 1 : prev + 1));
    setSelectedWeek(undefined);
    setSelectedDay(undefined);
  };

  // D5/D8: reset month + vibe filters back to the unfiltered default
  const handleClearFilters = () => {
    setSelectedVibe("all");
    setSelectedMonth(currentMonthNum);
    setSelectedWeek(undefined);
    setSelectedDay(undefined);
    setFilterMode("month");
  };



  if (isLoading && view !== "year") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Unable to load the global calendar</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-4" data-testid="button-retry">
          Try Again
        </Button>
      </Card>
    );
  }

  if (view === "year") {
    return (
      <div className="space-y-4" data-testid="global-calendar">
        <YearOverviewCalendar
          year={currentYear}
          monthSummaries={yearData?.summaries || []}
          onMonthClick={handleMonthClick}
        />
      </div>
    );
  }

  if (view === "month-grid") {
    const { allEvents, monthName } = data || { allEvents: [], monthName: months[selectedMonth - 1] };
    
    return (
      <div className="space-y-4" data-testid="global-calendar">
        <MonthCalendarGrid
          year={currentYear}
          month={selectedMonth}
          monthName={monthName}
          events={allEvents.map(e => ({
            ...e,
            eventType: e.eventType || null,
          }))}
          seasonInfo={[]}
          onDateClick={handleDateClick}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onBack={handleBackToYear}
          selectedDate={selectedDate}
        />

        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setView("month-destinations")}
            data-testid="button-show-destinations"
          >
            <MapPin className="h-4 w-4 mr-1" />
            View Destinations for {monthName}
          </Button>
        </div>
      </div>
    );
  }

  const { grouped, allEvents, monthName } = data || { grouped: { best: [], good: [], average: [], eventsOnly: [], avoid: [] }, allEvents: [], monthName: "" };

  const getFilterDescription = () => {
    if (filterMode === "day" && selectedDay) {
      return `${months[selectedMonth - 1]} ${selectedDay}, ${currentYear}`;
    }
    if (filterMode === "week" && selectedWeek) {
      return `${months[selectedMonth - 1]} Week ${selectedWeek}`;
    }
    return monthName;
  };

  const getWeekDays = (year: number, month: number, week: number): number[] => {
    const firstDay = new Date(year, month - 1, 1);
    const startDayOfWeek = firstDay.getDay();
    const firstDayOfFirstWeek = 1 - startDayOfWeek;
    const weekStart = firstDayOfFirstWeek + (week - 1) * 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const days: number[] = [];
    for (let i = 0; i < 7; i++) {
      const day = weekStart + i;
      if (day >= 1 && day <= daysInMonth) {
        days.push(day);
      }
    }
    return days;
  };

  const filterEvents = (events: GlobalEvent[]): GlobalEvent[] => {
    if (filterMode === "month" || (!selectedWeek && !selectedDay)) {
      return events;
    }

    return events.filter(event => {
      if (!event.specificDate) {
        return true;
      }
      
      const eventDate = new Date(event.specificDate);
      const eventDay = eventDate.getDate();
      const eventMonth = eventDate.getMonth() + 1;
      
      if (eventMonth !== selectedMonth) {
        return false;
      }
      
      if (filterMode === "day" && selectedDay) {
        return eventDay === selectedDay;
      }
      
      if (filterMode === "week" && selectedWeek) {
        const weekDays = getWeekDays(currentYear, selectedMonth, selectedWeek);
        return weekDays.includes(eventDay);
      }
      
      return true;
    });
  };

  const filteredEvents = filterEvents(allEvents);

  // D5: a filter is "active" when the user moved off the unfiltered default
  // (current month, all vibes). Match count is the server's post-filter total.
  const isFilterActive = selectedVibe !== "all" || selectedMonth !== currentMonthNum;
  const activeVibeLabel = vibeFilters.find((v) => v.id === selectedVibe)?.label ?? selectedVibe;
  const matchCount = data?.totalCities ?? 0;
  const hasNoDestinations =
    grouped.best.length === 0 &&
    grouped.good.length === 0 &&
    grouped.average.length === 0 &&
    grouped.eventsOnly.length === 0;

  return (
    <div data-testid="global-calendar" className="after:block after:clear-both after:content-['']">
      {/* Calendar container - only float when calendar is visible */}
      {calendarVisible && (
        <div className="hidden lg:block float-right ml-6 mb-4">
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCalendarVisible(false)}
              data-testid="button-toggle-calendar"
            >
              <EyeOff className="h-4 w-4 mr-1" />
              Hide Calendar
            </Button>
          </div>
          <CompactYearCalendar
            year={currentYear}
            monthSummaries={yearData?.summaries || []}
            selectedMonth={selectedMonth}
            selectedWeek={selectedWeek}
            selectedDay={selectedDay}
            filterMode={filterMode}
            onFilterModeChange={(mode) => {
              setFilterMode(mode);
              // Only clear selections when switching modes, don't auto-select
              // This allows users to click on week rows or day cells to make their selection
              if (mode === "month") {
                setSelectedWeek(undefined);
                setSelectedDay(undefined);
              } else if (mode === "week") {
                // Don't auto-select week 1 - let user click on a week row to select
                setSelectedDay(undefined);
                // Only clear selectedWeek if coming from day mode, keep if already in week
                if (filterMode !== "week") {
                  setSelectedWeek(undefined);
                }
              } else if (mode === "day") {
                // Don't auto-select day 1 - let user click on a day cell to select
                setSelectedWeek(undefined);
              }
            }}
            onMonthSelect={(month) => {
              setSelectedMonth(month);
              setSelectedWeek(undefined);
              setSelectedDay(undefined);
            }}
            onWeekSelect={(month, week) => {
              setSelectedMonth(month);
              setSelectedWeek(week);
              setSelectedDay(undefined);
            }}
            onDaySelect={(month, day) => {
              setSelectedMonth(month);
              setSelectedDay(day);
            }}
          />
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Where to Go
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered recommendations based on weather, events, and crowd levels
            </p>
          </div>
          {/* Show calendar toggle button inline when calendar is hidden */}
          {!calendarVisible && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCalendarVisible(true)}
              className="hidden lg:flex"
              data-testid="button-toggle-calendar"
            >
              <Eye className="h-4 w-4 mr-1" />
              Show Calendar
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {vibeFilters.slice(0, 5).map((vibe) => (
              <Button
                key={vibe.id}
                variant={selectedVibe === vibe.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedVibe(vibe.id)}
                data-testid={`button-vibe-${vibe.id}`}
              >
                <vibe.icon className="h-4 w-4 mr-1" />
                {vibe.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {vibeFilters.slice(5).map((vibe) => (
              <Button
                key={vibe.id}
                variant={selectedVibe === vibe.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedVibe(vibe.id)}
                data-testid={`button-vibe-${vibe.id}`}
              >
                <vibe.icon className="h-4 w-4 mr-1" />
                {vibe.label}
              </Button>
            ))}
          </div>
        </div>

          {/* D5: filter-state line — rendered only while a month/vibe filter is active */}
          {isFilterActive && (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              data-testid="filter-state-line"
            >
              <span>
                Showing destinations best in {months[selectedMonth - 1]}
                {selectedVibe !== "all" ? ` · ${activeVibeLabel}` : ""}
                {" · "}
                {matchCount} {matchCount === 1 ? "match" : "matches"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleClearFilters}
                data-testid="button-clear-filters"
              >
                Clear
                <X className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}

          {grouped.best.length > 0 && (
            <CitySection
              title="Best Time to Visit"
              subtitle="Perfect conditions for travel"
              cities={grouped.best}
              rating="best"
              onCityClick={handleCityClick}
              calendarVisible={calendarVisible}
              monthName={monthName || months[selectedMonth - 1]}
            />
          )}

          {grouped.good.length > 0 && (
            <CitySection
              title="Good Time to Visit"
              subtitle="Favorable conditions overall"
              cities={grouped.good}
              rating="good"
              onCityClick={handleCityClick}
              calendarVisible={calendarVisible}
              monthName={monthName || months[selectedMonth - 1]}
            />
          )}

          {grouped.average.length > 0 && (
            <CitySection
              title="Average Conditions"
              subtitle="Mixed conditions, check details"
              cities={grouped.average}
              rating="average"
              onCityClick={handleCityClick}
              calendarVisible={calendarVisible}
              monthName={monthName || months[selectedMonth - 1]}
            />
          )}

          {grouped.eventsOnly.length > 0 && (
            <CitySection
              title="Events & Highlights"
              subtitle="Destinations with notable events this period"
              cities={grouped.eventsOnly}
              rating="events-only"
              onCityClick={handleCityClick}
              calendarVisible={calendarVisible}
              monthName={monthName || months[selectedMonth - 1]}
            />
          )}

          {filteredEvents.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Ticket className="h-5 w-5 text-muted-foreground" />
                Events & Festivals{filterMode === "day" && selectedDay ? ` on ${months[selectedMonth - 1]} ${selectedDay}` : filterMode === "week" && selectedWeek ? ` in Week ${selectedWeek}` : ` in ${monthName}`}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredEvents.slice(0, 6).map((event) => (
                  <Card key={event.id} className="hover-elevate" data-testid={`event-card-${event.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Ticket className="h-5 w-5 text-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Badge variant="secondary" className="mb-1 text-xs capitalize">
                            {event.eventType || "event"}
                          </Badge>
                          <h4 className="font-medium text-sm line-clamp-1">{event.title}</h4>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            {event.city ? `${event.city}, ` : ""}{event.country}
                          </div>
                          <Link href={`/experiences/travel?destination=${encodeURIComponent(event.city || event.country)}&event=${encodeURIComponent(event.title)}`}>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-2"
                              data-testid={`button-plan-event-${event.id}`}
                            >
                              <Plane className="h-3 w-3 mr-1" />
                              Plan This Trip
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* D8: honest empty state — a friendlier block when a vibe filter caused the
              zero-result, with a clear-filters action; the original unfiltered block is kept */}
          {hasNoDestinations && selectedVibe !== "all" && (
            <Card className="p-8 text-center" data-testid="empty-filtered-state">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No {activeVibeLabel.toLowerCase()} data for {months[selectedMonth - 1]} yet — try
                other months, or browse all destinations
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
                className="mt-4"
                data-testid="button-clear-filters-empty"
              >
                Clear filters
              </Button>
            </Card>
          )}

          {hasNoDestinations && selectedVibe === "all" && (
            <Card className="p-8 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No destination data available for {monthName}</p>
              <p className="text-xs text-muted-foreground mt-2">Check back after the next AI refresh</p>
            </Card>
          )}
      </div>
    </div>
  );
}

// Helper: Convert season rating to a numeric score for display (best=9, good=7, average=5, etc.)
function getSeasonScore(rating: string | null): number {
  switch (rating) {
    case "best":
    case "excellent":
      return 9;
    case "good":
      return 7;
    case "average":
      return 5;
    case "avoid":
    case "poor":
      return 2;
    default:
      return 0;
  }
}

// Helper: Get guidance text based on season conditions
function getSeasonGuidance(city: GlobalCity): string {
  const parts: string[] = [];

  if (city.highlights && city.highlights.length > 0) {
    parts.push(city.highlights[0]);
  }

  if (city.weatherDescription) {
    const weather = city.weatherDescription.toLowerCase();
    if (weather.includes("snow") || weather.includes("cold")) {
      parts.push("cold");
    } else if (weather.includes("rain") || weather.includes("wet")) {
      parts.push("wet season");
    } else if (weather.includes("mild")) {
      parts.push("mild");
    }
  }

  if (city.seasonCrowdLevel) {
    parts.push(`${city.seasonCrowdLevel} crowds`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Visit this month";
}

// Component: Individual city card with season guidance
function CityCard({
  city,
  onCityClick,
  monthName,
}: {
  city: GlobalCity;
  onCityClick?: (cityName: string, country: string) => void;
  monthName?: string;
}) {
  const experienceSuggestions = getExperienceSuggestionsForCity(city);
  const destination = encodeURIComponent(`${city.cityName}, ${city.country}`);
  const seasonScore = getSeasonScore(city.seasonalRating);
  const seasonGuidance = getSeasonGuidance(city);
  // D3 honest counts — real aggregates only; each segment hidden when 0 (§13)
  const eventsCount = city.events.length;
  const packagesCount = city.packagesCount ?? 0;
  const expertsCount = city.expertsCount ?? 0;
  const countSegments = [
    eventsCount > 0 ? `🎆 ${eventsCount} ${eventsCount === 1 ? "event" : "events"}` : null,
    packagesCount > 0 ? `📔 ${packagesCount} ${packagesCount === 1 ? "package" : "packages"}` : null,
    expertsCount > 0 ? `🧭 ${expertsCount} local ${expertsCount === 1 ? "expert" : "experts"}` : null,
  ].filter((segment): segment is string => segment !== null);

  // More-info modal: one-line subtitle + SEASON/EVENTS/PACKAGES/EXPERTS labeled rows.
  // Every value is a real aggregate; a row renders only when it has data (§13 — no filler).
  const modalSubtitle = [
    seasonScore > 0 ? `${seasonScore}/10` : null,
    seasonScore > 0 ? "Ideal month" : null,
    city.highlights?.[0] ?? null,
  ].filter((s): s is string => !!s).join(" · ");

  const seasonRow = [
    city.weatherDescription
      ? `${city.weatherDescription}${city.averageTemp ? ` (${city.averageTemp})` : ""}`
      : null,
    city.seasonCrowdLevel ? `${city.seasonCrowdLevel} crowds` : null,
    city.priceLevel ? `${city.priceLevel} pricing` : null,
  ].filter((s): s is string => !!s).join(" · ");

  const eventsRow = city.events.slice(0, 3).map((e) => {
    const d = e.specificDate
      ? new Date(e.specificDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;
    return d ? `${e.title} (${d})` : e.title;
  });
  const eventsExtra = Math.max(0, eventsCount - 3);

  // PACKAGES/EXPERTS show honest counts today; "from $X" price + expert neighbourhoods
  // upgrade in follow-up B once the global-calendar payload carries them.
  const packagesRow =
    packagesCount > 0
      ? `${packagesCount} expert ${packagesCount === 1 ? "itinerary" : "itineraries"}`
      : null;
  const expertsRow =
    expertsCount > 0
      ? `${expertsCount} local ${expertsCount === 1 ? "expert covers" : "experts cover"} this destination`
      : null;

  return (
    <Card
      key={city.id}
      className="overflow-hidden h-full flex flex-col"
      data-testid={`city-card-${city.id}`}
    >
      <div
        className="cursor-pointer hover-elevate flex-1"
        onClick={() => onCityClick?.(city.cityName, city.country)}
      >
        {city.heroImage && (
          <div className="h-32 relative">
            <img
              src={city.heroImage}
              alt={city.cityName}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-2 left-3 right-3">
              <h4 className="font-semibold text-white">{city.cityName}</h4>
              <p className="text-xs text-white/80">{city.country}</p>
            </div>
          </div>
        )}
        <CardContent className={city.heroImage ? "p-3" : "p-4"}>
          {!city.heroImage && (
            <div className="mb-2">
              <h4 className="font-semibold">{city.cityName}</h4>
              <p className="text-xs text-muted-foreground">{city.country}</p>
            </div>
          )}

          {/* Season suitability score (prominent guidance) */}
          {city.seasonalRating && seasonScore > 0 && (
            <div className="mb-3 p-2 rounded-lg bg-muted/50 border border-muted">
              <div className="flex items-center gap-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold">{seasonScore}</span>
                  <span className="text-xs text-muted-foreground">/10</span>
                </div>
                <span className="text-xs text-muted-foreground font-medium">Ideal month</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{seasonGuidance}</p>
            </div>
          )}

          {/* Seasonal details: weather, crowds, price */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {city.weatherDescription && (
              <span className="flex items-center gap-1">
                {getWeatherIcon(city.weatherDescription)}
                <span className="text-muted-foreground">{city.averageTemp}</span>
              </span>
            )}
            {city.seasonCrowdLevel && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground capitalize">{city.seasonCrowdLevel}</span>
              </span>
            )}
            {city.pulseScore && city.pulseScore > 70 && (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-green-600 dark:text-green-400">Trending</span>
              </span>
            )}
          </div>

          {city.events.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <div className="flex items-center gap-1 text-xs">
                <Ticket className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{city.events[0].title}</span>
              </div>
            </div>
          )}

          {city.vibeTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {city.vibeTags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs capitalize">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* D3: honest counts row — hidden entirely when everything is 0 (§13) */}
          {countSegments.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground" data-testid={`city-counts-${city.id}`}>
              {countSegments.join(" · ")}
            </div>
          )}
        </CardContent>
      </div>

      <div className="px-3 pb-3 pt-2 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground mb-2">Plan an experience:</p>
        <div className="flex flex-wrap gap-2">
          {experienceSuggestions.map((suggestion, idx) => (
            <Link
              key={idx}
              href={`/experiences/${suggestion.slug}?destination=${destination}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="outline"
                size="sm"
                data-testid={`button-plan-${city.id}-${suggestion.slug}`}
              >
                <Plane className="h-3 w-3 mr-1" />
                {suggestion.label}
              </Button>
            </Link>
          ))}
          {/* D9: More info modal — additive, does not displace the existing buttons */}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-more-info-${city.id}`}
              >
                <Info className="h-3 w-3 mr-1" />
                More info
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>
                  {city.cityName}{monthName ? ` in ${monthName}` : ""}
                </DialogTitle>
                {modalSubtitle && (
                  <p className="text-sm text-muted-foreground" data-testid={`modal-subtitle-${city.id}`}>
                    {modalSubtitle}
                  </p>
                )}
              </DialogHeader>

              {/* SAME PATTERN EVERYWHERE: uppercase label + value rows.
                  Each row renders only when its aggregate has data (§13). */}
              <dl className="divide-y divide-border">
                {seasonRow && (
                  <div className="grid grid-cols-[84px_1fr] gap-3 py-3" data-testid={`modal-row-season-${city.id}`}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season</dt>
                    <dd className="text-sm">{seasonRow}</dd>
                  </div>
                )}

                {eventsRow.length > 0 && (
                  <div className="grid grid-cols-[84px_1fr] gap-3 py-3" data-testid={`modal-row-events-${city.id}`}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Events</dt>
                    <dd className="text-sm">
                      {eventsRow.join(" · ")}
                      {eventsExtra > 0 && (
                        <span className="text-muted-foreground"> · +{eventsExtra} more</span>
                      )}
                    </dd>
                  </div>
                )}

                {packagesRow && (
                  <div className="grid grid-cols-[84px_1fr] gap-3 py-3" data-testid={`modal-row-packages-${city.id}`}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Packages</dt>
                    <dd className="text-sm">{packagesRow}</dd>
                  </div>
                )}

                {expertsRow && (
                  <div className="grid grid-cols-[84px_1fr] gap-3 py-3" data-testid={`modal-row-experts-${city.id}`}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Experts</dt>
                    <dd className="text-sm">{expertsRow}</dd>
                  </div>
                )}
              </dl>

              <div className="space-y-3">
                {/* CTAs */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => onCityClick?.(city.cityName, city.country)}
                    data-testid={`button-modal-see-city-${city.id}`}
                  >
                    <MapPin className="h-3 w-3 mr-1" />
                    See {city.cityName}{monthName ? ` in ${monthName}` : ""}
                  </Button>
                  <Link href="/discover?tab=packages">
                    <Button variant="outline" size="sm" data-testid={`button-modal-view-packages-${city.id}`}>
                      <BookOpen className="h-3 w-3 mr-1" />
                      View packages
                    </Button>
                  </Link>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Card>
  );
}

function getExperienceSuggestionsForCity(city: GlobalCity): Array<{ label: string; slug: string }> {
  const suggestions: Array<{ label: string; slug: string }> = [];
  const vibes = city.vibeTags.map(v => v.toLowerCase());
  
  if (vibes.includes("romantic")) {
    suggestions.push({ label: "Romantic Getaway", slug: "date-night" });
    suggestions.push({ label: "Plan a Proposal", slug: "proposal" });
    suggestions.push({ label: "Destination Wedding", slug: "wedding" });
  }
  if (vibes.includes("adventure")) {
    suggestions.push({ label: "Adventure Trip", slug: "travel" });
  }
  if (vibes.includes("cultural")) {
    suggestions.push({ label: "Cultural Tour", slug: "travel" });
  }
  if (vibes.includes("luxury")) {
    suggestions.push({ label: "Luxury Escape", slug: "travel" });
    suggestions.push({ label: "Destination Wedding", slug: "wedding" });
  }
  if (vibes.includes("nightlife")) {
    suggestions.push({ label: "Nightlife Experience", slug: "date-night" });
    suggestions.push({ label: "Birthday Celebration", slug: "birthday" });
  }
  if (vibes.includes("beach")) {
    suggestions.push({ label: "Beach Vacation", slug: "travel" });
    suggestions.push({ label: "Destination Wedding", slug: "wedding" });
  }
  if (vibes.includes("nature")) {
    suggestions.push({ label: "Nature Retreat", slug: "retreat" });
    suggestions.push({ label: "Corporate Retreat", slug: "corporate" });
  }
  if (vibes.includes("foodie")) {
    suggestions.push({ label: "Food & Wine Tour", slug: "travel" });
    suggestions.push({ label: "Birthday Celebration", slug: "birthday" });
  }
  if (vibes.includes("family")) {
    suggestions.push({ label: "Family Reunion", slug: "reunion" });
    suggestions.push({ label: "Birthday Celebration", slug: "birthday" });
  }
  if (vibes.includes("business") || vibes.includes("urban") || vibes.includes("city")) {
    suggestions.push({ label: "Corporate Event", slug: "corporate" });
  }
  if (vibes.includes("celebration") || vibes.includes("festive") || vibes.includes("party")) {
    suggestions.push({ label: "Birthday Celebration", slug: "birthday" });
    suggestions.push({ label: "Reunion Trip", slug: "reunion" });
  }
  
  if (suggestions.length === 0) {
    suggestions.push({ label: "Plan a Trip", slug: "travel" });
  }
  
  const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
    index === self.findIndex(s => s.slug === suggestion.slug)
  );
  
  return uniqueSuggestions.slice(0, 2);
}

function CitySection({
  title,
  subtitle,
  cities,
  rating,
  onCityClick,
  calendarVisible = true,
  monthName,
}: {
  title: string;
  subtitle: string;
  cities: GlobalCity[];
  rating: string;
  onCityClick?: (cityName: string, country: string) => void;
  calendarVisible?: boolean;
  monthName?: string;
}) {
  // Deduplicate cities by name, keeping first occurrence
  const seenNames = new Set<string>();
  const uniqueCities = cities.filter(city => {
    if (seenNames.has(city.cityName)) return false;
    seenNames.add(city.cityName);
    return true;
  });
  
  // When calendar is visible: 2 cards in first row (beside wider 648px calendar)
  // When calendar is hidden: 4 cards in first row (full width)
  const firstRowCount = calendarVisible ? 2 : 4;
  const firstRowCities = uniqueCities.slice(0, firstRowCount);
  const secondRowCities = uniqueCities.slice(firstRowCount, firstRowCount + 4);
  const thirdRowCities = uniqueCities.slice(firstRowCount + 4, firstRowCount + 8);
  
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Badge className={`${getRatingColor(rating)} border`}>
            {getRatingLabel(rating)}
          </Badge>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {/* First row: 2 cards when calendar visible (beside 648px calendar), 4 cards when hidden */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${calendarVisible ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} gap-4 mb-4`}>
        {firstRowCities.map((city) => (
          <CityCard key={city.id} city={city} onCityClick={onCityClick} monthName={monthName} />
        ))}
      </div>
      
      {/* Second row: 4 cards wide, clear of the calendar */}
      {secondRowCities.length > 0 && (
        <div className="clear-both grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {secondRowCities.map((city) => (
            <CityCard key={city.id} city={city} onCityClick={onCityClick} monthName={monthName} />
          ))}
        </div>
      )}

      {/* Third row: 4 more cards */}
      {thirdRowCities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {thirdRowCities.map((city) => (
            <CityCard key={city.id} city={city} onCityClick={onCityClick} monthName={monthName} />
          ))}
        </div>
      )}
    </div>
  );
}
