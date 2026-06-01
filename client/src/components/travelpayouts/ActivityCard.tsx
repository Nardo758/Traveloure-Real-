import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Star, ExternalLink, Ticket } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { BookWithExpertButton } from "./BookWithExpertButton";

interface ActivityCardProps {
  item: CatalogItem;
  className?: string;
}

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  tiqets:         { label: "Tiqets", color: "bg-red-100 text-red-700" },
  wegotrip:       { label: "WeGoTrip", color: "bg-green-100 text-green-700" },
  "viator-feed":  { label: "Viator", color: "bg-emerald-100 text-emerald-700" },
  viator:         { label: "Viator", color: "bg-emerald-100 text-emerald-700" },
  getyourguide:   { label: "GetYourGuide", color: "bg-yellow-100 text-yellow-700" },
  klook:          { label: "Klook", color: "bg-pink-100 text-pink-700" },
  safetywing:     { label: "SafetyWing", color: "bg-teal-100 text-teal-700" },
  stasher:        { label: "Stasher", color: "bg-amber-100 text-amber-700" },
};

export function ActivityCard({ item, className }: ActivityCardProps) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const meta = PROVIDER_META[item.provider] || { label: item.provider, color: "bg-gray-100 text-gray-700" };
  const isQuestTour = item.categories.includes("quest-tour") || item.categories.includes("walking-tour");

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${className ?? ""}`} data-testid={`card-activity-${item.id}`}>
      {item.imageUrl && (
        <div className="relative h-40 bg-slate-100 overflow-hidden">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
          />
          {isQuestTour && (
            <div className="absolute top-2 left-2">
              <Badge className="text-xs bg-green-600 text-white">Quest Tour</Badge>
            </div>
          )}
        </div>
      )}
      <CardContent className="p-4">
        <p className="font-semibold text-sm line-clamp-2 leading-snug" data-testid={`text-activity-title-${item.id}`}>
          {item.title}
        </p>

        {item.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.destination && (
            <Badge variant="outline" className="text-xs gap-1">
              <MapPin className="h-3 w-3" />
              {item.destination}
            </Badge>
          )}
          {item.duration && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {item.duration}
            </Badge>
          )}
          {item.rating && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {item.rating.toFixed(1)}
              {item.reviewCount ? ` (${item.reviewCount.toLocaleString()})` : ""}
            </Badge>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className={`text-xs hover:opacity-100 ${meta.color}`}>
                {meta.label}
              </Badge>
              {item.price && (
                <span className="text-sm font-bold text-primary" data-testid={`text-activity-price-${item.id}`}>
                  {item.currency} {item.price.toFixed(0)}
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleBook}
              variant="outline"
              className="h-7 text-xs gap-1"
              data-testid={`button-book-activity-${item.id}`}
            >
              <Ticket className="h-3 w-3" />
              Book
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
          <BookWithExpertButton
            destination={item.destination}
            topic="activities"
            className="w-full justify-center"
            data-testid={`button-expert-activity-${item.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
