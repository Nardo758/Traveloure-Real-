import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Route,
  Sparkles,
  Plane
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

interface ClaudeRecommendation {
  activity: string;
  from: string;
  recommendedMode: string;
  estimatedTime: number;
  reason: string;
}

interface JourneyLeg {
  from: string;
  to: string;
  legType: 'airport-to-hotel' | 'hotel-to-activity' | 'activity-to-activity' | 'activity-to-hotel' | 'hotel-to-airport';
  recommendedMode: string;
  alternativeMode?: string;
  estimatedTime: number;
  estimatedCost?: { low: number; high: number; currency: string };
  reason: string;
  tips?: string;
}

interface FullItineraryGraph {
  journeyLegs: JourneyLeg[];
  totalEstimatedTransportTime: number;
  totalEstimatedTransportCost: { low: number; high: number; currency: string };
  overallRecommendation: string;
}

interface TransportationAnalysisProps {
  activityLocations: ActivityLocation[];
  hotelLocation?: HotelLocation;
  flightInfo?: { arrivalAirport?: string; departureAirport?: string; arrivalTime?: string; departureTime?: string };
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
  flightInfo,
  className,
  onTransitRoutesLoaded
}: TransportationAnalysisProps) {
  const [expanded, setExpanded] = useState(true);
  const [transitRoutes, setTransitRoutes] = useState<Record<string, TransitRoute | null>>({});
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"routes" | "ai" | "journey">("routes");
  const [aiRecommendations, setAiRecommendations] = useState<ClaudeRecommendation[]>([]);
  const [fullJourneyGraph, setFullJourneyGraph] = useState<FullItineraryGraph | null>(null);
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"time" | "cost">("time");

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

  const claudeMutation = useMutation({
    mutationFn: async () => {
      if (!hotelLocation || activityLocations.length === 0) {
        return { recommendations: [] };
      }
      
      const res = await fetch("/api/claude/transportation-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          hotelLocation: {
            lat: hotelLocation.lat,
            lng: hotelLocation.lng,
            address: hotelLocation.name,
          },
          activityLocations: activityLocations.map(a => ({
            lat: a.lat,
            lng: a.lng,
            address: a.meetingPoint || a.name,
            name: a.name,
          })),
        }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to get AI recommendations");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.recommendations) {
        setAiRecommendations(data.recommendations);
      }
    },
  });

  const fullJourneyMutation = useMutation({
    mutationFn: async () => {
      if (!hotelLocation) {
        return null;
      }
      
      const res = await fetch("/api/claude/full-itinerary-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          flightInfo: flightInfo || {},
          hotelLocation: {
            lat: hotelLocation.lat,
            lng: hotelLocation.lng,
            address: hotelLocation.name,
            name: hotelLocation.name,
          },
          activityLocations: activityLocations.map(a => ({
            lat: a.lat,
            lng: a.lng,
            address: a.meetingPoint || a.name,
            name: a.name,
          })),
        }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to analyze full journey");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      if (data) {
        setFullJourneyGraph(data);
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
    // Clear stale AI data when inputs change
    setAiRecommendations([]);
    setFullJourneyGraph(null);
  }, [hotelKey, activityKey]);

  const modeIcons: Record<string, any> = {
    taxi: Car,
    uber: Car,
    metro: Train,
    subway: Train,
    walk: Footprints,
    bus: Bus,
    "rental car": Car,
    train: Train,
  };

  const filteredAiRecommendations = useMemo(() => {
    let result = [...aiRecommendations];
    
    if (modeFilter !== "all") {
      result = result.filter(r => r.recommendedMode.toLowerCase().includes(modeFilter));
    }
    
    if (sortBy === "time") {
      result.sort((a, b) => a.estimatedTime - b.estimatedTime);
    }
    
    return result;
  }, [aiRecommendations, modeFilter, sortBy]);

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
            Transportation Options
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
                <p className="font-medium">Add a hotel to see transportation options</p>
                <p className="text-amber-700 dark:text-amber-300">We'll show you the best routes to your activities.</p>
              </div>
            </div>
          )}

          {hotelLocation && (
            <>
              <div className="flex items-center gap-2 text-xs bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-md">
                <Hotel className="h-4 w-4 text-indigo-600" />
                <span className="font-medium truncate">{hotelLocation.name}</span>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "routes" | "ai" | "journey")} className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-8">
                  <TabsTrigger value="routes" className="text-xs gap-1" data-testid="tab-routes">
                    <Route className="h-3 w-3" />
                    Routes
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="text-xs gap-1" data-testid="tab-ai-transport">
                    <Sparkles className="h-3 w-3" />
                    AI Tips
                  </TabsTrigger>
                  <TabsTrigger value="journey" className="text-xs gap-1" data-testid="tab-full-journey">
                    <Plane className="h-3 w-3" />
                    Full Trip
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ai" className="mt-2 space-y-3">
                  {!claudeMutation.isPending && aiRecommendations.length === 0 && (
                    <Button
                      onClick={() => claudeMutation.mutate()}
                      className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                      size="sm"
                      data-testid="button-get-ai-transport"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Get AI Transportation Recommendations
                    </Button>
                  )}

                  {claudeMutation.isPending && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Sparkles className="h-3 w-3 animate-pulse" />
                        Analyzing your itinerary...
                      </p>
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  )}

                  {aiRecommendations.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={modeFilter === "all" ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => setModeFilter("all")}
                          data-testid="badge-filter-all"
                        >
                          All
                        </Badge>
                        <Badge
                          variant={modeFilter === "taxi" ? "default" : "outline"}
                          className="cursor-pointer text-xs gap-1"
                          onClick={() => setModeFilter("taxi")}
                          data-testid="badge-filter-taxi"
                        >
                          <Car className="h-3 w-3" /> Taxi/Uber
                        </Badge>
                        <Badge
                          variant={modeFilter === "metro" ? "default" : "outline"}
                          className="cursor-pointer text-xs gap-1"
                          onClick={() => setModeFilter("metro")}
                          data-testid="badge-filter-metro"
                        >
                          <Train className="h-3 w-3" /> Metro
                        </Badge>
                        <Badge
                          variant={modeFilter === "walk" ? "default" : "outline"}
                          className="cursor-pointer text-xs gap-1"
                          onClick={() => setModeFilter("walk")}
                          data-testid="badge-filter-walk"
                        >
                          <Footprints className="h-3 w-3" /> Walk
                        </Badge>
                        <Badge
                          variant={modeFilter === "bus" ? "default" : "outline"}
                          className="cursor-pointer text-xs gap-1"
                          onClick={() => setModeFilter("bus")}
                          data-testid="badge-filter-bus"
                        >
                          <Bus className="h-3 w-3" /> Bus
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        {filteredAiRecommendations.map((rec, idx) => {
                          const ModeIcon = modeIcons[rec.recommendedMode.toLowerCase()] || Car;
                          return (
                            <div 
                              key={idx}
                              className="bg-white dark:bg-gray-800 rounded-md border p-3 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <Palmtree className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{rec.activity}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge className="gap-1 text-xs bg-purple-600">
                                    <ModeIcon className="h-3 w-3" />
                                    {rec.recommendedMode}
                                  </Badge>
                                  <Badge variant="secondary" className="gap-1 text-xs">
                                    <Clock className="h-3 w-3" />
                                    {rec.estimatedTime} min
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground italic">
                                {rec.reason}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {flightInfo?.arrivalAirport && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800 p-3 space-y-1">
                          <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
                            <Plane className="h-3 w-3" />
                            Airport Transfer
                          </div>
                          <p className="text-xs text-muted-foreground">
                            From {flightInfo.arrivalAirport} to your hotel - Consider taxi, rideshare, or airport shuttle for convenience.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {claudeMutation.isError && (
                    <div className="flex items-start gap-2 text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-2 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Couldn't get AI recommendations</p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-auto p-0 text-xs text-red-700 underline"
                          onClick={() => claudeMutation.mutate()}
                        >
                          Try again
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="routes" className="mt-2 space-y-2">
                  {transitMutation.isPending && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Loading transit routes...</p>
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  )}

                  {hasActivities && activityData.length > 0 && !transitMutation.isPending && (
                    <div className="space-y-2">
                      {activityData.map(({ activity, straightDistance, transitRoute }) => {
                        const isExpanded = expandedRoutes.has(activity.id);
                        
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

                  {!hasActivities && (
                    <p className="text-xs text-muted-foreground">
                      Add activities to see transit directions from your hotel.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="journey" className="mt-2 space-y-3">
                  {!fullJourneyMutation.isPending && !fullJourneyGraph && (
                    <Button
                      onClick={() => fullJourneyMutation.mutate()}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50"
                      size="sm"
                      disabled={!hasActivities}
                      data-testid="button-analyze-journey"
                    >
                      <Plane className="h-3 w-3 mr-1" />
                      {hasActivities ? "Analyze Full Trip Transportation" : "Add activities to analyze"}
                    </Button>
                  )}

                  {fullJourneyMutation.isPending && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Plane className="h-3 w-3 animate-pulse" />
                        Analyzing your complete journey...
                      </p>
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  )}

                  {fullJourneyGraph && (
                    <>
                      <div className="bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-md p-3 space-y-2">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          {fullJourneyGraph.overallRecommendation}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-blue-700 dark:text-blue-300">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            ~{Math.round(fullJourneyGraph.totalEstimatedTransportTime / 60)}h {fullJourneyGraph.totalEstimatedTransportTime % 60}m total travel
                          </span>
                          {fullJourneyGraph.totalEstimatedTransportCost && (
                            <span className="flex items-center gap-1">
                              ${fullJourneyGraph.totalEstimatedTransportCost.low}-${fullJourneyGraph.totalEstimatedTransportCost.high}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {fullJourneyGraph.journeyLegs.map((leg, idx) => {
                          const ModeIcon = modeIcons[leg.recommendedMode.toLowerCase()] || Car;
                          const legTypeColors: Record<string, string> = {
                            'airport-to-hotel': 'bg-blue-500',
                            'hotel-to-activity': 'bg-green-500',
                            'activity-to-activity': 'bg-amber-500',
                            'activity-to-hotel': 'bg-purple-500',
                            'hotel-to-airport': 'bg-red-500',
                          };
                          const legColor = legTypeColors[leg.legType] || 'bg-gray-500';

                          return (
                            <div 
                              key={idx}
                              className="bg-white dark:bg-gray-800 rounded-md border p-3 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${legColor}`} />
                                  <div className="text-xs">
                                    <span className="font-medium">{leg.from}</span>
                                    <ArrowRight className="h-3 w-3 inline mx-1 text-muted-foreground" />
                                    <span className="font-medium">{leg.to}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge className="gap-1 text-xs bg-blue-600">
                                    <ModeIcon className="h-3 w-3" />
                                    {leg.recommendedMode}
                                  </Badge>
                                  <Badge variant="secondary" className="gap-1 text-xs">
                                    <Clock className="h-3 w-3" />
                                    {leg.estimatedTime} min
                                  </Badge>
                                </div>
                              </div>
                              
                              <p className="text-xs text-muted-foreground">
                                {leg.reason}
                              </p>
                              
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                {leg.estimatedCost && (
                                  <span>${leg.estimatedCost.low}-${leg.estimatedCost.high}</span>
                                )}
                                {leg.alternativeMode && (
                                  <span>Alt: {leg.alternativeMode}</span>
                                )}
                              </div>
                              
                              {leg.tips && (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 italic">
                                  Tip: {leg.tips}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {fullJourneyMutation.isError && (
                    <div className="flex items-start gap-2 text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-2 rounded-md">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Couldn't analyze full journey</p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-auto p-0 text-xs text-red-700 underline"
                          onClick={() => fullJourneyMutation.mutate()}
                        >
                          Try again
                        </Button>
                      </div>
                    </div>
                  )}

                  {!hasActivities && (
                    <p className="text-xs text-muted-foreground">
                      Add activities to analyze your full trip transportation.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}

          {!hotelLocation && !hasActivities && (
            <p className="text-xs text-muted-foreground">
              Add a hotel and activities to see transportation options.
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
