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
  Upload,
  Globe,
  Languages,
  Award,
  DollarSign,
  Clock,
  Users,
  Star,
  Sparkles,
  Calendar,
  Briefcase,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const steps = [
  { id: 1, title: "Basic Info" },
  { id: 2, title: "Expertise" },
  { id: 3, title: "Services" },
  { id: 4, title: "Experience" },
  { id: 5, title: "Availability" },
  { id: 6, title: "Review" },
];

const expertSpecializationOptions = [
  { value: "budget_travel", label: "Budget Travel" },
  { value: "luxury_experiences", label: "Luxury Experiences" },
  { value: "adventure_outdoor", label: "Adventure & Outdoor" },
  { value: "cultural_immersion", label: "Cultural Immersion" },
  { value: "family_friendly", label: "Family Friendly" },
  { value: "solo_travel", label: "Solo Travel" },
  { value: "food_wine", label: "Food & Wine" },
  { value: "photography_tours", label: "Photography Tours" },
  { value: "honeymoon", label: "Honeymoon Planning" },
  { value: "wellness_retreat", label: "Wellness & Retreat" },
  { value: "group_travel", label: "Group Travel" },
  { value: "backpacking", label: "Backpacking" },
];

const destinations = [
  "Paris, France",
  "Tokyo, Japan",
  "Barcelona, Spain",
  "Bali, Indonesia",
  "New York, USA",
  "Rome, Italy",
  "Mumbai, India",
  "Sydney, Australia",
  "London, UK",
  "Dubai, UAE",
];

const specialties = [
  "Cultural Tours",
  "Adventure Travel",
  "Food & Wine",
  "Luxury Travel",
  "Budget Travel",
  "Wedding Planning",
  "Honeymoon Planning",
  "Family Vacations",
  "Solo Travel",
  "Business Travel",
  "Photography Tours",
  "Historical Tours",
];

const languages = [
  "English",
  "Spanish",
  "French",
  "Japanese",
  "Mandarin",
  "Hindi",
  "Portuguese",
  "German",
  "Italian",
  "Arabic",
  "Korean",
  "Russian",
];

const benefits = [
  { icon: DollarSign, text: "Earn $3,000-$10,000+/month" },
  { icon: Clock, text: "Set your own schedule" },
  { icon: Users, text: "Access to global travelers" },
  { icon: Sparkles, text: "AI-powered planning tools" },
];

