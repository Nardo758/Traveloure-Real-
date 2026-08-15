import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Upload,
  DollarSign,
  Users,
  Star,
  Shield,
  LogIn,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import {
  saveApplicationDraft,
  loadApplicationDraft,
  clearApplicationDraft,
  describeSubmitError,
} from "@/lib/application-draft";

// Namespaced so the expert and provider funnels' drafts never collide.
const DRAFT_KEY = "traveloure_provider_application_draft";

const steps = [
  { id: 1, title: "Business Info" },
  { id: 2, title: "Services" },
  { id: 3, title: "Details" },
  { id: 4, title: "Review" },
];

const serviceCategories = [
  "Lodging & Accommodation",
  "Tours & Experiences",
  "Transportation & Driving",
  "Photography & Videography",
  "Food & Culinary",
  "Music & Performance",
  "Entertainment",
  "Floral & Decoration",
  "Arts & Crafts Instruction",
  "Fitness & Wellness",
  "Beauty & Grooming",
  "Language & Translation",
  "Companionship & Assistance",
  "Childcare & Family",
  "Events & Celebrations",
  "Rental Services",
  "Cultural & Educational",
  "Attire & Fashion",
  "Business & Professional",
  "Safety & Security",
  "Technical Services",
  "Specialty & Unique Services",
  "Restaurants & Dining",
  "Technology & Connectivity",
  "Pets & Animals",
  "Custom / Other",
];

const businessTypes = [
  "Sole Proprietorship",
  "Partnership",
  "LLC",
  "Corporation",
  "Non-Profit",
];

const benefits = [
  { icon: Users, text: "Access to qualified travelers" },
  { icon: DollarSign, text: "Competitive commission rates" },
  { icon: Star, text: "Review and rating system" },
  { icon: Shield, text: "Secure payment processing" },
];

