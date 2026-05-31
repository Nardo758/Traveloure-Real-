import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import {
  Search,
  MapPin,
  Star,
  Clock,
  DollarSign,
  Filter,
  X,
  SlidersHorizontal,
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
  ChevronLeft,
  ChevronRight,
  Wand2,
  Loader2,
  ShoppingCart,
  Plus,
  Check,
  Building2,
  Globe,
  BookOpen,
  Ticket,
  TrendingUp,
  Calendar,
  Users,
  ArrowRight,
  GitCompare,
  Zap,
  Trophy,
  CheckCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TravelPulseCard, TravelPulseTrendingData } from "@/components/travelpulse/TravelPulseCard";
import { CityGrid } from "@/components/travelpulse/CityGrid";
import { GlobalCalendar } from "@/components/travelpulse/GlobalCalendar";
import { TripQueueIndicator } from "@/components/TripQueueIndicator";
import { SEOHead } from "@/components/seo-head";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { trackSearchEvent } from "@/lib/analytics";

type ServiceCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryType: string;
  priceRange: { min: number; max: number } | null;
};

type Service = {
  id: string;
  userId: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  price: string;
  location: string;
  averageRating: string;
  reviewCount: number;
  status: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
};

type DiscoverResult = {
  services: Service[];
  total: number;
};

type AIRecommendation = {
  recommendedCategories: Array<{
    slug: string;
    name: string;
    reason: string;
  }>;
  recommendedServices: Array<Service & { recommendationReason: string }>;
  suggestions: string;
};

interface CartData {
  items: any[];
  itemCount: number;
  subtotal: string;
  total: string;
}

type ExpertTemplate = {
  id: string;
  expertId: string;
  title: string;
  description: string;
  shortDescription?: string;
  destination: string;
  duration: number;
  price: string;
  currency?: string;
  category?: string;
  coverImage?: string;
  images?: string[];
  highlights?: string[];
  tags?: string[];
  isPublished: boolean;
  isFeatured: boolean;
  salesCount?: number;
  viewCount?: number;
  averageRating?: string;
  reviewCount?: number;
};

const categoryIcons: Record<string, React.ElementType> = {
  "photography-videography": Camera,
  "transportation-logistics": Car,
  "food-culinary": UtensilsCrossed,
  "childcare-family": Baby,
  "tours-experiences": Compass,
  "personal-assistance": Briefcase,
  "taskrabbit-services": Wrench,
  "health-wellness": Heart,
  "beauty-styling": Sparkles,
  "pets-animals": Dog,
  "events-celebrations": PartyPopper,
  "technology-connectivity": Laptop,
  "language-translation": Languages,
  "specialty-services": Award,
  "custom-other": HelpCircle,
};

const tripCategories = [
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
    highlights: ["Fushimi Inari Shrine", "Traditional Tea Ceremony", "Bamboo Grove Walk"],
    expertPick: true,
    imageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80",
    vibeTags: ["cultural", "peaceful", "historic"],
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
    highlights: ["Positano Beach Day", "Limoncello Tasting", "Sunset Boat Cruise"],
    expertPick: true,
    imageUrl: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=600&q=80",
    vibeTags: ["romantic", "coastal", "luxury"],
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
    highlights: ["Yoga Sessions", "Rice Terrace Walks", "Spa Treatments"],
    expertPick: false,
    imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80",
    vibeTags: ["wellness", "nature", "spiritual"],
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
    highlights: ["Zip-lining", "Volcano Hiking", "Wildlife Safari"],
    expertPick: false,
    imageUrl: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?w=600&q=80",
    vibeTags: ["adventure", "nature", "wildlife"],
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
    highlights: ["Eiffel Tower", "Disneyland Paris", "Seine River Cruise"],
    expertPick: true,
    imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80",
    vibeTags: ["family", "iconic", "cultural"],
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
    highlights: ["Sahara Camping", "Medina Tour", "Camel Trek"],
    expertPick: false,
    imageUrl: "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=600&q=80",
    vibeTags: ["adventure", "exotic", "cultural"],
  },
];

const influencerContent = [
  {
    id: 1,
    title: "My Top 10 Hidden Cafes in Bali",
    category: "Food & Drink",
    creator: "@wanderlust_sarah",
    creatorName: "Sarah Mitchell",
    followers: "125K",
    platform: "instagram",
    imageUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&q=80",
    avatarUrl: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&q=80",
    destination: "Bali, Indonesia",
    engagementRate: "4.8%",
  },
  {
    id: 2,
    title: "Ultimate Tokyo Street Food Guide",
    category: "Destinations",
    creator: "@nomadic_mike",
    creatorName: "Mike Chen",
    followers: "89K",
    platform: "youtube",
    imageUrl: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=600&q=80",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80",
    destination: "Tokyo, Japan",
    engagementRate: "6.2%",
  },
  {
    id: 3,
    title: "Budget Travel Hacks That Actually Work",
    category: "Tips",
    creator: "@thriftytraveler",
    creatorName: "Emma Rodriguez",
    followers: "250K",
    platform: "tiktok",
    imageUrl: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80",
    avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&q=80",
    destination: "Multiple",
    engagementRate: "8.5%",
  },
  {
    id: 4,
    title: "Romance in Paris: Local's Guide",
    category: "Romantic",
    creator: "@couples_abroad",
    creatorName: "Alex & Jordan",
    followers: "180K",
    platform: "instagram",
    imageUrl: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=600&q=80",
    avatarUrl: "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?w=100&q=80",
    destination: "Paris, France",
    engagementRate: "5.3%",
  },
  {
    id: 5,
    title: "Best Sunset Spots in Santorini",
    category: "Photography",
    creator: "@golden_hour_jen",
    creatorName: "Jennifer Wu",
    followers: "95K",
    platform: "instagram",
    imageUrl: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80",
    destination: "Santorini, Greece",
    engagementRate: "7.1%",
  },
  {
    id: 6,
    title: "How I Plan Corporate Retreats",
    category: "Business",
    creator: "@eventpro_lisa",
    creatorName: "Lisa Thompson",
    followers: "45K",
    platform: "linkedin",
    imageUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&q=80",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&q=80",
    destination: "Corporate",
    engagementRate: "3.9%",
  },
];

