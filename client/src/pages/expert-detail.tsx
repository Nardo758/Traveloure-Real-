import { useState } from "react";
import { useParams, Link, useLocation, useSearch, Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star,
  MapPin,
  Languages,
  Award,
  MessageCircle,
  Calendar,
  CheckCircle,
  ArrowLeft,
  Clock,
  Heart,
  Share2,
  Globe,
  Briefcase,
  ShieldCheck,
  Home,
  ChevronRight,
  Sparkles,
  Handshake,
  BadgeCheck,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";

// Continuity design tokens — the same values as artifacts/mockup-sandbox's
// _shared/continuity.css :root, applied directly (that file is a design
// reference, not app code) so this page reads as one system with the rest of
// the marketplace-continuity direction and with expert-card.tsx's browse
// card. See docs/DECISIONS.md ledger row 2026-08-24-experts-continuity.
const INK = "#111827";
const MUTED = "#667085";
const LINE = "#e4e7ec";
const PINK = "#fb3b63";
const PINK_SOFT = "#fff0f3";
const GOLD = "#b54708";
const GREEN_BG = "#ecfdf3";
const GREEN_INK = "#027a48";
const GREEN_BORDER = "#b7ebd1";

const ROLE_LABELS: Record<string, string> = {
  local_expert: "Local expert",
  travel_expert: "Trip planner",
  event_planner: "Event planner",
};

type OfferingKind = "service" | "template" | "ready-made";
type Category = "All" | "Services" | "Templates" | "Ready-made";

interface UnifiedOffering {
  kind: OfferingKind;
  id: string;
  title: string;
  image: string | null;
  chips: string[];
  description?: string;
  rating: number | null;
  price: string;
  cta: string;
  href?: string;
  testId: string;
}

function OfferingTile({
  offering,
  onBook,
}: {
  offering: UnifiedOffering;
  onBook: (offering: UnifiedOffering) => void;
}) {
  const inner = (
    <>
      <div
        className="h-32 w-full shrink-0"
        style={{
          background: offering.image
            ? `url(${offering.image}) center/cover`
            : "linear-gradient(135deg, #153b59, #2a5a7a)",
        }}
      >
        <span
          className="m-2.5 inline-block rounded-[5px] px-1.5 py-1 text-[10px] font-extrabold"
          style={{ background: "rgba(255,255,255,.92)", color: "#153b59" }}
        >
          {offering.kind === "service" ? "Service" : offering.kind === "template" ? "Itinerary template" : "Ready-made trip"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          {offering.rating !== null ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: GOLD }}>
              <Star className="h-3 w-3 fill-current" /> {offering.rating.toFixed(1)}
            </span>
          ) : <span />}
          <span className="text-[13px] font-bold whitespace-nowrap" style={{ color: INK }}>{offering.price}</span>
        </div>
        <h3 className="text-[14px] font-semibold leading-snug" style={{ color: INK }}>{offering.title}</h3>
        {offering.description && (
          <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: MUTED }}>{offering.description}</p>
        )}
        {offering.chips.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {offering.chips.map((c) => (
              <span key={c} className="rounded-[4px] px-1.5 py-0.5 text-[10px]" style={{ background: "#f5f7fa", color: "#667085" }}>{c}</span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2.5 mt-2" style={{ borderTop: `1px solid ${LINE}` }}>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: GREEN_INK }}>
            <ShieldCheck className="h-3 w-3" /> Secure checkout
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold" style={{ color: "#d92d55" }}>
            {offering.cta} <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </>
  );

  const className = "flex h-full flex-col overflow-hidden rounded-[12px] border bg-white text-inherit no-underline transition-all duration-200 hover:-translate-y-0.5";
  const style = { borderColor: LINE, boxShadow: "0 1px 3px rgba(17,24,39,.04)" };

  if (offering.href) {
    return (
      <Link href={offering.href} data-testid={offering.testId} className={className} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onBook(offering)} data-testid={offering.testId} className={`${className} text-left`} style={style}>
      {inner}
    </button>
  );
}

export default function ExpertDetailPage() {
  const { id: expertId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { isAuthenticated } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [offeringFilter, setOfferingFilter] = useState<Category>("All");

  // Sprint 2.1 plan handoff: arriving from the cart/planner with ?tripId=
  // unlocks a "share my trip plan" request — the expert-booking-request carries
  // the tripId, which is what authorizes the expert's plan-snapshot view.
  const handoffTripId = new URLSearchParams(searchString).get("tripId");

  // Fetch expert details
  const { data: expert, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/experts", expertId],
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Request timed out")), 10_000);
      try {
        const res = await fetch(`/api/experts/${expertId}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Expert not found");
        return res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!expertId,
    retry: false,
  });

  // Fetch expert's services/offerings
  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-services", expertId],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertId}/services`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expertId,
  });

  // This expert's purchasable packages (marketplace Phase B4). Server-gated:
  // only approved + published templates return, content-redacted to a teaser.
  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-templates", { expertId }],
    queryFn: async () => {
      const res = await fetch(`/api/expert-templates?expertId=${expertId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expertId,
  });

  // This expert's Ready-Made Trips (lane nav-storefront D2) — the OTHER purchasable
  // catalog (ready_made_trips, NOT expert_templates; the two are never merged).
  // Server-gated: GET /api/ready-made?authorId= returns only approved+active listings
  // by this author. Mirrors the storefront's Ready-Made lane; the tab renders only
  // when non-empty (§13 — no empty shelf).
  const { data: readyMadeData } = useQuery<{
    listings: Array<{
      id: string;
      title: string;
      heroImageUrl: string | null;
      priceCents: number | null;
      pricingMode: string;
      durationDays: number | null;
      market: string;
      insideCounts: { items?: number } | null;
    }>;
  }>({
    queryKey: ["/api/ready-made", { authorId: expertId }],
    queryFn: async () => {
      const res = await fetch(`/api/ready-made?authorId=${encodeURIComponent(expertId!)}`);
      if (!res.ok) return { listings: [] };
      return res.json();
    },
    enabled: !!expertId,
  });
  const readyMade = readyMadeData?.listings ?? [];

  const handleContactExpert = () => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    navigate(`/chat?expertId=${expertId}`);
  };

  // Sprint 2.1: request this expert's help WITH the trip plan attached. Creates
  // a pending expert-booking-request (no payment moves here — amounts derive
  // server-side from the service record, §14); the tripId on the booking is
  // what lets the expert open the traveler's plan snapshot in their console.
  const requestHelpMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/expert-booking-requests", {
        tripId: handoffTripId,
        serviceId: services[0]?.id,
        notes: "Traveler shared their trip plan and requested help from your storefront.",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({
        title: "Request sent with your trip plan",
        description: `${expert?.firstName || "The expert"} can now see your plan and will respond to your request.`,
      });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Could not send request", description: "Please try again." });
    },
  });

  const handleRequestHelpWithPlan = () => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    requestHelpMutation.mutate();
  };

  const handleScheduleConsultation = () => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    if (services.length > 0) {
      navigate(`/cart?expertId=${expertId}&serviceId=${services[0]?.id || ""}`);
    } else {
      toast({
        title: "No services available",
        description: `${expert?.firstName || "This expert"} hasn't listed any services yet. Contact them directly instead.`,
      });
    }
  };

  const handleBookOffering = (offering: UnifiedOffering) => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    navigate(`/cart?expertId=${expertId}&serviceId=${offering.id}`);
  };

  // Fetch expert's reviews
  const { data: reviews = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-reviews", expertId],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertId}/reviews`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expertId,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-background py-8">
          <div className="container mx-auto px-4 max-w-6xl">
            <Skeleton className="h-8 w-32 mb-6" />
            <Skeleton className="h-56 mb-6 rounded-[14px]" />
            <Skeleton className="h-40 rounded-[14px]" />
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !expert) {
    return (
      <Layout>
        <div className="min-h-screen bg-background py-16">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h1 className="text-2xl font-bold mb-4">Expert Not Found</h1>
            <p className="text-muted-foreground mb-8">
              The expert you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/experts">
              <button
                className="rounded-md px-6 py-2.5 text-sm font-bold text-white"
                style={{ background: PINK }}
              >
                Browse All Experts
              </button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  // S2 (redirect-when-claimed): an earner who has claimed a public storefront
  // handle (users.handle, migration 136) is canonically represented at
  // /s/:handle — this id-based browse-context page (/experts/:id,
  // /local-experts/:id) redirects there client-side. Earners without a handle
  // keep this page unchanged. Placed AFTER the loading/not-found returns above
  // so `expert` is guaranteed loaded here (no flash-redirect on undefined).
  if (typeof expert.handle === "string" && expert.handle.trim().length > 0) {
    return <Redirect to={`/s/${expert.handle}`} />;
  }

  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim();
  const initials = `${expert.firstName?.[0] || ""}${expert.lastName?.[0] || ""}`.toUpperCase();
  // Roadmap 3.5: the server now attaches a REAL expert-level rating aggregate
  // (avg of the expert's approved service reviews). expertRating is null when
  // the expert has no reviews → the honest "New" state renders. (Legacy
  // averageRating/reviewCount kept as a fallback for any stale caller.)
  const averageRating =
    typeof expert.expertRating === "number"
      ? expert.expertRating
      : expert.averageRating ? parseFloat(expert.averageRating) : 0;
  const totalReviews = expert.expertReviewCount ?? expert.reviewCount ?? reviews.length ?? 0;
  const responseTime = expert.expertForm?.responseTime || "< 24 hours";
  const languages = expert.expertForm?.languages || ["English"];
  const specializations = expert.expertForm?.specializations || [];
  const destinations = expert.expertForm?.destinations || [];
  const bio = expert.expertForm?.bio || "Experienced local expert ready to help plan your perfect trip.";
  const neighbourhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
  const localityProof: string = expert.expertForm?.localityProof || "";

  const localityProofLabels: Record<string, string> = {
    born_raised: "Born & raised here",
    long_term_10yr: "Long-term resident (10+ years)",
    resident_5yr: "Resident (5+ years)",
    current_resident: "Current resident (1–5 years)",
  };
  const localityProofLabel = localityProofLabels[localityProof] || "";
  const superExpert = expert.superExpert || false;
  const verified = expert.verified === true;
  const idVerified = expert.expertForm?.identityVerificationStatus === "verified";
  const roleLabel = expert.role ? (ROLE_LABELS[expert.role] || "Expert") : "Expert";

  // Unified offering catalogs (§13: real fields only, no invented ratings/prices).
  const serviceOfferings: UnifiedOffering[] = services.map((s: any) => ({
    kind: "service",
    id: s.id,
    title: s.serviceName,
    image: null,
    chips: [s.deliveryMethod, s.deliveryTimeframe, s.location].filter(Boolean),
    description: s.description,
    rating: null,
    price: s.price ? `$${s.price}` : "Contact for pricing",
    cta: "Book now",
    testId: `button-book-service-${s.id}`,
  }));
  const templateOfferings: UnifiedOffering[] = packages.map((p: any) => ({
    kind: "template",
    id: p.id,
    title: p.title,
    image: p.coverImage || null,
    chips: [p.destination, p.duration ? `${p.duration} days` : null].filter(Boolean),
    description: p.shortDescription,
    rating: p.averageRating && parseFloat(p.averageRating) > 0 ? parseFloat(p.averageRating) : null,
    price: `$${p.price}`,
    cta: "Preview template",
    href: `/expert-templates/${p.id}`,
    testId: `expert-package-${p.id}`,
  }));
  const readyMadeOfferings: UnifiedOffering[] = readyMade.map((r) => ({
    kind: "ready-made",
    id: r.id,
    title: r.title,
    image: r.heroImageUrl || null,
    chips: [
      r.durationDays ? `${r.durationDays} day${r.durationDays === 1 ? "" : "s"}` : null,
      r.insideCounts?.items ? `${r.insideCounts.items} stops` : null,
    ].filter((c): c is string => Boolean(c)),
    rating: null,
    price: typeof r.priceCents === "number" ? `$${(r.priceCents / 100).toFixed(0)}` : "Contact for price",
    cta: "Preview trip",
    href: `/ready-made/${r.id}`,
    testId: `expert-ready-made-${r.id}`,
  }));
  const allOfferings = [...serviceOfferings, ...templateOfferings, ...readyMadeOfferings];

  const categories: Category[] = [
    "All",
    "Services",
    ...(templateOfferings.length > 0 ? (["Templates"] as const) : []),
    ...(readyMadeOfferings.length > 0 ? (["Ready-made"] as const) : []),
  ];
  const visibleOfferings =
    offeringFilter === "All" ? allOfferings
    : offeringFilter === "Services" ? serviceOfferings
    : offeringFilter === "Templates" ? templateOfferings
    : readyMadeOfferings;

  // Summary strip — only real, non-empty facts (§13: no empty tile, no invented count).
  const summaryTiles: Array<{ value: string | number; label: string }> = [];
  if (serviceOfferings.length > 0) summaryTiles.push({ value: serviceOfferings.length, label: serviceOfferings.length === 1 ? "service" : "services" });
  const tripPlanCount = templateOfferings.length + readyMadeOfferings.length;
  if (tripPlanCount > 0) summaryTiles.push({ value: tripPlanCount, label: tripPlanCount === 1 ? "trip plan" : "trip plans" });
  if (totalReviews > 0) summaryTiles.push({ value: totalReviews, label: "reviews" });
  if (destinations.length > 0) summaryTiles.push({ value: destinations[0], label: destinations.length > 1 ? "+" + (destinations.length - 1) + " more areas" : "area of expertise" });

  const offeringKindsPresent = [
    serviceOfferings.length > 0 ? "services" : null,
    templateOfferings.length > 0 ? "itinerary templates" : null,
    readyMadeOfferings.length > 0 ? "ready-made trips" : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <Layout>
      <div className="min-h-screen" style={{ background: "#f8fafc" }}>
        <div className="w-full px-4" style={{ maxWidth: 1180, margin: "0 auto" }}>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 py-4 text-[12px]" style={{ color: MUTED }}>
            <Link href="/experts" className="inline-flex items-center gap-1 hover:underline">
              <ArrowLeft className="h-3 w-3" /> Experts
            </Link>
            <ChevronRight className="h-3 w-3" />
            <strong style={{ color: INK, fontWeight: 600 }}>{fullName || "Expert"}</strong>
          </div>

          {/* Hero */}
          <section className="overflow-hidden rounded-[14px] border bg-white" style={{ borderColor: LINE, boxShadow: "0 8px 28px rgba(17,24,39,.04)" }}>
            <div className="h-[120px] w-full" style={{ background: "linear-gradient(100deg, rgba(20,44,65,.85), rgba(251,59,99,.35))" }} />
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-[76px_1fr_auto] sm:items-start">
              <Avatar className="h-[76px] w-[76px] shrink-0 border-4 border-white shadow-lg" style={{ marginTop: -32 }}>
                <AvatarImage src={expert.profileImage} alt={fullName} />
                <AvatarFallback className="text-xl font-bold">{initials}</AvatarFallback>
              </Avatar>

              <div className="pt-2 sm:pt-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>{roleLabel} storefront</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h1 className="text-[26px] font-bold tracking-tight" style={{ color: INK }}>{fullName || "Expert"}</h1>
                  {verified && <CheckCircle className="h-5 w-5 fill-blue-500 text-blue-500" data-testid="icon-verified" />}
                  {idVerified && (
                    <Badge className="bg-blue-600 text-white" title="Identity verified via Stripe Identity">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      ID Verified
                    </Badge>
                  )}
                  {superExpert && (
                    <Badge className="bg-amber-500">
                      <Award className="w-3 h-3 mr-1" />
                      Super Expert
                    </Badge>
                  )}
                </div>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed" style={{ color: "#475467" }}>{bio}</p>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-bold">
                  {totalReviews > 0 ? (
                    <span className="inline-flex items-center gap-1" style={{ color: GOLD }}>
                      <Star className="h-3.5 w-3.5 fill-current" /> {averageRating.toFixed(1)} <span className="font-medium" style={{ color: MUTED }}>· {totalReviews} reviews</span>
                    </span>
                  ) : (
                    <span style={{ color: MUTED }}>New expert · no reviews yet</span>
                  )}
                  <span className="inline-flex items-center gap-1" style={{ color: "#475467" }}>
                    <Briefcase className="h-3.5 w-3.5" /> {expert.completedTrips || 0} trips completed
                  </span>
                  <span className="inline-flex items-center gap-1" style={{ color: "#475467" }}>
                    <Clock className="h-3.5 w-3.5" /> {responseTime} response time
                  </span>
                </div>

                {(destinations.length > 0 || languages.length > 0) && (
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    {destinations.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" style={{ color: MUTED }} />
                        <div className="flex flex-wrap gap-1.5">
                          {destinations.slice(0, 3).map((dest: string) => (
                            <Badge key={dest} variant="secondary">{dest}</Badge>
                          ))}
                          {destinations.length > 3 && <Badge variant="secondary">+{destinations.length - 3}</Badge>}
                        </div>
                      </div>
                    )}
                    {languages.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: MUTED }}>
                        <Languages className="h-3.5 w-3.5" />
                        {languages.join(", ")}
                      </div>
                    )}
                  </div>
                )}

                {neighbourhoods.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="hero-neighbourhoods">
                    <Home className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
                    {localityProofLabel && (
                      <Badge variant="secondary" className="text-xs font-normal" data-testid="hero-locality-proof">
                        {localityProofLabel}
                      </Badge>
                    )}
                    {neighbourhoods.slice(0, 5).map((n: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="flex items-center gap-1 text-xs" data-testid={`hero-badge-neighbourhood-${idx}`}>
                        <MapPin className="w-3 h-3" />
                        {n}
                      </Badge>
                    ))}
                    {neighbourhoods.length > 5 && (
                      <Badge variant="outline" className="text-xs" data-testid="hero-neighbourhoods-overflow">
                        +{neighbourhoods.length - 5} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2 sm:pt-3.5 sm:flex-col">
                {handoffTripId && services.length > 0 && (
                  <button
                    className="inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-bold text-white whitespace-nowrap"
                    style={{ background: PINK, boxShadow: "0 4px 12px rgba(251,59,99,.18)" }}
                    onClick={handleRequestHelpWithPlan}
                    disabled={requestHelpMutation.isPending || requestHelpMutation.isSuccess}
                    data-testid="button-request-help-with-plan"
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    {requestHelpMutation.isSuccess ? "Request sent" : requestHelpMutation.isPending ? "Sending…" : "Share plan & request help"}
                  </button>
                )}
                <button
                  className="inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-bold whitespace-nowrap"
                  style={
                    handoffTripId && services.length > 0
                      ? { border: "1px solid #d0d5dd", color: "#344054", background: "#fff" }
                      : { background: PINK, color: "#fff", boxShadow: "0 4px 12px rgba(251,59,99,.18)" }
                  }
                  onClick={handleContactExpert}
                  data-testid="button-contact-expert"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Contact expert
                </button>
                <div className="flex gap-2">
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border" style={{ borderColor: "#d0d5dd" }} aria-label="Save expert">
                    <Heart className="h-3.5 w-3.5" style={{ color: "#344054" }} />
                  </button>
                  <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border" style={{ borderColor: "#d0d5dd" }} aria-label="Share expert">
                    <Share2 className="h-3.5 w-3.5" style={{ color: "#344054" }} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Summary strip — real facts only (§13) */}
          {summaryTiles.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-0 border-y py-4" style={{ borderColor: LINE }}>
              {summaryTiles.map((tile, idx) => (
                <div key={idx} className="pr-5" style={{ borderRight: idx < summaryTiles.length - 1 ? `1px solid ${LINE}` : undefined, marginRight: 20 }}>
                  <strong className="block text-[20px] tracking-tight" style={{ color: INK }}>{tile.value}</strong>
                  <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>{tile.label}</span>
                </div>
              ))}
              {offeringKindsPresent.length > 1 && (
                <div className="ml-auto flex max-w-sm items-start gap-2 text-[11px] leading-relaxed" style={{ color: "#475467" }}>
                  <Sparkles className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  <span><b style={{ color: INK }}>More than one way to plan with {expert.firstName || "them"}</b><br />{offeringKindsPresent.join(" · ")}</span>
                </div>
              )}
            </div>
          )}

          {/* Offerings */}
          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Ways to work with {expert.firstName || "this expert"}</p>
                <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: INK }}>What {expert.firstName || "they"} can offer</h2>
              </div>
              <p className="text-[12px]" style={{ color: MUTED }}>{visibleOfferings.length} {visibleOfferings.length === 1 ? "offering" : "offerings"}</p>
            </div>

            {/* Quick-book strip — starting price + schedule shortcut, always present */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border p-3.5" style={{ borderColor: LINE, background: "#fff" }}>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>Starting from</p>
                <p className="text-[20px] font-bold" style={{ color: INK }}>
                  {services[0]?.price ? `$${services[0].price}` : "Contact for pricing"}
                </p>
                {services.length > 0 && <p className="text-[11px]" style={{ color: MUTED }}>{services[0]?.serviceName || "Custom service"}</p>}
              </div>
              <button
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-[12px] font-bold text-white"
                style={{ background: PINK, boxShadow: "0 4px 12px rgba(251,59,99,.18)" }}
                onClick={handleScheduleConsultation}
                data-testid="button-schedule-consultation"
              >
                <Calendar className="h-3.5 w-3.5" /> Schedule consultation
              </button>
            </div>

            {categories.length > 1 && (
              <div className="mb-4 flex gap-1 rounded-[9px] p-1" style={{ background: "#eef1f4", width: "fit-content" }} role="tablist" aria-label="Offering categories">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={offeringFilter === cat}
                    onClick={() => setOfferingFilter(cat)}
                    className="rounded-[6px] px-3 py-1.5 text-[11px] font-bold"
                    style={offeringFilter === cat ? { background: "#fff", color: INK, boxShadow: "0 1px 4px rgba(17,24,39,.12)" } : { color: MUTED }}
                    data-testid={cat === "Templates" ? "tab-expert-packages" : cat === "Ready-made" ? "tab-expert-ready-made" : undefined}
                  >
                    {cat === "Templates" ? `Itinerary templates (${templateOfferings.length})` : cat === "Ready-made" ? `Ready-made trips (${readyMadeOfferings.length})` : cat}
                  </button>
                ))}
              </div>
            )}

            {visibleOfferings.length > 0 ? (
              <div
                className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
                data-testid={offeringFilter === "Ready-made" ? "expert-ready-made-lane" : undefined}
              >
                {visibleOfferings.map((offering) => (
                  <OfferingTile key={`${offering.kind}-${offering.id}`} offering={offering} onBook={handleBookOffering} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed py-14 text-center" style={{ borderColor: "#d0d5dd" }}>
                <Briefcase className="h-8 w-8" style={{ color: "#9CA3AF" }} />
                <p style={{ color: MUTED }}>No {offeringFilter === "All" ? "offerings" : offeringFilter.toLowerCase()} available yet</p>
              </div>
            )}
          </section>

          {/* About */}
          {(specializations.length > 0 || destinations.length > 0 || neighbourhoods.length > 0 || expert.expertForm?.certifications) && (
            <section className="mt-8 rounded-[14px] border bg-white p-5" style={{ borderColor: LINE }}>
              <h2 className="mb-4 text-[18px] font-semibold" style={{ color: INK }}>About {expert.firstName || "this expert"}</h2>

              {specializations.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-[12px] font-semibold" style={{ color: INK }}>Specializations</h3>
                  <div className="flex flex-wrap gap-2">
                    {specializations.map((spec: string) => <Badge key={spec} variant="outline">{spec}</Badge>)}
                  </div>
                </div>
              )}

              {destinations.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-[12px] font-semibold" style={{ color: INK }}>Destinations</h3>
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((dest: string) => (
                      <Badge key={dest} variant="secondary"><Globe className="w-3 h-3 mr-1" />{dest}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {neighbourhoods.length > 0 && (
                <div className="mb-4" data-testid="section-areas-of-knowledge">
                  <div className="mb-2 flex items-center gap-2">
                    <Home className="h-3.5 w-3.5" style={{ color: MUTED }} />
                    <h3 className="text-[12px] font-semibold" style={{ color: INK }}>Areas of deep knowledge</h3>
                    {localityProofLabel && (
                      <Badge variant="secondary" className="text-xs font-normal" data-testid="badge-locality-proof">{localityProofLabel}</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {neighbourhoods.map((n: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="flex items-center gap-1" data-testid={`badge-neighbourhood-detail-${idx}`}>
                        <MapPin className="w-3 h-3" />{n}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {expert.expertForm?.certifications && (
                <div>
                  <h3 className="mb-2 text-[12px] font-semibold" style={{ color: INK }}>Certifications</h3>
                  <p style={{ color: MUTED }}>{expert.expertForm.certifications}</p>
                </div>
              )}
            </section>
          )}

          {/* Reviews */}
          <section className="mt-8">
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>What travelers say</p>
              <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: INK }}>Reviews ({totalReviews})</h2>
            </div>
            {reviews.length > 0 ? (
              <div className="flex flex-col gap-3">
                {reviews.map((review: any) => (
                  <div key={review.id} className="rounded-[12px] border bg-white p-4" style={{ borderColor: LINE }}>
                    <div className="flex items-start gap-3">
                      <Avatar>
                        <AvatarFallback>{review.reviewerName?.[0]?.toUpperCase() || "T"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold" style={{ color: INK }}>{review.reviewerName || "Traveler"}</span>
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-3.5 w-3.5 ${i < review.rating ? "text-amber-500 fill-amber-500" : "text-gray-300"}`} />
                            ))}
                          </div>
                          {review.serviceName && <span className="text-[11px]" style={{ color: MUTED }}>· {review.serviceName}</span>}
                        </div>
                        {review.reviewText && <p className="mb-2 text-[12px]" style={{ color: "#475467" }}>{review.reviewText}</p>}
                        {review.responseText && (
                          <div className="mt-2 border-l-2 pl-3 text-[12px]" style={{ borderColor: LINE }}>
                            <span className="font-medium" style={{ color: INK }}>Response: </span>
                            <span style={{ color: MUTED }}>{review.responseText}</span>
                          </div>
                        )}
                        {review.createdAt && <span className="text-[10px]" style={{ color: MUTED }}>{new Date(review.createdAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed py-14 text-center" style={{ borderColor: "#d0d5dd" }}>
                <Star className="h-8 w-8" style={{ color: "#9CA3AF" }} />
                <p style={{ color: MUTED }}>No reviews yet</p>
              </div>
            )}
          </section>

          {/* Conversation CTA */}
          <section
            className="mt-10 grid grid-cols-[45px_1fr_auto] items-center gap-3.5 rounded-[14px] border p-5"
            style={{ borderColor: "#ffd1da", background: "linear-gradient(100deg,#fff5f6,#fff)" }}
          >
            <div className="flex h-[45px] w-[45px] items-center justify-center rounded-full text-[13px] font-extrabold text-white" style={{ background: "#153b59" }}>
              {initials || "?"}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>A good place to begin</p>
              <h2 className="mt-1 text-[16px] font-semibold" style={{ color: INK }}>Have a trip in mind, but not a format yet?</h2>
              <p className="mt-1 max-w-lg text-[11px] leading-relaxed" style={{ color: MUTED }}>
                Tell {expert.firstName || "them"} what you're hoping to feel, eat, or discover — a conversation can point you to the right offering.
              </p>
            </div>
            <button
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-[12px] font-bold text-white"
              style={{ background: PINK, boxShadow: "0 4px 12px rgba(251,59,99,.18)" }}
              onClick={handleContactExpert}
            >
              <MessageCircle className="h-3.5 w-3.5" /> Start a conversation
            </button>
          </section>

          {/* Safety strip */}
          <section className="mt-8 grid grid-cols-1 gap-5 border-t pt-6 pb-14 sm:grid-cols-3" style={{ borderColor: LINE }}>
            <div className="grid grid-cols-[23px_1fr] gap-x-2">
              <ShieldCheck className="row-span-2" style={{ color: "#287a79" }} />
              <b className="text-[11px]" style={{ color: INK }}>Payment is held until your booking completes</b>
              <p className="col-start-2 mt-1 text-[10px] leading-relaxed" style={{ color: MUTED }}>Funds are secured through Stripe and released according to the booking terms.</p>
            </div>
            <div className="grid grid-cols-[23px_1fr] gap-x-2">
              <BadgeCheck className="row-span-2" style={{ color: "#287a79" }} />
              <b className="text-[11px]" style={{ color: INK }}>Listings are reviewed before they publish</b>
              <p className="col-start-2 mt-1 text-[10px] leading-relaxed" style={{ color: MUTED }}>Review status is shown where available; no extra trust claim is implied.</p>
            </div>
            <div className="grid grid-cols-[23px_1fr] gap-x-2">
              <Handshake className="row-span-2" style={{ color: "#287a79" }} />
              <b className="text-[11px]" style={{ color: INK }}>Keep planning in one place</b>
              <p className="col-start-2 mt-1 text-[10px] leading-relaxed" style={{ color: MUTED }}>Your messages, booking details, and receipts stay together on Traveloure.</p>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
