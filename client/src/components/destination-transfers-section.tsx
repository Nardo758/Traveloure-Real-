import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, AlertCircle, Plus, ExternalLink } from "lucide-react";

interface TransportOption {
  id: string;
  source: string;
  title: string;
  description: string;
  modeType: string;
  icon: string;
  priceDisplay: string;
  priceCentsLow: number | null;
  currency: string;
  externalUrl?: string;
  isExternal: boolean;
}

interface AddToCartPayload {
  id: string;
  type: string;
  name: string;
  price: number;
  quantity: number;
  provider?: string;
  details?: string;
  isExternal: boolean;
}

interface DestinationTransfersSectionProps {
  destination: string;
  startDate?: string;
  travelers?: number;
  className?: string;
  onAddToCart?: (item: AddToCartPayload) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  traveloure: "Platform",
  "12go": "12Go",
  omio: "Omio",
  discovercars: "DiscoverCars",
  partnerize: "Partner",
};

export function DestinationTransfersSection({
  destination,
  startDate,
  travelers = 2,
  className = "",
  onAddToCart,
}: DestinationTransfersSectionProps) {
  const { data, isLoading, error } = useQuery<TransportOption[]>({
    queryKey: ["/api/transport-options", destination, travelers, startDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        destination,
        travelers: String(travelers),
      });
      if (startDate) params.set("startDate", startDate);
      const res = await fetch(`/api/transport-options?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch transport options");
      return res.json();
    },
    enabled: !!destination,
    staleTime: 5 * 60 * 1000,
  });

  const options = data ?? [];

  return (
    <Card className={className} data-testid="card-destination-transfers">
      <CardHeader className="pb-3">
        <CardTitle
          className="flex items-center gap-2 text-lg"
          data-testid="title-destination-transfers"
        >
          <Car className="h-5 w-5 text-primary" />
          Getting around {destination || "your destination"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {travelers} traveler{travelers !== 1 ? "s" : ""}
          {startDate
            ? ` · ${new Date(startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
            : " · Flexible dates"}
        </p>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <Skeleton className="w-10 h-10 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-9 w-24" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-4 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Unable to load transport options. Please try again later.
            </p>
          </div>
        )}

        {!isLoading && !error && options.length === 0 && (
          <div className="p-4 text-center">
            <Car className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No transport options found for {destination}.
            </p>
          </div>
        )}

        {options.map((option) => (
          <div
            key={option.id}
            className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover-elevate"
            data-testid={`transfer-item-${option.id}`}
          >
            <div className="p-2 rounded-lg bg-primary/10 shrink-0 text-xl leading-none">
              {option.icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{option.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs shrink-0">
                  {SOURCE_LABELS[option.source] ?? option.source}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {option.description}
                </span>
              </div>
            </div>

            <div className="text-right shrink-0 flex flex-col items-end gap-1">
              <p className="font-bold text-sm">{option.priceDisplay}</p>
              <div className="flex items-center gap-1">
                {/* Only show "Add" for options with a known price.
                    Quote-only options (priceCentsLow === null) must not be
                    added as $0 items — that would corrupt the running total. */}
                {onAddToCart && option.priceCentsLow !== null && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onAddToCart({
                        id: `transport-${option.id}`,
                        type: "transportation",
                        name: option.title,
                        price: option.priceCentsLow! / 100,
                        quantity: 1,
                        provider:
                          SOURCE_LABELS[option.source] ?? option.source,
                        details: option.description,
                        isExternal: true,
                      })
                    }
                    className="text-xs"
                    data-testid={`button-add-transfer-${option.id}`}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
                {option.externalUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    asChild
                    className="text-xs px-2"
                  >
                    <a
                      href={option.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`link-transfer-external-${option.id}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
