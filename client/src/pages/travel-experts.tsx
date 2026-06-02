import { useState, useEffect } from "react";
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
import { SiFacebook, SiInstagram } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const defaultSteps = [
  { id: 1, title: "Basic Info" },
  { id: 2, title: "Expertise" },
  { id: 3, title: "Services" },
  { id: 4, title: "Experience" },
  { id: 5, title: "Availability" },
  { id: 6, title: "Review" },
];

const localExpertSteps = [
  { id: 1, title: "Basic Info" },
  { id: 2, title: "Your Locality" },
  { id: 3, title: "Knowledge Proof" },
  { id: 4, title: "Specialties" },
  { id: 5, title: "Services" },
  { id: 6, title: "Availability" },
  { id: 7, title: "Review" },
];

const KNOWLEDGE_PROOF_QUESTIONS = [
  "Name your top pick for a local meal near a popular tourist area in your city. Where do you send the traveler — and where do you steer them away from, and why?",
  "What's one mistake almost every first-time visitor to your city makes? What's the local move instead?",
  "Describe a neighbourhood or experience in your city that guidebooks consistently miss. Who is it best for, and what makes it worth knowing?",
];

const localityProofOptions = [
  { value: "born_raised", label: "Born & raised here" },
  { value: "long_term_10yr", label: "Long-term resident (10+ years)" },
  { value: "resident_5yr", label: "Resident (5+ years)" },
  { value: "current_resident", label: "Current resident (1–5 years)" },
];

