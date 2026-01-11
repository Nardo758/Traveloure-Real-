import { useState, useMemo, Component, ReactNode } from "react";
import { APIProvider, Map, Marker, InfoWindow } from "@vis.gl/react-google-maps";

class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
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
  Plus,
  X,
  Check
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
  selectedProviderIds?: string[];
  destination?: string;
  onAddToCart?: (provider: MapProvider) => void;
  onRemoveFromCart?: (providerId: string) => void;
  className?: string;
  height?: string;
}

const categoryColors: Record<string, string> = {
  venue: "#FF385C",
  venues: "#FF385C",
  "venues-luxury": "#FF385C",
  "custom-venue": "#8B5CF6",
  catering: "#00A699",
  photography: "#FC642D",
  florist: "#E91E63",
  entertainment: "#9C27B0",
  dining: "#FF9800",
  restaurant: "#FF9800",
  accommodations: "#3F51B5",
  hotel: "#3F51B5",
  hotels: "#3F51B5",
  spa: "#009688",
  wellness: "#009688",
  activities: "#4CAF50",
  nightlife: "#673AB7",
  jewelry: "#9C27B0",
  rings: "#9C27B0",
  transportation: "#795548",
  transport: "#795548",
  decorations: "#FF5722",
  "av-equipment": "#607D8B",
  av: "#607D8B",
  "team-building": "#2196F3",
  team: "#2196F3",
  adventures: "#FF5722",
  adventure: "#FF5722",
  sports: "#4CAF50",
  sport: "#4CAF50",
  shopping: "#E91E63",
  wine: "#9C27B0",
  beach: "#00BCD4",
  tour: "#4CAF50",
  tours: "#4CAF50",
  default: "#607D8B"
};

const isCustomVenue = (id: string) => id.startsWith("custom-");

