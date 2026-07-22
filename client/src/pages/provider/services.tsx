import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Edit,
  Copy,
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
  PartyPopper,
  Award,
  Compass,
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
  contentAffinityTags?: string[];
}

const AFFINITY_TAG_LABELS: Record<string, string> = {
  hotel_arrival:       "Hotel arrival/departure",
  photo_shoot:         "Photo shoot",
  restaurant_visit:    "Restaurant visit",
  cultural_attraction: "Cultural attraction",
  wellness_experience: "Wellness experience",
  nightlife:           "Nightlife",
  hiking_outdoor:      "Hiking/outdoor",
  wedding_proposal:    "Wedding/proposal",
  general_logistics:   "General logistics",
};

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
  { label: "Business & Professional", slug: "Business & Professional", icon: Briefcase, color: "bg-console-bg text-console-dark" },
  { label: "Technical Services", slug: "Technical Services", icon: Zap, color: "bg-yellow-50 text-yellow-600" },
  { label: "Restaurants & Dining", slug: "Restaurants & Dining", icon: UtensilsCrossed, color: "bg-red-50 text-red-500" },
  { label: "Repairs & Tasks", slug: "Taskrabbit Services", icon: Wrench, color: "bg-orange-50 text-orange-400" },
  { label: "Companionship", slug: "Companionship & Assistance", icon: Users, color: "bg-blue-50 text-blue-400" },
  { label: "Stationery & Print", slug: "Stationery & Paper Goods", icon: Languages, color: "bg-indigo-50 text-indigo-400" },
  { label: "Special Effects", slug: "Specialty Effects & Activities", icon: Zap, color: "bg-yellow-50 text-yellow-500" },
  { label: "Send-Off & Post-Event", slug: "Send-Off & Post-Event", icon: PartyPopper, color: "bg-pink-50 text-pink-500" },
  { label: "Unique Specialists", slug: "Unique Specialty Services", icon: Award, color: "bg-violet-50 text-violet-500" },
  { label: "Spiritual & Wellness", slug: "Spiritual & Wellness", icon: Sparkles, color: "bg-teal-50 text-teal-400" },
  { label: "Local Expertise", slug: "Local Expertise", icon: MapPin, color: "bg-green-50 text-green-500" },
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

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/provider/services/${id}/duplicate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service duplicated", description: "The copy is a draft awaiting review — edit and submit it." });
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
            <h2 className="text-xl font-semibold text-console-darkest" data-testid="text-services-title">
              Your Services
            </h2>
            {isLoading ? (
              <Skeleton className="h-4 w-40 mt-1" />
            ) : (
              <p className="text-console-mid text-sm">{activeCount} of {totalServices} services active</p>
            )}
          </div>
          <Link href="/provider/services/new">
            <Button className="bg-primary hover:bg-primary/90" data-testid="button-add-service">
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
              <h3 className="text-lg font-semibold text-console-darkest mb-1">What will you offer?</h3>
              <p className="text-console-mid text-sm">
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
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-console-light bg-white hover:border-primary hover:shadow-sm transition-all text-center group"
                    data-testid={`card-inspiration-${card.slug.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.color} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-console-dark leading-tight">{card.label}</span>
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
              <p className="text-console-mid font-medium">No services in this category.</p>
              <p className="text-console-mid text-sm mt-1">Try a different filter or add a new service.</p>
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
              const rawPrice = service.price ?? service.basePrice;
              const priceDisplay = rawPrice == null || rawPrice === ""
                ? "—"
                : service.priceType === "hourly"
                ? `$${rawPrice} / hr`
                : service.priceType === "package_tiers"
                ? `from $${rawPrice}`
                : service.priceType === "per_event"
                ? `$${rawPrice} / event`
                : `$${rawPrice}`;
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
                          <h3 className="font-semibold text-console-darkest truncate">{displayName}</h3>
                          {service.isFeatured && (
                            <Badge className="bg-primary text-white text-[10px]" data-testid={`badge-featured-${service.id}`}>
                              Featured
                            </Badge>
                          )}
                          {categoryName && (
                            <Badge variant="outline" className="text-[10px]">{categoryName}</Badge>
                          )}
                        </div>

                        {service.description && (
                          <p className="text-sm text-console-mid mt-1 line-clamp-2">{service.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                          <span className="flex items-center gap-1 font-semibold text-green-600" data-testid={`text-price-${service.id}`}>
                            <DollarSign className="w-4 h-4" /> {priceDisplay}
                          </span>
                          {service.deliveryTimeframe && (
                            <span className="flex items-center gap-1 text-console-mid">
                              <Clock className="w-4 h-4" /> {service.deliveryTimeframe}
                            </span>
                          )}
                          {service.maxConcurrentBookings && service.maxConcurrentBookings > 1 && (
                            <span className="flex items-center gap-1 text-console-mid">
                              <Users className="w-4 h-4" /> Up to {service.maxConcurrentBookings}
                            </span>
                          )}
                          {service.meetingPoint && (
                            <span className="flex items-center gap-1 text-console-mid truncate max-w-[160px]">
                              <MapPin className="w-4 h-4 flex-shrink-0" /> {service.meetingPoint}
                            </span>
                          )}
                          {service.pickupAvailable && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Truck className="w-4 h-4" /> Pickup available
                            </span>
                          )}
                        </div>

                        {/* Affinity tag chips */}
                        {Array.isArray(service.contentAffinityTags) && service.contentAffinityTags.length > 0 && (
                          <div className="mt-3" data-testid={`affinity-tags-${service.id}`}>
                            <p className="text-[10px] font-medium text-console-mid uppercase tracking-wide mb-1.5">
                              Surfaces when travellers view:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {service.contentAffinityTags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-[10px] py-0 px-1.5 bg-primary/8 text-primary border border-primary/20"
                                  data-testid={`chip-affinity-${service.id}-${tag}`}
                                >
                                  {AFFINITY_TAG_LABELS[tag] ?? tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
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
                        <span className="text-xs text-console-mid">
                          {isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-console-light">
                      <Link href={`/provider/services/${service.id}/edit`}>
                        <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                          <Edit className="w-4 h-4 mr-1" /> Edit
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => duplicateMutation.mutate(service.id)}
                        disabled={duplicateMutation.isPending}
                        data-testid={`button-duplicate-${service.id}`}
                      >
                        <Copy className="w-4 h-4 mr-1" /> Duplicate
                      </Button>
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
