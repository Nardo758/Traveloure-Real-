import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DynamicPricingEditor } from "@/components/shared/dynamic-pricing-editor";
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  Plus, Trash2, Loader2, CheckCircle,
  MapPin, Navigation, Truck, Radius, Info, ArrowLeft,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface ServiceFormData {
  name: string;
  categoryId: string;
  description: string;
  basePrice: number;
  priceType: "Fixed" | "Range" | "Per-person";
  duration: string;
  deliveryMethod: "in-person" | "video-call" | "hybrid";
  revisionsIncluded: number;
  includesExpertNotes: boolean;
  whatIncluded: string[];
  maxConcurrentClients: number;
  // Logistics
  serviceArea: string;
  meetingPoint: string;
  pickupAvailable: boolean;
  pickupAddress: string;
  serviceRadius: number;
  active: boolean;
}

function buildEmptyForm(): ServiceFormData {
  return {
    name: "",
    categoryId: "",
    description: "",
    basePrice: 0,
    priceType: "Fixed",
    duration: "",
    deliveryMethod: "in-person",
    revisionsIncluded: 0,
    includesExpertNotes: false,
    whatIncluded: [],
    maxConcurrentClients: 1,
    serviceArea: "",
    meetingPoint: "",
    pickupAvailable: false,
    pickupAddress: "",
    serviceRadius: 0,
    active: true,
  };
}

function mapServiceToForm(s: any): ServiceFormData {
  return {
    name: s.serviceName || "",
    categoryId: s.categoryId || "",
    description: s.description || "",
    basePrice: Number(s.price || 0),
    priceType: "Fixed",
    duration: s.deliveryTimeframe || "",
    deliveryMethod: s.deliveryMethod || "in-person",
    revisionsIncluded: Number(s.revisionsIncluded || 0),
    includesExpertNotes: Boolean(s.includesExpertNotes),
    whatIncluded: (s.whatIncluded as string[]) || [],
    maxConcurrentClients: s.maxConcurrentBookings || 1,
    serviceArea: s.location || "",
    meetingPoint: s.meetingPoint || "",
    pickupAvailable: Boolean(s.pickupAvailable),
    pickupAddress: s.pickupAddress || "",
    serviceRadius: Number(s.serviceRadius || 0),
    active: s.status === "active",
  };
}

