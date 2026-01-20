import { useState } from "react";
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
} from "lucide-react";
import { Link } from "wouter";
import { CityDetailView } from "./CityDetailView";
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
  seasonalRating: string;
  weatherDescription?: string | null;
  averageTemp?: string | null;
  rainfall?: string | null;
  seasonCrowdLevel?: string | null;
  priceLevel?: string | null;
  highlights: string[];
  events: { id: string; title: string; eventType: string | null; description?: string | null }[];
  aiBestTimeToVisit?: string | null;
  aiBudgetEstimate?: { daily?: { min?: number; max?: number } } | null;
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
    avoid: GlobalCity[];
  };
  allEvents: GlobalEvent[];
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
  const [view, setView] = useState<CalendarView>("month-destinations");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedVibe, setSelectedVibe] = useState("all");
  const [selectedCity, setSelectedCity] = useState<{ name: string; country: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [selectedWeek, setSelectedWeek] = useState<number | undefined>(undefined);
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);

  const { data, isLoading, error, refetch } = useQuery<GlobalCalendarResponse>({
    queryKey: [`/api/travelpulse/global-calendar?month=${selectedMonth}&vibe=${selectedVibe}&limit=30`],
  });

  const { data: yearData } = useQuery<{ summaries: MonthSummary[] }>({
    queryKey: ["/api/travelpulse/year-summary", currentYear],
    queryFn: async () => {
      const summaries: MonthSummary[] = [];
      for (let m = 1; m <= 12; m++) {
        const res = await fetch(`/api/travelpulse/global-calendar?month=${m}&limit=10`);
        if (res.ok) {
          const monthData: GlobalCalendarResponse = await res.json();
          const allCities = [...monthData.grouped.best, ...monthData.grouped.good, ...monthData.grouped.average];
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
          });
        }
      }
      return { summaries };
    },
    staleTime: 1000 * 60 * 30,
  });

  const handleCityClick = (cityName: string, country: string) => {
    setSelectedCity({ name: cityName, country });
    onCityClick?.(cityName, country);
  };

  const handleBackFromCity = () => {
    setSelectedCity(null);
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

  if (selectedCity) {
    return (
      <CityDetailView
        cityName={selectedCity.name}
        onBack={handleBackFromCity}
      />
    );
  }

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

  const { grouped, allEvents, monthName } = data || { grouped: { best: [], good: [], average: [], avoid: [] }, allEvents: [], monthName: "" };

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

  return (
    <div data-testid="global-calendar" className="after:block after:clear-both after:content-['']">
      <div className="hidden lg:block float-right ml-6 mb-4">
        <CompactYearCalendar
          year={currentYear}
          monthSummaries={yearData?.summaries || []}
          selectedMonth={selectedMonth}
          selectedWeek={selectedWeek}
          selectedDay={selectedDay}
          filterMode={filterMode}
          onFilterModeChange={(mode) => {
            setFilterMode(mode);
            if (mode === "month") {
              setSelectedWeek(undefined);
              setSelectedDay(undefined);
            } else if (mode === "week") {
              setSelectedWeek(1);
              setSelectedDay(undefined);
            } else if (mode === "day") {
              setSelectedDay(1);
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

      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          Where to Go
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered recommendations based on weather, events, and crowd levels
        </p>
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

          {grouped.best.length > 0 && (
            <CitySection
              title="Best Time to Visit"
              subtitle="Perfect conditions for travel"
              cities={grouped.best}
              rating="best"
              onCityClick={handleCityClick}
            />
          )}

          {grouped.good.length > 0 && (
            <CitySection
              title="Good Time to Visit"
              subtitle="Favorable conditions overall"
              cities={grouped.good}
              rating="good"
              onCityClick={handleCityClick}
            />
          )}

          {grouped.average.length > 0 && (
            <CitySection
              title="Average Conditions"
              subtitle="Mixed conditions, check details"
              cities={grouped.average}
              rating="average"
              onCityClick={handleCityClick}
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

          {grouped.best.length === 0 && grouped.good.length === 0 && grouped.average.length === 0 && (
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
}: {
  title: string;
  subtitle: string;
  cities: GlobalCity[];
  rating: string;
  onCityClick?: (cityName: string, country: string) => void;
}) {
  // Deduplicate cities by name, keeping first occurrence
  const seenNames = new Set<string>();
  const uniqueCities = cities.filter(city => {
    if (seenNames.has(city.cityName)) return false;
    seenNames.add(city.cityName);
    return true;
  });
  
  const firstRowCities = uniqueCities.slice(0, 3);
  const secondRowCities = uniqueCities.slice(3, 7);
  const thirdRowCities = uniqueCities.slice(7, 11);
  
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
      {/* First row: 3 cards to wrap beside calendar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {firstRowCities.map((city) => {
          const experienceSuggestions = getExperienceSuggestionsForCity(city);
          const destination = encodeURIComponent(`${city.cityName}, ${city.country}`);
          
          return (
          <Card 
            key={city.id}
            className="overflow-hidden h-full"
            data-testid={`city-card-${city.id}`}
          >
            <div 
              className="cursor-pointer hover-elevate"
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

                {city.currentHighlight && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      {city.currentHighlight}
                    </p>
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
              </div>
            </div>
          </Card>
          );
        })}
      </div>
      
      {/* Second row: 4 cards wide, clear of the calendar */}
      {secondRowCities.length > 0 && (
        <div className="clear-both grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {secondRowCities.map((city) => {
            const experienceSuggestions = getExperienceSuggestionsForCity(city);
            const destination = encodeURIComponent(`${city.cityName}, ${city.country}`);
            
            return (
            <Card 
              key={city.id}
              className="overflow-hidden h-full"
              data-testid={`city-card-${city.id}`}
            >
              <div 
                className="cursor-pointer hover-elevate"
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

                  {city.currentHighlight && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        {city.currentHighlight}
                      </p>
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
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {/* Third row: 4 more cards */}
      {thirdRowCities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {thirdRowCities.map((city) => {
            const experienceSuggestions = getExperienceSuggestionsForCity(city);
            const destination = encodeURIComponent(`${city.cityName}, ${city.country}`);
            
            return (
            <Card 
              key={city.id}
              className="overflow-hidden h-full"
              data-testid={`city-card-${city.id}`}
            >
              <div 
                className="cursor-pointer hover-elevate"
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

                  {city.currentHighlight && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        {city.currentHighlight}
                      </p>
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
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
