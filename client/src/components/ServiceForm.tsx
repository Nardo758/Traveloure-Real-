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
  categoryKey?: string | null;
  description: string | null;
  requiresBackgroundCheck?: boolean;
  insuranceBand?: number | null;
}

interface CategoryField {
  id: string;
  categoryKey: string;
  fieldKey: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "url" | "multiselect";
  required: boolean;
  options: string[] | null;
  sortOrder: number;
  defaultPriceType?: string | null;
}

interface PricingTier {
  label: string;
  price: number;
  description: string;
}

interface ServiceSubcategory {
  id: string;
  name: string;
  sortOrder: number | null;
}

interface ExpertOfferingType {
  id: string;
  offeringTypeKey: string;
  serviceTier: string;
  displayName: string;
  tagline: string | null;
  deliveryFormats: string[];
  isSurprising: boolean;
  sortOrder: number;
}

interface ServiceFormData {
  name: string;
  categoryId: string;
  subcategoryId: string;
  description: string;
  basePrice: number;
  priceType: "Fixed" | "Range" | "Per-person" | "Hourly" | "Package tiers" | "Per-event";
  pricingTiers: PricingTier[];
  guestMin: number;
  guestMax: number;
  duration: string;
  deliveryMethod: "in-person" | "video-call" | "hybrid";
  // Expert-specific: tier + approval workflow
  expertOfferingTypeId: string;
  approvalStatus: "draft" | "submitted" | "approved" | "rejected";
  // Provider-specific: status + features
  active: boolean;
  revisionsIncluded: number;
  includesExpertNotes: boolean;
  contentAffinityTags: string[];
  // Shared: content
  whatIncluded: string[];
  requirements: string[];
  maxConcurrentClients: number;
  // Logistics
  serviceArea: string;
  neighborhood: string;
  neighborhoods: string[];
  meetingPoint: string;
  pickupAvailable: boolean;
  pickupAddress: string;
  serviceRadius: number;
  transportProvided: "yes" | "no" | "not_applicable";
  // Booking terms
  cancellationPolicy: string;
  // X1 (§13): structured policy TYPE — see CANCELLATION_POLICY_TYPE_OPTIONS. "" = not declared.
  cancellationPolicyType: string;
  leadTime: string;
  // Media
  serviceImage: string;
  galleryImages: string[];
  // Per-category dynamic attributes
  categoryAttributes: Record<string, any>;
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

// X1 (§13 hardcoded-copy arm): structured cancellation-policy TYPE vocabulary — mirrors
// shared/schema.ts cancellationPolicyTypeEnum. App-enforced (no DB CHECK, migration 144).
const CANCELLATION_POLICY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "flexible", label: "Flexible — full refund if cancelled well in advance" },
  { value: "moderate", label: "Moderate — partial refund on shorter notice" },
  { value: "strict", label: "Strict — limited refund window" },
  { value: "non_refundable", label: "Non-refundable" },
];

function buildEmptyForm(role: "expert" | "provider"): ServiceFormData {
  return {
    name: "",
    categoryId: "",
    subcategoryId: "",
    description: "",
    basePrice: 0,
    priceType: "Fixed",
    pricingTiers: [],
    guestMin: 0,
    guestMax: 0,
    duration: "",
    deliveryMethod: "in-person",
    expertOfferingTypeId: "",
    approvalStatus: "draft",
    active: true,
    revisionsIncluded: 0,
    includesExpertNotes: false,
    contentAffinityTags: [],
    whatIncluded: [],
    requirements: [],
    maxConcurrentClients: 1,
    serviceArea: "",
    neighborhood: "",
    neighborhoods: [],
    meetingPoint: "",
    pickupAvailable: false,
    pickupAddress: "",
    serviceRadius: 0,
    transportProvided: "not_applicable",
    cancellationPolicy: "",
    cancellationPolicyType: "",
    leadTime: "",
    serviceImage: "",
    galleryImages: [],
    categoryAttributes: {},
  };
}

function mapPriceTypeFromBackend(raw: string | null | undefined): ServiceFormData["priceType"] {
  switch (raw) {
    case "hourly":        return "Hourly";
    case "package_tiers": return "Package tiers";
    case "per_event":     return "Per-event";
    case "range":         return "Range";
    case "per_person":    return "Per-person";
    default:              return "Fixed";
  }
}

