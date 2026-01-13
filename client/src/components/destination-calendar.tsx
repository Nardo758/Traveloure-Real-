import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Calendar, Sun, Cloud, Snowflake, Leaf, MapPin, Sparkles, Users, DollarSign, Info, PartyPopper, Gift, CloudSun, Flower2, Building2, Trophy, Church } from "lucide-react";

interface DestinationEvent {
  id: string;
  country: string;
  city?: string;
  title: string;
  description?: string;
  eventType: string;
  startMonth?: number;
  endMonth?: number;
  specificDate?: string;
  isRecurring: boolean;
  seasonRating?: string;
  highlights: string[];
  tips?: string;
}

interface DestinationSeason {
  id: string;
  country: string;
  city?: string;
  month: number;
  rating: string;
  weatherDescription?: string;
  averageTemp?: string;
  rainfall?: string;
  crowdLevel?: string;
  priceLevel?: string;
  highlights: string[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const SEEDED_COUNTRIES = [
  "Japan", "Italy", "France", "Thailand", "Morocco"
];

const getRatingColor = (rating: string) => {
  switch (rating) {
    case "best": return "bg-emerald-500 text-white";
    case "good": return "bg-amber-400 text-white";
    case "average": return "bg-gray-300 text-gray-700";
    case "avoid": return "bg-red-400 text-white";
    default: return "bg-gray-200 text-gray-600";
  }
};

const getRatingBgLight = (rating: string) => {
  switch (rating) {
    case "best": return "bg-emerald-50 border-emerald-200";
    case "good": return "bg-amber-50 border-amber-200";
    case "average": return "bg-gray-50 border-gray-200";
    case "avoid": return "bg-red-50 border-red-200";
    default: return "bg-white border-gray-200";
  }
};

const getEventTypeIcon = (type: string) => {
  switch (type) {
    case "festival": return <PartyPopper className="w-4 h-4 text-pink-500" />;
    case "holiday": return <Gift className="w-4 h-4 text-red-500" />;
    case "weather": return <CloudSun className="w-4 h-4 text-amber-500" />;
    case "season": return <Flower2 className="w-4 h-4 text-pink-400" />;
    case "cultural": return <Building2 className="w-4 h-4 text-purple-500" />;
    case "sporting": return <Trophy className="w-4 h-4 text-amber-600" />;
    case "religious": return <Church className="w-4 h-4 text-blue-600" />;
    default: return <Calendar className="w-4 h-4 text-gray-500" />;
  }
};

const getSeasonIcon = (month: number) => {
  if (month >= 3 && month <= 5) return <Leaf className="w-4 h-4 text-green-500" />;
  if (month >= 6 && month <= 8) return <Sun className="w-4 h-4 text-amber-500" />;
  if (month >= 9 && month <= 11) return <Leaf className="w-4 h-4 text-orange-500" />;
  return <Snowflake className="w-4 h-4 text-blue-400" />;
};

interface DestinationCalendarProps {
  initialCountry?: string;
  compact?: boolean;
}

export function DestinationCalendar({ initialCountry, compact = false }: DestinationCalendarProps) {
  const [selectedCountry, setSelectedCountry] = useState(initialCountry || "");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const { data: events = [], isLoading: loadingEvents } = useQuery<DestinationEvent[]>({
    queryKey: [`/api/destination-calendar/events?country=${encodeURIComponent(selectedCountry)}`],
    enabled: !!selectedCountry,
  });

  const { data: seasons = [], isLoading: loadingSeasons } = useQuery<DestinationSeason[]>({
    queryKey: [`/api/destination-calendar/seasons?country=${encodeURIComponent(selectedCountry)}`],
    enabled: !!selectedCountry,
  });

  const getMonthRating = (month: number): string => {
    const season = seasons.find(s => s.month === month);
    return season?.rating || "average";
  };

  const getMonthEvents = (month: number): DestinationEvent[] => {
    return events.filter(e => {
      if (e.startMonth && e.endMonth) {
        if (e.startMonth <= e.endMonth) {
          return month >= e.startMonth && month <= e.endMonth;
        } else {
          return month >= e.startMonth || month <= e.endMonth;
        }
      }
      if (e.startMonth) return e.startMonth === month;
      return false;
    });
  };

  const getMonthSeason = (month: number): DestinationSeason | undefined => {
    return seasons.find(s => s.month === month);
  };

  const selectedMonthData = selectedMonth !== null ? getMonthSeason(selectedMonth) : null;
  const selectedMonthEvents = selectedMonth !== null ? getMonthEvents(selectedMonth) : [];

  return (
    <Card className={cn("w-full", compact && "border-0 shadow-none")}>
      <CardHeader className={cn("pb-4", compact && "px-0 pt-0")}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#FF385C]" />
            <CardTitle className="text-lg">When to Visit</CardTitle>
          </div>
          
          <Select value={selectedCountry} onValueChange={(value) => { setSelectedCountry(value); setSelectedMonth(null); }}>
            <SelectTrigger className="w-full sm:w-56" data-testid="select-country">
              <SelectValue placeholder="Select a country" />
            </SelectTrigger>
            <SelectContent>
              {SEEDED_COUNTRIES.map(country => (
                <SelectItem key={country} value={country}>{country}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className={cn(compact && "px-0 pb-0")}>
        {!selectedCountry ? (
          <div className="text-center py-8 text-[#6B7280]">
            <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Select a country to see the best times to visit</p>
          </div>
        ) : loadingEvents || loadingSeasons ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {MONTHS.map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span>Best</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-amber-400" />
                <span>Good</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-gray-300" />
                <span>Average</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-red-400" />
                <span>Avoid</span>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {MONTHS.map((month, idx) => {
                const monthNum = idx + 1;
                const rating = getMonthRating(monthNum);
                const monthEvents = getMonthEvents(monthNum);
                const isSelected = selectedMonth === monthNum;
                
                return (
                  <button
                    key={month}
                    onClick={() => setSelectedMonth(isSelected ? null : monthNum)}
                    className={cn(
                      "relative p-2 rounded-lg border transition-all text-center",
                      getRatingBgLight(rating),
                      isSelected && "ring-2 ring-[#FF385C] ring-offset-1",
                      "hover:shadow-md"
                    )}
                    data-testid={`button-month-${month.toLowerCase()}`}
                  >
                    <div className="flex items-center justify-center mb-1">
                      {getSeasonIcon(monthNum)}
                    </div>
                    <div className="text-xs font-medium">{month}</div>
                    <div className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded mt-1",
                      getRatingColor(rating)
                    )}>
                      {rating}
                    </div>
                    {monthEvents.length > 0 && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF385C] text-white rounded-full text-[10px] flex items-center justify-center">
                        {monthEvents.length}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedMonth !== null && (
              <div className={cn(
                "border rounded-lg p-4",
                getRatingBgLight(getMonthRating(selectedMonth))
              )}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    {getSeasonIcon(selectedMonth)}
                    {FULL_MONTHS[selectedMonth - 1]} in {selectedCountry}
                  </h3>
                  <Badge className={getRatingColor(getMonthRating(selectedMonth))}>
                    {getMonthRating(selectedMonth)} time to visit
                  </Badge>
                </div>

                {selectedMonthData && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {selectedMonthData.averageTemp && (
                      <div className="flex items-center gap-2 text-sm">
                        <Sun className="w-4 h-4 text-amber-500" />
                        <span>{selectedMonthData.averageTemp}</span>
                      </div>
                    )}
                    {selectedMonthData.rainfall && (
                      <div className="flex items-center gap-2 text-sm">
                        <Cloud className="w-4 h-4 text-blue-400" />
                        <span>{selectedMonthData.rainfall}</span>
                      </div>
                    )}
                    {selectedMonthData.crowdLevel && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-purple-500" />
                        <span>{selectedMonthData.crowdLevel} crowds</span>
                      </div>
                    )}
                    {selectedMonthData.priceLevel && (
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="w-4 h-4 text-green-500" />
                        <span>{selectedMonthData.priceLevel} prices</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedMonthData?.weatherDescription && (
                  <p className="text-sm text-[#6B7280] mb-4">
                    {selectedMonthData.weatherDescription}
                  </p>
                )}

                {selectedMonthEvents.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#FF385C]" />
                      Events & Festivals
                    </h4>
                    <div className="space-y-2">
                      {selectedMonthEvents.map(event => (
                        <div key={event.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                          <div className="flex items-start gap-2">
                            <span className="text-lg">{getEventTypeIcon(event.eventType)}</span>
                            <div className="flex-1 min-w-0">
                              <h5 className="font-medium text-sm">{event.title}</h5>
                              {event.description && (
                                <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">{event.description}</p>
                              )}
                              {event.tips && (
                                <div className="flex items-start gap-1.5 mt-2 text-xs text-blue-600 dark:text-blue-400">
                                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>{event.tips}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedMonthEvents.length === 0 && !selectedMonthData && (
                  <div className="text-center py-4 text-[#9CA3AF] text-sm">
                    <Info className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>No detailed information available for this month yet.</p>
                    <p className="text-xs mt-1">Be the first to contribute!</p>
                  </div>
                )}
              </div>
            )}

            {events.length === 0 && seasons.length === 0 && (
              <div className="text-center py-6 text-[#9CA3AF]">
                <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No calendar data available for {selectedCountry} yet.</p>
                <p className="text-xs mt-1">Check back later or contribute information!</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
