import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, Users, Clock, AlertCircle, Search, Plus, Plane } from "lucide-react";
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
  destination: string;
  startDate?: string;
  travelers?: number;
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
  destination,
  startDate,
  travelers = 2,
  className = "",
  onAddToCart
}: AmadeusTransfersProps) {
  const [airportCode, setAirportCode] = useState("");
  const [transfers, setTransfers] = useState<TransferOffer[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const searchDateTime = startDate 
    ? new Date(startDate + "T10:00:00").toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const searchMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/amadeus/transfers", {
        startLocationCode: code,
        endCityName: destination,
        transferType: "PRIVATE",
        startDateTime: searchDateTime,
        passengers: travelers,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setTransfers(data || []);
      setHasSearched(true);
    },
  });

  const handleSearch = () => {
    if (!airportCode || airportCode.length < 3) return;
    searchMutation.mutate(airportCode);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
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
        details: `From ${transfer.start.locationCode} to ${destination}`,
        isExternal: false,
      });
    }
  };

  return (
    <Card className={className} data-testid="card-amadeus-transfers">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg" data-testid="title-amadeus-transfers">
          <Car className="h-5 w-5 text-primary" />
          Airport Transfers to {destination || "your destination"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Plane className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Enter airport code (e.g., JFK, LAX, BKK)"
              value={airportCode}
              onChange={(e) => setAirportCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              className="pl-9 uppercase"
              maxLength={4}
              data-testid="input-transfer-airport"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={!airportCode || airportCode.length < 3 || searchMutation.isPending}
            data-testid="button-search-transfers"
          >
            {searchMutation.isPending ? "..." : <Search className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {travelers} traveler{travelers !== 1 ? 's' : ''} • {startDate ? new Date(startDate).toLocaleDateString() : 'Flexible dates'}
        </p>

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
              Unable to find transfers. Please check the airport code and try again.
            </p>
          </div>
        )}

        {hasSearched && !searchMutation.isPending && transfers.length === 0 && (
          <div className="p-4 text-center">
            <Car className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No transfers available from {airportCode} to {destination}.
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