export default function ProviderServiceForm() {
  const params = useParams<{ id: string }>();
  const isEditMode = !!params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [newIncluded, setNewIncluded] = useState("");

  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: existingService, isLoading: loadingExisting } = useQuery<any>({
    queryKey: ["/api/provider/services", params?.id],
    enabled: isEditMode,
  });

  const [formData, setFormData] = useState<ServiceFormData>(buildEmptyForm);
  const categoryPreSelected = useRef(false);

  // Pre-select category from ?category= URL param once categories are loaded
  useEffect(() => {
    if (!isEditMode && categories.length > 0 && !categoryPreSelected.current) {
      const raw = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("category") || ""
        : "";
      if (raw) {
        const lower = raw.toLowerCase();
        const match = categories.find(
          (c) =>
            c.name.toLowerCase() === lower ||
            c.slug.toLowerCase() === lower ||
            c.name.toLowerCase().includes(lower) ||
            lower.includes(c.name.toLowerCase())
        );
        if (match) {
          setFormData((prev) => ({ ...prev, categoryId: match.id }));
          categoryPreSelected.current = true;
        }
      }
    }
  }, [categories, isEditMode]);

  useEffect(() => {
    if (existingService) {
      setFormData(mapServiceToForm(existingService));
    }
  }, [existingService]);

  const set = (key: keyof ServiceFormData, value: any) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleAddIncluded = () => {
    if (newIncluded.trim()) {
      set("whatIncluded", [...formData.whatIncluded, newIncluded.trim()]);
      setNewIncluded("");
    }
  };

  const handleRemoveIncluded = (index: number) => {
    set("whatIncluded", formData.whatIncluded.filter((_, i) => i !== index));
  };

  const handleAddAnother = () => {
    setCreationSuccess(false);
    setFormData(buildEmptyForm());
    setNewIncluded("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createMutation = useMutation({
    mutationFn: async (draft: boolean) => {
      const payload: Record<string, any> = {
        serviceName: formData.name,
        categoryId: formData.categoryId || undefined,
        description: formData.description,
        price: String(formData.basePrice),
        priceType: formData.priceType.toLowerCase().replace("-", "_"),
        deliveryTimeframe: formData.duration,
        deliveryMethod: formData.deliveryMethod,
        revisionsIncluded: formData.revisionsIncluded,
        includesExpertNotes: formData.includesExpertNotes,
        whatIncluded: formData.whatIncluded,
        maxConcurrentBookings: formData.maxConcurrentClients,
        location: formData.serviceArea || "Unknown",
        // logistics
        meetingPoint: formData.meetingPoint || null,
        pickupAvailable: formData.pickupAvailable,
        pickupAddress: formData.pickupAvailable ? (formData.pickupAddress || null) : null,
        serviceRadius: formData.pickupAvailable && formData.serviceRadius > 0 ? formData.serviceRadius : null,
        status: draft ? "draft" : (formData.active ? "active" : "draft"),
      };
      if (isEditMode) {
        return apiRequest("PATCH", `/api/provider/services/${params!.id}`, payload);
      }
      return apiRequest("POST", "/api/provider/services", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      if (isEditMode) {
        toast({ title: "Service updated" });
        navigate("/provider/services");
      } else {
        setCreationSuccess(true);
      }
    },
    onError: (error: any) => {
      toast({
        title: isEditMode ? "Failed to update service" : "Failed to create service",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const selectedCategory = categories.find((c) => c.id === formData.categoryId);
  const needsMeetingPoint = formData.deliveryMethod === "in-person" || formData.deliveryMethod === "hybrid";

  if (isEditMode && loadingExisting) {
    return (
      <ProviderLayout title="Edit Service">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
        </div>
      </ProviderLayout>
    );
  }

  if (creationSuccess) {
    return (
      <ProviderLayout title="Service Created">
        <div className="p-6 max-w-lg mx-auto">
          <Card>
            <CardContent className="p-10 text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900" data-testid="text-success-title">
                Service published!
              </h2>
              <p className="text-gray-500 text-sm">
                Your service is now live. You can add more services to build out your full catalog.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button variant="outline" onClick={() => navigate("/provider/services")} data-testid="button-view-services">
                  View My Services
                </Button>
                <Button
                  className="bg-[#FF385C] hover:bg-[#FF385C]/90"
                  onClick={handleAddAnother}
                  data-testid="button-add-another"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Another Service
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ProviderLayout>
    );
  }

  return (
    <ProviderLayout title={isEditMode ? "Edit Service" : "New Service"}>
      <div className="p-6 max-w-3xl space-y-6">

        {/* ── Breadcrumb / Back ── */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => navigate("/provider/services")}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back-to-services"
          >
            <ArrowLeft className="w-4 h-4" />
            My Services
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">
            {isEditMode ? "Edit Service" : "New Service"}
          </span>
        </div>

        {/* ── Basic Information ── */}
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
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g., Private City Walking Tour, Airport Transfer, Sunset Photography"
                className="mt-2"
                data-testid="input-service-name"
              />
            </div>

            {/* Category — live dropdown from DB */}
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger id="category" className="mt-2" data-testid="select-category">
                  <SelectValue placeholder="Select a service category…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} data-testid={`option-category-${cat.slug}`}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory?.description && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {selectedCategory.description}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Describe your service in detail — what makes it special, who it's for, what clients should expect…"
                rows={4}
                className="mt-2"
                data-testid="input-description"
              />
            </div>

            {/* Price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="basePrice">Price ($) *</Label>
                <Input
                  id="basePrice"
                  type="number"
                  min={0}
                  value={formData.basePrice}
                  onChange={(e) => set("basePrice", parseInt(e.target.value) || 0)}
                  className="mt-2"
                  data-testid="input-base-price"
                />
              </div>
              <div>
                <Label htmlFor="priceType">Price Type</Label>
                <Select value={formData.priceType} onValueChange={(v: any) => set("priceType", v)}>
                  <SelectTrigger id="priceType" className="mt-2" data-testid="select-price-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed — set price per booking</SelectItem>
                    <SelectItem value="Range">Range — price varies</SelectItem>
                    <SelectItem value="Per-person">Per-person — multiply by group size</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Duration / Delivery Method */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="duration">Duration / Timeframe</Label>
                <Input
                  id="duration"
                  value={formData.duration}
                  onChange={(e) => set("duration", e.target.value)}
                  placeholder="e.g., 3 hours, Full day, 24-48 hrs"
                  className="mt-2"
                  data-testid="input-duration"
                />
              </div>
              <div>
                <Label htmlFor="deliveryMethod">How it's delivered</Label>
                <Select value={formData.deliveryMethod} onValueChange={(v: any) => set("deliveryMethod", v)}>
                  <SelectTrigger id="deliveryMethod" className="mt-2" data-testid="select-delivery-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-person">In-person</SelectItem>
                    <SelectItem value="video-call">Video call</SelectItem>
                    <SelectItem value="hybrid">Hybrid (in-person + remote)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Expert Notes + Revisions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
                <div>
                  <Label htmlFor="expertNotes" className="cursor-pointer">Expert Notes</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Personalised commentary</p>
                </div>
                <Switch
                  id="expertNotes"
                  checked={formData.includesExpertNotes}
                  onCheckedChange={(c) => set("includesExpertNotes", c)}
                  data-testid="switch-expert-notes"
                />
              </div>
              <div>
                <Label htmlFor="revisionsIncluded">Revisions Included</Label>
                <Input
                  id="revisionsIncluded"
                  type="number"
                  min={0}
                  value={formData.revisionsIncluded}
                  onChange={(e) => set("revisionsIncluded", parseInt(e.target.value) || 0)}
                  className="mt-2"
                  data-testid="input-revisions-included"
                />
              </div>
            </div>

            {/* What's Included */}
            <div>
              <Label>What's Included</Label>
              <div className="mt-2 space-y-2">
                {formData.whatIncluded.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-secondary p-2 rounded" data-testid={`item-included-${idx}`}>
                    <span className="text-sm">{item}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveIncluded(idx)} data-testid={`button-remove-included-${idx}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newIncluded}
                  onChange={(e) => setNewIncluded(e.target.value)}
                  placeholder="e.g., Hotel pickup, English-speaking guide, Entrance fees…"
                  onKeyDown={(e) => e.key === "Enter" && handleAddIncluded()}
                  data-testid="input-add-included"
                />
                <Button onClick={handleAddIncluded} variant="outline" size="icon" data-testid="button-add-included">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Max clients */}
            <div>
              <Label htmlFor="maxClients">Max Concurrent Bookings</Label>
              <Input
                id="maxClients"
                type="number"
                min={1}
                value={formData.maxConcurrentClients}
                onChange={(e) => set("maxConcurrentClients", parseInt(e.target.value) || 1)}
                className="mt-2"
                data-testid="input-max-clients"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Logistics ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#FF385C]" />
              Logistics & Location
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Tell customers where to go, how to get there, and whether you offer pickup.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Service Area */}
            <div>
              <Label htmlFor="serviceArea" className="flex items-center gap-1.5">
                <Navigation className="w-4 h-4" /> Coverage Area
              </Label>
              <Input
                id="serviceArea"
                value={formData.serviceArea}
                onChange={(e) => set("serviceArea", e.target.value)}
                placeholder="e.g., Kyoto City, Osaka Prefecture, Greater London"
                className="mt-2"
                data-testid="input-service-area"
              />
              <p className="text-xs text-muted-foreground mt-1">The region or city your service covers.</p>
            </div>

            {/* Meeting Point — only shown for in-person / hybrid */}
            {needsMeetingPoint && (
              <div>
                <Label htmlFor="meetingPoint" className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Meeting Point
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">Recommended</Badge>
                </Label>
                <Input
                  id="meetingPoint"
                  value={formData.meetingPoint}
                  onChange={(e) => set("meetingPoint", e.target.value)}
                  placeholder="e.g., Main entrance of Kyoto Station, Lobby of The Ritz, Central Park Bow Bridge"
                  className="mt-2"
                  data-testid="input-meeting-point"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The exact location where customers should arrive. Be specific — a landmark, entrance, or GPS-friendly address.
                </p>
              </div>
            )}

            {/* Pickup toggle */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <div>
                <Label htmlFor="pickup" className="cursor-pointer flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> Pickup Available
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You can collect customers from their hotel or a designated pickup spot.
                </p>
              </div>
              <Switch
                id="pickup"
                checked={formData.pickupAvailable}
                onCheckedChange={(c) => set("pickupAvailable", c)}
                data-testid="switch-pickup"
              />
            </div>

            {formData.pickupAvailable && (
              <div className="pl-4 border-l-2 border-[#FF385C]/30 space-y-4">
                {/* Pickup Address */}
                <div>
                  <Label htmlFor="pickupAddress">Pickup Starting Point / Hub</Label>
                  <Input
                    id="pickupAddress"
                    value={formData.pickupAddress}
                    onChange={(e) => set("pickupAddress", e.target.value)}
                    placeholder="e.g., Any hotel in central Kyoto, Gion district hotels, Specific pickup address"
                    className="mt-2"
                    data-testid="input-pickup-address"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Where you start pickups from, or describe the area you collect from.
                  </p>
                </div>

                {/* Service Radius */}
                <div>
                  <Label htmlFor="serviceRadius" className="flex items-center gap-1.5">
                    <Radius className="w-4 h-4" /> Pickup Radius (km)
                  </Label>
                  <Input
                    id="serviceRadius"
                    type="number"
                    min={0}
                    value={formData.serviceRadius}
                    onChange={(e) => set("serviceRadius", parseInt(e.target.value) || 0)}
                    placeholder="e.g., 10"
                    className="mt-2"
                    data-testid="input-service-radius"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    How far from your pickup hub you'll travel to collect customers. Leave 0 if unlimited.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Pricing & Status ── */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing & Availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Dynamic Pricing Editor */}
            <DynamicPricingEditor basePrice={formData.basePrice} />

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <div>
                <Label htmlFor="active" className="cursor-pointer">Visible to Travelers</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Turn off to hide this service without deleting it.</p>
              </div>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(c) => set("active", c)}
                data-testid="switch-active"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
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
                {isEditMode ? "Update Service" : "Publish Service"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
