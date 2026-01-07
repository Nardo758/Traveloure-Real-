import { useState, useMemo } from "react";
import { APIProvider, Map, Marker, InfoWindow } from "@vis.gl/react-google-maps";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MapPin, 
  Navigation, 
  Clock, 
  Star,
  Route,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MapProvider {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  lat: number;
  lng: number;
  description?: string;
}

interface ExperienceMapProps {
  providers: MapProvider[];
  destination?: string;
  onAddToCart?: (provider: MapProvider) => void;
  className?: string;
}

const categoryColors: Record<string, string> = {
  venue: "#FF385C",
  catering: "#00A699",
  photography: "#FC642D",
  florist: "#E91E63",
  entertainment: "#9C27B0",
  dining: "#FF9800",
  accommodations: "#3F51B5",
  spa: "#009688",
  activities: "#4CAF50",
  nightlife: "#673AB7",
  default: "#607D8B"
};

function MapContent({ 
  providers, 
  onAddToCart 
}: { 
  providers: MapProvider[]; 
  onAddToCart?: (provider: MapProvider) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<MapProvider | null>(null);
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);

  const center = useMemo(() => {
    if (providers.length === 0) {
      return { lat: 40.7128, lng: -74.0060 };
    }
    const avgLat = providers.reduce((sum, p) => sum + p.lat, 0) / providers.length;
    const avgLng = providers.reduce((sum, p) => sum + p.lng, 0) / providers.length;
    return { lat: avgLat, lng: avgLng };
  }, [providers]);

  return (
    <Map
      defaultCenter={center}
      defaultZoom={12}
      gestureHandling="greedy"
      disableDefaultUI={false}
      mapTypeControl={false}
      streetViewControl={false}
      className="w-full h-full rounded-md"
    >
      {providers.map((provider) => (
        <Marker
          key={provider.id}
          position={{ lat: provider.lat, lng: provider.lng }}
          onClick={() => setSelectedProvider(provider)}
          onMouseEnter={() => setHoveredProvider(provider.id)}
          onMouseLeave={() => setHoveredProvider(null)}
        />
      ))}

      {selectedProvider && (
        <InfoWindow
          position={{ lat: selectedProvider.lat, lng: selectedProvider.lng }}
          onCloseClick={() => setSelectedProvider(null)}
        >
          <div className="p-2 max-w-[250px]">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-semibold text-sm">{selectedProvider.name}</h4>
              <Badge 
                className="text-xs flex-shrink-0"
                style={{ backgroundColor: categoryColors[selectedProvider.category] || categoryColors.default }}
              >
                {selectedProvider.category}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {selectedProvider.rating.toFixed(1)}
              </span>
              <span className="font-medium">${selectedProvider.price}</span>
            </div>
            {selectedProvider.description && (
              <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                {selectedProvider.description}
              </p>
            )}
            {onAddToCart && (
              <Button 
                size="sm" 
                className="w-full bg-[#FF385C] hover:bg-[#E23350] text-xs h-7"
                onClick={() => onAddToCart(selectedProvider)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add to Plan
              </Button>
            )}
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}

export function ExperienceMap({ 
  providers, 
  destination,
  onAddToCart,
  className 
}: ExperienceMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-6 text-center">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Map Unavailable</h3>
          <p className="text-sm text-muted-foreground">
            Google Maps API key not configured
          </p>
        </CardContent>
      </Card>
    );
  }

  if (providers.length === 0) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-6 text-center">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-2">No Locations to Display</h3>
          <p className="text-sm text-muted-foreground">
            {destination 
              ? `No providers found in ${destination}` 
              : "Select a destination to see providers on the map"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="h-[400px] relative">
        <APIProvider apiKey={apiKey}>
          <MapContent providers={providers} onAddToCart={onAddToCart} />
        </APIProvider>
        
        <div className="absolute top-3 left-3 bg-white dark:bg-gray-900 rounded-md shadow-md p-2">
          <div className="flex items-center gap-2 text-xs">
            <Route className="w-4 h-4 text-[#FF385C]" />
            <span className="font-medium">{providers.length} providers</span>
          </div>
        </div>
      </div>
      
      <CardContent className="p-3 border-t">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Navigation className="w-4 h-4" />
            <span>{destination || "All locations"}</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {Object.entries(
              providers.reduce((acc, p) => {
                acc[p.category] = (acc[p.category] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).slice(0, 4).map(([cat, count]) => (
              <Badge 
                key={cat} 
                variant="outline" 
                className="text-xs"
                style={{ borderColor: categoryColors[cat] || categoryColors.default }}
              >
                {cat}: {count}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RouteVisualization({
  stops,
  className
}: {
  stops: Array<{ name: string; time: string; duration?: string }>;
  className?: string;
}) {
  if (stops.length === 0) return null;

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <Route className="w-5 h-5 text-[#FF385C]" />
          Day Route
        </h4>
        <div className="relative">
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-[#FF385C] to-[#FF385C]/30" />
          <div className="space-y-4">
            {stops.map((stop, index) => (
              <div key={index} className="flex items-start gap-3 relative">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 z-10",
                  index === 0 ? "bg-[#FF385C] text-white" : "bg-white dark:bg-gray-800 border-2 border-[#FF385C] text-[#FF385C]"
                )}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{stop.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{stop.time}</span>
                  </div>
                  {stop.duration && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3" />
                      {stop.duration}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MapSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <Skeleton className="h-[400px] w-full" />
      <CardContent className="p-3 border-t">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
