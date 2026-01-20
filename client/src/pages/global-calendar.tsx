import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Users,
  DollarSign,
  AlertCircle,
  Sparkles,
  Search,
  PartyPopper,
  Trophy,
  Building,
  Plane,
  Lightbulb
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  eventName: string;
  eventType: string | null;
  city: string | null;
  country: string | null;
  startDate: string;
  endDate: string | null;
  crowdImpact: string | null;
  priceImpact: string | null;
  crowdImpactPercent: number | null;
  description: string | null;
  affectedAreas: string[];
  tips: string[];
}

interface CalendarResponse {
  events: CalendarEvent[];
  city: string;
  startDate: string;
  endDate: string;
}

const POPULAR_CITIES = ["Tokyo", "Paris", "New York", "Barcelona", "Rome", "London", "Sydney", "Dubai"];

function getEventIcon(type: string | null) {
  switch (type) {
    case "festival": return <PartyPopper className="h-4 w-4" />;
    case "sporting": return <Trophy className="h-4 w-4" />;
    case "conference": return <Building className="h-4 w-4" />;
    case "holiday": return <Plane className="h-4 w-4" />;
    default: return <Calendar className="h-4 w-4" />;
  }
}

function getImpactColor(impact: string | null) {
  switch (impact) {
    case "extreme": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "high": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "moderate": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

function getPriceImpactLabel(impact: string | null) {
  switch (impact) {
    case "surge": return { text: "+50%+", color: "text-red-600" };
    case "higher": return { text: "+20%", color: "text-orange-600" };
    case "normal": return { text: "Normal", color: "text-green-600" };
    case "lower": return { text: "-15%", color: "text-blue-600" };
    default: return { text: "-", color: "text-gray-500" };
  }
}

export default function GlobalCalendarPage() {
  const [selectedCity, setSelectedCity] = useState("Tokyo");
  const [cityInput, setCityInput] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const startDate = startOfMonth(currentMonth);
  const endDate = endOfMonth(addMonths(currentMonth, 2));

  const calendarUrl = `/api/travelpulse/calendar/${encodeURIComponent(selectedCity)}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
  
  const { data: calendarData, isLoading } = useQuery<CalendarResponse>({
    queryKey: [calendarUrl],
    staleTime: 60 * 60 * 1000,
  });

  const monthDays = useMemo(() => eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  }), [currentMonth]);

  const getEventsForDate = (date: Date): CalendarEvent[] => {
    if (!calendarData?.events) return [];
    return calendarData.events.filter(event => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = event.endDate ? parseISO(event.endDate) : eventStart;
      return isWithinInterval(date, { start: eventStart, end: eventEnd }) || isSameDay(date, eventStart);
    });
  };

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const handleCitySearch = () => {
    if (cityInput.trim()) {
      setSelectedCity(cityInput.trim());
      setSelectedDate(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-br from-primary/10 via-background to-primary/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Calendar className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Global Travel Calendar</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Plan around festivals, holidays, and peak seasons. See crowd and price predictions for any destination.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto mb-6">
            <div className="relative flex-1 w-full">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter city name..."
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCitySearch()}
                className="pl-9"
                data-testid="input-calendar-city"
              />
            </div>
            <Button onClick={handleCitySearch} data-testid="button-search-calendar">
              <Search className="h-4 w-4 mr-2" />
              View Calendar
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {POPULAR_CITIES.map((city) => (
              <Button
                key={city}
                variant={selectedCity === city ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedCity(city);
                  setSelectedDate(null);
                }}
                data-testid={`button-city-${city.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {city}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-lg font-medium">
                  {format(currentMonth, "MMMM yyyy")} - {selectedCity}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                    aria-label="Previous month"
                    data-testid="button-prev-month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    aria-label="Next month"
                    data-testid="button-next-month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-7 gap-1">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array(35).fill(0).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array(monthDays[0].getDay()).fill(null).map((_, i) => (
                        <div key={`empty-${i}`} className="h-16" />
                      ))}
                      {monthDays.map((day) => {
                        const events = getEventsForDate(day);
                        const hasHighImpact = events.some(e => e.crowdImpact === "extreme" || e.crowdImpact === "high");
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const dateLabel = format(day, "MMMM d, yyyy");
                        const eventCount = events.length;
                        
                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => setSelectedDate(day)}
                            aria-label={`${dateLabel}${eventCount > 0 ? `, ${eventCount} event${eventCount > 1 ? 's' : ''}` : ''}`}
                            className={cn(
                              "h-16 p-1 rounded-lg border transition-all text-left relative hover-elevate active-elevate-2",
                              isSelected 
                                ? "border-primary bg-primary/10 ring-2 ring-primary" 
                                : "border-border",
                              events.length > 0 && "bg-muted/50",
                              hasHighImpact && "border-orange-300"
                            )}
                            data-testid={`button-date-${format(day, "yyyy-MM-dd")}`}
                          >
                            <span className={cn(
                              "text-sm font-medium",
                              isSelected && "text-primary"
                            )}>
                              {format(day, "d")}
                            </span>
                            {events.length > 0 && (
                              <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 overflow-hidden">
                                {events.slice(0, 3).map((event, i) => (
                                  <div 
                                    key={i} 
                                    className={cn(
                                      "h-1.5 flex-1 rounded-full",
                                      event.crowdImpact === "extreme" ? "bg-red-500" :
                                      event.crowdImpact === "high" ? "bg-orange-500" :
                                      event.crowdImpact === "moderate" ? "bg-yellow-500" :
                                      "bg-green-500"
                                    )}
                                  />
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">Crowd Impact:</span>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-xs">Low</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <span className="text-xs">Moderate</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-orange-500" />
                    <span className="text-xs">High</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-xs">Extreme</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-4 z-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {selectedDate ? (
                    <>
                      <Calendar className="h-5 w-5 text-primary" />
                      {format(selectedDate, "MMMM d, yyyy")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 text-primary" />
                      Select a Date
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDate ? (
                  selectedDateEvents.length > 0 ? (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-4">
                        {selectedDateEvents.map((event) => {
                          const priceLabel = getPriceImpactLabel(event.priceImpact);
                          return (
                            <div 
                              key={event.id} 
                              className="p-4 border rounded-lg space-y-3"
                              data-testid={`card-event-${event.id}`}
                            >
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  {getEventIcon(event.eventType)}
                                  <h4 className="font-medium" data-testid={`text-event-name-${event.id}`}>
                                    {event.eventName}
                                  </h4>
                                </div>
                                <Badge 
                                  className={getImpactColor(event.crowdImpact)}
                                  data-testid={`badge-impact-${event.id}`}
                                >
                                  {event.crowdImpact || "Normal"}
                                </Badge>
                              </div>

                              <p className="text-sm text-muted-foreground" data-testid={`text-event-desc-${event.id}`}>
                                {event.description}
                              </p>

                              <div className="flex items-center gap-4 text-sm flex-wrap">
                                <div className="flex items-center gap-1" data-testid={`text-crowd-${event.id}`}>
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    +{event.crowdImpactPercent || 0}% crowds
                                  </span>
                                </div>
                                <div className="flex items-center gap-1" data-testid={`text-price-${event.id}`}>
                                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                                  <span className={priceLabel.color}>
                                    {priceLabel.text} prices
                                  </span>
                                </div>
                              </div>

                              {event.affectedAreas && event.affectedAreas.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Affected Areas
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {event.affectedAreas.map((area, i) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {area}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {event.tips && event.tips.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <Lightbulb className="h-3 w-3 text-blue-500" />
                                    Tips
                                  </p>
                                  <ul className="space-y-1">
                                    {event.tips.map((tip, i) => (
                                      <li key={i} className="text-xs flex items-start gap-1">
                                        <span className="text-primary">•</span>
                                        <span>{tip}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <div className="text-xs text-muted-foreground">
                                {format(parseISO(event.startDate), "MMM d")}
                                {event.endDate && ` - ${format(parseISO(event.endDate), "MMM d")}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8">
                      <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        No major events on this date
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        This is typically a good time to visit with normal crowd levels.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      Click on a date to see events and predictions
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