const localSpecialtyOptions = [
  { value: "food_drink", label: "Food & Drink", emoji: "🍜" },
  { value: "safety_navigation", label: "Safety & Navigation", emoji: "🧭" },
  { value: "cultural_interpretation", label: "Cultural Interpretation", emoji: "🎭" },
  { value: "nightlife", label: "Nightlife", emoji: "🌙" },
  { value: "family_travel", label: "Family Travel", emoji: "👨‍👩‍👧" },
  { value: "lgbtq_friendly", label: "LGBTQ+ Friendly", emoji: "🏳️‍🌈" },
  { value: "budget_tips", label: "Budget Tips", emoji: "💰" },
  { value: "luxury_access", label: "Luxury Access", emoji: "✨" },
  { value: "photography_spots", label: "Photography Spots", emoji: "📸" },
  { value: "hidden_gems", label: "Hidden Gems", emoji: "💎" },
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
  const [socialAuthConnected, setSocialAuthConnected] = useState(false);
  const [neighborhoodInput, setNeighborhoodInput] = useState("");
  
  // Check for influencer, auth, and expert type query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const influencerFromUrl = urlParams.get('influencer') === 'true';
  const authFromUrl = urlParams.get('auth');
  const expertTypeFromUrl = urlParams.get('type') || 'travel_expert';
  
  // Map expert type to display title
  const isLocalExpert = expertTypeFromUrl === "local_expert";
  const steps = isLocalExpert ? localExpertSteps : defaultSteps;

  const expertTypeTitles: Record<string, string> = {
    travel_expert: "Travel Expert",
    local_expert: "Local Expert",
    event_planner: "Event Planner",
    executive_assistant: "Executive Assistant",
  };
  const expertTypeTitle = expertTypeTitles[expertTypeFromUrl] || "Travel Expert";
  
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
    expertType: expertTypeFromUrl,
    agreeToTerms: false,
    // Local Expert specific fields
    neighborhoods: [] as string[],
    localityProof: "",
    knowledgeProofAnswers: ["", "", ""] as string[],
    localSpecialties: [] as string[],
    // Influencer fields
    isInfluencer: influencerFromUrl,
    instagramLink: "",
    tiktokLink: "",
    youtubeLink: "",
    instagramFollowers: "",
    tiktokFollowers: "",
    youtubeFollowers: "",
  });

  // Fetch user data if authenticated via social login
  const { data: userData } = useQuery<any>({
    queryKey: ["/api/auth/user"],
    enabled: authFromUrl === 'facebook',
    retry: false,
  });

  // Fetch Instagram data if available
  const { data: instagramData } = useQuery<any>({
    queryKey: ["/api/auth/instagram-data"],
    enabled: authFromUrl === 'facebook',
    retry: false,
  });

  // Auto-fill form with social auth data
  useEffect(() => {
    if (userData && authFromUrl === 'facebook') {
      setFormData(prev => ({
        ...prev,
        firstName: prev.firstName || userData.firstName || "",
        lastName: prev.lastName || userData.lastName || "",
        email: prev.email || userData.email || "",
        isInfluencer: true,
      }));
      setSocialAuthConnected(true);
      
      toast({
        title: "Account Connected",
        description: "Your social account has been linked successfully!",
      });
    }
  }, [userData, authFromUrl, toast]);

  // Auto-fill Instagram data
  useEffect(() => {
    if (instagramData?.connected) {
      setFormData(prev => ({
        ...prev,
        instagramLink: prev.instagramLink || `https://instagram.com/${instagramData.username}`,
        instagramFollowers: prev.instagramFollowers || String(instagramData.followers_count || ""),
      }));
      
      toast({
        title: "Instagram Verified",
        description: `@${instagramData.username} connected with ${instagramData.followers_count?.toLocaleString()} followers`,
      });
    }
  }, [instagramData, toast]);

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
    if (isLocalExpert) {
      switch (currentStep) {
        case 1:
          return formData.firstName && formData.lastName && formData.email && formData.phone;
        case 2:
          return !!(formData.city && formData.neighborhoods.length > 0 && formData.localityProof && formData.languages.length > 0);
        case 3:
          return formData.knowledgeProofAnswers.every(a => a.trim().split(/\s+/).filter(w => w.length > 0).length >= 50);
        case 4:
          return formData.localSpecialties.length > 0;
        case 5:
          return formData.selectedServices.length > 0;
        case 6:
          return !!(formData.availability && formData.responseTime && formData.hourlyRate);
        case 7:
          return formData.agreeToTerms;
        default:
          return true;
      }
    }
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
      // First, record terms acceptance if user is authenticated
      if (formData.agreeToTerms) {
        try {
          await apiRequest("POST", "/api/auth/accept-terms", {
            acceptTerms: true,
            acceptPrivacy: true,
          });
        } catch (error) {
          console.log("Terms acceptance recorded (or user not authenticated)");
        }
      }

      // Build social followers object if influencer
      const socialFollowers = formData.isInfluencer ? {
        instagram: formData.instagramFollowers ? parseInt(formData.instagramFollowers) : 0,
        tiktok: formData.tiktokFollowers ? parseInt(formData.tiktokFollowers) : 0,
        youtube: formData.youtubeFollowers ? parseInt(formData.youtubeFollowers) : 0,
      } : {};

      const applicationData = {
        expertType: formData.expertType,
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
        // Local Expert specific fields
        neighborhoods: formData.neighborhoods,
        localityProof: formData.localityProof,
        knowledgeProofAnswers: KNOWLEDGE_PROOF_QUESTIONS.map((q, i) => ({
          question: q,
          answer: formData.knowledgeProofAnswers[i] || "",
        })),
        localSpecialties: formData.localSpecialties,
        // Influencer fields
        isInfluencer: formData.isInfluencer,
        instagramLink: formData.instagramLink,
        tiktokLink: formData.tiktokLink,
        youtubeLink: formData.youtubeLink,
        socialFollowers,
      };
      return apiRequest("POST", "/api/expert-application", applicationData);
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
            <span className="font-semibold text-[#111827]">{expertTypeTitle} Application</span>
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
                {/* Quick Social Sign-In */}
                {socialAuthConnected ? (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-5 h-5 text-green-600" />
                      <p className="font-semibold text-green-700 dark:text-green-400">
                        Social Account Connected
                      </p>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-500">
                      Your information has been auto-filled from your social account.
                      {instagramData?.connected && (
                        <span className="block mt-1">
                          <Badge variant="secondary" className="mt-2">
                            <SiInstagram className="w-3 h-3 mr-1" />
                            @{instagramData.username} - {instagramData.followers_count?.toLocaleString()} followers
                          </Badge>
                        </span>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-[#1877F2]/5 via-[#E1306C]/5 to-[#833AB4]/5 rounded-lg p-5 border border-[#E5E7EB]">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <p className="font-semibold text-foreground">
                        Quick Sign-In with Social Media
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Sign in with your social account to auto-fill your information and verify your profile faster.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="bg-[#1877F2] hover:bg-[#166FE5] text-white border-none"
                        onClick={() => window.location.href = '/api/auth/facebook'}
                        data-testid="button-facebook-login-top"
                      >
                        <SiFacebook className="w-4 h-4 mr-2" />
                        Continue with Facebook
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] hover:opacity-90 text-white border-none"
                        onClick={() => window.location.href = '/api/auth/facebook'}
                        data-testid="button-instagram-login-top"
                      >
                        <SiInstagram className="w-4 h-4 mr-2" />
                        Continue with Instagram
                      </Button>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or fill in manually</span>
                  </div>
                </div>

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

                {/* Influencer Section - Only shown when arriving via influencer program link */}
                {influencerFromUrl && (
                  <div className="border-t pt-6 mt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Badge className="bg-[#FF385C] text-white">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Influencer Program
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        Get a verified creator badge and earn referral commissions
                      </p>
                    </div>
                    <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                      <p className="text-sm text-muted-foreground mb-4">
                        Share your social media profiles. We'll verify your creator status and enable referral tracking.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[#374151]">Instagram Profile</Label>
                          <Input
                            value={formData.instagramLink}
                            onChange={(e) => updateFormData("instagramLink", e.target.value)}
                            placeholder="https://instagram.com/yourhandle"
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-instagram-link"
                          />
                        </div>
                        <div>
                          <Label className="text-[#374151]">Instagram Followers</Label>
                          <Input
                            value={formData.instagramFollowers}
                            onChange={(e) => updateFormData("instagramFollowers", e.target.value)}
                            placeholder="e.g. 50000"
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-instagram-followers"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[#374151]">TikTok Profile</Label>
                          <Input
                            value={formData.tiktokLink}
                            onChange={(e) => updateFormData("tiktokLink", e.target.value)}
                            placeholder="https://tiktok.com/@yourhandle"
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-tiktok-link"
                          />
                        </div>
                        <div>
                          <Label className="text-[#374151]">TikTok Followers</Label>
                          <Input
                            value={formData.tiktokFollowers}
                            onChange={(e) => updateFormData("tiktokFollowers", e.target.value)}
                            placeholder="e.g. 100000"
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-tiktok-followers"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-[#374151]">YouTube Channel</Label>
                          <Input
                            value={formData.youtubeLink}
                            onChange={(e) => updateFormData("youtubeLink", e.target.value)}
                            placeholder="https://youtube.com/@yourchannel"
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-youtube-link"
                          />
                        </div>
                        <div>
                          <Label className="text-[#374151]">YouTube Subscribers</Label>
                          <Input
                            value={formData.youtubeFollowers}
                            onChange={(e) => updateFormData("youtubeFollowers", e.target.value)}
                            placeholder="e.g. 25000"
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-youtube-followers"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 2 (Local Expert): Your Locality */}
          {isLocalExpert && currentStep === 2 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Your Local Knowledge</CardTitle>
                <p className="text-[#6B7280] text-sm mt-1">
                  Tell us exactly where your expertise lives — not just the city, but the neighbourhoods you know block by block.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* City */}
                <div>
                  <Label className="text-[#374151]">Primary City of Expertise <span className="text-red-500">*</span></Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => updateFormData("city", e.target.value)}
                    placeholder="e.g. Tokyo, Barcelona, Mumbai"
                    className="mt-2 h-12 border-[#E5E7EB]"
                    data-testid="input-local-city"
                  />
                </div>

                {/* Neighbourhoods tag input */}
                <div>
                  <Label className="text-[#374151] mb-1 block">
                    Neighbourhoods You Know Deeply <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-xs text-[#6B7280] mb-2">
                    Be specific — not "Tokyo" but "Shimokitazawa, Kōenji, Yanaka". Press <kbd className="px-1 py-0.5 rounded bg-gray-100 text-xs">Enter</kbd> or comma to add each one.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.neighborhoods.map((n) => (
                      <Badge key={n} className="bg-[#FF385C] text-white gap-1 pr-1" data-testid={`badge-neighborhood-${n}`}>
                        {n}
                        <button
                          type="button"
                          onClick={() => updateFormData("neighborhoods", formData.neighborhoods.filter(x => x !== n))}
                          className="ml-1 rounded-full hover:bg-white/20 p-0.5"
                          aria-label={`Remove ${n}`}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Input
                    value={neighborhoodInput}
                    onChange={(e) => setNeighborhoodInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && neighborhoodInput.trim()) {
                        e.preventDefault();
                        const val = neighborhoodInput.trim().replace(/,$/, "");
                        if (val && !formData.neighborhoods.includes(val)) {
                          updateFormData("neighborhoods", [...formData.neighborhoods, val]);
                        }
                        setNeighborhoodInput("");
                      }
                    }}
                    onBlur={() => {
                      if (neighborhoodInput.trim()) {
                        const val = neighborhoodInput.trim().replace(/,$/, "");
                        if (val && !formData.neighborhoods.includes(val)) {
                          updateFormData("neighborhoods", [...formData.neighborhoods, val]);
                        }
                        setNeighborhoodInput("");
                      }
                    }}
                    placeholder="Type a neighbourhood and press Enter…"
                    className="h-12 border-[#E5E7EB]"
                    data-testid="input-neighborhood"
                  />
                </div>

                {/* How are you local? */}
                <div>
                  <Label className="text-[#374151] mb-3 block">
                    How are you local? <span className="text-red-500">*</span>
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {localityProofOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateFormData("localityProof", opt.value)}
                        className={cn(
                          "px-4 py-3 rounded-lg border text-sm text-left transition-colors",
                          formData.localityProof === opt.value
                            ? "border-[#FF385C] bg-[#FFE3E8] text-[#FF385C] font-medium"
                            : "border-[#E5E7EB] hover:border-[#FF385C] text-[#374151]"
                        )}
                        data-testid={`button-locality-${opt.value}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Languages */}
                <div>
                  <Label className="text-[#374151] mb-3 block">
                    <Languages className="w-4 h-4 inline mr-2" />
                    Languages You Speak <span className="text-red-500">*</span>
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
              </CardContent>
            </Card>
          )}

          {/* Step 3 (Local Expert): Knowledge Proof */}
          {isLocalExpert && currentStep === 3 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Knowledge Proof</CardTitle>
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>Be specific.</strong> Vague answers that could come from a guidebook won't pass review. Our team is looking for the kind of insight only a real local can give — including where to avoid and why.
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {KNOWLEDGE_PROOF_QUESTIONS.map((question, i) => (
                  <div key={i}>
                    <Label className="text-[#374151] mb-2 block font-medium">
                      {i + 1}. {question}
                    </Label>
                    <Textarea
                      value={formData.knowledgeProofAnswers[i]}
                      onChange={(e) => {
                        const updated = [...formData.knowledgeProofAnswers];
                        updated[i] = e.target.value;
                        updateFormData("knowledgeProofAnswers", updated);
                      }}
                      placeholder="Write your answer here — be specific, name real places, and explain your reasoning…"
                      className="border-[#E5E7EB]"
                      rows={5}
                      data-testid={`textarea-knowledge-proof-${i}`}
                    />
                    {(() => {
                      const words = formData.knowledgeProofAnswers[i].trim().split(/\s+/).filter(w => w.length > 0).length;
                      const hasMinimum = words >= 50;
                      return (
                        <p className={cn("text-xs mt-1 text-right", hasMinimum ? "text-green-600" : "text-[#9CA3AF]")}>
                          {words} words
                          {!hasMinimum && " — minimum 50 words to continue"}
                          {hasMinimum && words < 150 && " — aim for 150 words for best results"}
                          {words >= 150 && " ✓ Great detail"}
                        </p>
                      );
                    })()}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Step 4 (Local Expert): Specialties */}
          {isLocalExpert && currentStep === 4 && (
            <Card className="border-[#E5E7EB]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#111827]">Your Local Specialties</CardTitle>
                <p className="text-[#6B7280] text-sm mt-1">
                  Select the areas where you have genuine insider knowledge. These feed directly into how travellers find you.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-[#374151] mb-3 block">Knowledge Areas <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {localSpecialtyOptions.map((opt) => {
                      const selected = formData.localSpecialties.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleArrayItem("localSpecialties", opt.value)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-sm transition-colors",
                            selected
                              ? "border-[#FF385C] bg-[#FFE3E8] text-[#FF385C] font-medium"
                              : "border-[#E5E7EB] hover:border-[#FF385C] text-[#374151]"
                          )}
                          data-testid={`button-local-specialty-${opt.value}`}
                        >
                          <span className="text-xl">{opt.emoji}</span>
                          <span className="text-xs text-center leading-tight">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-[#374151] mb-3 block">Traveller Types You Serve Best</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Solo travellers", "Couples", "Families", "Groups", "Business travellers"].map((type) => (
                      <Badge
                        key={type}
                        variant={formData.experienceTypes.includes(type) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer px-3 py-2",
                          formData.experienceTypes.includes(type)
                            ? "bg-[#FF385C] hover:bg-[#E23350]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        )}
                        onClick={() => toggleArrayItem("experienceTypes", type)}
                        data-testid={`badge-traveller-type-${type.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Expertise */}
          {!isLocalExpert && currentStep === 2 && (
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

          {/* Step 3/5: Services */}
          {((!isLocalExpert && currentStep === 3) || (isLocalExpert && currentStep === 5)) && (
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

          {/* Step 4: Experience (travel/event experts only) */}
          {!isLocalExpert && currentStep === 4 && (
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

          {/* Step 5/6: Availability */}
          {((!isLocalExpert && currentStep === 5) || (isLocalExpert && currentStep === 6)) && (
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

          {/* Step 6/7: Review */}
          {((!isLocalExpert && currentStep === 6) || (isLocalExpert && currentStep === 7)) && (
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

                {isLocalExpert ? (
                  <>
                    <div>
                      <span className="text-[#6B7280] text-sm">Neighbourhoods:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.neighborhoods.map((n) => (
                          <Badge key={n} variant="secondary" className="text-xs">{n}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#6B7280] text-sm">Local Specialties:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.localSpecialties.map((s) => {
                          const opt = localSpecialtyOptions.find(o => o.value === s);
                          return (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {opt?.emoji} {opt?.label ?? s}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#6B7280] text-sm">Services Offered:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.selectedServices.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className="text-[#6B7280] text-sm block">Knowledge Proof (summary):</span>
                      {formData.knowledgeProofAnswers.map((ans, i) => (
                        ans.trim().length > 0 && (
                          <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm">
                            <p className="font-medium text-[#374151] mb-1">Q{i + 1}: {KNOWLEDGE_PROOF_QUESTIONS[i].slice(0, 60)}…</p>
                            <p className="text-[#6B7280] italic">"{ans.trim().slice(0, 120)}{ans.trim().length > 120 ? "…" : ""}"</p>
                          </div>
                        )
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-[#6B7280] text-sm">Destinations:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.destinations.map((d) => (
                          <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#6B7280] text-sm">Specialties:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.specialties.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

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
                    <a 
                      href={influencerFromUrl ? "/terms#influencer-terms" : "/terms#expert-terms"} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-[#FF385C] underline"
                    >
                      {influencerFromUrl ? "Influencer Program Terms" : "Travel Expert Terms"}
                    </a>{" "}
                    and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#FF385C] underline">
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
