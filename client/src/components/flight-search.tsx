import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plane, Clock, ArrowRight, Search, Users, Calendar } from "lucide-react";
import { format } from "date-fns";

interface FlightSearchProps {
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  travelers?: number;
  onSelectFlight?: (flight: any) => void;
}

interface FlightSegment {
  departure: { iataCode: string; at: string };
  arrival: { iataCode: string; at: string };
  carrierCode: string;
  number: string;
  duration: string;
  numberOfStops: number;
}

interface FlightOffer {
  id: string;
  price: { total: string; currency: string };
  itineraries: Array<{
    duration: string;
    segments: FlightSegment[];
  }>;
}

function formatDuration(duration: string): string {
  const match = duration.match(/PT(\d+H)?(\d+M)?/);
  if (!match) return duration;
  const hours = match[1] ? match[1].replace("H", "h ") : "";
  const minutes = match[2] ? match[2].replace("M", "m") : "";
  return `${hours}${minutes}`.trim();
}

function formatTime(dateTime: string): string {
  return new Date(dateTime).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateTime: string): string {
  return new Date(dateTime).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function FlightSearch({
  destination,
  startDate,
  endDate,
  travelers = 1,
  onSelectFlight,
}: FlightSearchProps) {
  const [origin, setOrigin] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  const [departureDate, setDepartureDate] = useState(
    startDate ? format(startDate, "yyyy-MM-dd") : ""
  );
  const [returnDate, setReturnDate] = useState(
    endDate ? format(endDate, "yyyy-MM-dd") : ""
  );
  const [adults, setAdults] = useState(travelers);
  const [searchTriggered, setSearchTriggered] = useState(false);

  const {
    data: flights,
    isLoading,
    error,
  } = useQuery<FlightOffer[]>({
    queryKey: [
      "/api/amadeus/flights",
      origin,
      destinationCode,
      departureDate,
      returnDate,
      adults,
    ],
    enabled:
      searchTriggered &&
      !!origin &&
      !!destinationCode &&
      !!departureDate &&
      !!adults,
    queryFn: async () => {
      const params = new URLSearchParams({
        origin,
        destination: destinationCode,
        departureDate,
        adults: adults.toString(),
        max: "10",
      });
      if (returnDate) params.append("returnDate", returnDate);

      const res = await fetch(`/api/amadeus/flights?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Flight search failed");
      }
      return res.json();
    },
  });

  const handleSearch = () => {
    if (origin && destinationCode && departureDate && adults) {
      setSearchTriggered(true);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Search Flights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="origin">From (Airport Code)</Label>
              <Input
                id="origin"
                placeholder="e.g., JFK, LAX"
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                maxLength={3}
                data-testid="input-flight-origin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destination">To (Airport Code)</Label>
              <Input
                id="destination"
                placeholder="e.g., CDG, LHR"
                value={destinationCode}
                onChange={(e) => setDestinationCode(e.target.value.toUpperCase())}
                maxLength={3}
                data-testid="input-flight-destination"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="departure">Departure</Label>
              <Input
                id="departure"
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                data-testid="input-flight-departure"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="return">Return</Label>
              <Input
                id="return"
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                data-testid="input-flight-return"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passengers">Passengers</Label>
              <Input
                id="passengers"
                type="number"
                min={1}
                max={9}
                value={adults}
                onChange={(e) => setAdults(parseInt(e.target.value, 10) || 1)}
                data-testid="input-flight-passengers"
              />
            </div>
          </div>
          <Button
            className="mt-4 w-full md:w-auto"
            onClick={handleSearch}
            disabled={!origin || !destinationCode || !departureDate}
            data-testid="button-search-flights"
          >
            <Search className="h-4 w-4 mr-2" />
            Search Flights
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
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

      {flights && flights.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Plane className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No flights found for this route and date.</p>
            <p className="text-sm mt-2">Try different dates or airports.</p>
          </CardContent>
        </Card>
      )}

      {flights && flights.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            {flights.length} flight{flights.length > 1 ? "s" : ""} found
          </h3>
          {flights.map((flight) => {
            const outbound = flight.itineraries[0];
            const returnFlight = flight.itineraries[1];
            const firstSegment = outbound?.segments[0];
            const lastSegment = outbound?.segments[outbound.segments.length - 1];

            return (
              <Card
                key={flight.id}
                className="hover-elevate cursor-pointer"
                onClick={() => onSelectFlight?.(flight)}
                data-testid={`card-flight-${flight.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="text-center">
                          <div className="text-lg font-bold">
                            {formatTime(firstSegment?.departure.at || "")}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {firstSegment?.departure.iataCode}
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col items-center">
                          <div className="text-xs text-muted-foreground mb-1">
                            {formatDuration(outbound?.duration || "")}
                          </div>
                          <div className="w-full h-px bg-border relative">
                            <Plane className="h-4 w-4 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background text-muted-foreground" />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {outbound?.segments.length === 1
                              ? "Direct"
                              : `${outbound?.segments.length - 1} stop${
                                  outbound?.segments.length > 2 ? "s" : ""
                                }`}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold">
                            {formatTime(lastSegment?.arrival.at || "")}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {lastSegment?.arrival.iataCode}
                          </div>
                        </div>
                      </div>
                      {returnFlight && (
                        <div className="flex items-center gap-4 pt-2 border-t mt-2">
                          <div className="text-center">
                            <div className="text-sm font-medium">
                              {formatTime(
                                returnFlight.segments[0]?.departure.at || ""
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {returnFlight.segments[0]?.departure.iataCode}
                            </div>
                          </div>
                          <div className="flex-1 flex items-center justify-center">
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-medium">
                              {formatTime(
                                returnFlight.segments[
                                  returnFlight.segments.length - 1
                                ]?.arrival.at || ""
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {
                                returnFlight.segments[
                                  returnFlight.segments.length - 1
                                ]?.arrival.iataCode
                              }
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-2xl font-bold text-primary">
                        ${parseFloat(flight.price.total).toFixed(0)}
                      </div>
                      <Badge variant="secondary">
                        {flight.price.currency}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectFlight?.(flight);
                        }}
                        data-testid={`button-select-flight-${flight.id}`}
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