function mapPriceTypeToBackend(display: ServiceFormData["priceType"]): string {
  switch (display) {
    case "Hourly":         return "hourly";
    case "Package tiers":  return "package_tiers";
    case "Per-event":      return "per_event";
    case "Range":          return "range";
    case "Per-person":     return "per_person";
    default:               return "fixed";
  }
}

function mapDefaultPriceTypeHint(hint: string): ServiceFormData["priceType"] | null {
  switch (hint) {
    case "hourly":         return "Hourly";
    case "package_tiers":  return "Package tiers";
    case "per_event":      return "Per-event";
    case "range":          return "Range";
    case "per_person":     return "Per-person";
    case "fixed":          return "Fixed";
    default:               return null;
  }
}

function mapServiceToForm(s: any, role: "expert" | "provider"): ServiceFormData {
  // Parse guest range from priceBasedOn if per_event (e.g. "per_event_10_100")
  let guestMin = 0, guestMax = 0;
  if (s.priceBasedOn && typeof s.priceBasedOn === "string") {
    const m = s.priceBasedOn.match(/per_event_(\d+)_(\d+)/);
    if (m) { guestMin = parseInt(m[1]); guestMax = parseInt(m[2]); }
  }
  return {
    name: s.serviceName || "",
    categoryId: s.categoryId || "",
    subcategoryId: s.subcategoryId || "",
    description: s.description || "",
    basePrice: Number(s.price || 0),
    priceType: mapPriceTypeFromBackend(s.priceType),
    pricingTiers: Array.isArray(s.pricingTiers) ? s.pricingTiers : [],
    guestMin,
    guestMax,
    duration: s.deliveryTimeframe || s.duration || "",
    deliveryMethod: fromCanonicalDelivery(s.deliveryMethod),
    expertOfferingTypeId: s.expertOfferingTypeId || "",
    approvalStatus: s.approvalStatus || "draft",
    active: s.status === "active",
    revisionsIncluded: Number(s.revisionsIncluded || 0),
    includesExpertNotes: Boolean(s.includesExpertNotes),
    contentAffinityTags: Array.isArray(s.contentAffinityTags) ? s.contentAffinityTags : [],
    whatIncluded: (s.whatIncluded as string[]) || [],
    requirements: (s.requirements as string[]) || [],
    maxConcurrentClients: s.maxConcurrentBookings || 1,
    serviceArea: s.location || "",
    neighborhood: s.neighborhood || "",
    neighborhoods: Array.isArray(s.neighborhoods) ? s.neighborhoods : (s.neighborhood ? [s.neighborhood] : []),
    meetingPoint: s.meetingPoint || "",
    pickupAvailable: Boolean(s.pickupAvailable),
    pickupAddress: s.pickupAddress || "",
    serviceRadius: Number(s.serviceRadius || 0),
    transportProvided: (s.transportProvided === "yes" || s.transportProvided === "no" ? s.transportProvided : "not_applicable"),
    cancellationPolicy: s.cancellationPolicy || "",
    cancellationPolicyType: s.cancellationPolicyType || "",
    leadTime: s.leadTime || "",
    serviceImage: s.serviceImage || "",
    galleryImages: Array.isArray(s.galleryImages) ? s.galleryImages : [],
    categoryAttributes: (s.categoryAttributes && typeof s.categoryAttributes === "object") ? s.categoryAttributes : {},
  };
}

// Canonical service-template row (from GET /api/service-templates) — the wizard's
// template gallery source, absorbed into ServiceForm in Phase 2.
interface ServiceTemplate {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  deliveryMethod: string | null;
  deliveryTimeframe: string | null;
  suggestedPrice: string | null;
  requirements: unknown;
  whatIncluded: unknown;
}

const templateArrayToStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? (v as string[])
    : typeof v === "string" && v
    ? v.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

