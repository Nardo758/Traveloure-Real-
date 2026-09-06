import { useState, useMemo, Component, ReactNode } from "react";
import { APIProvider, Map, Marker, InfoWindow } from "@vis.gl/react-google-maps";
import { useQuery } from "@tanstack/react-query";
import { Polyline } from "@/components/ui/map-polyline";

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

// rating is null when the location has no real review aggregate yet (render "New").
interface MapProvider {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number | null;
  lat: number;
  lng: number;
  description?: string;
}

interface ActivityLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  meetingPoint?: string;
  duration?: string;
}

interface HotelLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface TransitRoute {
  polyline?: string;
  durationText?: string;
}

interface ExperienceMapProps {
  providers: MapProvider[];
  selectedProviderIds?: string[];
  destination?: string;
  destinationCenter?: { lat: number; lng: number } | null;
  onAddToCart?: (provider: MapProvider) => void;
  onRemoveFromCart?: (providerId: string) => void;
  className?: string;
  height?: string;
  activityLocations?: ActivityLocation[];
  hotelLocation?: HotelLocation;
  transitRoutes?: Map<string, TransitRoute | null>;
  highlightedActivityId?: string | null;
  /**
   * The one door out of the no-location state — the mounting page's planning modal opener.
   * §13: when no door is passed the panel states the absence and stops, rather than rendering a
   * button that would do nothing (the `venue-search-panel` precedent, QA F7).
   */
  onSetLocation?: () => void;
}

/**
 * The map's centre, or null when NOTHING real names one.
 *
 * §13 / Locked Decision 22(c) / 34: a map never falls back to a city centre. This component used
 * to end its chain with a hardcoded Lower-Manhattan coordinate pair — so a plan with no
 * destination drew New York under the traveler's itinerary, with markers spread around it, and
 * nothing on screen said the coordinates were invented. Every candidate below is a REAL coordinate somebody stated:
 * the resolved destination, the providers already on the map, a booked hotel, a booked activity.
 * When they are all absent the answer is null and the caller renders no map.
 */
