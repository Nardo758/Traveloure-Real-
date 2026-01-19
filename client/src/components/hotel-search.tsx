import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Hotel, Star, MapPin, ChevronDown, Check, Loader2, Settings2, Calendar, Users, ShieldCheck, ShieldX, Coffee, BedDouble, AlertCircle, Filter, RotateCcw, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityLocationForProximity {
  id: string;
  name: string;
  lat: number;
  lng: number;
  meetingPoint?: string;
}

interface HotelMapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  price: number;
  rating: number;
  description?: string;
}

interface HotelSearchProps {
  destination?: string;
  checkIn?: Date;
  checkOut?: Date;
  guests?: number;
  maxPrice?: number;
  starRating?: number;
  sortBy?: "price" | "rating";
  onSelectHotel?: (hotel: any) => void;
  activityLocations?: ActivityLocationForProximity[];
  onResultsLoaded?: (markers: HotelMapMarker[]) => void;
  destinationCenter?: { lat: number; lng: number } | null;
}

interface LocationSuggestion {
  iataCode: string;
  name: string;
  cityName?: string;
  countryCode?: string;
  subType: string;
}

interface HotelOffer {
  hotel: {
    hotelId: string;
    name: string;
    cityCode: string;
    latitude?: number;
    longitude?: number;
    address?: {
      lines?: string[];
      cityName?: string;
      countryCode?: string;
    };
    rating?: string;
    amenities?: string[];
    contact?: {
      phone?: string;
      email?: string;
    };
  };
  offers?: Array<{
    id: string;
    checkInDate: string;
    checkOutDate: string;
    rateCode?: string;
    category?: string;
    boardType?: string;
    room: {
      type: string;
      typeEstimated?: {
        category?: string;
        beds?: number;
        bedType?: string;
      };
      description?: {
        text: string;
      };
    };
    guests?: {
      adults?: number;
    };
    price: {
      currency: string;
      total: string;
      base?: string;
      taxes?: Array<{
        code?: string;
        amount: string;
        currency: string;
        included?: boolean;
      }>;
      variations?: {
        average?: {
          base?: string;
          total?: string;
        };
      };
    };
    policies?: {
      cancellations?: Array<{
        deadline?: string;
        description?: { text: string };
        policyType?: string;
      }>;
      paymentType?: string;
      refundable?: {
        cancellationRefund?: string;
      };
      guarantee?: {
        acceptedPayments?: {
          creditCards?: string[];
          methods?: string[];
        };
      };
    };
    commission?: {
      percentage?: string;
    };
  }>;
}

