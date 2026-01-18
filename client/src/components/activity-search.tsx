import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  MapPin, 
  Clock, 
  Star, 
  Users, 
  Check, 
  Calendar,
  Shield,
  Tag,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Camera,
  Ticket,
  RefreshCw,
  Car
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityMapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  price: number;
  rating: number;
  description?: string;
}

interface ActivitySearchProps {
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  travelers?: number;
  sortBy?: "TOP_SELLERS" | "PRICE_LOW_TO_HIGH" | "PRICE_HIGH_TO_LOW" | "TRAVELER_RATING";
  filterType?: "activities" | "transport" | "all";
  onSelectActivity?: (activity: ViatorActivity) => void;
  onResultsLoaded?: (markers: ActivityMapMarker[]) => void;
  destinationCenter?: { lat: number; lng: number } | null;
}

const STRONG_TRANSPORT_KEYWORDS = [
  'transfer', 'shuttle', 'taxi service', 'private car service',
  'limousine service', 'chauffeur', 'car service',
];

const WEAK_TRANSPORT_KEYWORDS = [
  'pickup', 'drop-off', 'dropoff',
];

const TRANSPORT_EXCLUSION_KEYWORDS = [
  'tour', 'experience', 'excursion', 'day trip', 'sightseeing',
  'guided', 'walking', 'cruise', 'safari', 'adventure', 'cultural',
  'visit', 'explore', 'discover', 'lounge', 'fast track', 'fast-track',
  'priority', 'vip access', 'pass', 'ticket', 'admission', 'entry',
];

function isTransportProduct(activity: ViatorActivity): boolean {
  const title = activity.title?.toLowerCase() || '';
  
  const hasExclusion = TRANSPORT_EXCLUSION_KEYWORDS.some(keyword => 
    title.includes(keyword)
  );
  
  if (hasExclusion) {
    return false;
  }
  
  const hasStrongTransportKeyword = STRONG_TRANSPORT_KEYWORDS.some(keyword => 
    title.includes(keyword)
  );
  
  if (hasStrongTransportKeyword) {
    return true;
  }
  
  const transferPatterns = [
    /^(private|shared)\s+(airport|hotel|port|station|city)\s+(transfer|shuttle)/i,
    /\btransfer\s+(to|from|between)\b/i,
    /\b(airport|hotel|port|station)\s+(to|from)\s+(airport|hotel|port|station|city|downtown)/i,
    /^(one[- ]way|round[- ]trip)\s+(private|shared)?\s*transfer/i,
    /\bshuttle\s+(service|bus|ride)\b/i,
  ];
  
  if (transferPatterns.some(pattern => pattern.test(title))) {
    return true;
  }
  
  const hasWeakKeyword = WEAK_TRANSPORT_KEYWORDS.some(keyword => 
    title.includes(keyword)
  );
  const hasTransportContext = title.includes('airport') || title.includes('hotel') || title.includes('station');
  
  return hasWeakKeyword && hasTransportContext && !hasExclusion;
}

interface ViatorLocation {
  ref?: string;
  name?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  googleMapsUrl?: string;
}

interface ViatorLogistics {
  start?: Array<{
    location: ViatorLocation;
    description?: string;
    localizedDescription?: string;
  }>;
  end?: Array<{
    location: ViatorLocation;
    description?: string;
  }>;
  travelerPickup?: {
    allowCustomTravelerPickup?: boolean;
    pickupOptionType?: string;
    additionalInfo?: string;
    locations?: Array<{
      location: ViatorLocation;
      pickupType?: string;
    }>;
  };
}

interface ViatorActivity {
  productCode: string;
  title: string;
  description?: string;
  duration?: {
    fixedDurationInMinutes?: number;
    variableDurationFromMinutes?: number;
    variableDurationToMinutes?: number;
  };
  pricing?: {
    summary: {
      fromPrice: number;
      fromPriceBeforeDiscount?: number;
    };
    currency: string;
  };
  reviews?: {
    totalReviews: number;
    combinedAverageRating: number;
  };
  images?: Array<{
    imageSource: string;
    caption?: string;
    isCover?: boolean;
    variants: Array<{
      url: string;
      width: number;
      height: number;
    }>;
  }>;
  flags?: string[];
  cancellationPolicy?: {
    type: string;
    description?: string;
    cancelIfBadWeather?: boolean;
    cancelIfInsufficientTravelers?: boolean;
    refundEligibility?: Array<{
      dayRangeMin?: number;
      dayRangeMax?: number;
      percentageRefundable: number;
    }>;
  };
  destinations?: Array<{
    ref: string;
    primary?: boolean;
  }>;
  tags?: Array<{
    tagId: number;
    allNamesByLocale?: Record<string, string>;
  }>;
  logistics?: ViatorLogistics;
  inclusions?: Array<{
    otherDescription?: string;
    categoryDescription?: string;
    typeDescription?: string;
  }>;
  exclusions?: Array<{
    otherDescription?: string;
    categoryDescription?: string;
    typeDescription?: string;
  }>;
  additionalInfo?: string[];
  bookingConfirmationSettings?: {
    confirmationType: string;
    confirmationTypeDescription?: string;
  };
  productUrl?: string;
}