export function resolveMapCenter(input: {
  destinationCenter?: { lat: number; lng: number } | null;
  providers?: Array<{ id: string; lat: number; lng: number }>;
  selectedProviderIds?: string[];
  hotelLocation?: { lat: number; lng: number } | null;
  activityLocations?: Array<{ lat: number; lng: number }>;
}): { lat: number; lng: number } | null {
  const finite = (p: { lat: number; lng: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

  if (input.destinationCenter && finite(input.destinationCenter)) return input.destinationCenter;

  const providers = (input.providers ?? []).filter(finite);
  if (providers.length > 0) {
    const selectedIds = input.selectedProviderIds ?? [];
    const customVenues = providers.filter((p) => isCustomVenue(p.id));
    const selectedItems = providers.filter((p) => selectedIds.includes(p.id));
    const priority = customVenues.length > 0 ? customVenues : selectedItems.length > 0 ? selectedItems : providers;
    return {
      lat: priority.reduce((sum, p) => sum + p.lat, 0) / priority.length,
      lng: priority.reduce((sum, p) => sum + p.lng, 0) / priority.length,
    };
  }

  if (input.hotelLocation && finite(input.hotelLocation)) return input.hotelLocation;

  const activities = (input.activityLocations ?? []).filter(finite);
  if (activities.length > 0) {
    return {
      lat: activities.reduce((sum, a) => sum + a.lat, 0) / activities.length,
      lng: activities.reduce((sum, a) => sum + a.lng, 0) / activities.length,
    };
  }

  return null;
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
  accommodation: "#3F51B5",
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
  center,
  recenterKey,
  onAddToCart,
  onRemoveFromCart,
  activityLocations = [],
  hotelLocation,
  transitRoutes,
  highlightedActivityId
}: { 
  providers: MapProvider[]; 
  selectedProviderIds?: string[];
  /** Already resolved and proven real by the caller — never a city-centre default (§13). */
  center: { lat: number; lng: number };
  /** Remount key — changes only when the DESTINATION changes, so the map recenters on it. */
  recenterKey: string;
  onAddToCart?: (provider: MapProvider) => void;
  onRemoveFromCart?: (providerId: string) => void;
  activityLocations?: ActivityLocation[];
  hotelLocation?: HotelLocation;
  transitRoutes?: Map<string, TransitRoute | null>;
  highlightedActivityId?: string | null;
}) {
  const [selectedProvider, setSelectedProvider] = useState<MapProvider | null>(null);
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityLocation | null>(null);
  
  const isSelected = (id: string) => selectedProviderIds.includes(id);

  // The centre is RESOLVED BY THE CALLER (`resolveMapCenter` below) and is never null here: when
  // nothing real names a place, `ExperienceMap` renders no map at all rather than mounting this
  // component over a guessed coordinate. This component therefore has no fallback of its own.
  //
  // The remount key stays keyed on the DESTINATION (`recenterKey`), unchanged: it exists so a new
  // destination recenters the map, and keying it on the resolved centre instead would remount the
  // map every time a filter changed the provider average.

  return (
    <Map
      key={recenterKey}
      defaultCenter={center}
      defaultZoom={12}
      gestureHandling="greedy"
      disableDefaultUI={false}
      zoomControl={true}
      fullscreenControl={true}
      mapTypeControl={false}
      streetViewControl={false}
      scrollwheel={true}
      className="w-full h-full rounded-md"
      style={{ width: '100%', height: '100%' }}
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
              {selectedProvider.rating != null ? (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {selectedProvider.rating.toFixed(1)}
                </span>
              ) : (
                <span className="text-gray-500">New</span>
              )}
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
                  className="w-full bg-primary hover:bg-primary/90 text-xs h-7"
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

      {/* Activity meeting point markers */}
      {activityLocations.map((activity) => (
        <Marker
          key={`activity-${activity.id}`}
          position={{ lat: activity.lat, lng: activity.lng }}
          onClick={() => setSelectedActivity(activity)}
          icon={{
            url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26c0-9.94-8.06-18-18-18z" fill="#4CAF50" stroke="white" stroke-width="2"/><circle cx="18" cy="16" r="7" fill="white"/><path d="M14 16h8M18 12v8" stroke="#4CAF50" stroke-width="2" stroke-linecap="round"/></svg>`),
          } as any}
        />
      ))}

      {selectedActivity && (
        <InfoWindow
          position={{ lat: selectedActivity.lat, lng: selectedActivity.lng }}
          onCloseClick={() => setSelectedActivity(null)}
        >
          <div className="p-2 max-w-[250px]">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-semibold text-sm">{selectedActivity.name}</h4>
              <Badge className="text-xs flex-shrink-0 bg-green-500">
                Activity
              </Badge>
            </div>
            {selectedActivity.meetingPoint && (
              <div className="flex items-start gap-1 text-xs text-gray-600 mb-2">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{selectedActivity.meetingPoint}</span>
              </div>
            )}
            {selectedActivity.duration && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                <span>{selectedActivity.duration}</span>
              </div>
            )}
          </div>
        </InfoWindow>
      )}

      {/* Transit route polylines */}
      {transitRoutes && activityLocations.map((activity) => {
        const route = transitRoutes.get(activity.id);
        if (!route?.polyline) return null;
        const isHighlighted = highlightedActivityId === activity.id;
        return (
          <Polyline
            key={`route-${activity.id}`}
            encodedPath={route.polyline}
            strokeColor={isHighlighted ? "#FF385C" : "#3B82F6"}
            strokeWeight={isHighlighted ? 6 : 4}
            strokeOpacity={isHighlighted ? 1 : 0.5}
          />
        );
      })}

      {/* Hotel location marker */}
      {hotelLocation && (
        <Marker
          key={`hotel-${hotelLocation.id}`}
          position={{ lat: hotelLocation.lat, lng: hotelLocation.lng }}
          icon={{
            url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><path d="M20 0C9 0 0 9 0 20c0 15 20 28 20 28s20-13 20-28c0-11-9-20-20-20z" fill="#3F51B5" stroke="white" stroke-width="3"/><rect x="12" y="10" width="16" height="16" rx="2" fill="white"/><rect x="15" y="13" width="4" height="4" fill="#3F51B5"/><rect x="21" y="13" width="4" height="4" fill="#3F51B5"/><rect x="15" y="19" width="4" height="4" fill="#3F51B5"/><rect x="21" y="19" width="4" height="4" fill="#3F51B5"/></svg>`),
          } as any}
        />
      )}
    </Map>
  );
}

export function ExperienceMap({ 
  providers = [],
  selectedProviderIds = [],
  destination,
  destinationCenter: parentDestinationCenter,
  onAddToCart,
  onRemoveFromCart,
  className,
  height = "100%",
  activityLocations = [],
  hotelLocation,
  transitRoutes,
  highlightedActivityId,
  onSetLocation
}: ExperienceMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // Use parent-provided destination center if available, otherwise do our own geocoding as fallback
  const { data: locationData } = useQuery<Array<{ geoCode?: { latitude: number; longitude: number } }>>({
    queryKey: ["/api/amadeus/locations", "geocode-map", destination],
    // Only query if we don't have a parent-provided center
    enabled: !parentDestinationCenter && !!destination && destination.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: destination!,
        subType: "CITY",
      });
      const res = await fetch(`/api/amadeus/locations?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000,
  });

  // Prioritize parent-provided center, then fall back to our own geocoding
  const destinationCenter = useMemo(() => {
    if (parentDestinationCenter) {
      return parentDestinationCenter;
    }
    if (locationData && locationData.length > 0 && locationData[0].geoCode) {
      return {
        lat: locationData[0].geoCode.latitude,
        lng: locationData[0].geoCode.longitude,
      };
    }
    return null;
  }, [parentDestinationCenter, locationData]);

  // ONE resolution, shared by the map and by the decision NOT to draw one (§18 rule 1).
  const center = useMemo(
    () =>
      resolveMapCenter({
        destinationCenter,
        providers,
        selectedProviderIds,
        hotelLocation,
        activityLocations,
      }),
    [destinationCenter, providers, selectedProviderIds, hotelLocation, activityLocations],
  );

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

  /**
   * NO LOCATION YET — §13 / Locked Decision 22(c), 34: "no map at all when the plan has no
   * coordinates", never a city-centre fallback.
   *
   * The comment this replaces argued that the map should ALWAYS render, defaulting to New York
   * when no destination was set, so that a traveler saw a map immediately instead of a
   * placeholder. That is the defect stated as a feature, and it is retracted: post-publish QA
   * (2026-09-05) opened a plan with no destination and got Lower Manhattan, plus a "N providers"
   * chip counting markers that had been scattered around it. Nothing on screen said any of it
   * was invented. An honest placeholder is the correct answer here.
   *
   * The copy is the SAME no-location state `venue-search-panel` already shows on this page's
   * left column (QA F7), so the two halves of the screen now say the same true thing, and it
   * carries the same one door out of it.
   */
  if (!center) {
    return (
      <div
        className={cn("flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md", className)}
        style={{ height }}
        data-testid="experience-map-no-location"
      >
        <div className="text-center p-6 max-w-md">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Your plan doesn't have a location yet</h3>
          <p className="text-sm text-muted-foreground">
            The map shows places once your plan names a location. Set one and it'll appear here.
          </p>
          {onSetLocation && (
            <Button className="mt-5" onClick={onSetLocation} data-testid="button-set-location-from-map">
              <MapPin className="w-4 h-4 mr-2" />
              Set your location
            </Button>
          )}
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
            center={center}
            recenterKey={
              destinationCenter
                ? `map-${destinationCenter.lat.toFixed(4)}-${destinationCenter.lng.toFixed(4)}`
                : "map-default"
            }
            onAddToCart={onAddToCart}
            onRemoveFromCart={onRemoveFromCart}
            activityLocations={activityLocations}
            hotelLocation={hotelLocation}
            transitRoutes={transitRoutes}
            highlightedActivityId={highlightedActivityId}
          />
        </APIProvider>
      </MapErrorBoundary>
      
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        {/*
          Counts the PINS ON THIS MAP, and now says so. Post-publish QA (2026-09-05) watched this
          read "8 providers" and then "0 providers" the moment the destination modal was
          dismissed — while the page's service list (`GET /api/provider-services`, not keyed on
          destination) had not changed at all. It was never a count of providers found: it is
          `mapProviders.length`, and that array is gated on the plan having a place to draw
          around. "0 providers" therefore read as "we searched and found none", which is a claim
          nobody made (§13). Two changes: the label names what it counts, and the whole overlay
          only exists when there IS a map — with no centre the component returns its no-location
          state above and this chip never renders a zero.
        */}
        <div className="bg-white dark:bg-gray-900 rounded-md shadow-md p-2">
          <div className="flex items-center gap-2 text-xs">
            <Route className="w-4 h-4 text-primary" />
            <span className="font-medium" data-testid="map-pin-count">{providers.length} on this map</span>
          </div>
        </div>
        {selectedCount > 0 && (
          <div className="bg-primary text-white rounded-md shadow-md p-2">
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
          <Route className="w-5 h-5 text-primary" />
          Day Route
        </h4>
        <div className="relative">
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-[#FF385C] to-[#FF385C]/30" />
          <div className="space-y-4">
            {stops.map((stop, index) => (
              <div key={index} className="flex items-start gap-3 relative">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 z-10",
                  index === 0 ? "bg-primary text-white" : "bg-white dark:bg-gray-800 border-2 border-primary text-primary"
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
