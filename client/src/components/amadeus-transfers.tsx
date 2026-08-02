import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Car } from "lucide-react";
import { TransferCard } from "@/components/travelpayouts/TransferCard";
import type { CatalogItem } from "@/types/catalog";

/**
 * Airport transfers section for the experience-template "transport" tab.
 *
 * Historical note: this component used to search transfers via the Amadeus
 * Self-Service API (POST /api/amadeus/transfers). Amadeus shut that API down
 * on 2026-07-17, so transfers now come from the working affiliate sources —
 * Kiwitaxi + Welcome Pickups — via GET /api/catalog/airport-transfers.
 * The component keeps its old export name/props so call sites are unchanged;
 * the onAddToCart prop is accepted but unused (affiliate transfers are booked
 * through the booking-agent rail inside TransferCard, not the local cart).
 */

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

export function AmadeusTransfers({
  destination,
  startDate,
  travelers = 2,
  className = "",
}: AmadeusTransfersProps) {
  const queryUrl = `/api/catalog/airport-transfers?to=${encodeURIComponent(destination)}&passengers=${travelers}${startDate ? `&date=${encodeURIComponent(startDate)}` : ""}`;

  const { data, isLoading, isError } = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: [queryUrl],
    enabled: !!destination,
  });

  const items = data?.items || [];

  if (!destination) return null;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Nothing available (or the source errored) — hide the section rather than
  // showing a permanent error/empty card.
  if (isError || items.length === 0) return null;

  return (
    <Card className={className} data-testid="card-airport-transfers">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg" data-testid="title-airport-transfers">
          <Car className="h-5 w-5 text-primary" />
          Airport Transfers to {destination}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {travelers} traveler{travelers !== 1 ? "s" : ""}
          {startDate ? ` • ${new Date(startDate).toLocaleDateString()}` : " • Flexible dates"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <TransferCard key={item.id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
