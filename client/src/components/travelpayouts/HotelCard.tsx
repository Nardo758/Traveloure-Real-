import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Star, ExternalLink, Building2 } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { BookWithExpertButton } from "./BookWithExpertButton";

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  hotellook:  { label: "HotelLook", color: "bg-blue-100 text-blue-700" },
  agoda:      { label: "Agoda", color: "bg-orange-100 text-orange-700" },
};

export function HotelCard({ item, className }: { item: CatalogItem; className?: string }) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const meta = PROVIDER_META[item.provider] || { label: item.provider, color: "bg-gray-100 text-gray-700" };

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${className ?? ""}`} data-testid={`card-hotel-${item.id}`}>
      {item.imageUrl ? (
        <div className="h-36 bg-slate-100 overflow-hidden">
          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-20 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-blue-300" />
        </div>
      )}
      <CardContent className="p-4">
        <p className="font-semibold text-sm line-clamp-2 leading-snug" data-testid={`text-hotel-title-${item.id}`}>
          {item.title}
        </p>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.destination && (
            <Badge variant="outline" className="text-xs gap-1">
              <MapPin className="h-3 w-3" />{item.destination}
            </Badge>
          )}
          {item.rating && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{item.rating.toFixed(1)}
            </Badge>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className={`text-xs hover:opacity-100 ${meta.color}`}>{meta.label}</Badge>
              {item.price && (
                <span className="text-sm font-bold text-primary" data-testid={`text-hotel-price-${item.id}`}>
                  from ${item.price.toFixed(0)}
                </span>
              )}
            </div>
            <Button size="sm" onClick={handleBook} variant="outline" className="h-7 text-xs gap-1" data-testid={`button-book-hotel-${item.id}`}>
              <Building2 className="h-3 w-3" />Book<ExternalLink className="h-3 w-3" />
            </Button>
          </div>
          <BookWithExpertButton
            destination={item.destination}
            topic="hotels"
            className="w-full justify-center"
            data-testid={`button-expert-hotel-${item.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
