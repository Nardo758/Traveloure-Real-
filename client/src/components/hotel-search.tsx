import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Hotel, Star, MapPin, Search, Users, Calendar } from "lucide-react";
import { format } from "date-fns";

interface HotelSearchProps {
  destination?: string;
  checkIn?: Date;
  checkOut?: Date;
  guests?: number;
  onSelectHotel?: (hotel: any) => void;
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
  const [checkInDate, setCheckInDate] = useState(
    checkIn ? format(checkIn, "yyyy-MM-dd") : ""
  );
  const [checkOutDate, setCheckOutDate] = useState(
    checkOut ? format(checkOut, "yyyy-MM-dd") : ""
  );
  const [adults, setAdults] = useState(guests);
  const [rooms, setRooms] = useState(1);
  const [searchTriggered, setSearchTriggered] = useState(false);

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
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City Code</Label>
              <Input
                id="city"
                placeholder="e.g., PAR, LON, NYC"
                value={cityCode}
                onChange={(e) => setCityCode(e.target.value.toUpperCase())}
                maxLength={3}
                data-testid="input-hotel-city"
              />
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="guests">Guests</Label>
              <Input
                id="guests"
                type="number"
                min={1}
                max={9}
                value={adults}
                onChange={(e) => setAdults(parseInt(e.target.value, 10) || 1)}
                data-testid="input-hotel-guests"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rooms">Rooms</Label>
              <Input
                id="rooms"
                type="number"
                min={1}
                max={9}
                value={rooms}
                onChange={(e) => setRooms(parseInt(e.target.value, 10) || 1)}
                data-testid="input-hotel-rooms"
              />
            </div>
          </div>
          <Button
            className="mt-4 w-full md:w-auto"
            onClick={handleSearch}
            disabled={!cityCode || !checkInDate || !checkOutDate}
            data-testid="button-search-hotels"
          >
            <Search className="h-4 w-4 mr-2" />
            Search Hotels
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-40 w-full rounded-md mb-3" />
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-2" />
                <Skeleton className="h-6 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-destructive">
            {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {hotels && hotels.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Hotel className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hotels found for this destination and dates.</p>
            <p className="text-sm mt-2">Try different dates or city code.</p>
          </CardContent>
        </Card>
      )}

      {hotels && hotels.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            {hotels.length} hotel{hotels.length > 1 ? "s" : ""} found
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hotels.map((hotelData) => {
              const hotel = hotelData.hotel;
              const offer = hotelData.offers?.[0];
              const rating = hotel.rating ? parseInt(hotel.rating, 10) : 0;

              return (
                <Card
                  key={hotel.hotelId}
                  className="hover-elevate cursor-pointer overflow-hidden"
                  onClick={() => onSelectHotel?.(hotelData)}
                  data-testid={`card-hotel-${hotel.hotelId}`}
                >
                  <div className="h-40 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Hotel className="h-16 w-16 text-primary/40" />
                  </div>
                  <CardContent className="p-4">
                    <h4 className="font-semibold line-clamp-2 mb-2">
                      {hotel.name}
                    </h4>
                    {rating > 0 && (
                      <div className="flex items-center gap-1 mb-2">
                        {Array.from({ length: rating }).map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-amber-400 text-amber-400"
                          />
                        ))}
                      </div>
                    )}
                    {hotel.address && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                        <MapPin className="h-3 w-3" />
                        <span className="line-clamp-1">
                          {hotel.address.cityName || hotel.cityCode}
                          {hotel.address.countryCode &&
                            `, ${hotel.address.countryCode}`}
                        </span>
                      </div>
                    )}
                    {offer && (
                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <div className="text-xl font-bold text-primary">
                            ${parseFloat(offer.price.total).toFixed(0)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            per night
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectHotel?.(hotelData);
                          }}
                          data-testid={`button-select-hotel-${hotel.hotelId}`}
                        >
                          Select
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
