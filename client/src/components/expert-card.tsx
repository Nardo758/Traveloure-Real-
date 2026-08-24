/**
 * ExpertCard — traveler-facing browse card, rebuilt to the ratified EXPERT CARD
 * grammar (attached_assets/marketplace_action_grammar_and_expert_card_(2)_...html,
 * item 4 "expert marketed in feed") applied in the marketplace-continuity design
 * LANGUAGE (artifacts/mockup-sandbox/.../marketplace-details/_shared, the
 * ProviderStorefrontContinuity card idiom) — see docs/DECISIONS.md ledger row
 * 2026-08-24-experts-continuity. Anatomy: avatar + colored role badge (the
 * mock's tinted eyebrow tag) + name/verification + a single meta line
 * (specialty · rating · price) + real secondary facts (specialties, languages,
 * neighbourhoods, storefront volume) + a two-button action row (Message /
 * View profile — the mock's "Ask an expert" / primary-CTA pairing).
 *
 * Only consumer: client/src/pages/experts.tsx (kept local per the continuity
 * lane's no-shared-component-churn rule — this file lives in components/ for
 * historical reasons but is not imported anywhere else).
 *
 * §13: every field renders only when the real record has it. No fabricated
 * rating, no invented specialty, no placeholder photo beyond the deterministic
 * initials avatar. All existing data-testid values and CTA wiring preserved
 * verbatim so playwright/tests/experts-flow.spec.ts stays green.
 */
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Languages, MessageCircle, Clock, CheckCircle, Award, Briefcase, Heart, Home, Plane, PartyPopper, BookOpen, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { StorefrontLink } from "@/components/marketplace/storefront-link";

// Continuity tokens — the same values as artifacts/mockup-sandbox's
// _shared/continuity.css :root and the action-grammar mock's own badge tints
// (#E1F5EE/#0F6E56 "on Traveloure" green, #E6F1FB/#185FA5 partner blue), so
// this card reads as one system with the rest of the marketplace-continuity
// direction without importing the sandbox file (that file is a design
// reference, not app code).
const INK = "#111827";
const MUTED = "#667085";
const LINE = "#e4e7ec";
const SURFACE = "#ffffff";
const PINK = "#fb3b63";
const PINK_SOFT = "#fff0f3";
const GOLD = "#b54708";

const ROLE_BADGE: Record<string, { label: string; bg: string; ink: string; Icon: React.ElementType }> = {
  local_expert: { label: "Local Expert", bg: "#E1F5EE", ink: "#0F6E56", Icon: MapPin },
  travel_expert: { label: "Trip Planner", bg: "#E6F1FB", ink: "#185FA5", Icon: Plane },
  event_planner: { label: "Event Planner", bg: PINK_SOFT, ink: "#d92d55", Icon: PartyPopper },
};

interface ExpertCardProps {
  expert: {
    id: string;
    role?: string;
    /** users.handle (migration 136) — null/absent when the expert has no /p/ storefront page.
     *  The card renders NO storefront affordance in that case (StorefrontLink rule 1). */
    handle?: string | null;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    bio?: string;
    specialties?: string[];
    reviewsCount?: number;
    /** Roadmap 3.5: real expert-level rating (avg of approved service reviews)
     *  + its count. null rating → the card shows "New". */
    expertRating?: number | null;
    expertReviewCount?: number;
    tripsCount?: number;
    responseTime?: string;
    verified?: boolean;
    superExpert?: boolean;
    // Storefront metrics — real server aggregates (§13), attached by GET /api/experts.
    // All hidden when 0; sales counts increment only on completed purchase/booking.
    servicesCount?: number;      // approved+active provider_services offered
    serviceBookings?: number;    // SUM(bookingsCount) across those services
    packagesCount?: number;      // approved+published Ready Made Trips
    packagesSold?: number;       // SUM(salesCount) across those trips
    experienceTypes?: Array<{
      experienceType?: {
        id: string;
        name: string;
        slug: string;
        icon?: string;
      };
    }>;
    selectedServices?: Array<{
      offering?: {
        name: string;
        price: string;
      };
      category?: {
        name: string;
      };
    }>;
    specializations?: string[];
    expertForm?: {
      destinations?: string[];
      languages?: string[];
      yearsExperience?: string;
      responseTime?: string;
      city?: string;
      country?: string;
      neighborhoods?: string[];
      localityProof?: string;
      // LB-P4b: identity verification status. Badge renders only when explicitly
      // 'verified' — no negative badge for unverified/pending per spec.
      identityVerificationStatus?: string | null;
    };
  };
  showServices?: boolean;
  experienceTypeFilter?: string;
  onNeighbourhoodClick?: (neighbourhood: string) => void;
  /** Query string (starting with "?") appended to the View Profile link —
   *  used to carry plan-handoff context (e.g. ?tripId=) into the detail page. */
  detailQuery?: string;
}

