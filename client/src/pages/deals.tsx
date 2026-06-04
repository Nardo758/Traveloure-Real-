import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  Search,
  MapPin,
  Star,
  Tag,
  Sparkles,
  Plane,
  Hotel,
  Activity,
  Car,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const dealCategories = [
  { id: "all", label: "All Deals", icon: Sparkles },
  { id: "flights", label: "Flights", icon: Plane },
  { id: "hotels", label: "Hotels", icon: Hotel },
  { id: "experiences", label: "Experiences", icon: Activity },
  { id: "cars", label: "Car Rentals", icon: Car },
];

interface DealItem {
  id: string;
  type: string;
  title: string;
  destination: string;
  price: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  affiliateUrl: string | null;
  provider: string;
  providerLabel: string;
  featured: boolean;
}

const typeIcons: Record<string, React.ElementType> = {
  flight: Plane,
  hotel: Hotel,
  activity: Activity,
  car_rental: Car,
};

const typeColors: Record<string, string> = {
  flight: "bg-blue-50 text-blue-700",
  hotel: "bg-purple-50 text-purple-700",
  activity: "bg-green-50 text-green-700",
  car_rental: "bg-amber-50 text-amber-700",
};

function DealCardSkeleton() {
  return (
    <Card className="bg-white border-[#E5E7EB] overflow-hidden">
      <CardContent className="p-0">
        <Skeleton className="h-40 w-full rounded-none" />
        <div className="p-4 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-32" />
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DealCard({ deal, idx }: { deal: DealItem; idx: number }) {
  const TypeIcon = typeIcons[deal.type] || Tag;
  const colorClass = typeColors[deal.type] || "bg-gray-50 text-gray-700";

  const formattedPrice =
    deal.price !== null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: deal.currency || "USD",
          maximumFractionDigits: 0,
        }).format(deal.price)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
    >
      <Card className="bg-white border-[#E5E7EB] hover:shadow-lg transition-shadow overflow-hidden group h-full flex flex-col">
        <CardContent className="p-0 flex flex-col flex-1">
          {/* Image / placeholder */}
          <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0">
            {deal.imageUrl ? (
              <img
                src={deal.imageUrl}
                alt={deal.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                <TypeIcon className="w-12 h-12" />
              </div>
            )}

            {/* Featured badge */}
            {deal.featured && (
              <div className="absolute top-3 left-3">
                <Badge className="bg-[#FF385C] text-white text-xs">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Featured
                </Badge>
              </div>
            )}

            {/* Type badge */}
            <div className="absolute top-3 right-3">
              <Badge className={cn("text-xs font-medium border-0", colorClass)}>
                <TypeIcon className="w-3 h-3 mr-1" />
                {deal.type === "car_rental"
                  ? "Car"
                  : deal.type.charAt(0).toUpperCase() + deal.type.slice(1)}
              </Badge>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex flex-col flex-1">
            {deal.destination && (
              <div className="flex items-center gap-1 text-xs text-[#6B7280] mb-1">
                <MapPin className="w-3 h-3" />
                <span>{deal.destination}</span>
              </div>
            )}

            <h3
              className="font-semibold text-[#111827] mb-2 group-hover:text-[#FF385C] transition-colors text-sm leading-snug line-clamp-2"
              data-testid={`text-deal-title-${deal.id}`}
            >
              {deal.title}
            </h3>

            {deal.rating !== null && (
              <div className="flex items-center gap-1 text-xs text-[#6B7280] mb-2">
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                <span>{deal.rating.toFixed(1)}</span>
                {deal.reviewCount !== null && (
                  <span>({deal.reviewCount.toLocaleString()})</span>
                )}
              </div>
            )}

            <div className="mt-auto pt-2 flex items-center justify-between gap-2">
              <div>
                {formattedPrice ? (
                  <div>
                    <span
                      className="text-lg font-bold text-[#FF385C]"
                      data-testid={`text-deal-price-${deal.id}`}
                    >
                      {formattedPrice}
                    </span>
                    <span className="text-xs text-[#9CA3AF] ml-1">
                      {deal.type === "flight" ? "/person" : deal.type === "car_rental" ? "/day" : "/night"}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-[#6B7280]">Price varies</span>
                )}
                <div className="text-xs text-[#9CA3AF]">{deal.providerLabel}</div>
              </div>

              {deal.affiliateUrl ? (
                <a
                  href={deal.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`link-book-deal-${deal.id}`}
                >
                  <Button
                    size="sm"
                    className="bg-[#FF385C] hover:bg-[#E23350] text-white shrink-0"
                    data-testid={`button-book-${deal.id}`}
                  >
                    Book Now
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                </a>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled
                >
                  Unavailable
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function DealsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    clearTimeout((window as any).__dealSearchTimer);
    (window as any).__dealSearchTimer = setTimeout(() => setDebouncedSearch(val), 400);
  };

  const queryParams = new URLSearchParams();
  if (activeCategory !== "all") queryParams.set("type", activeCategory);
  if (debouncedSearch) queryParams.set("destination", debouncedSearch);

  const { data, isLoading, isError } = useQuery<{ deals: DealItem[]; total: number }>({
    queryKey: ["/api/deals", activeCategory, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/deals?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch deals");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const deals = data?.deals ?? [];
  const featuredDeals = deals.filter((d) => d.featured).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#FF385C] to-[#E23350] text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <Badge className="bg-white/20 text-white mb-6 border-0">
              <Sparkles className="w-3 h-3 mr-1" />
              Live Deals from Top Providers
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Exclusive Travel Deals
            </h1>
            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
              Real prices from Aviasales, Hotellook, Agoda, GetYourGuide, Klook, Tiqets and DiscoverCars — book directly with our affiliate partners.
            </p>

            {/* Search Bar */}
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="Search by destination (e.g. Tokyo, Paris, Bali)..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-12 h-14 text-lg border-0 bg-white text-[#111827] rounded-xl"
                data-testid="input-search-deals"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured Deals */}
      {!isLoading && featuredDeals.length > 0 && (
        <section className="py-12 -mt-8">
          <div className="container mx-auto px-4 max-w-6xl">
            <h2 className="text-2xl font-bold text-[#111827] mb-6">
              Featured Deals
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredDeals.map((deal, idx) => (
                <DealCard key={deal.id} deal={deal} idx={idx} />
              ))}
            </div>
          </div>
        </section>
      )}

      {isLoading && (
        <section className="py-12 -mt-8">
          <div className="container mx-auto px-4 max-w-6xl">
            <h2 className="text-2xl font-bold text-[#111827] mb-6">Featured Deals</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => <DealCardSkeleton key={n} />)}
            </div>
          </div>
        </section>
      )}

      {/* All Deals */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            {dealCategories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Button
                  key={cat.id}
                  variant={activeCategory === cat.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "gap-1.5",
                    activeCategory === cat.id
                      ? "bg-[#FF385C] hover:bg-[#E23350] text-white border-transparent"
                      : "border-[#E5E7EB] text-[#374151]"
                  )}
                  data-testid={`button-category-${cat.id}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat.label}
                </Button>
              );
            })}
          </div>

          {/* Count */}
          {!isLoading && !isError && (
            <p className="text-sm text-[#6B7280] mb-4">
              {deals.length} live deal{deals.length !== 1 ? "s" : ""} found
              {debouncedSearch ? ` for "${debouncedSearch}"` : ""}
            </p>
          )}

          {/* Loading skeleton grid */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <DealCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error state */}
          {isError && !isLoading && (
            <div className="text-center py-16">
              <Tag className="w-16 h-16 text-[#9CA3AF] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[#111827] mb-2">
                Couldn't load deals
              </h3>
              <p className="text-[#6B7280]">
                Our deal providers may be temporarily unavailable. Try again in a moment.
              </p>
            </div>
          )}

          {/* Deals Grid */}
          {!isLoading && !isError && deals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {deals.map((deal, idx) => (
                <DealCard key={deal.id} deal={deal} idx={idx} />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !isError && deals.length === 0 && (
            <div className="text-center py-16">
              <Tag className="w-16 h-16 text-[#9CA3AF] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[#111827] mb-2">
                No deals found
              </h3>
              <p className="text-[#6B7280] mb-4">
                {debouncedSearch
                  ? `No deals found for "${debouncedSearch}". Try a different destination.`
                  : "Try adjusting your category filter."}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedSearch("");
                  setActiveCategory("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-16 bg-white border-t border-[#E5E7EB]">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-2xl font-bold text-[#111827] mb-4">
            Never Miss a Deal
          </h2>
          <p className="text-[#6B7280] mb-6">
            Subscribe to get exclusive deals and flash sales delivered to your inbox
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              placeholder="Enter your email"
              className="h-12 border-[#E5E7EB]"
              data-testid="input-newsletter"
            />
            <Button
              className="h-12 px-8 bg-[#FF385C] hover:bg-[#E23350] text-white"
              data-testid="button-subscribe"
            >
              Subscribe
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
