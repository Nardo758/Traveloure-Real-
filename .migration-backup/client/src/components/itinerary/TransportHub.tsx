/**
 * TransportHub Component v3 — Aggregate Overview
 *
 * Summary-only transport dashboard:
 * - Overview stat bar (Total Legs / Booked / Est. Cost / Travel Time)
 * - Mode breakdown row (e.g. "🚃 65% Train • 🚶 20% Walk")
 * - Multi-day pass recommendations
 * - Per-day summary rows (no per-leg editing — that lives in each day's Transport tab)
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  DollarSign,
  Zap,
  Train,
  ArrowRight,
  CheckCircle2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useContentAgentBooking } from "@/hooks/use-content-agent-booking";
import { MultiDayPassCard, type MultiDayPass } from "./MultiDayPassCard";

const TRANSPORT_MODE_ICONS: Record<string, string> = {
  walking: "🚶", walk: "🚶",
  train: "🚆", rail: "🚆",
  bus: "🚌",
  ferry: "⛴️", boat: "⛴️",
  taxi: "🚕",
  rideshare: "🚗", car: "🚗", drive: "🚗",
  flight: "✈️", plane: "✈️",
  subway: "🚇", metro: "🚇",
  transit: "🚌",
  bicycle: "🚲", bike: "🚲",
};

const TRANSPORT_MODE_LABELS: Record<string, string> = {
  walking: "Walk", walk: "Walk",
  train: "Train", rail: "Train",
  bus: "Bus",
  ferry: "Ferry", boat: "Ferry",
  taxi: "Taxi",
  rideshare: "Rideshare", car: "Drive", drive: "Drive",
  flight: "Flight", plane: "Flight",
  subway: "Subway", metro: "Metro",
  transit: "Transit",
  bicycle: "Bicycle", bike: "Bicycle",
};

interface TransportHubProps {
  tripId: string;
  destination?: string;
  readOnly?: boolean;
  onNavigateToDay?: (dayNumber: number) => void;
}

interface ModeBreakdownItem {
  mode: string;
  count: number;
  percent: number;
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
  /** §16: the server never ships externalUrl — only whether a bookable link exists. */
  hasBookingLink?: boolean;
  isRecommended?: boolean;
  bookingStatus?: string;
  confirmationRef?: string | null;
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
  alternativeModes?: Array<{
    mode: string;
    durationMinutes: number;
    costUsd: number | null;
    energyCost: number;
    reason: string;
  }>;
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
    modeBreakdown?: ModeBreakdownItem[];
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

