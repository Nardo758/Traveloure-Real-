import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BUY_NOW_CART_PATH } from "@/lib/cart-intent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useLocation, useSearch } from "wouter";
import {
  Globe,
  FileText,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Star,
  MapPin,
  Loader2,
  Shield,
  BookOpen,
  X,
  RefreshCw,
} from "lucide-react";
import { SEOHead } from "@/components/seo-head";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { PageLayout, SectionTitle, HEADING_STYLE, PAGE_ACTION, PAGE_LINK } from "@/components/company/company-page";

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Belize",
  "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei",
  "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde",
  "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo",
  "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Estonia", "Ethiopia", "Fiji",
  "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala",
  "Guinea", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq",
  "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan",
  "Kenya", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia",
  "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia",
  "Maldives", "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova", "Monaco",
  "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nepal",
  "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saudi Arabia", "Senegal", "Serbia", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
  "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

type VisaRequirements = {
  visaRequired: boolean;
  visaTypes: string[];
  requiredDocuments: string[];
  processingTime: string | null;
  feeRange: string | null;
  disclaimer: string | null;
  fromCache?: boolean;
  cachedAt?: string | Date | null;
};

type Service = {
  id: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  price: string;
  averageRating: string;
  reviewCount: number;
  location: string;
  deliveryMethod: string;
  serviceImage: string | null;
  providerName: string;
  providerAvatar: string | null;
};

type DiscoverResult = {
  services: Service[];
  total: number;
};

const VISA_TYPES = [
  { value: "tourist", label: "Tourist / Holiday" },
  { value: "business", label: "Business" },
  { value: "student", label: "Student" },
  { value: "work", label: "Work" },
  { value: "transit", label: "Transit" },
  { value: "other", label: "Other" },
];

