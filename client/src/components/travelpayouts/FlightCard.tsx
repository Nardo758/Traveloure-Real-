import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plane, Clock, ExternalLink, ArrowRight } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { BookWithExpertButton } from "./BookWithExpertButton";

interface FlightCardProps {
  item: CatalogItem;
  className?: string;
}

export function FlightCard({ item, className }: FlightCardProps) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const isNomad = item.tags.includes("nomad") || item.tags.includes("multi-city");
  const providerLabel = item.provider === "kiwi" ? "Kiwi.com" : "Aviasales";
  const providerColor = item.provider === "kiwi"
    ? "bg-teal-100 text-teal-700"
    : "bg-sky-100 text-sky-700";

  const [fromCity, toCity] = item.title.split(" → ");

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${className ?? ""}`} data-testid={`card-flight-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-md bg-sky-50 flex items-center justify-center">
            <Plane className="h-4 w-4 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold" data-testid={`text-flight-route-${item.id}`}>
              <span className="truncate">{fromCity}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{toCity}</span>
            </div>
            {item.description && (
              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
            )}
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-base text-primary" data-testid={`text-flight-price-${item.id}`}>
                {item.currency} {item.price.toFixed(0)}
              </p>
              {isNomad && <p className="text-xs text-muted-foreground">multi-city</p>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {item.duration && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {item.duration}
            </Badge>
          )}
          {item.tags.filter(t => !["nomad", "multi-city"].includes(t)).slice(0, 2).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
          ))}
          {isNomad && (
            <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">
              Nomad Route
            </Badge>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Badge className={`text-xs hover:opacity-100 ${providerColor}`}>
              {providerLabel}
            </Badge>
            <Button
              size="sm"
              onClick={handleBook}
              className="h-7 text-xs gap-1"
              data-testid={`button-book-flight-${item.id}`}
            >
              Search Flights
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
          <BookWithExpertButton
            destination={item.destination}
            topic="flights"
            className="w-full justify-center"
            data-testid={`button-expert-flight-${item.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
