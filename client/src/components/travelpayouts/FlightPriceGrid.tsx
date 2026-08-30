/**
 * FlightPriceGrid — the flights-tab surface (flight-repoint decision, Aug 2026).
 *
 * Replaces the dead GDS-style FlightSearch (which queried the retired Amadeus endpoints
 * /api/amadeus/flights + /api/cache/flights and could never return data). This grid is
 * driven by GET /api/catalog/flights — Aviasales/Travelpayouts cheapest-fare-by-route
 * summaries (price, airline, date), NOT full GDS itineraries — so its controls match what
 * that endpoint actually accepts: origin (required), destination, depart/return dates.
 *
 * Airport autocomplete reads the seeded location_cache via GET /api/amadeus/locations
 * (static IATA dataset, no per-keystroke external API calls).
 *
 * §16: every Book action routes through the booking-agent rail (FlightCard →
 * useAgentBooking → POST /api/affiliate-booking-requests). No window.open of partner URLs.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Loader2, MapPin, Plane } from "lucide-react";
import type { CatalogItem, CatalogSourceStatus } from "@/types/catalog";
import { FlightCard } from "./FlightCard";

interface LocationOption {
  iataCode: string;
  name: string;
  cityName?: string | null;
  countryCode?: string | null;
}

function mapLocation(loc: any): LocationOption | null {
  if (!loc?.iataCode) return null;
  return {
    iataCode: loc.iataCode,
    name: loc.name || loc.iataCode,
    cityName: loc.address?.cityName ?? loc.cityName ?? null,
    countryCode: loc.address?.countryCode ?? loc.countryCode ?? null,
  };
}

async function fetchLocations(keyword: string): Promise<LocationOption[]> {
  const params = new URLSearchParams({ keyword, subType: "AIRPORT" });
  const res = await fetch(`/api/amadeus/locations?${params}`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : [])
    .map(mapLocation)
    .filter((l): l is LocationOption => l !== null);
}

interface AirportComboboxProps {
  label: string;
  placeholder: string;
  value: LocationOption | null;
  onSelect: (loc: LocationOption | null) => void;
  testId: string;
  allowClear?: boolean;
}

function AirportCombobox({ label, placeholder, value, onSelect, testId, allowClear }: AirportComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: suggestions, isLoading } = useQuery<LocationOption[]>({
    queryKey: ["/api/amadeus/locations", { keyword: search, subType: "AIRPORT" }],
    enabled: search.length >= 2,
    queryFn: () => fetchLocations(search),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-1.5 flex-1 min-w-[180px]">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            data-testid={testId}
          >
            <span className="flex items-center gap-2 truncate">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {value ? (
                <span className="truncate">
                  <Badge variant="secondary" className="font-mono mr-1.5">{value.iataCode}</Badge>
                  {value.cityName || value.name}
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type a city or airport…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {isLoading && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Searching…
                </div>
              )}
              <CommandEmpty>No airports found.</CommandEmpty>
              <CommandGroup>
                {allowClear && value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => { onSelect(null); setOpen(false); }}
                  >
                    <span className="text-muted-foreground">Any destination</span>
                  </CommandItem>
                )}
                {suggestions?.map((loc) => (
                  <CommandItem
                    key={loc.iataCode}
                    value={loc.iataCode}
                    onSelect={() => { onSelect(loc); setOpen(false); }}
                  >
                    <Badge variant="secondary" className="font-mono mr-2">{loc.iataCode}</Badge>
                    <span className="text-sm truncate">
                      {loc.name}
                      {loc.cityName && loc.cityName !== loc.name ? ` — ${loc.cityName}` : ""}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  );
}

function sourceIsDown(status?: CatalogSourceStatus): boolean {
  return !!status && (status.status === "error" || status.status === "auth" || status.status === "quota");
}

interface FlightPriceGridProps {
  /** Free-text origin (e.g. the trip's origin city) — auto-resolved to an airport when set. */
  originQuery?: string;
  /** Free-text destination (the template's destination) — auto-resolved to an airport when set. */
  destinationQuery?: string;
  startDate?: Date;
  endDate?: Date;
  className?: string;
}

