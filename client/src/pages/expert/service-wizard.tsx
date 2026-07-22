import { useState, useEffect } from "react";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ChevronLeft, 
  ChevronRight, 
  Check,
  Video,
  MapPin,
  FileText,
  Clock,
  DollarSign,
  Package,
  AlertCircle,
  StickyNote,
  Sparkles,
  PenLine,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface ServiceTemplate {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  serviceType: string | null;
  deliveryMethod: string | null;
  deliveryTimeframe: string | null;
  suggestedPrice: string | null;
  requirements: unknown;
  whatIncluded: unknown;
  isActive: boolean;
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
  serviceName: string;
  description: string;
  categoryId: string;
  expertOfferingTypeId: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
  price: string;
  location: string;
  requirements: string;
  whatIncluded: string;
  status: string;
  includesExpertNotes: boolean;
  revisionsIncluded: number;
}

const initialFormData: ServiceFormData = {
  serviceName: "",
  description: "",
  categoryId: "",
  expertOfferingTypeId: "",
  deliveryMethod: "video",
  deliveryTimeframe: "",
  price: "",
  location: "",
  requirements: "",
  whatIncluded: "",
  status: "draft",
  includesExpertNotes: false,
  revisionsIncluded: 0,
};

// Map tier deliveryFormats to the wizard's delivery method values
function tierFormatsToAllowedWizardMethods(formats: string[]): Set<string> {
  const methodMap: Record<string, string[]> = {
    "video": ["video"],
    "live_text": ["video"],
    "chat": ["video", "in-person"],
    "written": ["document"],
    "done_for_you": ["document", "in-person", "hybrid"],
    "hybrid": ["hybrid"],
    "in_person": ["in-person"],
  };
  const allowed = new Set<string>();
  for (const fmt of formats) {
    for (const m of (methodMap[fmt] ?? [])) allowed.add(m);
  }
  return allowed;
}

const ALL_DELIVERY_METHODS = [
  { value: "video", label: "Video Call", icon: Video, description: "Live video consultation" },
  { value: "in-person", label: "In-Person", icon: MapPin, description: "Meet in person" },
  { value: "document", label: "Document Delivery", icon: FileText, description: "Written deliverable" },
  { value: "hybrid", label: "Hybrid", icon: Package, description: "Combination approach" },
];

const steps = [
  { id: 1, title: "Basics", description: "Service name and type" },
  { id: 2, title: "Details", description: "Description and delivery" },
  { id: 3, title: "Pricing", description: "Set your rates" },
  { id: 4, title: "Requirements", description: "What you need from clients" },
  { id: 5, title: "Review", description: "Preview and publish" },
];

const SERVICE_TIER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Advisory", value: "advisory" },
  { label: "Planning", value: "planning" },
  { label: "Coordination", value: "coordination" },
  { label: "Live Support", value: "live_support" },
  { label: "Specialized", value: "specialized" },
];

interface ExpertRole {
  role: string | null;
  roleLabel: string | null;
  applicationStatus: string | null;
}

