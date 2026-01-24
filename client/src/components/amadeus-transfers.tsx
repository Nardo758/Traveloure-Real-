import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, Users, Clock, AlertCircle, Search, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TransferOffer {
  id: string;
  type: string;
  transferType: string;
  start: {
    dateTime: string;
    locationCode: string;
  };
  end: {
    dateTime?: string;
    locationCode?: string;
    address?: {
      line?: string;
      cityName?: string;
      countryCode?: string;
    };
  };
  vehicle: {
    code: string;
    category: string;
    description: string;
    seats?: Array<{ count: number }>;
  };
  quotation: {
    monetaryAmount: string;
    currencyCode: string;
  };
}

interface AmadeusTransfersProps {
  airportCode?: string;
  destination?: string;
  className?: string;
  onAddToCart?: (item: {
    id: string;
    type: string;
    name: string;
    price: number;
    quantity: number;
    provider: string;
    details?: string;
    isExternal: boolean;
  }) => void;
}

function formatPrice(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(parseFloat(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

export function AmadeusTransfers({
  airportCode = "",
  destination = "",
  className = "",
  onAddToCart
}: AmadeusTransfersProps) {
  const [searchParams, setSearchParams] = useState({
    startLocationCode: airportCode,
    endCityName: destination,
    transferType: "PRIVATE" as "PRIVATE" | "SHARED",
    startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    passengers: 2,
  });
  const [transfers, setTransfers] = useState<TransferOffer[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const searchMutation = useMutation({
    mutationFn: async (params: typeof searchParams) => {
      const response = await apiRequest("POST", "/api/amadeus/transfers", params);
      return response.json();
    },
    onSuccess: (data) => {
      setTransfers(data || []);
      setHasSearched(true);
    },
  });

  const handleSearch = () => {
    if (!searchParams.startLocationCode) return;
    searchMutation.mutate(searchParams);
  };

  const handleAddToCart = (transfer: TransferOffer) => {
    if (onAddToCart) {
      onAddToCart({
        id: `transfer-${transfer.id}`,
        type: "transportation",
        name: `${transfer.transferType} Transfer - ${transfer.vehicle.description}`,
        price: parseFloat(transfer.quotation.monetaryAmount),
        quantity: 1,
        provider: "Amadeus Transfers",
        details: `From ${transfer.start.locationCode} to ${transfer.end.address?.cityName || 'destination'}`,
        isExternal: false,
      });
    }
  };

  return (
    <Card className={className} data-testid="card-amadeus-transfers">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg" data-testid="title-amadeus-transfers">
          <Car className="h-5 w-5 text-primary" />
          Airport Transfers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="airport" className="text-xs">Airport Code</Label>
              <Input
                id="airport"
                placeholder="e.g. JFK, LAX"
                value={searchParams.startLocationCode}
                onChange={(e) => setSearchParams({ ...searchParams, startLocationCode: e.target.value.toUpperCase() })}
                className="uppercase"
                data-testid="input-transfer-airport"
              />
            </div>
            <div>
              <Label htmlFor="destination" className="text-xs">Destination City</Label>
              <Input
                id="destination"
                placeholder="e.g. Manhattan"
                value={searchParams.endCityName}
                onChange={(e) => setSearchParams({ ...searchParams, endCityName: e.target.value })}
                data-testid="input-transfer-destination"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="type" className="text-xs">Type</Label>
              <Select
                value={searchParams.transferType}
                onValueChange={(v) => setSearchParams({ ...searchParams, transferType: v as "PRIVATE" | "SHARED" })}
              >
                <SelectTrigger data-testid="select-transfer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                  <SelectItem value="SHARED">Shared</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="datetime" className="text-xs">Date & Time</Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={searchParams.startDateTime}
                onChange={(e) => setSearchParams({ ...searchParams, startDateTime: e.target.value })}
                data-testid="input-transfer-datetime"
              />
            </div>
            <div>
              <Label htmlFor="passengers" className="text-xs">Passengers</Label>
              <Input
                id="passengers"
                type="number"
                min={1}
                max={10}
                value={searchParams.passengers}
                onChange={(e) => setSearchParams({ ...searchParams, passengers: parseInt(e.target.value) || 1 })}
                data-testid="input-transfer-passengers"
              />
            </div>
          </div>

          <Button
            onClick={handleSearch}
            disabled={!searchParams.startLocationCode || searchMutation.isPending}
            className="w-full"
            data-testid="button-search-transfers"
          >
            {searchMutation.isPending ? (
              <>Searching...</>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search Transfers
              </>
            )}
          </Button>
        </div>

        {searchMutation.isPending && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Skeleton className="w-12 h-12 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-9 w-20" />
              </div>
            ))}
          </div>
        )}

        {searchMutation.isError && (
          <div className="p-4 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Unable to find transfers. Please try different search criteria.
            </p>
          </div>
        )}

        {hasSearched && !searchMutation.isPending && transfers.length === 0 && (
          <div className="p-4 text-center">
            <Car className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No transfers available for this route and time.
            </p>
          </div>
        )}

        {transfers.length > 0 && (
          <div className="space-y-3">
            {transfers.map((transfer) => (
              <div
                key={transfer.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover-elevate"
                data-testid={`transfer-item-${transfer.id}`}
              >
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <Car className="h-6 w-6 text-primary" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{transfer.vehicle.description}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {transfer.transferType}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {transfer.vehicle.seats?.[0]?.count || '4'} seats
                    </span>
                    {transfer.end.dateTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(transfer.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-bold text-lg">
                    {formatPrice(transfer.quotation.monetaryAmount, transfer.quotation.currencyCode)}
                  </p>
                  {onAddToCart && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddToCart(transfer)}
                      className="mt-1"
                      data-testid={`button-add-transfer-${transfer.id}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