export function ExpertCard({ expert, onNeighbourhoodClick, detailQuery }: ExpertCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [, setLocation] = useLocation();

  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Expert";
  const initials = `${expert.firstName?.[0] || "T"}${expert.lastName?.[0] || "E"}`;

  const lowestPrice = expert.selectedServices?.length
    ? Math.min(...expert.selectedServices.map(s => parseFloat(s.offering?.price || "0")))
    : null;

  const location = expert.expertForm?.city && expert.expertForm?.country
    ? `${expert.expertForm.city}, ${expert.expertForm.country}`
    : expert.expertForm?.destinations?.[0] || null;

  const languages = expert.expertForm?.languages || [];
  const responseTime = expert.responseTime || expert.expertForm?.responseTime || null;
  const expertRating: number | null =
    typeof expert.expertRating === "number" ? expert.expertRating : null;
  const reviewsCount = (expert.expertReviewCount ?? expert.reviewsCount) || null;
  const tripsCount = expert.tripsCount || null;
  const verified = expert.expertForm?.identityVerificationStatus === "verified"
    || expert.verified === true;
  const superExpert = expert.superExpert || false;

  const specialties = expert.specialties || expert.specializations?.slice(0, 2) || [];
  const neighbourhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
  const showNeighbourhoods = neighbourhoods.length > 0;

  const roleBadge = expert.role ? ROLE_BADGE[expert.role] : null;

  // Storefront metrics — what this expert has to sell + real sales volume (§13: hidden
  // when 0, never fabricated). Applies to every role incl. trip advisors + event planners.
  const servicesCount = expert.servicesCount ?? 0;
  const packagesCount = expert.packagesCount ?? 0;
  const packagesSold = expert.packagesSold ?? 0;
  const serviceBookings = expert.serviceBookings ?? 0;
  const totalSales = packagesSold + serviceBookings;
  const hasStorefront = servicesCount > 0 || packagesCount > 0;

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-[14px] border bg-[color:var(--ec-surface)] p-3.5 transition-all duration-200 hover:-translate-y-0.5"
      style={{ ["--ec-surface" as any]: SURFACE, borderColor: LINE, boxShadow: "0 1px 3px rgba(17,24,39,.04)" }}
      data-testid={`card-expert-${expert.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="h-12 w-12 overflow-hidden rounded-full border shadow-sm" style={{ borderColor: SURFACE }}>
            {expert.profileImageUrl ? (
              <img src={expert.profileImageUrl} alt={fullName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#fb3b63] to-[#d92d55] text-sm font-semibold text-white">
                {initials}
              </div>
            )}
          </div>
          {superExpert && (
            <div className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5" style={{ background: GOLD }}>
              <Award className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {roleBadge && (
            <span
              className="mb-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ background: roleBadge.bg, color: roleBadge.ink }}
              data-testid="badge-expert-role"
            >
              <roleBadge.Icon className="h-2.5 w-2.5 shrink-0" />
              {roleBadge.label}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <h3
              className="truncate text-[14px] font-semibold"
              style={{ color: INK }}
              data-testid="text-expert-name"
            >
              {fullName}
            </h3>
            {verified && <CheckCircle className="h-3.5 w-3.5 shrink-0 fill-blue-500 text-blue-500" />}
          </div>
          {location && (
            <div className="flex items-center gap-1 text-[11px]" style={{ color: MUTED }}>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{location}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsFavorite(!isFavorite)}
          className="shrink-0 rounded-full p-1 hover:bg-black/5"
          data-testid="button-favorite"
          aria-label="Save expert"
        >
          <Heart className={cn("h-4 w-4 transition-colors", isFavorite ? "fill-[#fb3b63] text-[#fb3b63]" : "text-gray-400")} />
        </button>
      </div>

      {/* Meta line — the mock's "Itinerary planning · ★4.9 · from €249" grammar */}
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: GOLD }}>
          <Star className="h-3 w-3 fill-current" />
          {expertRating !== null ? (
            <>
              {expertRating.toFixed(1)}
              {reviewsCount !== null && <span className="font-medium" style={{ color: MUTED }}>&nbsp;({reviewsCount})</span>}
            </>
          ) : (
            <span className="font-semibold" style={{ color: MUTED }}>New</span>
          )}
        </span>
        {tripsCount !== null && (
          <span className="inline-flex items-center gap-0.5" style={{ color: MUTED }}>
            <span>·</span><Briefcase className="h-3 w-3" />{tripsCount} trips
          </span>
        )}
        {responseTime && (
          <span className="inline-flex items-center gap-0.5" style={{ color: MUTED }}>
            <span>·</span><Clock className="h-3 w-3" />{responseTime}
          </span>
        )}
        {lowestPrice !== null && (
          <span className="ml-auto font-bold" style={{ color: INK }} data-testid="text-price">
            from ${lowestPrice}
          </span>
        )}
      </div>

      {(specialties.length > 0 || languages.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {specialties.slice(0, 3).map((specialty, idx) => (
            <span
              key={idx}
              className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "#f5f7fa", color: "#667085" }}
              data-testid={`badge-specialty-${idx}`}
            >
              {specialty}
            </span>
          ))}
          {languages.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: MUTED }}>
              <Languages className="h-3 w-3" />
              {languages.slice(0, 2).join(", ")}
            </span>
          )}
        </div>
      )}

      {showNeighbourhoods && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1" data-testid="neighbourhood-chips" title="Neighbourhoods covered by this expert">
          <Home className="h-3 w-3 shrink-0" style={{ color: "#0F6E56" }} />
          {neighbourhoods.slice(0, 3).map((n, idx) => (
            <Badge
              key={idx}
              variant="outline"
              className={cn(
                "border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400",
                onNeighbourhoodClick && "cursor-pointer transition-colors hover:border-emerald-400 hover:bg-emerald-100 dark:hover:border-emerald-600 dark:hover:bg-emerald-900/50"
              )}
              data-testid={`badge-neighbourhood-${idx}`}
              onClick={onNeighbourhoodClick ? (e) => { e.preventDefault(); e.stopPropagation(); onNeighbourhoodClick(n); } : undefined}
            >
              {n}
            </Badge>
          ))}
          {neighbourhoods.length > 3 && (
            <span className="text-[10px] text-[#9CA3AF]">+{neighbourhoods.length - 3}</span>
          )}
        </div>
      )}

      {/* Storefront — what this expert sells + real sales volume (§13: hidden at 0). */}
      {hasStorefront && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="expert-storefront">
          {servicesCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--earn-teal-wash)", color: "var(--earn-teal-ink)" }}
              data-testid="storefront-services"
            >
              <Briefcase className="h-2.5 w-2.5" />
              {servicesCount} {servicesCount === 1 ? "service" : "services"}
            </span>
          )}
          {packagesCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--earn-teal-wash)", color: "var(--earn-teal-ink)" }}
              data-testid="storefront-trips"
            >
              <BookOpen className="h-2.5 w-2.5" />
              {packagesCount} {packagesCount === 1 ? "trip" : "trips"}
            </span>
          )}
          {totalSales > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--earn-gold-wash)", color: "var(--earn-gold-ink)" }}
              data-testid="storefront-sales"
              title={`${serviceBookings} bookings · ${packagesSold} trips sold`}
            >
              <TrendingUp className="h-2.5 w-2.5" />
              {totalSales} sold
            </span>
          )}
        </div>
      )}

      {expert.handle && (
        <div className="mt-2">
          <StorefrontLink
            handle={expert.handle}
            name={expert.firstName || undefined}
            variant="inline"
            data-testid={`link-expert-storefront-${expert.id}`}
          />
        </div>
      )}

      {/* Action grammar — the mock's two-button row (secondary + primary CTA) */}
      <div className="mt-auto flex items-center gap-2 pt-2.5" style={{ borderTop: `1px solid ${LINE}`, marginTop: "10px" }}>
        <button
          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition-colors hover:bg-black/[.03]"
          style={{ borderColor: "#d0d5dd", color: "#344054" }}
          data-testid="button-message"
          onClick={() => setLocation(`/chat?expertId=${expert.id}`)}
        >
          <MessageCircle className="h-3 w-3" />
          Message
        </button>
        <Link href={`/experts/${expert.id}${detailQuery ?? ""}`} className="flex-1">
          <button
            className="flex h-7 w-full items-center justify-center gap-1 rounded-md text-[11px] font-bold text-white transition-transform hover:-translate-y-px"
            style={{ background: PINK, boxShadow: "0 4px 12px rgba(251,59,99,.18)" }}
            data-testid="button-view-profile"
          >
            View profile
          </button>
        </Link>
      </div>
    </article>
  );
}
