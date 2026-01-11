import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Car, 
  Train, 
  Footprints, 
  Bus, 
  MapPin, 
  Clock, 
  Navigation,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Hotel,
  Palmtree,
  ArrowRight,
  Route
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  meetingPoint?: string;
}

interface HotelLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface TransitStep {
  mode: "WALK" | "TRANSIT";
  distance: number;
  duration: number;
  durationMinutes: number;
  instruction?: string;
  transit?: {
    lineName: string;
    lineNameShort?: string;
    lineColor?: string;
    lineTextColor?: string;
    vehicleType: string;
    vehicleIcon?: string;
    agencyName: string;
    departureStop: string;
    arrivalStop: string;
    departureTime: string;
    arrivalTime: string;
    headsign: string;
    stopCount: number;
  };
}

interface TransitRoute {
  totalDistance: number;
  totalDuration: number;
  durationText: string;
  distanceText: string;
  polyline?: string;
  steps: TransitStep[];
}

interface TransportationAnalysisProps {
  activityLocations: ActivityLocation[];
  hotelLocation?: HotelLocation;
  className?: string;
  onTransitRoutesLoaded?: (routes: Map<string, TransitRoute | null>) => void;
}

const vehicleIcons: Record<string, any> = {
  BUS: Bus,
  SUBWAY: Train,
  METRO: Train,
  TRAIN: Train,
  LIGHT_RAIL: Train,
  RAIL: Train,
  TRAM: Train,
  FERRY: Route,
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function TransportationAnalysis({ 
  activityLocations, 
  hotelLocation,
  className,
  onTransitRoutesLoaded
}: TransportationAnalysisProps) {
  const [expanded, setExpanded] = useState(true);
  const [transitRoutes, setTransitRoutes] = useState<Record<string, TransitRoute | null>>({});
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

  const activityKey = activityLocations.map(a => `${a.id}:${a.lat},${a.lng}`).join("|");
  const hotelKey = hotelLocation ? `${hotelLocation.id}:${hotelLocation.lat},${hotelLocation.lng}` : "";
  const requestKeyRef = useRef<string>("");
  const currentRequestKey = `${hotelKey}|${activityKey}`;

  const transitMutation = useMutation({
    mutationFn: async (): Promise<{ routes: Record<string, TransitRoute | null>; requestKey: string }> => {
      const reqKey = currentRequestKey;
      requestKeyRef.current = reqKey;
      
      if (!hotelLocation || activityLocations.length === 0) {
        return { routes: {}, requestKey: reqKey };
      }
      
      const res = await fetch("/api/routes/transit-multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          origin: {
            lat: hotelLocation.lat,
            lng: hotelLocation.lng,
            name: hotelLocation.name,
          },
          destinations: activityLocations.map(a => ({
            id: a.id,
            lat: a.lat,
            lng: a.lng,
            name: a.name,
          })),
        }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to fetch transit routes");
      }
      
      const data = await res.json();
      return { ...data, requestKey: reqKey };
    },
    onSuccess: (data) => {
      if (data.requestKey !== requestKeyRef.current) {
        return;
      }
      
      if (data?.routes) {
        setTransitRoutes(data.routes);
        if (onTransitRoutesLoaded) {
          const routeMap = new Map<string, TransitRoute | null>();
          Object.entries(data.routes).forEach(([id, route]) => {
            routeMap.set(id, route);
          });
          onTransitRoutesLoaded(routeMap);
        }
      }
    },
  });

  useEffect(() => {
    if (hotelLocation && activityLocations.length > 0) {
      transitMutation.mutate();
    } else {
      requestKeyRef.current = currentRequestKey;
      setTransitRoutes({});
      if (onTransitRoutesLoaded) {
        onTransitRoutesLoaded(new Map());
      }
    }
  }, [hotelKey, activityKey]);

  const activityData = useMemo(() => {
    if (!hotelLocation) return [];
    
    return activityLocations.map(activity => ({
      activity,
      straightDistance: haversineDistance(hotelLocation.lat, hotelLocation.lng, activity.lat, activity.lng),
      transitRoute: transitRoutes[activity.id] || null,
    })).sort((a, b) => {
      const aDur = a.transitRoute?.totalDuration || Infinity;
      const bDur = b.transitRoute?.totalDuration || Infinity;
      return aDur - bDur;
    });
  }, [activityLocations, hotelLocation, transitRoutes]);

  if (!hotelLocation && activityLocations.length === 0) {
    return null;
  }

  const hasActivities = activityLocations.length > 0;

  const toggleRouteExpanded = (id: string) => {
    setExpandedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Card className={cn("bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border-blue-200 dark:border-blue-800", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-600" />
            Transit Directions
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => setExpanded(!expanded)}
            data-testid="button-toggle-transport"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {!hotelLocation && hasActivities && (
            <div className="flex items-start gap-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 p-2 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Add a hotel to see transit directions</p>
                <p className="text-amber-700 dark:text-amber-300">We'll show you the best routes to your activities.</p>
              </div>
            </div>
          )}

          {hotelLocation && (
            <div className="flex items-center gap-2 text-xs bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-md">
              <Hotel className="h-4 w-4 text-indigo-600" />
              <span className="font-medium truncate">{hotelLocation.name}</span>
            </div>
          )}

          {transitMutation.isPending && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Loading transit routes...</p>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {hotelLocation && hasActivities && activityData.length > 0 && !transitMutation.isPending && (
            <div className="space-y-2">
              {activityData.map(({ activity, straightDistance, transitRoute }) => {
                const isExpanded = expandedRoutes.has(activity.id);
                const hasTransit = transitRoute && transitRoute.steps.some(s => s.mode === "TRANSIT");
                
                return (
                  <div 
                    key={activity.id}
                    className="bg-white dark:bg-gray-800 rounded-md border overflow-hidden"
                  >
                    <button
                      onClick={() => transitRoute && toggleRouteExpanded(activity.id)}
                      className="w-full flex items-start justify-between gap-2 p-2 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-750"
                      disabled={!transitRoute}
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Palmtree className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{activity.name}</p>
                          {activity.meetingPoint && (
                            <p className="text-muted-foreground truncate text-[10px]">{activity.meetingPoint}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {transitRoute ? (
                          <>
                            <Badge variant="default" className="gap-1 text-xs bg-blue-600">
                              <Clock className="h-3 w-3" />
                              {transitRoute.durationText}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {transitRoute.distanceText}
                            </span>
                          </>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <MapPin className="h-3 w-3" />
                            {straightDistance.toFixed(1)} km
                          </Badge>
                        )}
                      </div>
                    </button>
                    
                    {isExpanded && transitRoute && (
                      <div className="border-t px-2 py-2 space-y-1.5 bg-gray-50 dark:bg-gray-850">
                        {transitRoute.steps.map((step, idx) => {
                          if (step.mode === "WALK") {
                            return (
                              <div key={idx} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <Footprints className="h-3 w-3" />
                                <span>Walk {step.durationMinutes} min</span>
                                {step.instruction && <span className="truncate">- {step.instruction}</span>}
                              </div>
                            );
                          }
                          
                          const transit = step.transit!;
                          const VehicleIcon = vehicleIcons[transit.vehicleType] || Bus;
                          
                          return (
                            <div 
                              key={idx} 
                              className="flex items-start gap-2 p-1.5 rounded bg-white dark:bg-gray-800 border text-[10px]"
                            >
                              <div 
                                className="shrink-0 w-5 h-5 rounded flex items-center justify-center"
                                style={{ 
                                  backgroundColor: transit.lineColor || "#3B82F6",
                                  color: transit.lineTextColor || "#FFFFFF"
                                }}
                              >
                                <VehicleIcon className="h-3 w-3" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 font-medium">
                                  <span style={{ color: transit.lineColor }}>{transit.lineNameShort || transit.lineName}</span>
                                  <ArrowRight className="h-2 w-2 text-muted-foreground" />
                                  <span className="truncate text-muted-foreground">{transit.headsign}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span>{transit.departureStop}</span>
                                  <ArrowRight className="h-2 w-2" />
                                  <span>{transit.arrivalStop}</span>
                                  <span className="ml-1">({transit.stopCount} stops)</span>
                                </div>
                              </div>
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                {step.durationMinutes} min
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {transitMutation.isError && (
            <div className="flex items-start gap-2 text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-2 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Couldn't load transit routes</p>
                <p className="text-red-700 dark:text-red-300">Showing straight-line distances instead.</p>
              </div>
            </div>
          )}

          {!hasActivities && hotelLocation && (
            <p className="text-xs text-muted-foreground">
              Add activities to see transit directions from your hotel.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function HotelProximityBadge({ 
  activityLocations, 
  hotelLat, 
  hotelLng 
}: { 
  activityLocations: ActivityLocation[]; 
  hotelLat: number; 
  hotelLng: number;
}) {
  if (activityLocations.length === 0) {
    return null;
  }

  const avgDistance = activityLocations.reduce((sum, activity) => {
    return sum + haversineDistance(hotelLat, hotelLng, activity.lat, activity.lng);
  }, 0) / activityLocations.length;

  let proximityLabel = "Far";
  let variant: "default" | "secondary" | "destructive" | "outline" = "destructive";
  
  if (avgDistance < 2) {
    proximityLabel = "Very Close";
    variant = "default";
  } else if (avgDistance < 5) {
    proximityLabel = "Close";
    variant = "secondary";
  } else if (avgDistance < 10) {
    proximityLabel = "Moderate";
    variant = "outline";
  }

  return (
    <Badge variant={variant} className="gap-1 text-xs">
      <MapPin className="h-3 w-3" />
      {proximityLabel} to Activities ({avgDistance.toFixed(1)} km avg)
    </Badge>
  );
}