const boardTypeLabels: Record<string, string> = {
  ROOM_ONLY: "Room Only",
  BREAKFAST: "Breakfast Included",
  HALF_BOARD: "Half Board",
  FULL_BOARD: "Full Board",
  ALL_INCLUSIVE: "All Inclusive",
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

function getProximityScore(hotelLat: number, hotelLng: number, activities: ActivityLocationForProximity[]): { label: string; variant: "default" | "secondary" | "outline" | "destructive"; avgDistance: number } | null {
  if (activities.length === 0) return null;
  
  const avgDistance = activities.reduce((sum, activity) => {
    return sum + haversineDistance(hotelLat, hotelLng, activity.lat, activity.lng);
  }, 0) / activities.length;

  if (avgDistance < 2) {
    return { label: "Very Close", variant: "default", avgDistance };
  } else if (avgDistance < 5) {
    return { label: "Close", variant: "secondary", avgDistance };
  } else if (avgDistance < 10) {
    return { label: "Moderate", variant: "outline", avgDistance };
  }
  return { label: "Far", variant: "destructive", avgDistance };
}

export function HotelSearch({
  destination,
  checkIn,
  checkOut,
  guests = 2,
  maxPrice: initialMaxPrice = 10000,
  starRating: initialStarRating = 0,
  sortBy: initialSortBy = "price" as "price" | "rating",
  onSelectHotel,
  activityLocations = [],
  onResultsLoaded,
  destinationCenter,
}: HotelSearchProps) {
  const [cityCode, setCityCode] = useState("");
  const [localMaxPrice, setLocalMaxPrice] = useState(initialMaxPrice);
  const [localStarRating, setLocalStarRating] = useState(initialStarRating);
  const [localSortBy, setLocalSortBy] = useState(initialSortBy);
  const [cityOpen, setCityOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [checkInDate, setCheckInDate] = useState(
    checkIn ? format(checkIn, "yyyy-MM-dd") : ""
  );
  const [checkOutDate, setCheckOutDate] = useState(
    checkOut ? format(checkOut, "yyyy-MM-dd") : ""
  );
  const [adults, setAdults] = useState(guests);
  const [rooms, setRooms] = useState(1);
  const [detectedCity, setDetectedCity] = useState<LocationSuggestion | null>(null);
  const [showModify, setShowModify] = useState(false);
  const hasAutoSearched = useRef(false);

  useEffect(() => {
    setCheckInDate(checkIn ? format(checkIn, "yyyy-MM-dd") : "");
  }, [checkIn]);

  useEffect(() => {
    setCheckOutDate(checkOut ? format(checkOut, "yyyy-MM-dd") : "");
  }, [checkOut]);

  useEffect(() => {
    setAdults(guests || 2);
  }, [guests]);

  useEffect(() => {
    setCityCode("");
    setDetectedCity(null);
    hasAutoSearched.current = false;
  }, [destination]);

  const { data: citySuggestions, isLoading: cityLoading } = useQuery<LocationSuggestion[]>({
    queryKey: ["/api/amadeus/locations", "city", citySearch],
    enabled: citySearch.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: citySearch,
        subType: "CITY",
      });
      const res = await fetch(`/api/amadeus/locations?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: autoDetectedLocations, isLoading: autoDetectLoading } = useQuery<LocationSuggestion[]>({
    queryKey: ["/api/amadeus/locations", "autodetect-hotel", destination],
    enabled: !!destination && destination.length >= 2 && !cityCode,
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
    staleTime: 30000,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (autoDetectedLocations && autoDetectedLocations.length > 0 && !cityCode) {
      const best = autoDetectedLocations[0];
      setCityCode(best.iataCode);
      setDetectedCity(best);
    }
  }, [autoDetectedLocations, cityCode]);

  const canAutoSearch = !!cityCode && !!checkInDate && !!checkOutDate && !!adults;

  const {
    data: hotelResponse,
    isLoading,
    error,
    refetch,
  } = useQuery<{ hotels: HotelOffer[]; fromCache: boolean; lastUpdated?: string }>({
    queryKey: [
      "/api/cache/hotels",
      cityCode,
      checkInDate,
      checkOutDate,
      adults,
      rooms,
    ],
    enabled: canAutoSearch,
    queryFn: async () => {
      const params = new URLSearchParams({
        cityCode,
        checkInDate,
        checkOutDate,
        adults: adults.toString(),
        rooms: rooms.toString(),
      });

      const res = await fetch(`/api/cache/hotels?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Hotel search failed");
      }
      return res.json();
    },
    refetchOnMount: true,
  });

  const hotels = hotelResponse?.hotels;

  const isDetecting = autoDetectLoading && !cityCode && !!destination;
  const detectionFailed = !autoDetectLoading && autoDetectedLocations && autoDetectedLocations.length === 0 && !cityCode && !!destination;
  const needsManualInput = !canAutoSearch && !isDetecting;
  const hasTravelDetails = !!destination && !!checkIn && !!checkOut;

  const filteredAndSortedHotels = useMemo(() => {
    if (!hotels) return [];
    
    let result = hotels.filter((hotel) => {
      const offer = hotel.offers?.[0];
      if (offer) {
        const price = parseFloat(offer.price.total);
        if (price > localMaxPrice) return false;
      }
      
      if (localStarRating > 0 && hotel.hotel.rating) {
        const hotelStars = parseInt(hotel.hotel.rating);
        if (hotelStars < localStarRating) return false;
      }
      
      return true;
    });

    result.sort((a, b) => {
      if (localSortBy === "price") {
        const priceA = parseFloat(a.offers?.[0]?.price.total || "0");
        const priceB = parseFloat(b.offers?.[0]?.price.total || "0");
        return priceA - priceB;
      } else {
        const ratingA = parseInt(a.hotel.rating || "0");
        const ratingB = parseInt(b.hotel.rating || "0");
        return ratingB - ratingA;
      }
    });

    return result;
  }, [hotels, localMaxPrice, localStarRating, localSortBy]);
  
  const resetFilters = () => {
    setLocalMaxPrice(initialMaxPrice);
    setLocalStarRating(initialStarRating);
    setLocalSortBy(initialSortBy);
  };

  // Sync local filter state when initial props change
  useEffect(() => {
    setLocalMaxPrice(initialMaxPrice);
  }, [initialMaxPrice]);

  useEffect(() => {
    setLocalStarRating(initialStarRating);
  }, [initialStarRating]);

  useEffect(() => {
    setLocalSortBy(initialSortBy);
  }, [initialSortBy]);

  // Generate hotel map markers and notify parent
  const hotelMarkers = useMemo(() => {
    if (!filteredAndSortedHotels || filteredAndSortedHotels.length === 0) return [];
    
    return filteredAndSortedHotels
      .map((hotel, index) => {
        const offer = hotel.offers?.[0];
        
        // Use hotel coordinates if available, otherwise fall back to destination center with slight offset
        let lat: number, lng: number;
        if (hotel.hotel.latitude && hotel.hotel.longitude) {
          lat = hotel.hotel.latitude;
          lng = hotel.hotel.longitude;
        } else if (destinationCenter) {
          // Add small random offset to prevent markers from stacking exactly on top of each other
          const offset = 0.003 * (index % 10);
          const angle = (index * 137.5) * (Math.PI / 180); // Golden angle for distribution
          lat = destinationCenter.lat + offset * Math.cos(angle);
          lng = destinationCenter.lng + offset * Math.sin(angle);
        } else {
          return null; // No coordinates available at all
        }
        
        return {
          id: `hotel-${hotel.hotel.hotelId}`,
          name: hotel.hotel.name,
          lat,
          lng,
          category: "accommodations",
          price: offer ? parseFloat(offer.price.total) : 0,
          rating: hotel.hotel.rating ? parseInt(hotel.hotel.rating) : 4,
          description: hotel.hotel.name,
        } as HotelMapMarker;
      })
      .filter((m): m is HotelMapMarker => m !== null);
  }, [filteredAndSortedHotels, destinationCenter]);
  
  // Use effect to notify parent of hotel markers (proper React pattern)
  const prevHotelMarkersRef = useRef<string>("");
  useEffect(() => {
    if (!onResultsLoaded) return;
    
    const markersKey = hotelMarkers.map(m => m.id).join(",");
    if (markersKey !== prevHotelMarkersRef.current) {
      prevHotelMarkersRef.current = markersKey;
      onResultsLoaded(hotelMarkers);
    }
  }, [hotelMarkers, onResultsLoaded]);

  if (isDetecting) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Finding hotels in {destination}...</p>
        </CardContent>
      </Card>
    );
  }

  if (needsManualInput && !hasTravelDetails) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <Hotel className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-lg mb-2">Search Hotels</h3>
          <p className="text-muted-foreground">
            Fill in your Travel Details above (destination and dates) to search for hotels.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (needsManualInput && hasTravelDetails && detectionFailed) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-6">
          <div className="text-center mb-4">
            <Hotel className="h-10 w-10 mx-auto mb-2 text-[#FF385C]" />
            <h3 className="font-semibold text-lg mb-1">City Detection Failed</h3>
          </div>
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
            We couldn't find "{destination}" automatically. Please select a city below.
          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2 lg:col-span-1">
                <Label>City</Label>
                <Popover open={cityOpen} onOpenChange={setCityOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal"
                      data-testid="input-hotel-city"
                    >
                      {cityCode || "Search cities..."}
                      <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Type city..."
                        value={citySearch}
                        onValueChange={setCitySearch}
                      />
                      <CommandList>
                        {cityLoading && (
                          <div className="p-3 text-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                            Searching...
                          </div>
                        )}
                        <CommandEmpty>No cities found.</CommandEmpty>
                        <CommandGroup>
                          {citySuggestions?.map((loc) => (
                            <CommandItem
                              key={loc.iataCode}
                              value={`${loc.name} ${loc.iataCode}`}
                              onSelect={() => {
                                setCityCode(loc.iataCode);
                                setDetectedCity(loc);
                                setCityOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", cityCode === loc.iataCode ? "opacity-100" : "opacity-0")} />
                              <span className="font-medium">{loc.iataCode}</span>
                              <span className="ml-2 text-muted-foreground text-xs">{loc.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Check-in</Label>
                <Input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  data-testid="input-hotel-checkin"
                />
              </div>
              <div className="space-y-2">
                <Label>Check-out</Label>
                <Input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  data-testid="input-hotel-checkout"
                />
              </div>
              <div className="space-y-2">
                <Label>Guests</Label>
                <Input
                  type="number"
                  min={1}
                  max={9}
                  value={adults}
                  onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                  data-testid="input-hotel-guests"
                />
              </div>
              <div className="space-y-2">
                <Label>Rooms</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={rooms}
                  onChange={(e) => setRooms(parseInt(e.target.value) || 1)}
                  data-testid="input-hotel-rooms"
                />
              </div>
            </div>
          </CardContent>
        </Card>
    );
  }

  const tripNights = checkInDate && checkOutDate 
    ? Math.max(1, Math.ceil((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="space-y-4">
      {!isDetecting && canAutoSearch && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <Badge variant="outline" className="gap-1">
              <MapPin className="h-3 w-3" />
              {detectedCity?.name || cityCode}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Calendar className="h-3 w-3" />
              {checkInDate} - {checkOutDate}
            </Badge>
            <Badge className="gap-1 bg-[#FF385C] text-white">
              {tripNights} night{tripNights !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {adults} guest{adults !== 1 ? "s" : ""}, {rooms} room{rooms !== 1 ? "s" : ""}
            </Badge>
          </div>
          <Collapsible open={showModify} onOpenChange={setShowModify}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1" data-testid="button-modify-hotel-search">
                <Settings2 className="h-4 w-4" />
                Modify
                <ChevronDown className={cn("h-4 w-4 transition-transform", showModify && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="space-y-2 col-span-2 md:col-span-1">
                      <Label>City</Label>
                      <Popover open={cityOpen} onOpenChange={setCityOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                            data-testid="input-hotel-city"
                          >
                            {cityCode || "Select city"}
                            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0">
                          <Command>
                            <CommandInput
                              placeholder="Type city..."
                              value={citySearch}
                              onValueChange={setCitySearch}
                            />
                            <CommandList>
                              {cityLoading && (
                                <div className="p-3 text-center text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                  Searching...
                                </div>
                              )}
                              <CommandEmpty>No cities found.</CommandEmpty>
                              <CommandGroup>
                                {citySuggestions?.map((loc) => (
                                  <CommandItem
                                    key={loc.iataCode}
                                    value={`${loc.name} ${loc.iataCode}`}
                                    onSelect={() => {
                                      setCityCode(loc.iataCode);
                                      setDetectedCity(loc);
                                      setCityOpen(false);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", cityCode === loc.iataCode ? "opacity-100" : "opacity-0")} />
                                    <span className="font-medium">{loc.iataCode}</span>
                                    <span className="ml-2 text-muted-foreground text-xs">{loc.name}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Check-in</Label>
                      <Input
                        type="date"
                        value={checkInDate}
                        onChange={(e) => setCheckInDate(e.target.value)}
                        data-testid="input-hotel-checkin"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Check-out</Label>
                      <Input
                        type="date"
                        value={checkOutDate}
                        onChange={(e) => setCheckOutDate(e.target.value)}
                        data-testid="input-hotel-checkout"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Guests</Label>
                      <Input
                        type="number"
                        min={1}
                        max={9}
                        value={adults}
                        onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                        data-testid="input-hotel-guests"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rooms</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={rooms}
                        onChange={(e) => setRooms(parseInt(e.target.value) || 1)}
                        data-testid="input-hotel-rooms"
                      />
                    </div>
                  </div>
                  
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Filters</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Max Price per Stay: ${localMaxPrice}</Label>
                        <Slider
                          value={[localMaxPrice]}
                          onValueChange={(val) => setLocalMaxPrice(val[0])}
                          min={100}
                          max={10000}
                          step={100}
                          data-testid="slider-max-price"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Minimum Star Rating</Label>
                        <Select
                          value={localStarRating.toString()}
                          onValueChange={(val) => setLocalStarRating(parseInt(val))}
                        >
                          <SelectTrigger data-testid="select-star-rating">
                            <SelectValue placeholder="Any rating" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Any rating</SelectItem>
                            <SelectItem value="3">3+ stars</SelectItem>
                            <SelectItem value="4">4+ stars</SelectItem>
                            <SelectItem value="5">5 stars only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Sort By</Label>
                        <Select
                          value={localSortBy}
                          onValueChange={(val) => setLocalSortBy(val as "price" | "rating")}
                        >
                          <SelectTrigger data-testid="select-sort-by">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="price">Price (Low to High)</SelectItem>
                            <SelectItem value="rating">Rating (High to Low)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={() => { refetch(); setShowModify(false); }}
                      className="bg-[#FF385C] hover:bg-[#E23350]"
                      data-testid="button-search-hotels"
                    >
                      Update Search
                    </Button>
                    <Button
                      variant="outline"
                      onClick={resetFilters}
                      data-testid="button-reset-filters"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset Filters
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-32 w-full mb-3" />
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-4" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-red-600">
            {error.message || "Failed to search hotels. Please try again."}
          </CardContent>
        </Card>
      )}

      {filteredAndSortedHotels && filteredAndSortedHotels.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-lg">
              {filteredAndSortedHotels.length} hotel{filteredAndSortedHotels.length !== 1 ? "s" : ""} available
              {hotels && hotels.length !== filteredAndSortedHotels.length && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (filtered from {hotels.length})
                </span>
              )}
            </h3>
            {hotelResponse?.fromCache && (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground" data-testid="badge-cache-status">
                <Database className="h-3 w-3" />
                <span data-testid="text-cache-updated">
                  {hotelResponse.lastUpdated ? (
                    <>Updated {formatDistanceToNow(new Date(hotelResponse.lastUpdated), { addSuffix: true })}</>
                  ) : (
                    <>From cache</>
                  )}
                </span>
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedHotels.map((hotelData) => {
              const hotel = hotelData.hotel;
              const offer = hotelData.offers?.[0];
              
              const nights = offer 
                ? Math.max(1, Math.ceil((new Date(offer.checkOutDate).getTime() - new Date(offer.checkInDate).getTime()) / (1000 * 60 * 60 * 24)))
                : 1;
              const totalPrice = offer ? parseFloat(offer.price.total) : 0;
              const pricePerNight = totalPrice / nights;
              
              const refundStatus = offer?.policies?.refundable?.cancellationRefund;
              const isRefundable = refundStatus === "REFUNDABLE_UP_TO_DEADLINE" || refundStatus === "REFUNDABLE";
              const isNonRefundable = refundStatus === "NON_REFUNDABLE";
              const cancellationDeadline = offer?.policies?.cancellations?.[0]?.deadline;
              const boardType = offer?.boardType;
              const boardLabel = boardType ? boardTypeLabels[boardType] || boardType : null;
              
              const roomEstimate = offer?.room.typeEstimated;
              const bedInfo = roomEstimate?.beds && roomEstimate?.bedType 
                ? `${roomEstimate.beds} ${roomEstimate.bedType.toLowerCase()}` 
                : null;
              const roomCategory = roomEstimate?.category?.replace(/_/g, " ").toLowerCase();
              
              const taxes = offer?.price.taxes?.filter(t => !t.included);
              const taxTotal = taxes?.reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0;

              const proximityScore = hotel.latitude && hotel.longitude && activityLocations.length > 0
                ? getProximityScore(hotel.latitude, hotel.longitude, activityLocations)
                : null;

              return (
                <Card key={hotel.hotelId} className="overflow-hidden hover-elevate">
                  <div className="h-32 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center relative">
                    <Hotel className="h-12 w-12 text-blue-400" />
                    {isRefundable && (
                      <Badge className="absolute top-2 left-2 bg-green-600 text-white text-xs">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Refundable
                      </Badge>
                    )}
                    {isNonRefundable && (
                      <Badge className="absolute top-2 left-2 bg-amber-600 text-white text-xs">
                        <ShieldX className="h-3 w-3 mr-1" />
                        Non-refundable
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold line-clamp-1">{hotel.name}</h4>
                      {hotel.rating && (
                        <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                          <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
                          {hotel.rating}
                        </Badge>
                      )}
                    </div>

                    {hotel.address && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                        <MapPin className="h-3 w-3" />
                        <span className="line-clamp-1">
                          {hotel.address.cityName || hotel.cityCode}
                          {hotel.address.countryCode && `, ${hotel.address.countryCode}`}
                        </span>
                      </div>
                    )}

                    {proximityScore && (
                      <div className="mb-2">
                        <Badge variant={proximityScore.variant} className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          {proximityScore.label} to activities ({proximityScore.avgDistance.toFixed(1)} km avg)
                        </Badge>
                      </div>
                    )}

                    {offer && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          {bedInfo && (
                            <Badge variant="outline" className="text-xs">
                              <BedDouble className="h-3 w-3 mr-1" />
                              {bedInfo}
                            </Badge>
                          )}
                          {boardLabel && (
                            <Badge variant="outline" className="text-xs">
                              <Coffee className="h-3 w-3 mr-1" />
                              {boardLabel}
                            </Badge>
                          )}
                        </div>
                        
                        {roomCategory && (
                          <div className="text-xs text-muted-foreground capitalize">
                            {roomCategory}
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-sm text-muted-foreground">
                            {nights} night{nights !== 1 ? 's' : ''}
                          </span>
                          <div className="text-right">
                            <span className="font-bold text-lg">
                              ${pricePerNight.toFixed(2)}/night
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{offer.checkInDate} - {offer.checkOutDate}</span>
                          <span className="font-medium">${totalPrice.toFixed(2)} total</span>
                        </div>
                        
                        {taxTotal > 0 && (
                          <div className="text-xs text-muted-foreground">
                            + ${taxTotal.toFixed(2)} taxes & fees
                          </div>
                        )}
                        
                        {cancellationDeadline && isRefundable && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <AlertCircle className="h-3 w-3" />
                            Free cancellation until {new Date(cancellationDeadline).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    )}

                    {onSelectHotel && (
                      <Button
                        className="w-full mt-4 bg-[#FF385C] hover:bg-[#E23350]"
                        onClick={() => onSelectHotel(hotelData)}
                        data-testid={`button-select-hotel-${hotel.hotelId}`}
                      >
                        Select Hotel
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {hotels && hotels.length > 0 && filteredAndSortedHotels.length === 0 && !isLoading && !error && (
        <Card>
          <CardContent className="p-8 text-center">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No hotels match your filters</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {hotels.length} hotel{hotels.length !== 1 ? 's' : ''} found, but none match your current filter settings.
              Try lowering the minimum star rating or increasing the maximum price.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setShowModify(true)} data-testid="button-adjust-filters">
                <Settings2 className="h-4 w-4 mr-1" />
                Adjust Filters
              </Button>
              <Button onClick={resetFilters} data-testid="button-reset-filters-empty">
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {hotels && hotels.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Hotel className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No hotels found</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Try different dates or city for more options.
            </p>
            <Button variant="outline" onClick={() => setShowModify(true)}>
              Modify Search
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
