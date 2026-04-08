import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  MapPin,
  Calendar,
  Star,
  Clock,
  Tag,
  ArrowRight,
  Sparkles,
  Filter,
  Music,
  Ticket,
  Building2,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Deal {
  id: string;
  type: "event" | "hotel";
  source: "experiences" | "concerts" | "hotels";
  title: string;
  destination: string;
  city: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  bookingUrl: string | null;
  rating: number | null;
  isFree?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  starRating?: number | null;
  category: string;
  tags: string[];
}

interface DealsResponse {
  deals: Deal[];
  total: number;
}

const dealCategories = [
  { id: "all",          label: "All Deals",    icon: Sparkles },
  { id: "experiences",  label: "Experiences",  icon: Ticket },
  { id: "concerts",     label: "Concerts",     icon: Music },
  { id: "hotels",       label: "Hotels",       icon: Building2 },
  { id: "last-minute",  label: "Last Minute",  icon: Timer },
];

function formatPrice(price: number, currency: string) {
  if (price === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DealCardSkeleton() {
  return (
    <Card className="bg-white border-[#E5E7EB] overflow-hidden">
      <CardContent className="p-0">
        <Skeleton className="h-40 w-full rounded-none" />
        <div className="p-4 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}

function DealCard({ deal, idx }: { deal: Deal; idx: number }) {
  const isEvent = deal.type === "event";
  const isConcert = deal.source === "concerts";
  const dateLabel = isEvent
    ? formatDate(deal.startDate)
    : deal.checkIn
    ? `${formatDate(deal.checkIn)} – ${formatDate(deal.checkOut)}`
    : null;

  const accentColor = isConcert
    ? "from-purple-500 to-indigo-600"
    : isEvent
    ? "from-orange-400 to-rose-500"
    : "from-blue-500 to-cyan-600";

  const iconEl = isConcert ? (
    <Music className="w-10 h-10 text-white/70" />
  ) : isEvent ? (
    <Ticket className="w-10 h-10 text-white/70" />
  ) : (
    <Building2 className="w-10 h-10 text-white/70" />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      data-testid={`card-deal-${deal.id}`}
    >
      <Card className="bg-white border-[#E5E7EB] hover:shadow-lg transition-shadow overflow-hidden group h-full">
        <CardContent className="p-0 flex flex-col h-full">
          {/* Image / placeholder */}
          {deal.imageUrl ? (
            <div className="relative h-40 overflow-hidden">
              <img
                src={deal.imageUrl}
                alt={deal.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {deal.isFree && (
                <div className="absolute top-3 left-3">
                  <Badge className="bg-green-500 text-white text-xs">Free</Badge>
                </div>
              )}
            </div>
          ) : (
            <div className={`relative h-40 bg-gradient-to-br ${accentColor} flex items-center justify-center`}>
              {iconEl}
              {deal.isFree && (
                <div className="absolute top-3 left-3">
                  <Badge className="bg-white/20 text-white text-xs">Free</Badge>
                </div>
              )}
            </div>
          )}

          <div className="p-4 flex flex-col flex-1">
            <div className="flex items-center gap-1 text-sm text-[#6B7280] mb-1">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{deal.destination}</span>
            </div>

            <h3
              className="font-semibold text-[#111827] mb-2 group-hover:text-[#FF385C] transition-colors line-clamp-2 flex-1"
              data-testid={`text-deal-title-${deal.id}`}
            >
              {deal.title}
            </h3>

            <div className="flex items-center gap-2 text-sm text-[#6B7280] mb-3">
              {dateLabel && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {dateLabel}
                </span>
              )}
              {deal.rating && (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  {deal.rating.toFixed(1)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-auto">
              <span
                className="text-lg font-bold text-[#FF385C]"
                data-testid={`text-deal-price-${deal.id}`}
              >
                {formatPrice(deal.price, deal.currency)}
              </span>
              {deal.bookingUrl ? (
                <a href={deal.bookingUrl} target="_blank" rel="noopener noreferrer">
                  <Button
                    size="sm"
                    className="bg-[#FF385C] hover:bg-[#E23350] text-white"
                    data-testid={`button-book-${deal.id}`}
                  >
                    Book
                  </Button>
                </a>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-[#E5E7EB] text-[#6B7280]"
                  data-testid={`button-view-${deal.id}`}
                  disabled
                >
                  View
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

  const { data, isLoading, isError } = useQuery<DealsResponse>({
    queryKey: ["/api/deals", activeCategory],
    queryFn: () =>
      fetch(`/api/deals?category=${activeCategory}&limit=50`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const allDeals = data?.deals ?? [];

  const filteredDeals = allDeals.filter((deal) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      deal.title.toLowerCase().includes(q) ||
      deal.destination.toLowerCase().includes(q) ||
      deal.city.toLowerCase().includes(q)
    );
  });

  const featuredDeals = filteredDeals.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero */}
      <section className="bg-gradient-to-r from-[#FF385C] to-[#E23350] text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <Badge className="bg-white/20 text-white mb-6">
              <Sparkles className="w-3 h-3 mr-1" />
              Live Deals
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Exclusive Travel Deals
            </h1>
            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
              Real events, concerts, and hotel offers — updated daily from live providers.
            </p>

            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="Search destinations or deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-lg border-0 bg-white text-[#111827] rounded-xl"
                data-testid="input-search-deals"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured */}
      {!searchQuery && featuredDeals.length > 0 && (
        <section className="py-12 -mt-8">
          <div className="container mx-auto px-4 max-w-6xl">
            <h2 className="text-2xl font-bold text-[#111827] mb-6">Featured Deals</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => <DealCardSkeleton key={i} />)
                : featuredDeals.map((deal, idx) => (
                    <DealCard key={deal.id} deal={deal} idx={idx} />
                  ))}
            </div>
          </div>
        </section>
      )}

      {/* All Deals */}
      <section className={cn("py-12", !searchQuery && featuredDeals.length > 0 ? "" : "-mt-8")}>
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div className="flex flex-wrap gap-2">
              {dealCategories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Button
                    key={cat.id}
                    variant={activeCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "flex items-center gap-1.5",
                      activeCategory === cat.id
                        ? "bg-[#FF385C] hover:bg-[#E23350] text-white"
                        : "border-[#E5E7EB]"
                    )}
                    data-testid={`button-category-${cat.id}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cat.label}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
              {!isLoading && (
                <span data-testid="text-deal-count">{filteredDeals.length} deals found</span>
              )}
              <Button variant="outline" className="border-[#E5E7EB]" data-testid="button-filter">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>

          {/* Error state */}
          {isError && (
            <div className="text-center py-12">
              <Tag className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">Unable to load deals. Please try again.</p>
            </div>
          )}

          {/* Skeleton grid */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <DealCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Deals grid */}
          {!isLoading && !isError && filteredDeals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDeals.map((deal, idx) => (
                <DealCard key={deal.id} deal={deal} idx={idx} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && filteredDeals.length === 0 && (
            <div className="text-center py-16">
              <Tag className="w-16 h-16 text-[#9CA3AF] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[#111827] mb-2">No deals found</h3>
              <p className="text-[#6B7280] mb-4">Try adjusting your search or selecting a different category</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
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
          <h2 className="text-2xl font-bold text-[#111827] mb-4">Never Miss a Deal</h2>
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