// ── Delivery-method canonicalization (migration-109 CHECK) ──────────────────
// The DB CHECK enforces the canonical 7: pdf, video, call, in_person,
// voice_notes, async_messaging, hybrid. ServiceForm's UI historically used the
// legacy labels in-person / video-call / hybrid and wrote them RAW — which the
// CHECK rejects (in-person / video-call are not canonical), so every create/edit
// with those two values failed on insert. Map at the write boundary so all
// ServiceForm writes are CHECK-valid, and on the way in so edits/templates
// (which now carry canonical values post-109) display correctly in the picker.
// Phase 3 exposes the other 4 canonical methods (call/voice_notes/async_messaging/pdf) in the UI.
type UiDelivery = ServiceFormData["deliveryMethod"];
const toCanonicalDelivery = (v: string): string =>
  v === "in-person" ? "in_person" : v === "video-call" ? "video" : v; // hybrid + already-canonical pass through
const fromCanonicalDelivery = (v: string | null | undefined): UiDelivery =>
  v === "video" || v === "video-call"
    ? "video-call"
    : v === "hybrid"
    ? "hybrid"
    : "in-person"; // in_person/in-person and the 4 not-yet-in-UI → in-person until Phase 3

// Map tier deliveryFormats to the form's deliveryMethod values
function tierFormatsToAllowedMethods(formats: string[]): Set<string> {
  const methodMap: Record<string, string[]> = {
    "video": ["video-call"],
    "live_text": ["video-call"],
    "chat": ["video-call", "in-person"],
    "written": ["in-person"],
    "done_for_you": ["in-person", "hybrid"],
    "hybrid": ["hybrid"],
    "in_person": ["in-person"],
  };
  const allowed = new Set<string>();
  for (const fmt of formats) {
    for (const m of (methodMap[fmt] ?? [])) allowed.add(m);
  }
  return allowed;
}

