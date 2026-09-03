/**
 * Public earner storefront — /s/:handle (backoffice Phase 1b, identity-hero rebuild).
 *
 * CONTINUITY REBUILD (docs/design/storefront-continuity ledger row): re-laid the identity-hero
 * page onto the approved continuity mock
 * (artifacts/mockup-sandbox/.../marketplace-details/ProviderStorefrontContinuity.tsx +
 * attached_assets/Marketplace-Provider-Storefront-continuity_*.png) — cover+avatar consolidated
 * into one bordered hero card, an eyebrow/proof-line identity treatment, a fact strip with an
 * honest "N ways to plan" note (only rendered when the earner genuinely has more than one lane),
 * a category-tab + search toolbar over the three offering lanes, Yuki-spec offering cards
 * (rating/price header row, "Secure checkout" footer badge), the "not sure what you're looking
 * for?" message band and the trust strip. PURE CLIENT DIFF — page-local only (no shared-component
 * extraction; two sibling lanes are rebuilding service-detail.tsx/experts.tsx concurrently),
 * built with existing Tailwind theme tokens (bg-[var(--earn-card)]/border/text-primary/etc.) rather than the
 * mock's own hardcoded palette, so dark mode — already supported here — keeps working.
 *
 * Every number/badge still maps to a real field returned by GET /api/storefront/:handle —
 * reviewCount=0 renders "New", never a fabricated score; the verified pill only renders when the
 * server says the identity verification is genuinely approved; the mock's per-card marketing
 * "description" line has NO real-data counterpart and is deliberately omitted rather than
 * invented (§13). The tab/search toolbar is a client-side filter over the real three arrays —
 * default state (category "All", empty search) reproduces the exact pre-rebuild render, so the
 * existing per-lane data-testids and their Playwright coverage (offering-card.spec.ts) still hold.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import { useRoute, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo-head";
import { useAuth } from "@/hooks/use-auth";
import { useAskExpert } from "@/lib/use-ask-expert";
import { LanguageMenu } from "@/components/language-menu";
import { useLocale } from "@/hooks/use-locale";
import { useTranslation } from "react-i18next";
import { isPlaceAnchored } from "@shared/service-fundamentals";
import { isProviderRole } from "@shared/roles";
import {
  Star,
  MapPin,
  Share2,
  ShieldCheck,
  MessageCircle,
  ShieldAlert,
  Handshake,
  BadgeCheck,
  Search,
  Sparkles,
  Check,
  X,
} from "lucide-react";

// SPEC §1 type: Fraunces for editorial headings, Geist Mono for eyebrows/facts/labels.
const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface StorefrontEarner {
  // Not sensitive — user ids are already public on /experts/:id and similar surfaces.
  id: string;
  name: string;
  bio: string | null;
  profileImageUrl: string | null;
  role: string;
  handle: string;
  averageRating: number | null;
  reviewCount: number;
  verified: boolean;
  location: string | null;
  memberSince: string | null;
  coverImageUrl: string | null;
  offeringsCount: number;
  /** Gems attributed to this earner (curated_by_expert_id — 2026-08-29-replit-gem-audit
   *  ruling 7). Rendered as "{N} gems shared" ONLY when > 0 (§13 — never a padded zero). */
  gemsSharedCount?: number;
}

interface StorefrontService {
  id: string;
  serviceName: string;
  price: string | null;
  priceType: string | null;
  pricingUnit: string | null;
  deliveryMethod: string | null;
  serviceImage: string | null;
  averageRating: string | null;
  reviewCount: number | null;
  // D5: text-only location chip for place-anchored listings — city-level only, no map tiles.
  city: string | null;
  productShape: string | null;
  // C3 (ruling 74/75): per-listing card display options, resolved server-side (bookingMode is
  // always concrete; showPrice defaults true). A provider who hides the price hides it here too.
  showPrice?: boolean;
  bookingMode?: "instant" | "request" | "hidden";
  // Ruling 116: true when the viewer's locale differs from this listing's source language and
  // no approved translation exists — the card shows the honest original and the lane renders
  // the one-line note below (§13; the detail page carries the full per-listing label).
  shownInOriginal?: boolean;
}

