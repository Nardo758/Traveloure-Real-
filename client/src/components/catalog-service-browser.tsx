/**
 * CatalogServiceBrowser — Task #601
 *
 * Replaces the old ServiceBrowser (provider-only) with a catalog-backed view:
 * every platform `service_offering_types` entry for the city is shown, grouped
 * by category, as either:
 *   • "Book"         — a real active provider is verified for this offering type
 *   • "Request this" — no provider yet; wired up for demand loop by Task #602
 *
 * Affiliate offering types (aff_*) are excluded server-side.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Search,
  Camera,
  Car,
  UtensilsCrossed,
  Baby,
  Compass,
  Briefcase,
  Wrench,
  Heart,
  Sparkles,
  Dog,
  PartyPopper,
  Laptop,
  Languages,
  Award,
  HelpCircle,
  ShoppingCart,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Type mirrors the server CatalogEntry ───────────────────────────────────

interface CatalogCoverage {
  providerServiceId: string;
  providerName: string;
  price: string | null;
  href: string;
}

interface CatalogEntry {
  offeringTypeKey: string;
  displayName: string;
  tagline: string | null;
  categoryKey: string;
  isSurprising: boolean;
  seasonTag: string | null;
  coveredBy: CatalogCoverage | null;
}

// ─── Category metadata ───────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "photography":            Camera,
  "private_transportation": Car,
  "dining_venue":           UtensilsCrossed,
  "food-culinary":          UtensilsCrossed,
  "childcare_family":       Baby,
  "tour_guide":             Compass,
  "tours-experiences":      Compass,
  "activity_provider":      Compass,
  "personal-assistance":    Briefcase,
  "concierge_vip":          Briefcase,
  "taskrabbit-services":    Wrench,
  "health-wellness":        Heart,
  "wellness":               Heart,
  "beauty-styling":         Sparkles,
  "hair_makeup":            Sparkles,
  "pets-animals":           Dog,
  "events-celebrations":    PartyPopper,
  "event_coordinator":      PartyPopper,
  "entertainment":          PartyPopper,
  "technology-connectivity": Laptop,
  "language-translation":   Languages,
  "specialty-services":     Award,
  "private_chef":           UtensilsCrossed,
  "accommodation":          Briefcase,
  "accessibility_specialist": Heart,
  "custom-other":           HelpCircle,
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  photography:             "Photography",
  private_transportation:  "Private Transport",
  dining_venue:            "Dining & Restaurants",
  childcare_family:        "Childcare & Family",
  tour_guide:              "Guides & Tours",
  activity_provider:       "Activities & Workshops",
  private_chef:            "Private Chef",
  concierge_vip:           "Concierge & VIP",
  accommodation:           "Accommodation",
  accessibility_specialist:"Accessibility",
  event_coordinator:       "Events & Celebrations",
  caterer:                 "Catering",
  florist:                 "Florist",
  entertainment:           "Entertainment",
  hair_makeup:             "Hair & Makeup",
  videographer:            "Videography",
  av_tech:                 "AV & Tech",
  rentals:                 "Rentals",
  officiant:               "Officiant",
  printing_materials:      "Print & Signage",
};

function categoryIcon(key: string): React.ElementType {
  return CATEGORY_ICONS[key] ?? Compass;
}

function categoryDisplayName(key: string): string {
  return CATEGORY_DISPLAY_NAMES[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Single catalog card ─────────────────────────────────────────────────────

function CatalogCard({
  entry,
  onAddToCart,
}: {
  entry: CatalogEntry;
  onAddToCart?: (entry: CatalogEntry) => void;
}) {
  const Icon = categoryIcon(entry.categoryKey);
  const covered = !!entry.coveredBy;
  const price = entry.coveredBy?.price
    ? (() => {
        const n = parseFloat(entry.coveredBy.price!);
        return isNaN(n) ? entry.coveredBy.price : `$${Math.round(n)}`;
      })()
    : null;

  return (
    <Card
      className={cn(
        "h-full flex flex-col",
        covered ? "hover-elevate" : "border-dashed opacity-90 hover:opacity-100 transition-opacity"
      )}
      data-testid={`card-catalog-${entry.offeringTypeKey}`}
    >
      <CardContent className="p-4 flex flex-col flex-1">
        <div className="flex gap-3">
          <div className={cn(
            "w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0",
            covered ? "bg-primary/10" : "bg-muted"
          )}>
            <Icon className={cn("w-6 h-6", covered ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5 flex-wrap">
              <h3
                className="font-semibold text-[14px] leading-tight text-foreground"
                data-testid={`text-offering-name-${entry.offeringTypeKey}`}
              >
                {entry.displayName}
              </h3>
              {entry.isSurprising && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                  ✦ Surprising
                </Badge>
              )}
            </div>
            {entry.tagline && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {entry.tagline}
              </p>
            )}
          </div>
        </div>

        <div className="mt-auto pt-3 border-t mt-3">
          {covered ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">
                  {entry.coveredBy!.providerName}
                </p>
                {price && (
                  <div className="flex items-center gap-0.5 text-sm font-semibold mt-0.5">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span data-testid={`text-price-${entry.offeringTypeKey}`}>{price}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {onAddToCart && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => onAddToCart(entry)}
                    data-testid={`btn-cart-${entry.offeringTypeKey}`}
                  >
                    <ShoppingCart className="w-3 h-3" />
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs px-3 bg-[#FF385C] hover:bg-[#E23350]"
                  asChild
                  data-testid={`btn-book-${entry.offeringTypeKey}`}
                >
                  <Link href={entry.coveredBy!.href}>Book</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground italic flex-1">
                Not yet available here
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-3 border-dashed flex-shrink-0"
                data-testid={`btn-request-${entry.offeringTypeKey}`}
                data-offering-type={entry.offeringTypeKey}
                data-category-key={entry.categoryKey}
              >
                Request this
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main browser component ──────────────────────────────────────────────────

interface CatalogServiceBrowserProps {
  city?: string;
  country?: string;
  categoryFilter?: string;
  /** Max service radius in km — maps from the "Within X km" distance selector */
  distanceKm?: string;
  startDate?: Date;
  endDate?: Date;
  onAddToCart?: (item: {
    id: string;
    type: string;
    name: string;
    price: number;
    quantity: number;
    provider: string;
  }) => void;
}

