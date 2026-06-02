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
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: string;
  name: string;
  description?: string;
  category?: string;
  basePrice: string | number;
  priceUnit?: string;
  minGuests?: number;
  maxGuests?: number;
  duration?: string;
  active: boolean;
  featured?: boolean;
}

const categories = ["All", "Venue", "Catering", "Beverage", "Equipment", "Decoration"];

const inspirationCards = [
  { label: "Photography & Videography", slug: "Photography & Videography", icon: Camera, color: "bg-rose-50 text-rose-500" },
  { label: "Transportation & Logistics", slug: "Transportation & Logistics", icon: Car, color: "bg-blue-50 text-blue-500" },
  { label: "Food & Culinary", slug: "Food & Culinary", icon: ChefHat, color: "bg-orange-50 text-orange-500" },
  { label: "Tours & Experiences", slug: "Tours & Experiences", icon: Map, color: "bg-green-50 text-green-500" },
  { label: "Health & Wellness", slug: "Health & Wellness", icon: Heart, color: "bg-pink-50 text-pink-500" },
  { label: "Beauty & Styling", slug: "Beauty & Styling", icon: Sparkles, color: "bg-purple-50 text-purple-500" },
  { label: "Events & Celebrations", slug: "Events & Celebrations", icon: CalendarHeart, color: "bg-amber-50 text-amber-500" },
  { label: "Personal Assistance", slug: "Personal Assistance", icon: UserCheck, color: "bg-teal-50 text-teal-500" },
  { label: "Language & Translation", slug: "Language & Translation", icon: Languages, color: "bg-indigo-50 text-indigo-500" },
  { label: "Childcare & Family", slug: "Childcare & Family", icon: Baby, color: "bg-sky-50 text-sky-500" },
];

export default function ProviderServices() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ["/api/provider/services"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/provider/services/${id}`, { active });
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
      return res.json();
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
  const filteredServices = !services
    ? []
    : selectedCategory === "All"
      ? services
      : services.filter(s => s.category === selectedCategory);

  const activeCount = (services || []).filter(s => s.active).length;

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
              <p className="text-gray-600">{activeCount} of {totalServices} services active</p>
            )}
          </div>
          <Link href="/provider/services/new">
            <Button data-testid="button-add-service">
              <Plus className="w-4 h-4 mr-2" /> Add New Service
            </Button>
          </Link>
        </div>

        {/* Category Filter — only show when there are services */}
        {totalServices > 0 && (
          <div className="flex gap-2 flex-wrap">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                data-testid={`button-category-${category.toLowerCase()}`}
              >
                {category}
              </Button>
            ))}
          </div>
        )}

        {/* Services Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : isFirstTimeEmpty ? (
          /* First-time empty state: show inspiration panel */
          <div className="space-y-6">
            <div className="text-center py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">What will you offer?</h3>
              <p className="text-gray-500 text-sm">
                Pick a category below to get started, or build your own service from scratch.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
          /* Category filter returned nothing */
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
            {filteredServices.map((service) => (
              <Card
                key={service.id}
                className={!service.active ? "opacity-60" : ""}
                data-testid={`card-service-${service.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{service.name}</h3>
                        {service.featured && (
                          <Badge className="bg-[#FF385C] text-white" data-testid={`badge-featured-${service.id}`}>
                            Featured
                          </Badge>
                        )}
                        <Badge variant="outline">{service.category || "Service"}</Badge>
                      </div>
                      {service.description && (
                        <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                        <span className="flex items-center gap-1 font-semibold text-green-600">
                          <DollarSign className="w-4 h-4" /> {service.basePrice} {service.priceUnit || ""}
                        </span>
                        {service.maxGuests && (
                          <span className="flex items-center gap-1 text-gray-500">
                            <Users className="w-4 h-4" /> Up to {service.maxGuests} guests
                          </span>
                        )}
                        {service.minGuests && (
                          <span className="flex items-center gap-1 text-gray-500">
                            <Users className="w-4 h-4" /> Min {service.minGuests} guests
                          </span>
                        )}
                        {service.duration && (
                          <span className="flex items-center gap-1 text-gray-500">
                            <Clock className="w-4 h-4" /> {service.duration}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Switch
                        checked={service.active}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: service.id, active: checked })
                        }
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-active-${service.id}`}
                      />
                      <span className="text-xs text-gray-500">
                        {service.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                    <Link href={`/provider/services/${service.id}/edit`}>
                      <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                        <Edit className="w-4 h-4 mr-1" /> Edit
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => deleteMutation.mutate(service.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${service.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ProviderLayout>
  );
}