interface StorefrontReadyMade {
  id: string;
  title: string;
  heroImageUrl: string | null;
  priceCents: number | null;
  durationDays: number | null;
  insideCounts: { items?: number } | null;
}

interface StorefrontData {
  earner: StorefrontEarner;
  services: StorefrontService[];
  readyMade: StorefrontReadyMade[];
  // Vacation mode (mockup §06b/§08, CLAUDE.md, migration 189): business-level flag only —
  // null when the owner isn't away. The server (storefront.routes.ts loadStorefront) already
  // computes this; the client just needed to render it (link-landing polish).
  away: { until: string; message: string | null } | null;
}

const DELIVERY_LABELS: Record<string, string> = {
  pdf: "PDF guide",
  video: "Video call",
  call: "Phone call",
  in_person: "In-person",
  voice_notes: "Voice notes",
  async_messaging: "Messaging",
  hybrid: "Hybrid",
};

type OfferingCategory = "All" | "Services" | "Ready-Made Trips";

/** Tab/testid-safe slug for a category label ("Ready-Made Trips" → "ready-made-trips"). */
function categorySlug(c: OfferingCategory): string {
  return c.toLowerCase().replace(/\s+/g, "-");
}

function priceUnitLabel(priceType: string | null, pricingUnit: string | null): string | null {
  if (pricingUnit === "per_night") return "per night";
  if (priceType === "per_person") return "per person";
  if (priceType === "hourly") return "per hour";
  if (priceType === "per_event") return "per event";
  return null;
}

function RatingLine({ rating, count }: { rating: string | number | null; count: number | null }) {
  if (!count || count === 0 || rating == null) {
    return <Badge variant="outline" className="text-[11px] w-fit">New</Badge>;
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-500">
      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
      {Number(rating).toFixed(1)}
      <span className="font-normal text-[color:var(--earn-muted)]">· {count} review{count === 1 ? "" : "s"}</span>
    </span>
  );
}

function LaneHeader({ eyebrow, title, count }: { eyebrow: string; title: string; count: number }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-2">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]" style={{ fontFamily: EARN_MONO }}>{eyebrow}</div>
        <h2 className="mt-0.5 text-[24px] font-semibold tracking-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>{title}</h2>
      </div>
      <div className="text-sm tabular-nums text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
        {count} available
      </div>
    </div>
  );
}

/**
 * Storefront-local offering card — the continuity mock's `.psc-offering` treatment
 * (category label on the image, rating+price header row, footer "Secure checkout" +
 * CTA) reimplemented page-locally rather than by editing the shared
 * client/src/components/OfferingCard.tsx (which Catalog's Preview toggle also renders —
 * out of this lane's diff). Same prop contract and the same rendered text/testid/href
 * behavior as the shared card, so offering-card.spec.ts's assertions (title heading,
 * price/CTA text, href pattern, testid) hold unchanged.
 */
