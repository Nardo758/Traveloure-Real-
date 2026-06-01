import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DynamicPricingEditor } from "@/components/shared/dynamic-pricing-editor";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ServiceFormData {
  name: string;
  category: string;
  description: string;
  basePrice: number;
  priceType: "Fixed" | "Range" | "Per-person";
  duration: string;
  deliveryMethod: "in-person" | "video-call" | "hybrid";
  revisionsIncluded: number;
  includesExpertNotes: boolean;
  photos: string[];
  whatIncluded: string[];
  maxConcurrentClients: number;
  maxGroupSize: number;
  serviceArea: string;
  pickupAvailable: boolean;
  pickupRadius: number;
  active: boolean;
}

const EMPTY_FORM: ServiceFormData = {
  name: "",
  category: "",
  description: "",
  basePrice: 0,
  priceType: "Fixed",
  duration: "",
  deliveryMethod: "in-person",
  revisionsIncluded: 0,
  includesExpertNotes: false,
  photos: [],
  whatIncluded: [],
  maxConcurrentClients: 1,
  maxGroupSize: 4,
  serviceArea: "",
  pickupAvailable: false,
  pickupRadius: 0,
  active: true,
};

function mapServiceToForm(s: any): ServiceFormData {
  return {
    name: s.serviceName || "",
    category: s.serviceType || "",
    description: s.description || "",
    basePrice: Number(s.price || 0),
    priceType: "Fixed",
    duration: s.deliveryTimeframe || "",
    deliveryMethod: s.deliveryMethod || "in-person",
    revisionsIncluded: Number(s.revisionsIncluded || 0),
    includesExpertNotes: Boolean(s.includesExpertNotes),
    photos: [],
    whatIncluded: (s.whatIncluded as string[]) || [],
    maxConcurrentClients: s.maxConcurrentBookings || 1,
    maxGroupSize: 4,
    serviceArea: s.location || "",
    pickupAvailable: false,
    pickupRadius: 0,
    active: s.status === "active",
  };
}

