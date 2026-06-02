import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Edit,
  Trash2,
  DollarSign,
  Clock,
  Users,
  Camera,
  Car,
  ChefHat,
  Map,
  Heart,
  Sparkles,
  CalendarHeart,
  UserCheck,
  Languages,
  Baby,
  BedDouble,
  Music,
  Mic2,
  Flower2,
  Palette,
  Package,
  BookOpen,
  Scissors,
  Shield,
  Zap,
  Briefcase,
  UtensilsCrossed,
  Wrench,
  MapPin,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: string;
  serviceName: string;
  name?: string;
  description?: string;
  serviceType?: string;
  categoryId?: string;
  price?: string | number;
  basePrice?: string | number;
  priceType?: string;
  deliveryTimeframe?: string;
  maxConcurrentBookings?: number;
  status: string;
  active?: boolean;
  isFeatured?: boolean;
  location?: string;
  meetingPoint?: string;
  pickupAvailable?: boolean;
  averageRating?: string;
  reviewCount?: number;
}

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
}

const inspirationCards = [
  { label: "Photography & Video", slug: "Photography & Videography", icon: Camera, color: "bg-rose-50 text-rose-500" },
  { label: "Transportation", slug: "Transportation & Logistics", icon: Car, color: "bg-blue-50 text-blue-500" },
  { label: "Food & Culinary", slug: "Food & Culinary", icon: ChefHat, color: "bg-orange-50 text-orange-500" },
  { label: "Tours & Experiences", slug: "Tours & Experiences", icon: Map, color: "bg-green-50 text-green-500" },
  { label: "Health & Wellness", slug: "Health & Wellness", icon: Heart, color: "bg-pink-50 text-pink-500" },
  { label: "Beauty & Styling", slug: "Beauty & Styling", icon: Sparkles, color: "bg-purple-50 text-purple-500" },
  { label: "Events & Celebrations", slug: "Events & Celebrations", icon: CalendarHeart, color: "bg-amber-50 text-amber-500" },
  { label: "Personal Assistance", slug: "Personal Assistance", icon: UserCheck, color: "bg-teal-50 text-teal-500" },
  { label: "Language & Translation", slug: "Language & Translation", icon: Languages, color: "bg-indigo-50 text-indigo-500" },
  { label: "Childcare & Family", slug: "Childcare & Family", icon: Baby, color: "bg-sky-50 text-sky-500" },
  { label: "Lodging", slug: "Lodging & Accommodation", icon: BedDouble, color: "bg-cyan-50 text-cyan-600" },
  { label: "Music & Performance", slug: "Music & Performance", icon: Music, color: "bg-violet-50 text-violet-500" },
  { label: "Entertainment", slug: "Entertainment", icon: Mic2, color: "bg-fuchsia-50 text-fuchsia-500" },
  { label: "Floral & Decor", slug: "Floral & Decoration", icon: Flower2, color: "bg-pink-50 text-pink-400" },
  { label: "Arts & Crafts", slug: "Arts & Crafts Instruction", icon: Palette, color: "bg-lime-50 text-lime-600" },
  { label: "Rentals", slug: "Rental Services", icon: Package, color: "bg-stone-50 text-stone-500" },
  { label: "Cultural & Educational", slug: "Cultural & Educational", icon: BookOpen, color: "bg-emerald-50 text-emerald-600" },
  { label: "Attire & Fashion", slug: "Attire & Fashion", icon: Scissors, color: "bg-rose-50 text-rose-400" },
  { label: "Safety & Security", slug: "Safety & Security", icon: Shield, color: "bg-slate-50 text-slate-500" },
  { label: "Business & Professional", slug: "Business & Professional", icon: Briefcase, color: "bg-gray-50 text-gray-600" },
  { label: "Technical Services", slug: "Technical Services", icon: Zap, color: "bg-yellow-50 text-yellow-600" },
  { label: "Restaurants & Dining", slug: "Restaurants & Dining", icon: UtensilsCrossed, color: "bg-red-50 text-red-500" },
  { label: "Repairs & Tasks", slug: "Taskrabbit Services", icon: Wrench, color: "bg-orange-50 text-orange-400" },
  { label: "Companionship", slug: "Companionship & Assistance", icon: Users, color: "bg-blue-50 text-blue-400" },
];

