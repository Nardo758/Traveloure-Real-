import { useState, useEffect, useMemo } from "react";
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
  CalendarHeart,
  Briefcase,
  XCircle,
  AlertTriangle,
  RefreshCw,
  LogIn,
} from "lucide-react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { CLAIM_PROMPTS, type Daypart } from "@shared/neighborhood-claims";
import { expertSpecializationEnum } from "@shared/schema";
import { OPERATING_MARKET_DESTINATIONS } from "@shared/operating-markets";
import { EXPERT_SPECIALIZATION_LABELS, LOCAL_SPECIALTY_OPTIONS } from "@shared/expert-vocabulary";
import { isEventPlannerOfferingKey } from "@/lib/earn-roles";
import {
  ClaimCaptureForm,
  captureCompleteness,
  captureHasContent,
  emptyCapture,
  toSubmitPayload,
  type CaptureDraft,
} from "@/components/neighborhood-claims/claim-capture-form";
import {
  saveApplicationDraft,
  loadApplicationDraft,
  clearApplicationDraft,
  describeSubmitError,
} from "@/lib/application-draft";

// Namespaced so the expert and provider funnels' drafts never collide.
const DRAFT_KEY = "traveloure_expert_application_draft";

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

// Gap 7 (ledger `2026-09-04-earn-contained-fixes`): this vocabulary moved to
// `shared/expert-vocabulary.ts`. It is REQUIRED here and is now also rendered on the expert's
// public profile and in the admin review queue, so a copy per surface is the drift class
// §18 rule 1 names. The wizard reads the same list every reader does.
const localSpecialtyOptions = LOCAL_SPECIALTY_OPTIONS;

// Gap 8: the picker's labels ARE the labels every reader now renders these slugs with
// (`shared/expert-vocabulary.ts`). Derived from the enum so the picker cannot offer a value
// the readers do not know, and cannot omit one they do.
const expertSpecializationOptions = expertSpecializationEnum.map((value) => ({
  value,
  label: EXPERT_SPECIALIZATION_LABELS[value],
}));

/**
 * Gap 6: the ten hardcoded world cities are GONE. Kyoto — the flagship launch market — was
 * not among them, so an applicant could not state the one destination the platform most needs
 * covered, while seven of the ten (Paris, Dubai, Sydney, Bali, New York, Rome, Barcelona) are
 * places Traveloure does not operate in at all. The list now IS the operating-market config,
 * which that module's own header says is why it lives in `shared/` (no second city list).
 *
 * The step says out loud that these are the markets we operate in today — offering only these
 * without saying so would imply the list is the world (§13).
 */
