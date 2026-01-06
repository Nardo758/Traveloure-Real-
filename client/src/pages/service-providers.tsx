import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Search,
  MapPin,
  Star,
  Clock,
  DollarSign,
  Filter,
  ChevronRight,
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
  name: string;
  description: string;
  categoryId: string;
  basePrice: string;
  duration: number;
  location: string;
  rating: string;
  totalReviews: number;
  status: string;
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

function ServiceCard({ service }: { service: Service }) {
  const rating = parseFloat(service.rating) || 0;
  const price = parseFloat(service.basePrice) || 0;

  return (
    <Link href={`/services/${service.id}`} data-testid={`link-service-${service.id}`}>
      <Card className="hover-elevate cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <Avatar className="w-16 h-16 rounded-md">
              <AvatarImage src="" />
              <AvatarFallback className="rounded-md bg-muted">
                {service.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 
                className="font-semibold text-foreground truncate"
                data-testid={`text-service-name-${service.id}`}
              >
                {service.name}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {service.description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span>{service.location || "Remote"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{service.duration} min</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="font-medium">{rating.toFixed(1)}</span>
              <span className="text-muted-foreground text-sm">
                ({service.totalReviews || 0})
              </span>
            </div>
            <div className="flex items-center gap-1 font-semibold">
              <DollarSign className="w-4 h-4" />
              <span>${price}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CategoryCard({ 
  category, 
  isSelected, 
  onClick 
}: { 
  category: ServiceCategory; 
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = categoryIcons[category.slug] || HelpCircle;
  
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-md transition-colors text-left w-full ${
        isSelected 
          ? "bg-primary/10 border border-primary" 
          : "hover-elevate border border-transparent"
      }`}
      data-testid={`button-category-${category.slug}`}
    >
      <div className={`w-10 h-10 rounded-md flex items-center justify-center ${
        isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${isSelected ? "text-primary" : ""}`}>
          {category.name}
        </p>
        {category.priceRange && category.priceRange.min > 0 && (
          <p className="text-xs text-muted-foreground">
            ${category.priceRange.min} - ${category.priceRange.max}
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

export default function ServiceProviders() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sortBy, setSortBy] = useState("rating");

  const { data: categories, isLoading: categoriesLoading } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/services", selectedCategory, locationFilter],
  });

  const filteredServices = services?.filter((service) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !service.name.toLowerCase().includes(query) &&
        !service.description?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    if (selectedCategory && service.categoryId !== selectedCategory) {
      return false;
    }
    if (locationFilter) {
      const loc = locationFilter.toLowerCase();
      if (!service.location?.toLowerCase().includes(loc)) {
        return false;
      }
    }
    return true;
  });

  const sortedServices = [...(filteredServices || [])].sort((a, b) => {
    switch (sortBy) {
      case "rating":
        return parseFloat(b.rating) - parseFloat(a.rating);
      case "price_low":
        return parseFloat(a.basePrice) - parseFloat(b.basePrice);
      case "price_high":
        return parseFloat(b.basePrice) - parseFloat(a.basePrice);
      case "reviews":
        return (b.totalReviews || 0) - (a.totalReviews || 0);
      default:
        return 0;
    }
  });

  const selectedCategoryData = categories?.find((c) => c.id === selectedCategory);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 
            className="text-3xl font-bold text-foreground"
            data-testid="text-page-title"
          >
            Browse Service Providers
          </h1>
          <p className="text-muted-foreground mt-2">
            Find trusted local professionals for your travel needs
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-72 flex-shrink-0">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Categories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`flex items-center gap-3 p-3 rounded-md transition-colors text-left w-full ${
                    !selectedCategory 
                      ? "bg-primary/10 border border-primary" 
                      : "hover-elevate border border-transparent"
                  }`}
                  data-testid="button-category-all"
                >
                  <div className={`w-10 h-10 rounded-md flex items-center justify-center ${
                    !selectedCategory ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <Compass className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${!selectedCategory ? "text-primary" : ""}`}>
                      All Categories
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {services?.length || 0} services
                    </p>
                  </div>
                </button>

                {categoriesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  categories?.map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      isSelected={selectedCategory === category.id}
                      onClick={() => setSelectedCategory(
                        selectedCategory === category.id ? null : category.id
                      )}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </aside>

          <main className="flex-1">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
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
            </div>

            {selectedCategoryData && (
              <div className="mb-6 p-4 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {selectedCategoryData.name}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                    data-testid="button-clear-category"
                  >
                    Clear filter
                  </Button>
                </div>
                {selectedCategoryData.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedCategoryData.description}
                  </p>
                )}
              </div>
            )}

            {servicesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <Skeleton className="w-16 h-16 rounded-md" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : sortedServices && sortedServices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedServices.map((service) => (
                  <ServiceCard key={service.id} service={service} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Compass className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">No services found</h3>
                  <p className="text-muted-foreground mb-4">
                    {selectedCategory 
                      ? "No services available in this category yet."
                      : "Be the first to offer a service in this marketplace."}
                  </p>
                  <Link href="/services-provider">
                    <Button data-testid="button-become-provider">
                      Become a Provider
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {sortedServices && sortedServices.length > 0 && (
              <div className="mt-6 text-center text-sm text-muted-foreground">
                Showing {sortedServices.length} service{sortedServices.length !== 1 ? "s" : ""}
                {selectedCategory && selectedCategoryData && (
                  <span> in {selectedCategoryData.name}</span>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </Layout>
  );
}