export function ServiceForm({ role, id, onSuccess }: ServiceFormProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditMode = !!id;
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [newIncluded, setNewIncluded] = useState("");
  const [newRequirement, setNewRequirement] = useState("");
  const [newGalleryUrl, setNewGalleryUrl] = useState("");

  // Single category taxonomy
  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  // Expert 5-tier offering types catalog
  const { data: expertOfferingTypes = [] } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/expert/offering-types"],
    enabled: role === "expert",
    staleTime: 5 * 60_000,
  });

  // Canonical service-template gallery (expert create-from-template — Phase 2).
  // Selection pre-fills the form; the write still goes through the canonical
  // create mutation below (draft/submitted), NOT the born-approved from-template route.
  const { data: serviceTemplates = [] } = useQuery<ServiceTemplate[]>({
    queryKey: ["/api/service-templates"],
    enabled: role === "expert" && !isEditMode,
    staleTime: 5 * 60_000,
  });

  const [formData, setFormData] = useState<ServiceFormData>(buildEmptyForm(role));

  const { data: subcategories = [] } = useQuery<ServiceSubcategory[]>({
    queryKey: ["/api/service-categories", formData.categoryId, "subcategories"],
    enabled: !!formData.categoryId,
  });

  const { data: allNeighborhoods = [] } = useQuery<Array<{ id: string; city: string; country: string; name: string; slug: string }>>({
    queryKey: ["/api/city-neighborhoods"],
  });

  // Fetch the selected category's categoryKey so we can load its dynamic fields
  const selectedCategoryKey = (categories as ServiceCategory[]).find((c) => c.id === formData.categoryId)?.categoryKey ?? null;

  const { data: categoryFields = [] } = useQuery<CategoryField[]>({
    queryKey: ["/api/service-categories", selectedCategoryKey, "fields"],
    enabled: !!selectedCategoryKey,
  });

  const { data: existingService, isLoading: loadingExisting } = useQuery<any>({
    queryKey: ["/api/provider/services", id],
    enabled: isEditMode,
  });

  const categoryPreSelected = useRef(false);
  const offeringTypeKeyPreSelected = useRef(false);

  const templatePreFilled = useRef(false);

  // Pre-fill from ?tpl_* URL params (set by "Use This Template" on service-templates page)
  useEffect(() => {
    if (!isEditMode && !templatePreFilled.current) {
      const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const tplName = sp.get("tpl_name");
      if (!tplName) return;
      templatePreFilled.current = true;

      // tpl_delivery carries the canonical delivery value from the template row (post-109).
      const deliveryMethod: ServiceFormData["deliveryMethod"] =
        fromCanonicalDelivery(sp.get("tpl_delivery") || "");

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

  // Pre-select tier from ?offeringTypeKey= URL param (used by /earn CTA)
  useEffect(() => {
    if (
      role !== "expert" ||
      isEditMode ||
      expertOfferingTypes.length === 0 ||
      offeringTypeKeyPreSelected.current
    ) return;
    const raw = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("offeringTypeKey") || ""
      : "";
    if (!raw) return;
    const match = expertOfferingTypes.find((t) => t.offeringTypeKey === raw);
    if (match) {
      offeringTypeKeyPreSelected.current = true;
      setFormData((prev) => ({ ...prev, expertOfferingTypeId: match.id }));
    }
  }, [expertOfferingTypes, isEditMode, role]);

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

  // Pre-select category's default price type when creating a new service.
  // We only stamp prevCategoryIdRef *after* categoryFields has loaded so
  // the effect re-fires once the async query resolves.
  const prevCategoryIdRef = useRef<string>("");
  useEffect(() => {
    if (isEditMode) return;
    if (!formData.categoryId) return;
    if (formData.categoryId === prevCategoryIdRef.current) return;
    // Wait until fields for this category have actually arrived
    if (categoryFields.length === 0) return;
    // Mark as processed now that we have data
    prevCategoryIdRef.current = formData.categoryId;
    const hint = categoryFields[0]?.defaultPriceType;
    if (hint) {
      const mapped = mapDefaultPriceTypeHint(hint);
      if (mapped) setFormData((prev) => ({ ...prev, priceType: mapped, pricingTiers: [] }));
    }
  }, [categoryFields, formData.categoryId, isEditMode]);

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

  const handleAddRequirement = () => {
    if (newRequirement.trim()) {
      set("requirements", [...formData.requirements, newRequirement.trim()]);
      setNewRequirement("");
    }
  };

  const handleRemoveRequirement = (index: number) => {
    set("requirements", formData.requirements.filter((_, i) => i !== index));
  };

  // Create-from-template (Phase 2): pre-fill the form from a canonical template
  // row. The write is the normal ServiceForm submit → canonical POST with
  // approvalStatus draft/submitted; never born-approved.
  const applyTemplate = (t: ServiceTemplate) => {
    setFormData((prev) => ({
      ...prev,
      name: t.title,
      description: t.description ?? prev.description,
      categoryId: t.categoryId ?? prev.categoryId,
      deliveryMethod: fromCanonicalDelivery(t.deliveryMethod),
      duration: t.deliveryTimeframe ?? prev.duration,
      basePrice: t.suggestedPrice ? (parseFloat(t.suggestedPrice) || prev.basePrice) : prev.basePrice,
      requirements: templateArrayToStrings(t.requirements),
      whatIncluded: templateArrayToStrings(t.whatIncluded),
    }));
    toast({
      title: "Loaded from template",
      description: "Review and edit below, then Save as draft or Submit for review — it is never auto-approved.",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddAnother = () => {
    setCreationSuccess(false);
    setFormData(buildEmptyForm(role));
    setNewIncluded("");
    setNewRequirement("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createMutation = useMutation({
    mutationFn: async (submitAction: "draft" | "submit" | "publish") => {
      // In-person / hybrid services must tell the traveler WHERE to meet before they go live.
      // Enforced at submit/publish only — a draft is allowed to be incomplete. Existing listings
      // are grandfathered until their next submit/publish (the has_insurance/F2 precedent).
      const isInPerson = formData.deliveryMethod === "in-person" || formData.deliveryMethod === "hybrid";
      if (submitAction !== "draft" && isInPerson && !formData.meetingPoint.trim()) {
        throw new Error("Add a meeting point — in-person services must show travelers where to meet. Save as draft to finish later.");
      }

      // Compute price scalar and priceBasedOn from the selected pricing model
      let priceScalar = String(formData.basePrice);
      let pricingTiersPayload: PricingTier[] = [];
      let priceBasedOn: string | null = null;

      if (formData.priceType === "Package tiers" && formData.pricingTiers.length > 0) {
        pricingTiersPayload = formData.pricingTiers;
        const validPrices = formData.pricingTiers.map((t) => t.price).filter((p) => p > 0);
        if (validPrices.length > 0) priceScalar = String(Math.min(...validPrices));
      } else if (formData.priceType === "Per-event") {
        if (formData.guestMin > 0 && formData.guestMax > 0) {
          priceBasedOn = `per_event_${formData.guestMin}_${formData.guestMax}`;
        } else {
          priceBasedOn = "per_event";
        }
      }

      const payload: Record<string, any> = {
        serviceName: formData.name,
        categoryId: formData.categoryId || undefined,
        subcategoryId: formData.subcategoryId || undefined,
        description: formData.description,
        price: priceScalar,
        priceType: mapPriceTypeToBackend(formData.priceType),
        pricingTiers: pricingTiersPayload,
        priceBasedOn,
        deliveryTimeframe: formData.duration,
        // Canonicalize to the migration-109 CHECK vocabulary before write.
        deliveryMethod: toCanonicalDelivery(formData.deliveryMethod),
        whatIncluded: formData.whatIncluded,
        requirements: formData.requirements,
        maxConcurrentBookings: formData.maxConcurrentClients,
        location: formData.serviceArea || "Unknown",
        neighborhood: formData.neighborhoods.length > 0 ? formData.neighborhoods[0] : (formData.neighborhood || null),
        neighborhoods: formData.neighborhoods,
        meetingPoint: formData.meetingPoint || null,
        pickupAvailable: formData.pickupAvailable,
        pickupAddress: formData.pickupAvailable ? (formData.pickupAddress || null) : null,
        serviceRadius: formData.pickupAvailable && formData.serviceRadius > 0 ? formData.serviceRadius : null,
        // Transport disclosure only carries meaning for an in-person/hybrid meeting; remote → not_applicable.
        transportProvided: isInPerson ? formData.transportProvided : "not_applicable",
        cancellationPolicy: formData.cancellationPolicy || null,
        cancellationPolicyType: formData.cancellationPolicyType || null,
        leadTime: formData.leadTime || null,
        serviceImage: formData.serviceImage || null,
        galleryImages: formData.galleryImages,
        categoryAttributes: formData.categoryAttributes,
      };

      // Role-specific fields
      if (role === "provider") {
        payload.includesExpertNotes = formData.includesExpertNotes;
        payload.contentAffinityTags = formData.contentAffinityTags;
        payload.status = submitAction === "publish" ? "active" : "draft";
      } else {
        // Expert: send tier FK + approvalStatus for workflow
        if (formData.expertOfferingTypeId) {
          payload.expertOfferingTypeId = formData.expertOfferingTypeId;
        }
        if (submitAction === "draft") {
          payload.approvalStatus = "draft";
          payload.status = "draft";
        } else if (submitAction === "submit") {
          payload.approvalStatus = "submitted";
          payload.status = "draft";
        }
      }
      // revisionsIncluded is shared (expert + provider)
      payload.revisionsIncluded = formData.revisionsIncluded;

      if (isEditMode) {
        return apiRequest("PATCH", `/api/provider/services/${id}`, payload);
      }
      return apiRequest("POST", "/api/provider/services", payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      if (role === "expert") {
        queryClient.invalidateQueries({ queryKey: ["/api/expert/service-listings"] });
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
                className="bg-primary hover:bg-primary/90"
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

      {/* ── Start from a template (expert create — absorbed from the wizard, Phase 2) ── */}
      {role === "expert" && !isEditMode && serviceTemplates.length > 0 && (
        <Card data-testid="service-template-gallery">
          <CardHeader>
            <CardTitle>Start from a template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {serviceTemplates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    {t.description && (
                      <div className="text-sm text-muted-foreground truncate">{t.description}</div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyTemplate(t)}
                    data-testid={`button-use-template-${t.id}`}
                  >
                    Use this template
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Picking a template pre-fills the form below. Review, edit, then Save as draft or Submit for review —
              it is never auto-approved.
            </p>
          </CardContent>
        </Card>
      )}

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
                setFormData((prev) => ({ ...prev, categoryId: v, subcategoryId: "", categoryAttributes: {} }));
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
          <div className="space-y-4">
            <div>
              <Label htmlFor="priceType">Pricing Model</Label>
              <Select
                value={formData.priceType}
                onValueChange={(v: any) => set("priceType", v)}
              >
                <SelectTrigger id="priceType" className="mt-2" data-testid="select-price-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fixed">Fixed price</SelectItem>
                  <SelectItem value="Range">Price range</SelectItem>
                  <SelectItem value="Per-person">Per person</SelectItem>
                  <SelectItem value="Hourly">Hourly rate</SelectItem>
                  <SelectItem value="Package tiers">Package tiers</SelectItem>
                  <SelectItem value="Per-event">Per event (flat fee)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Hourly — single rate + /hr label */}
            {formData.priceType === "Hourly" && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="basePrice">Hourly Rate ($) *</Label>
                  <Input
                    id="basePrice"
                    type="number"
                    min="0"
                    value={formData.basePrice || ""}
                    onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="mt-2"
                    data-testid="input-hourly-rate"
                  />
                </div>
                <span className="text-sm font-medium text-muted-foreground pb-2.5">/ hr</span>
              </div>
            )}

            {/* Package tiers — dynamic tier builder */}
            {formData.priceType === "Package tiers" && (
              <div className="space-y-3">
                <Label>Pricing Tiers</Label>
                {formData.pricingTiers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add tiers like Basic, Standard, or Premium — each with a price and short description.
                  </p>
                )}
                {formData.pricingTiers.map((tier, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-3 bg-secondary/40 rounded-lg border" data-testid={`tier-row-${idx}`}>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Tier name (e.g. Basic)"
                        value={tier.label}
                        onChange={(e) => {
                          const updated = [...formData.pricingTiers];
                          updated[idx] = { ...updated[idx], label: e.target.value };
                          set("pricingTiers", updated);
                        }}
                        data-testid={`input-tier-label-${idx}`}
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min="0"
                          placeholder="Price"
                          value={tier.price || ""}
                          onChange={(e) => {
                            const updated = [...formData.pricingTiers];
                            updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) || 0 };
                            set("pricingTiers", updated);
                          }}
                          data-testid={`input-tier-price-${idx}`}
                        />
                      </div>
                      <Input
                        placeholder="Short description (optional)"
                        value={tier.description}
                        onChange={(e) => {
                          const updated = [...formData.pricingTiers];
                          updated[idx] = { ...updated[idx], description: e.target.value };
                          set("pricingTiers", updated);
                        }}
                        className="col-span-2"
                        data-testid={`input-tier-desc-${idx}`}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => set("pricingTiers", formData.pricingTiers.filter((_, i) => i !== idx))}
                      data-testid={`button-remove-tier-${idx}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => set("pricingTiers", [...formData.pricingTiers, { label: "", price: 0, description: "" }])}
                  data-testid="button-add-tier"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add tier
                </Button>
              </div>
            )}

            {/* Per-event — flat rate + optional guest range */}
            {formData.priceType === "Per-event" && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="basePrice">Flat Event Rate ($) *</Label>
                  <Input
                    id="basePrice"
                    type="number"
                    min="0"
                    value={formData.basePrice || ""}
                    onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="mt-2"
                    data-testid="input-event-rate"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="guestMin">Min guests (optional)</Label>
                    <Input
                      id="guestMin"
                      type="number"
                      min="0"
                      value={formData.guestMin || ""}
                      onChange={(e) => set("guestMin", parseInt(e.target.value) || 0)}
                      placeholder="e.g. 10"
                      className="mt-2"
                      data-testid="input-guest-min"
                    />
                  </div>
                  <div>
                    <Label htmlFor="guestMax">Max guests (optional)</Label>
                    <Input
                      id="guestMax"
                      type="number"
                      min="0"
                      value={formData.guestMax || ""}
                      onChange={(e) => set("guestMax", parseInt(e.target.value) || 0)}
                      placeholder="e.g. 100"
                      className="mt-2"
                      data-testid="input-guest-max"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fixed / Range / Per-person — scalar price input */}
            {(formData.priceType === "Fixed" || formData.priceType === "Range" || formData.priceType === "Per-person") && (
              <div>
                <Label htmlFor="basePrice">
                  {formData.priceType === "Range"
                    ? "Starting Price ($) *"
                    : formData.priceType === "Per-person"
                    ? "Price Per Person ($) *"
                    : "Base Price ($) *"}
                </Label>
                <Input
                  id="basePrice"
                  type="number"
                  min="0"
                  value={formData.basePrice || ""}
                  onChange={(e) => set("basePrice", parseFloat(e.target.value) || 0)}
                  className="mt-2"
                  data-testid="input-base-price"
                />
              </div>
            )}
          </div>

          {/* Expert Tier Picker */}
          {role === "expert" && (
            <div>
              <Label>Service Tier *</Label>
              {expertOfferingTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">Loading tiers…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {expertOfferingTypes.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => {
                        set("expertOfferingTypeId", tier.id);
                      }}
                      className={`text-left p-3 rounded-lg border-2 transition-colors ${
                        formData.expertOfferingTypeId === tier.id
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      data-testid={`option-tier-${tier.offeringTypeKey}`}
                    >
                      <p className="font-medium text-sm text-gray-900">{tier.displayName}</p>
                      {tier.tagline && (
                        <p className="text-xs text-gray-500 mt-0.5">{tier.tagline}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
          {(() => {
            const selectedTier = expertOfferingTypes.find((t) => t.id === formData.expertOfferingTypeId);
            const allowed = selectedTier && selectedTier.deliveryFormats.length > 0
              ? tierFormatsToAllowedMethods(selectedTier.deliveryFormats)
              : null;
            const allMethods = [
              { value: "in-person", label: "In-Person" },
              { value: "video-call", label: "Video Call" },
              { value: "hybrid", label: "Hybrid (In-Person + Video)" },
            ];
            const visibleMethods = allowed
              ? allMethods.filter((m) => allowed.has(m.value))
              : allMethods;
            return (
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
                    {visibleMethods.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                    {visibleMethods.length === 0 && (
                      <SelectItem value="in-person">In-Person</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {allowed && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Options filtered to your selected tier's delivery formats.
                  </p>
                )}
              </div>
            );
          })()}

        </CardContent>
      </Card>

      {/* ── Category-Specific Dynamic Fields ── */}
      {categoryFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {(categories as ServiceCategory[]).find((c) => c.id === formData.categoryId)?.name ?? "Category"} Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {categoryFields.map((field) => {
              const value = formData.categoryAttributes[field.fieldKey] ?? "";
              const setCatAttr = (val: any) =>
                setFormData((prev) => ({
                  ...prev,
                  categoryAttributes: { ...prev.categoryAttributes, [field.fieldKey]: val },
                }));

              if (field.type === "boolean") {
                return (
                  <div key={field.fieldKey} className="flex items-center justify-between">
                    <Label htmlFor={`cat-${field.fieldKey}`} className="flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Switch
                      id={`cat-${field.fieldKey}`}
                      checked={Boolean(value)}
                      onCheckedChange={setCatAttr}
                      data-testid={`switch-cat-${field.fieldKey}`}
                    />
                  </div>
                );
              }

              if (field.type === "select" && Array.isArray(field.options)) {
                return (
                  <div key={field.fieldKey}>
                    <Label htmlFor={`cat-${field.fieldKey}`}>
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Select value={String(value || "")} onValueChange={setCatAttr}>
                      <SelectTrigger id={`cat-${field.fieldKey}`} className="mt-2" data-testid={`select-cat-${field.fieldKey}`}>
                        <SelectValue placeholder={`Select ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              if (field.type === "multiselect" && Array.isArray(field.options)) {
                const selected: string[] = Array.isArray(value) ? value : [];
                return (
                  <div key={field.fieldKey}>
                    <Label>
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {field.options.map((opt) => {
                        const active = selected.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setCatAttr(active ? selected.filter((s) => s !== opt) : [...selected, opt])
                            }
                            className={`px-3 py-1 rounded-full text-sm border transition-colors ${active ? "bg-primary text-white border-primary" : "bg-background text-foreground border-border hover:border-primary"}`}
                            data-testid={`chip-cat-${field.fieldKey}-${opt}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // text / number / url
              return (
                <div key={field.fieldKey}>
                  <Label htmlFor={`cat-${field.fieldKey}`}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <Input
                    id={`cat-${field.fieldKey}`}
                    type={field.type === "number" ? "number" : "text"}
                    value={String(value ?? "")}
                    onChange={(e) => setCatAttr(field.type === "number" ? (parseFloat(e.target.value) || "") : e.target.value)}
                    placeholder={field.type === "url" ? "https://..." : `Enter ${field.label.toLowerCase()}`}
                    className="mt-2"
                    data-testid={`input-cat-${field.fieldKey}`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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

      {/* ── Requirements from Client (absorbed from the expert wizard, Phase 2) ── */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements from Client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {formData.requirements.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-secondary p-2 rounded">
                <span className="text-sm">{item}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveRequirement(idx)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newRequirement}
              onChange={(e) => setNewRequirement(e.target.value)}
              placeholder="e.g., Passport copy, Dietary restrictions, Preferred dates..."
              onKeyDown={(e) => e.key === "Enter" && handleAddRequirement()}
            />
            <Button onClick={handleAddRequirement} variant="outline" size="icon">
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

            {/* Transport disclosure — travelers need to know if they must arrange their own transport */}
            <div>
              <Label htmlFor="transportProvided" className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Do you provide transport during this service?
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Once you meet the traveler, will you transport them (e.g. car, van)? This is shown to travelers so they can plan.
              </p>
              <Select
                value={formData.transportProvided}
                onValueChange={(v: "yes" | "no" | "not_applicable") => set("transportProvided", v)}
              >
                <SelectTrigger id="transportProvided" data-testid="select-transport-provided">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes — I provide transport</SelectItem>
                  <SelectItem value="no">No — traveler arranges their own</SelectItem>
                  <SelectItem value="not_applicable">Not applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Neighborhoods multi-select */}
            <div>
              <Label>Neighborhoods (Optional)</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Select all neighborhoods you serve. The first selected becomes the primary display neighborhood.
              </p>
              {allNeighborhoods.length === 0 ? (
                <p className="text-xs text-muted-foreground">No neighborhoods available.</p>
              ) : (
                <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1 mt-1">
                  {Object.entries(
                    allNeighborhoods.reduce<Record<string, typeof allNeighborhoods>>((acc, n) => {
                      const key = `${n.city}, ${n.country}`;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(n);
                      return acc;
                    }, {})
                  ).map(([cityLabel, items]) => (
                    <div key={cityLabel}>
                      <p className="text-xs font-semibold text-muted-foreground px-1 py-0.5 uppercase tracking-wide">{cityLabel}</p>
                      {items.map((n) => {
                        const checked = formData.neighborhoods.includes(n.slug);
                        const isPrimary = formData.neighborhoods[0] === n.slug;
                        return (
                          <label
                            key={n.slug}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
                            data-testid={`checkbox-neighborhood-${n.slug}`}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...formData.neighborhoods, n.slug]
                                  : formData.neighborhoods.filter((s) => s !== n.slug);
                                set("neighborhoods", next);
                              }}
                            />
                            <span className="flex-1">{n.name}</span>
                            {checked && isPrimary && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">primary</Badge>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
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
            <Label htmlFor="cancellationPolicyType">Cancellation Policy</Label>
            <Select
              value={formData.cancellationPolicyType || undefined}
              onValueChange={(v) => set("cancellationPolicyType", v)}
            >
              <SelectTrigger id="cancellationPolicyType" className="mt-2" data-testid="select-cancellation-policy-type">
                <SelectValue placeholder="Not declared — no policy shown to travelers" />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_POLICY_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Shown to travelers as a real per-offering policy. Leave unset if you haven't decided — we never show a fabricated default.
            </p>
          </div>
          <div>
            <Label htmlFor="cancellationPolicy">Cancellation Policy Details (optional)</Label>
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
              <Label htmlFor="revisionsIncluded-expert">Revisions Included</Label>
              <Input
                id="revisionsIncluded-expert"
                type="number"
                value={formData.revisionsIncluded}
                onChange={(e) => set("revisionsIncluded", parseInt(e.target.value) || 0)}
                min="0"
                className="mt-2"
                data-testid="input-revisions-expert"
              />
              <p className="text-xs text-muted-foreground mt-1">Number of revisions or refinements included</p>
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
                  className="bg-primary hover:bg-primary/90 flex-1"
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
                  className="bg-primary hover:bg-primary/90 flex-1"
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
