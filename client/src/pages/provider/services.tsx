import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const categories = ["All", "Venue", "Catering", "Beverage", "Equipment", "Decoration", "Transport", "Tour", "Other"];
const serviceCategories = ["Venue", "Catering", "Beverage", "Equipment", "Decoration", "Transport", "Tour", "Other"];

interface CreateServiceForm {
  name: string;
  category: string;
  basePrice: string;
  priceUnit: string;
  description: string;
  duration: string;
  maxGuests: string;
}

const emptyForm: CreateServiceForm = {
  name: "",
  category: "Tour",
  basePrice: "",
  priceUnit: "per person",
  description: "",
  duration: "",
  maxGuests: "",
};

export default function ProviderServices() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState<CreateServiceForm>(emptyForm);
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

  const createMutation = useMutation({
    mutationFn: async (data: CreateServiceForm) => {
      const res = await apiRequest("POST", "/api/provider/services", {
        serviceName: data.name,
        price: data.basePrice ? parseFloat(data.basePrice).toFixed(2) : undefined,
        description: data.description || undefined,
        deliveryTimeframe: data.duration || undefined,
        maxConcurrentBookings: data.maxGuests ? parseInt(data.maxGuests) : undefined,
        status: "active",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: "Service created", description: "Your new service is now live." });
      setShowCreateDialog(false);
      setForm(emptyForm);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to create service", description: error.message });
    },
  });

  const filteredServices = !services
    ? []
    : selectedCategory === "All"
      ? services
      : services.filter(s => s.category === selectedCategory);

  const activeCount = (services || []).filter(s => s.active).length;

  const handleCreate = () => {
    if (!form.name.trim()) { toast({ variant: "destructive", description: "Service name is required." }); return; }
    if (!form.basePrice || isNaN(parseFloat(form.basePrice))) { toast({ variant: "destructive", description: "Enter a valid price." }); return; }
    createMutation.mutate(form);
  };

  return (
    <ProviderLayout title="Services">
      <div className="p-6 space-y-6">
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
          <Button
            data-testid="button-add-service"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" /> Add New Service
          </Button>
        </div>

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
                        <h3 className="font-semibold text-gray-900">{service.serviceName || service.name}</h3>
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
                <Button
                  className="mt-4"
                  data-testid="button-add-first-service"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Your First Service
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-create-service">
          <DialogHeader>
            <DialogTitle>Add New Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="svc-name">Service Name *</Label>
              <Input
                id="svc-name"
                placeholder="e.g. Airport Transfer Deluxe"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                data-testid="input-service-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="svc-category">Category *</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger id="svc-category" data-testid="select-service-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {serviceCategories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="svc-price">Price *</Label>
                <Input
                  id="svc-price"
                  type="number"
                  placeholder="150"
                  value={form.basePrice}
                  onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))}
                  data-testid="input-service-price"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="svc-unit">Price Unit</Label>
                <Input
                  id="svc-unit"
                  placeholder="per person"
                  value={form.priceUnit}
                  onChange={e => setForm(f => ({ ...f, priceUnit: e.target.value }))}
                  data-testid="input-service-price-unit"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="svc-duration">Duration</Label>
                <Input
                  id="svc-duration"
                  placeholder="2 hours"
                  value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                  data-testid="input-service-duration"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="svc-guests">Max Guests</Label>
                <Input
                  id="svc-guests"
                  type="number"
                  placeholder="10"
                  value={form.maxGuests}
                  onChange={e => setForm(f => ({ ...f, maxGuests: e.target.value }))}
                  data-testid="input-service-max-guests"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea
                id="svc-desc"
                placeholder="Describe your service..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                data-testid="input-service-description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowCreateDialog(false); setForm(emptyForm); }}
              data-testid="button-cancel-service"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-save-service"
            >
              {createMutation.isPending ? "Saving..." : "Create Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProviderLayout>
  );
}
