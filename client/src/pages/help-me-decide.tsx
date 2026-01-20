import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  Search,
  MapPin,
  Calendar,
  Users,
  Star,
  Clock,
  Heart,
  ArrowRight,
  Sparkles,
  BookOpen,
  Ticket,
  Globe,
  TrendingUp,
  Filter,
  ChevronRight,
  ShoppingCart,
  GitCompare,
  Loader2,
  Plus,
  Building2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DestinationCalendar } from "@/components/destination-calendar";
import { TravelPulseCard, TravelPulseTrendingData } from "@/components/travelpulse/TravelPulseCard";
import { CityGrid } from "@/components/travelpulse/CityGrid";

interface Service {
  id: string;
  serviceName: string;
  shortDescription: string;
  price: string;
  location: string;
  averageRating: string;
  reviewCount: number;
  categoryId: string;
  status: string;
}

interface CartData {
  items: any[];
  itemCount: number;
  subtotal: string;
  total: string;
}

const categories = [
  { id: "all", label: "All", icon: Globe },
  { id: "adventure", label: "Adventure", icon: TrendingUp },
  { id: "cultural", label: "Cultural", icon: BookOpen },
  { id: "relaxation", label: "Relaxation", icon: Heart },
  { id: "romantic", label: "Romantic", icon: Heart },
  { id: "family", label: "Family", icon: Users },
];

const preResearchedTrips = [
  {
    id: 1,
    title: "Discover Kyoto's Ancient Temples",
    destination: "Kyoto, Japan",
    duration: "7 days",
    travelers: "2-4",
    category: "cultural",
    rating: 4.9,
    reviews: 234,
    price: 2499,
    originalPrice: 2999,
    image: null,
    highlights: ["Fushimi Inari Shrine", "Traditional Tea Ceremony", "Bamboo Grove Walk"],
    expertPick: true,
  },
  {
    id: 2,
    title: "Amalfi Coast Dream Escape",
    destination: "Amalfi, Italy",
    duration: "5 days",
    travelers: "2",
    category: "romantic",
    rating: 4.8,
    reviews: 189,
    price: 3299,
    originalPrice: 3899,
    image: null,
    highlights: ["Positano Beach Day", "Limoncello Tasting", "Sunset Boat Cruise"],
    expertPick: true,
  },
  {
    id: 3,
    title: "Bali Wellness Retreat",
    destination: "Ubud, Bali",
    duration: "6 days",
    travelers: "1-2",
    category: "relaxation",
    rating: 4.9,
    reviews: 312,
    price: 1899,
    originalPrice: 2299,
    image: null,
    highlights: ["Yoga Sessions", "Rice Terrace Walks", "Spa Treatments"],
    expertPick: false,
  },
  {
    id: 4,
    title: "Costa Rica Adventure Week",
    destination: "Costa Rica",
    duration: "8 days",
    travelers: "2-6",
    category: "adventure",
    rating: 4.7,
    reviews: 156,
    price: 2199,
    originalPrice: 2699,
    image: null,
    highlights: ["Zip-lining", "Volcano Hiking", "Wildlife Safari"],
    expertPick: false,
  },
  {
    id: 5,
    title: "Paris Family Discovery",
    destination: "Paris, France",
    duration: "5 days",
    travelers: "4-6",
    category: "family",
    rating: 4.8,
    reviews: 278,
    price: 2799,
    originalPrice: 3299,
    image: null,
    highlights: ["Eiffel Tower", "Disneyland Paris", "Seine River Cruise"],
    expertPick: true,
  },
  {
    id: 6,
    title: "Moroccan Desert Adventure",
    destination: "Marrakech, Morocco",
    duration: "6 days",
    travelers: "2-4",
    category: "adventure",
    rating: 4.6,
    reviews: 98,
    price: 1599,
    originalPrice: 1999,
    image: null,
    highlights: ["Sahara Camping", "Medina Tour", "Camel Trek"],
    expertPick: false,
  },
];