export function TransportHub({ tripId, destination = "", readOnly = false, onNavigateToDay }: TransportHubProps) {
  const [activeDay, setActiveDay] = useState<number | null>(null);

  // Fetch transport hub data
  const { data, isLoading, error } = useQuery<TransportHubData>({
    queryKey: ["/api/itinerary", tripId, "transport-hub"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/itinerary/${tripId}/transport-hub`);
      return res.json();
    },
  });

  // §16 booking-agent rail for the empty state's "find transport" hand-off: the server
  // builds the 12Go deep link itself (partnerRoute) — no affiliate URL or affiliate id
  // lives in client code. Hook is called unconditionally (rules of hooks) even though
  // it only renders in the empty state.
  const dest = destination?.split(",")[0]?.trim() || "";
  const findTransportViaAgent = useContentAgentBooking({
    itemName: dest ? `Ground transport in ${dest}` : "Ground transport",
    itemDescription: "Trains, buses, ferries via 12Go Asia",
    partnerName: "12Go Asia",
    partnerCategory: "ground-transport",
    partnerRoute: { partner: "12go", destination: dest || undefined },
  });

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

  if (!data || data.summary.totalLegs === 0) {
    // §16: no raw partner links here — the former hardcoded 12Go/Uber/Viator homepage
    // cards sent travelers off-site with the affiliate id baked into client code. The
    // "find transport" hand-off now routes through the booking-agent rail; the server
    // builds the partner deep link and an agent handles the booking.
    return (
      <div className="space-y-6">
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Train className="w-5 h-5 text-primary" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Book your ground transport
              </p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Trains, buses and ferries{dest ? ` around ${dest}` : ""} — our booking agent finds
              the best option, books it for you, and adds it to your trip.
            </p>
            {findTransportViaAgent.requested ? (
              <div
                className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300"
                data-testid="text-transport-agent-requested"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Request sent — our booking agent will follow up.
              </div>
            ) : (
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white whitespace-nowrap"
                disabled={readOnly || findTransportViaAgent.isPending}
                onClick={findTransportViaAgent.book}
                data-testid="button-find-transport-via-agent"
              >
                <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                {findTransportViaAgent.isPending ? "Sending…" : "Find transport via agent"}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Per-leg transport options appear here automatically once activities with locations are
          added to your itinerary.
        </p>
      </div>
    );
  }

  const { summary, days, multiDayPasses } = data;
  const activeDayData = days.find(d => d.dayNumber === activeDay);

  const { low, high } = summary.estimatedCostRange;
  const costDisplay = low === high ? `$${low}` : `$${low}–$${high}`;
  const totalMins = summary.totalTravelMinutes;
  const travelTimeDisplay = totalMins >= 60
    ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
    : `${totalMins}m`;

  return (
    <div className="space-y-6">
      {/* ── Summary stat bar ── */}
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

      {/* ── Mode breakdown row ── */}
      {summary.modeBreakdown && summary.modeBreakdown.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-sm">
          {summary.modeBreakdown.map((item, i) => (
            <span key={item.mode} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground mx-1">•</span>}
              <span>{TRANSPORT_MODE_ICONS[item.mode] || "🚌"}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {item.percent}% {TRANSPORT_MODE_LABELS[item.mode] || item.mode}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ── Transport preferences ── */}
      <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500 dark:text-gray-400">
        <span className="font-medium text-gray-700 dark:text-gray-300">Preferences:</span>
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

      {/* ── Multi-day passes — TOP (before day sections) ── */}
      {multiDayPasses.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Multi-Day Transport Passes
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">Recommended based on your itinerary</p>
          </div>
          <div className="grid gap-3">
            {multiDayPasses.map((pass) => (
              <MultiDayPassCard key={pass.id} pass={pass} readOnly={readOnly} />
            ))}
          </div>
        </div>
      )}

      {/* ── Per-day summary rows ── */}
      {days.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Per-Day Overview
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Use the Transport tab on each day card for detailed mode selection, booking, and 12Go options
            </p>
          </div>
          <div className="grid gap-2">
            {days.map((day) => {
              const totalMins = day.legs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0);
              const totalCostDay = day.legs.reduce((s, l) => s + (l.estimatedCostUsd || 0), 0);
              const modes = new Set(day.legs.map(l => l.userSelectedMode || l.recommendedMode));
              return (
                <div
                  key={day.dayNumber}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
                  data-testid={`transport-day-summary-${day.dayNumber}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">Day {day.dayNumber}</span>
                    <Badge variant="outline" className="text-xs">
                      {day.legs.length} {day.legs.length === 1 ? "leg" : "legs"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {Array.from(modes).map(m => (
                        <span key={m} title={TRANSPORT_MODE_LABELS[m] || m}>{TRANSPORT_MODE_ICONS[m] || "🚌"}</span>
                      ))}
                    </span>
                    {totalMins > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {totalMins} min
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {totalCostDay === 0 ? "Free" : `$${totalCostDay.toFixed(0)}`}
                    </span>
                    {onNavigateToDay && (
                      <button
                        onClick={() => onNavigateToDay(day.dayNumber)}
                        className="text-primary hover:underline font-medium ml-1"
                        data-testid={`hub-goto-day-${day.dayNumber}`}
                      >
                        View →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  description,
  color,
}: {
  icon: ReactNode;
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
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg p-4 bg-muted">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-5 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    </div>
  );
}
