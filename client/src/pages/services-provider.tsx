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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const steps = [
  { id: 1, title: "Business Info" },
  { id: 2, title: "Services" },
  { id: 3, title: "Details" },
  { id: 4, title: "Review" },
];

const serviceCategories = [
  "Hotels & Accommodations",
  "Restaurants & Dining",
  "Tours & Activities",
  "Transportation",
  "Event Venues",
  "Wellness & Spa",
  "Photography",
  "Catering",
  "Entertainment",
  "Equipment Rentals",
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
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    businessName: "",
    businessType: "",
    registrationNumber: "",
    taxId: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    country: "",
    serviceCategories: [] as string[],
    description: "",
    capacity: "",
    priceRange: "",
    amenities: "",
    hasInsurance: false,
    hasLicense: false,
    agreeToTerms: false,
  });

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

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsSubmitting(false);

    toast({
      title: "Registration submitted!",
      description: "We'll review your application and get back to you within 48-72 hours.",
    });

    setLocation("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between h-16">
            <Link href="/partner-with-us" className="flex items-center gap-2 text-[#6B7280] hover:text-[#111827]" data-testid="link-back">
              <ArrowLeft className="w-5 h-5" />
              Back
            </Link>
            <span className="font-semibold text-[#111827]">Service Provider Registration</span>
            <div className="w-20" />
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white border-b border-[#E5E7EB] py-4">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                    currentStep === step.id
                      ? "bg-[#FFE3E8] text-[#FF385C]"
                      : currentStep > step.id
                      ? "text-green-600"
                      : "text-[#9CA3AF]"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      currentStep === step.id
                        ? "bg-[#FF385C] text-white"
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

      <div className="container mx-auto px-4 max-w-2xl py-8">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step 1: Business Info */}
          {currentStep === 1 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827] flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-[#FF385C]" />
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
                    className="mt-2 h-12 border-[#E5E7EB]"
                    data-testid="input-business-name"
                  />
                </div>

                <div>
                  <Label className="text-[#374151]">Business Type</Label>
                  <Select
                    value={formData.businessType}
                    onValueChange={(v) => updateFormData("businessType", v)}
                  >
                    <SelectTrigger className="mt-2 h-12 border-[#E5E7EB]" data-testid="select-business-type">
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
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-registration"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Tax ID</Label>
                    <Input
                      value={formData.taxId}
                      onChange={(e) => updateFormData("taxId", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
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
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-email"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Phone</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateFormData("phone", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
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
                    className="mt-2 h-12 border-[#E5E7EB]"
                    data-testid="input-website"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Services */}
          {currentStep === 2 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Service Categories</CardTitle>
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
                            ? "border-[#FF385C] bg-[#FFE3E8]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        )}
                        data-testid={`button-category-${category.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        <span
                          className={cn(
                            "font-medium",
                            formData.serviceCategories.includes(category)
                              ? "text-[#FF385C]"
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
                    className="mt-2 border-[#E5E7EB]"
                    rows={5}
                    data-testid="textarea-description"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Details */}
          {currentStep === 3 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">
                  <MapPin className="w-6 h-6 text-[#FF385C] inline mr-2" />
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
                    className="mt-2 h-12 border-[#E5E7EB]"
                    data-testid="input-address"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => updateFormData("city", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-city"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => updateFormData("country", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
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
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-capacity"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Price Range</Label>
                    <Select
                      value={formData.priceRange}
                      onValueChange={(v) => updateFormData("priceRange", v)}
                    >
                      <SelectTrigger className="mt-2 h-12 border-[#E5E7EB]" data-testid="select-price-range">
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
                    className="mt-2 border-[#E5E7EB]"
                    rows={3}
                    data-testid="textarea-amenities"
                  />
                </div>

                <div className="space-y-3 pt-4 border-t border-[#E5E7EB]">
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
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Review Your Registration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[#6B7280]">Business Name:</span>
                    <span className="ml-2 text-[#111827] font-medium">{formData.businessName}</span>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Type:</span>
                    <span className="ml-2 text-[#111827] font-medium">{formData.businessType}</span>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Location:</span>
                    <span className="ml-2 text-[#111827] font-medium">
                      {formData.city}, {formData.country}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Contact:</span>
                    <span className="ml-2 text-[#111827] font-medium">{formData.email}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[#6B7280] text-sm">Service Categories:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formData.serviceCategories.map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-[#F3F4F6] rounded-lg">
                  <h4 className="font-medium text-[#111827] mb-2">Platform Benefits:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {benefits.map((benefit) => (
                      <div key={benefit.text} className="flex items-center gap-2 text-sm text-[#6B7280]">
                        <benefit.icon className="w-4 h-4 text-[#FF385C]" />
                        {benefit.text}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms"
                    checked={formData.agreeToTerms}
                    onCheckedChange={(checked) => updateFormData("agreeToTerms", checked)}
                    data-testid="checkbox-terms"
                  />
                  <label htmlFor="terms" className="text-sm text-[#6B7280]">
                    I agree to the{" "}
                    <Link href="/service-provider-terms" className="text-[#FF385C] underline">
                      Service Provider Terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy-policy" className="text-[#FF385C] underline">
                      Privacy Policy
                    </Link>
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
            className="border-[#E5E7EB]"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {currentStep < steps.length ? (
            <Button
              onClick={nextStep}
              className="bg-[#FF385C] hover:bg-[#E23350] text-white"
              data-testid="button-next"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!formData.agreeToTerms || isSubmitting}
              className="bg-[#FF385C] hover:bg-[#E23350] text-white"
              data-testid="button-submit"
            >
              {isSubmitting ? "Submitting..." : "Submit Registration"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