const articles = [
  {
    id: 1,
    title: "10 Hidden Gems in Southeast Asia You Need to Visit",
    category: "Destinations",
    readTime: "8 min",
    image: null,
  },
  {
    id: 2,
    title: "How to Plan the Perfect Honeymoon on a Budget",
    category: "Planning",
    readTime: "6 min",
    image: null,
  },
  {
    id: 3,
    title: "Best Time to Visit Japan: A Season-by-Season Guide",
    category: "Guides",
    readTime: "10 min",
    image: null,
  },
];

const upcomingEvents = [
  {
    id: 1,
    title: "Cherry Blossom Festival",
    location: "Tokyo, Japan",
    date: "March 25 - April 10, 2026",
    category: "Festival",
  },
  {
    id: 2,
    title: "Rio Carnival",
    location: "Rio de Janeiro, Brazil",
    date: "February 13 - 18, 2026",
    category: "Festival",
  },
  {
    id: 3,
    title: "Oktoberfest",
    location: "Munich, Germany",
    date: "September 19 - October 4, 2026",
    category: "Festival",
  },
];

export default function HelpMeDecidePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [addedServices, setAddedServices] = useState<Set<string>>(new Set());
  const [creatingComparison, setCreatingComparison] = useState(false);
  const [travelPulseCity, setTravelPulseCity] = useState("Tokyo");
  const [travelPulseCityInput, setTravelPulseCityInput] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const trendingUrl = `/api/travelpulse/trending/${encodeURIComponent(travelPulseCity)}?limit=6`;
  const { data: trendingData, isLoading: trendingLoading } = useQuery<{ trending: TravelPulseTrendingData[]; city: string; count: number }>({
    queryKey: [trendingUrl],
    staleTime: 30 * 60 * 1000,
  });

  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider-services"],
  });

  const { data: cart } = useQuery<CartData>({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  const addToCartMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      return apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
    },
    onSuccess: (_, serviceId) => {
      setAddedServices(prev => new Set(prev).add(serviceId));
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart", description: "Service added to your trip" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to add", description: "Please try again" });
    },
  });

  const createComparison = async () => {
    if (!cart || cart.items.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add some services first" });
      return;
    }
    if (!user) {
      toast({ title: "Please sign in", description: "Sign in to use AI comparison" });
      return;
    }
    setCreatingComparison(true);
    
    const cartItems = cart.items.map((item: any) => ({
      name: item.service?.serviceName || "Service",
      category: item.service?.category || "service",
      price: item.service?.price || "0",
      provider: item.service?.providerName || "Provider",
      location: item.service?.location || ""
    }));
    
    try {
      const response = await apiRequest("POST", "/api/itinerary-comparisons", {
        title: "My Trip",
        destination: cart.items[0]?.service?.location || "Paris, France",
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: cart.total,
        travelers: 2
      });
      
      const comparison = await response.json();
      sessionStorage.setItem(`comparison_baseline_${comparison.id}`, JSON.stringify(cartItems));
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } catch (error: any) {
      console.error("Failed to create comparison:", error);
      toast({ 
        variant: "destructive", 
        title: "Failed to create comparison",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const filteredTrips = preResearchedTrips.filter((trip) => {
    const matchesSearch =
      searchQuery === "" ||
      trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.destination.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || trip.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const filteredServices = (services || []).filter((service) => {
    if (service.status !== "active") return false;
    if (!serviceSearchQuery) return true;
    return (
      service.serviceName.toLowerCase().includes(serviceSearchQuery.toLowerCase()) ||
      service.location?.toLowerCase().includes(serviceSearchQuery.toLowerCase())
    );
  });

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#FF385C] to-[#E23350] text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              Expert-Curated Trips
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Can't Decide? We've Got You Covered
            </h1>
            <p className="text-lg text-white/90 max-w-2xl mx-auto">
              Browse our collection of pre-researched, expert-approved trip packages.
              Each one is carefully crafted to give you an unforgettable experience.
            </p>
          </motion.div>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl p-4 shadow-xl max-w-3xl mx-auto"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search destinations, trip types..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 border-[#E5E7EB] text-[#111827]"
                  data-testid="input-search-trips"
                />
              </div>
              <Button
                className="h-12 px-8 bg-[#FF385C] hover:bg-[#E23350] text-white"
                data-testid="button-search-trips"
              >
                Find Trips
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <Tabs defaultValue="services" className="w-full">
            <TabsList className="bg-white border border-[#E5E7EB] p-1 mb-8 flex-wrap">
              <TabsTrigger
                value="services"
                className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white"
                data-testid="tab-services"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Browse Services
              </TabsTrigger>
              <TabsTrigger
                value="packages"
                className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white"
                data-testid="tab-packages"
              >
                <Globe className="w-4 h-4 mr-2" />
                Trip Packages
              </TabsTrigger>
              <TabsTrigger
                value="articles"
                className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white"
                data-testid="tab-articles"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Travel Articles
              </TabsTrigger>
              <TabsTrigger
                value="events"
                className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white"
                data-testid="tab-events"
              >
                <Ticket className="w-4 h-4 mr-2" />
                Upcoming Events
              </TabsTrigger>
              <TabsTrigger
                value="travelpulse"
                className="data-[state=active]:bg-[#FF385C] data-[state=active]:text-white"
                data-testid="tab-travelpulse"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                TravelPulse
              </TabsTrigger>
            </TabsList>

            {/* Browse Services Tab */}
            <TabsContent value="services">
              {/* Cart Summary Bar */}
              {cart && cart.items.length > 0 && (
                <div className="mb-6 p-4 bg-white border border-[#E5E7EB] rounded-lg flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="w-5 h-5 text-[#FF385C]" />
                    <span className="font-medium text-[#111827]">
                      {cart.itemCount} items in cart
                    </span>
                    <span className="text-[#6B7280]">
                      Total: ${cart.total}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <Link href="/cart">
                      <Button variant="outline" data-testid="button-view-cart">
                        View Cart
                      </Button>
                    </Link>
                    <Button
                      className="bg-[#FF385C] hover:bg-[#E23350]"
                      onClick={createComparison}
                      disabled={creatingComparison}
                      data-testid="button-compare-ai"
                    >
                      {creatingComparison ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <GitCompare className="w-4 h-4 mr-2" />
                      )}
                      Compare AI Alternatives
                    </Button>
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="mb-6">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    placeholder="Search services..."
                    value={serviceSearchQuery}
                    onChange={(e) => setServiceSearchQuery(e.target.value)}
                    className="pl-10 h-12 border-[#E5E7EB]"
                    data-testid="input-search-services"
                  />
                </div>
              </div>

              {/* Services Grid */}
              {servicesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-64" />
                  ))}
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="text-center py-16">
                  <Building2 className="w-16 h-16 mx-auto text-[#9CA3AF] mb-4" />
                  <h3 className="text-lg font-semibold text-[#111827] mb-2">
                    No services found
                  </h3>
                  <p className="text-[#6B7280]">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredServices.slice(0, 12).map((service, idx) => (
                    <motion.div
                      key={service.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card
                        className="bg-white border-[#E5E7EB] hover:shadow-lg transition-shadow overflow-hidden group"
                        data-testid={`card-service-${service.id}`}
                      >
                        <CardContent className="p-0">
                          <div className="h-32 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                            <Building2 className="w-10 h-10 text-gray-400" />
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-2 text-sm text-[#6B7280] mb-2">
                              <MapPin className="w-4 h-4" />
                              <span className="truncate">{service.location || "Various locations"}</span>
                            </div>
                            <h3 className="font-semibold text-[#111827] mb-2 line-clamp-1 group-hover:text-[#FF385C] transition-colors">
                              {service.serviceName}
                            </h3>
                            <p className="text-sm text-[#6B7280] line-clamp-2 mb-3">
                              {service.shortDescription}
                            </p>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                <span className="text-sm font-medium">{service.averageRating || "4.5"}</span>
                                <span className="text-sm text-[#6B7280]">({service.reviewCount || 0})</span>
                              </div>
                              <span className="font-bold text-[#111827]">${service.price}</span>
                            </div>
                            <Button
                              className={cn(
                                "w-full",
                                addedServices.has(service.id)
                                  ? "bg-green-600 hover:bg-green-700"
                                  : "bg-[#FF385C] hover:bg-[#E23350]"
                              )}
                              onClick={() => {
                                if (!user) {
                                  toast({ title: "Please sign in", description: "Sign in to add items to cart" });
                                  return;
                                }
                                addToCartMutation.mutate(service.id);
                              }}
                              disabled={addToCartMutation.isPending || addedServices.has(service.id)}
                              data-testid={`button-add-service-${service.id}`}
                            >
                              {addedServices.has(service.id) ? (
                                <>
                                  <Check className="w-4 h-4 mr-2" />
                                  Added
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 mr-2" />
                                  Add to Trip
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Trip Packages Tab */}
            <TabsContent value="packages">
              {/* Category Filters */}
              <div className="flex flex-wrap gap-2 mb-8">
                {categories.map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      selectedCategory === cat.id
                        ? "bg-[#FF385C] hover:bg-[#E23350] text-white"
                        : "border-[#E5E7EB]"
                    )}
                    data-testid={`button-category-${cat.id}`}
                  >
                    <cat.icon className="w-4 h-4 mr-1" />
                    {cat.label}
                  </Button>
                ))}
              </div>

              {/* Trip Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTrips.map((trip, idx) => (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card
                      className="bg-white border-[#E5E7EB] hover:shadow-lg transition-shadow overflow-hidden group"
                      data-testid={`card-trip-${trip.id}`}
                    >
                      <CardContent className="p-0">
                        {/* Image placeholder */}
                        <div className="relative h-48 bg-gradient-to-br from-gray-200 to-gray-300">
                          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                            <MapPin className="w-12 h-12" />
                          </div>
                          
                          {/* Favorite button */}
                          <button
                            onClick={() => toggleFavorite(trip.id)}
                            className="absolute top-3 right-3 p-2 bg-white/90 rounded-full shadow-sm"
                            data-testid={`button-favorite-${trip.id}`}
                          >
                            <Heart
                              className={cn(
                                "w-5 h-5",
                                favorites.includes(trip.id)
                                  ? "fill-[#FF385C] text-[#FF385C]"
                                  : "text-gray-600"
                              )}
                            />
                          </button>

                          {/* Expert Pick badge */}
                          {trip.expertPick && (
                            <div className="absolute top-3 left-3">
                              <Badge className="bg-[#FF385C] text-white">
                                <Star className="w-3 h-3 mr-1 fill-current" />
                                Expert Pick
                              </Badge>
                            </div>
                          )}

                          {/* Price */}
                          <div className="absolute bottom-3 right-3 bg-white px-3 py-1 rounded-lg shadow-sm">
                            <span className="text-xs text-[#6B7280] line-through">
                              ${trip.originalPrice}
                            </span>
                            <span className="ml-1 font-bold text-[#111827]">
                              ${trip.price}
                            </span>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                          <div className="flex items-center gap-2 text-sm text-[#6B7280] mb-2">
                            <MapPin className="w-4 h-4" />
                            <span>{trip.destination}</span>
                          </div>

                          <h3 className="font-semibold text-[#111827] mb-3 group-hover:text-[#FF385C] transition-colors">
                            {trip.title}
                          </h3>

                          {/* Trip details */}
                          <div className="flex flex-wrap gap-3 text-sm text-[#6B7280] mb-3">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {trip.duration}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {trip.travelers}
                            </span>
                            <span className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              {trip.rating} ({trip.reviews})
                            </span>
                          </div>

                          {/* Highlights */}
                          <div className="flex flex-wrap gap-1 mb-4">
                            {trip.highlights.slice(0, 2).map((h) => (
                              <Badge
                                key={h}
                                variant="secondary"
                                className="text-xs"
                              >
                                {h}
                              </Badge>
                            ))}
                            {trip.highlights.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{trip.highlights.length - 2} more
                              </Badge>
                            )}
                          </div>

                          {/* CTA */}
                          <Link href={`/help-me-decide/trip/${trip.id}`}>
                            <Button
                              className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                              data-testid={`button-view-trip-${trip.id}`}
                            >
                              View Details
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Empty state */}
              {filteredTrips.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#F3F4F6] flex items-center justify-center">
                    <Search className="w-8 h-8 text-[#9CA3AF]" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#111827] mb-2">
                    No trips found
                  </h3>
                  <p className="text-[#6B7280] mb-4">
                    Try adjusting your search or filters
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedCategory("all");
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Articles Tab */}
            <TabsContent value="articles">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {articles.map((article, idx) => (
                  <motion.div
                    key={article.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Link href={`/help-me-decide/articles/${article.id}`}>
                      <Card
                        className="bg-white border-[#E5E7EB] hover:shadow-lg transition-shadow overflow-hidden cursor-pointer group"
                        data-testid={`card-article-${article.id}`}
                      >
                        <CardContent className="p-0">
                          <div className="h-40 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                            <BookOpen className="w-12 h-12 text-gray-400" />
                          </div>
                          <div className="p-4">
                            <Badge variant="secondary" className="mb-2 text-xs">
                              {article.category}
                            </Badge>
                            <h3 className="font-semibold text-[#111827] mb-2 group-hover:text-[#FF385C] transition-colors line-clamp-2">
                              {article.title}
                            </h3>
                            <div className="flex items-center gap-1 text-sm text-[#6B7280]">
                              <Clock className="w-4 h-4" />
                              {article.readTime} read
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </div>

              <div className="text-center mt-8">
                <Link href="/help-me-decide/articles">
                  <Button variant="outline" className="border-[#E5E7EB]" data-testid="button-view-all-articles">
                    View All Articles
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events">
              {/* Destination Calendar - When to Visit */}
              <div className="mb-8">
                <DestinationCalendar />
              </div>

              {/* Upcoming Events */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-[#111827] flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-[#FF385C]" />
                  Upcoming Events Around the World
                </h3>
              </div>
              <div className="space-y-4">
                {upcomingEvents.map((event, idx) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Link href={`/help-me-decide/events/${event.id}`}>
                      <Card
                        className="bg-white border-[#E5E7EB] hover:shadow-md hover:border-[#FF385C] transition-all cursor-pointer"
                        data-testid={`card-event-${event.id}`}
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-16 h-16 rounded-lg bg-[#FFE3E8] flex items-center justify-center flex-shrink-0">
                            <Ticket className="w-8 h-8 text-[#FF385C]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <Badge variant="secondary" className="mb-1 text-xs">
                              {event.category}
                            </Badge>
                            <h3 className="font-semibold text-[#111827] mb-1">
                              {event.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-[#6B7280]">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {event.location}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {event.date}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </div>

              <div className="text-center mt-8">
                <Link href="/help-me-decide/events">
                  <Button variant="outline" className="border-[#E5E7EB]" data-testid="button-view-all-events">
                    View All Events
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </TabsContent>

            {/* TravelPulse Tab - Real-time travel intelligence */}
            <TabsContent value="travelpulse">
              <CityGrid />
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Still Undecided CTA */}
      <section className="py-16 bg-white border-t border-[#E5E7EB]">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-[#111827] mb-4">
            Still Can't Decide?
          </h2>
          <p className="text-lg text-[#6B7280] mb-8 max-w-2xl mx-auto">
            Talk to one of our travel experts. They'll help you find the perfect
            trip based on your preferences, budget, and travel style.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/experts">
              <Button
                size="lg"
                className="bg-[#FF385C] hover:bg-[#E23350] text-white px-8"
                data-testid="button-talk-to-expert"
              >
                Talk to an Expert
              </Button>
            </Link>
            <Link href="/browse">
              <Button
                size="lg"
                variant="outline"
                className="border-[#E5E7EB] px-8"
                data-testid="button-build-own-trip"
              >
                Build Your Own Trip
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
