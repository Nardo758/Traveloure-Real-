import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search, Plane, Car, Wifi, MapPin, Ticket, Train,
  ArrowRightLeft, Building2, ShieldCheck, ShoppingBag, Bus,
} from "lucide-react";
import { FlightCard } from "./FlightCard";
import { CarRentalCard } from "./CarRentalCard";
import { ESimCard } from "./ESimCard";
import { ActivityCard } from "./ActivityCard";
import { TransferCard } from "./TransferCard";
import { GroundTransportCard } from "./GroundTransportCard";
import { HotelCard } from "./HotelCard";
import { InsuranceCard } from "./InsuranceCard";
import { LuggageStorageCard } from "./LuggageStorageCard";
import type { CatalogItem } from "@/types/catalog";

type ActiveTab =
  | "activities" | "flights" | "cars" | "transfers" | "esim" | "transport"
  | "hotels" | "insurance" | "bus" | "luggage";

interface TravelpayoutsSectionProps {
  destination?: string;
  countryCode?: string;
  defaultTab?: ActiveTab;
  className?: string;
}

function ItemGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <p className="text-sm">No {label} found for this destination.</p>
      <p className="text-xs mt-1">Try a different destination or check back later.</p>
    </div>
  );
}

export function TravelpayoutsSection({
  destination: initialDestination,
  countryCode,
  defaultTab = "activities",
  className,
}: TravelpayoutsSectionProps) {
  const [destination, setDestination] = useState(initialDestination || "");
  const [searchInput, setSearchInput] = useState(initialDestination || "");
  const [activeTab, setActiveTab] = useState<ActiveTab>(defaultTab);
  const [flightOrigin, setFlightOrigin] = useState("");

  const enabled = (tab: ActiveTab) => !!destination && activeTab === tab;

  const tiqetsQ   = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/tiqets", destination],        enabled: enabled("activities") });
  const wegoQ     = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/wegotrip", destination],      enabled: enabled("activities") });
  const viatorFQ  = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/viator-feed", destination],   enabled: enabled("activities") });
  const gygQ      = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/activities-gyg", destination], enabled: enabled("activities") });
  const klookQ    = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/klook", destination],         enabled: enabled("activities") });

  const flightsQ  = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/flights", flightOrigin, destination], enabled: !!flightOrigin && !!destination && activeTab === "flights" });

  const hotellookQ = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/hotels-look", destination],  enabled: enabled("hotels") });
  const agodaQ     = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/agoda", destination],        enabled: enabled("hotels") });

  const transfersQ = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/transfers", destination],    enabled: enabled("transfers") });
  const airportQ   = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/airport-transfers", "", destination], enabled: enabled("transfers") });

  const carsQ      = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/cars", destination],         enabled: enabled("cars") });
  const rentalcarsQ = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/rentalcars", destination],  enabled: enabled("cars") });

  const transportQ = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/ground-transport", destination], enabled: enabled("transport") });
  const busQ       = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/bus", "", destination],      enabled: enabled("bus") });

  const esimQ      = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/esim", countryCode || destination], enabled: !!(countryCode || destination) && activeTab === "esim" });
  const insuranceQ = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/insurance", destination],   enabled: enabled("insurance") });
  const luggageQ   = useQuery<{ items: CatalogItem[] }>({ queryKey: ["/api/catalog/luggage-storage", destination], enabled: enabled("luggage") });

  const allActivities = [
    ...(gygQ.data?.items || []),
    ...(tiqetsQ.data?.items || []),
    ...(wegoQ.data?.items || []),
    ...(viatorFQ.data?.items || []),
    ...(klookQ.data?.items || []),
  ];
  const activitiesLoading = tiqetsQ.isLoading || wegoQ.isLoading || viatorFQ.isLoading || gygQ.isLoading || klookQ.isLoading;

  const allHotels = [...(hotellookQ.data?.items || []), ...(agodaQ.data?.items || [])];
  const hotelsLoading = hotellookQ.isLoading || agodaQ.isLoading;

  const allCars = [...(carsQ.data?.items || []), ...(rentalcarsQ.data?.items || [])];
  const carsLoading = carsQ.isLoading || rentalcarsQ.isLoading;

  const allTransfers = [...(transfersQ.data?.items || []), ...(airportQ.data?.items || [])];
  const transfersLoading = transfersQ.isLoading || airportQ.isLoading;

  const handleSearch = () => setDestination(searchInput);

  return (
    <div className={className}>
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Enter destination…"
            className="pl-9"
            data-testid="input-tp-destination"
          />
        </div>
        <Button onClick={handleSearch} data-testid="button-tp-search">Search</Button>
      </div>

      {destination && (
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Showing results for</span>
          <Badge variant="secondary">{destination}</Badge>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ActiveTab)}>
        <TabsList className="flex-wrap h-auto gap-1 mb-4">
          <TabsTrigger value="activities" className="gap-1.5 text-xs" data-testid="tab-tp-activities">
            <Ticket className="h-3.5 w-3.5" /> Activities
          </TabsTrigger>
          <TabsTrigger value="hotels" className="gap-1.5 text-xs" data-testid="tab-tp-hotels">
            <Building2 className="h-3.5 w-3.5" /> Hotels
          </TabsTrigger>
          <TabsTrigger value="flights" className="gap-1.5 text-xs" data-testid="tab-tp-flights">
            <Plane className="h-3.5 w-3.5" /> Flights
          </TabsTrigger>
          <TabsTrigger value="transfers" className="gap-1.5 text-xs" data-testid="tab-tp-transfers">
            <ArrowRightLeft className="h-3.5 w-3.5" /> Transfers
          </TabsTrigger>
          <TabsTrigger value="cars" className="gap-1.5 text-xs" data-testid="tab-tp-cars">
            <Car className="h-3.5 w-3.5" /> Car Rental
          </TabsTrigger>
          <TabsTrigger value="transport" className="gap-1.5 text-xs" data-testid="tab-tp-transport">
            <Train className="h-3.5 w-3.5" /> Trains
          </TabsTrigger>
          <TabsTrigger value="bus" className="gap-1.5 text-xs" data-testid="tab-tp-bus">
            <Bus className="h-3.5 w-3.5" /> Buses
          </TabsTrigger>
          <TabsTrigger value="esim" className="gap-1.5 text-xs" data-testid="tab-tp-esim">
            <Wifi className="h-3.5 w-3.5" /> eSIM
          </TabsTrigger>
          <TabsTrigger value="insurance" className="gap-1.5 text-xs" data-testid="tab-tp-insurance">
            <ShieldCheck className="h-3.5 w-3.5" /> Insurance
          </TabsTrigger>
          <TabsTrigger value="luggage" className="gap-1.5 text-xs" data-testid="tab-tp-luggage">
            <ShoppingBag className="h-3.5 w-3.5" /> Luggage
          </TabsTrigger>
        </TabsList>

        {/* Activities — GYG + Tiqets + WeGoTrip + Viator + Klook */}
        <TabsContent value="activities">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find activities from GetYourGuide, Tiqets, WeGoTrip, Viator & Klook.</AlertDescription></Alert>
          ) : activitiesLoading ? (
            <LoadingGrid />
          ) : allActivities.length === 0 ? (
            <EmptyState label="activities" />
          ) : (
            <ItemGrid>
              {allActivities.map(item => <ActivityCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>

        {/* Hotels — HotelLook + Agoda */}
        <TabsContent value="hotels">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find hotels via HotelLook & Agoda.</AlertDescription></Alert>
          ) : hotelsLoading ? (
            <LoadingGrid />
          ) : allHotels.length === 0 ? (
            <EmptyState label="hotels" />
          ) : (
            <ItemGrid>
              {allHotels.map(item => <HotelCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>

        {/* Flights — Aviasales + Kiwi */}
        <TabsContent value="flights">
          <div className="flex gap-2 mb-4">
            <Input value={flightOrigin} onChange={e => setFlightOrigin(e.target.value)} placeholder="From (e.g. NYC, LON)" className="flex-1" data-testid="input-tp-flight-origin" />
            <span className="self-center text-muted-foreground">→</span>
            <Input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="To (destination)" className="flex-1" data-testid="input-tp-flight-dest" />
          </div>
          {!flightOrigin || !destination ? (
            <Alert><AlertDescription>Enter both origin and destination to search flights via Aviasales & Kiwi.com.</AlertDescription></Alert>
          ) : flightsQ.isLoading ? (
            <LoadingGrid count={4} />
          ) : !flightsQ.data?.items?.length ? (
            <EmptyState label="flights" />
          ) : (
            <ItemGrid>
              {flightsQ.data.items.map(item => <FlightCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>

        {/* Transfers — GetTransfer + Kiwi Taxi + Welcome Pickups */}
        <TabsContent value="transfers">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find airport transfers via Kiwi Taxi & Welcome Pickups.</AlertDescription></Alert>
          ) : transfersLoading ? (
            <LoadingGrid count={4} />
          ) : allTransfers.length === 0 ? (
            <EmptyState label="transfers" />
          ) : (
            <ItemGrid>
              {allTransfers.map(item => <TransferCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>

        {/* Cars — DiscoverCars + Rentalcars.com */}
        <TabsContent value="cars">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find car rentals via DiscoverCars & Rentalcars.com.</AlertDescription></Alert>
          ) : carsLoading ? (
            <LoadingGrid count={4} />
          ) : allCars.length === 0 ? (
            <EmptyState label="car rentals" />
          ) : (
            <ItemGrid>
              {allCars.map(item => <CarRentalCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>

        {/* Trains — Omio */}
        <TabsContent value="transport">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find trains & ferries via Omio.</AlertDescription></Alert>
          ) : transportQ.isLoading ? (
            <LoadingGrid count={4} />
          ) : !transportQ.data?.items?.length ? (
            <EmptyState label="train routes" />
          ) : (
            <ItemGrid>
              {transportQ.data.items.map(item => <GroundTransportCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>

        {/* Buses — Busbud */}
        <TabsContent value="bus">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find buses via Busbud.</AlertDescription></Alert>
          ) : busQ.isLoading ? (
            <LoadingGrid count={4} />
          ) : !busQ.data?.items?.length ? (
            <EmptyState label="bus routes" />
          ) : (
            <ItemGrid>
              {busQ.data.items.map(item => <GroundTransportCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>

        {/* eSIM — Airalo */}
        <TabsContent value="esim">
          {!(countryCode || destination) ? (
            <Alert><AlertDescription>Enter a destination to find eSIM plans via Airalo.</AlertDescription></Alert>
          ) : esimQ.isLoading ? (
            <LoadingGrid count={6} />
          ) : !esimQ.data?.items?.length ? (
            <EmptyState label="eSIM plans" />
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Stay connected when you arrive — no physical SIM needed.</p>
              <ItemGrid>
                {esimQ.data.items.map(item => <ESimCard key={item.id} item={item} />)}
              </ItemGrid>
            </div>
          )}
        </TabsContent>

        {/* Insurance — SafetyWing */}
        <TabsContent value="insurance">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to see travel insurance plans via SafetyWing.</AlertDescription></Alert>
          ) : insuranceQ.isLoading ? (
            <LoadingGrid count={3} />
          ) : !insuranceQ.data?.items?.length ? (
            <EmptyState label="insurance plans" />
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Travel insurance — from just $42 per 4 weeks. Covers medical, trip cancellation & more.</p>
              <ItemGrid>
                {insuranceQ.data.items.map(item => <InsuranceCard key={item.id} item={item} />)}
              </ItemGrid>
            </div>
          )}
        </TabsContent>

        {/* Luggage Storage — Stasher */}
        <TabsContent value="luggage">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find luggage storage spots via Stasher.</AlertDescription></Alert>
          ) : luggageQ.isLoading ? (
            <LoadingGrid count={4} />
          ) : !luggageQ.data?.items?.length ? (
            <EmptyState label="luggage storage" />
          ) : (
            <ItemGrid>
              {luggageQ.data.items.map(item => <LuggageStorageCard key={item.id} item={item} />)}
            </ItemGrid>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
