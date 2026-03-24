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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  MapPin,
  DollarSign,
  Zap,
  CheckCircle2,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransportBookingCard } from "./TransportBookingCard";
import { MultiDayPassCard, type MultiDayPass } from "./MultiDayPassCard";

interface TransportHubProps {
  tripId: string;
  readOnly?: boolean;
}

interface BookingOption {
  id: string;
  bookingType: "platform" | "affiliate" | "deep_link" | "info_only";
  source: string;
  title: string;
  description?: string;
  modeType: string;
  iconType?: string;
  priceDisplay?: string;
  estimatedMinutes?: number;
  rating?: number;
  reviewCount?: number;
  externalUrl?: string;
  deepLinkScheme?: string;
  isRecommended?: boolean;
  bookingStatus?: string;
  isMultiDayPass?: boolean;
}

interface TransportLeg {
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
  bookingOptions: BookingOption[];
}

interface TransportHubData {
  status?: "no_activities" | "calculating" | "ready";
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
    legs: TransportLeg[];
  }>;
  multiDayPasses: MultiDayPass[];
}

export function TransportHub({ tripId, readOnly = false }: TransportHubProps) {
  const [activeDay, setActiveDay] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<TransportHubData>({
    queryKey: ["/api/itinerary", tripId, "transport-hub"],
  });

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
          <p className="text-sm text-destructive">Failed to load transport options. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.status === "no_activities" || data.summary.totalLegs === 0 && data.status !== "calculating") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
        <div className="p-5 rounded-full bg-gray-100 dark:bg-gray-800">
          <Navigation className="w-10 h-10 text-gray-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No transport options yet
          </h3>
          <p className="text-gray-500 max-w-sm text-sm leading-relaxed">
            Add activities to your itinerary to see transport options. Each leg will show personalised booking choices.
          </p>
        </div>
      </div>
    );
  }

  if (data.status === "calculating") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
        <div className="p-5 rounded-full bg-blue-50 dark:bg-blue-900/20">
          <Clock className="w-10 h-10 text-blue-500 animate-pulse" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Calculating transport options…
          </h3>
          <p className="text-gray-500 max-w-sm text-sm leading-relaxed">
            Your itinerary activities are being analysed. Transport booking options will appear shortly.
          </p>
        </div>
      </div>
    );
  }

  const { summary, days, multiDayPasses } = data;
  const activeDayData = days.find(d => d.dayNumber === activeDay);

  const totalHours = Math.floor(summary.totalTravelMinutes / 60);
  const totalMins = summary.totalTravelMinutes % 60;
  const travelTimeDisplay = totalHours > 0
    ? `${totalHours}h ${totalMins > 0 ? `${totalMins}m` : ""}`
    : `${totalMins}m`;

  const costLow = isFinite(summary.estimatedCostRange.low) ? summary.estimatedCostRange.low : 0;
  const costHigh = isFinite(summary.estimatedCostRange.high) ? summary.estimatedCostRange.high : 0;
  const costDisplay = costLow === 0 && costHigh === 0 ? "Free" : `$${costLow.toFixed(0)}–$${costHigh.toFixed(0)}`;

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
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Booked"
          value={`${summary.bookedLegs}/${summary.totalLegs}`}
          color="green"
        />
        <SummaryCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Est. Cost"
          value={costDisplay}
          color="amber"
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" />}
          label="Total Travel"
          value={travelTimeDisplay}
          color="purple"
        />
      </div>

      {/* Transport Preferences row */}
      <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500 dark:text-gray-400">
        <span className="font-medium text-gray-700 dark:text-gray-300">Transport Preferences:</span>
        <Badge variant="outline" className="capitalize">{summary.preferences.priority}</Badge>
        <span>•</span>
        <span>Max walk: {summary.preferences.maxWalkMinutes} min</span>
        {summary.preferences.avoidModes.length > 0 && (
          <>
            <span>•</span>
            <span>Avoid: {summary.preferences.avoidModes.join(", ")}</span>
          </>
        )}
      </div>

      {/* Day Tabs + Legs */}
      {days.length > 0 && (
        <div className="space-y-4">
          {days.length > 1 ? (
            <Tabs
              value={activeDay?.toString() || days[0].dayNumber.toString()}
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
                <TabsContent key={day.dayNumber} value={day.dayNumber.toString()} className="mt-4">
                  <DayTransportLegs day={day} readOnly={readOnly} />
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Day 1</h3>
              <DayTransportLegs day={days[0]} readOnly={readOnly} />
            </>
          )}
        </div>
      )}

      {/* Multi-Day Passes */}
      {multiDayPasses.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Multi-Day Transport Passes</h3>
            <p className="text-sm text-gray-500 mt-0.5">Recommended based on your itinerary</p>
          </div>
          <div className="grid gap-3">
            {multiDayPasses.map(pass => (
              <MultiDayPassCard key={pass.id} pass={pass} readOnly={readOnly} />
            ))}
          </div>
        </div>
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
  day: { dayNumber: number; legs: TransportLeg[] };
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
    <div className="space-y-5">
      {day.legs.map((leg) => (
        <LegCard key={leg.id} leg={leg} readOnly={readOnly} />
      ))}
    </div>
  );
}

/**
 * Single transport leg card with grouped booking options
 */
function LegCard({ leg, readOnly }: { leg: TransportLeg; readOnly?: boolean }) {
  const platformOptions = leg.bookingOptions.filter(o => o.bookingType === "platform");
  const thirdPartyOptions = leg.bookingOptions.filter(
    o => o.bookingType === "affiliate" || o.bookingType === "deep_link" || o.bookingType === "info_only"
  );

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${leg.fromLat},${leg.fromLng}&destination=${leg.toLat},${leg.toLng}`;

  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <span>{getModeEmoji(leg.recommendedMode)}</span>
              <span className="truncate">{leg.fromName} → {leg.toName}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {leg.distanceDisplay && <span>{leg.distanceDisplay} • </span>}
              Recommended: <span className="capitalize font-medium">{leg.recommendedMode.replace(/_/g, " ")}</span>
              {leg.estimatedDurationMinutes > 0 && <span> • ~{leg.estimatedDurationMinutes} min</span>}
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            Leg {leg.legOrder}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Platform options */}
        {platformOptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Platform Options
            </p>
            {platformOptions.map(option => (
              <TransportBookingCard key={option.id} option={option} readOnly={readOnly} />
            ))}
          </div>
        )}

        {/* Third-party options */}
        {thirdPartyOptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Third-Party Options
            </p>
            {thirdPartyOptions.map(option => (
              <TransportBookingCard key={option.id} option={option} readOnly={readOnly} />
            ))}
          </div>
        )}

        {/* No options */}
        {leg.bookingOptions.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No booking options available for this leg</p>
        )}

        {/* Maps link */}
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`link-maps-leg-${leg.id}`}
        >
          <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-500 hover:text-gray-800 px-2">
            <MapPin className="w-3.5 h-3.5 mr-1" />
            Open in Maps
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}

function getModeEmoji(mode: string): string {
  const emojis: Record<string, string> = {
    walk: "🚶",
    transit: "🚇",
    train: "🚄",
    bus: "🚌",
    tram: "🚊",
    taxi: "🚕",
    rideshare: "🚗",
    private_driver: "🚐",
    private_car: "🚙",
    bike: "🚴",
    ferry: "⛴️",
    rental_car: "🚙",
    flight: "✈️",
  };
  return emojis[mode] || "🚌";
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
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300",
    green: "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300",
    amber: "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300",
    purple: "bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300",
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color || "blue"]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold truncate">{value}</div>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg p-4 bg-muted">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
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
