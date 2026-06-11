import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import {
  Search,
  MapPin,
  Star,
  Clock,
  DollarSign,
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
  ShoppingCart,
  StickyNote,
} from "lucide-react";

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
  revisionsIncluded?: number;
  includesExpertNotes?: boolean;
};

type DiscoverResult = {
  services: Service[];
  total: number;
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

interface ServiceBrowserProps {
  defaultLocation?: string;
  categoryFilter?: string;
  categorySlug?: string;
  onAddToCart?: (service: Service) => void;
  title?: string;
}

function ServiceCard({ 
  service, 
  category,
  onAddToCart,
}: { 
  service: Service; 
  category?: ServiceCategory;
  onAddToCart?: (service: Service) => void;
}) {
  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;
  const reviewCount = service.reviewCount || 0;
  const Icon = category ? categoryIcons[category.slug] || Compass : Compass;
  const description = service.shortDescription || service.description || "No description available";
  const location = service.location || "Remote";

  return (
    <Card className="hover-elevate h-full" data-testid={`card-service-${service.id}`}>
      <CardContent className="p-4">
        <Link href={`/services/${service.id}`} data-testid={`link-service-${service.id}`}>
          <div className="flex gap-4 cursor-pointer">
            <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Icon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 
                className="font-semibold text-foreground truncate"
                data-testid={`text-service-name-${service.id}`}
              >
                {service.serviceName}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span data-testid={`text-location-${service.id}`}>{location}</span>
                </div>
                {service.deliveryTimeframe && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{service.deliveryTimeframe}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Link>
        <div className="flex items-center justify-between mt-4 pt-3 border-t gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {category && (
              <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${service.id}`}>
                {category.name}
              </Badge>
            )}
            {service.includesExpertNotes && (
              <Badge
                className="text-xs bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100"
                variant="outline"
                data-testid={`badge-expert-notes-${service.id}`}
              >
                <StickyNote className="w-3 h-3 mr-1" />
                Expert Notes
              </Badge>
            )}
            {(service.revisionsIncluded ?? 0) > 0 && (
              <Badge
                className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100"
                variant="outline"
                data-testid={`badge-revisions-${service.id}`}
              >
                {service.revisionsIncluded} revision{service.revisionsIncluded === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="font-medium" data-testid={`text-rating-${service.id}`}>
                {rating.toFixed(1)}
              </span>
              <span className="text-muted-foreground text-sm">
                ({reviewCount})
              </span>
            </div>
            <div className="flex items-center gap-1 font-semibold">
              <DollarSign className="w-4 h-4" />
              <span data-testid={`text-price-${service.id}`}>${price.toFixed(0)}</span>
            </div>
          </div>
        </div>
        {onAddToCart && (
          <Button
            size="sm"
            className="w-full mt-3 bg-[#FF385C] hover:bg-[#E23350]"
            onClick={() => onAddToCart(service)}
            data-testid={`button-add-to-cart-${service.id}`}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Add to Cart
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ServiceBrowser({
  defaultLocation = "",
  categoryFilter = "",
  categorySlug = "",
  onAddToCart,
  title,
}: ServiceBrowserProps) {
  const [selectedCategory, setSelectedCategory] = useState(categoryFilter || "all");
  const [distanceFilter, setDistanceFilter] = useState("any");
  const [sortBy, setSortBy] = useState("rating");
  const [page, setPage] = useState(0);
  const limit = 12;

  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const lockedCategoryId = categorySlug && categories
    ? categories.find(c => c.slug === categorySlug)?.id || ""
    : "";

  const effectiveCategoryId = lockedCategoryId || (selectedCategory !== "all" ? selectedCategory : "");

  useEffect(() => {
    if (categoryFilter) {
      setSelectedCategory(categoryFilter);
    }
  }, [categoryFilter]);

  const { data: result, isLoading } = useQuery<DiscoverResult>({
    queryKey: [
      "/api/discover",
      effectiveCategoryId,
      defaultLocation,
      distanceFilter,
      sortBy,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveCategoryId) params.set("categoryId", effectiveCategoryId);
      if (defaultLocation) params.set("location", defaultLocation);
      if (distanceFilter !== "any") params.set("maxDistance", distanceFilter);
      if (sortBy) params.set("sortBy", sortBy);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`/api/discover?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !categorySlug || !!lockedCategoryId,
  });

  const getCategoryById = (id: string) => categories?.find((c) => c.id === id);

  const totalPages = result ? Math.ceil(result.total / limit) : 0;

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-lg font-semibold">{title}</h3>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setPage(0); }}>
          <SelectTrigger className="flex-1 sm:flex-none sm:w-44" data-testid="select-service-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={distanceFilter} onValueChange={(v) => { setDistanceFilter(v); setPage(0); }}>
          <SelectTrigger className="flex-1 sm:flex-none sm:w-52" data-testid="select-service-distance">
            <SelectValue placeholder="Distance from hotel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any distance</SelectItem>
            <SelectItem value="1">Within 1 km</SelectItem>
            <SelectItem value="2">Within 2 km</SelectItem>
            <SelectItem value="5">Within 5 km</SelectItem>
            <SelectItem value="10">Within 10 km</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(0); }}>
          <SelectTrigger className="flex-1 sm:flex-none sm:w-40" data-testid="select-service-sort">
            <SelectValue placeholder="Most Popular" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rating">Most Popular</SelectItem>
            <SelectItem value="reviews">Most Reviews</SelectItem>
            <SelectItem value="price_low">Price: Low to High</SelectItem>
            <SelectItem value="price_high">Price: High to Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <Skeleton className="w-16 h-16 rounded-md" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : result?.services && result.services.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Showing {result.services.length} of {result.total} services
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {result.services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                category={getCategoryById(service.categoryId)}
                onAddToCart={onAddToCart}
              />
            ))}
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card className="border-2 border-dashed">
          <CardContent className="p-8 text-center">
            <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-semibold text-lg mb-2">No services found</h3>
            <p className="text-muted-foreground">
              Try adjusting your filters to find more services.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
