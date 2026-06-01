import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Plane, Car, Wifi, MapPin, Ticket, Train, ArrowRightLeft } from "lucide-react";
import { FlightCard } from "./FlightCard";
import { CarRentalCard } from "./CarRentalCard";
import { ESimCard } from "./ESimCard";
import { ActivityCard } from "./ActivityCard";
import { TransferCard } from "./TransferCard";
import { GroundTransportCard } from "./GroundTransportCard";
import type { CatalogItem } from "@/types/catalog";

interface TravelpayoutsSectionProps {
  destination?: string;
  countryCode?: string;
  defaultTab?: "activities" | "flights" | "cars" | "transfers" | "esim" | "transport";
  className?: string;
}

function ItemGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {children}
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
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [flightOrigin, setFlightOrigin] = useState("");

  const activitiesQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/tiqets", destination],
    enabled: !!destination && activeTab === "activities",
  });

  const wegoQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/wegotrip", destination],
    enabled: !!destination && activeTab === "activities",
  });

  const viatorFeedQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/viator-feed", destination],
    enabled: !!destination && activeTab === "activities",
  });

  const flightsQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/flights", flightOrigin, destination],
    enabled: !!flightOrigin && !!destination && activeTab === "flights",
  });

  const transfersQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/transfers", destination],
    enabled: !!destination && activeTab === "transfers",
  });

  const carsQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/cars", destination],
    enabled: !!destination && activeTab === "cars",
  });

  const esimQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/esim", countryCode || destination],
    enabled: !!(countryCode || destination) && activeTab === "esim",
  });

  const transportQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/ground-transport", destination],
    enabled: !!destination && activeTab === "transport",
  });

  const allActivities = [
    ...(activitiesQuery.data?.items || []),
    ...(wegoQuery.data?.items || []),
    ...(viatorFeedQuery.data?.items || []),
  ];

  const handleSearch = () => {
    setDestination(searchInput);
  };

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

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList className="flex-wrap h-auto gap-1 mb-4">
          <TabsTrigger value="activities" className="gap-1.5 text-xs" data-testid="tab-tp-activities">
            <Ticket className="h-3.5 w-3.5" /> Activities
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
            <Train className="h-3.5 w-3.5" /> Trains & Buses
          </TabsTrigger>
          <TabsTrigger value="esim" className="gap-1.5 text-xs" data-testid="tab-tp-esim">
            <Wifi className="h-3.5 w-3.5" /> eSIM
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activities">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination above to find activities, attractions & quest tours.</AlertDescription></Alert>
          ) : activitiesQuery.isLoading || wegoQuery.isLoading || viatorFeedQuery.isLoading ? (
            <LoadingGrid />
          ) : allActivities.length === 0 ? (
            <EmptyState label="activities" />
          ) : (
            <ItemGrid>
              {allActivities.map(item => (
                <ActivityCard key={item.id} item={item} />
              ))}
            </ItemGrid>
          )}
        </TabsContent>

        <TabsContent value="flights">
          <div className="flex gap-2 mb-4">
            <Input
              value={flightOrigin}
              onChange={e => setFlightOrigin(e.target.value)}
              placeholder="From (e.g. NYC, LON)"
              className="flex-1"
              data-testid="input-tp-flight-origin"
            />
            <span className="self-center text-muted-foreground">→</span>
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="To (destination)"
              className="flex-1"
              data-testid="input-tp-flight-dest"
            />
          </div>
          {!flightOrigin || !destination ? (
            <Alert><AlertDescription>Enter both origin and destination to search flights via Aviasales & Kiwi.com.</AlertDescription></Alert>
          ) : flightsQuery.isLoading ? (
            <LoadingGrid count={4} />
          ) : !flightsQuery.data?.items?.length ? (
            <EmptyState label="flights" />
          ) : (
            <ItemGrid>
              {flightsQuery.data.items.map(item => (
                <FlightCard key={item.id} item={item} />
              ))}
            </ItemGrid>
          )}
        </TabsContent>

        <TabsContent value="transfers">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find airport transfers via GetTransfer.</AlertDescription></Alert>
          ) : transfersQuery.isLoading ? (
            <LoadingGrid count={4} />
          ) : !transfersQuery.data?.items?.length ? (
            <EmptyState label="transfers" />
          ) : (
            <ItemGrid>
              {transfersQuery.data.items.map(item => (
                <TransferCard key={item.id} item={item} />
              ))}
            </ItemGrid>
          )}
        </TabsContent>

        <TabsContent value="cars">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find car rentals via DiscoverCars.</AlertDescription></Alert>
          ) : carsQuery.isLoading ? (
            <LoadingGrid count={4} />
          ) : !carsQuery.data?.items?.length ? (
            <EmptyState label="car rentals" />
          ) : (
            <ItemGrid>
              {carsQuery.data.items.map(item => (
                <CarRentalCard key={item.id} item={item} />
              ))}
            </ItemGrid>
          )}
        </TabsContent>

        <TabsContent value="transport">
          {!destination ? (
            <Alert><AlertDescription>Enter a destination to find trains & buses via Omio.</AlertDescription></Alert>
          ) : transportQuery.isLoading ? (
            <LoadingGrid count={4} />
          ) : !transportQuery.data?.items?.length ? (
            <EmptyState label="ground transport" />
          ) : (
            <ItemGrid>
              {transportQuery.data.items.map(item => (
                <GroundTransportCard key={item.id} item={item} />
              ))}
            </ItemGrid>
          )}
        </TabsContent>

        <TabsContent value="esim">
          {!(countryCode || destination) ? (
            <Alert><AlertDescription>Enter a destination to find eSIM plans via Airalo.</AlertDescription></Alert>
          ) : esimQuery.isLoading ? (
            <LoadingGrid count={6} />
          ) : !esimQuery.data?.items?.length ? (
            <EmptyState label="eSIM plans" />
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Stay connected when you arrive — no physical SIM needed.
              </p>
              <ItemGrid>
                {esimQuery.data.items.map(item => (
                  <ESimCard key={item.id} item={item} />
                ))}
              </ItemGrid>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