export default function ServiceWizard() {
  const [startMode, setStartMode] = useState<'choose' | 'template' | 'scratch'>('choose');
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ServiceFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof ServiceFormData, string>>>({});
  const [tierFilter, setTierFilter] = useState<string>("all");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: expertRoleData, isLoading: roleLoading } = useQuery<ExpertRole>({
    queryKey: ["/api/expert/role"],
  });

  useEffect(() => {
    if (roleLoading) return;
    if (expertRoleData?.role === null) {
      toast({
        title: "Application required",
        description: "You need to submit an expert application before creating services.",
        variant: "destructive",
      });
      navigate("/expert/apply");
    } else if (expertRoleData?.applicationStatus === "pending") {
      toast({
        title: "Application pending",
        description: "Your expert application is under review. You can create services once it has been approved.",
        variant: "destructive",
      });
      navigate("/expert/dashboard");
    }
  }, [roleLoading, expertRoleData, toast, navigate]);

  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: expertOfferingTypes = [] } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/expert/offering-types"],
    staleTime: 5 * 60_000,
  });

  const { data: serviceTemplates = [], isLoading: templatesLoading } = useQuery<ServiceTemplate[]>({
    queryKey: ["/api/service-templates"],
    enabled: startMode === 'template',
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest("POST", `/api/expert/services/from-template/${templateId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      toast({ title: "Service created from template. You can now customize it." });
      navigate("/expert/services");
    },
    onError: () => {
      toast({ title: "Failed to create service from template", variant: "destructive" });
    },
  });

  const applyTemplateToForm = (t: ServiceTemplate) => {
    const arrayToText = (v: unknown): string => {
      if (!v) return "";
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return (v as string[]).join("\n");
      return "";
    };
    setFormData({
      ...initialFormData,
      serviceName: t.title,
      description: t.description ?? "",
      categoryId: t.categoryId ?? "",
      deliveryMethod: t.deliveryMethod ?? "video",
      deliveryTimeframe: t.deliveryTimeframe ?? "",
      price: t.suggestedPrice ?? "",
      requirements: arrayToText(t.requirements),
      whatIncluded: arrayToText(t.whatIncluded),
    });
    setStartMode('scratch');
    setCurrentStep(1);
  };

  const createMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      return apiRequest("POST", "/api/provider/services", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/analytics"] });
      toast({ title: "Service created successfully" });
      navigate("/expert/services");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create service", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    },
  });

  const updateField = (field: keyof ServiceFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof ServiceFormData, string>> = {};

    switch (step) {
      case 1:
        if (!formData.serviceName.trim()) {
          newErrors.serviceName = "Service name is required";
        }
        if (!formData.expertOfferingTypeId) {
          newErrors.expertOfferingTypeId = "Please select a service tier";
        }
        break;
      case 2:
        if (!formData.description.trim()) {
          newErrors.description = "Description is required";
        }
        if (!formData.deliveryMethod) {
          newErrors.deliveryMethod = "Please select a delivery method";
        }
        break;
      case 3:
        if (!formData.price || Number(formData.price) <= 0) {
          newErrors.price = "Please enter a valid price";
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = (asDraft: boolean = false) => {
    const requirements = formData.requirements
      ? formData.requirements.split("\n").map(s => s.trim()).filter(Boolean)
      : [];
    const whatIncluded = formData.whatIncluded
      ? formData.whatIncluded.split("\n").map(s => s.trim()).filter(Boolean)
      : [];
    const payload: Record<string, any> = {
      ...formData,
      requirements: requirements as any,
      whatIncluded: whatIncluded as any,
      status: asDraft ? "draft" : "active",
    };
    if (formData.expertOfferingTypeId) {
      payload.expertOfferingTypeId = formData.expertOfferingTypeId;
    }
    createMutation.mutate(payload as ServiceFormData);
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div 
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
              currentStep === step.id 
                ? "bg-primary border-primary text-white" 
                : currentStep > step.id 
                  ? "bg-green-500 border-green-500 text-white"
                  : "border-gray-300 text-gray-400"
            )}
          >
            {currentStep > step.id ? (
              <Check className="w-5 h-5" />
            ) : (
              step.id
            )}
          </div>
          {index < steps.length - 1 && (
            <div 
              className={cn(
                "w-16 h-1 mx-2",
                currentStep > step.id ? "bg-green-500" : "bg-gray-200"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="serviceName">Service Name</Label>
        <Input
          id="serviceName"
          value={formData.serviceName}
          onChange={(e) => updateField("serviceName", e.target.value)}
          placeholder="e.g., Trip Planning Consultation"
          className={errors.serviceName ? "border-red-500" : ""}
          data-testid="input-service-name"
        />
        {errors.serviceName && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.serviceName}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Label>Service Tier</Label>
        <div className="flex flex-wrap gap-2" data-testid="tier-filter-tabs">
          {SERVICE_TIER_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTierFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                tierFilter === f.value
                  ? "bg-primary border-primary text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
              )}
              data-testid={`filter-tier-${f.value}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {expertOfferingTypes.length === 0 ? (
          <p className="text-sm text-gray-500">Loading tiers…</p>
        ) : (() => {
          const filtered = tierFilter === "all"
            ? expertOfferingTypes
            : expertOfferingTypes.filter(
                (t) => t.serviceTier.toLowerCase().replace(/\s+/g, "_") === tierFilter
              );
          return (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.length === 0 ? (
                  <p className="text-sm text-gray-500 col-span-2">No service types in this category.</p>
                ) : filtered.map((tier) => (
                  <div
                    key={tier.id}
                    onClick={() => setFormData(prev => ({ ...prev, expertOfferingTypeId: tier.id }))}
                    className={cn(
                      "p-4 rounded-lg border-2 cursor-pointer transition-colors",
                      formData.expertOfferingTypeId === tier.id
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                    data-testid={`option-tier-${tier.offeringTypeKey}`}
                  >
                    <p className="font-medium text-gray-900">{tier.displayName}</p>
                    {tier.tagline && (
                      <p className="text-sm text-gray-600">{tier.tagline}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          );
        })()}
        {errors.expertOfferingTypeId && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.expertOfferingTypeId}
          </p>
        )}
      </div>

      {categories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="category">Category (Optional)</Label>
          <Select value={formData.categoryId} onValueChange={(v) => updateField("categoryId", v)}>
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Describe your service in detail..."
          rows={4}
          className={errors.description ? "border-red-500" : ""}
          data-testid="input-description"
        />
        {errors.description && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.description}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Delivery Method</Label>
        {(() => {
          const selectedTier = expertOfferingTypes.find((t) => t.id === formData.expertOfferingTypeId);
          const allowed = selectedTier && selectedTier.deliveryFormats.length > 0
            ? tierFormatsToAllowedWizardMethods(selectedTier.deliveryFormats)
            : null;
          const visibleMethods = allowed
            ? ALL_DELIVERY_METHODS.filter((m) => allowed.has(m.value))
            : ALL_DELIVERY_METHODS;
          const methodsToShow = visibleMethods.length > 0 ? visibleMethods : ALL_DELIVERY_METHODS;
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                {methodsToShow.map((method) => (
                  <div
                    key={method.value}
                    onClick={() => updateField("deliveryMethod", method.value)}
                    className={cn(
                      "p-4 rounded-lg border-2 cursor-pointer transition-colors",
                      formData.deliveryMethod === method.value
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                    data-testid={`option-delivery-${method.value}`}
                  >
                    <method.icon className={cn(
                      "w-6 h-6 mb-2",
                      formData.deliveryMethod === method.value ? "text-primary" : "text-gray-400"
                    )} />
                    <p className="font-medium text-gray-900">{method.label}</p>
                    <p className="text-sm text-gray-600">{method.description}</p>
                  </div>
                ))}
              </div>
              {allowed && (
                <p className="text-xs text-gray-500">Options filtered to your selected tier.</p>
              )}
            </>
          );
        })()}
        {errors.deliveryMethod && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.deliveryMethod}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="deliveryTimeframe">Delivery Timeframe</Label>
          <Input
            id="deliveryTimeframe"
            value={formData.deliveryTimeframe}
            onChange={(e) => updateField("deliveryTimeframe", e.target.value)}
            placeholder="e.g., 60 min, 2-3 days"
            data-testid="input-timeframe"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location (if in-person)</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => updateField("location", e.target.value)}
            placeholder="e.g., Paris, France"
            data-testid="input-location"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="price">Price (USD)</Label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={formData.price}
            onChange={(e) => updateField("price", e.target.value)}
            placeholder="0.00"
            className={cn("pl-10", errors.price ? "border-red-500" : "")}
            data-testid="input-price"
          />
        </div>
        {errors.price && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.price}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="revisionsIncluded">Revisions Included</Label>
        <Input
          id="revisionsIncluded"
          type="number"
          min="0"
          max="20"
          value={formData.revisionsIncluded}
          onChange={(e) => setFormData(prev => ({ ...prev, revisionsIncluded: parseInt(e.target.value) || 0 }))}
          placeholder="0"
          data-testid="input-revisions"
        />
        <p className="text-sm text-gray-500">Number of revision rounds included at no extra charge</p>
      </div>

      <Card className="border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-900">Pricing Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Research competitor pricing in your specialty
          </p>
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Consider your experience and expertise level
          </p>
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Factor in preparation time, not just delivery
          </p>
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Start competitive, adjust based on demand
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="requirements">Requirements from Client</Label>
        <Textarea
          id="requirements"
          value={formData.requirements}
          onChange={(e) => updateField("requirements", e.target.value)}
          placeholder="What information do you need from clients before the service?"
          rows={4}
          data-testid="input-requirements"
        />
        <p className="text-sm text-gray-500">e.g., Travel dates, budget range, preferences</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatIncluded">What is Included</Label>
        <Textarea
          id="whatIncluded"
          value={formData.whatIncluded}
          onChange={(e) => updateField("whatIncluded", e.target.value)}
          placeholder="List what clients will receive..."
          rows={4}
          data-testid="input-included"
        />
        <p className="text-sm text-gray-500">e.g., Detailed itinerary, booking links, local recommendations</p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
              <StickyNote className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-amber-900 text-sm">Include Expert Notes</p>
              <p className="text-xs text-amber-700">Add curated insider annotations to every itinerary stop</p>
            </div>
          </div>
          <Switch
            checked={formData.includesExpertNotes}
            onCheckedChange={(v) => setFormData(prev => ({ ...prev, includesExpertNotes: v }))}
            data-testid="switch-expert-notes"
          />
        </div>
        {formData.includesExpertNotes && (
          <p className="text-xs text-amber-800 border-t border-amber-200 pt-3">
            Clients will see a <strong>📝 Expert Notes included</strong> badge on your listing. You'll annotate each activity in your private workspace before sending the final plan.
          </p>
        )}
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle>{formData.serviceName || "Untitled Service"}</CardTitle>
          <CardDescription>{formData.description || "No description"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Service Tier</p>
              <p className="font-medium">
                {expertOfferingTypes.find(t => t.id === formData.expertOfferingTypeId)?.displayName || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Delivery Method</p>
              <p className="font-medium">
                {ALL_DELIVERY_METHODS.find(m => m.value === formData.deliveryMethod)?.label || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Price</p>
              <p className="font-medium text-green-600">${formData.price || "0"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Timeframe</p>
              <p className="font-medium">{formData.deliveryTimeframe || "Not specified"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Revisions</p>
              <p className="font-medium">{formData.revisionsIncluded} included</p>
            </div>
          </div>

          {formData.requirements && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Requirements</p>
              <p className="text-gray-700">{formData.requirements}</p>
            </div>
          )}

          {formData.whatIncluded && (
            <div>
              <p className="text-sm text-gray-500 mb-1">What is Included</p>
              <p className="text-gray-700">{formData.whatIncluded}</p>
            </div>
          )}

          {formData.includesExpertNotes && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <StickyNote className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800 font-medium">Expert Notes included</p>
            </div>
          )}

          {expertOfferingTypes.find(t => t.id === formData.expertOfferingTypeId)?.offeringTypeKey === "booking_concierge" && (
            <div className="flex items-start gap-3 px-3 py-3 rounded-lg bg-blue-50 border border-blue-200">
              <DollarSign className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-900 font-medium">Booking Concierge facilitation fee applies</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  A flat facilitation fee is added to each booking (admin-configurable, default $9.99). The standard 75/25 expert/platform split on your service price applies separately. // fee-literal-ok: UI description, fee resolves from config
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-yellow-600" />
        <p className="text-sm text-yellow-800">
          You can publish now or save as draft to edit later
        </p>
      </div>
    </div>
  );

  const renderChooseScreen = () => (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate("/expert/services")}
          className="mb-4"
          data-testid="button-back-to-services"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Services
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Create New Service</h1>
        <p className="text-gray-600 mt-1">Choose how you'd like to get started</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => setStartMode('template')}
          className="p-6 rounded-xl border-2 border-gray-200 hover:border-primary cursor-pointer transition-colors group"
          data-testid="option-start-from-template"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Start from a Template</h3>
          <p className="text-sm text-gray-600">
            Choose from platform-curated service templates. Pre-fills all details — ready to customize and publish in minutes.
          </p>
          <div className="mt-4 flex items-center text-primary text-sm font-medium">
            Browse templates <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </div>

        <div
          onClick={() => setStartMode('scratch')}
          className="p-6 rounded-xl border-2 border-gray-200 hover:border-primary cursor-pointer transition-colors group"
          data-testid="option-start-from-scratch"
        >
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
            <PenLine className="w-6 h-6 text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Start from Scratch</h3>
          <p className="text-sm text-gray-600">
            Build a fully custom service from the ground up. Set your own pricing, delivery method, and requirements.
          </p>
          <div className="mt-4 flex items-center text-gray-600 text-sm font-medium">
            Start wizard <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderTemplateScreen = () => (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          onClick={() => setStartMode('choose')}
          className="mb-4"
          data-testid="button-back-to-choose"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Choose a Template</h1>
        <p className="text-gray-600 mt-1">Select a platform-curated template to get started quickly</p>
      </div>

      {templatesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : serviceTemplates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="w-10 h-10 text-gray-400 mb-3" />
            <p className="font-medium text-gray-700">No templates available yet</p>
            <p className="text-sm text-gray-500 mt-1">Start from scratch to create your custom service</p>
            <Button className="mt-4 bg-primary" onClick={() => setStartMode('scratch')} data-testid="button-switch-to-scratch">
              Start from Scratch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {serviceTemplates.map((t) => (
            <Card key={t.id} className="border hover:border-primary transition-colors" data-testid={`card-template-${t.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  {t.suggestedPrice && (
                    <Badge variant="outline" className="shrink-0 text-green-700 border-green-200 bg-green-50">
                      ${t.suggestedPrice}
                    </Badge>
                  )}
                </div>
                {t.description && (
                  <CardDescription className="text-sm line-clamp-2">{t.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {t.serviceType && (
                    <Badge variant="secondary" className="text-xs capitalize">{t.serviceType}</Badge>
                  )}
                  {t.deliveryMethod && (
                    <Badge variant="secondary" className="text-xs capitalize">{t.deliveryMethod}</Badge>
                  )}
                  {t.deliveryTimeframe && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />{t.deliveryTimeframe}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => applyTemplateToForm(t)}
                    data-testid={`button-customize-template-${t.id}`}
                  >
                    <PenLine className="w-3 h-3 mr-1" /> Customize
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-primary"
                    onClick={() => createFromTemplateMutation.mutate(t.id)}
                    disabled={createFromTemplateMutation.isPending}
                    data-testid={`button-quick-create-${t.id}`}
                  >
                    <Zap className="w-3 h-3 mr-1" /> Quick Create
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  if (startMode === 'choose') {
    return (
      <ExpertLayout title="Create Service">
        <div className="p-6 max-w-3xl mx-auto">
          {renderChooseScreen()}
        </div>
      </ExpertLayout>
    );
  }

  if (startMode === 'template') {
    return (
      <ExpertLayout title="Create Service">
        <div className="p-6 max-w-3xl mx-auto">
          {renderTemplateScreen()}
        </div>
      </ExpertLayout>
    );
  }

  return (
    <ExpertLayout title="Create Service">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => setStartMode('choose')}
            className="mb-4"
            data-testid="button-back-to-services"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Create New Service</h1>
          <p className="text-gray-600">
            Step {currentStep} of {steps.length}: {steps[currentStep - 1].title}
          </p>
        </div>

        {renderStepIndicator()}

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{steps[currentStep - 1].title}</CardTitle>
            <CardDescription>{steps[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-6 gap-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            data-testid="button-wizard-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          <div className="flex items-center gap-3">
            {currentStep === steps.length ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(true)}
                  disabled={createMutation.isPending}
                  data-testid="button-save-draft"
                >
                  Save as Draft
                </Button>
                <Button
                  className="bg-primary "
                  onClick={() => handleSubmit(false)}
                  disabled={createMutation.isPending}
                  data-testid="button-publish-service"
                >
                  {createMutation.isPending ? "Publishing..." : "Publish Service"}
                </Button>
              </>
            ) : (
              <Button
                className="bg-primary "
                onClick={handleNext}
                data-testid="button-wizard-next"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </ExpertLayout>
  );
}