export function FlightPriceGrid({
  originQuery,
  destinationQuery,
  startDate,
  endDate,
  className,
}: FlightPriceGridProps) {
  const [origin, setOrigin] = useState<LocationOption | null>(null);
  const [destination, setDestination] = useState<LocationOption | null>(null);
  const [departDate, setDepartDate] = useState(startDate ? format(startDate, "yyyy-MM-dd") : "");
  const [returnDate, setReturnDate] = useState(endDate ? format(endDate, "yyyy-MM-dd") : "");

  useEffect(() => {
    if (startDate) setDepartDate(format(startDate, "yyyy-MM-dd"));
  }, [startDate]);
  useEffect(() => {
    if (endDate) setReturnDate(format(endDate, "yyyy-MM-dd"));
  }, [endDate]);

  // Auto-detect origin/destination airports from the trip's free-text fields (seeded
  // location_cache lookup — the read path returns major airports first).
  const { data: autoOrigins } = useQuery<LocationOption[]>({
    queryKey: ["/api/amadeus/locations", { keyword: originQuery, subType: "AIRPORT", auto: "origin" }],
    enabled: !!originQuery && originQuery.length >= 2 && !origin,
    queryFn: () => fetchLocations(originQuery!),
    staleTime: 60_000,
  });
  const { data: autoDestinations } = useQuery<LocationOption[]>({
    queryKey: ["/api/amadeus/locations", { keyword: destinationQuery, subType: "AIRPORT", auto: "dest" }],
    enabled: !!destinationQuery && destinationQuery.length >= 2 && !destination,
    queryFn: () => fetchLocations(destinationQuery!.split(",")[0].trim()),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!origin && autoOrigins && autoOrigins.length > 0) setOrigin(autoOrigins[0]);
  }, [autoOrigins, origin]);
  useEffect(() => {
    if (!destination && autoDestinations && autoDestinations.length > 0) setDestination(autoDestinations[0]);
  }, [autoDestinations, destination]);

  const flightsQ = useQuery<{ items: CatalogItem[]; total: number; sourceStatus?: CatalogSourceStatus }>({
    queryKey: [
      "/api/catalog/flights",
      {
        origin: origin?.iataCode,
        destination: destination?.iataCode,
        departDate: departDate || undefined,
        returnDate: returnDate || undefined,
        limit: 12,
      },
    ],
    enabled: !!origin,
  });

  const items = useMemo(() => {
    const list = flightsQ.data?.items ?? [];
    return [...list].sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER));
  }, [flightsQ.data?.items]);

  const sourceStatus = flightsQ.data?.sourceStatus;
  const notConfigured = !!sourceStatus && !sourceStatus.configured;

  return (
    <div className={className} data-testid="flight-price-grid">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <AirportCombobox
          label="From"
          placeholder="Departure airport…"
          value={origin}
          onSelect={setOrigin}
          testId="input-flight-origin"
        />
        <AirportCombobox
          label="To"
          placeholder="Any destination"
          value={destination}
          onSelect={setDestination}
          testId="input-flight-destination"
          allowClear
        />
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Depart</Label>
          <Input
            type="date"
            value={departDate}
            onChange={(e) => setDepartDate(e.target.value)}
            className="w-[150px]"
            data-testid="input-flight-depart"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Return</Label>
          <Input
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            className="w-[150px]"
            data-testid="input-flight-return"
          />
        </div>
      </div>

      {!origin ? (
        <Alert data-testid="alert-flight-need-origin">
          <Plane className="h-4 w-4" />
          <AlertDescription>
            Choose a departure airport to see the lowest recent fares for this trip.
          </AlertDescription>
        </Alert>
      ) : flightsQ.isLoading ? (
        <LoadingGrid count={6} />
      ) : flightsQ.isError ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-flight-error">
          <p className="text-sm">Couldn't load flight prices.</p>
          <p className="text-xs mt-1">Please try again in a moment.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-flight-empty">
          {notConfigured ? (
            <>
              <p className="text-sm">Live flight pricing isn't available right now.</p>
              <p className="text-xs mt-1">Ask your expert — they can source flight options for this trip.</p>
            </>
          ) : sourceIsDown(sourceStatus) ? (
            <>
              <p className="text-sm">The flight price source is temporarily unavailable.</p>
              <p className="text-xs mt-1">Try again later, or a different route.</p>
            </>
          ) : (
            <>
              <p className="text-sm">No fares found for this route.</p>
              <p className="text-xs mt-1">Try different dates, a nearby airport, or clear the destination.</p>
            </>
          )}
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            Lowest recent fares via Aviasales — indicative prices; your booking agent confirms the
            final itinerary and price.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <FlightCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