export default function ProviderServiceForm() {
  const params = useParams<{ id: string }>();
  const isEditMode = !!params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: existingService, isLoading: loadingExisting } = useQuery<any>({
    queryKey: ["/api/provider/services", params?.id],
    enabled: isEditMode,
  });

  const [formData, setFormData] = useState<ServiceFormData>(EMPTY_FORM);

  useEffect(() => {
    if (existingService) {
      setFormData(mapServiceToForm(existingService));
    }
  }, [existingService]);

  const [newIncluded, setNewIncluded] = useState("");

  const createMutation = useMutation({
    mutationFn: async (draft: boolean) => {
      const payload = {
        serviceName: formData.name,
        description: formData.description,
        serviceType: formData.category.toLowerCase() || "planning",
        price: String(formData.basePrice),
        priceType: formData.priceType.toLowerCase().replace("-", "_"),
        deliveryTimeframe: formData.duration,
        deliveryMethod: formData.deliveryMethod,
        revisionsIncluded: formData.revisionsIncluded,
        includesExpertNotes: formData.includesExpertNotes,
        whatIncluded: formData.whatIncluded,
        maxConcurrentBookings: formData.maxConcurrentClients,
        location: formData.serviceArea || "Unknown",
        status: draft ? "draft" : (formData.active ? "active" : "draft"),
      };
      if (isEditMode) {
        return apiRequest("PATCH", `/api/provider/services/${params!.id}`, payload);
      }
      return apiRequest("POST", "/api/provider/services", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      toast({ title: isEditMode ? "Service updated" : "Service created successfully" });
      navigate("/provider/services");
    },
    onError: (error: any) => {
      toast({
        title: isEditMode ? "Failed to update service" : "Failed to create service",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleAddIncluded = () => {
    if (newIncluded.trim()) {
      setFormData({ ...formData, whatIncluded: [...formData.whatIncluded, newIncluded] });
      setNewIncluded("");
    }
  };

  const handleRemoveIncluded = (index: number) => {
    setFormData({ ...formData, whatIncluded: formData.whatIncluded.filter((_, i) => i !== index) });
  };

  if (isEditMode && loadingExisting) {
    return (
      <ProviderLayout title="Edit Service">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
        </div>
      </ProviderLayout>
    );
  }

  return (
    <ProviderLayout title={isEditMode ? "Edit Service" : "New Service"}>
      <div className="p-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>{isEditMode ? "Edit Service" : "Create New Service"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Service Name */}
            <div>
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Airport Transfer"
                className="mt-2"
                data-testid="input-service-name"
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Transport, Tour, Equipment"
                className="mt-2"
                data-testid="input-category"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your service in detail..."
                rows={4}
                className="mt-2"
                data-testid="input-description"
              />
            </div>

            {/* Base Price & Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="basePrice">Base Price ($) *</Label>
                <Input
                  id="basePrice"
                  type="number"
                  value={formData.basePrice}
                  onChange={(e) => setFormData({ ...formData, basePrice: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                  data-testid="input-base-price"
                />
              </div>
              <div>
                <Label htmlFor="priceType">Price Type</Label>
                <Select value={formData.priceType} onValueChange={(val: any) => setFormData({ ...formData, priceType: val })}>
                  <SelectTrigger id="priceType" className="mt-2" data-testid="select-price-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="Range">Range</SelectItem>
                    <SelectItem value="Per-person">Per-person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Duration */}
            <div>
              <Label htmlFor="duration">Duration / Delivery Timeframe</Label>
              <Input
                id="duration"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="e.g., 2-3 hours, Full day"
                className="mt-2"
                data-testid="input-duration"
              />
            </div>

            {/* Delivery Method */}
            <div>
              <Label htmlFor="deliveryMethod">Delivery Method</Label>
              <Select
                value={formData.deliveryMethod}
                onValueChange={(val: any) => setFormData({ ...formData, deliveryMethod: val })}
              >
                <SelectTrigger id="deliveryMethod" className="mt-2" data-testid="select-delivery-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-person">In-person</SelectItem>
                  <SelectItem value="video-call">Video call</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Revisions Included */}
            <div>
              <Label htmlFor="revisionsIncluded">Revisions Included</Label>
              <Input
                id="revisionsIncluded"
                type="number"
                min={0}
                value={formData.revisionsIncluded}
                onChange={(e) => setFormData({ ...formData, revisionsIncluded: parseInt(e.target.value) || 0 })}
                placeholder="0"
                className="mt-2"
                data-testid="input-revisions-included"
              />
            </div>

            {/* Expert Notes */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <div>
                <Label htmlFor="expertNotes" className="cursor-pointer">Includes Expert Notes</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Add personalised expert commentary to this service</p>
              </div>
              <Switch
                id="expertNotes"
                checked={formData.includesExpertNotes}
                onCheckedChange={(checked) => setFormData({ ...formData, includesExpertNotes: checked })}
                data-testid="switch-expert-notes"
              />
            </div>

            {/* What's Included */}
            <div>
              <Label>What's Included</Label>
              <div className="mt-2 space-y-2">
                {formData.whatIncluded.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-secondary p-2 rounded" data-testid={`item-included-${idx}`}>
                    <span className="text-sm">{item}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveIncluded(idx)}
                      data-testid={`button-remove-included-${idx}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newIncluded}
                  onChange={(e) => setNewIncluded(e.target.value)}
                  placeholder="Add an item..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddIncluded()}
                  data-testid="input-add-included"
                />
                <Button onClick={handleAddIncluded} variant="outline" size="icon" data-testid="button-add-included">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Max Concurrent Clients */}
            <div>
              <Label htmlFor="maxClients">Max Concurrent Clients</Label>
              <Input
                id="maxClients"
                type="number"
                value={formData.maxConcurrentClients}
                onChange={(e) => setFormData({ ...formData, maxConcurrentClients: parseInt(e.target.value) || 1 })}
                className="mt-2"
                data-testid="input-max-clients"
              />
            </div>

            {/* Service Area */}
            <div>
              <Label htmlFor="serviceArea">Service Area</Label>
              <Input
                id="serviceArea"
                value={formData.serviceArea}
                onChange={(e) => setFormData({ ...formData, serviceArea: e.target.value })}
                placeholder="e.g., Kyoto, Osaka, Nara"
                className="mt-2"
                data-testid="input-service-area"
              />
            </div>

            {/* Pickup Available */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <Label htmlFor="pickup" className="cursor-pointer">Pickup Available</Label>
              <Switch
                id="pickup"
                checked={formData.pickupAvailable}
                onCheckedChange={(checked) => setFormData({ ...formData, pickupAvailable: checked })}
                data-testid="switch-pickup"
              />
            </div>

            {formData.pickupAvailable && (
              <div>
                <Label htmlFor="pickupRadius">Pickup Radius (km)</Label>
                <Input
                  id="pickupRadius"
                  type="number"
                  value={formData.pickupRadius}
                  onChange={(e) => setFormData({ ...formData, pickupRadius: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                  data-testid="input-pickup-radius"
                />
              </div>
            )}

            {/* Dynamic Pricing Editor */}
            <div className="border-t pt-6">
              <DynamicPricingEditor basePrice={formData.basePrice} />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <Label htmlFor="active" className="cursor-pointer">Active (visible to travelers)</Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                data-testid="switch-active"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => navigate("/provider/services")} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => createMutation.mutate(true)}
                disabled={createMutation.isPending}
                data-testid="button-save-draft"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Draft
              </Button>
              <Button
                className="bg-[#FF385C] hover:bg-[#FF385C]/90"
                onClick={() => createMutation.mutate(false)}
                disabled={createMutation.isPending || !formData.name || !formData.description || !formData.basePrice}
                data-testid="button-publish"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isEditMode ? "Update Service" : "Publish"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
