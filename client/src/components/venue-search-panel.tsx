import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { VenueCard } from "./venue-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Search, RefreshCw, AlertCircle, MapPin } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface VenueSearchPanelProps {
  template: string;
  location: string;
  tabId: string;
  onAddToCart?: (item: any) => void;
  externalVendorType?: string;
  externalMinRating?: number;
  externalKeyword?: string;
  hideFilters?: boolean;
}

interface VenueResult {
  id: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  photos?: string[];
  phone?: string;
  website?: string;
  types?: string[];
  source: string;
}

const TAB_FALLBACK_CONFIG: Record<string, { type: string; keyword?: string; label: string }> = {
  venues: { type: 'venue', keyword: 'event venues', label: 'Venues' },
  venue: { type: 'venue', keyword: 'event venues', label: 'Venues' },
  dining: { type: 'restaurant', label: 'Restaurants' },
  nightlife: { type: 'venue', keyword: 'nightlife bars clubs', label: 'Nightlife' },
  sports: { type: 'venue', keyword: 'sports recreation', label: 'Sports & Recreation' },
  spa: { type: 'venue', keyword: 'spa wellness massage', label: 'Spa & Wellness' },
  'spa-wellness': { type: 'venue', keyword: 'spa wellness retreat', label: 'Spa & Wellness' },
  shopping: { type: 'venue', keyword: 'shopping boutiques', label: 'Shopping' },
  entertainment: { type: 'venue', keyword: 'entertainment live shows', label: 'Entertainment' },
  catering: { type: 'venue', keyword: 'catering services', label: 'Catering' },
  decorations: { type: 'venue', keyword: 'event decorations party supplies', label: 'Decorations' },
  photography: { type: 'venue', keyword: 'photography studios photographers', label: 'Photography' },
  wellness: { type: 'venue', keyword: 'wellness retreat yoga', label: 'Wellness' },
  rentals: { type: 'venue', keyword: 'party rentals event supplies', label: 'Rentals' },
  av: { type: 'venue', keyword: 'audio visual equipment rental', label: 'A/V Equipment' },
  destinations: { type: 'venue', keyword: 'tourist attractions things to do', label: 'Destinations' },
  locations: { type: 'venue', keyword: 'romantic scenic locations', label: 'Locations' },
  'celebration-dining': { type: 'restaurant', keyword: 'fine dining celebration', label: 'Celebration Dining' },
  'post-proposal': { type: 'venue', keyword: 'romantic activities couples', label: 'Post-Proposal Activities' },
  'welcome-events': { type: 'venue', keyword: 'welcome party event venues', label: 'Welcome Events' },
  'local-experiences': { type: 'venue', keyword: 'local experiences tours', label: 'Local Experiences' },
  'daytime-activities': { type: 'venue', keyword: 'daytime activities attractions', label: 'Daytime Activities' },
  'party-services': { type: 'venue', keyword: 'party planning services', label: 'Party Services' },
  experiences: { type: 'venue', keyword: 'couple experiences romantic activities', label: 'Experiences' },
  'special-touches': { type: 'venue', keyword: 'gift shops florists luxury gifts', label: 'Special Touches' },
  'itinerary-builder': { type: 'venue', keyword: 'tourist attractions things to do', label: 'Points of Interest' },
  accommodations: { type: 'hotel', label: 'Hotels' },
  'guest-accommodations': { type: 'hotel', label: 'Hotels' },
  transportation: { type: 'venue', keyword: 'transportation services', label: 'Transportation' },
  rehearsal: { type: 'restaurant', keyword: 'private dining rehearsal dinner', label: 'Rehearsal Venues' },
  'team-activities': { type: 'venue', keyword: 'team building activities', label: 'Team Activities' },
};

const VENUE_TYPE_CONFIG: Record<string, Record<string, { type: string; keyword?: string; label: string }>> = {
  wedding: {
    venues: { type: 'venue', keyword: 'wedding venues', label: 'Wedding Venues' },
    vendors: { type: 'venue', keyword: 'wedding vendors', label: 'Wedding Vendors' },
    'guest-accommodations': { type: 'hotel', label: 'Hotels' },
    transportation: { type: 'venue', keyword: 'transportation services', label: 'Transportation' },
    rehearsal: { type: 'restaurant', keyword: 'private dining', label: 'Rehearsal Dinner Venues' }
  },
  'corporate-events': {
    venues: { type: 'venue', keyword: 'conference venues', label: 'Conference Venues' },
    accommodations: { type: 'hotel', label: 'Hotels' },
    'team-activities': { type: 'venue', keyword: 'team building activities', label: 'Team Activities' }
  },
  birthday: {
    venues: { type: 'venue', keyword: 'party venues', label: 'Party Venues' },
    activities: { type: 'venue', keyword: 'birthday activities', label: 'Activities' }
  },
  travel: {
    hotels: { type: 'hotel', label: 'Hotels' },
    dining: { type: 'restaurant', label: 'Restaurants' }
  }
};

const WEDDING_VENDOR_TYPES = [
  { value: 'photographer', label: 'Photographers' },
  { value: 'florist', label: 'Florists' },
  { value: 'caterer', label: 'Caterers' },
  { value: 'dj', label: 'DJs & Musicians' },
  { value: 'planner', label: 'Wedding Planners' },
  { value: 'videographer', label: 'Videographers' },
  { value: 'makeup', label: 'Makeup Artists' },
  { value: 'baker', label: 'Cake Bakers' }
];

