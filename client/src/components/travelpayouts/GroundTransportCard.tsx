import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Train, Bus, ArrowRight, ExternalLink } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";

interface GroundTransportCardProps {
  item: CatalogItem;
  className?: string;
}

export function GroundTransportCard({ item, className }: GroundTransportCardProps) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const isTrain = item.tags.includes("train");
  const Icon = isTrain ? Train : Bus;

  const [fromCity, toCity] = item.title.split(" → ");

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${className ?? ""}`} data-testid={`card-transport-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-sm font-semibold" data-testid={`text-transport-route-${item.id}`}>
              <span className="truncate">{fromCity}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{toCity}</span>
            </div>
            {item.description && (
              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
            )}
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-sm" data-testid={`text-transport-price-${item.id}`}>
                {item.currency} {item.price.toFixed(0)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            <Badge className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Omio</Badge>
            {item.tags.filter(t => !["omio"].includes(t)).slice(0, 2).map(t => (
              <Badge key={t} variant="outline" className="text-xs capitalize">{t}</Badge>
            ))}
          </div>
          <Button
            size="sm"
            onClick={handleBook}
            className="h-7 text-xs gap-1"
            data-testid={`button-book-transport-${item.id}`}
          >
            Compare
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
