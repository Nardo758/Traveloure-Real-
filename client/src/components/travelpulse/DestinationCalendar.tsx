import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Sun, Cloud, CloudRain, Snowflake, Users, DollarSign, Sparkles, PartyPopper, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DestinationSeason {
  id: string;
  country: string;
  city: string | null;
  month: number;
  rating: string;
  weatherDescription: string | null;
  averageTemp: string | null;
  rainfall: string | null;
  crowdLevel: string | null;
  priceLevel: string | null;
  highlights: string[];
  sourceType: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface DestinationEvent {
  id: string;
  country: string;
  city: string | null;
  title: string;
  description: string | null;
  eventType: string | null;
  startMonth: number | null;
  endMonth: number | null;
  specificDate: string | null;
  isRecurring: boolean | null;
  year: number | null;
  seasonRating: string | null;
  highlights: string[];
  tips: string | null;
  sourceType: string | null;
  sourceId: string | null;
  contributorId: string | null;
  status: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface CalendarData {
  city: string;
  country: string;
  seasons: DestinationSeason[];
  events: DestinationEvent[];
  bestTimeToVisit: string | null;
  lastUpdated: Date | null;
}

interface DestinationCalendarProps {
  cityName: string;
  country: string;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const RATING_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  excellent: { bg: "bg-green-500/20", text: "text-green-700 dark:text-green-400", border: "border-green-500/30" },
  good: { bg: "bg-blue-500/20", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" },
  average: { bg: "bg-amber-500/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" },
  poor: { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" },
};

const EVENT_TYPE_ICONS: Record<string, typeof Calendar> = {
  festival: PartyPopper,
  holiday: Sparkles,
  sports: Users,
  cultural: Sparkles,
  music: Sparkles,
};

const getWeatherIcon = (desc: string | null) => {
  if (!desc) return Sun;
  const lower = desc.toLowerCase();
  if (lower.includes("rain") || lower.includes("wet")) return CloudRain;
  if (lower.includes("snow") || lower.includes("cold") || lower.includes("winter")) return Snowflake;
  if (lower.includes("cloud") || lower.includes("overcast")) return Cloud;
  return Sun;
};

export function DestinationCalendar({ cityName, country }: DestinationCalendarProps) {
  const { data, isLoading, error } = useQuery<CalendarData>({
    queryKey: ["/api/travelpulse/destination-calendar", cityName, country],
    queryFn: async () => {
      const res = await fetch(`/api/travelpulse/destination-calendar/${encodeURIComponent(cityName)}/${encodeURIComponent(country)}`);
      if (!res.ok) throw new Error("Failed to fetch calendar data");
      return res.json();
    },
    enabled: !!cityName && !!country,
  });

  if (isLoading) {
    return (
      <Card data-testid="calendar-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Destination Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="calendar-error">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Destination Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Calendar data not available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const { seasons, events, bestTimeToVisit, lastUpdated } = data;

  const seasonsByMonth = seasons.reduce((acc, season) => {
    acc[season.month] = season;
    return acc;
  }, {} as Record<number, DestinationSeason>);

  const eventsByMonth = events.reduce((acc, event) => {
    const month = event.startMonth || 1;
    if (!acc[month]) acc[month] = [];
    acc[month].push(event);
    return acc;
  }, {} as Record<number, DestinationEvent[]>);

  const currentMonth = new Date().getMonth() + 1;

  return (
    <Card data-testid="destination-calendar">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Destination Calendar
          </CardTitle>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Updated {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
            </span>
          )}
        </div>
        {bestTimeToVisit && (
          <p className="text-xs text-muted-foreground mt-1">
            <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
            Best time: {bestTimeToVisit}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5" data-testid="calendar-grid">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const season = seasonsByMonth[month];
            const monthEvents = eventsByMonth[month] || [];
            const rating = season?.rating || "average";
            const colors = RATING_COLORS[rating] || RATING_COLORS.average;
            const WeatherIcon = getWeatherIcon(season?.weatherDescription || null);
            const isCurrentMonth = month === currentMonth;

            return (
              <div
                key={month}
                className={`
                  relative p-2 rounded-lg border transition-all
                  ${colors.bg} ${colors.border}
                  ${isCurrentMonth ? "ring-2 ring-primary ring-offset-1" : ""}
                  hover:scale-105 cursor-default
                `}
                data-testid={`calendar-month-${month}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${colors.text}`}>
                    {MONTH_NAMES[month - 1]}
                  </span>
                  <WeatherIcon className={`h-3 w-3 ${colors.text}`} />
                </div>

                <Badge
                  variant="outline"
                  className={`text-[10px] px-1 py-0 ${colors.text} ${colors.border} capitalize`}
                >
                  {rating}
                </Badge>

                {season?.crowdLevel && (
                  <div className="flex items-center gap-0.5 mt-1">
                    <Users className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground capitalize">
                      {season.crowdLevel}
                    </span>
                  </div>
                )}

                {season?.priceLevel && (
                  <div className="flex items-center gap-0.5">
                    <DollarSign className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground capitalize">
                      {season.priceLevel}
                    </span>
                  </div>
                )}

                {monthEvents.length > 0 && (
                  <div className="absolute -top-1 -right-1">
                    <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-primary">
                      {monthEvents.length}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {events.length > 0 && (
          <div className="mt-4 border-t pt-3" data-testid="calendar-events">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <PartyPopper className="h-3 w-3" />
              Upcoming Events & Festivals
            </h4>
            <div className="space-y-2">
              {events.slice(0, 5).map((event) => {
                const EventIcon = EVENT_TYPE_ICONS[event.eventType || ""] || PartyPopper;
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                    data-testid={`calendar-event-${event.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <EventIcon className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{event.title}</p>
                        {event.startMonth && (
                          <p className="text-xs text-muted-foreground">
                            {FULL_MONTH_NAMES[event.startMonth - 1]}
                            {event.endMonth && event.endMonth !== event.startMonth && (
                              <> - {FULL_MONTH_NAMES[event.endMonth - 1]}</>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {event.seasonRating && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {event.seasonRating}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs capitalize">
                        {event.eventType}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground" data-testid="calendar-legend">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500/50" />
            <span>Excellent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500/50" />
            <span>Good</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500/50" />
            <span>Average</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500/50" />
            <span>Poor</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
