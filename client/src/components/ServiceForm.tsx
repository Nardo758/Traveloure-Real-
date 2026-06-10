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
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Plus, Trash2, Loader2, CheckCircle, ArrowLeft,
  MapPin, Navigation, Truck, Radius, Info, Image, Clock, FileText, ShieldAlert,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  requiresBackgroundCheck?: boolean;
  insuranceBand?: number | null;
}

interface ServiceSubcategory {
  id: string;
  name: string;
  sortOrder: number | null;
}

interface ServiceFormData {
  name: string;
  categoryId: string;
  subcategoryId: string;
  description: string;
  basePrice: number;
  priceType: "Fixed" | "Range" | "Per-person";
  duration: string;
  deliveryMethod: "in-person" | "video-call" | "hybrid";
  // Expert-specific: approval workflow
  approvalStatus: "draft" | "submitted" | "approved" | "rejected";
  // Provider-specific: status + features
  active: boolean;
  revisionsIncluded: number;
  includesExpertNotes: boolean;
  contentAffinityTags: string[];
  // Shared: content
  whatIncluded: string[];
  maxConcurrentClients: number;
  // Logistics
  serviceArea: string;
  neighborhood: string;
  meetingPoint: string;
  pickupAvailable: boolean;
  pickupAddress: string;
  serviceRadius: number;
  // Booking terms
  cancellationPolicy: string;
  leadTime: string;
  // Media
  serviceImage: string;
  galleryImages: string[];
}

interface ServiceFormProps {
  role: "expert" | "provider";
  id?: string;
  onSuccess?: (serviceId: string) => void;
}

const AFFINITY_TAG_OPTIONS: { value: string; label: string }[] = [
  { value: "hotel_arrival", label: "Hotel arrival/departure" },
  { value: "photo_shoot", label: "Photo shoot" },
  { value: "restaurant_visit", label: "Restaurant visit" },
  { value: "cultural_attraction", label: "Cultural attraction" },
  { value: "wellness_experience", label: "Wellness experience" },
  { value: "nightlife", label: "Nightlife" },
  { value: "hiking_outdoor", label: "Hiking/outdoor" },
  { value: "wedding_proposal", label: "Wedding/proposal" },
  { value: "general_logistics", label: "Any trip (general logistics)" },
];

function buildEmptyForm(role: "expert" | "provider"): ServiceFormData {
  return {
    name: "",
    categoryId: "",
    subcategoryId: "",
    description: "",
    basePrice: 0,
    priceType: "Fixed",
    duration: "",
    deliveryMethod: "in-person",
    approvalStatus: "draft",
    active: true,
    revisionsIncluded: 0,
    includesExpertNotes: false,
    contentAffinityTags: [],
    whatIncluded: [],
    maxConcurrentClients: 1,
    serviceArea: "",
    neighborhood: "",
    meetingPoint: "",
    pickupAvailable: false,
    pickupAddress: "",
    serviceRadius: 0,
    cancellationPolicy: "",
    leadTime: "",
    serviceImage: "",
    galleryImages: [],
  };
}

function mapServiceToForm(s: any, role: "expert" | "provider"): ServiceFormData {
  return {
    name: s.serviceName || "",
    categoryId: s.categoryId || "",
    subcategoryId: s.subcategoryId || "",
    description: s.description || "",
    basePrice: Number(s.price || 0),
    priceType: "Fixed",
    duration: s.deliveryTimeframe || s.duration || "",
    deliveryMethod: s.deliveryMethod || "in-person",
    approvalStatus: s.approvalStatus || "draft",
    active: s.status === "active",
    revisionsIncluded: Number(s.revisionsIncluded || 0),
    includesExpertNotes: Boolean(s.includesExpertNotes),
    contentAffinityTags: Array.isArray(s.contentAffinityTags) ? s.contentAffinityTags : [],
    whatIncluded: (s.whatIncluded as string[]) || [],
    maxConcurrentClients: s.maxConcurrentBookings || 1,
    serviceArea: s.location || "",
    neighborhood: s.neighborhood || "",
    meetingPoint: s.meetingPoint || "",
    pickupAvailable: Boolean(s.pickupAvailable),
    pickupAddress: s.pickupAddress || "",
    serviceRadius: Number(s.serviceRadius || 0),
    cancellationPolicy: s.cancellationPolicy || "",
    leadTime: s.leadTime || "",
    serviceImage: s.serviceImage || "",
    galleryImages: Array.isArray(s.galleryImages) ? s.galleryImages : [],
  };
}