const destinations = OPERATING_MARKET_DESTINATIONS;

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
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  // Restored below (with formData) from a saved draft, if a guest sign-in
  // redirect (or an expired-session retry) brought them back mid-wizard.
  const [currentStep, setCurrentStep] = useState(
    () => loadApplicationDraft<unknown>(DRAFT_KEY)?.currentStep || 1
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialAuthConnected, setSocialAuthConnected] = useState(false);
  
  // Check for influencer, auth, and expert type query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const influencerFromUrl = urlParams.get('influencer') === 'true';
  const authFromUrl = urlParams.get('auth');
  const expertTypeFromUrl = urlParams.get('type') || 'travel_expert';
  const cityFromUrl = urlParams.get('city') || '';
  const countryFromUrl = urlParams.get('country') || '';
  // Gap 15 (ledger `2026-09-04-earn-contained-fixes`): the Discover "Wanted here" slot has
  // always carried `?neighborhood=` and this page has always ignored it, so someone recruited
  // FROM Gion arrived at a claim picker with nothing selected. Preselected below, by NAME
  // match against the city's own `city_neighborhoods` rows — never by creating a row and never
  // by trusting the string (§13: a name the catalog does not hold selects nothing).
  const neighborhoodFromUrl = urlParams.get('neighborhood') || '';
  // Offering carried from /earn ("I do this →") — pre-selects this offering in the application.
  const offeringKeyFromUrl = urlParams.get('offeringTypeKey') || '';
  const offeringNameFromUrl = urlParams.get('offeringName') || '';
  
  // Map expert type to display title
  const isLocalExpert = expertTypeFromUrl === "local_expert";
  // The Event Planner track (ledger `2026-09-04-earn-planner-roles`, CLAUDE.md Locked Decision 36).
  // Its planner ROLE is a real `expert_offering_types` row (migration 283) and this wizard is the
  // only place it gets chosen — before this, the door carried a PROVIDER-catalog key that the
  // migration-107 FK could not hold, so `storage.createLocalExpertForm` clamped it to NULL and
  // nothing recorded what the applicant plans.
  const isEventPlanner = expertTypeFromUrl === "event_planner";
  const steps = isLocalExpert ? localExpertSteps : defaultSteps;

  const expertTypeTitles: Record<string, string> = {
    travel_expert: "Trip Planner",
    local_expert: "Local Expert",
    event_planner: "Event Planner",
    executive_assistant: "Executive Assistant",
  };
  const expertTypeTitle = expertTypeTitles[expertTypeFromUrl] || "Trip Planner";
  
  const defaultFormData = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: countryFromUrl,
    city: cityFromUrl,
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
    // Event Planner only: the chosen `expert_offering_types.offering_type_key`. Empty means NOT
    // CHOSEN — never a default (§13). Pre-filled below only when the /earn link carried a key that
    // the expert catalog actually holds.
    plannerOfferingKey: "",
    agreeToTerms: false,
    // Local Expert specific fields
    neighborhoods: [] as string[],
    // Field-knowledge claims (ruling 2026-08-29-neighborhood-claims): picked from city_neighborhoods,
    // never free-typed. `neighborhoods` above stays in sync (names) for local_expert_forms.
    neighborhoodClaims: [] as { neighborhoodId: string; name: string; daypart: Daypart }[],
    neighborhoodCapture: null as CaptureDraft | null,
    neighborhoodConsent: false,
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
  };

  // Restore a guest's in-progress draft (saved right before we sent them to sign
  // in, or right before an unexpected 401 on submit) so a sign-in redirect or an
  // expired session never destroys their work. An already-signed-in user with no
  // draft gets the untouched defaults — no behavior change for them.
  const [savedDraft] = useState(() => loadApplicationDraft<typeof defaultFormData>(DRAFT_KEY));
  const [formData, setFormData] = useState(() =>
    savedDraft ? { ...defaultFormData, ...savedDraft.formData } : defaultFormData
  );

  // Field-knowledge picker source: the public city_neighborhoods catalog (guests fill this form
  // before signing in, so the authenticated options endpoint can't be used here). Filtered by the
  // typed city, case-insensitively. An empty result is the honest D5 state: the step is skippable.
  const { data: cityNeighborhoodsData } = useQuery<{ data: Array<{ id: string; city: string; country: string; name: string; slug: string; defaultDaypart: string | null }> }>({
    queryKey: ["/api/city-neighborhoods", "all"],
    queryFn: async () => {
      const res = await fetch("/api/city-neighborhoods?limit=200", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load neighborhoods");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: isLocalExpert,
  });
  const neighborhoodOptions = useMemo(() => {
    const c = formData.city.trim().toLowerCase();
    if (!c) return [] as Array<{ id: string; name: string; slug: string; daypart: Daypart }>;
    return (cityNeighborhoodsData?.data ?? [])
      .filter((n) => n.city.trim().toLowerCase() === c)
      .map((n) => ({ id: n.id, name: n.name, slug: n.slug, daypart: ((n.defaultDaypart as Daypart | null) ?? "evening") }));
  }, [cityNeighborhoodsData, formData.city]);
  const toggleNeighborhoodClaim = (opt: { id: string; name: string; daypart: Daypart }) => {
    const has = formData.neighborhoodClaims.some((c) => c.neighborhoodId === opt.id);
    const nextClaims = has
      ? formData.neighborhoodClaims.filter((c) => c.neighborhoodId !== opt.id)
      : [...formData.neighborhoodClaims, { neighborhoodId: opt.id, name: opt.name, daypart: opt.daypart }];
    setFormData((prev) => ({ ...prev, neighborhoodClaims: nextClaims, neighborhoods: nextClaims.map((c) => c.name) }));
  };
  const firstClaim = formData.neighborhoodClaims[0] ?? null;

  // Gap 15: preselect the neighbourhood the recruitment link named, ONCE, and only when the
  // city's catalog actually holds a row with that name (case-insensitive, trimmed). A link
  // naming a neighbourhood this city has no row for selects NOTHING and the applicant simply
  // picks — a claim is born only from a real `city_neighborhoods` row (Locked Decision 27),
  // never from a query string. Skipped entirely once the applicant has picked anything, so a
  // restored draft or a deliberate deselection is never overwritten.
  useEffect(() => {
    if (!isLocalExpert || !neighborhoodFromUrl) return;
    if (formData.neighborhoodClaims.length > 0 || neighborhoodOptions.length === 0) return;
    const wanted = neighborhoodFromUrl.trim().toLowerCase();
    const match = neighborhoodOptions.find((o) => o.name.trim().toLowerCase() === wanted);
    if (!match) return;
    setFormData((prev) => ({
      ...prev,
      neighborhoodClaims: [{ neighborhoodId: match.id, name: match.name, daypart: match.daypart }],
      neighborhoods: [match.name],
    }));
  }, [isLocalExpert, neighborhoodFromUrl, neighborhoodOptions, formData.neighborhoodClaims.length]);

  // Event Planner role picker source: the EXPERT catalog, read live from the same public endpoint
  // /earn reads, then narrowed by the ONE partition list (EVENT_PLANNER_OFFERING_KEYS). The list is
  // the only thing restated here; the rows, their names and their order all come from the server —
  // a hardcoded copy of the six would be wrong the day an admin renames one.
  const { data: expertOfferingRows, isLoading: loadingPlannerRoles, isError: plannerRolesFailed } = useQuery<
    Array<{ offering_type_key: string; display_name: string; tagline: string | null }>
  >({
    queryKey: ["/api/offering-types/experts", "event-planner"],
    queryFn: async () => {
      const res = await fetch("/api/offering-types/experts?tier=coordination", { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load planner roles");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: isEventPlanner,
  });
  const plannerRoleOptions = useMemo(
    () => (expertOfferingRows ?? []).filter((o) => isEventPlannerOfferingKey(o.offering_type_key)),
    [expertOfferingRows],
  );
  // Preselect ONLY the offering that actually brought them here — and only once the catalog has
  // confirmed it exists. A key the expert catalog does not hold preselects NOTHING (§13): the same
  // stale-link case the storage clamp exists for, answered by asking rather than by guessing.
  useEffect(() => {
    if (!isEventPlanner || formData.plannerOfferingKey || plannerRoleOptions.length === 0) return;
    if (offeringKeyFromUrl && plannerRoleOptions.some((o) => o.offering_type_key === offeringKeyFromUrl)) {
      setFormData((prev) => ({ ...prev, plannerOfferingKey: offeringKeyFromUrl }));
    }
  }, [isEventPlanner, plannerRoleOptions, offeringKeyFromUrl, formData.plannerOfferingKey]);
  /**
   * The offering key this application is submitted against. On the Event Planner track that is the
   * applicant's own pick from the expert catalog; everywhere else it is whatever the /earn link
   * carried, unchanged. Empty means NOTHING IS SENT — the column stays NULL because no offering was
   * chosen, which is a different fact from one that was chosen and refused (§13).
   */
  const chosenOfferingKey = isEventPlanner ? formData.plannerOfferingKey : offeringKeyFromUrl;
  /** The chosen offering's display name, read from the catalog row rather than the URL. */
  const chosenOfferingName = isEventPlanner
    ? plannerRoleOptions.find((o) => o.offering_type_key === chosenOfferingKey)?.display_name ?? ""
    : offeringNameFromUrl;

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

  // Fetch existing application status (to show rejection reason if applicable).
  // Guest-gated: the endpoint is isAuthenticated, and a guest has no prior
  // application to show a rejection for.
  const { data: applicationStatus } = useQuery<{
    overallStatus: string;
    rejectionMessage: string | null;
  }>({
    queryKey: ["/api/expert/application-status"],
    enabled: isAuthenticated,
    retry: false,
  });

  const isRejected = applicationStatus?.overallStatus === "rejected";
  const rejectionMessage = applicationStatus?.rejectionMessage;

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
          // D5 (amended): a claim is required only when the catalog has neighborhoods for this city.
          // No options ⇒ skippable (the server stamps no_neighborhoods_available_at at submit).
          return !!(
            formData.city &&
            formData.localityProof &&
            formData.languages.length > 0 &&
            (neighborhoodOptions.length === 0 || formData.neighborhoodClaims.length > 0)
          );
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
        // Event Planner: the role is REQUIRED — it is the one field that decides which
        // `expert_offering_types` row this application is against. When the catalog itself could
        // not be read the step is not held hostage to it (the server still clamps honestly).
        if (isEventPlanner && plannerRoleOptions.length > 0 && !formData.plannerOfferingKey) return false;
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
        // The canonical selection (migration 107) — was read but never sent. On the Event Planner
        // track the applicant's own pick wins: it is an EXPERT-catalog key and therefore the only
        // value the FK can actually hold, where the /earn link may have carried a provider one.
        ...(chosenOfferingKey ? { offeringTypeKey: chosenOfferingKey } : {}),
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
        // The offering's own words, from the row we actually chose — not the name the link
        // carried, which on the Event Planner track may name a different (provider-catalog) row.
        specializations: chosenOfferingName
          ? Array.from(new Set([chosenOfferingName, ...formData.specializations]))
          : formData.specializations,
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
      const res = await apiRequest("POST", "/api/expert-application", applicationData);
      // Field-knowledge claims ride the same submit: each picked neighborhood becomes a claim
      // (= "claimed"); the first one's answers are saved, and sent when complete and consented.
      // Best-effort — the application is already in; anything that fails here is finished in
      // the console's Neighborhoods panel.
      if (isLocalExpert && formData.neighborhoodClaims.length > 0) {
        try {
          for (let idx = 0; idx < formData.neighborhoodClaims.length; idx++) {
            const c = formData.neighborhoodClaims[idx];
            const created = await apiRequest("POST", "/api/expert/neighborhood-claims", { neighborhoodId: c.neighborhoodId });
            const body = (await created.json()) as { claim: { id: string } | null };
            const claimId = body.claim?.id;
            if (idx === 0 && claimId && formData.neighborhoodCapture && captureHasContent(formData.neighborhoodCapture)) {
              await apiRequest("PUT", `/api/expert/neighborhood-claims/${claimId}/capture`, { capture: formData.neighborhoodCapture });
              if (formData.neighborhoodConsent && captureCompleteness(formData.neighborhoodCapture).complete) {
                await apiRequest("POST", `/api/expert/neighborhood-claims/${claimId}/submit`, { consent: true, capture: toSubmitPayload(formData.neighborhoodCapture) });
              }
            }
          }
        } catch (e: any) {
          toast({
            title: "Application saved — neighborhoods need a second look",
            description: "We couldn't save every neighborhood answer. You can finish them any time in your console under Neighborhoods.",
          });
        }
      }
      // The body carries `offeringTypeKeyUnrecorded` when the server refused the offering key
      // (an unknown key is clamped to NULL rather than failing the signup, migration-107 FK).
      // Parsed here so onSuccess can say so — a parse failure must never turn a successful
      // submission into an error, so it degrades to "nothing to report".
      try {
        return (await res.json()) as { offeringTypeKeyUnrecorded?: string | null };
      } catch {
        return {};
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/service-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/neighborhood-claims"] });
      // Gating the status query on isAuthenticated (below) means it can fetch and
      // cache a "no form yet" result right after sign-in but before submit; without
      // this invalidation, /expert-status's client-side nav (same QueryClient, no
      // reload) would serve that stale cache instead of the just-submitted form.
      queryClient.invalidateQueries({ queryKey: ["/api/expert/application-status"] });
      clearApplicationDraft(DRAFT_KEY);
      // §13: a REFUSED offering and a never-chosen one are different facts, and the applicant is
      // the only person who can repair the first. Say it out loud rather than filing a silent NULL.
      const unrecorded = result?.offeringTypeKeyUnrecorded;
      toast(
        unrecorded
          ? {
              title: "Application submitted — one thing we couldn't record",
              description:
                "We couldn't record the offering you picked, so it isn't on your application. Tell us what you offer in your application or reply to our email and we'll add it.",
            }
          : {
              title: "Application submitted!",
              description: "We'll review your application and follow up by email.",
            }
      );
      // /expert-status is auth-only (no role required), so a fresh applicant
      // with no role yet can view it — unlike /dashboard, it acknowledges the
      // application that was just submitted instead of ignoring it.
      setLocation("/expert-status");
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
          title: "Sign in to submit your application",
          description: "We've saved everything you entered — sign in and submit will pick up right where you left off.",
          returnTo: window.location.pathname + window.location.search,
        });
      }
    },
  });

  const promptSignInToSubmit = () => {
    saveApplicationDraft(DRAFT_KEY, formData, currentStep);
    openSignInModal({
      title: "Sign in to submit your application",
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
            <span className="font-semibold text-foreground">{expertTypeTitle} Application</span>
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
                <p className="font-semibold text-foreground">You'll need an account to submit this application</p>
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
        {isRejected && (
          <div
            className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-900/20 p-5"
            data-testid="banner-application-rejected"
          >
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-red-800 dark:text-red-300 text-base">
                  Your previous application was not approved
                </h3>
                {rejectionMessage ? (
                  <div className="mt-2 space-y-2">
                    <div className="rounded-lg bg-red-100 dark:bg-red-900/30 px-4 py-3 border border-red-200 dark:border-red-700">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        Reason from our review team:
                      </p>
                      <p className="text-sm text-red-800 dark:text-red-200 leading-relaxed" data-testid="text-rejection-reason">
                        {rejectionMessage}
                      </p>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
                      Please address the feedback above and resubmit the form below.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                    Our review team did not leave a specific reason. Please review your application, make any improvements, and resubmit below.
                  </p>
                )}
              </div>
            </div>
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
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Basic Information</CardTitle>
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
                  <div className="bg-gradient-to-r from-[#1877F2]/5 via-[#E1306C]/5 to-[#833AB4]/5 rounded-lg p-5 border border-border">
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
                      className="mt-2 h-12 border-border"
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">Last Name</Label>
                    <Input
                      value={formData.lastName}
                      onChange={(e) => updateFormData("lastName", e.target.value)}
                      className="mt-2 h-12 border-border"
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[#374151]">Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => updateFormData("country", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-country"
                    />
                  </div>
                  <div>
                    <Label className="text-[#374151]">City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => updateFormData("city", e.target.value)}
                      className="mt-2 h-12 border-border"
                      data-testid="input-city"
                    />
                  </div>
                </div>

                {/* Influencer Section - Only shown when arriving via influencer program link */}
                {influencerFromUrl && (
                  <div className="border-t pt-6 mt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Badge className="bg-primary text-white">
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
                            className="mt-2 h-12 border-border"
                            data-testid="input-instagram-link"
                          />
                        </div>
                        <div>
                          <Label className="text-[#374151]">Instagram Followers</Label>
                          <Input
                            value={formData.instagramFollowers}
                            onChange={(e) => updateFormData("instagramFollowers", e.target.value)}
                            placeholder="e.g. 50000"
                            className="mt-2 h-12 border-border"
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
                            className="mt-2 h-12 border-border"
                            data-testid="input-tiktok-link"
                          />
                        </div>
                        <div>
                          <Label className="text-[#374151]">TikTok Followers</Label>
                          <Input
                            value={formData.tiktokFollowers}
                            onChange={(e) => updateFormData("tiktokFollowers", e.target.value)}
                            placeholder="e.g. 100000"
                            className="mt-2 h-12 border-border"
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
                            className="mt-2 h-12 border-border"
                            data-testid="input-youtube-link"
                          />
                        </div>
                        <div>
                          <Label className="text-[#374151]">YouTube Subscribers</Label>
                          <Input
                            value={formData.youtubeFollowers}
                            onChange={(e) => updateFormData("youtubeFollowers", e.target.value)}
                            placeholder="e.g. 25000"
                            className="mt-2 h-12 border-border"
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
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Your Local Knowledge</CardTitle>
                <p className="text-muted-foreground text-sm mt-1">
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
                    className="mt-2 h-12 border-border"
                    data-testid="input-local-city"
                  />
                </div>

                {/* Neighborhoods — picked from the catalog (ruling 2026-08-29-neighborhood-claims) */}
                <div>
                  <Label className="text-[#374151] mb-1 block">
                    Neighbourhoods You Know Deeply {neighborhoodOptions.length > 0 && <span className="text-red-500">*</span>}
                  </Label>
                  {!formData.city.trim() ? (
                    <p className="text-xs text-muted-foreground">Tell us your city first and we'll show you its neighbourhoods.</p>
                  ) : neighborhoodOptions.length === 0 ? (
                    <div className="mt-2 p-3 rounded-lg border border-border bg-gray-50 text-sm text-[#374151]" data-testid="neighborhoods-unavailable">
                      We don't have {formData.city.trim()}'s neighbourhoods mapped yet. You can continue — we'll ask you to claim yours once they're in.
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">Pick every one you know block by block. Others can claim the same neighbourhood — this is a join, not a territory.</p>
                      <div className="flex flex-wrap gap-2">
                        {neighborhoodOptions.map((opt) => {
                          const picked = formData.neighborhoodClaims.some((c) => c.neighborhoodId === opt.id);
                          return (
                            <Badge
                              key={opt.id}
                              variant={picked ? "default" : "outline"}
                              className={cn("cursor-pointer px-3 py-2", picked ? "bg-primary hover:bg-primary/90" : "border-border hover:border-primary")}
                              onClick={() => toggleNeighborhoodClaim(opt)}
                              data-testid={`badge-neighborhood-${opt.slug}`}
                            >
                              {opt.name}
                            </Badge>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Show us {neighborhood} — the four prompts, inline for the first pick; finish later is fine */}
                {firstClaim && (
                  <div className="rounded-xl border border-border p-4 sm:p-6 space-y-5" data-testid="onboarding-claim-capture">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{CLAIM_PROMPTS.heading(firstClaim.name)}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Three short things about {firstClaim.name}. You can finish this later in your console — leaving it blank keeps {firstClaim.name} claimed.
                        {formData.neighborhoodClaims.length > 1 && " We'll ask about your other neighbourhoods there too."}
                      </p>
                    </div>
                    <ClaimCaptureForm
                      neighborhoodName={firstClaim.name}
                      daypart={firstClaim.daypart}
                      value={formData.neighborhoodCapture ?? emptyCapture()}
                      onChange={(next) => updateFormData("neighborhoodCapture", next)}
                      compact
                    />
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="neighborhood-consent"
                        checked={formData.neighborhoodConsent}
                        onCheckedChange={(v) => updateFormData("neighborhoodConsent", v === true)}
                        data-testid="checkbox-neighborhood-consent"
                      />
                      <Label htmlFor="neighborhood-consent" className="text-sm leading-snug text-muted-foreground">
                        I'm happy for Traveloure to use what I share here — my places may appear with my name on them and my {firstClaim.daypart.replace("_", " ")} may be offered to travelers as a starting point.
                      </Label>
                    </div>
                    {formData.neighborhoodCapture && captureHasContent(formData.neighborhoodCapture) && !captureCompleteness(formData.neighborhoodCapture).complete && (
                      <p className="text-xs text-muted-foreground">Not finished yet — that's fine, we'll save it as a draft. Still needed: {captureCompleteness(formData.neighborhoodCapture).firstIssue}</p>
                    )}
                  </div>
                )}

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
                            ? "border-primary bg-[#FFE3E8] text-primary font-medium"
                            : "border-border hover:border-primary text-[#374151]"
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
                            ? "bg-primary hover:bg-primary/90"
                            : "border-border hover:border-primary"
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
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Knowledge Proof</CardTitle>
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>Be specific.</strong> Vague answers that could come from a guidebook won't be enough. Our team is looking for the kind of insight only a real local can give — including where to avoid and why.
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
                      className="border-border"
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
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Your Local Specialties</CardTitle>
                <p className="text-muted-foreground text-sm mt-1">
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
                              ? "border-primary bg-[#FFE3E8] text-primary font-medium"
                              : "border-border hover:border-primary text-[#374151]"
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
                            ? "bg-primary hover:bg-primary/90"
                            : "border-border hover:border-primary"
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
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Your Expertise</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Event Planner: which planner role. Reads the EXPERT catalog live
                    (`expert_offering_types`, the six coordination rows migration 283 seeds) — this
                    page holds no copy of the names, so an admin rename shows up without a deploy.
                    Single-select: `local_expert_forms.offering_type_key` is one column. */}
                {isEventPlanner && (
                  <div data-testid="planner-role-picker">
                    <Label className="text-[#374151] mb-1 block">
                      <CalendarHeart className="w-4 h-4 inline mr-2" />
                      Which kind of planner are you?
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Pick the one you'd lead with. It's what we match you to — you can offer more later.
                    </p>
                    {loadingPlannerRoles ? (
                      <p className="text-sm text-muted-foreground">Loading planner roles…</p>
                    ) : plannerRoleOptions.length === 0 ? (
                      /* No rows reached us — the catalog failed, or this database has not run the
                         seed. Say which, and do NOT block the application on it: the server records
                         no offering and tells us so, rather than us inventing a role (§13). */
                      <p className="text-sm text-muted-foreground" data-testid="planner-role-unavailable">
                        {plannerRolesFailed
                          ? "We couldn't load the planner roles just now, so we can't ask here. Tell us which kind of planner you are in your bio and we'll set it up with you."
                          : "No planner roles are published yet. Tell us which kind of planner you are in your bio and we'll set it up with you."}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {plannerRoleOptions.map((opt) => {
                          const selected = formData.plannerOfferingKey === opt.offering_type_key;
                          return (
                            <button
                              key={opt.offering_type_key}
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  // Clicking the chosen one again clears it — "" is NOT CHOSEN,
                                  // and there is no way back to a default because there is none.
                                  plannerOfferingKey: selected ? "" : opt.offering_type_key,
                                }))
                              }
                              aria-pressed={selected}
                              className={cn(
                                "text-left rounded-lg border px-3.5 py-2.5 transition-colors",
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary"
                              )}
                              data-testid={`planner-role-${opt.offering_type_key}`}
                            >
                              <span className="block text-sm font-medium text-foreground">{opt.display_name}</span>
                              {opt.tagline && (
                                <span className="block text-xs text-muted-foreground mt-0.5">{opt.tagline}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <Label className="text-[#374151] mb-3 block">
                    <Globe className="w-4 h-4 inline mr-2" />
                    Destinations You Cover (select all that apply)
                  </Label>
                  {/* Gap 6: say what this list IS. Offering only the operating markets without
                      saying so would read as "these are the only places that exist" (§13). */}
                  <p className="text-xs text-muted-foreground mb-2" data-testid="text-destinations-scope">
                    These are the markets Traveloure operates in today. Cover somewhere else? Tell us in your
                    bio &mdash; we open new markets from where our experts already are.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((dest) => (
                      <Badge
                        key={dest}
                        variant={formData.destinations.includes(dest) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer px-3 py-2",
                          formData.destinations.includes(dest)
                            ? "bg-primary hover:bg-primary/90"
                            : "border-border hover:border-primary"
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
                            ? "bg-primary hover:bg-primary/90"
                            : "border-border hover:border-primary"
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
                            ? "bg-primary hover:bg-primary/90"
                            : "border-border hover:border-primary"
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
                            ? "bg-primary hover:bg-primary/90"
                            : "border-border hover:border-primary"
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
                            ? "bg-primary hover:bg-primary/90"
                            : "border-border hover:border-primary"
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
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Services You Offer</CardTitle>
                <p className="text-muted-foreground text-sm mt-1">Select the services you want to offer to travelers. You can set custom pricing later.</p>
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
                              ? "bg-primary hover:bg-primary/90"
                              : "border-border hover:border-primary"
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
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Your Experience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-[#374151]">Years of Experience</Label>
                  <Select
                    value={formData.yearsExperience}
                    onValueChange={(v) => updateFormData("yearsExperience", v)}
                  >
                    <SelectTrigger className="mt-2 h-12 border-border" data-testid="select-experience">
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
                    className="mt-2 border-border"
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
                    className="mt-2 h-12 border-border"
                    data-testid="input-portfolio"
                  />
                </div>

                <div>
                  <Label className="text-[#374151]">Certifications / Qualifications</Label>
                  <Textarea
                    value={formData.certifications}
                    onChange={(e) => updateFormData("certifications", e.target.value)}
                    placeholder="List any relevant certifications, licenses, or qualifications..."
                    className="mt-2 border-border"
                    rows={3}
                    data-testid="textarea-certifications"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5/6: Availability */}
          {((!isLocalExpert && currentStep === 5) || (isLocalExpert && currentStep === 6)) && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Availability & Rates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-[#374151]">Weekly Availability</Label>
                  <Select
                    value={formData.availability}
                    onValueChange={(v) => updateFormData("availability", v)}
                  >
                    <SelectTrigger className="mt-2 h-12 border-border" data-testid="select-availability">
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
                    <SelectTrigger className="mt-2 h-12 border-border" data-testid="select-response-time">
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
                      className="pl-10 h-12 border-border"
                      data-testid="input-hourly-rate"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Average expert rates: $50-150/hour depending on experience
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 6/7: Review */}
          {((!isLocalExpert && currentStep === 6) || (isLocalExpert && currentStep === 7)) && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl text-foreground">Review Your Application</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <span className="ml-2 text-foreground font-medium">
                      {formData.firstName} {formData.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <span className="ml-2 text-foreground font-medium">{formData.email}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location:</span>
                    <span className="ml-2 text-foreground font-medium">
                      {formData.city}, {formData.country}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Experience:</span>
                    <span className="ml-2 text-foreground font-medium">
                      {formData.yearsExperience} years
                    </span>
                  </div>
                </div>

                {isLocalExpert ? (
                  <>
                    <div>
                      <span className="text-muted-foreground text-sm">Neighbourhoods:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.neighborhoods.map((n) => (
                          <Badge key={n} variant="secondary" className="text-xs">{n}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-sm">Local Specialties:</span>
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
                      <span className="text-muted-foreground text-sm">Services Offered:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.selectedServices.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className="text-muted-foreground text-sm block">Knowledge Proof (summary):</span>
                      {formData.knowledgeProofAnswers.map((ans, i) => (
                        ans.trim().length > 0 && (
                          <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm">
                            <p className="font-medium text-[#374151] mb-1">Q{i + 1}: {KNOWLEDGE_PROOF_QUESTIONS[i].slice(0, 60)}…</p>
                            <p className="text-muted-foreground italic">"{ans.trim().slice(0, 120)}{ans.trim().length > 120 ? "…" : ""}"</p>
                          </div>
                        )
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-muted-foreground text-sm">Destinations:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.destinations.map((d) => (
                          <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-sm">Specialties:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {formData.specialties.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="p-4 bg-[#F3F4F6] rounded-lg">
                  <h4 className="font-medium text-foreground mb-2">Benefits You'll Get:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {benefits.map((benefit) => (
                      <div key={benefit.text} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <benefit.icon className="w-4 h-4 text-primary" />
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
                  <label htmlFor="terms" className="text-sm text-muted-foreground">
                    I agree to the{" "}
                    <a 
                      href={influencerFromUrl ? "/terms#influencer-terms" : "/terms#expert-terms"} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary underline"
                    >
                      {influencerFromUrl ? "Influencer Program Terms" : expertTypeTitle + " Terms"}
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
              {isSubmitting ? "Submitting..." : "Submit Application"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