export function CatalogServiceBrowser({
  city = "",
  country = "",
  categoryFilter = "all",
  distanceKm = "any",
  startDate,
  endDate,
  onAddToCart,
}: CatalogServiceBrowserProps) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (country) params.set("country", country);
  if (categoryFilter && categoryFilter !== "all") params.set("categoryKey", categoryFilter);
  if (distanceKm && distanceKm !== "any") params.set("distanceKm", distanceKm);
  if (startDate) params.set("dateStart", startDate.toISOString().split("T")[0]);
  if (endDate) params.set("dateEnd", endDate.toISOString().split("T")[0]);

  const { data: entries = [], isLoading } = useQuery<CatalogEntry[]>({
    queryKey: [`/api/catalog/services?${params.toString()}`],
    staleTime: 3 * 60 * 1000,
    enabled: !!city,
  });

  if (!city) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Enter a destination to browse available services.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Skeleton className="w-12 h-12 rounded-md" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t flex justify-between">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-7 w-16 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-8 text-center">
          <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold mb-1">No services found</h3>
          <p className="text-muted-foreground text-sm">
            Try removing filters or changing your dates.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by category
  const grouped = entries.reduce<Record<string, CatalogEntry[]>>((acc, e) => {
    if (!acc[e.categoryKey]) acc[e.categoryKey] = [];
    acc[e.categoryKey].push(e);
    return acc;
  }, {});

  const categoryKeys = Object.keys(grouped);
  const coveredCount = entries.filter(e => e.coveredBy).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {coveredCount} bookable · {entries.length - coveredCount} requestable in {city}
      </p>

      {categoryKeys.map(catKey => (
        <div key={catKey} className="space-y-3">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = categoryIcon(catKey);
              return <Icon className="w-4 h-4 text-muted-foreground" />;
            })()}
            <h4
              className="text-sm font-semibold text-foreground"
              data-testid={`heading-category-${catKey}`}
            >
              {categoryDisplayName(catKey)}
            </h4>
            <span className="text-xs text-muted-foreground">({grouped[catKey].length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {grouped[catKey].map(entry => (
              <CatalogCard
                key={entry.offeringTypeKey}
                entry={entry}
                onAddToCart={onAddToCart ? (e) => {
                  const price = e.coveredBy?.price ? parseFloat(e.coveredBy.price) : 0;
                  onAddToCart({
                    id: `catalog-${e.offeringTypeKey}`,
                    type: "services",
                    name: e.displayName,
                    price: isNaN(price) ? 0 : price,
                    quantity: 1,
                    provider: e.coveredBy?.providerName ?? "Platform Service",
                  });
                } : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
