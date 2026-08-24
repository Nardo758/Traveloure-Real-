import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plane,
  Hotel,
  Heart,
  Camera,
  Clock,
  AlertTriangle,
  CheckCircle,
  Users,
  Zap,
  MapPin,
  Info,
  Calendar,
} from "lucide-react";

interface ConstraintData {
  trip: {
    id: string;
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    eventType: string;
  };
  anchors: Array<{
    id: string;
    anchorType: string;
    anchorDatetime: string;
    bufferBefore: number;
    bufferAfter: number;
    isImmovable: boolean;
    description: string;
    location: string;
  }>;
  dayBoundaries: Array<{
    dayNumber: number;
    latestActivityEnd: string;
    earliestActivityStart: string;
    mustReturnToHotel: boolean;
    relocationRequired: boolean;
    transitDurationMinutes: number;
    reason: string;
  }>;
  energyTracking: Array<{
    dayNumber: number;
    startingEnergy: number;
    endingEnergy: number;
    recoveryNeeded: boolean;
  }>;
  vendorCoordination: Array<{
    id: string;
    vendorName: string;
    vendorCategory: string;
    status: string;
    arrivalTime: string;
    serviceDate: string;
  }>;
  optimizationTips: Array<{ tip: string; severity: "info" | "warning" | "critical" }>;
  summary: {
    totalAnchors: number;
    immovableAnchors: number;
    confirmedVendors: number;
    pendingVendors: number;
    warningCount: number;
  };
}

const ANCHOR_ICONS: Record<string, typeof Clock> = {
  flight_arrival: Plane,
  flight_departure: Plane,
  hotel_checkin: Hotel,
  hotel_checkout: Hotel,
  ceremony_time: Heart,
  proposal_moment: Heart,
  photographer_arrival: Camera,
  dinner_reservation: Calendar,
  meeting_time: Users,
};

interface ExpertConstraintDashboardProps {
  tripId: string;
}

export function ExpertConstraintDashboard({ tripId }: ExpertConstraintDashboardProps) {
  const { data, isLoading, error } = useQuery<ConstraintData>({
    queryKey: [`/api/expert/trips/${tripId}/constraints`],
    enabled: !!tripId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading client constraints...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-500">
          Failed to load constraint data
        </CardContent>
      </Card>
    );
  }

  const { trip, anchors, dayBoundaries, energyTracking, vendorCoordination, optimizationTips, summary } = data;

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{trip.title || trip.destination}</CardTitle>
              <CardDescription>
                {trip.destination} &middot; {trip.eventType || "Travel"} &middot;{" "}
                {trip.startDate} to {trip.endDate}
              </CardDescription>
            </div>
            {summary.warningCount > 0 ? (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.warningCount} warning{summary.warningCount !== 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                All validated
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center p-2 bg-muted/50 rounded">
              <div className="text-2xl font-bold">{summary.totalAnchors}</div>
              <div className="text-muted-foreground">Anchors</div>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded">
              <div className="text-2xl font-bold">{summary.immovableAnchors}</div>
              <div className="text-muted-foreground">Immovable</div>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded">
              <div className="text-2xl font-bold text-green-600">{summary.confirmedVendors}</div>
              <div className="text-muted-foreground">Vendors OK</div>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded">
              <div className="text-2xl font-bold text-amber-600">{summary.pendingVendors}</div>
              <div className="text-muted-foreground">Pending</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optimization Tips */}
      {optimizationTips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Optimization Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {optimizationTips.map((tip, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-2 rounded text-sm ${
                  tip.severity === "critical"
                    ? "bg-red-50 text-red-800"
                    : tip.severity === "warning"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-blue-50 text-blue-800"
                }`}
              >
                {tip.severity === "critical" ? (
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-red-600" />
                ) : tip.severity === "warning" ? (
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-600" />
                ) : (
                  <Info className="h-3.5 w-3.5 mt-0.5 text-blue-600" />
                )}
                <span>{tip.tip}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Temporal Anchors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Temporal Anchors ({anchors.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[350px]">
            <div className="space-y-3">
              {anchors.map((anchor) => {
                const Icon = ANCHOR_ICONS[anchor.anchorType] || Clock;
                const dt = new Date(anchor.anchorDatetime);
                const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const dateStr = dt.toLocaleDateString([], { month: "short", day: "numeric" });

                return (
                  <div key={anchor.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${anchor.isImmovable ? "text-red-600" : "text-blue-600"}`} />
                        <span className="font-medium text-sm">
                          {anchor.anchorType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </span>
                        {anchor.isImmovable && (
                          <Badge variant="destructive" className="text-[10px] h-4">IMMOVABLE</Badge>
                        )}
                      </div>
                      <span className="text-sm font-mono">{dateStr} {timeStr}</span>
                    </div>
                    {anchor.description && (
                      <p className="text-xs text-muted-foreground mt-1">{anchor.description}</p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {anchor.bufferBefore > 0 && <span>{anchor.bufferBefore}min before</span>}
                      {anchor.bufferAfter > 0 && <span>{anchor.bufferAfter}min after</span>}
                      {anchor.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{anchor.location}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Energy Budget */}
      {energyTracking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Energy Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {energyTracking.map((day) => {
                const pct = Math.max(0, Math.min(100, day.endingEnergy || 0));
                const color = pct >= 60 ? "bg-green-500" : pct >= 30 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={day.dayNumber} className="flex items-center gap-3">
                    <span className="text-xs w-12 text-muted-foreground">Day {day.dayNumber}</span>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs w-8 text-right">{pct}</span>
                    {day.recoveryNeeded && (
                      <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">REST</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day Boundaries */}
      {dayBoundaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Day Boundaries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dayBoundaries.map((b, i) => (
                <div key={i} className="text-sm border rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Day {b.dayNumber}</span>
                    <div className="flex gap-2 text-xs">
                      {b.earliestActivityStart && (
                        <Badge variant="outline">Start: {b.earliestActivityStart}</Badge>
                      )}
                      {b.latestActivityEnd && (
                        <Badge variant="outline">End: {b.latestActivityEnd}</Badge>
                      )}
                    </div>
                  </div>
                  {b.relocationRequired && (
                    <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Hotel relocation &middot; {b.transitDurationMinutes}min transit
                    </div>
                  )}
                  {b.reason && <p className="text-xs text-muted-foreground mt-1">{b.reason}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
