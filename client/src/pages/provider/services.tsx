import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Image as ImageIcon
} from "lucide-react";
import { useState } from "react";
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

export default function ProviderServices() {
  const [selectedCategory, setSelectedCategory] = useState("All");
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

  const filteredServices = !services
    ? []
    : selectedCategory === "All"
      ? services
      : services.filter(s => s.category === selectedCategory);

  const activeCount = (services || []).filter(s => s.active).length;

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
              <p className="text-gray-600">{activeCount} of {services?.length || 0} services active</p>
            )}
          </div>
          <Button data-testid="button-add-service">
            <Plus className="w-4 h-4 mr-2" /> Add New Service
          </Button>
        </div>

        {/* Category Filter */}
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

        {/* Services Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {isLoading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-48 rounded-lg" />
              ))}
            </>
          ) : filteredServices.length > 0 ? (
            filteredServices.map((service) => (
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
                    <Button variant="outline" size="sm" data-testid={`button-edit-${service.id}`}>
                      <Edit className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" data-testid={`button-images-${service.id}`}>
                      <ImageIcon className="w-4 h-4 mr-1" /> Images
                    </Button>
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
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No services found in this category.</p>
                <Button className="mt-4" data-testid="button-add-first-service">
                  <Plus className="w-4 h-4 mr-2" /> Add Your First Service
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ProviderLayout>
  );
}
