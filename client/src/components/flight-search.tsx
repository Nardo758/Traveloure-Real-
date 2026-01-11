import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plane, Clock, ArrowRight, ChevronDown, Check, Loader2, Settings2, Calendar, Users, MapPin } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface FlightSearchProps {
  destination?: string;
  origin?: string;
  startDate?: Date;
  endDate?: Date;
  travelers?: number;
  maxPrice?: number;
  stops?: "any" | "nonstop" | "1stop";
  sortBy?: "price" | "duration" | "departure";
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
  origin: originProp,
  startDate,
  endDate,
  travelers = 1,
  maxPrice = 5000,
  stops = "any",
  sortBy = "price",
  onSelectFlight,
}: FlightSearchProps) {
  const [originCode, setOriginCode] = useState("");
  const [originOpen, setOriginOpen] = useState(false);
  const [originSearch, setOriginSearch] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState<LocationSuggestion | null>(null);
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
  const [detectedDestination, setDetectedDestination] = useState<LocationSuggestion | null>(null);
  const [detectedOrigin, setDetectedOrigin] = useState<LocationSuggestion | null>(null);
  const [showModify, setShowModify] = useState(false);

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
  }, [destination]);

  useEffect(() => {
    setOriginCode("");
    setDetectedOrigin(null);
  }, [originProp]);

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

  const { data: autoDetectedDestinations, isLoading: autoDetectDestLoading } = useQuery<LocationSuggestion[]>({
    queryKey: ["/api/amadeus/locations", "autodetect-dest", destination],
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

  const { data: autoDetectedOrigins, isLoading: autoDetectOriginLoading } = useQuery<LocationSuggestion[]>({
    queryKey: ["/api/amadeus/locations", "autodetect-origin", originProp],
    enabled: !!originProp && originProp.length >= 2 && !originCode,
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: originProp!,
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
    if (autoDetectedDestinations && autoDetectedDestinations.length > 0 && !destinationCode) {
      const best = autoDetectedDestinations[0];
      setDestinationCode(best.iataCode);
      setDetectedDestination(best);
    }
  }, [autoDetectedDestinations, destinationCode]);

  useEffect(() => {
    if (autoDetectedOrigins && autoDetectedOrigins.length > 0 && !originCode) {
      const best = autoDetectedOrigins[0];
      setOriginCode(best.iataCode);
      setDetectedOrigin(best);
      setSelectedOrigin(best);
    }
  }, [autoDetectedOrigins, originCode]);

  const canSearch = !!originCode && !!destinationCode && !!departureDate && !!adults;

  const {
    data: flights,
    isLoading,
    error,
    refetch,
  } = useQuery<FlightOffer[]>({
    queryKey: [
      "/api/amadeus/flights",
      originCode,
      destinationCode,
      departureDate,
      returnDate,
      adults,
    ],
    enabled: canSearch,
    queryFn: async () => {
      const params = new URLSearchParams({
        origin: originCode,
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

  const isDetecting = (autoDetectDestLoading && !destinationCode && !!destination) || 
                      (autoDetectOriginLoading && !originCode && !!originProp);
  const destDetectionFailed = !autoDetectDestLoading && autoDetectedDestinations && autoDetectedDestinations.length === 0 && !destinationCode && !!destination;
  const originDetectionFailed = !autoDetectOriginLoading && autoDetectedOrigins && autoDetectedOrigins.length === 0 && !originCode && !!originProp;

  const parseDuration = (duration: string): number => {
    const match = duration.match(/PT(\d+)H?(\d+)?M?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || "0");
    const minutes = parseInt(match[2] || "0");
    return hours * 60 + minutes;
  };

  const filteredAndSortedFlights = useMemo(() => {
    if (!flights) return [];
    
    let result = flights.filter((flight) => {
      const price = parseFloat(flight.price.total);
      if (price > maxPrice) return false;
      
      const outboundStops = (flight.itineraries[0]?.segments.length || 1) - 1;
      
      if (stops === "nonstop" && outboundStops > 0) return false;
      if (stops === "1stop" && outboundStops > 1) return false;
      
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "price") {
        return parseFloat(a.price.total) - parseFloat(b.price.total);
      } else if (sortBy === "duration") {
        const durationA = a.itineraries.reduce((sum, it) => sum + parseDuration(it.duration), 0);
        const durationB = b.itineraries.reduce((sum, it) => sum + parseDuration(it.duration), 0);
        return durationA - durationB;
      } else if (sortBy === "departure") {
        const depA = new Date(a.itineraries[0]?.segments[0]?.departure.at || 0).getTime();
        const depB = new Date(b.itineraries[0]?.segments[0]?.departure.at || 0).getTime();
        return depA - depB;
      }
      return 0;
    });

    return result;
  }, [flights, maxPrice, stops, sortBy]);

  const hasTravelDetails = !!originProp && !!destination && !!startDate;
  const needsInitialForm = !originCode || !destinationCode || !departureDate;

  if (isDetecting) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Finding flights...</p>
        </CardContent>
      </Card>
    );
  }

  if (needsInitialForm && !hasTravelDetails) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <Plane className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-lg mb-2">Search Flights</h3>
          <p className="text-muted-foreground">
            Fill in your Travel Details above (origin city, destination, and dates) to search for flights.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (needsInitialForm && hasTravelDetails && (destDetectionFailed || originDetectionFailed)) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-6">
          <div className="text-center mb-4">
            <Plane className="h-10 w-10 mx-auto mb-2 text-[#FF385C]" />
            <h3 className="font-semibold text-lg mb-1">Airport Detection Failed</h3>
          </div>

          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
            {destDetectionFailed && originDetectionFailed 
              ? `We couldn't detect airports for "${originProp}" or "${destination}" automatically. Please select them below.`
              : destDetectionFailed 
                ? `We couldn't find "${destination}" automatically. Please select your destination below.`
                : `We couldn't find "${originProp}" automatically. Please select your origin below.`
            }
          </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>From (Departure)</Label>
                <Popover open={originOpen} onOpenChange={setOriginOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={originOpen}
                      className={cn("w-full justify-between h-11", originCode && "border-green-500")}
                      data-testid="input-flight-origin"
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {selectedOrigin ? (
                          <span>{selectedOrigin.iataCode} - {selectedOrigin.name}</span>
                        ) : (
                          <span className="text-muted-foreground">Search departure city...</span>
                        )}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
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
                              value={`${loc.name} ${loc.iataCode} ${loc.cityName || ""}`}
                              onSelect={() => {
                                setOriginCode(loc.iataCode);
                                setSelectedOrigin(loc);
                                setOriginOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", originCode === loc.iataCode ? "opacity-100" : "opacity-0")} />
                              <Badge variant="secondary" className="font-mono mr-2">{loc.iataCode}</Badge>
                              <span className="text-sm">{loc.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>To (Destination)</Label>
                <Popover open={destinationOpen} onOpenChange={setDestinationOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={destinationOpen}
                      className={cn("w-full justify-between h-11", destinationCode && "border-green-500")}
                      data-testid="input-flight-destination"
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {detectedDestination ? (
                          <span>{detectedDestination.iataCode} - {detectedDestination.name}</span>
                        ) : destinationCode ? (
                          <span>{destinationCode}</span>
                        ) : (
                          <span className="text-muted-foreground">Search destination city...</span>
                        )}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
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
                              value={`${loc.name} ${loc.iataCode} ${loc.cityName || ""}`}
                              onSelect={() => {
                                setDestinationCode(loc.iataCode);
                                setDetectedDestination(loc);
                                setDestinationOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", destinationCode === loc.iataCode ? "opacity-100" : "opacity-0")} />
                              <Badge variant="secondary" className="font-mono mr-2">{loc.iataCode}</Badge>
                              <span className="text-sm">{loc.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Departure Date</Label>
                <Input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className={cn(departureDate && "border-green-500")}
                  data-testid="input-flight-departure-initial"
                />
              </div>

              <div className="space-y-2">
                <Label>Return Date (Optional)</Label>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  data-testid="input-flight-return-initial"
                />
              </div>
            </div>
          </CardContent>
        </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Plane className="h-3 w-3" />
            {selectedOrigin?.name || origin} → {detectedDestination?.name || destinationCode}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            {departureDate}
            {returnDate && ` - ${returnDate}`}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {adults} traveler{adults !== 1 ? "s" : ""}
          </Badge>
        </div>
        <Collapsible open={showModify} onOpenChange={setShowModify}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1" data-testid="button-modify-flight-search">
              <Settings2 className="h-4 w-4" />
              Modify
              <ChevronDown className={cn("h-4 w-4 transition-transform", showModify && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div className="space-y-2">
                    <Label>From</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal">
                          {originCode}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[280px] p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search..."
                            value={originSearch}
                            onValueChange={setOriginSearch}
                          />
                          <CommandList>
                            {originLoading && (
                              <div className="p-3 text-center text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                              </div>
                            )}
                            <CommandEmpty>No airports found.</CommandEmpty>
                            <CommandGroup>
                              {originSuggestions?.map((loc) => (
                                <CommandItem
                                  key={loc.iataCode}
                                  value={`${loc.name} ${loc.iataCode}`}
                                  onSelect={() => {
                                    setOriginCode(loc.iataCode);
                                    setSelectedOrigin(loc);
                                  }}
                                >
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
                    <Label>To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal">
                          {destinationCode}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[280px] p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search..."
                            value={destinationSearch}
                            onValueChange={setDestinationSearch}
                          />
                          <CommandList>
                            {destinationLoading && (
                              <div className="p-3 text-center text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
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
                                  }}
                                >
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
                    <Label>Departure</Label>
                    <Input
                      type="date"
                      value={departureDate}
                      onChange={(e) => setDepartureDate(e.target.value)}
                      data-testid="input-flight-departure"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Return</Label>
                    <Input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      data-testid="input-flight-return"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Travelers</Label>
                    <Input
                      type="number"
                      min={1}
                      max={9}
                      value={adults}
                      onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                      data-testid="input-flight-adults"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => { refetch(); setShowModify(false); }}
                      className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                      data-testid="button-search-flights"
                    >
                      Update
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

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

      {filteredAndSortedFlights && filteredAndSortedFlights.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">
            {filteredAndSortedFlights.length} flight{filteredAndSortedFlights.length !== 1 ? "s" : ""} available
            {flights && flights.length !== filteredAndSortedFlights.length && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (filtered from {flights.length})
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAndSortedFlights.map((flight) => {
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

      {flights && flights.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Plane className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No flights found</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Try different dates or airports for more options.
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