export default function ServicesProviderPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  // Restored below (with formData) from a saved draft, if a guest sign-in
  // redirect (or an expired-session retry) brought them back mid-wizard.
  const [currentStep, setCurrentStep] = useState(
    () => loadApplicationDraft<unknown>(DRAFT_KEY)?.currentStep || 1
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const _urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const _cityFromUrl = _urlParams.get('city') || '';
  const _countryFromUrl = _urlParams.get('country') || '';
  // Offering carried from /earn ("I do this →") — pre-selects this offering in
  // the application. offeringTypeKey is the one canonical param across both
  // signup paths (the legacy offeringType spelling is retired).
  const offeringKeyFromUrl = _urlParams.get('offeringTypeKey') || '';
  const offeringNameFromUrl = _urlParams.get('offeringName') || '';

  const defaultFormData = {
    businessName: "",
    businessType: "",
    registrationNumber: "",
    taxId: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: _cityFromUrl,
    country: _countryFromUrl,
    serviceCategories: [] as string[],
    description: "",
    capacity: "",
    priceRange: "",
    amenities: "",
    hasInsurance: false,
    hasLicense: false,
    agreeToTerms: false,
  };

  // Restore a guest's in-progress draft (saved right before we sent them to sign
  // in, or right before an unexpected 401 on submit) so a sign-in redirect or an
  // expired session never destroys their work. An already-signed-in user with no
  // draft gets the untouched defaults — no behavior change for them.
  const [savedDraft] = useState(() => loadApplicationDraft<typeof defaultFormData>(DRAFT_KEY));
  const [formData, setFormData] = useState(() =>
    savedDraft ? { ...defaultFormData, ...savedDraft.formData } : defaultFormData
  );

  const updateFormData = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCategory = (category: string) => {
    if (formData.serviceCategories.includes(category)) {
      updateFormData(
        "serviceCategories",
        formData.serviceCategories.filter((c) => c !== category)
      );
    } else {
      updateFormData("serviceCategories", [...formData.serviceCategories, category]);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.businessName && formData.businessType && formData.email && formData.phone;
      case 2:
        return formData.serviceCategories.length > 0 && formData.description.length > 20;
      case 3:
        return formData.address && formData.city && formData.country && formData.hasInsurance && formData.hasLicense;
      case 4:
        return formData.agreeToTerms;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!canProceed()) {
      toast({
        title: "Please complete all required fields",
        description: "Fill in all required information before continuing.",
        variant: "destructive",
      });
      return;
    }
    if (currentStep < steps.length) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const applicationData = {
        businessName: formData.businessName,
        name: formData.businessName,
        email: formData.email,
        mobile: formData.phone,
        country: formData.country,
        address: `${formData.address}, ${formData.city}`,
        businessType: formData.businessType,
        website: formData.website || undefined,
        gst: formData.registrationNumber || undefined,
        serviceOffers: offeringNameFromUrl
          ? Array.from(new Set([offeringNameFromUrl, ...formData.serviceCategories]))
          : formData.serviceCategories,
        // The /earn card's canonical selection (migration 107 column) — previously read from
        // the URL but never sent, leaving offering_type_key universally NULL and starving the
        // providers-by-offering count endpoint. Server clamps unknown keys to null.
        ...(offeringKeyFromUrl ? { offeringTypeKey: offeringKeyFromUrl } : {}),
        description: formData.description,
        termsAndConditions: formData.agreeToTerms,
        infoConfirmation: formData.hasLicense,
      };
      return apiRequest("POST", "/api/provider-application", applicationData);
    },
    onSuccess: () => {
      clearApplicationDraft(DRAFT_KEY);
      toast({
        title: "Registration submitted!",
        description: "We'll review your registration and follow up by email.",
      });
      // /provider-status is auth-only (no role required), so a fresh applicant
      // with no role yet can view it — unlike /dashboard, it acknowledges the
      // registration that was just submitted instead of ignoring it.
      setLocation("/provider-status");
    },
    onError: (error: any) => {
      const { title, description, isAuthError } = describeSubmitError(error);
      // Covers the race where a previously-signed-in applicant's session expired
      // mid-form: the draft is saved here (not just on the guest path below) so
      // the retry-after-sign-in still has everything they typed.
      if (isAuthError) {
        saveApplicationDraft(DRAFT_KEY, formData, currentStep);
      }
      toast({ title, description, variant: "destructive" });
      if (isAuthError) {
        openSignInModal({
          title: "Sign in to submit your registration",
          description: "We've saved everything you entered — sign in and submit will pick up right where you left off.",
          returnTo: window.location.pathname + window.location.search,
        });
      }
    },
  });

  const promptSignInToSubmit = () => {
    saveApplicationDraft(DRAFT_KEY, formData, currentStep);
    openSignInModal({
      title: "Sign in to submit your registration",
      description: "Create a free account or sign in — everything you've entered so far will still be here.",
      returnTo: window.location.pathname + window.location.search,
    });
  };

  const handleSubmit = async () => {
    // Ask up front rather than letting the request 401: a guest (or a signed-out
    // tab) never even reaches the server on submit.
    if (!isAuthenticated) {
      promptSignInToSubmit();
      return;
    }
    setIsSubmitting(true);
    try {
      await submitMutation.mutateAsync();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between h-16">
            <Link href="/earn" className="flex items-center gap-2 text-muted-foreground hover:text-foreground" data-testid="link-back">
              <ArrowLeft className="w-5 h-5" />
              Back
            </Link>
            <span className="font-semibold text-foreground">Service Provider Registration</span>
            <div className="w-20" />
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-border py-4">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                    currentStep === step.id
                      ? "bg-[#FFE3E8] text-primary"
                      : currentStep > step.id
                      ? "text-green-600"
                      : "text-[#9CA3AF]"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      currentStep === step.id
                        ? "bg-primary text-white"
                        : currentStep > step.id
                        ? "bg-green-100 text-green-600"
                        : "bg-[#F3F4F6] text-[#9CA3AF]"
                    )}
                  >
                    {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium">{step.title}</span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-12 md:w-20 h-0.5 mx-2",
                      currentStep > step.id ? "bg-green-300" : "bg-[#E5E7EB]"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 max-w-2xl py-8">
        {/* Ask up front, not after the work: a guest sees this the moment they
            land, before filling anything in. Non-blocking — they can still fill
            out the form as a guest, but submit routes through sign-in either way. */}
        {!isAuthLoading && !isAuthenticated && (
          <div
            className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-5"
            data-testid="banner-guest-sign-in"
          >
            <div className="flex items-start gap-3">
              <LogIn className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">You'll need an account to submit this registration</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Sign in or create a free account any time — everything you enter is saved, so you won't lose your progress.
                </p>
              </div>
            </div>
            <Button
              onClick={promptSignInToSubmit}
              className="bg-primary hover:bg-primary/90 text-white flex-shrink-0"
              data-testid="button-guest-sign-in"
            >
              Sign in
            </Button>
          </div>
        )}
        {offeringNameFromUrl && (
          <div
            className="mb-6 flex items-center gap-2 rounded-lg border border-[#2E8B8B]/30 bg-[#2E8B8B]/5 px-4 py-3 text-sm"
            data-testid="banner-preselected-offering"
            data-offering-type-key={offeringKeyFromUrl}
          >
            <Check className="w-4 h-4 text-[#2E8B8B] flex-shrink-0" />
            <span className="text-[#1F2733]">
              You're applying to offer: <span className="font-semibold">{offeringNameFromUrl}</span>
            </span>
          </div>
        )}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step 1: Business Info */}
          {currentStep === 1 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-primary" />
                  Business Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-[#374151]">Business Name</Label>
                  <Input
                    value={formData.businessName}
                    onChange={(e) => updateFormData("businessName", e.target.value)}
                    placeholder="Your Business Name"
                    className="mt-2 h-12 border-border"
                    data-testid="input-business-name"
                  />
                </div>

                <div>
                  <Label className="text-[#374151]">Business Type</Label>
                  <Select
                    value={formData.businessType}
                    onValueChange={(v) => updateFormData("businessType", v)}
                  >
                    <SelectTrigger className="mt-2 h-12 border-border" data-testid="select-business-type">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">Registration Number</Label>
                    <Input
                      value={formData.registrationNumber}
                      onChange={(e) => updateFormData("registrationNumber", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-registration"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Tax ID</Label>
                    <Input
                      value={formData.taxId}
                      onChange={(e) => updateFormData("taxId", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-tax-id"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateFormData("email", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-email"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Phone</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateFormData("phone", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-phone"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151]">Website (optional)</Label>
                  <Input
                    value={formData.website}
                    onChange={(e) => updateFormData("website", e.target.value)}
                    placeholder="https://yourbusiness.com"
                    className="mt-2 h-12 border-border"
                    data-testid="input-website"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Services */}
          {currentStep === 2 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Service Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-[#374151] mb-3 block">
                    Select all categories that apply to your business
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {serviceCategories.map((category) => (
                      <button
                        key={category}
                        onClick={() => toggleCategory(category)}
                        className={cn(
                          "p-4 rounded-lg border-2 text-left transition-all",
                          formData.serviceCategories.includes(category)
                            ? "border-primary bg-[#FFE3E8]"
                            : "border-border hover:border-primary"
                        )}
                        data-testid={`button-category-${category.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        <span
                          className={cn(
                            "font-medium",
                            formData.serviceCategories.includes(category)
                              ? "text-primary"
                              : "text-[#374151]"
                          )}
                        >
                          {category}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151]">Business Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => updateFormData("description", e.target.value)}
                    placeholder="Describe your business, services offered, and what makes you unique..."
                    className="mt-2 border-border"
                    rows={5}
                    data-testid="textarea-description"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Details */}
          {currentStep === 3 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">
                  <MapPin className="w-6 h-6 text-primary inline mr-2" />
                  Location & Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-[#374151]">Address</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => updateFormData("address", e.target.value)}
                    placeholder="Street address"
                    className="mt-2 h-12 border-border"
                    data-testid="input-address"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => updateFormData("city", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-city"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => updateFormData("country", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-country"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">Capacity (if applicable)</Label>
                    <Input
                      value={formData.capacity}
                      onChange={(e) => updateFormData("capacity", e.target.value)}
                      placeholder="e.g., 50 guests"
                      className="mt-2 h-12 border-border"
                      data-testid="input-capacity"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Price Range</Label>
                    <Select
                      value={formData.priceRange}
                      onValueChange={(v) => updateFormData("priceRange", v)}
                    >
                      <SelectTrigger className="mt-2 h-12 border-border" data-testid="select-price-range">
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="budget">Budget ($)</SelectItem>
                        <SelectItem value="moderate">Moderate ($$)</SelectItem>
                        <SelectItem value="upscale">Upscale ($$$)</SelectItem>
                        <SelectItem value="luxury">Luxury ($$$$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151]">Amenities / Features</Label>
                  <Textarea
                    value={formData.amenities}
                    onChange={(e) => updateFormData("amenities", e.target.value)}
                    placeholder="List key amenities, features, or services you offer..."
                    className="mt-2 border-border"
                    rows={3}
                    data-testid="textarea-amenities"
                  />
                </div>

                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="insurance"
                      checked={formData.hasInsurance}
                      onCheckedChange={(checked) => updateFormData("hasInsurance", checked)}
                      data-testid="checkbox-insurance"
                    />
                    <label htmlFor="insurance" className="text-sm text-[#374151]">
                      I have valid business liability insurance
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="license"
                      checked={formData.hasLicense}
                      onCheckedChange={(checked) => updateFormData("hasLicense", checked)}
                      data-testid="checkbox-license"
                    />
                    <label htmlFor="license" className="text-sm text-[#374151]">
                      I have all required business licenses and permits
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Review Your Registration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Business Name:</span>
                    <span className="ml-2 text-foreground font-medium">{formData.businessName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <span className="ml-2 text-foreground font-medium">{formData.businessType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location:</span>
                    <span className="ml-2 text-foreground font-medium">
                      {formData.city}, {formData.country}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Contact:</span>
                    <span className="ml-2 text-foreground font-medium">{formData.email}</span>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground text-sm">Service Categories:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formData.serviceCategories.map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-[#F3F4F6] rounded-lg">
                  <h4 className="font-medium text-foreground mb-2">Platform Benefits:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {benefits.map((benefit) => (
                      <div key={benefit.text} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <benefit.icon className="w-4 h-4 text-primary" />
                        {benefit.text}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Verification sequence notice — prompts the applicant so the post-approval
                    steps are not a surprise. Sequenced here (Phase 0.5) rather than as status-page
                    buttons only. */}
                <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-blue-800 dark:text-blue-300 text-sm">What happens after approval</h4>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                        Once your application is approved, you'll complete two quick steps before your first offering can go live:
                      </p>
                      <ol className="mt-2 space-y-1 text-xs text-blue-700 dark:text-blue-400 list-decimal list-inside">
                        <li><strong>Identity verification</strong> — verify your government-issued ID via Stripe Identity (passport, national ID, or driver's license).</li>
                        <li><strong>Connect onboarding</strong> — set up payouts and complete business verification via Stripe Connect. Stripe verifies your business during this flow.</li>
                      </ol>
                      <p className="text-xs text-blue-600 dark:text-blue-500 mt-2">Both steps are guided from your Provider Status page after approval.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms"
                    checked={formData.agreeToTerms}
                    onCheckedChange={(checked) => updateFormData("agreeToTerms", checked)}
                    data-testid="checkbox-terms"
                  />
                  <label htmlFor="terms" className="text-sm text-muted-foreground">
                    I agree to the{" "}
                    <a href="/terms#service-provider-requirements" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Service Provider Terms
                    </a>{" "}
                    and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Privacy Policy
                    </a>
                  </label>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="border-border"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {currentStep < steps.length ? (
            <Button
              onClick={nextStep}
              disabled={!canProceed()}
              className="bg-primary hover:bg-primary/90 text-white"
              data-testid="button-next-step"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!formData.agreeToTerms || isSubmitting}
              className="bg-primary hover:bg-primary/90 text-white"
              data-testid="button-submit"
            >
              {isSubmitting ? "Submitting..." : "Submit Registration"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
