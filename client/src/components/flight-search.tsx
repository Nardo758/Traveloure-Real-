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
import { Plane, Clock, ArrowRight, ChevronDown, Check, Loader2, Settings2, Calendar, Users, MapPin, Luggage, Briefcase, AlertCircle, Database } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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
  departure: { iataCode: string; terminal?: string; at: string };
  arrival: { iataCode: string; terminal?: string; at: string };
  carrierCode: string;
  number: string;
  duration: string;
  numberOfStops: number;
  aircraft?: { code: string };
  operating?: { carrierCode: string };
}

interface TravelerPricing {
  travelerId: string;
  fareOption: string;
  travelerType: string;
  price: { currency: string; total: string; base?: string };
  fareDetailsBySegment?: Array<{
    segmentId: string;
    cabin?: string;
    fareBasis?: string;
    brandedFare?: string;
    class?: string;
    includedCheckedBags?: { weight?: number; weightUnit?: string; quantity?: number };
  }>;
}

interface FlightOffer {
  id: string;
  source: string;
  instantTicketingRequired?: boolean;
  nonHomogeneous?: boolean;
  oneWay?: boolean;
  lastTicketingDate?: string;
  numberOfBookableSeats?: number;
  price: { 
    total: string; 
    currency: string; 
    base?: string;
    grandTotal?: string;
    fees?: Array<{ amount: string; type: string }>;
  };
  pricingOptions?: {
    fareType?: string[];
    includedCheckedBagsOnly?: boolean;
  };
  validatingAirlineCodes?: string[];
  itineraries: Array<{
    duration: string;
    segments: FlightSegment[];
  }>;
  travelerPricings?: TravelerPricing[];
}

