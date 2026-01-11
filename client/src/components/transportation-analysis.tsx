import { useState, useEffect } from "react";
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
  DollarSign,
  Navigation,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Hotel,
  Palmtree
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

interface TransportRecommendation {
  activity: string;
  from: string;
  recommendedMode: string;
  estimatedTime: number;
  reason: string;
}

interface TransportationAnalysisProps {
  activityLocations: ActivityLocation[];
  hotelLocation?: HotelLocation;
  className?: string;
}

const modeIcons: Record<string, any> = {
  taxi: Car,
  uber: Car,
  metro: Train,
  walk: Footprints,
  bus: Bus,
  "rental car": Car,
  train: Train,
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
  className 
}: TransportationAnalysisProps) {
  const [expanded, setExpanded] = useState(true);
  const [recommendations, setRecommendations] = useState<TransportRecommendation[]>([]);

  const transportMutation = useMutation({
    mutationFn: async (): Promise<{ recommendations: TransportRecommendation[] }> => {
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
        throw new Error("Failed to analyze transportation");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.recommendations) {
        setRecommendations(data.recommendations);
      }
    },
  });

  const activityKey = activityLocations.map(a => `${a.id}:${a.lat},${a.lng}`).join("|");
  const hotelKey = hotelLocation ? `${hotelLocation.id}:${hotelLocation.lat},${hotelLocation.lng}` : "";

  useEffect(() => {
    if (hotelLocation && activityLocations.length > 0) {
      transportMutation.mutate();
    }
  }, [hotelKey, activityKey]);

  if (!hotelLocation && activityLocations.length === 0) {
    return null;
  }

  const hasActivitiesWithCoords = activityLocations.length > 0;

  const basicDistances = hasActivitiesWithCoords && hotelLocation
    ? activityLocations.map(activity => ({
        activity,
        distance: haversineDistance(hotelLocation.lat, hotelLocation.lng, activity.lat, activity.lng),
      })).sort((a, b) => a.distance - b.distance)
    : [];

  return (
    <Card className={cn("bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border-blue-200 dark:border-blue-800", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-600" />
            Transportation Overview
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
          {!hotelLocation && hasActivitiesWithCoords && (
            <div className="flex items-start gap-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 p-2 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Add a hotel to see transportation recommendations</p>
                <p className="text-amber-700 dark:text-amber-300">We'll help you find the best way to get to your activities.</p>
              </div>
            </div>
          )}

          {hotelLocation && (
            <div className="flex items-center gap-2 text-xs bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-md">
              <Hotel className="h-4 w-4 text-indigo-600" />
              <span className="font-medium">Hotel: {hotelLocation.name}</span>
            </div>
          )}

          {hasActivitiesWithCoords && hotelLocation && basicDistances.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Distance from hotel:</p>
              {basicDistances.map(({ activity, distance }) => {
                const rec = recommendations.find(r => 
                  r.activity.toLowerCase().includes(activity.name.toLowerCase().slice(0, 20)) ||
                  activity.name.toLowerCase().includes(r.activity.toLowerCase().slice(0, 20))
                );
                const ModeIcon = rec ? modeIcons[rec.recommendedMode.toLowerCase()] || Car : MapPin;
                
                return (
                  <div 
                    key={activity.id}
                    className="flex items-start justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded-md border text-xs"
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Palmtree className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{activity.name}</p>
                        {activity.meetingPoint && (
                          <p className="text-muted-foreground truncate">{activity.meetingPoint}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="gap-1 text-xs">
                        <MapPin className="h-3 w-3" />
                        {distance.toFixed(1)} km
                      </Badge>
                      {rec && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <ModeIcon className="h-3 w-3" />
                          {rec.estimatedTime} min
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {transportMutation.isPending && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">AI Recommendations:</p>
              {recommendations.map((rec, idx) => {
                const ModeIcon = modeIcons[rec.recommendedMode.toLowerCase()] || Car;
                return (
                  <div 
                    key={idx}
                    className="flex items-center gap-2 text-xs p-2 bg-green-50 dark:bg-green-900/20 rounded-md"
                  >
                    <ModeIcon className="h-4 w-4 text-green-600" />
                    <span className="flex-1">{rec.reason}</span>
                    <Badge className="bg-green-600 text-xs">{rec.recommendedMode}</Badge>
                  </div>
                );
              })}
            </div>
          )}

          {!hasActivitiesWithCoords && hotelLocation && (
            <p className="text-xs text-muted-foreground">
              Add activities with meeting points to see transportation options.
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
