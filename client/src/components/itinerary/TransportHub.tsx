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
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransportBookingCard } from "./TransportBookingCard";
import { MultiDayPassCard } from "./MultiDayPassCard";

interface TransportHubProps {
  tripId: string;
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

export function TransportHub({ tripId, readOnly = false }: TransportHubProps) {
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
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
        <div className="p-5 rounded-full bg-gray-100 dark:bg-gray-800">
          <MapPin className="w-10 h-10 text-gray-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No transport bookings yet</h3>
          <p className="text-gray-500 max-w-md text-sm">
            Run AI Optimization to generate itinerary variants — selecting a variant will automatically calculate transport legs between all your locations, with booking options.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            className="bg-[#FF385C] hover:bg-[#E23350] text-white"
            onClick={() => window.location.href = `/itinerary-comparison/${tripId}`}
            data-testid="button-run-optimization-hub"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Run AI Optimization
          </Button>
          <a
            href="https://12go.co/en?affiliate_id=13805109"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">
              <ExternalLink className="w-4 h-4 mr-2" />
              Browse 12Go Transport
            </Button>
          </a>
        </div>
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