function getMeetingPointInfo(logistics?: ViatorLogistics): { address: string; coordinates?: { lat: number; lng: number } } | null {
  if (!logistics?.start?.[0]) return null;
  
  const startLocation = logistics.start[0].location;
  const addr = startLocation.address;
  const addressParts = [addr?.street, addr?.city, addr?.state, addr?.country].filter(Boolean);
  const address = startLocation.name || addressParts.join(', ') || logistics.start[0].description || '';
  
  const coordinates = startLocation.coordinates 
    ? { lat: startLocation.coordinates.latitude, lng: startLocation.coordinates.longitude }
    : undefined;
  
  return address ? { address, coordinates } : null;
}

function formatDuration(duration?: ViatorActivity['duration']): string {
  if (!duration) return "Duration varies";
  
  const minutes = duration.fixedDurationInMinutes || duration.variableDurationFromMinutes;
  if (!minutes) return "Duration varies";
  
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (duration.variableDurationFromMinutes && duration.variableDurationToMinutes) {
    const toHours = Math.floor(duration.variableDurationToMinutes / 60);
    if (hours === toHours) return `${hours}h`;
    return `${hours}-${toHours}h`;
  }
  
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

function getCancellationBadge(policy?: ViatorActivity['cancellationPolicy']): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } | null {
  if (!policy) return null;
  
  const fullRefund = policy.refundEligibility?.find(r => r.percentageRefundable === 100);
  if (fullRefund) {
    if (fullRefund.dayRangeMin && fullRefund.dayRangeMin >= 1) {
      return { text: `Free cancellation ${fullRefund.dayRangeMin}+ days before`, variant: "secondary" };
    }
    return { text: "Free cancellation", variant: "secondary" };
  }
  
  if (policy.type === "STANDARD" || policy.type === "ALL_SALES_FINAL") {
    return { text: "Non-refundable", variant: "destructive" };
  }
  
  return null;
}

function getImageUrl(images?: ViatorActivity['images'], preferredWidth: number = 480): string {
  if (!images || images.length === 0) {
    return "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=480&h=320&fit=crop";
  }
  
  const coverImage = images.find(img => img.isCover) || images[0];
  const variants = coverImage.variants || [];
  
  const sorted = [...variants].sort((a, b) => Math.abs(a.width - preferredWidth) - Math.abs(b.width - preferredWidth));
  return sorted[0]?.url || coverImage.variants[0]?.url || "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=480&h=320&fit=crop";
}