export function ServiceForm({ role, id, onSuccess }: ServiceFormProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditMode = !!id;
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [newIncluded, setNewIncluded] = useState("");
  const [newGalleryUrl, setNewGalleryUrl] = useState("");

  // Single category taxonomy
  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const [formData, setFormData] = useState<ServiceFormData>(buildEmptyForm(role));

  const { data: subcategories = [] } = useQuery<ServiceSubcategory[]>({
    queryKey: ["/api/service-categories", formData.categoryId, "subcategories"],
    enabled: !!formData.categoryId,
  });

  const { data: allNeighborhoods = [] } = useQuery<Array<{ id: string; city: string; country: string; name: string; slug: string }>>({
    queryKey: ["/api/city-neighborhoods"],
  });

  const { data: existingService, isLoading: loadingExisting } = useQuery<any>({
    queryKey: ["/api/provider/services", id],
    enabled: isEditMode,
  });

  const categoryPreSelected = useRef(false);

  const templatePreFilled = useRef(false);

  // Pre-fill from ?tpl_* URL params (set by "Use This Template" on service-templates page)
  useEffect(() => {
    if (!isEditMode && !templatePreFilled.current) {
      const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const tplName = sp.get("tpl_name");
      if (!tplName) return;
      templatePreFilled.current = true;

      const deliveryRaw = sp.get("tpl_delivery") || "";
      const deliveryMap: Record<string, ServiceFormData["deliveryMethod"]> = {
        "video": "video-call",
        "video-call": "video-call",
        "in-person": "in-person",
        "hybrid": "hybrid",
        "document": "in-person",
      };
      const deliveryMethod: ServiceFormData["deliveryMethod"] =
        deliveryMap[deliveryRaw] ?? "in-person";

      let whatIncluded: string[] = [];
      try {
        const raw = sp.get("tpl_included");
        if (raw) whatIncluded = JSON.parse(raw);
      } catch {
        whatIncluded = [];
      }

      setFormData((prev) => ({
        ...prev,
        name: tplName,
        description: sp.get("tpl_desc") || prev.description,
        basePrice: parseFloat(sp.get("tpl_price") || "0") || prev.basePrice,
        duration: sp.get("tpl_duration") || prev.duration,
        deliveryMethod,
        whatIncluded: whatIncluded.length > 0 ? whatIncluded : prev.whatIncluded,
      }));
    }
  }, [isEditMode]);

  // Pre-select category from ?category= URL param
  useEffect(() => {
    if (!isEditMode && categories.length > 0 && !categoryPreSelected.current) {
      const raw = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("category") || ""
        : "";
      if (raw) {
        const lower = raw.toLowerCase();
        const match = categories.find((c) =>
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
      setFormData(mapServiceToForm(existingService, role));
    }
  }, [existingService, role]);

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
    setFormData(buildEmptyForm(role));
    setNewIncluded("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createMutation = useMutation({
    mutationFn: async (submitAction: "draft" | "submit" | "publish") => {
      const payload: Record<string, any> = {
        serviceName: formData.name,
        categoryId: formData.categoryId || undefined,
        subcategoryId: formData.subcategoryId || undefined,
        description: formData.description,
        price: String(formData.basePrice),
        priceType: formData.priceType.toLowerCase().replace("-", "_"),
        deliveryTimeframe: formData.duration,
        deliveryMethod: formData.deliveryMethod,
        whatIncluded: formData.whatIncluded,
        maxConcurrentBookings: formData.maxConcurrentClients,
        location: formData.serviceArea || "Unknown",
        neighborhood: formData.neighborhood || null,
        meetingPoint: formData.meetingPoint || null,
        pickupAvailable: formData.pickupAvailable,
        pickupAddress: formData.pickupAvailable ? (formData.pickupAddress || null) : null,
        serviceRadius: formData.pickupAvailable && formData.serviceRadius > 0 ? formData.serviceRadius : null,
        cancellationPolicy: formData.cancellationPolicy || null,
        leadTime: formData.leadTime || null,
        serviceImage: formData.serviceImage || null,
        galleryImages: formData.galleryImages,
      };

      // Role-specific fields
      if (role === "provider") {
        payload.revisionsIncluded = formData.revisionsIncluded;
        payload.includesExpertNotes = formData.includesExpertNotes;
        payload.contentAffinityTags = formData.contentAffinityTags;
        payload.status = submitAction === "publish" ? "active" : "draft";
      } else {
        // Expert: send approvalStatus for workflow
        if (submitAction === "draft") {
          payload.approvalStatus = "draft";
          payload.status = "draft";
        } else if (submitAction === "submit") {
          payload.approvalStatus = "submitted";
          payload.status = "draft";
        }
      }

      if (isEditMode) {
        return apiRequest("PATCH", `/api/provider/services/${id}`, payload);
      }
      return apiRequest("POST", "/api/provider/services", payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      if (role === "expert") {
        queryClient.invalidateQueries({ queryKey: ["/api/expert/custom-services"] });
      }
      if (isEditMode) {
        toast({ title: "Service updated" });
        navigate(`/${role}/services`);
      } else if (role === "expert") {
        toast({ title: "Service submitted for review!" });
        queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
        navigate("/expert/services");
      } else {
        setCreationSuccess(true);
        if (onSuccess) onSuccess(data.id);
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

  const { data: verificationStatus } = useQuery<{ providerVerificationStatus: string; backgroundCheckConfirmed: boolean }>({
    queryKey: ["/api/provider/verification-status"],
    enabled: role === "provider",
  });

  const selectedCategory = categories.find((c) => c.id === formData.categoryId);
  const needsMeetingPoint = formData.deliveryMethod === "in-person" || formData.deliveryMethod === "hybrid";
  const isCategoryGated = !!(selectedCategory?.requiresBackgroundCheck || (selectedCategory?.insuranceBand ?? 0) >= 2);
  const isProviderVerified = verificationStatus?.providerVerificationStatus === "verified";
  const publishBlocked = role === "provider" && isCategoryGated && !isProviderVerified;

  if (isEditMode && loadingExisting) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
      </div>
    );
  }

  if (creationSuccess) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {role === "expert" ? "Service submitted for review!" : "Service published!"}
            </h2>
            <p className="text-gray-500 text-sm">
              {role === "expert"
                ? "Your service has been submitted for approval. You'll be notified when it's reviewed."
                : "Your service is now live. You can add more services to build out your full catalog."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate(`/${role}/services`)}>
                View My Services
              </Button>
              <Button
                className="bg-[#FF385C] hover:bg-[#FF385C]/90"
                onClick={handleAddAnother}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Another Service
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">

      {/* ── Breadcrumb / Back ── */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate(`/${role}/services`)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
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
              placeholder={role === "expert" ? "e.g., Custom Itinerary Planning, Cultural Immersion Tour" : "e.g., Private City Walking Tour, Airport Transfer"}
              className="mt-2"
            />
          </div>

          {/* Category — single canonical taxonomy */}
          <div>
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.categoryId}
              onValueChange={(v) => {
                setFormData((prev) => ({ ...prev, categoryId: v, subcategoryId: "" }));
              }}
            >
              <SelectTrigger id="category" className="mt-2">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCategory?.description && (
              <p className="text-xs text-muted-foreground mt-1">{selectedCategory.description}</p>
            )}
          </div>

          {/* Verification banner — shown when selected category requires background check / elevated insurance */}
          {role === "provider" && isCategoryGated && (
            <div
              className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${isProviderVerified ? "bg-green-50 border-green-200 text-green-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}
              data-testid="banner-verification-required"
            >
              <ShieldAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isProviderVerified ? "text-green-600" : "text-amber-600"}`} />
              <div>
                {isProviderVerified ? (
                  <p className="font-medium">Background verification complete — you can publish this service.</p>
                ) : (
                  <>
                    <p className="font-medium">Background check required before going live</p>
                    <p className="text-xs mt-0.5 opacity-80">
                      This category requires a background check and/or elevated insurance verification.
                      You can save as a draft now and contact support to complete verification before publishing.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Subcategory */}
          {subcategories.length > 0 && (
            <div>
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select
                value={formData.subcategoryId}
                onValueChange={(v) => set("subcategoryId", v)}
              >
                <SelectTrigger id="subcategory" className="mt-2">
                  <SelectValue placeholder="Select a subcategory" />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((subcat) => (
                    <SelectItem key={subcat.id} value={subcat.id}>
                      {subcat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe what your service includes, what makes it special, and what travelers can expect..."
              rows={4}
              className="mt-2"
            />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="basePrice">Base Price ($) *</Label>
              <Input
                id="basePrice"
                type="number"
                value={formData.basePrice}
                onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="priceType">Price Type</Label>
              <Select value={formData.priceType} onValueChange={(v: any) => set("priceType", v)}>
                <SelectTrigger id="priceType" className="mt-2">
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
            <Label htmlFor="duration">Duration *</Label>
            <Input
              id="duration"
              value={formData.duration}
              onChange={(e) => set("duration", e.target.value)}
              placeholder={role === "expert" ? "e.g., 2 hours, 3 days, 1 week" : "e.g., 30 minutes, 2 hours, same-day"}
              className="mt-2"
            />
          </div>

          {/* Delivery Method */}
          <div>
            <Label htmlFor="deliveryMethod">Delivery Method *</Label>
            <Select
              value={formData.deliveryMethod}
              onValueChange={(v: any) => set("deliveryMethod", v)}
            >
              <SelectTrigger id="deliveryMethod" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in-person">In-Person</SelectItem>
                <SelectItem value="video-call">Video Call</SelectItem>
                <SelectItem value="hybrid">Hybrid (In-Person + Video)</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </CardContent>
      </Card>

      {/* ── What's Included ── */}
      <Card>
        <CardHeader>
          <CardTitle>What's Included</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {formData.whatIncluded.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-secondary p-2 rounded">
                <span className="text-sm">{item}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveIncluded(idx)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newIncluded}
              onChange={(e) => setNewIncluded(e.target.value)}
              placeholder="e.g., 2-hour guided tour, Hotel pickup, Lunch..."
              onKeyDown={(e) => e.key === "Enter" && handleAddIncluded()}
            />
            <Button onClick={handleAddIncluded} variant="outline" size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Logistics (conditional based on delivery method) ── */}
      {needsMeetingPoint && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Meeting Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="meetingPoint">Meeting Point *</Label>
              <Textarea
                id="meetingPoint"
                value={formData.meetingPoint}
                onChange={(e) => set("meetingPoint", e.target.value)}
                placeholder="Where will the service take place? (e.g., Hotel lobby, Specific landmark, Street address)"
                rows={2}
                className="mt-2"
              />
            </div>

            {/* Neighborhood */}
            <div>
              <Label htmlFor="neighborhood">Neighborhood (Optional)</Label>
              <Select
                value={formData.neighborhood}
                onValueChange={(v) => set("neighborhood", v)}
              >
                <SelectTrigger id="neighborhood" className="mt-2">
                  <SelectValue placeholder="Select a neighborhood" />
                </SelectTrigger>
                <SelectContent>
                  {allNeighborhoods.map((n) => (
                    <SelectItem key={n.slug} value={n.slug}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Helps travelers find services in their area</p>
            </div>

            {/* Service Area */}
            <div>
              <Label htmlFor="serviceArea">Service Area</Label>
              <Input
                id="serviceArea"
                value={formData.serviceArea}
                onChange={(e) => set("serviceArea", e.target.value)}
                placeholder="e.g., Central Paris, Tokyo Shibuya, Barcelona Gràcia"
                className="mt-2"
              />
            </div>

            {/* Pickup */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="pickupAvailable" className="flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Offer Pickup/Drop-off
                </Label>
                <Switch
                  id="pickupAvailable"
                  checked={formData.pickupAvailable}
                  onCheckedChange={(checked) => set("pickupAvailable", checked)}
                />
              </div>
              {formData.pickupAvailable && (
                <>
                  <div>
                    <Label htmlFor="pickupAddress">Pickup Location</Label>
                    <Input
                      id="pickupAddress"
                      value={formData.pickupAddress}
                      onChange={(e) => set("pickupAddress", e.target.value)}
                      placeholder="e.g., Main train station, Airport terminal 2"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="serviceRadius" className="flex items-center gap-2">
                      <Radius className="w-4 h-4" />
                      Service Radius (km)
                    </Label>
                    <Input
                      id="serviceRadius"
                      type="number"
                      value={formData.serviceRadius}
                      onChange={(e) => set("serviceRadius", parseInt(e.target.value) || 0)}
                      className="mt-2"
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Booking Terms ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Booking Terms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="leadTime" className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Lead Time Required
            </Label>
            <Input
              id="leadTime"
              value={formData.leadTime}
              onChange={(e) => set("leadTime", e.target.value)}
              placeholder="e.g., 48 hours, 1 week, 3 days"
              className="mt-2"
              data-testid="input-lead-time"
            />
            <p className="text-xs text-muted-foreground mt-1">How far in advance must clients book?</p>
          </div>
          <div>
            <Label htmlFor="cancellationPolicy">Cancellation Policy</Label>
            <Textarea
              id="cancellationPolicy"
              value={formData.cancellationPolicy}
              onChange={(e) => set("cancellationPolicy", e.target.value)}
              placeholder="e.g., Full refund if cancelled 48 hours before. 50% refund if cancelled 24 hours before. No refund within 12 hours."
              rows={3}
              className="mt-2"
              data-testid="textarea-cancellation-policy"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Photos ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            Photos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="serviceImage">Cover Photo URL</Label>
            <Input
              id="serviceImage"
              value={formData.serviceImage}
              onChange={(e) => set("serviceImage", e.target.value)}
              placeholder="https://..."
              className="mt-2"
              data-testid="input-service-image"
            />
            {formData.serviceImage && (
              <img
                src={formData.serviceImage}
                alt="Cover preview"
                className="mt-2 w-full h-40 object-cover rounded-lg border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>
          <div>
            <Label>Gallery Images</Label>
            <div className="space-y-2 mt-2">
              {formData.galleryImages.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <img
                    src={url}
                    alt={`Gallery ${idx + 1}`}
                    className="w-12 h-12 object-cover rounded border flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
                  />
                  <span className="flex-1 text-sm text-muted-foreground truncate">{url}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => set("galleryImages", formData.galleryImages.filter((_, i) => i !== idx))}
                    data-testid={`button-remove-gallery-${idx}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={newGalleryUrl}
                onChange={(e) => setNewGalleryUrl(e.target.value)}
                placeholder="https://... (image URL)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGalleryUrl.trim()) {
                    set("galleryImages", [...formData.galleryImages, newGalleryUrl.trim()]);
                    setNewGalleryUrl("");
                  }
                }}
                data-testid="input-gallery-url"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (newGalleryUrl.trim()) {
                    set("galleryImages", [...formData.galleryImages, newGalleryUrl.trim()]);
                    setNewGalleryUrl("");
                  }
                }}
                data-testid="button-add-gallery"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Provider-Specific Features ── */}
      {role === "provider" && (
        <Card>
          <CardHeader>
            <CardTitle>Additional Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Revisions */}
            <div>
              <Label htmlFor="revisionsIncluded">Revisions Included</Label>
              <Input
                id="revisionsIncluded"
                type="number"
                value={formData.revisionsIncluded}
                onChange={(e) => set("revisionsIncluded", parseInt(e.target.value) || 0)}
                min="0"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Number of revisions or refinements included</p>
            </div>

            {/* Expert Notes */}
            <div className="flex items-center justify-between">
              <Label htmlFor="expertNotes" className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                Includes Expert Notes
              </Label>
              <Switch
                id="expertNotes"
                checked={formData.includesExpertNotes}
                onCheckedChange={(checked) => set("includesExpertNotes", checked)}
              />
            </div>

            {/* Max Concurrent */}
            <div>
              <Label htmlFor="maxClients">Max Concurrent Clients</Label>
              <Input
                id="maxClients"
                type="number"
                value={formData.maxConcurrentClients}
                onChange={(e) => set("maxConcurrentClients", parseInt(e.target.value) || 1)}
                min="1"
                className="mt-2"
              />
            </div>

            {/* Content Affinity Tags */}
            <div>
              <Label>Content Affinity Tags</Label>
              <p className="text-xs text-muted-foreground mb-2">Mark contexts where this service is relevant</p>
              <div className="space-y-2">
                {AFFINITY_TAG_OPTIONS.map((tag) => (
                  <div key={tag.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={tag.value}
                      checked={formData.contentAffinityTags.includes(tag.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          set("contentAffinityTags", [...formData.contentAffinityTags, tag.value]);
                        } else {
                          set("contentAffinityTags", formData.contentAffinityTags.filter((t) => t !== tag.value));
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <Label htmlFor={tag.value} className="cursor-pointer text-sm font-normal">
                      {tag.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-secondary p-3 rounded-lg">
              <Label htmlFor="active" className="cursor-pointer font-medium">
                {formData.active ? "Published" : "Draft"}
              </Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => set("active", checked)}
              />
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Expert-Specific Approval Workflow ── */}
      {role === "expert" && (
        <Card>
          <CardHeader>
            <CardTitle>Submission & Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                Save your service as a draft, then submit it for approval. Our team will review and approve it within 48 hours.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Current Status</Label>
              <div className="mt-2">
                <Badge variant={formData.approvalStatus === "submitted" ? "default" : "secondary"}>
                  {formData.approvalStatus === "draft" ? "Draft (Not submitted)" : "Submitted for review"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Action Buttons ── */}
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-3 flex-col sm:flex-row">
            <Button
              variant="outline"
              onClick={() => navigate(`/${role}/services`)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>

            {role === "expert" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => createMutation.mutate("draft")}
                  disabled={createMutation.isPending}
                  className="flex-1"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save as Draft
                </Button>
                <Button
                  className="bg-[#FF385C] hover:bg-[#FF385C]/90 flex-1"
                  onClick={() => createMutation.mutate("submit")}
                  disabled={createMutation.isPending || !formData.name || !formData.categoryId}
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Submit for Approval
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => createMutation.mutate("draft")}
                  disabled={createMutation.isPending}
                  className="flex-1"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save Draft
                </Button>
                <Button
                  className="bg-[#FF385C] hover:bg-[#FF385C]/90 flex-1"
                  onClick={() => createMutation.mutate("publish")}
                  disabled={createMutation.isPending || !formData.name || !formData.categoryId || publishBlocked}
                  title={publishBlocked ? "Complete background verification before publishing this category" : undefined}
                  data-testid="button-publish-service"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {publishBlocked ? "Verification Required" : "Publish Service"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
