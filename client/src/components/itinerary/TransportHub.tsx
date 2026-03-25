/**
 * TransportHub Component v3 — Aggregate Overview
 *
 * Summary-only transport dashboard:
 * - Overview stat bar (Total Legs / Booked / Est. Cost / Travel Time)
 * - Mode breakdown row (e.g. "🚃 65% Train • 🚶 20% Walk")
 * - Multi-day pass recommendations
 * - Per-day summary rows (no per-leg editing — that lives in each day's Transport tab)
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  DollarSign,
  Zap,
  CheckCircle2,
  Navigation,
} from "lucide-react";
import { MultiDayPassCard, type MultiDayPass } from "./MultiDayPassCard";
import { TransportBookingCard } from "./TransportBookingCard";
import { TwelveGoTransport } from "@/components/TwelveGoTransport";
import {
  TRANSPORT_MODE_ICONS,
  TRANSPORT_MODE_LABELS,
  openInMaps,
  detectMapsPlatform,
} from "@/lib/maps-platform";

interface TransportHubProps {
  tripId: string;
  readOnly?: boolean;
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
  externalUrl?: string;
  deepLinkScheme?: string;
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

export function TransportHub({ tripId, readOnly = false }: TransportHubProps) {
  const { data, isLoading, error } = useQuery<TransportHubData>({
    queryKey: ["/api/itinerary", tripId, "transport-hub"],
    queryFn: async () => {
      const res = await fetch(`/api/itinerary/${tripId}/transport-hub`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load transport hub");
      return res.json();
    },
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

  if (!data || data.status === "no_activities" || (data.status !== "calculating" && data.summary.totalLegs === 0)) {
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

      {/* ── Per-day sections with full leg details and booking cards ── */}
      {days.map((day) => {
        const totalMins = day.legs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0);
        return (
          <div key={day.dayNumber} className="space-y-3" data-testid={`transport-day-section-${day.dayNumber}`}>
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span>📅</span> Day {day.dayNumber}
                {day.legs.length > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {day.legs.length} leg{day.legs.length !== 1 ? "s" : ""} · {totalMins} min
                  </Badge>
                )}
              </h3>
            </div>
            <div className="space-y-4">
              {day.legs.map((leg) => (
                <TransportHubLegCard key={leg.id} leg={leg} readOnly={readOnly} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TransportHubLegCard({ leg, readOnly }: { leg: TransportLeg; readOnly: boolean }) {
  const activeMode = leg.userSelectedMode || leg.recommendedMode;
  const modeIcon = TRANSPORT_MODE_ICONS[activeMode] || "🚌";
  const modeLabel = TRANSPORT_MODE_LABELS[activeMode] || activeMode;
  const isTransit = ["transit", "train", "tram", "bus", "ferry"].includes(activeMode);
  const isGround = ["private_driver", "rental_car", "taxi", "rideshare"].includes(activeMode);

  const platformOptions = leg.bookingOptions.filter(o => o.bookingType === "platform");
  const thirdPartyOptions = leg.bookingOptions.filter(o => o.bookingType !== "platform");

  const handleOpenInMaps = () => {
    if (!leg.fromLat || !leg.toLat) return;
    const platform = detectMapsPlatform();
    const googleMode = isTransit ? "transit" : activeMode === "walk" ? "walking" : activeMode === "bike" ? "bicycling" : "driving";
    const url = platform === "apple"
      ? `maps://?saddr=${leg.fromLat},${leg.fromLng}&daddr=${leg.toLat},${leg.toLng}&dirflg=r`
      : `https://www.google.com/maps/dir/?api=1&origin=${leg.fromLat},${leg.fromLng}&destination=${leg.toLat},${leg.toLng}&travelmode=${googleMode}`;
    openInMaps(url);
  };

  return (
    <Card className="border border-gray-200 dark:border-gray-700" data-testid={`hub-leg-${leg.id}`}>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl leading-none">{modeIcon}</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{leg.fromName}</span>
          <span className="text-muted-foreground text-xs">→</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{leg.toName}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{leg.distanceDisplay}</span>
          <span>·</span>
          <span>Recommended: {modeLabel}</span>
          <span>·</span>
          <span>~{leg.estimatedDurationMinutes} min</span>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        {platformOptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform Options</p>
            {platformOptions.map(opt => (
              <TransportBookingCard key={opt.id} option={opt} readOnly={readOnly} />
            ))}
          </div>
        )}

        {thirdPartyOptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Third-Party Options</p>
            {thirdPartyOptions.map(opt => (
              <TransportBookingCard key={opt.id} option={opt} readOnly={readOnly} />
            ))}
          </div>
        )}

        {(isTransit || isGround) && (
          <TwelveGoTransport
            origin={leg.fromName}
            destination={leg.toName}
            variant="compact"
          />
        )}

        {leg.fromLat && leg.toLat && (
          <button
            onClick={handleOpenInMaps}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
            data-testid={`hub-maps-${leg.id}`}
          >
            <Navigation className="h-3 w-3" />
            Open in {detectMapsPlatform() === "apple" ? "Apple Maps" : "Google Maps"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

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
