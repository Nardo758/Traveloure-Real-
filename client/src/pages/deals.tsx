import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import {
  Search,
  MapPin,
  Calendar,
  Users,
  Star,
  Clock,
  Percent,
  Tag,
  ArrowRight,
  Timer,
  Sparkles,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

const dealCategories = [
  { id: "all", label: "All Deals" },
  { id: "flash", label: "Flash Sales" },
  { id: "seasonal", label: "Seasonal" },
  { id: "lastminute", label: "Last Minute" },
  { id: "bundle", label: "Bundles" },
];

const deals = [
  {
    id: 1,
    title: "Bali Paradise Escape",
    destination: "Bali, Indonesia",
    originalPrice: 2499,
    salePrice: 1799,
    discount: 28,
    duration: "7 days",
    travelers: "2",
    rating: 4.9,
    reviews: 234,
    category: "flash",
    endsIn: "2 days",
    image: null,
    highlights: ["Private villa", "Spa included", "Temple tour"],
    featured: true,
  },
  {
    id: 2,
    title: "Tokyo Cultural Discovery",
    destination: "Tokyo, Japan",
    originalPrice: 3299,
    salePrice: 2499,
    discount: 24,
    duration: "6 days",
    travelers: "2",
    rating: 4.8,
    reviews: 189,
    category: "seasonal",
    endsIn: "5 days",
    image: null,
    highlights: ["Cherry blossom season", "Tea ceremony", "Sushi class"],
    featured: true,
  },
  {
    id: 3,
    title: "Santorini Romantic Getaway",
    destination: "Santorini, Greece",
    originalPrice: 2899,
    salePrice: 2199,
    discount: 24,
    duration: "5 days",
    travelers: "2",
    rating: 4.9,
    reviews: 312,
    category: "lastminute",
    endsIn: "24 hours",
    image: null,
    highlights: ["Sunset cruise", "Wine tasting", "Cave hotel"],
    featured: false,
  },
  {
    id: 4,
    title: "Costa Rica Adventure Bundle",
    destination: "Costa Rica",
    originalPrice: 2699,
    salePrice: 1999,
    discount: 26,
    duration: "8 days",
    travelers: "2-4",
    rating: 4.7,
    reviews: 156,
    category: "bundle",
    endsIn: "7 days",
    image: null,
    highlights: ["Zip-lining", "Volcano hike", "Wildlife safari"],
    featured: false,
  },
  {
    id: 5,
    title: "Paris Luxury Weekend",
    destination: "Paris, France",
    originalPrice: 1899,
    salePrice: 1399,
    discount: 26,
    duration: "4 days",
    travelers: "2",
    rating: 4.8,
    reviews: 278,
    category: "flash",
    endsIn: "3 days",
    image: null,
    highlights: ["5-star hotel", "Private tour", "Michelin dinner"],
    featured: false,
  },
  {
    id: 6,
    title: "Maldives All-Inclusive",
    destination: "Maldives",
    originalPrice: 4999,
    salePrice: 3799,
    discount: 24,
    duration: "6 days",
    travelers: "2",
    rating: 5.0,
    reviews: 145,
    category: "seasonal",
    endsIn: "10 days",
    image: null,
    highlights: ["Overwater villa", "All meals", "Snorkeling"],
    featured: true,
  },
];

export default function DealsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredDeals = deals.filter((deal) => {
    const matchesSearch =
      searchQuery === "" ||
      deal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.destination.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      activeCategory === "all" || deal.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  const featuredDeals = deals.filter((d) => d.featured);

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
            <Badge className="bg-white/20 text-white mb-6">
              <Sparkles className="w-3 h-3 mr-1" />
              Limited Time Offers
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Exclusive Travel Deals
            </h1>
            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
              Discover incredible savings on handpicked trips. Book now before
              these deals disappear!
            </p>

            {/* Search Bar */}
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

      {/* Featured Deals */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-2xl font-bold text-[#111827] mb-6">
            Featured Deals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredDeals.map((deal, idx) => (
              <motion.div
                key={deal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="bg-white border-[#E5E7EB] hover:shadow-xl transition-shadow overflow-hidden group">
                  <CardContent className="p-0">
                    {/* Image placeholder */}
                    <div className="relative h-48 bg-gradient-to-br from-gray-200 to-gray-300">
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <MapPin className="w-12 h-12" />
                      </div>

                      {/* Discount badge */}
                      <div className="absolute top-3 left-3">
                        <Badge className="bg-[#FF385C] text-white">
                          <Percent className="w-3 h-3 mr-1" />
                          {deal.discount}% OFF
                        </Badge>
                      </div>

                      {/* Timer */}
                      <div className="absolute bottom-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        Ends in {deal.endsIn}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-sm text-[#6B7280] mb-2">
                        <MapPin className="w-4 h-4" />
                        <span>{deal.destination}</span>
                      </div>

                      <h3 className="font-semibold text-[#111827] mb-2 group-hover:text-[#FF385C] transition-colors">
                        {deal.title}
                      </h3>

                      <div className="flex flex-wrap gap-3 text-sm text-[#6B7280] mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {deal.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          {deal.rating}
                        </span>
                      </div>

                      {/* Price */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <span className="text-sm text-[#6B7280] line-through">
                            ${deal.originalPrice}
                          </span>
                          <span className="ml-2 text-2xl font-bold text-[#FF385C]">
                            ${deal.salePrice}
                          </span>
                        </div>
                        <span className="text-sm text-[#6B7280]">per person</span>
                      </div>

                      <Link href={`/deals/${deal.id}`}>
                        <Button
                          className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                          data-testid={`button-view-deal-${deal.id}`}
                        >
                          View Deal
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* All Deals */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div className="flex flex-wrap gap-2">
              {dealCategories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={activeCategory === cat.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    activeCategory === cat.id
                      ? "bg-[#FF385C] hover:bg-[#E23350] text-white"
                      : "border-[#E5E7EB]"
                  )}
                  data-testid={`button-category-${cat.id}`}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
            <Button variant="outline" className="border-[#E5E7EB]" data-testid="button-filter">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>

          {/* Deals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDeals.map((deal, idx) => (
              <motion.div
                key={deal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="bg-white border-[#E5E7EB] hover:shadow-lg transition-shadow overflow-hidden group">
                  <CardContent className="p-0">
                    <div className="relative h-40 bg-gradient-to-br from-gray-200 to-gray-300">
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <MapPin className="w-10 h-10" />
                      </div>
                      <div className="absolute top-3 left-3">
                        <Badge className="bg-[#FF385C] text-white text-xs">
                          {deal.discount}% OFF
                        </Badge>
                      </div>
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {deal.endsIn}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-center gap-1 text-sm text-[#6B7280] mb-1">
                        <MapPin className="w-3 h-3" />
                        {deal.destination}
                      </div>
                      <h3 className="font-semibold text-[#111827] mb-2 group-hover:text-[#FF385C] transition-colors">
                        {deal.title}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-[#6B7280] mb-3">
                        <span>{deal.duration}</span>
                        <span className="text-[#E5E7EB]">|</span>
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                          {deal.rating}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-[#6B7280] line-through">
                            ${deal.originalPrice}
                          </span>
                          <span className="ml-1 text-lg font-bold text-[#FF385C]">
                            ${deal.salePrice}
                          </span>
                        </div>
                        <Link href={`/deals/${deal.id}`}>
                          <Button
                            size="sm"
                            className="bg-[#FF385C] hover:bg-[#E23350] text-white"
                            data-testid={`button-book-${deal.id}`}
                          >
                            Book Now
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Empty State */}
          {filteredDeals.length === 0 && (
            <div className="text-center py-16">
              <Tag className="w-16 h-16 text-[#9CA3AF] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[#111827] mb-2">
                No deals found
              </h3>
              <p className="text-[#6B7280] mb-4">
                Try adjusting your search or filters
              </p>
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
          <h2 className="text-2xl font-bold text-[#111827] mb-4">
            Never Miss a Deal
          </h2>
          <p className="text-[#6B7280] mb-6">
            Subscribe to get exclusive deals and flash sales delivered to your
            inbox
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