export default function VisaHelpPage() {
  const { toast } = useToast();
  const searchString = useSearch();
  const [passportCountry, setPassportCountry] = useState("");

  // Pre-fill destination from ?destination= query param (e.g. when arriving from an itinerary page)
  const prefilledDestination = (() => {
    const params = new URLSearchParams(searchString);
    const raw = params.get("destination") || "";
    return COUNTRIES.find((c) => c.toLowerCase() === raw.toLowerCase()) ?? "";
  })();
  const [destinationCountry, setDestinationCountry] = useState(prefilledDestination);

  useEffect(() => {
    if (prefilledDestination && !destinationCountry) {
      setDestinationCountry(prefilledDestination);
    }
  }, [prefilledDestination]);

  const [result, setResult] = useState<VisaRequirements | null>(null);

  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [intakePassport, setIntakePassport] = useState("");
  const [intakeDestination, setIntakeDestination] = useState("");
  const [intakeStartDate, setIntakeStartDate] = useState("");
  const [intakeEndDate, setIntakeEndDate] = useState("");
  const [intakeVisaType, setIntakeVisaType] = useState("tourist");
  const [intakeCircumstances, setIntakeCircumstances] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [, navigate] = useLocation();

  // Ledger 2026-09-24-request-rail-unpaid: this used to POST /api/expert-booking-requests, which
  // wrote a priced `pending` booking with NO payment and no way for the traveler to pay it. A visa
  // service is a purchase, so it takes the purchase path: a cart line (the intake details ride as
  // its notes, which checkout copies onto the booking) and the payment step. The price is the
  // listing's own, server-derived at checkout (§14).
  const bookingMutation = useMutation({
    mutationFn: async (data: { serviceId: string; notes: string }) => {
      const res = await apiRequest("POST", "/api/cart", { serviceId: data.serviceId, quantity: 1, notes: data.notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      setBookingSuccess(true);
      navigate(BUY_NOW_CART_PATH);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Booking failed", description: err.message });
    },
  });

  const handleOpenBooking = (service: Service) => {
    setBookingService(service);
    setIntakePassport(passportCountry);
    setIntakeDestination(destinationCountry);
    setIntakeStartDate("");
    setIntakeEndDate("");
    setIntakeVisaType("tourist");
    setIntakeCircumstances("");
    setBookingSuccess(false);
  };

  const handleSubmitBooking = () => {
    if (!bookingService) return;
    // Only answered fields are written — an unanswered one is omitted, never "N/A" (§13).
    const lines = [
      intakePassport && `Passport: ${intakePassport}`,
      intakeDestination && `Destination: ${intakeDestination}`,
      (intakeStartDate || intakeEndDate) && `Travel dates: ${intakeStartDate || "?"} to ${intakeEndDate || "?"}`,
      intakeVisaType && `Visa type: ${intakeVisaType}`,
      intakeCircumstances.trim() && `Circumstances: ${intakeCircumstances.trim()}`,
    ].filter(Boolean);
    bookingMutation.mutate({
      serviceId: bookingService.id,
      notes: ["Visa assistance request", ...lines].join("\n"),
    });
  };

  const trackIVisaClick = async (destination: string) => {
    try {
      await apiRequest("POST", "/api/affiliates/track", {
        partner: "ivisa",
        destination: destination || undefined,
      });
    } catch {
      // tracking errors are non-blocking
    }
  };

  const requirementsMutation = useMutation<VisaRequirements, Error, { passportCountry: string; destinationCountry: string; forceRefresh?: boolean }>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/visa/requirements", data);
      return res.json() as Promise<VisaRequirements>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const { data: expertsData, isLoading: expertsLoading } = useQuery<DiscoverResult>({
    queryKey: ["/api/visa/experts"],
    queryFn: async () => {
      const res = await fetch("/api/visa/experts?limit=6");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleLookup = () => {
    if (!passportCountry || !destinationCountry) return;
    requirementsMutation.mutate({ passportCountry, destinationCountry });
  };

  const handleForceRefresh = () => {
    if (!passportCountry || !destinationCountry) return;
    requirementsMutation.mutate({ passportCountry, destinationCountry, forceRefresh: true });
  };

  const formatCachedAt = (cachedAt: string | Date | null | undefined): string => {
    if (!cachedAt) return "";
    const date = new Date(cachedAt);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  };

  const iVisakUrl = destinationCountry
    ? `https://www.ivisa.com/apply?country=${encodeURIComponent(destinationCountry)}&ref=traveloure`
    : "https://www.ivisa.com/?ref=traveloure";

  return (
    <>
      <SEOHead
        title="Visa Help - Requirements & Expert Assistance | Traveloure"
        description="Look up visa requirements for your destination instantly with AI, then book a certified visa expert to handle your application."
      />

      {/* Visa Booking Intake Modal */}
      <AnimatePresence>
        {bookingService && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setBookingService(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="flex items-center justify-between p-5 border-b">
                <div>
                  <h2 className="text-[18px] font-semibold" style={HEADING_STYLE}>Book Visa Assistance</h2>
                  <p className="text-sm text-muted-foreground">{bookingService.serviceName}</p>
                </div>
                <button
                  onClick={() => setBookingService(null)}
                  className="p-1.5 rounded-full hover:bg-[color:var(--earn-chip)] transition-colors"
                  data-testid="button-close-visa-modal"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {bookingSuccess ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-[color:var(--earn-coral-bg)] flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-[18px] font-semibold" style={HEADING_STYLE}>Added to checkout</h3>
                  <p className="text-sm text-muted-foreground">
                    Your details are attached. Pay at checkout to send the request to the expert.
                  </p>
                  <Button className={`${PAGE_ACTION.primary} mt-2`} onClick={() => setBookingService(null)}>
                    Done
                  </Button>
                </div>
              ) : (
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Your Passport (Nationality)</label>
                      <Select value={intakePassport} onValueChange={setIntakePassport}>
                        <SelectTrigger data-testid="select-intake-passport">
                          <SelectValue placeholder="Select country…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Destination Country</label>
                      <Select value={intakeDestination} onValueChange={setIntakeDestination}>
                        <SelectTrigger data-testid="select-intake-destination">
                          <SelectValue placeholder="Select country…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Travel Start Date</label>
                      <input
                        type="date"
                        value={intakeStartDate}
                        onChange={(e) => setIntakeStartDate(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid="input-intake-start-date"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Travel End Date</label>
                      <input
                        type="date"
                        value={intakeEndDate}
                        onChange={(e) => setIntakeEndDate(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid="input-intake-end-date"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Visa Type</label>
                    <Select value={intakeVisaType} onValueChange={setIntakeVisaType}>
                      <SelectTrigger data-testid="select-intake-visa-type">
                        <SelectValue placeholder="Select type…" />
                      </SelectTrigger>
                      <SelectContent>
                        {VISA_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Special Circumstances <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Textarea
                      value={intakeCircumstances}
                      onChange={(e) => setIntakeCircumstances(e.target.value)}
                      placeholder="e.g. prior visa denials, dual nationality, criminal record, urgent timeline…"
                      rows={3}
                      data-testid="textarea-intake-circumstances"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className={`${PAGE_ACTION.secondary} flex-1`}
                      onClick={() => setBookingService(null)}
                      data-testid="button-cancel-visa-booking"
                    >
                      Cancel
                    </Button>
                    <Button
                      className={`${PAGE_ACTION.primary} flex-1`}
                      onClick={handleSubmitBooking}
                      disabled={!intakePassport || !intakeDestination || !intakeStartDate || bookingMutation.isPending}
                      data-testid="button-submit-visa-booking"
                    >
                      {bookingMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
                      ) : (
                        "Continue to payment"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PageLayout
        width="content"
        eyebrow="AI-Powered Visa Requirements"
        title="Visa Help & Expert Guidance"
        lead="Instantly look up visa requirements for any country, then connect with a certified visa expert for hands-on help."
      >

        {/* Lookup Form */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[18px] font-semibold" style={HEADING_STYLE}>
              <Globe className="w-5 h-5 text-primary" />
              Visa Requirements Lookup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Your Passport (Nationality)
                </label>
                <Select value={passportCountry} onValueChange={setPassportCountry}>
                  <SelectTrigger data-testid="select-passport-country">
                    <SelectValue placeholder="Select your passport country…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Destination Country
                </label>
                <Select value={destinationCountry} onValueChange={setDestinationCountry}>
                  <SelectTrigger data-testid="select-destination-country">
                    <SelectValue placeholder="Select destination country…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleLookup}
              disabled={!passportCountry || !destinationCountry || requirementsMutation.isPending}
              className={`${PAGE_ACTION.primary} w-full`}
              data-testid="button-lookup-visa"
            >
              {requirementsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Looking up requirements…
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  Check Visa Requirements
                </>
              )}
            </Button>

            {requirementsMutation.isError && (
              <p className="text-sm text-destructive text-center">
                Failed to fetch requirements. Please try again.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Visa Required Badge */}
            <div className="flex flex-wrap items-center gap-3">
              {result.visaRequired ? (
                <Badge className="flex items-center gap-1.5 px-4 py-2 text-base bg-[color:var(--earn-coral-bg)] text-[color:var(--earn-coral-ink)] border-[color:var(--earn-coral-bg)] hover:bg-[color:var(--earn-coral-bg)]">
                  <XCircle className="w-4 h-4" />
                  Visa Required
                </Badge>
              ) : (
                <Badge className="flex items-center gap-1.5 px-4 py-2 text-base bg-[color:var(--earn-chip)] text-[color:var(--earn-teal)] border-[color:var(--earn-border)] hover:bg-[color:var(--earn-chip)]">
                  <CheckCircle className="w-4 h-4" />
                  No Visa Required
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {passportCountry} passport → {destinationCountry}
              </span>
              {result.cachedAt && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-visa-cached-at">
                    <Clock className="w-3 h-3" />
                    Last checked {formatCachedAt(result.cachedAt)}
                  </span>
                  <button
                    onClick={handleForceRefresh}
                    disabled={requirementsMutation.isPending}
                    className={`${PAGE_LINK} flex items-center gap-1 text-xs disabled:opacity-50 transition-colors`}
                    title="Force refresh from AI"
                    data-testid="button-visa-refresh"
                  >
                    <RefreshCw className={`w-3 h-3 ${requirementsMutation.isPending ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Visa Types */}
              {result.visaTypes && result.visaTypes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-primary" />
                      Visa Types Available
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(result.visaTypes as string[]).map((type, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                          {type}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Processing Time & Fees */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Timing &amp; Fees
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.processingTime && (
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Processing Time</p>
                        <p className="text-sm font-medium text-foreground">{result.processingTime}</p>
                      </div>
                    </div>
                  )}
                  {result.feeRange && (
                    <div className="flex items-start gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Fee Range</p>
                        <p className="text-sm font-medium text-foreground">{result.feeRange}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Required Documents */}
            {result.requiredDocuments && (result.requiredDocuments as string[]).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Required Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(result.requiredDocuments as string[]).map((doc, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        {doc}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Disclaimer */}
            {result.disclaimer && (
              <div className="flex items-start gap-3 rounded-xl bg-[color:var(--earn-chip)] border p-4">
                <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">{result.disclaimer}</p>
              </div>
            )}

            {/* iVisa CTA */}
            <Card className="bg-card">
              <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-[18px] font-semibold" style={HEADING_STYLE}>Ready to apply?</p>
                  <p className="text-muted-foreground text-sm">Start your {destinationCountry} visa application with our partner iVisa</p>
                </div>
                <a
                  href={iVisakUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-ivisa-apply"
                  onClick={() => trackIVisaClick(destinationCountry)}
                >
                  <Button className={`${PAGE_ACTION.primary} whitespace-nowrap`}>
                    Apply Now on iVisa
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Visa Experts Grid */}
        <div className="space-y-6">
          <div>
            <SectionTitle>Visa Assistance Experts</SectionTitle>
            <p className="text-muted-foreground mt-1">
              Connect with a certified expert who can handle your entire visa process.
            </p>
          </div>

          {expertsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-2xl" />
              ))}
            </div>
          ) : expertsData?.services && expertsData.services.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {expertsData.services.map((service) => (
                <VisaExpertCard key={service.id} service={service} onBook={handleOpenBooking} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-2xl border border-dashed">
              <Globe className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No visa experts listed yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Check back soon — we're onboarding certified visa specialists.
              </p>
              <Link href="/services?category=visa-assistance">
                <Button variant="outline" className={`${PAGE_ACTION.secondary} mt-4`} data-testid="button-browse-experts">
                  Browse All Services
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="space-y-6">
          <SectionTitle>How Visa Assistance Works</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Look up requirements", desc: "Enter your passport and destination above. Our AI surfaces all requirements in seconds.", icon: Globe },
              { step: "2", title: "Book an expert", desc: "Select a certified visa specialist below. They handle document prep, form filling, and embassy appointments.", icon: Shield },
              { step: "3", title: "Travel confidently", desc: "Your expert keeps you updated until your visa is approved and you're ready to go.", icon: CheckCircle },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-[color:var(--earn-coral-bg)] text-primary flex items-center justify-center font-bold flex-shrink-0">
                  {step}
                </div>
                <div>
                  <h3 className="text-[18px] font-semibold mb-1" style={HEADING_STYLE}>{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageLayout>
    </>
  );
}

function VisaExpertCard({ service, onBook }: { service: Service; onBook: (service: Service) => void }) {
  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;
  const name = service.providerName || "Visa Specialist";
  const avatar = service.providerAvatar || service.serviceImage || null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-md transition-all h-full flex flex-col" data-testid={`card-visa-expert-${service.id}`}>
        <div className="p-5 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            {avatar ? (
              <img src={avatar} alt={name} className="w-12 h-12 rounded-full object-cover border-2 border-primary/20" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[color:var(--earn-coral-bg)] border-2 border-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-foreground text-sm">{name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {service.location || "Remote"}
              </p>
            </div>
          </div>

          <p className="font-medium text-foreground text-sm leading-snug">
            {service.serviceName}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {service.shortDescription || service.description}
          </p>

          <div className="flex items-center gap-3 text-xs">
            {rating > 0 && (
              <span className="flex items-center gap-1 text-[color:var(--earn-coral-ink)] font-medium">
                <Star className="w-3.5 h-3.5 fill-current" />
                {rating.toFixed(1)}
                <span className="text-muted-foreground">({service.reviewCount})</span>
              </span>
            )}
            <span className="text-muted-foreground">{service.deliveryMethod || "Remote"}</span>
          </div>
        </div>

        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Starting from</p>
            <p className="font-bold text-foreground">${price.toFixed(0)}</p>
          </div>
          <Button
            size="sm"
            className={PAGE_ACTION.primary}
            onClick={() => onBook(service)}
            data-testid={`button-book-visa-${service.id}`}
          >
            Book Visa Help
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
