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
import { Plane, Clock, ArrowRight, Search, Users, Calendar, ChevronDown, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

interface LocationSuggestion {
  iataCode: string;
  name: string;
  cityName?: string;
  countryCode?: string;
  subType: string;
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
  const [originOpen, setOriginOpen] = useState(false);
  const [originSearch, setOriginSearch] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState("");
  const [departureDate, setDepartureDate] = useState(
    startDate ? format(startDate, "yyyy-MM-dd") : ""
  );
  const [returnDate, setReturnDate] = useState(
    endDate ? format(endDate, "yyyy-MM-dd") : ""
  );
  const [adults, setAdults] = useState(travelers);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [detectedDestination, setDetectedDestination] = useState<LocationSuggestion | null>(null);

  useEffect(() => {
    setDepartureDate(startDate ? format(startDate, "yyyy-MM-dd") : "");
  }, [startDate]);

  useEffect(() => {
    setReturnDate(endDate ? format(endDate, "yyyy-MM-dd") : "");
  }, [endDate]);

  useEffect(() => {
    setAdults(travelers || 1);
  }, [travelers]);

  useEffect(() => {
    setDestinationCode("");
    setDetectedDestination(null);
    setSearchTriggered(false);
  }, [destination]);

  const { data: originSuggestions, isLoading: originLoading } = useQuery<LocationSuggestion[]>({
    queryKey: ["/api/amadeus/locations", "origin", originSearch],
    enabled: originSearch.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: originSearch,
        subType: "AIRPORT,CITY",
      });
      const res = await fetch(`/api/amadeus/locations?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: destinationSuggestions, isLoading: destinationLoading } = useQuery<LocationSuggestion[]>({
    queryKey: ["/api/amadeus/locations", "destination", destinationSearch],
    enabled: destinationSearch.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: destinationSearch,
        subType: "AIRPORT,CITY",
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
    queryKey: ["/api/amadeus/locations", "autodetect", destination],
    enabled: !!destination && destination.length >= 2 && !destinationCode,
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: destination!,
        subType: "AIRPORT,CITY",
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
    if (autoDetectedLocations && autoDetectedLocations.length > 0 && !destinationCode) {
      const best = autoDetectedLocations[0];
      setDestinationCode(best.iataCode);
      setDetectedDestination(best);
    }
  }, [autoDetectedLocations, destinationCode]);

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
            {destination && detectedDestination && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Flying to: {detectedDestination.name} ({detectedDestination.iataCode})
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>From (Departure Airport)</Label>
              <Popover open={originOpen} onOpenChange={setOriginOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={originOpen}
                    className="w-full justify-between font-normal"
                    data-testid="input-flight-origin"
                  >
                    {origin || "Search airports..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Type city or airport..."
                      value={originSearch}
                      onValueChange={setOriginSearch}
                    />
                    <CommandList>
                      {originLoading && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                          Searching...
                        </div>
                      )}
                      <CommandEmpty>No airports found.</CommandEmpty>
                      <CommandGroup>
                        {originSuggestions?.map((loc) => (
                          <CommandItem
                            key={loc.iataCode}
                            value={`${loc.name} ${loc.iataCode}`}
                            onSelect={() => {
                              setOrigin(loc.iataCode);
                              setOriginOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                origin === loc.iataCode ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{loc.iataCode}</span>
                              <span className="text-xs text-muted-foreground">
                                {loc.name}{loc.cityName ? `, ${loc.cityName}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>To (Arrival Airport)</Label>
              <Popover open={destinationOpen} onOpenChange={setDestinationOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={destinationOpen}
                    className={cn(
                      "w-full justify-between font-normal",
                      detectedDestination && "border-green-500"
                    )}
                    data-testid="input-flight-destination"
                  >
                    {destinationCode ? (
                      <span>
                        {destinationCode}
                        {detectedDestination && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({detectedDestination.name})
                          </span>
                        )}
                      </span>
                    ) : autoDetectLoading ? (
                      <span className="flex items-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Detecting...
                      </span>
                    ) : (
                      "Search airports..."
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Type city or airport..."
                      value={destinationSearch}
                      onValueChange={setDestinationSearch}
                    />
                    <CommandList>
                      {destinationLoading && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                          Searching...
                        </div>
                      )}
                      <CommandEmpty>No airports found.</CommandEmpty>
                      <CommandGroup>
                        {destinationSuggestions?.map((loc) => (
                          <CommandItem
                            key={loc.iataCode}
                            value={`${loc.name} ${loc.iataCode}`}
                            onSelect={() => {
                              setDestinationCode(loc.iataCode);
                              setDetectedDestination(loc);
                              setDestinationOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                destinationCode === loc.iataCode ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{loc.iataCode}</span>
                              <span className="text-xs text-muted-foreground">
                                {loc.name}{loc.cityName ? `, ${loc.cityName}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {detectedDestination && (
                <p className="text-xs text-green-600">
                  Auto-detected from "{destination}"
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="departure">Departure Date</Label>
              <Input
                id="departure"
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                data-testid="input-flight-departure"
              />
              {startDate && departureDate === format(startDate, "yyyy-MM-dd") && (
                <p className="text-xs text-green-600">Synced from trip dates</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="return">Return Date</Label>
              <Input
                id="return"
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                data-testid="input-flight-return"
              />
              {endDate && returnDate === format(endDate, "yyyy-MM-dd") && (
                <p className="text-xs text-green-600">Synced from trip dates</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="adults">Travelers</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="adults"
                  type="number"
                  min={1}
                  max={9}
                  value={adults}
                  onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                  className="w-20"
                  data-testid="input-flight-adults"
                />
                <Button
                  onClick={handleSearch}
                  disabled={!origin || !destinationCode || !departureDate}
                  className="flex-1 bg-[#FF385C] hover:bg-[#E23350]"
                  data-testid="button-search-flights"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
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
            {error.message || "Failed to search flights. Please try again."}
          </CardContent>
        </Card>
      )}

      {flights && flights.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">
            Found {flights.length} flight{flights.length !== 1 ? "s" : ""}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {flights.map((flight) => {
              const outbound = flight.itineraries[0];
              const inbound = flight.itineraries[1];
              const firstSeg = outbound?.segments[0];
              const lastSeg = outbound?.segments[outbound.segments.length - 1];

              return (
                <Card key={flight.id} className="hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-lg">
                            {firstSeg?.departure.iataCode}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                          <span className="font-bold text-lg">
                            {lastSeg?.arrival.iataCode}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(firstSeg?.departure.at || "")}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        ${flight.price.total}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(outbound?.duration || "")}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Plane className="h-3 w-3" />
                          <span>
                            {firstSeg?.carrierCode} {firstSeg?.number}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {outbound?.segments.length === 1
                            ? "Direct"
                            : `${outbound?.segments.length - 1} stop${
                                outbound?.segments.length > 2 ? "s" : ""
                              }`}
                        </Badge>
                      </div>

                      <div className="text-muted-foreground">
                        {formatTime(firstSeg?.departure.at || "")} -{" "}
                        {formatTime(lastSeg?.arrival.at || "")}
                      </div>

                      {inbound && (
                        <div className="pt-2 border-t mt-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Return:</span>
                            <span>{formatDate(inbound.segments[0]?.departure.at || "")}</span>
                            <span>•</span>
                            <span>{formatDuration(inbound.duration)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {onSelectFlight && (
                      <Button
                        className="w-full mt-4 bg-[#FF385C] hover:bg-[#E23350]"
                        onClick={() => onSelectFlight(flight)}
                        data-testid={`button-select-flight-${flight.id}`}
                      >
                        Select Flight
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {flights && flights.length === 0 && searchTriggered && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Plane className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No flights found</h3>
            <p className="text-muted-foreground text-sm">
              Try different dates or airports for more options.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