export function VenueSearchPanel({ 
  template, 
  location, 
  tabId, 
  onAddToCart,
  externalVendorType,
  externalMinRating,
  externalKeyword,
  hideFilters = false
}: VenueSearchPanelProps) {
  const { toast } = useToast();
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [internalVendorType, setInternalVendorType] = useState<string>('photographer');
  const [internalMinRating, setInternalMinRating] = useState<string>('0');
  const [internalKeyword, setInternalKeyword] = useState<string>('');

  const venueConfig = VENUE_TYPE_CONFIG[template]?.[tabId] || TAB_FALLBACK_CONFIG[tabId];
  const isWeddingVendorsTab = template === 'wedding' && tabId === 'vendors';
  
  // Use external values if provided, otherwise use internal state
  const vendorType = externalVendorType ?? internalVendorType;
  const minRating = externalMinRating !== undefined ? String(externalMinRating) : internalMinRating;
  const customKeyword = externalKeyword !== undefined ? externalKeyword : internalKeyword;

  // Build search params based on tab configuration
  const searchParams = new URLSearchParams();
  if (location) searchParams.set('location', location);
  
  if (isWeddingVendorsTab) {
    searchParams.set('vendorType', vendorType);
  } else if (venueConfig) {
    searchParams.set('type', venueConfig.type);
    if (venueConfig.keyword) {
      searchParams.set('keyword', customKeyword || venueConfig.keyword);
    }
  }
  
  if (minRating !== '0') {
    searchParams.set('minRating', minRating);
  }

  // Determine API endpoint
  const apiEndpoint = isWeddingVendorsTab 
    ? `/api/venues/wedding-vendors?${searchParams.toString()}`
    : `/api/venues/search?${searchParams.toString()}`;

  const { data, isLoading, error, refetch } = useQuery<{ results: VenueResult[] }>({
    queryKey: ['venues', template, tabId, location, vendorType, minRating, customKeyword, searchTrigger],
    queryFn: async () => {
      if (!location || location.trim() === '') {
        throw new Error('Please enter a location to search for venues');
      }
      
      const response = await fetch(apiEndpoint);
      if (!response.ok) {
        throw new Error('Failed to fetch venues');
      }
      return response.json();
    },
    enabled: !!location && location.trim() !== '',
    retry: 1,
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes
  });

  useEffect(() => {
    if (location && location.trim() !== '') {
      setSearchTrigger(prev => prev + 1);
    }
  }, [location]);

  const handleAddToCart = (venue: VenueResult) => {
    if (onAddToCart) {
      onAddToCart({
        id: venue.id,
        name: venue.name,
        type: isWeddingVendorsTab ? vendorType : venueConfig?.type || 'venue',
        price: 0, // External venue - price to be quoted
        quantity: 1,
        details: venue.address,
        provider: venue.source,
        isExternal: true,
        metadata: {
          rating: venue.rating,
          reviewCount: venue.reviewCount,
          phone: venue.phone,
          website: venue.website,
          photos: venue.photos
        }
      });

      toast({
        title: "Added to cart",
        description: `${venue.name} has been added to your cart for inquiries.`,
        duration: 3000
      });
    }
  };

  const handleRefresh = () => {
    setSearchTrigger(prev => prev + 1);
    refetch();
  };

  // Show helpful message if no location is set
  if (!location || location.trim() === '') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MapPin className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          Enter a Location to See Venues
        </h3>
        <p className="text-gray-500 max-w-md">
          Please enter your event location in the form above to discover venues and vendors in that area.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Controls - hide when external filters are provided */}
      {!hideFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              {isWeddingVendorsTab 
                ? `Wedding Vendors in ${location}` 
                : `${venueConfig?.label || 'Venues'} in ${location}`}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              data-testid="button-refresh-venues"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vendor Type Selector (Wedding Vendors Tab) */}
            {isWeddingVendorsTab && (
              <div className="space-y-2">
                <Label htmlFor="vendorType">Vendor Type</Label>
                <Select value={vendorType} onValueChange={setInternalVendorType}>
                  <SelectTrigger id="vendorType" data-testid="select-vendor-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEDDING_VENDOR_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Custom Keyword (Optional) */}
            {!isWeddingVendorsTab && (
              <div className="space-y-2">
                <Label htmlFor="keyword">Search Keyword (Optional)</Label>
                <Input
                  id="keyword"
                  placeholder={venueConfig?.keyword || "e.g., outdoor, luxury"}
                  value={customKeyword}
                  onChange={(e) => setInternalKeyword(e.target.value)}
                  data-testid="input-venue-keyword"
                />
              </div>
            )}

            {/* Minimum Rating Filter */}
            <div className="space-y-2">
              <Label htmlFor="minRating">Minimum Rating</Label>
              <Select value={minRating} onValueChange={setInternalMinRating}>
                <SelectTrigger id="minRating" data-testid="select-min-rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any Rating</SelectItem>
                  <SelectItem value="3.5">3.5+ Stars</SelectItem>
                  <SelectItem value="4.0">4.0+ Stars</SelectItem>
                  <SelectItem value="4.5">4.5+ Stars</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load venues. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && data?.results && data.results.length > 0 && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Found {data.results.length} {data.results.length === 1 ? 'result' : 'results'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.results.map((venue) => (
              <VenueCard
                key={venue.id}
                venue={venue}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {!isLoading && data?.results && data.results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No Venues Found
          </h3>
          <p className="text-gray-500 max-w-md mb-4">
            We couldn't find any venues matching your criteria in this location. Try adjusting your filters or search in a nearby city.
          </p>
          <Button variant="outline" onClick={handleRefresh} data-testid="button-try-again">
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