function MapContent({ 
  providers,
  selectedProviderIds = [],
  onAddToCart,
  onRemoveFromCart
}: { 
  providers: MapProvider[]; 
  selectedProviderIds?: string[];
  onAddToCart?: (provider: MapProvider) => void;
  onRemoveFromCart?: (providerId: string) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<MapProvider | null>(null);
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);
  
  const isSelected = (id: string) => selectedProviderIds.includes(id);

  const center = useMemo(() => {
    if (providers.length === 0) {
      return { lat: 40.7128, lng: -74.0060 };
    }
    
    const customVenues = providers.filter(p => isCustomVenue(p.id));
    const selectedItems = providers.filter(p => selectedProviderIds.includes(p.id));
    
    const priorityProviders = customVenues.length > 0 
      ? customVenues 
      : selectedItems.length > 0 
        ? selectedItems 
        : providers;
    
    const avgLat = priorityProviders.reduce((sum, p) => sum + p.lat, 0) / priorityProviders.length;
    const avgLng = priorityProviders.reduce((sum, p) => sum + p.lng, 0) / priorityProviders.length;
    return { lat: avgLat, lng: avgLng };
  }, [providers, selectedProviderIds]);

  return (
    <Map
      center={center}
      zoom={12}
      gestureHandling="greedy"
      disableDefaultUI={false}
      mapTypeControl={false}
      streetViewControl={false}
      className="w-full h-full rounded-md"
    >
      {providers.map((provider) => {
        const selected = isSelected(provider.id);
        const isCustom = isCustomVenue(provider.id);
        
        let markerIcon = undefined;
        if (isCustom && selected) {
          markerIcon = {
            url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><path d="M20 0C9 0 0 9 0 20c0 15 20 28 20 28s20-13 20-28c0-11-9-20-20-20z" fill="#8B5CF6" stroke="white" stroke-width="3"/><circle cx="20" cy="18" r="8" fill="white"/><path d="M16 18l3 3 5-5" stroke="#8B5CF6" stroke-width="2" fill="none"/></svg>`),
          } as any;
        } else if (isCustom) {
          markerIcon = {
            url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><path d="M20 0C9 0 0 9 0 20c0 15 20 28 20 28s20-13 20-28c0-11-9-20-20-20z" fill="#8B5CF6" stroke="white" stroke-width="3"/><path d="M20 10l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6-4.9 2.6.9-5.3-4-3.9 5.5-.8z" fill="white"/></svg>`),
          } as any;
        } else if (selected) {
          markerIcon = {
            url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24c0-8.84-7.16-16-16-16z" fill="#FF385C" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="white"/><path d="M13 16l2 2 4-4" stroke="#FF385C" stroke-width="2" fill="none"/></svg>`),
          } as any;
        }
        
        return (
          <Marker
            key={provider.id}
            position={{ lat: provider.lat, lng: provider.lng }}
            onClick={() => setSelectedProvider(provider)}
            icon={markerIcon}
          />
        );
      })}

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
                {isCustomVenue(selectedProvider.id) ? "Custom Location" : selectedProvider.category}
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
            {isSelected(selectedProvider.id) ? (
              onRemoveFromCart && (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-7 border-red-500 text-red-500 hover:bg-red-50"
                  onClick={() => onRemoveFromCart(selectedProvider.id)}
                >
                  <X className="w-3 h-3 mr-1" />
                  Remove from Plan
                </Button>
              )
            ) : (
              onAddToCart && (
                <Button 
                  size="sm" 
                  className="w-full bg-[#FF385C] hover:bg-[#E23350] text-xs h-7"
                  onClick={() => onAddToCart(selectedProvider)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add to Plan
                </Button>
              )
            )}
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}

export function ExperienceMap({ 
  providers,
  selectedProviderIds = [],
  destination,
  onAddToCart,
  onRemoveFromCart,
  className,
  height = "100%"
}: ExperienceMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md", className)} style={{ height }}>
        <div className="text-center p-6">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Map Unavailable</h3>
          <p className="text-sm text-muted-foreground">
            Google Maps API key not configured
          </p>
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md", className)} style={{ height }}>
        <div className="text-center p-6">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-2">No Locations to Display</h3>
          <p className="text-sm text-muted-foreground">
            {destination 
              ? `No providers found in ${destination}` 
              : "Enter a destination to see providers on the map"}
          </p>
        </div>
      </div>
    );
  }

  const selectedCount = selectedProviderIds.length;

  const mapFallback = (
    <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md w-full h-full">
      <div className="text-center p-6">
        <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-semibold mb-2">Map Loading Error</h3>
        <p className="text-sm text-muted-foreground">
          Unable to load Google Maps. Please try refreshing the page.
        </p>
      </div>
    </div>
  );

  return (
    <div className={cn("relative", className)} style={{ height }}>
      <MapErrorBoundary fallback={mapFallback}>
        <APIProvider apiKey={apiKey}>
          <MapContent 
            providers={providers} 
            selectedProviderIds={selectedProviderIds}
            onAddToCart={onAddToCart}
            onRemoveFromCart={onRemoveFromCart}
          />
        </APIProvider>
      </MapErrorBoundary>
      
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <div className="bg-white dark:bg-gray-900 rounded-md shadow-md p-2">
          <div className="flex items-center gap-2 text-xs">
            <Route className="w-4 h-4 text-[#FF385C]" />
            <span className="font-medium">{providers.length} providers</span>
          </div>
        </div>
        {selectedCount > 0 && (
          <div className="bg-[#FF385C] text-white rounded-md shadow-md p-2">
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-4 h-4" />
              <span className="font-medium">{selectedCount} in plan</span>
            </div>
          </div>
        )}
        {providers.some(p => isCustomVenue(p.id)) && (
          <div className="bg-[#8B5CF6] text-white rounded-md shadow-md p-2">
            <div className="flex items-center gap-2 text-xs">
              <Star className="w-4 h-4" />
              <span className="font-medium">Custom locations</span>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-3 right-3">
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur rounded-md shadow-md p-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Navigation className="w-3 h-3" />
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
                  className="text-xs h-5"
                  style={{ borderColor: categoryColors[cat] || categoryColors.default }}
                >
                  {cat}: {count}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
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
