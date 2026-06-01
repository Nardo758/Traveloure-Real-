import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plane, Globe, ArrowRight, ExternalLink, Clock } from "lucide-react";
import type { CatalogItem } from "@/types/catalog";

interface NomadRouteCardProps {
  item: CatalogItem;
  className?: string;
}

export function NomadRouteCard({ item, className }: NomadRouteCardProps) {
  const handleBook = () => {
    if (item.affiliateUrl || item.bookingUrl) {
      window.open((item.affiliateUrl || item.bookingUrl)!, "_blank", "noopener");
    }
  };

  const citySegments = item.description?.split(", ") ?? [];

  return (
    <Card
      className={`overflow-hidden hover:shadow-md transition-shadow border-teal-100 ${className ?? ""}`}
      data-testid={`card-nomad-${item.id}`}
    >
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-teal-100 flex items-center justify-center">
            <Globe className="h-4 w-4 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
              Nomad Multi-City Route
            </p>
            <p
              className="text-sm font-semibold truncate"
              data-testid={`text-nomad-title-${item.id}`}
            >
              {item.title}
            </p>
          </div>
          {item.price && (
            <div className="text-right flex-shrink-0">
              <p
                className="font-bold text-base text-teal-700"
                data-testid={`text-nomad-price-${item.id}`}
              >
                {item.currency} {item.price.toFixed(0)}
              </p>
            </div>
          )}
        </div>
      </div>

      <CardContent className="p-4">
        {citySegments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-3">
            {citySegments.map((seg, idx) => (
              <span key={idx} className="flex items-center gap-1">
                <span className="text-xs font-medium text-foreground">{seg}</span>
                {idx < citySegments.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                )}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.duration && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {item.duration}
            </Badge>
          )}
          <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">
            Nomad Route
          </Badge>
          {item.tags.filter(t => !["nomad", "multi-city"].includes(t)).slice(0, 2).map(t => (
            <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Badge className="text-xs bg-teal-100 text-teal-700 hover:bg-teal-100">
            Kiwi.com
          </Badge>
          <Button
            size="sm"
            onClick={handleBook}
            className="h-7 text-xs gap-1 bg-teal-600 hover:bg-teal-700"
            data-testid={`button-book-nomad-${item.id}`}
          >
            <Plane className="h-3 w-3" />
            View Route
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