const airlineNames: Record<string, string> = {
  AA: "American Airlines",
  UA: "United Airlines",
  DL: "Delta Air Lines",
  WN: "Southwest Airlines",
  AS: "Alaska Airlines",
  B6: "JetBlue Airways",
  NK: "Spirit Airlines",
  F9: "Frontier Airlines",
  G4: "Allegiant Air",
  HA: "Hawaiian Airlines",
  AF: "Air France",
  BA: "British Airways",
  LH: "Lufthansa",
  KL: "KLM Royal Dutch",
  IB: "Iberia",
  AZ: "ITA Airways",
  LX: "Swiss International",
  OS: "Austrian Airlines",
  SK: "SAS Scandinavian",
  AY: "Finnair",
  TP: "TAP Air Portugal",
  EI: "Aer Lingus",
  EK: "Emirates",
  QR: "Qatar Airways",
  EY: "Etihad Airways",
  TK: "Turkish Airlines",
  SQ: "Singapore Airlines",
  CX: "Cathay Pacific",
  JL: "Japan Airlines",
  NH: "ANA",
  QF: "Qantas",
  AC: "Air Canada",
  AM: "Aeromexico",
  LA: "LATAM Airlines",
  AV: "Avianca",
  CM: "Copa Airlines",
  VS: "Virgin Atlantic",
  FR: "Ryanair",
  U2: "EasyJet",
  VY: "Vueling",
  W6: "Wizz Air",
};

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
  // Default dates: if not provided, use tomorrow and +7 days
  const defaultDeparture = format(new Date(Date.now() + 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const defaultReturn = format(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  
  const [departureDate, setDepartureDate] = useState(
    startDate ? format(startDate, "yyyy-MM-dd") : defaultDeparture
  );
  const [returnDate, setReturnDate] = useState(
    endDate ? format(endDate, "yyyy-MM-dd") : defaultReturn
  );
  const [tripType, setTripType] = useState<"roundtrip" | "oneway">("roundtrip");
  const [adults, setAdults] = useState(travelers);
  const [detectedDestination, setDetectedDestination] = useState<LocationSuggestion | null>(null);
  const [detectedOrigin, setDetectedOrigin] = useState<LocationSuggestion | null>(null);
  const [showModify, setShowModify] = useState(false);
  const [prevDestination, setPrevDestination] = useState(destination);
  const [prevOrigin, setPrevOrigin] = useState(originProp);
  
  // Step-by-step round trip selection state
  const [selectedOutboundFlight, setSelectedOutboundFlight] = useState<FlightOffer | null>(null);

  useEffect(() => {
    if (startDate) {
      setDepartureDate(format(startDate, "yyyy-MM-dd"));
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      setReturnDate(format(endDate, "yyyy-MM-dd"));
    }
  }, [endDate]);

  useEffect(() => {
    setAdults(travelers || 1);
  }, [travelers]);

  // Only reset destination code when destination prop actually changes to a different value
  useEffect(() => {
    if (destination !== prevDestination) {
      setPrevDestination(destination);
      setDestinationCode("");
      setDetectedDestination(null);
    }
  }, [destination, prevDestination]);

  // Only reset origin code when origin prop actually changes to a different value
  useEffect(() => {
    if (originProp !== prevOrigin) {
      setPrevOrigin(originProp);
      setOriginCode("");
      setDetectedOrigin(null);
    }
  }, [originProp, prevOrigin]);

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

  // For round-trip: always search one-way flights for outbound first
  const {
    data: flightResponse,
    isLoading,
    error,
    refetch,
  } = useQuery<{ flights: FlightOffer[]; fromCache: boolean; lastUpdated?: string }>({
    queryKey: [
      "/api/cache/flights",
      originCode,
      destinationCode,
      departureDate,
      adults,
      "outbound",
    ],
    enabled: canSearch,
    queryFn: async () => {
      const params = new URLSearchParams({
        origin: originCode,
        destination: destinationCode,
        departureDate,
        adults: adults.toString(),
      });
      // Always search one-way for outbound

      const res = await fetch(`/api/cache/flights?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Flight search failed");
      }
      return res.json();
    },
  });

  // Return flight query - only enabled after outbound is selected (for round-trip)
  const {
    data: returnFlightResponse,
    isLoading: returnLoading,
    error: returnError,
  } = useQuery<{ flights: FlightOffer[]; fromCache: boolean; lastUpdated?: string }>({
    queryKey: [
      "/api/cache/flights",
      destinationCode, // Swapped: destination becomes origin
      originCode,      // Swapped: origin becomes destination
      returnDate,
      adults,
      "return",
    ],
    enabled: tripType === "roundtrip" && !!selectedOutboundFlight && !!returnDate,
    queryFn: async () => {
      const params = new URLSearchParams({
        origin: destinationCode,     // Swapped
        destination: originCode,      // Swapped
        departureDate: returnDate,
        adults: adults.toString(),
      });

      const res = await fetch(`/api/cache/flights?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Return flight search failed");
      }
      return res.json();
    },
  });

  const flights = flightResponse?.flights;
  const returnFlights = returnFlightResponse?.flights;

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

  const filterAndSortFlights = (flightList: FlightOffer[] | undefined) => {
    if (!flightList) return [];
    
    let result = flightList.filter((flight) => {
      const price = parseFloat(flight.price.total);
      if (price > maxPrice) return false;
      
      const segmentStops = (flight.itineraries[0]?.segments.length || 1) - 1;
      
      if (stops === "nonstop" && segmentStops > 0) return false;
      if (stops === "1stop" && segmentStops > 1) return false;
      
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
  };

  const filteredAndSortedFlights = useMemo(() => filterAndSortFlights(flights), [flights, maxPrice, stops, sortBy]);
  const filteredAndSortedReturnFlights = useMemo(() => filterAndSortFlights(returnFlights), [returnFlights, maxPrice, stops, sortBy]);
  
  // Clear outbound selection when search params change
  useEffect(() => {
    setSelectedOutboundFlight(null);
  }, [originCode, destinationCode, departureDate]);

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

              <div className="space-y-2 col-span-2 md:col-span-1">
                <Label>Trip Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={tripType === "roundtrip" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTripType("roundtrip")}
                    className={cn("toggle-elevate", tripType === "roundtrip" && "toggle-elevated")}
                    data-testid="button-trip-roundtrip"
                  >
                    Round Trip
                  </Button>
                  <Button
                    type="button"
                    variant={tripType === "oneway" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTripType("oneway")}
                    className={cn("toggle-elevate", tripType === "oneway" && "toggle-elevated")}
                    data-testid="button-trip-oneway"
                  >
                    One Way
                  </Button>
                </div>
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

              {tripType === "roundtrip" && (
                <div className="space-y-2">
                  <Label>Return Date</Label>
                  <Input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    data-testid="input-flight-return-initial"
                  />
                </div>
              )}
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
            {selectedOrigin?.name || originProp} → {detectedDestination?.name || destinationCode}
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
                    <Label>Trip Type</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant={tripType === "roundtrip" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTripType("roundtrip")}
                        className={cn("text-xs toggle-elevate", tripType === "roundtrip" && "toggle-elevated")}
                        data-testid="button-modify-trip-roundtrip"
                      >
                        Round
                      </Button>
                      <Button
                        type="button"
                        variant={tripType === "oneway" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTripType("oneway")}
                        className={cn("text-xs toggle-elevate", tripType === "oneway" && "toggle-elevated")}
                        data-testid="button-modify-trip-oneway"
                      >
                        One Way
                      </Button>
                    </div>
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
                  {tripType === "roundtrip" && (
                    <div className="space-y-2">
                      <Label>Return</Label>
                      <Input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        data-testid="input-flight-return"
                      />
                    </div>
                  )}
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

      {/* Selected Outbound Flight Summary (for round-trip) */}
      {tripType === "roundtrip" && selectedOutboundFlight && (
        <Card className="border-[#FF385C] bg-[#FF385C]/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-[#FF385C]">Outbound Selected</Badge>
                <span className="text-sm text-muted-foreground">Step 1 of 2</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedOutboundFlight(null)}
                data-testid="button-change-outbound"
              >
                Change
              </Button>
            </div>
            {(() => {
              const outbound = selectedOutboundFlight.itineraries[0];
              const firstSeg = outbound?.segments[0];
              const lastSeg = outbound?.segments[outbound.segments.length - 1];
              const carrierCode = firstSeg?.carrierCode || "";
              const airlineName = airlineNames[carrierCode] || carrierCode;
              return (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{firstSeg?.departure.iataCode}</span>
                      <ArrowRight className="h-4 w-4" />
                      <span className="font-bold">{lastSeg?.arrival.iataCode}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{airlineName}</span>
                    <span className="text-sm text-muted-foreground">{formatDate(firstSeg?.departure.at || "")}</span>
                    <span className="text-sm text-muted-foreground">{formatTime(firstSeg?.departure.at || "")} - {formatTime(lastSeg?.arrival.at || "")}</span>
                  </div>
                  <Badge variant="secondary" className="text-lg font-bold">
                    ${selectedOutboundFlight.price.total}
                  </Badge>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Outbound Flights Section */}
      {filteredAndSortedFlights && filteredAndSortedFlights.length > 0 && !selectedOutboundFlight && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-lg">
              {tripType === "roundtrip" ? "Step 1: Select Outbound Flight" : `${filteredAndSortedFlights.length} flight${filteredAndSortedFlights.length !== 1 ? "s" : ""} available`}
              {flights && flights.length !== filteredAndSortedFlights.length && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (filtered from {flights.length})
                </span>
              )}
            </h3>
            {flightResponse?.fromCache && (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground" data-testid="badge-cache-status">
                <Database className="h-3 w-3" />
                <span data-testid="text-cache-updated">
                  {flightResponse.lastUpdated ? (
                    <>Updated {formatDistanceToNow(new Date(flightResponse.lastUpdated), { addSuffix: true })}</>
                  ) : (
                    <>From cache</>
                  )}
                </span>
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAndSortedFlights.map((flight) => {
              const outbound = flight.itineraries[0];
              const firstSeg = outbound?.segments[0];
              const lastSeg = outbound?.segments[outbound.segments.length - 1];
              const carrierCode = firstSeg?.carrierCode || "";
              const airlineName = airlineNames[carrierCode] || carrierCode;
              
              const travelerPricing = flight.travelerPricings?.[0];
              const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];
              const cabin = fareDetails?.cabin || "ECONOMY";
              const cabinDisplay = cabin.charAt(0) + cabin.slice(1).toLowerCase().replace("_", " ");
              const checkedBags = fareDetails?.includedCheckedBags;
              const bagsInfo = checkedBags?.quantity !== undefined 
                ? `${checkedBags.quantity} bag${checkedBags.quantity !== 1 ? 's' : ''}`
                : checkedBags?.weight 
                  ? `${checkedBags.weight}${checkedBags.weightUnit || 'kg'}`
                  : null;
              
              const seatsLeft = flight.numberOfBookableSeats;
              const lastTicketDate = flight.lastTicketingDate;

              return (
                <Card key={flight.id} className="hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
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
                      <div className="text-right">
                        <Badge variant="secondary" className="text-lg font-bold">
                          ${flight.price.total}
                        </Badge>
                        {adults > 1 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            ${(parseFloat(flight.price.total) / adults).toFixed(2)}/person
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium">{airlineName}</span>
                      <span className="text-xs text-muted-foreground">
                        {carrierCode} {firstSeg?.number}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(outbound?.duration || "")}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {outbound?.segments.length === 1
                            ? "Direct"
                            : `${outbound?.segments.length - 1} stop${
                                outbound?.segments.length > 2 ? "s" : ""
                              }`}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Briefcase className="h-3 w-3 mr-1" />
                          {cabinDisplay}
                        </Badge>
                      </div>

                      <div className="text-muted-foreground">
                        {formatTime(firstSeg?.departure.at || "")} -{" "}
                        {formatTime(lastSeg?.arrival.at || "")}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-xs">
                        {bagsInfo && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Luggage className="h-3 w-3" />
                            <span>{bagsInfo} included</span>
                          </div>
                        )}
                        {seatsLeft && seatsLeft <= 5 && (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            <span>Only {seatsLeft} seats left</span>
                          </div>
                        )}
                      </div>

                      {lastTicketDate && (
                        <div className="text-xs text-muted-foreground">
                          Book by {formatDate(lastTicketDate + "T00:00:00")}
                        </div>
                      )}
                    </div>

                    {tripType === "roundtrip" ? (
                      <Button
                        className="w-full mt-4 bg-[#FF385C] hover:bg-[#E23350]"
                        onClick={() => setSelectedOutboundFlight(flight)}
                        data-testid={`button-select-outbound-${flight.id}`}
                      >
                        Select Outbound
                      </Button>
                    ) : onSelectFlight && (
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

      {/* Return Flights Section (for round-trip after outbound selection) */}
      {tripType === "roundtrip" && selectedOutboundFlight && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-lg">
              Step 2: Select Return Flight
              {filteredAndSortedReturnFlights.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({filteredAndSortedReturnFlights.length} available)
                </span>
              )}
            </h3>
            {returnFlightResponse?.fromCache && (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <Database className="h-3 w-3" />
                <span>
                  {returnFlightResponse.lastUpdated ? (
                    <>Updated {formatDistanceToNow(new Date(returnFlightResponse.lastUpdated), { addSuffix: true })}</>
                  ) : (
                    <>From cache</>
                  )}
                </span>
              </Badge>
            )}
          </div>

          {returnLoading && (
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

          {returnError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 text-red-600">
                {returnError.message || "Failed to search return flights. Please try again."}
              </CardContent>
            </Card>
          )}

          {filteredAndSortedReturnFlights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAndSortedReturnFlights.map((flight) => {
                const returnItinerary = flight.itineraries[0];
                const firstSeg = returnItinerary?.segments[0];
                const lastSeg = returnItinerary?.segments[returnItinerary.segments.length - 1];
                const carrierCode = firstSeg?.carrierCode || "";
                const airlineName = airlineNames[carrierCode] || carrierCode;
                
                const travelerPricing = flight.travelerPricings?.[0];
                const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];
                const cabin = fareDetails?.cabin || "ECONOMY";
                const cabinDisplay = cabin.charAt(0) + cabin.slice(1).toLowerCase().replace("_", " ");
                const checkedBags = fareDetails?.includedCheckedBags;
                const bagsInfo = checkedBags?.quantity !== undefined 
                  ? `${checkedBags.quantity} bag${checkedBags.quantity !== 1 ? 's' : ''}`
                  : checkedBags?.weight 
                    ? `${checkedBags.weight}${checkedBags.weightUnit || 'kg'}`
                    : null;
                
                const seatsLeft = flight.numberOfBookableSeats;
                const lastTicketDate = flight.lastTicketingDate;

                // Calculate combined total
                const outboundPrice = parseFloat(selectedOutboundFlight.price.total);
                const returnPrice = parseFloat(flight.price.total);
                const combinedTotal = (outboundPrice + returnPrice).toFixed(2);

                return (
                  <Card key={flight.id} className="hover-elevate">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
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
                        <div className="text-right">
                          <Badge variant="secondary" className="text-lg font-bold">
                            ${flight.price.total}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            Trip total: ${combinedTotal}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-medium">{airlineName}</span>
                        <span className="text-xs text-muted-foreground">
                          {carrierCode} {firstSeg?.number}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatDuration(returnItinerary?.duration || "")}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {returnItinerary?.segments.length === 1
                              ? "Direct"
                              : `${returnItinerary?.segments.length - 1} stop${
                                  returnItinerary?.segments.length > 2 ? "s" : ""
                                }`}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            <Briefcase className="h-3 w-3 mr-1" />
                            {cabinDisplay}
                          </Badge>
                        </div>

                        <div className="text-muted-foreground">
                          {formatTime(firstSeg?.departure.at || "")} -{" "}
                          {formatTime(lastSeg?.arrival.at || "")}
                        </div>

                        <div className="flex items-center gap-3 flex-wrap text-xs">
                          {bagsInfo && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Luggage className="h-3 w-3" />
                              <span>{bagsInfo} included</span>
                            </div>
                          )}
                          {seatsLeft && seatsLeft <= 5 && (
                            <div className="flex items-center gap-1 text-amber-600">
                              <AlertCircle className="h-3 w-3" />
                              <span>Only {seatsLeft} seats left</span>
                            </div>
                          )}
                        </div>

                        {lastTicketDate && (
                          <div className="text-xs text-muted-foreground">
                            Book by {formatDate(lastTicketDate + "T00:00:00")}
                          </div>
                        )}
                      </div>

                      {onSelectFlight && (
                        <Button
                          className="w-full mt-4 bg-[#FF385C] hover:bg-[#E23350]"
                          onClick={() => {
                            // Add both outbound and return flights
                            onSelectFlight(selectedOutboundFlight);
                            onSelectFlight(flight);
                            setSelectedOutboundFlight(null);
                          }}
                          data-testid={`button-select-return-${flight.id}`}
                        >
                          Select Return & Add Both
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {returnFlights && returnFlights.length === 0 && !returnLoading && (
            <Card>
              <CardContent className="p-8 text-center">
                <Plane className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">No return flights found</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Try a different return date or select a different outbound flight.
                </p>
                <Button variant="outline" onClick={() => setSelectedOutboundFlight(null)}>
                  Change Outbound Flight
                </Button>
              </CardContent>
            </Card>
          )}
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