function StorefrontOfferingCard({
  href,
  testId,
  image,
  categoryLabel,
  title,
  chips,
  ratingSlot,
  price,
  unit,
  cta,
  showPrice,
  bookingMode,
  meta,
}: {
  href: string;
  testId: string;
  image: string | null;
  categoryLabel: string;
  title: string;
  chips: string[];
  ratingSlot: ReactNode;
  price: string;
  unit?: string | null;
  cta: string;
  showPrice?: boolean;
  bookingMode?: "instant" | "request" | "hidden";
  /** Optional one-line description shown under the title — e.g. distinguishing what a
   *  merged-lane card's badge means in practice ("Guide · day-by-day, yours to follow"). */
  meta?: string;
}) {
  const priceHidden = showPrice === false;
  const ctaLabel =
    bookingMode === "request" ? "Request to book →"
    : bookingMode === "hidden" ? "Enquire →"
    : cta;
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-[var(--earn-card)] no-underline text-inherit transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"
    >
      <div
        className={`relative h-36 w-full shrink-0 ${image ? "bg-cover bg-center" : "bg-gradient-to-br from-primary/60 to-primary"}`}
        style={image ? { backgroundImage: `url(${image})` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
        <span className="absolute left-2.5 bottom-2.5 rounded-md bg-white/92 px-2 py-1 text-[10px] font-bold text-[color:var(--earn-ink)] dark:bg-black/70 dark:text-white">
          {categoryLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          {ratingSlot}
          <span className="whitespace-nowrap text-[11px] text-[color:var(--earn-muted)]">
            {priceHidden ? null : (
              <>
                <span className="text-base font-bold text-[color:var(--earn-ink)]">{price}</span>
                {unit && <span className="ml-1">{unit}</span>}
              </>
            )}
          </span>
        </div>
        {/* line-clamp keeps card heights aligned across a row — an unclamped long title
            previously made one card in a grid row taller than its siblings. */}
        <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">{title}</h3>
        {meta && <p className="line-clamp-1 text-[11.5px] leading-snug text-[color:var(--earn-muted)]">{meta}</p>}
        {chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full border bg-[var(--earn-chip)]/60 px-2 py-0.5 text-[11px] font-medium text-[color:var(--earn-muted)]"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
          {priceHidden ? (
            <span className="text-sm font-medium text-[color:var(--earn-muted)]" data-testid={`${testId}-enquire-price`}>
              Enquire for pricing
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-500">
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure checkout
            </span>
          )}
          <span className="text-sm font-semibold text-primary whitespace-nowrap">{ctaLabel}</span>
        </div>
      </div>
    </Link>
  );
}

export default function StorefrontPage() {
  const [, storefrontParams] = useRoute("/s/:handle");
  const [, legacyStorefrontParams] = useRoute("/p/:handle");
  const handle = storefrontParams?.handle ?? legacyStorefrontParams?.handle ?? "";
  const { toast } = useToast();
  const { user } = useAuth();
  const askExpert = useAskExpert();
  const { t } = useTranslation("common");
  // Ruling 116 (distribution-language audit P1): the storefront is a first-class link/QR landing,
  // so the receiver must be able to switch language here like on /services/:id. The resolved
  // chrome locale rides the read as ?locale= (part of the key → switching refetches) and the
  // server overlays approved content translations on the cards.
  const { locale } = useLocale();

  const [category, setCategory] = useState<OfferingCategory>("All");
  const [query, setQuery] = useState("");

  const { data, isLoading, isError } = useQuery<StorefrontData>({
    queryKey: [`/api/storefront/${handle}`, { locale }],
    enabled: handle.length > 0,
    retry: false,
  });

  function copyLink() {
    const url = `${window.location.origin}/s/${handle}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied", description: "Share it anywhere — it books and pays." });
    });
  }

  // Category/search filter over the three real arrays — computed unconditionally (before any
  // early return) so hook order stays stable; it's a no-op object when `data` hasn't loaded yet.
  const term = query.trim().toLowerCase();
  const matchesTerm = (title: string) => !term || title.toLowerCase().includes(term);
  const services = data?.services ?? [];
  const readyMade = data?.readyMade ?? [];
  const visibleServices = useMemo(
    () => (category === "All" || category === "Services" ? services.filter((s) => matchesTerm(s.serviceName)) : []),
    [services, category, term],
  );
  // The lane's `expert_templates` half RETIRED — ledger
  // 2026-09-03-expert-templates-consumer-sunset. "Ready-Made Trips" is now one product,
  // `ready_made_trips` (an author-owned trip that clones into the buyer's editable planner),
  // so the display-layer merge of two sources is gone with it.
  const visibleReadyMade = useMemo(
    () => (category === "All" || category === "Ready-Made Trips" ? readyMade.filter((r) => matchesTerm(r.title)) : []),
    [readyMade, category, term],
  );
  const visibleTotal = visibleServices.length + visibleReadyMade.length;
  const availableCategories: OfferingCategory[] = [
    "All",
    ...(services.length > 0 ? (["Services"] as const) : []),
    ...(readyMade.length > 0 ? (["Ready-Made Trips"] as const) : []),
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--earn-ground)]">
        <Skeleton className="h-14 w-full rounded-none" />
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[var(--earn-ground)] flex items-center justify-center">
        <div className="max-w-md mx-auto px-4 py-20 text-center" data-testid="storefront-not-found">
          <h1 className="text-2xl font-bold mb-2">Storefront not found</h1>
          <p className="text-[color:var(--earn-muted)] mb-6">
            This link may be incorrect, or the owner has no bookable offerings yet.
          </p>
          <Link href="/discover">
            <Button>Explore Traveloure</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { earner, away } = data;
  // Hide the CTA when the signed-in visitor IS the earner — no message-myself button/band.
  const isOwnStorefront = !!user && String(user.id) === String(earner.id);
  // Vacation mode (mockup §08/§06b): listings stay visible, booking is disabled — the actual
  // booking block lives on each offering's own detail page (service-detail.tsx); here it's
  // the honest "Away" signal plus a CTA label that no longer promises "book".
  const awayUntilLabel = away
    ? new Date(away.until).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  const memberSinceYear = earner.memberSince ? new Date(earner.memberSince).getFullYear() : null;
  const initial = earner.name.charAt(0).toUpperCase() || "T";
  const firstName = earner.name.split(" ")[0];
  // §3.10 eyebrow: SERVICE PROVIDER STOREFRONT / LOCAL EXPERT STOREFRONT (uppercased in CSS).
  const eyebrowLabel = isProviderRole(earner.role) ? "Service provider storefront" : "Local expert storefront";
  const verifiedLabel = isProviderRole(earner.role) ? "Verified business" : "Identity verified";
  const storefrontTitle = isProviderRole(earner.role)
    ? `${earner.name} — Book local services`
    : `${earner.name} — Book local experiences`;
  const storefrontDescription = isProviderRole(earner.role)
    ? `${earner.bio ? `${earner.bio} ` : ""}${services.length} bookable service${services.length === 1 ? "" : "s"} from ${earner.name} on Traveloure. Secure checkout, verified reviews.`
    : earner.bio ?? `Bookable experiences from ${earner.name} on Traveloure.`;

  // Honest "N ways to plan" note (continuity mock's summary callout): only rendered when the
  // earner genuinely sells across more than one lane — never implies three when there's one.
  const presentLaneNames: string[] = [
    ...(services.length > 0 ? [`book time with ${firstName}`] : []),
    ...(readyMade.length > 0 ? ["start from a finished plan"] : []),
  ];
  const planWaysNote =
    presentLaneNames.length > 1
      ? `${presentLaneNames.length} ways to plan — ${presentLaneNames.slice(0, -1).join(", ")}${presentLaneNames.length > 2 ? "," : ""} or ${presentLaneNames[presentLaneNames.length - 1]}.`
      : null;

  const offeringsHeading = earner.location ? `Plans shaped around ${earner.location}` : `What ${firstName} offers`;

  function messageEarner() {
    askExpert({
      expertId: earner.id,
      returnTo: `/s/${handle}`,
      fallbackName: earner.name,
      fallbackAvatar: earner.profileImageUrl ?? undefined,
    });
  }

  function clearFilters() {
    setQuery("");
    setCategory("All");
  }

  return (
    <div className="min-h-screen bg-[var(--earn-ground)]" data-testid="storefront-page">
      <SEOHead
        title={storefrontTitle}
        description={storefrontDescription}
        url={`/s/${earner.handle}`}
        type="profile"
      />

      {/* Minimal branded header (standalone page, no site chrome) — same idiom as the
          ready-made-detail.tsx share/OG page frame. Ruling 116: the 🌐 selector rides here so a
          link/QR recipient (guest included) can switch language — same one-selector rule as the
          Layout header (ruling 60 entry point (b)). */}
      <div className="border-b bg-[var(--earn-card)]">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center" data-testid="link-storefront-logo">
            <TraveloureLogo />
          </Link>
          <LanguageMenu />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        {/* Identity hero card — cover + overlapping avatar + name/handle/verified/bio/proof line,
            consolidated into one bordered card (continuity mock's `.psc-hero`). */}
        <div className="overflow-hidden rounded-2xl border bg-[var(--earn-card)] shadow-sm">
          {/* Cover band — earner-chosen (users.preferences.storefront.coverImageUrl), gradient
              fallback. Link-landing polish (mockup §08): shorter on mobile so a texted storefront
              link gets its first bookable card above the fold on a 375px viewport. */}
          <div
            className={`h-28 sm:h-44 w-full ${earner.coverImageUrl ? "bg-cover bg-center" : "bg-gradient-to-br from-primary/50 via-primary/70 to-primary"}`}
            style={earner.coverImageUrl ? { backgroundImage: `url(${earner.coverImageUrl})` } : undefined}
            data-testid="storefront-cover"
          />

          <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[88px_1fr_auto] gap-x-4 gap-y-4 sm:gap-x-5 px-5 sm:px-7 pb-6">
            {earner.profileImageUrl ? (
              <img
                src={earner.profileImageUrl}
                alt={earner.name}
                className="-mt-9 sm:-mt-11 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-full object-cover border-4 border-[color:var(--earn-card)] shadow-md shrink-0"
              />
            ) : (
              <div className="-mt-9 sm:-mt-11 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-full border-4 border-[color:var(--earn-card)] shadow-md shrink-0 flex items-center justify-center text-2xl sm:text-3xl font-bold text-white bg-gradient-to-br from-primary/60 to-primary">
                {initial}
              </div>
            )}

            <div className="pt-3 sm:pt-4 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]" style={{ fontFamily: EARN_MONO }}>{eyebrowLabel}</div>
                  <h1 className="mt-0.5 text-[30px] sm:text-[34px] font-semibold tracking-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }} data-testid="storefront-name">{earner.name}</h1>
                </div>
                {earner.verified && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0"
                    style={{ borderWidth: 1, borderStyle: "solid", borderColor: "var(--earn-green-ink)", background: "var(--earn-teal-wash)", color: "var(--earn-green-ink)" }}
                    data-testid="badge-storefront-verified"
                    title="This earner's identity has been verified"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {verifiedLabel}
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--earn-muted)]">
                <span>@{earner.handle}</span>
                {earner.location && (
                  <>
                    <span className="text-[color:var(--earn-muted)]/50">·</span>
                    <span className="inline-flex items-center gap-1" data-testid="storefront-location">
                      <MapPin className="w-3.5 h-3.5" />
                      {earner.location}
                    </span>
                  </>
                )}
                {away && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-800"
                    data-testid="badge-storefront-away"
                  >
                    Away — back {awayUntilLabel}
                  </Badge>
                )}
              </div>

              {away?.message && (
                <p className="mt-1 text-sm text-amber-800" data-testid="storefront-away-message">
                  {away.message}
                </p>
              )}

              {earner.bio && (
                <p className="mt-2.5 text-sm text-[color:var(--earn-ink)] max-w-2xl">{earner.bio}</p>
              )}

              {/* Proof line — rating + member-since, both real fields (§13: no fabricated stats). */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-[color:var(--earn-muted)]">
                <span data-testid="storefront-earner-rating">
                  <RatingLine rating={earner.averageRating} count={earner.reviewCount} />
                </span>
                {memberSinceYear && (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    On Traveloure since {memberSinceYear}
                  </span>
                )}
              </div>
            </div>

            {/* Message/Share actions — stacked full-width on mobile so a long "Message @handle"
                label never gets squeezed into an equal-width flex-1 half (which wrapped its
                text while "Share" stayed single-line, leaving the two buttons visibly
                mismatched in height). From `sm:` up they sit side by side at their own
                natural width in the grid's `auto` column. On your own storefront there was
                previously no way back to editing from here — a lone "Share" button — so an
                "Edit profile" action replaces "Message @you" instead. */}
            <div className="flex flex-col sm:flex-row gap-2 sm:pt-4 col-span-2 sm:col-span-1">
              {isOwnStorefront ? (
                <Link href={isProviderRole(earner.role) ? "/provider/settings?tab=profile" : "/expert/settings?tab=profile"} className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto" data-testid="button-edit-storefront">
                    Edit profile
                  </Button>
                </Link>
              ) : (
                <Button className="w-full sm:w-auto" onClick={messageEarner} data-testid="button-message-storefront">
                  <MessageCircle className="w-4 h-4 mr-1.5 shrink-0" />
                  <span className="truncate">Message @{earner.handle}</span>
                </Button>
              )}
              <Button variant="outline" className="w-full sm:w-auto" onClick={copyLink} data-testid="button-share-storefront">
                <Share2 className="w-4 h-4 mr-1.5 shrink-0" />
                Share
              </Button>
            </div>
          </div>
        </div>

        {/* Fact strip — every number real: sum of the three lanes, real review count, real join
            year, real area of expertise (the earner's own location), and an honest multi-lane
            note (rendered only when there genuinely is more than one lane). */}
        <div
          className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border bg-[var(--earn-card)] px-6 py-4"
          style={{ fontFamily: EARN_MONO }}
          data-testid="storefront-facts"
        >
          <div>
            <div className="text-xl font-bold tabular-nums" data-testid="fact-offerings">{earner.offeringsCount}</div>
            <div className="text-xs uppercase tracking-wide text-[color:var(--earn-muted)] mt-0.5">Offerings</div>
          </div>
          <div className="border-l pl-8">
            <div className="text-xl font-bold tabular-nums" data-testid="fact-reviews">{earner.reviewCount}</div>
            <div className="text-xs uppercase tracking-wide text-[color:var(--earn-muted)] mt-0.5">Reviews</div>
          </div>
          {/* Ruling 7: renders ONLY when the earner has attributed gems — no zero tile. */}
          {(earner.gemsSharedCount ?? 0) > 0 && (
            <div className="border-l pl-8">
              <div className="text-xl font-bold tabular-nums" data-testid="fact-gems-shared">{earner.gemsSharedCount}</div>
              <div className="text-xs uppercase tracking-wide text-[color:var(--earn-muted)] mt-0.5">
                {earner.gemsSharedCount === 1 ? "Gem shared" : "Gems shared"}
              </div>
            </div>
          )}
          {memberSinceYear && (
            <div className="border-l pl-8">
              <div className="text-xl font-bold tabular-nums" data-testid="fact-member-since">{memberSinceYear}</div>
              <div className="text-xs uppercase tracking-wide text-[color:var(--earn-muted)] mt-0.5">On Traveloure since</div>
            </div>
          )}
          {earner.location && (
            <div className="border-l pl-8">
              <div className="text-xl font-bold" data-testid="fact-location">{earner.location}</div>
              <div className="text-xs uppercase tracking-wide text-[color:var(--earn-muted)] mt-0.5">Area of expertise</div>
            </div>
          )}
          {planWaysNote && (
            <div className="flex items-start gap-2 text-xs text-[color:var(--earn-muted)] sm:ml-auto max-w-sm" data-testid="storefront-plan-ways-note">
              <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <span>{planWaysNote}</span>
            </div>
          )}
        </div>

        {/* About — the bio promoted into its own labeled section below the hero, above
            Offerings, so a trust-scanning visitor can find "who is this person" without
            hunting through the hero card. The hero keeps its own bio line as the one-line
            hook; this is the fuller story (same text today — same-treatment across
            expert-detail.tsx and this page). Honest-omit: renders nothing when empty. */}
        {earner.bio && (
          <section className="mt-6 rounded-xl border bg-[var(--earn-card)] px-6 py-5" data-testid="storefront-about">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]" style={{ fontFamily: EARN_MONO }}>
              About
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--earn-ink)]">{earner.bio}</p>
          </section>
        )}

        {/* Offerings — category tabs + search over the three real lanes. Default state (category
            "All", empty search) is the exact pre-rebuild render: nothing here changes what
            offering-card.spec.ts already proves. */}
        <section className="mt-10 sm:mt-14">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]" style={{ fontFamily: EARN_MONO }}>Choose your starting point</div>
              <h2 className="mt-0.5 text-[24px] font-semibold tracking-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>{offeringsHeading}</h2>
            </div>
            <p className="text-sm text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }} data-testid="storefront-offering-count">
              {visibleTotal} offering{visibleTotal === 1 ? "" : "s"}
            </p>
          </div>

          {availableCategories.length > 1 && (
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex gap-1 overflow-x-auto rounded-lg bg-[var(--earn-chip)] p-1" role="tablist" aria-label="Offering categories">
                {availableCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={category === c}
                    onClick={() => setCategory(c)}
                    data-testid={`tab-storefront-category-${categorySlug(c)}`}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                      category === c ? "bg-[var(--earn-card)] text-[color:var(--earn-ink)] shadow-sm" : "text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-lg border bg-[var(--earn-card)] px-3 py-1.5 text-sm text-[color:var(--earn-muted)] min-w-[200px]">
                <Search className="w-4 h-4 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this storefront"
                  aria-label="Search this storefront"
                  data-testid="input-storefront-search"
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-[color:var(--earn-ink)] outline-none placeholder:text-[color:var(--earn-muted)]"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </label>
            </div>
          )}

          {visibleTotal === 0 && (
            <div className="flex min-h-[130px] flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-[color:var(--earn-muted)]" data-testid="storefront-empty-filter">
              <Search className="w-5 h-5" />
              <span>No offerings match your filter.</span>
              <button type="button" onClick={clearFilters} className="font-semibold text-primary">
                Clear filters
              </button>
            </div>
          )}

          {/* Lane 1: services — book directly */}
          {visibleServices.length > 0 && (
            <div className="mb-10 sm:mb-12" data-testid="storefront-lane-services">
              <LaneHeader eyebrow="Book directly" title="Services" count={visibleServices.length} />
              {/* Ruling 116 (§13): when any card falls back to its original language under the
                  viewer's locale, say so once — never a silent mix. */}
              {visibleServices.some((s) => s.shownInOriginal) && (
                <p className="mb-3 -mt-2 text-xs text-[color:var(--earn-muted)]" data-testid="text-storefront-original-language-note">
                  {t("contentTranslation.someInOriginal")}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleServices.map((s) => {
                  const chips = s.deliveryMethod && DELIVERY_LABELS[s.deliveryMethod]
                    ? [DELIVERY_LABELS[s.deliveryMethod]]
                    : [];
                  // D5: place-anchored listings get a city-level location chip (text only, from
                  // the row's own city field — nothing derived, nothing mapped; §13).
                  if (isPlaceAnchored({ deliveryMethod: s.deliveryMethod, productShape: s.productShape }) && s.city?.trim()) {
                    chips.push(`📍 ${s.city.trim()}`);
                  }
                  const unit = priceUnitLabel(s.priceType, s.pricingUnit);
                  const price = s.price ? `$${Number(s.price).toFixed(0)}` : "Custom quote";
                  // Vacation mode: the CTA stops promising "book" while the owner is away —
                  // the listing itself stays visible and clickable (its detail page carries
                  // the same honest away state and disables the actual booking action).
                  const cta = away ? "View listing →" : s.pricingUnit === "per_night" ? "Check dates →" : "View & book →";
                  return (
                    <StorefrontOfferingCard
                      key={s.id}
                      href={`/services/${s.id}`}
                      testId={`storefront-service-${s.id}`}
                      image={s.serviceImage}
                      categoryLabel="Service"
                      title={s.serviceName}
                      chips={chips}
                      ratingSlot={<RatingLine rating={s.averageRating} count={s.reviewCount} />}
                      price={price}
                      unit={s.price ? unit : null}
                      cta={cta}
                      showPrice={s.showPrice}
                      bookingMode={s.bookingMode}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Lane 2: Ready-Made Trips — author-owned trips that clone into the buyer's own
              planner. The retired `expert_templates` half of this lane is gone (ledger
              2026-09-03-expert-templates-consumer-sunset). */}
          {visibleReadyMade.length > 0 && (
            <div className="mb-10 sm:mb-12" data-testid="storefront-lane-readymade">
              <LaneHeader
                eyebrow="Start from a finished plan"
                title="Ready-Made Trips"
                count={visibleReadyMade.length}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleReadyMade.map((r) => {
                  const chips = [
                    ...(r.durationDays ? [`${r.durationDays} day${r.durationDays === 1 ? "" : "s"}`] : []),
                    ...(r.insideCounts?.items ? [`${r.insideCounts.items} stops`] : []),
                  ];
                  return (
                    <StorefrontOfferingCard
                      key={r.id}
                      href={`/ready-made/${r.id}`}
                      testId={`storefront-readymade-${r.id}`}
                      image={r.heroImageUrl}
                      categoryLabel="Editable trip"
                      meta="Editable trip · clones into your planner"
                      title={r.title}
                      chips={chips}
                      // Ready Made Trips have no review mechanism yet (§13) — no rating line,
                      // never a perpetual fake "New" badge for a lane that can't earn reviews.
                      ratingSlot={<span className="text-[11px] font-medium text-[color:var(--earn-muted)]">Complete trip</span>}
                      price={typeof r.priceCents === "number" ? `$${(r.priceCents / 100).toFixed(0)}` : "Contact for price"}
                      cta="Preview trip →"
                    />
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* "Not sure what you're looking for?" message band — same wiring as the hero CTA. */}
        {!isOwnStorefront && (
          <div className="mt-4 flex flex-wrap items-center gap-5 rounded-xl border bg-gradient-to-br from-primary/5 to-card p-6" data-testid="storefront-message-band">
            {earner.profileImageUrl ? (
              <img src={earner.profileImageUrl} alt={earner.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center text-lg font-bold text-white bg-gradient-to-br from-primary/60 to-primary">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-[240px]">
              <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--earn-muted)]">A good place to begin</div>
              <h3 className="mt-0.5 font-bold">Not sure what you're looking for?</h3>
              <p className="mt-1 text-sm text-[color:var(--earn-muted)] max-w-xl">
                Tell {firstName} what you're planning — a private tour, a special
                occasion, something seasonal — and get pointed to the right offering, or something custom.
              </p>
            </div>
            <Button onClick={messageEarner} data-testid="button-message-band">
              <MessageCircle className="w-4 h-4 mr-1.5" />
              Start a conversation
            </Button>
          </div>
        )}

        {/* Trust strip — three real, general platform facts (no response-time/fabricated stats). */}
        <div
          className="mt-8 mb-10 grid gap-5 sm:grid-cols-3 border-t pt-6 text-sm"
          data-testid="storefront-trust-strip"
        >
          <div className="flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5">Payment held until your booking completes</strong>
              <span className="text-xs text-[color:var(--earn-muted)]">
                Funds are secured through Traveloure and release to {firstName} only after your experience.
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5">Every listing is admin-reviewed</strong>
              <span className="text-xs text-[color:var(--earn-muted)]">
                Offerings appear here only after Traveloure approves them.
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Handshake className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5">Book and message in one place</strong>
              <span className="text-xs text-[color:var(--earn-muted)]">
                Your conversation, booking, and receipts stay on Traveloure.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
