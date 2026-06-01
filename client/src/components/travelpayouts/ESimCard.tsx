import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wifi, Clock, Globe, ExternalLink, Signal } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";

interface ESimCardProps {
  item: CatalogItem;
  compact?: boolean;
  className?: string;
}

export function ESimCard({ item, compact = false, className }: ESimCardProps) {
  const handleBuy = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const dataInfo = item.description?.split("·")[0]?.trim();
  const validityInfo = item.description?.split("·")[1]?.trim();

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between p-3 rounded-lg border bg-gradient-to-r from-violet-50 to-blue-50 hover:shadow-sm transition-shadow cursor-pointer ${className ?? ""}`}
        onClick={handleBuy}
        data-testid={`card-esim-compact-${item.id}`}
      >
        <div className="flex items-center gap-2">
          <Signal className="h-4 w-4 text-violet-600 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{dataInfo} · {validityInfo}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          {item.price && (
            <p className="text-sm font-bold text-violet-700">${item.price.toFixed(2)}</p>
          )}
          <p className="text-xs text-muted-foreground">eSIM</p>
        </div>
      </div>
    );
  }

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow border-violet-100 ${className ?? ""}`} data-testid={`card-esim-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center flex-shrink-0">
            <Wifi className="h-5 w-5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" data-testid={`text-esim-title-${item.id}`}>{item.title}</p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            )}
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-lg text-violet-700" data-testid={`text-esim-price-${item.id}`}>
                ${item.price.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {dataInfo && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Globe className="h-3 w-3" />
              {dataInfo}
            </Badge>
          )}
          {validityInfo && (
            <Badge variant="outline" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {validityInfo}
            </Badge>
          )}
          {item.tags.filter(t => t && t !== "airalo").map(tag => (
            <Badge key={tag} variant="outline" className="text-xs capitalize">{tag}</Badge>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Badge className="text-xs bg-violet-100 text-violet-700 hover:bg-violet-100">
            Airalo · eSIM
          </Badge>
          <Button
            size="sm"
            onClick={handleBuy}
            className="h-7 text-xs gap-1 bg-violet-600 hover:bg-violet-700"
            data-testid={`button-buy-esim-${item.id}`}
          >
            Get eSIM
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
