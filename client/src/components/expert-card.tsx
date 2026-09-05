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
import { Link } from "wouter";
import { useState } from "react";
import { StorefrontLink } from "@/components/marketplace/storefront-link";
import { formatExpertResponseTime } from "@/lib/expert-response-time";
import { labelForExpertSpecialization, resolveExpertSpecializations } from "@shared/expert-vocabulary";
import { useExpertOfferingLabels } from "@/lib/use-expert-offering-labels";
// Locked Decision 40 (lane 3): ONE decision about how a card addresses an earner — the handle
// when the row has one, the id route only while it has none (§18 rule 1).
import { earnerProfilePath } from "@/lib/earner-address";
import { useAskExpert } from "@/lib/use-ask-expert";

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
// Geist Mono for the earn family-card facts row + source row (SPEC §1: labels/numbers).
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

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
      /** `local_expert_forms.specializations` — the APPLICATION's answer. Historical; read only
       *  as `resolveExpertSpecializations`'s documented last resort (gap 9). */
      specializations?: string[];
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
  /**
   * Presentation variant. "default" (existing browse card) is unchanged.
   * "anchor" (city-feed bento, Phase 2) renders the dark-gradient lead-expert
   * anchor treatment: neutral role badge, Fraunces name, lede, the coral
   * "Plan with {name} · from $N" primary (the ONE coral CTA on the surface —
   * Phase 2c; renders the price only when a real one exists, §13) and an
   * outline "View profile". ADDITIVE — no default-path prop removed.
   */
  variant?: "default" | "anchor";
}

const FRAUNCES = "'Fraunces', Georgia, serif";

