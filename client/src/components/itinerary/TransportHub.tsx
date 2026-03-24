/**
 * TransportHub Component
 *
 * Main interface for viewing and booking transport options
 * Displays:
 * - Summary cards (total legs, booked, cost, time)
 * - Days with transport legs and booking options
 * - Multi-day pass recommendations
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  MapPin,
  DollarSign,
  Zap,
  ExternalLink,
  Train,
  Bus,
  Ship,
  Car,
  Bike,
  Plane,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransportBookingCard } from "./TransportBookingCard";
import { MultiDayPassCard } from "./MultiDayPassCard";

interface TransportHubProps {
  tripId: string;
  destination?: string;
  readOnly?: boolean;
}

interface TransportHubData {
  summary: {
    totalLegs: number;
    bookedLegs: number;
    estimatedCostRange: { low: number; high: number };
    totalTravelMinutes: number;
    preferences: {
      priority: string;
      maxWalkMinutes: number;
      avoidModes: string[];
    };
  };
  days: Array<{
    dayNumber: number;
    legs: Array<{
      id: string;
      legOrder: number;
      fromName: string;
      toName: string;
      distanceDisplay: string;
      recommendedMode: string;
      userSelectedMode: string | null;
      estimatedDurationMinutes: number;
      estimatedCostUsd: number | null;
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
      bookingOptions: any[];
    }>;
  }>;
  multiDayPasses: any[];
}

export function TransportHub({ tripId, destination = "", readOnly = false }: TransportHubProps) {
  const [activeDay, setActiveDay] = useState<number | null>(null);

  // Fetch transport hub data
  const { data, isLoading, error } = useQuery<TransportHubData>({
    queryKey: ["/api/itinerary", tripId, "transport-hub"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/itinerary/${tripId}/transport-hub`);
      return res.json();
    },
  });

  // Set first day as active
  useEffect(() => {
    if (data?.days && data.days.length > 0 && activeDay === null) {
      setActiveDay(data.days[0].dayNumber);
    }
  }, [data, activeDay]);

  if (isLoading) {
    return <TransportHubSkeleton />;
  }

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load transport options</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.summary.totalLegs === 0) {
    const dest = destination?.split(",")[0]?.trim() || "";
    const twelveGoUrl = dest
      ? `https://12go.co/en?affiliate_id=13805109&q=${encodeURIComponent(dest)}`
      : "https://12go.co/en?affiliate_id=13805109";

    const partners = [
      {
        name: "12Go",
        tagline: "Trains, buses & ferries",
        description: "Book ground transport across Asia, Europe & more. Instant confirmation.",
        url: twelveGoUrl,
        color: "from-blue-500 to-indigo-600",
        icon: Train,
        badge: "Most Popular",
      },
      {
        name: "Uber",
        tagline: "Rideshare & taxis",
        description: "On-demand rides in 70+ countries. Airport transfers, city rides.",
        url: "https://www.uber.com",
        color: "from-gray-800 to-black",
        icon: Car,
        badge: null,
      },
      {
        name: "Viator",
        tagline: "Tours with transport",
        description: "Day trips, excursions & activities with transport included.",
        url: dest
          ? `https://www.viator.com/search/${encodeURIComponent(dest)}?pid=P00049487`
          : "https://www.viator.com?pid=P00049487",
        color: "from-emerald-500 to-teal-600",
        icon: MapPin,
        badge: null,
      },
    ];

    const modes = [
      { label: "Train", icon: Train, url: twelveGoUrl },
      { label: "Bus", icon: Bus, url: twelveGoUrl },
      { label: "Ferry", icon: Ship, url: twelveGoUrl },
      { label: "Taxi", icon: Car, url: "https://www.uber.com" },
      { label: "Bicycle", icon: Bike, url: "https://www.google.com/maps" },
      { label: "Flight", icon: Plane, url: "https://www.skyscanner.com" },
    ];

    return (
      <div className="space-y-8">
        {/* Partner booking cards */}
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Book Your Transport</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {partners.map((p) => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
                data-testid={`link-transport-partner-${p.name.toLowerCase()}`}
              >
                <Card className="h-full border border-gray-200 dark:border-gray-700 hover:border-[#FF385C] hover:shadow-md transition-all duration-200 overflow-hidden">
                  <div className={`h-2 bg-gradient-to-r ${p.color}`} />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md bg-gradient-to-r ${p.color}`}>
                          <p.icon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900 dark:text-white">{p.name}</span>
                            {p.badge && (
                              <Badge className="bg-[#FF385C] text-white text-[10px] px-1.5 py-0">{p.badge}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{p.tagline}</p>
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#FF385C] transition-colors mt-0.5 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{p.description}</p>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </div>

        {/* Transport mode grid */}
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Browse by Mode</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {modes.map((m) => (
              <a
                key={m.label}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
                data-testid={`link-transport-mode-${m.label.toLowerCase()}`}
              >
                <Card className="border border-gray-200 dark:border-gray-700 hover:border-[#FF385C] hover:shadow-sm transition-all duration-200">
                  <CardContent className="p-3 flex flex-col items-center gap-2">
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-[#FFE3E8] dark:group-hover:bg-[#FF385C]/20 transition-colors">
                      <m.icon className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-[#FF385C] transition-colors" />
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{m.label}</span>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </div>

        {/* Tips section */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Travelling in Asia?</p>
              <p className="text-xs text-gray-500 mt-0.5">12Go has the best coverage for trains, buses & ferries across Southeast and East Asia.</p>
            </div>
            <a href={twelveGoUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350] text-white whitespace-nowrap">
                Search Routes <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, days, multiDayPasses } = data;
  const activeDayData = days.find(d => d.dayNumber === activeDay);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Zap className="h-4 w-4" />}
          label="Total Legs"
          value={summary.totalLegs.toString()}
          color="blue"
        />
        <SummaryCard
          icon={<Badge className="h-4 w-4 bg-green-100 text-green-700 text-xs p-0.5">✓</Badge>}
          label="Booked"
          value={`${summary.bookedLegs}/${summary.totalLegs}`}
          color="green"
        />
        <SummaryCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Est. Cost"
          value={`$${summary.estimatedCostRange.low.toFixed(0)}-${summary.estimatedCostRange.high.toFixed(0)}`}
          color="amber"
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" />}
          label="Total Travel"
          value={`${summary.totalTravelMinutes}h`}
          description={`${Math.round(summary.totalTravelMinutes / 60)}h ${summary.totalTravelMinutes % 60}m`}
          color="purple"
        />
      </div>

      {/* Transport Preferences */}
      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transport Preferences</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Priority:</span>
              <Badge variant="outline" className="capitalize">{summary.preferences.priority}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Max Walk:</span>
              <span className="font-medium">{summary.preferences.maxWalkMinutes} min</span>
            </div>
            {summary.preferences.avoidModes.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avoid:</span>
                <div className="flex gap-1">
                  {summary.preferences.avoidModes.map(mode => (
                    <Badge key={mode} variant="secondary" className="text-xs">{mode}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Days with Transport Legs */}
      {days.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Transport Options by Day</h3>

          {days.length > 1 && (
            <Tabs
              value={activeDay?.toString() || ""}
              onValueChange={(val) => setActiveDay(parseInt(val))}
              className="w-full"
            >
              <TabsList className="w-full justify-start overflow-x-auto">
                {days.map(day => (
                  <TabsTrigger key={day.dayNumber} value={day.dayNumber.toString()}>
                    Day {day.dayNumber}
                  </TabsTrigger>
                ))}
              </TabsList>

              {days.map(day => (
                <TabsContent key={day.dayNumber} value={day.dayNumber.toString()}>
                  <DayTransportLegs day={day} readOnly={readOnly} />
                </TabsContent>
              ))}
            </Tabs>
          )}

          {days.length === 1 && <DayTransportLegs day={days[0]} readOnly={readOnly} />}
        </div>
      )}

      {/* Multi-Day Passes */}
      {multiDayPasses.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Travel Passes</h3>
          <div className="grid gap-3">
            {multiDayPasses.map(pass => (
              <MultiDayPassCard key={pass.id} pass={pass} readOnly={readOnly} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {days.length === 0 && multiDayPasses.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              No transport options available yet. Your transport options will appear after optimization.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Transport legs for a single day
 */
function DayTransportLegs({
  day,
  readOnly,
}: {
  day: TransportHubData["days"][0];
  readOnly?: boolean;
}) {
  if (day.legs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">No transport legs for this day</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {day.legs.map((leg, idx) => (
        <Card key={leg.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{leg.fromName} → {leg.toName}</span>
                </CardTitle>
                <CardDescription className="mt-1">
                  {leg.distanceDisplay} • {leg.estimatedDurationMinutes} min
                </CardDescription>
              </div>
              <Badge variant="outline" className="shrink-0">
                Leg {leg.legOrder}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Current selection */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-sm font-medium mb-2">Selected Mode</div>
              <Badge className="bg-primary text-white">
                {leg.userSelectedMode || leg.recommendedMode}
              </Badge>
              {leg.estimatedCostUsd && (
                <div className="text-sm text-muted-foreground mt-2">
                  ${leg.estimatedCostUsd.toFixed(0)}
                </div>
              )}
            </div>

            {/* Booking options */}
            {leg.bookingOptions.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">Booking Options</div>
                {leg.bookingOptions.map(option => (
                  <TransportBookingCard
                    key={option.id}
                    option={option}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No booking options available</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Summary card component
 */
function SummaryCard({
  icon,
  label,
  value,
  description,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description?: string;
  color?: string;
}) {
  const colorClasses = {
    blue: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300",
    green: "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300",
    amber: "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300",
    purple: "bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300",
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {description && <p className="text-xs mt-1 opacity-75">{description}</p>}
    </div>
  );
}

/**
 * Loading skeleton
 */
function TransportHubSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg p-4 bg-muted">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    </div>
  );
}
