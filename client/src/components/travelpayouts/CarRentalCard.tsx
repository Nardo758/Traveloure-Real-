import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, Fuel, Users, ExternalLink, Star, Snowflake } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";

interface CarRentalCardProps {
  item: CatalogItem;
  className?: string;
}

export function CarRentalCard({ item, className }: CarRentalCardProps) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const hasAC = item.tags.includes("AC");
  const transmission = item.tags.find(t => ["automatic", "manual"].includes(t));
  const fuelType = item.tags.find(t => ["petrol", "diesel", "electric", "hybrid"].includes(t));

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${className ?? ""}`} data-testid={`card-car-${item.id}`}>
      {item.imageUrl && (
        <div className="relative h-36 bg-slate-100 overflow-hidden">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight" data-testid={`text-car-title-${item.id}`}>{item.title}</p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
            )}
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-base text-primary" data-testid={`text-car-price-${item.id}`}>
                {item.currency} {item.price.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">total</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {item.categories.find(c => !["car-rental"].includes(c)) && (
            <Badge variant="secondary" className="text-xs capitalize">
              {item.categories.find(c => !["car-rental"].includes(c))}
            </Badge>
          )}
          {transmission && (
            <Badge variant="outline" className="text-xs capitalize">{transmission}</Badge>
          )}
          {fuelType && (
            <Badge variant="outline" className="text-xs gap-1 capitalize">
              <Fuel className="h-3 w-3" />
              {fuelType}
            </Badge>
          )}
          {hasAC && (
            <Badge variant="outline" className="text-xs gap-1">
              <Snowflake className="h-3 w-3" />
              AC
            </Badge>
          )}
          {item.rating && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {item.rating.toFixed(1)}
            </Badge>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Badge className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-100">
            DiscoverCars
          </Badge>
          <Button
            size="sm"
            onClick={handleBook}
            className="h-7 text-xs gap-1"
            data-testid={`button-book-car-${item.id}`}
          >
            View Deal
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