/** Lowest real starting price across an expert's offerings, or null (§13). */
function expertLowestPrice(expert: ExpertCardProps["expert"]): number | null {
  const fromServices = expert.selectedServices?.length
    ? Math.min(...expert.selectedServices.map((s) => parseFloat(s.offering?.price || "0")))
    : null;
  const direct = [(expert as any).startingPrice, (expert as any).fromPrice, (expert as any).lowestPrice]
    .map((v) => (v == null ? NaN : Number(v)))
    .find((n) => !isNaN(n) && n > 0);
  const candidates = [fromServices, direct].filter(
    (n): n is number => typeof n === "number" && !isNaN(n) && n > 0,
  );
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** Dark-gradient anchor treatment (city-feed bento lead expert). */
function ExpertAnchorCard({ expert, detailQuery }: { expert: ExpertCardProps["expert"]; detailQuery?: string }) {
  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Local Expert";
  const firstName = expert.firstName || "your expert";
  const lede =
    (expert as any).headline ||
    (expert.bio ? String(expert.bio).slice(0, 140) : null) ||
    `Plan your trip with a local who knows the ground.`;
  const price = expertLowestPrice(expert);
  const roleBadge = expert.role ? ROLE_BADGE[expert.role] : null;

  return (
    <article
      className="relative flex h-full flex-col justify-end overflow-hidden rounded-[16px] p-5 text-white"
      style={{
        background:
          "linear-gradient(150deg, #1E3A5F 0%, #16293F 55%, #0F1E30 100%)",
        boxShadow: "0 8px 28px rgba(15,30,48,.28)",
      }}
      data-testid={`card-expert-${expert.id}`}
      data-expert-variant="anchor"
    >
      {expert.profileImageUrl && (
        <img
          src={expert.profileImageUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
          loading="lazy"
        />
      )}
      {/* Bottom-aligned content block (Phase 2d): the article is justify-end and
          this block takes no flex-1, so badge → name → lede → CTAs hug the card
          bottom and the name can never hit the top edge. */}
      <div className="relative z-10 flex flex-col">
        <span
          className="mb-2 inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ background: "rgba(255,255,255,.14)", color: "rgba(255,255,255,.78)" }}
          data-testid="badge-expert-role"
        >
          {roleBadge ? roleBadge.label : "Local Expert"}
        </span>
        <h3
          className="text-[28px] font-semibold leading-[1.05] text-white"
          style={{ fontFamily: FRAUNCES }}
          data-testid="text-expert-name"
        >
          {fullName}
        </h3>
        <p className="mt-2 max-w-[42ch] text-[13px] leading-snug text-white/80 line-clamp-3">
          {lede}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <Link href={`${earnerProfilePath(expert) ?? "/experts"}${detailQuery ?? ""}`}>
            <button
              className="inline-flex h-9 items-center rounded-md px-3.5 text-[12px] font-bold text-white"
              style={{ background: "#E85D55", boxShadow: "0 4px 14px rgba(232,93,85,.35)" }}
              data-testid="button-plan-with-expert"
            >
              {price !== null ? `Plan with ${firstName} · from $${price}` : `Plan with ${firstName}`}
            </button>
          </Link>
          <Link href={`${earnerProfilePath(expert) ?? "/experts"}${detailQuery ?? ""}`}>
            <button
              className="inline-flex h-9 items-center rounded-md border border-white/40 px-3.5 text-[12px] font-semibold text-white/90 hover:bg-white/10"
              data-testid="button-view-profile"
            >
              View profile
            </button>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ExpertCard({ expert, onNeighbourhoodClick, detailQuery, variant = "default" }: ExpertCardProps) {
  // Gap 8: one shared, deduped read of the expert offering catalog (see the hook's header) —
  // forty cards on a browse page make one request.
  const offeringLabels = useExpertOfferingLabels();
  // Locked Decision 40 (lane 3): the shared contact rail. Addresses the earner by HANDLE when the
  // row carries one; the hook keeps the legacy `?expertId=` path for a row that does not.
  const askExpert = useAskExpert();
  if (variant === "anchor") {
    return <ExpertAnchorCard expert={expert} detailQuery={detailQuery} />;
  }
  const [isFavorite, setIsFavorite] = useState(false);

  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Expert";
  const initials = `${expert.firstName?.[0] || "T"}${expert.lastName?.[0] || "E"}`;

  const lowestPrice = expert.selectedServices?.length
    ? Math.min(...expert.selectedServices.map(s => parseFloat(s.offering?.price || "0")))
    : null;

  const location = expert.expertForm?.city && expert.expertForm?.country
    ? `${expert.expertForm.city}, ${expert.expertForm.country}`
    : expert.expertForm?.destinations?.[0] || null;

  const languages = expert.expertForm?.languages || [];
  const responseTime = formatExpertResponseTime(
    expert.responseTime || expert.expertForm?.responseTime,
  );
  const expertRating: number | null =
    typeof expert.expertRating === "number" ? expert.expertRating : null;
  const reviewsCount = (expert.expertReviewCount ?? expert.reviewsCount) || null;
  const tripsCount = expert.tripsCount || null;
  const verified = expert.expertForm?.identityVerificationStatus === "verified"
    || expert.verified === true;
  const superExpert = expert.superExpert || false;

  // Gaps 8 + 9 (ledger `2026-09-04-earn-contained-fixes`). The empty-array-is-truthy fix
  // (audit B2) survives inside `resolveExpertSpecializations`, which is now the ONE answer to
  // "which store does an expert's specializations come from" — this card and `expert-detail.tsx`
  // read the same function, so the browse card and the profile can no longer disagree. Each
  // value is then rendered through the ONE label map: an enum slug becomes its human label, an
  // offering key becomes that catalog row's display name, and anything else renders as-is.
  const specialties = resolveExpertSpecializations(expert).slice(0, 2);
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
              {labelForExpertSpecialization(specialty, offeringLabels)}
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

      {/* Facts row (earn family grammar §3.8) — 3 mono columns: starting price ·
          rating · offerings. ADDITIVE: the meta line above is untouched. Every value
          is a real record field (§13) — an absent price shows "—", no reviews shows
          "New", offerings is the real approved services + published trips count. */}
      <div
        className="mt-2.5 grid grid-cols-3 gap-2 border-t pt-2"
        style={{ borderColor: LINE }}
        data-testid="expert-facts"
      >
        <div>
          <div className="text-[13px] font-semibold leading-none" style={{ color: INK, fontFamily: EARN_MONO }} data-testid="fact-expert-price">
            {lowestPrice !== null ? `$${lowestPrice}` : "—"}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide leading-none" style={{ color: MUTED, fontFamily: EARN_MONO }}>
            plan it for me
          </div>
        </div>
        <div>
          <div className="text-[13px] font-semibold leading-none" style={{ color: INK, fontFamily: EARN_MONO }} data-testid="fact-expert-rating">
            {expertRating !== null ? expertRating.toFixed(1) : "New"}
            {expertRating !== null && reviewsCount !== null && (
              <span className="font-medium" style={{ color: MUTED }}>&nbsp;({reviewsCount})</span>
            )}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide leading-none" style={{ color: MUTED, fontFamily: EARN_MONO }}>
            {expertRating !== null ? "rating" : "no reviews yet"}
          </div>
        </div>
        <div>
          <div className="text-[13px] font-semibold leading-none" style={{ color: INK, fontFamily: EARN_MONO }} data-testid="fact-expert-offerings">
            {servicesCount + packagesCount}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide leading-none" style={{ color: MUTED, fontFamily: EARN_MONO }}>
            offerings
          </div>
        </div>
      </div>

      {/* Source row (card-source-link §3.8) — where this card resolves back to: a
          claimed handle → the /s/ storefront, otherwise the expert's own profile.
          ADDITIVE and never a dead end; the StorefrontLink CTA above is unchanged. */}
      <div
        className="mt-2 flex items-center gap-1 text-[11.5px]"
        style={{ fontFamily: EARN_MONO, color: MUTED }}
        data-testid="row-expert-source"
      >
        {expert.handle ? (
          <Link
            href={`/s/${expert.handle}`}
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color: "#185FA5" }}
            data-testid={`source-storefront-${expert.id}`}
          >
            <Home className="h-3 w-3 shrink-0" /> @{expert.handle}
          </Link>
        ) : (
          <Link
            href={`${earnerProfilePath(expert) ?? "/experts"}${detailQuery ?? ""}`}
            className="inline-flex items-center gap-1 hover:underline"
            data-testid={`source-profile-${expert.id}`}
          >
            <MapPin className="h-3 w-3 shrink-0" /> {fullName}
          </Link>
        )}
      </div>

      {/* Action grammar — the mock's two-button row (secondary + primary CTA) */}
      <div className="mt-auto flex items-center gap-2 pt-2.5" style={{ borderTop: `1px solid ${LINE}`, marginTop: "10px" }}>
        <button
          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition-colors hover:bg-black/[.03]"
          style={{ borderColor: "#d0d5dd", color: "#344054" }}
          data-testid="button-message"
          onClick={() =>
            askExpert({
              // The HANDLE is the address; the server resolves the earner and answers with an
              // opaque conversation id. `expertId` is the fallback for an expert who has claimed
              // no handle — LD 40 lane 2: still id-addressed for those rows only.
              handle: expert.handle ?? null,
              expertId: expert.handle ? null : String(expert.id),
              fallbackName: fullName,
              fallbackAvatar: expert.profileImageUrl ?? null,
            })
          }
        >
          <MessageCircle className="h-3 w-3" />
          Message
        </button>
        <Link href={`${earnerProfilePath(expert) ?? "/experts"}${detailQuery ?? ""}`} className="flex-1">
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
