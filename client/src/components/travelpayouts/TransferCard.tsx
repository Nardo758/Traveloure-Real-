import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, Clock, ExternalLink, Star } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { BookWithExpertButton } from "./BookWithExpertButton";

interface TransferCardProps {
  item: CatalogItem;
  className?: string;
}

export function TransferCard({ item, className }: TransferCardProps) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${className ?? ""}`} data-testid={`card-transfer-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Car className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" data-testid={`text-transfer-title-${item.id}`}>{item.title}</p>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
              )}
            </div>
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-base" data-testid={`text-transfer-price-${item.id}`}>
                {item.currency} {item.price.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">per transfer</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {item.duration && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {item.duration}
            </Badge>
          )}
          {item.tags.slice(0, 2).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs capitalize">{tag}</Badge>
          ))}
          {item.rating && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {item.rating.toFixed(1)}
              {item.reviewCount ? ` (${item.reviewCount})` : ""}
            </Badge>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100">
              via GetTransfer
            </Badge>
            <Button
              size="sm"
              onClick={handleBook}
              className="h-7 text-xs gap-1"
              data-testid={`button-book-transfer-${item.id}`}
            >
              Book Transfer
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
          <BookWithExpertButton
            destination={item.destination}
            topic="transfers"
            className="w-full justify-center"
            data-testid={`button-expert-transfer-${item.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
