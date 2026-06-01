import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Star, ExternalLink, Clock } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";
import { BookWithExpertButton } from "./BookWithExpertButton";

export function InsuranceCard({ item, className }: { item: CatalogItem; className?: string }) {
  const handleBuy = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const highlights = item.tags.filter(t => !["safetywing", "insurance", "travel-insurance"].includes(t));

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow border-teal-100 ${className ?? ""}`} data-testid={`card-insurance-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="h-5 w-5 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" data-testid={`text-insurance-title-${item.id}`}>{item.title}</p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
            )}
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0 ml-2">
              <p className="font-bold text-lg text-teal-700" data-testid={`text-insurance-price-${item.id}`}>
                ${item.price}
              </p>
              {item.duration && (
                <p className="text-xs text-muted-foreground">{item.duration}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {item.rating && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{item.rating.toFixed(1)}
            </Badge>
          )}
          {item.duration && (
            <Badge variant="outline" className="text-xs gap-1">
              <Clock className="h-3 w-3" />{item.duration}
            </Badge>
          )}
          {highlights.slice(0, 2).map(t => (
            <Badge key={t} variant="outline" className="text-xs capitalize">{t.replace(/-/g, " ")}</Badge>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Badge className="text-xs bg-teal-100 text-teal-700 hover:bg-teal-100">SafetyWing · Insurance</Badge>
            <Button
              size="sm"
              onClick={handleBuy}
              className="h-7 text-xs gap-1 bg-teal-600 hover:bg-teal-700"
              data-testid={`button-buy-insurance-${item.id}`}
            >
              Get Plan<ExternalLink className="h-3 w-3" />
            </Button>
          </div>
          <BookWithExpertButton
            destination={item.destination}
            topic="insurance"
            className="w-full justify-center"
            data-testid={`button-expert-insurance-${item.id}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
