import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ShoppingBag, Star, ExternalLink } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { BookWithExpertButton } from "./BookWithExpertButton";

export function LuggageStorageCard({ item, className }: { item: CatalogItem; className?: string }) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow border-amber-100 ${className ?? ""}`} data-testid={`card-luggage-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" data-testid={`text-luggage-title-${item.id}`}>{item.title}</p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
            )}
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0 ml-2">
              <p className="font-bold text-base text-amber-700" data-testid={`text-luggage-price-${item.id}`}>
                ${item.price.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">total</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {item.destination && (
            <Badge variant="outline" className="text-xs gap-1">
              <MapPin className="h-3 w-3" />{item.destination.split(",")[0]}
            </Badge>
          )}
          {item.rating && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{item.rating.toFixed(1)}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">Stasher certified</Badge>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">Stasher · Storage</Badge>
            <Button
              size="sm"
              onClick={handleBook}
              className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700"
              data-testid={`button-book-luggage-${item.id}`}
            >
              Book<ExternalLink className="h-3 w-3" />
            </Button>
          </div>
          <BookWithExpertButton
            destination={item.destination}
            topic="luggage-storage"
            className="w-full justify-center"
            data-testid={`button-expert-luggage-${item.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