export function ActivitySearch({
  destination,
  startDate,
  endDate,
  travelers = 1,
  sortBy = "TOP_SELLERS",
  filterType = "activities",
  onSelectActivity,
  onResultsLoaded,
  destinationCenter,
}: ActivitySearchProps) {
  const [currentSortBy, setCurrentSortBy] = useState(sortBy);
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useQuery<{ products: ViatorActivity[]; totalCount: number; serviceNotice?: string }>({
    queryKey: ['/api/viator/activities', destination, currentSortBy],
    queryFn: async () => {
      const params = new URLSearchParams({
        destination: destination || '',
        sortBy: currentSortBy,
        count: '20',
      });
      const response = await fetch(`/api/viator/activities?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Activity search failed' }));
        throw new Error(error.message || 'Activity search failed');
      }
      return response.json();
    },
    enabled: !!destination,
  });

  const activities = useMemo(() => {
    if (!data?.products) return [];
    
    let filtered = [...data.products];
    
    if (filterType === "activities") {
      filtered = filtered.filter(p => !isTransportProduct(p));
    } else if (filterType === "transport") {
      filtered = filtered.filter(p => isTransportProduct(p));
    }
    
    switch (currentSortBy) {
      case "PRICE_LOW_TO_HIGH":
        filtered.sort((a, b) => (a.pricing?.summary?.fromPrice || 0) - (b.pricing?.summary?.fromPrice || 0));
        break;
      case "PRICE_HIGH_TO_LOW":
        filtered.sort((a, b) => (b.pricing?.summary?.fromPrice || 0) - (a.pricing?.summary?.fromPrice || 0));
        break;
      case "TRAVELER_RATING":
        filtered.sort((a, b) => (b.reviews?.combinedAverageRating || 0) - (a.reviews?.combinedAverageRating || 0));
        break;
    }
    
    return filtered;
  }, [data?.products, currentSortBy, filterType]);

  // Notify parent of activity results with coordinates for map display
  // Use destinationCenter as fallback when individual activity coordinates aren't available
  const activityMarkers = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    
    return activities
      .map((activity, index) => {
        const meetingInfo = getMeetingPointInfo(activity.logistics);
        const coordinates = meetingInfo?.coordinates;
        
        // Use activity coordinates if available, otherwise fall back to destination center with slight offset
        let lat: number, lng: number;
        if (coordinates) {
          lat = coordinates.lat;
          lng = coordinates.lng;
        } else if (destinationCenter) {
          // Add small random offset to prevent markers from stacking exactly on top of each other
          const offset = 0.002 * (index % 10);
          const angle = (index * 137.5) * (Math.PI / 180); // Golden angle for distribution
          lat = destinationCenter.lat + offset * Math.cos(angle);
          lng = destinationCenter.lng + offset * Math.sin(angle);
        } else {
          return null; // No coordinates available at all
        }
        
        return {
          id: `activity-${activity.productCode}`,
          name: activity.title,
          lat,
          lng,
          category: filterType === "transport" ? "transportation" : "activities",
          price: activity.pricing?.summary?.fromPrice || 0,
          rating: activity.reviews?.combinedAverageRating || 4.5,
          description: activity.description?.substring(0, 100),
        } as ActivityMapMarker;
      })
      .filter((m): m is ActivityMapMarker => m !== null);
  }, [activities, filterType, destinationCenter]);
  
  // Use effect to notify parent of activity markers (proper React pattern)
  const prevMarkersRef = useRef<string>("");
  useEffect(() => {
    if (!onResultsLoaded) return;
    
    const markersKey = activityMarkers.map(m => m.id).join(",");
    if (markersKey !== prevMarkersRef.current) {
      prevMarkersRef.current = markersKey;
      onResultsLoaded(activityMarkers);
    }
  }, [activityMarkers, onResultsLoaded]);

  const handleSelectActivity = (activity: ViatorActivity) => {
    const newSelected = new Set(selectedActivities);
    if (newSelected.has(activity.productCode)) {
      newSelected.delete(activity.productCode);
    } else {
      newSelected.add(activity.productCode);
      onSelectActivity?.(activity);
    }
    setSelectedActivities(newSelected);
  };

  const isTransportMode = filterType === "transport";
  const itemLabel = isTransportMode ? "transfers" : "activities";
  const ItemIcon = isTransportMode ? Car : Camera;

  if (!destination) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <ItemIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-lg mb-2">
            {isTransportMode ? "Search Transport Services" : "Search Activities"}
          </h3>
          <p className="text-muted-foreground">
            {isTransportMode 
              ? "Enter a destination in your Travel Details to search for transfers and transport services."
              : "Enter a destination in your Travel Details to search for tours and activities."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Searching {itemLabel} in {destination}...
            </span>
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <div className="flex">
              <Skeleton className="w-48 h-36" />
              <CardContent className="flex-1 p-4">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-3" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </CardContent>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
          <h3 className="font-semibold mb-2">
            Unable to load {itemLabel}
          </h3>
          <p className="text-muted-foreground text-sm mb-4">
            {error instanceof Error ? error.message : `An error occurred while searching for ${itemLabel}.`}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!activities.length) {
    // Show service notice if API is temporarily unavailable
    if (data?.serviceNotice) {
      return (
        <Card className="border-amber-500 border-2">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
            <h3 className="font-semibold text-lg mb-2">
              Service Temporarily Unavailable
            </h3>
            <p className="text-muted-foreground mb-4">
              {data.serviceNotice}
            </p>
            <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-activities">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }
    
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <ItemIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-lg mb-2">
            {isTransportMode ? "No Transport Services Found" : "No Activities Found"}
          </h3>
          <p className="text-muted-foreground">
            {isTransportMode
              ? `No transfers or transport services available for "${destination}". Try a different destination.`
              : `No tours or activities available for "${destination}". Try a different destination.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <MapPin className="h-3 w-3" />
            {destination}
          </Badge>
          <Badge variant="secondary">{activities.length} {itemLabel}</Badge>
          {travelers > 1 && (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {travelers} travelers
            </Badge>
          )}
        </div>
        
        <Select value={currentSortBy} onValueChange={(v) => setCurrentSortBy(v as typeof currentSortBy)}>
          <SelectTrigger className="w-[180px]" data-testid="select-activity-sort">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOP_SELLERS">Top Sellers</SelectItem>
            <SelectItem value="PRICE_LOW_TO_HIGH">Price: Low to High</SelectItem>
            <SelectItem value="PRICE_HIGH_TO_LOW">Price: High to Low</SelectItem>
            <SelectItem value="TRAVELER_RATING">Best Rated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {activities.map((activity) => {
          const isSelected = selectedActivities.has(activity.productCode);
          const isExpanded = expandedActivity === activity.productCode;
          const cancellation = getCancellationBadge(activity.cancellationPolicy);
          const hasDiscount = activity.pricing?.summary?.fromPriceBeforeDiscount && 
            activity.pricing.summary.fromPriceBeforeDiscount > activity.pricing.summary.fromPrice;

          return (
            <Card
              key={activity.productCode}
              className={cn(
                "overflow-hidden transition-all",
                isSelected && "ring-2 ring-primary"
              )}
              data-testid={`card-activity-${activity.productCode}`}
            >
              <div className="flex flex-col sm:flex-row">
                <div className="relative w-full sm:w-48 h-48 sm:h-auto shrink-0">
                  <img
                    src={getImageUrl(activity.images)}
                    alt={activity.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                  {activity.flags?.includes('LIKELY_TO_SELL_OUT') && (
                    <Badge className="absolute top-2 left-2 bg-orange-500 text-white">
                      Likely to Sell Out
                    </Badge>
                  )}
                </div>
                
                <CardContent className="flex-1 p-4">
                  <div className="flex flex-col h-full">
                    <div className="flex-1">
                      <h3 className="font-semibold text-base mb-1 line-clamp-2">
                        {activity.title}
                      </h3>
                      
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                        {activity.reviews && activity.reviews.totalReviews > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            <span className="font-medium text-foreground">
                              {activity.reviews.combinedAverageRating.toFixed(1)}
                            </span>
                            <span>({activity.reviews.totalReviews.toLocaleString()})</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDuration(activity.duration)}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {cancellation && (
                          <Badge variant={cancellation.variant} className="text-xs gap-1">
                            <Shield className="h-3 w-3" />
                            {cancellation.text}
                          </Badge>
                        )}
                        {activity.bookingConfirmationSettings?.confirmationType === 'INSTANT' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Check className="h-3 w-3" />
                            Instant Confirmation
                          </Badge>
                        )}
                        {activity.flags?.includes('FREE_CANCELLATION') && !cancellation && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <RefreshCw className="h-3 w-3" />
                            Free Cancellation
                          </Badge>
                        )}
                      </div>
                      
                      {getMeetingPointInfo(activity.logistics) && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground mb-2">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">
                            Meeting point: {getMeetingPointInfo(activity.logistics)?.address}
                          </span>
                        </div>
                      )}

                      {isExpanded && activity.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-4">
                          {activity.description}
                        </p>
                      )}
                      
                      {isExpanded && activity.inclusions && activity.inclusions.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-medium mb-1">What's included:</p>
                          <div className="flex flex-wrap gap-1">
                            {activity.inclusions.slice(0, 4).map((inc, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {inc.otherDescription || inc.typeDescription || inc.categoryDescription}
                              </Badge>
                            ))}
                            {activity.inclusions.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{activity.inclusions.length - 4} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold">
                            {activity.pricing?.currency === 'USD' ? '$' : activity.pricing?.currency}
                            {activity.pricing?.summary?.fromPrice?.toFixed(2) || '0.00'}
                          </span>
                          {hasDiscount && (
                            <span className="text-sm text-muted-foreground line-through">
                              ${activity.pricing?.summary?.fromPriceBeforeDiscount?.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">per person</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedActivity(isExpanded ? null : activity.productCode)}
                          data-testid={`button-expand-activity-${activity.productCode}`}
                        >
                          {isExpanded ? (
                            <>Less <ChevronUp className="h-4 w-4 ml-1" /></>
                          ) : (
                            <>More <ChevronDown className="h-4 w-4 ml-1" /></>
                          )}
                        </Button>
                        <Button
                          variant={isSelected ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleSelectActivity(activity)}
                          data-testid={`button-select-activity-${activity.productCode}`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Added
                            </>
                          ) : (
                            "Add to Trip"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
