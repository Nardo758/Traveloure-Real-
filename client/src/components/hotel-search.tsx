import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Hotel, Star, MapPin, Search, Users, Calendar, ChevronDown, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface HotelSearchProps {
  destination?: string;
  checkIn?: Date;
  checkOut?: Date;
  guests?: number;
  onSelectHotel?: (hotel: any) => void;
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
  };
  offers?: Array<{
    id: string;
    checkInDate: string;
    checkOutDate: string;
    room: {
      type: string;
      description?: {
        text: string;
      };
    };
    price: {
      currency: string;
      total: string;
    };
  }>;
}

export function HotelSearch({
  destination,
  checkIn,
  checkOut,
  guests = 2,
  onSelectHotel,
}: HotelSearchProps) {
  const [cityCode, setCityCode] = useState("");
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
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [detectedCity, setDetectedCity] = useState<LocationSuggestion | null>(null);

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
    setSearchTriggered(false);
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
    staleTime: 60000,
  });

  useEffect(() => {
    if (autoDetectedLocations && autoDetectedLocations.length > 0 && !cityCode) {
      const best = autoDetectedLocations[0];
      setCityCode(best.iataCode);
      setDetectedCity(best);
    }
  }, [autoDetectedLocations, cityCode]);

  const {
    data: hotels,
    isLoading,
    error,
  } = useQuery<HotelOffer[]>({
    queryKey: [
      "/api/amadeus/hotels",
      cityCode,
      checkInDate,
      checkOutDate,
      adults,
      rooms,
    ],
    enabled:
      searchTriggered &&
      !!cityCode &&
      !!checkInDate &&
      !!checkOutDate &&
      !!adults,
    queryFn: async () => {
      const params = new URLSearchParams({
        cityCode,
        checkInDate,
        checkOutDate,
        adults: adults.toString(),
        rooms: rooms.toString(),
      });

      const res = await fetch(`/api/amadeus/hotels?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Hotel search failed");
      }
      return res.json();
    },
  });

  const handleSearch = () => {
    if (cityCode && checkInDate && checkOutDate && adults) {
      setSearchTriggered(true);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hotel className="h-5 w-5" />
            Search Hotels
            {destination && detectedCity && (
              <Badge variant="secondary" className="ml-2 text-xs">
                In: {detectedCity.name} ({detectedCity.iataCode})
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-2 lg:col-span-2">
              <Label>City</Label>
              <Popover open={cityOpen} onOpenChange={setCityOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={cityOpen}
                    className={cn(
                      "w-full justify-between font-normal",
                      detectedCity && "border-green-500"
                    )}
                    data-testid="input-hotel-city"
                  >
                    {cityCode ? (
                      <span>
                        {cityCode}
                        {detectedCity && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({detectedCity.name})
                          </span>
                        )}
                      </span>
                    ) : autoDetectLoading ? (
                      <span className="flex items-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Detecting...
                      </span>
                    ) : (
                      "Search cities..."
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Type city name..."
                      value={citySearch}
                      onValueChange={setCitySearch}
                    />
                    <CommandList>
                      {cityLoading && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
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
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                cityCode === loc.iataCode ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{loc.iataCode}</span>
                              <span className="text-xs text-muted-foreground">
                                {loc.name}{loc.countryCode ? `, ${loc.countryCode}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {detectedCity && (
                <p className="text-xs text-green-600">
                  Auto-detected from "{destination}"
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkin">Check-in</Label>
              <Input
                id="checkin"
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                data-testid="input-hotel-checkin"
              />
              {checkIn && checkInDate === format(checkIn, "yyyy-MM-dd") && (
                <p className="text-xs text-green-600">Synced from trip</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkout">Check-out</Label>
              <Input
                id="checkout"
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                data-testid="input-hotel-checkout"
              />
              {checkOut && checkOutDate === format(checkOut, "yyyy-MM-dd") && (
                <p className="text-xs text-green-600">Synced from trip</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="guests">Guests</Label>
              <Input
                id="guests"
                type="number"
                min={1}
                max={9}
                value={adults}
                onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                data-testid="input-hotel-guests"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rooms">Rooms</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="rooms"
                  type="number"
                  min={1}
                  max={5}
                  value={rooms}
                  onChange={(e) => setRooms(parseInt(e.target.value) || 1)}
                  className="w-16"
                  data-testid="input-hotel-rooms"
                />
                <Button
                  onClick={handleSearch}
                  disabled={!cityCode || !checkInDate || !checkOutDate}
                  className="flex-1 bg-[#FF385C] hover:bg-[#E23350]"
                  data-testid="button-search-hotels"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {hotels && hotels.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">
            Found {hotels.length} hotel{hotels.length !== 1 ? "s" : ""}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hotels.map((hotelData) => {
              const hotel = hotelData.hotel;
              const offer = hotelData.offers?.[0];

              return (
                <Card key={hotel.hotelId} className="overflow-hidden hover-elevate">
                  <div className="h-32 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center">
                    <Hotel className="h-12 w-12 text-blue-400" />
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
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                        <MapPin className="h-3 w-3" />
                        <span className="line-clamp-1">
                          {hotel.address.cityName || hotel.cityCode}
                          {hotel.address.countryCode && `, ${hotel.address.countryCode}`}
                        </span>
                      </div>
                    )}

                    {offer && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {offer.room.type}
                          </span>
                          <span className="font-bold text-lg">
                            ${offer.price.total}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {offer.checkInDate} - {offer.checkOutDate}
                        </div>
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

      {hotels && hotels.length === 0 && searchTriggered && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Hotel className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No hotels found</h3>
            <p className="text-muted-foreground text-sm">
              Try different dates or city for more options.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