export default function TravelExpertsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    destinations: [] as string[],
    specialties: [] as string[],
    languages: [] as string[],
    experienceTypes: [] as string[],
    specializations: [] as string[],
    selectedServices: [] as string[],
    yearsExperience: "",
    bio: "",
    portfolio: "",
    certifications: "",
    availability: "",
    responseTime: "",
    hourlyRate: "",
    agreeToTerms: false,
  });

  // Fetch experience types and service categories from API
  const { data: experienceTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/experience-types"],
  });

  const { data: serviceCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-service-categories"],
  });

  const updateFormData = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayItem = (key: string, item: string) => {
    const currentArray = formData[key as keyof typeof formData] as string[];
    if (currentArray.includes(item)) {
      updateFormData(
        key,
        currentArray.filter((i) => i !== item)
      );
    } else {
      updateFormData(key, [...currentArray, item]);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.firstName && formData.lastName && formData.email && formData.phone;
      case 2:
        return formData.destinations.length > 0 && formData.specialties.length > 0 && formData.languages.length > 0 && formData.experienceTypes.length > 0;
      case 3:
        return formData.selectedServices.length > 0;
      case 4:
        return formData.yearsExperience && formData.bio.length > 20;
      case 5:
        return formData.availability && formData.responseTime && formData.hourlyRate;
      case 6:
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
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        country: formData.country,
        city: formData.city,
        destinations: formData.destinations,
        specialties: formData.specialties,
        languages: formData.languages,
        experienceTypes: formData.experienceTypes,
        specializations: formData.specializations,
        selectedServices: formData.selectedServices,
        yearsOfExperience: formData.yearsExperience,
        bio: formData.bio,
        portfolio: formData.portfolio,
        certifications: formData.certifications,
        availability: formData.availability,
        responseTime: formData.responseTime,
        hourlyRate: formData.hourlyRate,
      };
      return apiRequest("/api/expert-application", {
        method: "POST",
        body: JSON.stringify(applicationData),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "Application submitted!",
        description: "We'll review your application and get back to you within 48 hours.",
      });
      setLocation("/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Submission failed",
        description: error.message || "There was an error submitting your application. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async () => {
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
      <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between h-16">
            <Link href="/partner-with-us" className="flex items-center gap-2 text-[#6B7280] hover:text-[#111827]" data-testid="link-back">
              <ArrowLeft className="w-5 h-5" />
              Back
            </Link>
            <span className="font-semibold text-[#111827]">Travel Expert Application</span>
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
                      "w-8 md:w-12 h-0.5 mx-2",
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
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">First Name</Label>
                    <Input
                      value={formData.firstName}
                      onChange={(e) => updateFormData("firstName", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Last Name</Label>
                    <Input
                      value={formData.lastName}
                      onChange={(e) => updateFormData("lastName", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => updateFormData("country", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-country"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => updateFormData("city", e.target.value)}
                      className="mt-2 h-12 border-[#E5E7EB]"
                      data-testid="input-city"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Expertise */}
          {currentStep === 2 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Your Expertise</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-[#374151] mb-3 block">
                    <Globe className="w-4 h-4 inline mr-2" />
                    Destinations You Cover (select all that apply)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((dest) => (
                      <Badge
                        key={dest}
                        variant={formData.destinations.includes(dest) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer px-3 py-2",
                          formData.destinations.includes(dest)
                            ? "bg-[#FF385C] hover:bg-[#E23350]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        )}
                        onClick={() => toggleArrayItem("destinations", dest)}
                        data-testid={`badge-destination-${dest.toLowerCase().replace(/[,\s]/g, "-")}`}
                      >
                        {dest}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151] mb-3 block">
                    <Award className="w-4 h-4 inline mr-2" />
                    Specialties (select all that apply)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {specialties.map((spec) => (
                      <Badge
                        key={spec}
                        variant={formData.specialties.includes(spec) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer px-3 py-2",
                          formData.specialties.includes(spec)
                            ? "bg-[#FF385C] hover:bg-[#E23350]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        )}
                        onClick={() => toggleArrayItem("specialties", spec)}
                        data-testid={`badge-specialty-${spec.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151] mb-3 block">
                    <Languages className="w-4 h-4 inline mr-2" />
                    Languages You Speak
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {languages.map((lang) => (
                      <Badge
                        key={lang}
                        variant={formData.languages.includes(lang) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer px-3 py-2",
                          formData.languages.includes(lang)
                            ? "bg-[#FF385C] hover:bg-[#E23350]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        )}
                        onClick={() => toggleArrayItem("languages", lang)}
                        data-testid={`badge-language-${lang.toLowerCase()}`}
                      >
                        {lang}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151] mb-3 block">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Experience Types You Can Plan (select all that apply)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {experienceTypes.map((exp: any) => (
                      <Badge
                        key={exp.id}
                        variant={formData.experienceTypes.includes(exp.id) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer px-3 py-2",
                          formData.experienceTypes.includes(exp.id)
                            ? "bg-[#FF385C] hover:bg-[#E23350]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        )}
                        onClick={() => toggleArrayItem("experienceTypes", exp.id)}
                        data-testid={`badge-experience-${exp.slug}`}
                      >
                        {exp.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151] mb-3 block">
                    <Star className="w-4 h-4 inline mr-2" />
                    Your Specializations
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {expertSpecializationOptions.map((spec) => (
                      <Badge
                        key={spec.value}
                        variant={formData.specializations.includes(spec.value) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer px-3 py-2",
                          formData.specializations.includes(spec.value)
                            ? "bg-[#FF385C] hover:bg-[#E23350]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        )}
                        onClick={() => toggleArrayItem("specializations", spec.value)}
                        data-testid={`badge-specialization-${spec.value}`}
                      >
                        {spec.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Services */}
          {currentStep === 3 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Services You Offer</CardTitle>
                <p className="text-[#6B7280] text-sm mt-1">Select the services you want to offer to travelers. You can set custom pricing later.</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {serviceCategories.map((category: any) => (
                  <div key={category.id}>
                    <Label className="text-[#374151] mb-3 block font-semibold">
                      <Briefcase className="w-4 h-4 inline mr-2" />
                      {category.name}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {category.offerings?.map((offering: any) => (
                        <Badge
                          key={offering.id}
                          variant={formData.selectedServices.includes(offering.id) ? "default" : "outline"}
                          className={cn(
                            "cursor-pointer px-3 py-2",
                            formData.selectedServices.includes(offering.id)
                              ? "bg-[#FF385C] hover:bg-[#E23350]"
                              : "border-[#E5E7EB] hover:border-[#FF385C]"
                          )}
                          onClick={() => toggleArrayItem("selectedServices", offering.id)}
                          data-testid={`badge-service-${offering.id}`}
                        >
                          {offering.name} - ${offering.price}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Experience */}
          {currentStep === 4 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Your Experience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-[#374151]">Years of Experience</Label>
                  <Select
                    value={formData.yearsExperience}
                    onValueChange={(v) => updateFormData("yearsExperience", v)}
                  >
                    <SelectTrigger className="mt-2 h-12 border-[#E5E7EB]" data-testid="select-experience">
                      <SelectValue placeholder="Select years of experience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-2">1-2 years</SelectItem>
                      <SelectItem value="3-5">3-5 years</SelectItem>
                      <SelectItem value="5-10">5-10 years</SelectItem>
                      <SelectItem value="10+">10+ years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[#374151]">Bio / About You</Label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) => updateFormData("bio", e.target.value)}
                    placeholder="Tell travelers about yourself, your passion for travel, and what makes you a great guide..."
                    className="mt-2 border-[#E5E7EB]"
                    rows={5}
                    data-testid="textarea-bio"
                  />
                </div>

                <div>
                  <Label className="text-[#374151]">Portfolio / Website (optional)</Label>
                  <Input
                    value={formData.portfolio}
                    onChange={(e) => updateFormData("portfolio", e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="mt-2 h-12 border-[#E5E7EB]"
                    data-testid="input-portfolio"
                  />
                </div>

                <div>
                  <Label className="text-[#374151]">Certifications / Qualifications</Label>
                  <Textarea
                    value={formData.certifications}
                    onChange={(e) => updateFormData("certifications", e.target.value)}
                    placeholder="List any relevant certifications, licenses, or qualifications..."
                    className="mt-2 border-[#E5E7EB]"
                    rows={3}
                    data-testid="textarea-certifications"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Availability */}
          {currentStep === 5 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Availability & Rates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-[#374151]">Weekly Availability</Label>
                  <Select
                    value={formData.availability}
                    onValueChange={(v) => updateFormData("availability", v)}
                  >
                    <SelectTrigger className="mt-2 h-12 border-[#E5E7EB]" data-testid="select-availability">
                      <SelectValue placeholder="Select your availability" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5-10">5-10 hours/week</SelectItem>
                      <SelectItem value="10-20">10-20 hours/week</SelectItem>
                      <SelectItem value="20-30">20-30 hours/week</SelectItem>
                      <SelectItem value="30+">30+ hours/week (Full-time)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[#374151]">Typical Response Time</Label>
                  <Select
                    value={formData.responseTime}
                    onValueChange={(v) => updateFormData("responseTime", v)}
                  >
                    <SelectTrigger className="mt-2 h-12 border-[#E5E7EB]" data-testid="select-response-time">
                      <SelectValue placeholder="Select response time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Within 1 hour</SelectItem>
                      <SelectItem value="2">Within 2 hours</SelectItem>
                      <SelectItem value="4">Within 4 hours</SelectItem>
                      <SelectItem value="24">Within 24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[#374151]">Desired Hourly Rate (USD)</Label>
                  <div className="relative mt-2">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="number"
                      value={formData.hourlyRate}
                      onChange={(e) => updateFormData("hourlyRate", e.target.value)}
                      placeholder="75"
                      className="pl-10 h-12 border-[#E5E7EB]"
                      data-testid="input-hourly-rate"
                    />
                  </div>
                  <p className="text-sm text-[#6B7280] mt-2">
                    Average expert rates: $50-150/hour depending on experience
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 6: Review */}
          {currentStep === 6 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Review Your Application</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[#6B7280]">Name:</span>
                    <span className="ml-2 text-[#111827] font-medium">
                      {formData.firstName} {formData.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Email:</span>
                    <span className="ml-2 text-[#111827] font-medium">{formData.email}</span>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Location:</span>
                    <span className="ml-2 text-[#111827] font-medium">
                      {formData.city}, {formData.country}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Experience:</span>
                    <span className="ml-2 text-[#111827] font-medium">
                      {formData.yearsExperience} years
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[#6B7280] text-sm">Destinations:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formData.destinations.map((d) => (
                      <Badge key={d} variant="secondary" className="text-xs">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[#6B7280] text-sm">Specialties:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formData.specialties.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-[#F3F4F6] rounded-lg">
                  <h4 className="font-medium text-[#111827] mb-2">Benefits You'll Get:</h4>
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
                    <Link href="/travel-expert-terms" className="text-[#FF385C] underline">
                      Travel Expert Terms
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
              disabled={!canProceed()}
              className="bg-[#FF385C] hover:bg-[#E23350] text-white"
              data-testid="button-next-step"
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
              {isSubmitting ? "Submitting..." : "Submit Application"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