export default function ProviderServices() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: dbCategories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service updated" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/provider/services/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service deleted" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", description: error.message });
    },
  });

  const totalServices = services?.length ?? 0;

  // Build category name lookup from DB
  const categoryNameById = dbCategories.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  // Derive unique filter labels from live services
  const usedCategoryIds = [...new Set((services || []).map(s => s.categoryId).filter(Boolean))] as string[];
  const filterLabels = ["All", ...usedCategoryIds.map(id => categoryNameById[id] || id)];

  const filteredServices = !services
    ? []
    : selectedCategory === "All"
      ? services
      : services.filter(s => {
          const name = s.categoryId ? categoryNameById[s.categoryId] : undefined;
          return name === selectedCategory;
        });

  const activeCount = (services || []).filter(s => s.status === "active").length;
  const isFirstTimeEmpty = !isLoading && totalServices === 0;
  const isFilterEmpty = !isLoading && totalServices > 0 && filteredServices.length === 0;

  return (
    <ProviderLayout title="Services">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900" data-testid="text-services-title">
              Your Services
            </h2>
            {isLoading ? (
              <Skeleton className="h-4 w-40 mt-1" />
            ) : (
              <p className="text-gray-500 text-sm">{activeCount} of {totalServices} services active</p>
            )}
          </div>
          <Link href="/provider/services/new">
            <Button className="bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-add-service">
              <Plus className="w-4 h-4 mr-2" /> Add New Service
            </Button>
          </Link>
        </div>

        {/* Category Filter — only show when there are services */}
        {totalServices > 0 && filterLabels.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {filterLabels.map((label) => (
              <Button
                key={label}
                variant={selectedCategory === label ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(label)}
                data-testid={`button-category-filter-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : isFirstTimeEmpty ? (
          /* First-time empty state: show all categories */
          <div className="space-y-6">
            <div className="text-center py-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">What will you offer?</h3>
              <p className="text-gray-500 text-sm">
                Pick a category below to get started, or build your own service from scratch.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {inspirationCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.slug}
                    onClick={() => navigate(`/provider/services/new?category=${encodeURIComponent(card.slug)}`)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 bg-white hover:border-[#FF385C] hover:shadow-sm transition-all text-center group"
                    data-testid={`card-inspiration-${card.slug.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.color} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-gray-700 leading-tight">{card.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-center">
              <Link href="/provider/services/new">
                <Button variant="outline" data-testid="button-add-first-service">
                  <Plus className="w-4 h-4 mr-2" /> Start from scratch
                </Button>
              </Link>
            </div>
          </div>
        ) : isFilterEmpty ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500 font-medium">No services in this category.</p>
              <p className="text-gray-400 text-sm mt-1">Try a different filter or add a new service.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setSelectedCategory("All")}
                data-testid="button-clear-filter"
              >
                Clear filter
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Service cards */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredServices.map((service) => {
              const displayName = service.serviceName || service.name || "Untitled Service";
              const price = service.price ?? service.basePrice ?? "—";
              const categoryName = service.categoryId ? (categoryNameById[service.categoryId] || service.serviceType || "") : (service.serviceType || "");
              const isActive = service.status === "active";

              return (
                <Card
                  key={service.id}
                  className={!isActive ? "opacity-60" : ""}
                  data-testid={`card-service-${service.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
                          {service.isFeatured && (
                            <Badge className="bg-[#FF385C] text-white text-[10px]" data-testid={`badge-featured-${service.id}`}>
                              Featured
                            </Badge>
                          )}
                          {categoryName && (
                            <Badge variant="outline" className="text-[10px]">{categoryName}</Badge>
                          )}
                        </div>

                        {service.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{service.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                          <span className="flex items-center gap-1 font-semibold text-green-600" data-testid={`text-price-${service.id}`}>
                            <DollarSign className="w-4 h-4" /> {price}
                          </span>
                          {service.deliveryTimeframe && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <Clock className="w-4 h-4" /> {service.deliveryTimeframe}
                            </span>
                          )}
                          {service.maxConcurrentBookings && service.maxConcurrentBookings > 1 && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <Users className="w-4 h-4" /> Up to {service.maxConcurrentBookings}
                            </span>
                          )}
                          {service.meetingPoint && (
                            <span className="flex items-center gap-1 text-gray-400 truncate max-w-[160px]">
                              <MapPin className="w-4 h-4 flex-shrink-0" /> {service.meetingPoint}
                            </span>
                          )}
                          {service.pickupAvailable && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Truck className="w-4 h-4" /> Pickup available
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: service.id, status: checked ? "active" : "paused" })
                          }
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-active-${service.id}`}
                        />
                        <span className="text-xs text-gray-400">
                          {isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                      <Link href={`/provider/services/${service.id}/edit`}>
                        <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                          <Edit className="w-4 h-4 mr-1" /> Edit
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => deleteMutation.mutate(service.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${service.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ProviderLayout>
  );
}