function ServiceCard({ 
  service, 
  category,
  onAddToCart,
  isAddingToCart,
  isAdded,
}: { 
  service: Service; 
  category?: ServiceCategory;
  onAddToCart?: (serviceId: string) => void;
  isAddingToCart?: boolean;
  isAdded?: boolean;
}) {
  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;
  const reviewCount = service.reviewCount || 0;
  const Icon = category ? categoryIcons[category.slug] || Compass : Compass;
  const description = service.shortDescription || service.description || "No description available";
  const location = service.location || "Remote";
  
  // Determine expert badges based on rating and review count
  const isTopExpert = rating >= 4.8 && reviewCount >= 5;
  const isVerified = reviewCount >= 3;
  const isHot = rating >= 4.7 && reviewCount >= 10;
  
  // Generate mock image based on category
  const getCategoryImage = (categorySlug: string) => {
    const imageMap: Record<string, string> = {
      "photography-videography": "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=600&q=80",
      "transportation-logistics": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80",
      "food-culinary": "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80",
      "childcare-family": "https://images.unsplash.com/photo-1476703993599-0035a21b17a9?w=600&q=80",
      "tours-experiences": "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&q=80",
      "personal-assistance": "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&q=80",
      "health-wellness": "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80",
      "beauty-styling": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&q=80",
      "pets-animals": "https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=600&q=80",
      "events-celebrations": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&q=80",
      "technology-connectivity": "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&q=80",
      "language-translation": "https://images.unsplash.com/photo-1523289333742-be1143f6b766?w=600&q=80",
    };
    return imageMap[categorySlug] || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80";
  };

  // Generate provider avatar based on service ID for consistency
  const getProviderAvatar = (serviceId: string) => {
    const avatars = [
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&q=80",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80",
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&q=80",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&q=80",
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&q=80",
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&q=80",
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&q=80",
      "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?w=150&q=80",
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80",
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&q=80",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&q=80",
    ];
    // Use a hash of the service ID to get a consistent avatar
    const hash = serviceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatars[hash % avatars.length];
  };

  // Generate provider name based on service ID
  const getProviderName = (serviceId: string) => {
    const firstNames = ["Sarah", "Michael", "Emma", "James", "Sofia", "David", "Olivia", "Daniel", "Isabella", "Alexander", "Mia", "William"];
    const lastNames = ["Mitchell", "Chen", "Rodriguez", "Thompson", "Garcia", "Wilson", "Lee", "Anderson", "Taylor", "Brown", "Kim", "Davis"];
    const hash = serviceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `${firstNames[hash % firstNames.length]} ${lastNames[(hash + 3) % lastNames.length]}`;
  };

  const providerAvatar = getProviderAvatar(service.id);
  const providerName = getProviderName(service.id);

  const getStatusColor = (rating: number) => {
    if (rating >= 4.5) return { text: "text-orange-500 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" };
    if (rating >= 4.0) return { text: "text-yellow-500 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" };
    return { text: "text-green-500 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" };
  };

  const statusColor = getStatusColor(rating);
  const heatScore = Math.round(rating * 20);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <div 
        className="bg-card dark:bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 border border-border h-full flex flex-col"
        data-testid={`card-service-${service.id}`}
      >
        {/* Image Header with Overlay */}
        <Link href={`/services/${service.id}`} data-testid={`link-service-${service.id}`}>
          <div className="relative h-48 overflow-hidden cursor-pointer">
            <img
              src={getCategoryImage(category?.slug || "")}
              alt={service.serviceName}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            
            {/* Heat Score Badge - Top Right */}
            <div 
              className="absolute top-3 right-3 w-11 h-11 rounded-xl bg-white/95 dark:bg-white/90 shadow-lg flex items-center justify-center"
              data-testid={`badge-heat-score-${service.id}`}
            >
              <span className={cn(
                "text-lg font-bold",
                heatScore >= 90 ? "text-[#FF385C]" : heatScore >= 80 ? "text-orange-500 dark:text-orange-400" : "text-amber-500 dark:text-amber-400"
              )}>
                {heatScore}
              </span>
            </div>
            
            {/* Hot/Trending Badge - Top Left */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {isHot ? (
                <span 
                  className="px-2.5 py-1 rounded-lg bg-[#FF385C] text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                  data-testid={`badge-hot-${service.id}`}
                >
                  <Zap className="w-3 h-3 fill-white" />
                  Hot
                </span>
              ) : isTopExpert ? (
                <span 
                  className="px-2.5 py-1 rounded-lg bg-amber-500 dark:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                  data-testid={`badge-top-expert-${service.id}`}
                >
                  <Trophy className="w-3 h-3" />
                  Top Expert
                </span>
              ) : null}
              {reviewCount > 0 && (
                <span 
                  className="px-2 py-1 rounded-lg bg-white/90 dark:bg-white/80 text-gray-700 text-xs font-medium flex items-center gap-1 shadow-sm"
                  data-testid={`badge-reviews-${service.id}`}
                >
                  <Users className="w-3 h-3" />
                  {reviewCount}
                </span>
              )}
            </div>

            {/* Provider Info & Service Title */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3">
              <div className="relative">
                <img
                  src={providerAvatar}
                  alt={providerName}
                  className="w-12 h-12 rounded-full border-2 border-white object-cover shadow-lg"
                  data-testid={`img-provider-avatar-${service.id}`}
                />
                {isVerified && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 
                  className="text-lg font-bold text-white line-clamp-1"
                  data-testid={`text-service-name-${service.id}`}
                >
                  {service.serviceName}
                </h3>
                <div className="flex items-center gap-2 text-white/90 text-sm">
                  <span className="font-medium" data-testid={`text-provider-name-${service.id}`}>{providerName}</span>
                  <span className="text-white/60">•</span>
                  <MapPin className="w-3 h-3" />
                  <span data-testid={`text-location-${service.id}`}>{location}</span>
                </div>
              </div>
            </div>
          </div>
        </Link>

        {/* Card Content */}
        <div className="p-4 flex-1 flex flex-col">
          {/* Description */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {description}
          </p>

          {/* Category Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {category && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                {category.name}
              </span>
            )}
            {service.deliveryTimeframe && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {service.deliveryTimeframe}
              </span>
            )}
          </div>

          {/* Price and Status */}
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">${price.toFixed(0)}</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                per service
              </span>
            </div>
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              statusColor.text,
              statusColor.bg
            )}>
              {rating >= 4.5 ? "Busy" : rating >= 4.0 ? "Moderate" : "Available"}
            </span>
          </div>

          {/* Service Tip */}
          {rating >= 4.5 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-2">
                  {isTopExpert 
                    ? "Highly rated expert with proven track record and excellent reviews."
                    : "Quality service provider with consistent positive feedback from clients."}
                </p>
              </div>
            </div>
          )}

          {/* Bottom Stats Row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border mt-auto" data-testid={`stats-footer-${service.id}`}>
            <div className="flex items-center gap-1" data-testid={`stat-rating-${service.id}`}>
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="font-medium">{rating.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-1" data-testid={`stat-reviews-${service.id}`}>
              <Users className="w-3 h-3" />
              {reviewCount}
            </div>
            {service.deliveryMethod && (
              <div className="flex items-center gap-1">
                <Compass className="w-3 h-3" />
                {service.deliveryMethod}
              </div>
            )}
          </div>

          {/* Add to Cart Button */}
          {onAddToCart && (
            <Button
              size="sm"
              className={cn(
                "w-full mt-3",
                isAdded ? "bg-green-600 hover:bg-green-700" : ""
              )}
              onClick={() => onAddToCart(service.id)}
              disabled={isAddingToCart || isAdded}
              data-testid={`button-add-to-cart-${service.id}`}
            >
              {isAdded ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Added
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {isAddingToCart ? "Adding..." : "Add to Cart"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FilterPanel({
  categories,
  selectedCategory,
  setSelectedCategory,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  minRating,
  setMinRating,
  onClear,
}: {
  categories: ServiceCategory[];
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  minPrice: number;
  setMinPrice: (v: number) => void;
  maxPrice: number;
  setMaxPrice: (v: number) => void;
  minRating: number;
  setMinRating: (v: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Category</Label>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="mt-2" data-testid="select-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium">Price Range</Label>
        <div className="flex items-center gap-2 mt-2">
          <Input
            type="number"
            placeholder="Min"
            value={minPrice || ""}
            onChange={(e) => setMinPrice(Number(e.target.value) || 0)}
            className="w-24"
            data-testid="input-min-price"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Max"
            value={maxPrice || ""}
            onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
            className="w-24"
            data-testid="input-max-price"
          />
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Minimum Rating</Label>
        <div className="flex items-center gap-3 mt-2">
          <Slider
            value={[minRating]}
            onValueChange={([v]) => setMinRating(v)}
            max={5}
            step={0.5}
            className="flex-1"
            data-testid="slider-rating"
          />
          <div className="flex items-center gap-1 min-w-[60px]">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="font-medium">{minRating.toFixed(1)}+</span>
          </div>
        </div>
      </div>

      <Button 
        variant="outline" 
        className="w-full" 
        onClick={onClear}
        data-testid="button-clear-filters"
      >
        <X className="w-4 h-4 mr-2" />
        Clear Filters
      </Button>
    </div>
  );
}

export default function DiscoverPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Parse URL params for expert handoff context
  const urlParams = new URLSearchParams(window.location.search);
  const showExperts = urlParams.get("showExperts") === "true";
  const expertHandoffDestination = urlParams.get("destination") || "";
  const expertHandoffCountry = urlParams.get("country") || "";
  const expertHandoffExperienceType = urlParams.get("experienceType") || "";
  const expertHandoffTripId = urlParams.get("tripId") || "";
  const expertHandoffStartDate = urlParams.get("startDate") || "";
  const expertHandoffEndDate = urlParams.get("endDate") || "";
  const isFromQuickStart = urlParams.get("source") === "quick-start";
  
  // Ref for experts section to scroll to
  const expertsSectionRef = useRef<HTMLDivElement>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState(expertHandoffDestination);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("rating");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 12;

  // Trip packages state
  const [tripSearchQuery, setTripSearchQuery] = useState("");
  const [selectedTripCategory, setSelectedTripCategory] = useState("all");
  const [favorites, setFavorites] = useState<number[]>([]);

  // Cart state
  const [addedServices, setAddedServices] = useState<Set<string>>(new Set());
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);
  const [creatingComparison, setCreatingComparison] = useState(false);
  
  // Expert handoff state
  const [showExpertHandoffBanner, setShowExpertHandoffBanner] = useState(isFromQuickStart && showExperts);
  
  // Tab navigation state (read from URL)
  const urlTab = urlParams.get("tab") || "travelpulse";
  const urlCity = urlParams.get("city") || "";
  const [activeTab, setActiveTab] = useState(urlTab);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Track search events for tourism analytics
  useEffect(() => {
    // Only track when there's a meaningful search (destination/location filter)
    if (locationFilter && locationFilter.length >= 2) {
      trackSearchEvent({
        destination: locationFilter,
        searchContext: 'discover',
      });
    }
  }, [locationFilter]);

  // Data queries
  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: result, isLoading: servicesLoading } = useQuery<DiscoverResult>({
    queryKey: [
      "/api/discover",
      debouncedQuery,
      selectedCategory,
      locationFilter,
      minPrice,
      maxPrice,
      minRating,
      sortBy,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (selectedCategory && selectedCategory !== "all") params.set("categoryId", selectedCategory);
      if (locationFilter) params.set("location", locationFilter);
      if (minPrice > 0) params.set("minPrice", String(minPrice));
      if (maxPrice > 0) params.set("maxPrice", String(maxPrice));
      if (minRating > 0) params.set("minRating", String(minRating));
      if (sortBy) params.set("sortBy", sortBy);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      
      const res = await fetch(`/api/discover?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: cart } = useQuery<CartData>({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  // Expert Templates Query
  const { data: expertTemplates, isLoading: templatesLoading } = useQuery<ExpertTemplate[]>({
    queryKey: ["/api/expert-templates"],
  });

  // Trending destinations from TravelPulse (replaces hardcoded trip packages)
  const { data: trendingCitiesData, isLoading: trendingLoading } = useQuery<{ cities: any[]; count: number }>({
    queryKey: ["/api/travelpulse/cities"],
  });

  // Map trending cities to trip package format for the Trip Packages tab
  const trendingTrips = useMemo(() => {
    if (!trendingCitiesData?.cities?.length) return preResearchedTrips;
    return trendingCitiesData.cities.map((city: any, idx: number) => ({
      id: idx + 1,
      title: `Discover ${city.cityName}`,
      destination: `${city.cityName}, ${city.country}`,
      duration: city.aiOptimalDuration || "5 days",
      travelers: "2-4",
      category: city.vibeTags?.[0] || "adventure",
      rating: city.pulseScore ? (city.pulseScore / 20).toFixed(1) : "4.5",
      reviews: city.activeTravelers || 0,
      price: city.avgHotelPrice ? Math.round(parseFloat(city.avgHotelPrice) * 5) : 1999,
      originalPrice: city.avgHotelPrice ? Math.round(parseFloat(city.avgHotelPrice) * 6) : 2499,
      highlights: (city.aiMustSeeAttractions || []).slice(0, 3),
      expertPick: city.trendingScore > 70,
      imageUrl: city.imageUrl || `https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80`,
      vibeTags: city.vibeTags?.slice(0, 3) || [],
      citySlug: city.cityName?.toLowerCase().replace(/\s+/g, "-"),
    }));
  }, [trendingCitiesData]);
  
  // Experts query for handoff - fetch experts filtered by destination/experience type
  const expertsApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (expertHandoffDestination) params.set("location", expertHandoffDestination);
    if (expertHandoffExperienceType) params.set("experienceType", expertHandoffExperienceType);
    const queryStr = params.toString();
    return queryStr ? `/api/experts?${queryStr}` : "/api/experts";
  }, [expertHandoffDestination, expertHandoffExperienceType]);
  
  const { data: matchedExperts = [], isLoading: expertsLoading } = useQuery<any[]>({
    queryKey: [expertsApiUrl],
    enabled: showExperts,
  });
  
  // Auto-scroll to experts section when coming from quick-start
  useEffect(() => {
    if (showExperts && expertsSectionRef.current) {
      setTimeout(() => {
        expertsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 500);
    }
  }, [showExperts]);

  const getCategoryById = (id: string) => categories?.find((c) => c.id === id);

  // AI Recommendations
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState<AIRecommendation | null>(null);

  const recommendationsMutation = useMutation({
    mutationFn: async (data: { query?: string; destination?: string }) => {
      const res = await apiRequest("POST", "/api/discover/recommendations", data);
      return res.json() as Promise<AIRecommendation>;
    },
    onSuccess: (data) => {
      setRecommendations(data);
      setShowRecommendations(true);
    },
  });

  const getAIRecommendations = () => {
    recommendationsMutation.mutate({
      query: debouncedQuery || undefined,
      destination: locationFilter || undefined,
    });
  };

  // Cart mutations
  const addToCartMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      setAddingToCartId(serviceId);
      return apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
    },
    onSuccess: (_, serviceId) => {
      setAddedServices(prev => new Set(prev).add(serviceId));
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart!", description: "Service has been added to your cart." });
      setAddingToCartId(null);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to add to cart", description: error.message });
      setAddingToCartId(null);
    },
  });

  const handleAddToCart = (serviceId: string) => {
    if (!user) {
      toast({ 
        variant: "destructive", 
        title: "Sign in required", 
        description: "Please sign in to add items to your cart" 
      });
      return;
    }
    addToCartMutation.mutate(serviceId);
  };

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
      toast({ 
        variant: "destructive", 
        title: "Failed to create comparison",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const clearFilters = () => {
    setSelectedCategory("all");
    setMinPrice(0);
    setMaxPrice(0);
    setMinRating(0);
    setLocationFilter("");
    setPage(0);
  };

  const hasActiveFilters = 
    selectedCategory !== "all" || 
    minPrice > 0 || 
    maxPrice > 0 || 
    minRating > 0 ||
    locationFilter !== "";

  const totalPages = result ? Math.ceil(result.total / limit) : 0;

  // Trip filtering (uses API-driven trending data with hardcoded fallback)
  const filteredTrips = trendingTrips.filter((trip: any) => {
    const matchesSearch =
      tripSearchQuery === "" ||
      trip.title.toLowerCase().includes(tripSearchQuery.toLowerCase()) ||
      trip.destination.toLowerCase().includes(tripSearchQuery.toLowerCase());
    const matchesCategory =
      selectedTripCategory === "all" || trip.category === selectedTripCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  return (
    <DashboardLayout>
      <SEOHead 
        title="Discover Services & Experiences"
        description="Browse expert services, curated trip packages, and get AI-powered recommendations for your next adventure. Find travel planners, venues, and unique experiences."
        keywords={["discover travel", "travel services", "trip packages", "vacation planning", "experience marketplace"]}
        url="/discover"
      />
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-16">
          <div className="container mx-auto px-4 max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm mb-6">
                <Sparkles className="w-4 h-4" />
                Discover Your Perfect Experience
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-page-title">
                Explore Services & Trip Packages
              </h1>
              <p className="text-lg text-primary-foreground/90 max-w-2xl mx-auto">
                Browse expert services, curated trip packages, and get AI-powered recommendations
                for your next adventure.
              </p>
            </motion.div>

            {/* Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-xl p-4 shadow-xl max-w-3xl mx-auto"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search services, destinations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 text-foreground"
                    data-testid="input-search"
                  />
                </div>
                <Button
                  className="h-12 px-8"
                  onClick={getAIRecommendations}
                  disabled={recommendationsMutation.isPending}
                  data-testid="button-ai-suggestions"
                >
                  {recommendationsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  AI Suggestions
                </Button>
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap justify-center gap-3 mt-6"
            >
              <Link href="/experiences">
                <Button
                  variant="outline"
                  className="bg-white/10 backdrop-blur-sm border-white/30 text-primary-foreground font-medium"
                  data-testid="button-plan-experience"
                >
                  <Compass className="w-4 h-4 mr-2" />
                  Plan Experience
                </Button>
              </Link>
              <Link href="/spontaneous">
                <Button
                  variant="outline"
                  className="bg-amber-500/20 backdrop-blur-sm border-amber-400/50 text-primary-foreground font-medium"
                  data-testid="button-live-intel"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Live Intel
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Expert Handoff Banner - shown when coming from quick-start */}
        {showExpertHandoffBanner && (
          <section className="bg-gradient-to-r from-amber-500/10 to-primary/10 border-b py-4">
            <div className="container mx-auto px-4 max-w-6xl">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      Your AI itinerary for {expertHandoffDestination}{expertHandoffCountry ? `, ${expertHandoffCountry}` : ""} is ready!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {expertHandoffStartDate && expertHandoffEndDate
                        ? `${expertHandoffStartDate} to ${expertHandoffEndDate} • `
                        : ""}
                      Connect with a local expert below to refine your trip
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExpertHandoffBanner(false)}
                  data-testid="button-dismiss-handoff-banner"
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </section>
        )}

        {/* Matched Experts Section - shown when coming from quick-start with showExperts */}
        {showExperts && (
          <section ref={expertsSectionRef} className="py-8 bg-muted/30">
            <div className="container mx-auto px-4 max-w-6xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold" data-testid="text-matched-experts-title">
                    Experts for {expertHandoffDestination}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Local experts who can help refine your itinerary and add bookable services
                  </p>
                </div>
              </div>
              
              {expertsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="flex-1">
                            <Skeleton className="h-4 w-32 mb-2" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : matchedExperts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matchedExperts.slice(0, 6).map((expert: any) => (
                    <Card key={expert.id} className="overflow-hidden hover-elevate transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            {expert.profileImageUrl ? (
                              <img
                                src={expert.profileImageUrl}
                                alt={expert.firstName || expert.username}
                                className="h-12 w-12 rounded-full object-cover"
                              />
                            ) : (
                              <Users className="h-6 w-6 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">
                              {expert.firstName} {expert.lastName || ""}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {expert.expertSpecialty || "Travel Expert"}
                            </p>
                            {expert.expertLocations && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{expert.expertLocations}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          {expert.averageRating && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              {parseFloat(expert.averageRating).toFixed(1)}
                            </Badge>
                          )}
                          {expert.isExpert && (
                            <Badge variant="outline" className="text-xs">Verified Expert</Badge>
                          )}
                        </div>
                        <Button
                          className="w-full mt-3"
                          size="sm"
                          onClick={() => {
                            const params = new URLSearchParams();
                            if (expertHandoffTripId) params.set("tripId", expertHandoffTripId);
                            params.set("source", "quick-start");
                            setLocation(`/expert/${expert.id}?${params.toString()}`);
                          }}
                          data-testid={`button-connect-expert-${expert.id}`}
                        >
                          Connect
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <h3 className="font-medium mb-1">No experts found for this location</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Try browsing all experts or adjusting your destination
                    </p>
                    <Button onClick={() => setLocation("/experts")} data-testid="button-browse-all-experts">
                      Browse All Experts
                    </Button>
                  </CardContent>
                </Card>
              )}
              
              {matchedExperts.length > 6 && (
                <div className="text-center mt-6">
                  <Link href={`/experts?destination=${encodeURIComponent(expertHandoffDestination)}`}>
                    <Button variant="outline" data-testid="button-view-all-experts">
                      View All {matchedExperts.length} Experts
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Main Content */}
        <section className="py-12">
          <div className="container mx-auto px-4 max-w-[1400px]">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="relative mb-8">
                <TabsList className="bg-card border p-1 w-full overflow-x-auto flex justify-start gap-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                  <TabsTrigger
                    value="travelpulse"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                    data-testid="tab-travelpulse"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    TravelPulse
                  </TabsTrigger>
                  <TabsTrigger
                    value="articles"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                    data-testid="tab-articles"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    <span className="hidden md:inline">Influencer </span>Curated
                  </TabsTrigger>
                  <TabsTrigger
                    value="events"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                    data-testid="tab-events"
                  >
                    <Ticket className="w-4 h-4 mr-2" />
                    <span className="hidden lg:inline">Travel </span>Events
                  </TabsTrigger>
                  <TabsTrigger
                    value="packages"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                    data-testid="tab-packages"
                  >
                    <Globe className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Trip </span>Packages
                  </TabsTrigger>
                  <TabsTrigger
                    value="services"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0"
                    data-testid="tab-services"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Browse </span>Services
                  </TabsTrigger>
                </TabsList>
                {/* Scroll hint for mobile */}
                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
              </div>

              {/* Browse Services Tab */}
              <TabsContent value="services">
                {/* Cart Summary Bar */}
                {cart && cart.items.length > 0 && (
                  <div className="mb-6 p-4 bg-card border rounded-lg flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <ShoppingCart className="w-5 h-5 text-primary" />
                      <span className="font-medium">
                        {cart.itemCount} items in cart
                      </span>
                      <span className="text-muted-foreground">
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

                {/* AI Recommendations Panel */}
                {showRecommendations && recommendations && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-purple-600" />
                        <span className="font-medium text-purple-900 dark:text-purple-100">AI Recommendations</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowRecommendations(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-purple-700 dark:text-purple-200 mb-3">
                      {recommendations.suggestions}
                    </p>
                    {recommendations.recommendedCategories.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recommendations.recommendedCategories.map((cat) => (
                          <Badge
                            key={cat.slug}
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => {
                              const found = categories?.find(c => c.slug === cat.slug);
                              if (found) setSelectedCategory(found.id);
                            }}
                          >
                            {cat.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Desktop Filters Sidebar */}
                  <aside className="hidden lg:block lg:w-72 flex-shrink-0">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Filter className="w-4 h-4" />
                          Filters
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {categories && (
                          <FilterPanel
                            categories={categories}
                            selectedCategory={selectedCategory}
                            setSelectedCategory={setSelectedCategory}
                            minPrice={minPrice}
                            setMinPrice={setMinPrice}
                            maxPrice={maxPrice}
                            setMaxPrice={setMaxPrice}
                            minRating={minRating}
                            setMinRating={setMinRating}
                            onClear={clearFilters}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </aside>

                  <main className="flex-1">
                    {/* Search and Sort Row */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                      <div className="relative sm:w-48">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Location"
                          value={locationFilter}
                          onChange={(e) => setLocationFilter(e.target.value)}
                          className="pl-10"
                          data-testid="input-location"
                        />
                      </div>
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="sm:w-44" data-testid="select-sort">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rating">Top Rated</SelectItem>
                          <SelectItem value="reviews">Most Reviews</SelectItem>
                          <SelectItem value="price_low">Price: Low to High</SelectItem>
                          <SelectItem value="price_high">Price: High to Low</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Mobile Filter Button */}
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="outline" className="lg:hidden" data-testid="button-mobile-filters">
                            <SlidersHorizontal className="w-4 h-4 mr-2" />
                            Filters
                            {hasActiveFilters && (
                              <Badge variant="secondary" className="ml-2">
                                Active
                              </Badge>
                            )}
                          </Button>
                        </SheetTrigger>
                        <SheetContent side="left">
                          <SheetHeader>
                            <SheetTitle>Filters</SheetTitle>
                            <SheetDescription>
                              Refine your search results
                            </SheetDescription>
                          </SheetHeader>
                          <div className="mt-6">
                            {categories && (
                              <FilterPanel
                                categories={categories}
                                selectedCategory={selectedCategory}
                                setSelectedCategory={setSelectedCategory}
                                minPrice={minPrice}
                                setMinPrice={setMinPrice}
                                maxPrice={maxPrice}
                                setMaxPrice={setMaxPrice}
                                minRating={minRating}
                                setMinRating={setMinRating}
                                onClear={clearFilters}
                              />
                            )}
                          </div>
                        </SheetContent>
                      </Sheet>
                    </div>

                    {/* Active Filters */}
                    {hasActiveFilters && (
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <span className="text-sm text-muted-foreground">Active filters:</span>
                        {selectedCategory !== "all" && (
                          <Badge variant="secondary" className="gap-1">
                            {getCategoryById(selectedCategory)?.name}
                            <button
                              onClick={() => setSelectedCategory("all")}
                              data-testid="button-remove-category-filter"
                              className="ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {minPrice > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            Min: ${minPrice}
                            <button onClick={() => setMinPrice(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {maxPrice > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            Max: ${maxPrice}
                            <button onClick={() => setMaxPrice(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {minRating > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            {minRating}+ stars
                            <button onClick={() => setMinRating(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {locationFilter && (
                          <Badge variant="secondary" className="gap-1">
                            {locationFilter}
                            <button onClick={() => setLocationFilter("")} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" onClick={clearFilters}>
                          Clear all
                        </Button>
                      </div>
                    )}

                    {/* Services Grid */}
                    {servicesLoading ? (
                      <CardGridSkeleton count={8} />
                    ) : result?.services && result.services.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {result.services.map((service) => (
                            <ServiceCard
                              key={service.id}
                              service={service}
                              category={getCategoryById(service.categoryId)}
                              onAddToCart={handleAddToCart}
                              isAddingToCart={addingToCartId === service.id}
                              isAdded={addedServices.has(service.id)}
                            />
                          ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-8">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page === 0}
                              onClick={() => setPage(p => p - 1)}
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Page {page + 1} of {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page >= totalPages - 1}
                              onClick={() => setPage(p => p + 1)}
                              data-testid="button-next-page"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-16">
                        <Building2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No services found</h3>
                        <p className="text-muted-foreground mb-4">
                          Try adjusting your search or filters
                        </p>
                        <Button variant="outline" onClick={clearFilters}>
                          Clear Filters
                        </Button>
                      </div>
                    )}
                  </main>
                </div>
              </TabsContent>

              {/* Trip Packages Tab */}
              <TabsContent value="packages">
                {/* Expert Itinerary Templates Section */}
                {(expertTemplates && expertTemplates.length > 0) && (
                  <div className="mb-10">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                          <Award className="w-5 h-5 text-primary" />
                          Expert Itinerary Templates
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Purchase ready-made travel plans crafted by verified local experts
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {expertTemplates.length} Available
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {expertTemplates.slice(0, 6).map((template, idx) => (
                        <motion.div
                          key={template.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                        >
                          <Card
                            className="hover-elevate overflow-hidden group h-full"
                            data-testid={`card-template-${template.id}`}
                          >
                            <CardContent className="p-0 flex flex-col h-full">
                              <div className="relative h-40 bg-gradient-to-br from-primary/10 to-primary/5">
                                {template.coverImage ? (
                                  <img 
                                    src={template.coverImage} 
                                    alt={template.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-primary/30">
                                    <BookOpen className="w-16 h-16" />
                                  </div>
                                )}
                                
                                {template.isFeatured && (
                                  <div className="absolute top-3 left-3">
                                    <Badge>
                                      <Star className="w-3 h-3 mr-1 fill-current" />
                                      Featured
                                    </Badge>
                                  </div>
                                )}

                                <div className="absolute bottom-3 right-3 bg-background px-3 py-1.5 rounded-lg shadow-sm">
                                  <span className="font-bold text-lg">
                                    ${template.price}
                                  </span>
                                </div>
                              </div>

                              <div className="p-4 flex-1 flex flex-col">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                  <MapPin className="w-4 h-4" />
                                  <span>{template.destination}</span>
                                </div>

                                <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                                  {template.title}
                                </h3>

                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
                                  {template.shortDescription || template.description}
                                </p>

                                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    {template.duration} days
                                  </span>
                                  {template.averageRating && parseFloat(template.averageRating) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                      {parseFloat(template.averageRating).toFixed(1)} ({template.reviewCount || 0})
                                    </span>
                                  )}
                                  {template.salesCount && template.salesCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      {template.salesCount} sold
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-1 mb-4">
                                  {template.highlights?.slice(0, 2).map((h) => (
                                    <Badge key={h} variant="secondary" className="text-xs">
                                      {h}
                                    </Badge>
                                  ))}
                                  {template.highlights && template.highlights.length > 2 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{template.highlights.length - 2} more
                                    </Badge>
                                  )}
                                </div>

                                <Link href={`/expert-templates/${template.id}`}>
                                  <Button className="w-full" data-testid={`button-view-template-${template.id}`}>
                                    View & Purchase
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                  </Button>
                                </Link>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>

                    {expertTemplates.length > 6 && (
                      <div className="text-center mt-6">
                        <Button variant="outline" data-testid="button-view-all-templates">
                          View All {expertTemplates.length} Templates
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    )}

                    <div className="border-t my-8" />
                  </div>
                )}

                {templatesLoading && (
                  <div className="mb-10">
                    <Skeleton className="h-6 w-48 mb-6" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-72 rounded-lg" />
                      ))}
                    </div>
                    <div className="border-t my-8" />
                  </div>
                )}

                <h2 className="text-xl font-semibold mb-4">Trending Destinations</h2>
                
                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                  {tripCategories.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedTripCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedTripCategory(cat.id)}
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
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2, delay: idx * 0.05 }}
                    >
                      <Card
                        className="hover-elevate overflow-hidden group h-full"
                        data-testid={`card-trip-${trip.id}`}
                      >
                        <CardContent className="p-0 flex flex-col h-full">
                          <div className="relative h-48 overflow-hidden">
                            {trip.imageUrl ? (
                              <img
                                src={trip.imageUrl}
                                alt={trip.title}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                                <MapPin className="h-12 w-12 text-primary/30" />
                              </div>
                            )}
                            
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                            
                            <button
                              onClick={() => toggleFavorite(trip.id)}
                              className="absolute top-3 right-3 p-2 bg-white/90 rounded-full shadow-sm hover:bg-white transition-colors"
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

                            {trip.expertPick && (
                              <div className="absolute top-3 left-3">
                                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 font-semibold">
                                  <Trophy className="w-3 h-3 mr-1" />
                                  Expert Pick
                                </Badge>
                              </div>
                            )}

                            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                              <div className="flex flex-wrap gap-1">
                                {trip.vibeTags?.slice(0, 2).map((tag: string) => (
                                  <Badge 
                                    key={tag} 
                                    variant="secondary" 
                                    className="text-xs bg-white/90 text-gray-700 border-0"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                              <div className="bg-white px-3 py-1.5 rounded-lg shadow-md">
                                <span className="text-xs text-gray-400 line-through block">
                                  ${trip.originalPrice}
                                </span>
                                <span className="font-bold text-lg text-[#FF385C]">
                                  ${trip.price}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                              <MapPin className="w-4 h-4 text-[#FF385C]" />
                              <span className="font-medium">{trip.destination}</span>
                            </div>

                            <h3 className="font-semibold text-lg mb-3 group-hover:text-[#FF385C] transition-colors line-clamp-2">
                              {trip.title}
                            </h3>

                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {trip.duration}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {trip.travelers}
                              </span>
                              <span className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                {trip.rating} ({trip.reviews})
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-1 mb-4 flex-1">
                              {trip.highlights.slice(0, 2).map((h: string) => (
                                <Badge key={h} variant="outline" className="text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                                  {h}
                                </Badge>
                              ))}
                              {trip.highlights.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{trip.highlights.length - 2} more
                                </Badge>
                              )}
                            </div>

                            <Link href={(trip as any).citySlug ? `/discover?tab=travelpulse&city=${encodeURIComponent(trip.destination)}` : `/discover?tab=services&location=${encodeURIComponent(trip.destination)}`}>
                              <Button className="w-full bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-view-trip-${trip.id}`}>
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

                {filteredTrips.length === 0 && (
                  <div className="text-center py-16">
                    <Search className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No trips found</h3>
                    <p className="text-muted-foreground mb-4">
                      Try adjusting your search or filters
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTripSearchQuery("");
                        setSelectedTripCategory("all");
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Influencer Curated Content Tab */}
              <TabsContent value="articles">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Creator Spotlight
                    </Badge>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Curated by Travel Creators</h2>
                  <p className="text-muted-foreground">Discover authentic recommendations from verified travel influencers and local experts.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {influencerContent.map((content, idx) => (
                    <motion.div
                      key={content.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2, delay: idx * 0.05 }}
                    >
                      <Card
                        className="hover-elevate overflow-hidden cursor-pointer group h-full"
                        data-testid={`card-influencer-${content.id}`}
                      >
                        <CardContent className="p-0 flex flex-col h-full">
                          <div className="relative h-44 overflow-hidden">
                            {content.imageUrl ? (
                              <img
                                src={content.imageUrl}
                                alt={content.title}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center">
                                <Camera className="h-12 w-12 text-purple-500/30" />
                              </div>
                            )}
                            
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                            
                            <div className="absolute top-3 right-3">
                              <Badge 
                                className={cn(
                                  "text-xs border-0 font-medium",
                                  content.platform === "instagram" && "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
                                  content.platform === "youtube" && "bg-red-500 text-white",
                                  content.platform === "tiktok" && "bg-black text-white",
                                  content.platform === "linkedin" && "bg-blue-600 text-white"
                                )}
                              >
                                {content.platform === "instagram" && "Instagram"}
                                {content.platform === "youtube" && "YouTube"}
                                {content.platform === "tiktok" && "TikTok"}
                                {content.platform === "linkedin" && "LinkedIn"}
                              </Badge>
                            </div>

                            <div className="absolute bottom-3 left-3 right-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={content.avatarUrl}
                                  alt={content.creatorName}
                                  className="w-10 h-10 rounded-full border-2 border-white object-cover"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-semibold text-sm truncate">{content.creatorName}</p>
                                  <p className="text-white/70 text-xs">{content.creator}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                {content.category}
                              </Badge>
                              <Badge className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Verified
                              </Badge>
                            </div>
                            
                            <h3 className="font-semibold text-base mb-2 group-hover:text-[#FF385C] transition-colors line-clamp-2 flex-1">
                              {content.title}
                            </h3>
                            
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                              <MapPin className="w-4 h-4 text-[#FF385C]" />
                              <span>{content.destination}</span>
                            </div>
                            
                            <div className="flex items-center justify-between text-sm pt-3 border-t">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Users className="w-4 h-4" />
                                {content.followers}
                              </span>
                              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                <TrendingUp className="w-4 h-4" />
                                {content.engagementRate}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <div className="text-center mt-8">
                  <Button variant="outline" className="px-8" data-testid="button-view-all-creators">
                    View All Creators
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </TabsContent>

              {/* Events Tab - Global Calendar */}
              <TabsContent value="events">
                <GlobalCalendar 
                  onCityClick={(cityName) => {
                    setLocation(`/discover?tab=travelpulse&city=${encodeURIComponent(cityName)}`);
                  }}
                />
              </TabsContent>

              {/* TravelPulse Tab */}
              <TabsContent value="travelpulse">
                <CityGrid selectedCityName={urlCity} />
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Still Undecided CTA */}
        <section className="py-16 bg-card border-t">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-4">
              Need Help Deciding?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Talk to one of our travel experts. They'll help you find the perfect
              trip based on your preferences, budget, and travel style.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/experts">
                <Button size="lg" className="px-8" data-testid="button-talk-to-expert">
                  Talk to an Expert
                </Button>
              </Link>
              <Link href="/experiences">
                <Button size="lg" variant="outline" className="px-8" data-testid="button-plan-experience-cta">
                  Plan Your Experience
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
      <TripQueueIndicator />
    </DashboardLayout>
  );
}
