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
 * WEDDING-FLOW RESTYLE (decision-maker request, Sep 5 2026 — "the storefront needs improved
 * styling to match our new UI"). The 2026-08-17-catalog-preview-upgrade row deliberately left
 * this surface alone ("reskinning the public storefront would be an un-ratified surface"); this
 * request is that ratification. The visual system is the ratified wedding-flow artboards
 * (docs/design/wedding-flow/{Main,Slip,Step4Who,Step5Events,Planner}.dc.html) as already applied
 * in code by client/src/components/trip/plan-modal.tsx and the landing components:
 *
 *   ground  --earn-ground · cards --earn-card on a 1px --earn-border hairline, no drop shadows
 *   type    Fraunces (serif display) for headings, Geist Mono small-caps for eyebrows / meta /
 *           counts / prices, Inter for body and buttons
 *   colour  --earn-navy for display headings, --earn-coral-ink for eyebrows and the ONE primary
 *           CTA (white text), --earn-teal-ink for informational marks, --earn-gold-* for
 *           ratings, --earn-green-ink for the checkout assurance, --earn-chip for pills
 *
 * STYLE-ONLY: no data, route, query, handler, href, copy-of-record or behaviour change, and every
 * data-testid is preserved byte-for-byte. The one CONTENT change is an honesty fix, not a
 * restyle: an earner with no published offerings at all used to be told "No offerings match your
 * filter" beside a Clear-filters button that could not do anything, because the filter branch was
 * the only empty state. Nothing-listed and nothing-matched are different facts (§13), so they now
 * render as two different states and neither invents a count.
 *
 * Every number/badge still maps to a real field returned by GET /api/storefront/:handle —
 * reviewCount=0 renders "New", never a fabricated score; the verified pill only renders when the
 * server says the identity verification is genuinely approved; the mock's per-card marketing
 * "description" line has NO real-data counterpart and is deliberately omitted rather than
 * invented (§13). The tab/search toolbar is a client-side filter over the real three arrays —
 * default state (category "All", empty search) reproduces the exact pre-rebuild render, so the
 * existing per-lane data-testids and their Playwright coverage (offering-card.spec.ts) still hold.
 *
 * No map renders on this surface (D5: place-anchored listings get a TEXT-only city chip, never a
 * tile), so no ODbL attribution is owed here.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";
import { useRoute, useSearch, Link, Redirect } from "wouter";
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
// THE ONE price-unit derivation (§18 rule 1, ledger `2026-09-14-price-unit-one-derivation`).
// This page used to carry its own `priceUnitLabel`; the phrases it returned are unchanged.
import { priceUnitPhrase } from "@/lib/price-unit";
import { isProviderRole } from "@shared/roles";
import { PlanEntryCta } from "@/components/planning/plan-entry-cta";
import {
  StorefrontBookingBar,
  StorefrontBookingPanel,
  useStorefrontPlanContext,
} from "@/components/storefront/StorefrontBookingPanel";
import { responseTimeFigure } from "@/lib/storefront-booking-panel";
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
  X,
} from "lucide-react";

// SPEC §1 type: Fraunces for editorial headings, Geist Mono for eyebrows/facts/labels.
// Same two faces plan-modal.tsx declares (its SERIF/MONO) and the ~20 landing/feed components
// declare as EARN_MONO — a per-file const is this codebase's existing convention for them.
const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** Hairline card — the one rounded/bordered rhythm every panel on this page uses. */
const CARD_SHELL = "rounded-xl border border-[color:var(--earn-border)] bg-[var(--earn-card)]";
/** Anchors the booking panel links to ("Choose a service", and the phone bar's "Start a plan"). */
const SERVICES_ANCHOR_ID = "storefront-services";
const PANEL_ANCHOR_ID = "storefront-booking";
/** Small-caps mono eyebrow — coral TEXT (an eyebrow never counts against the coral BUTTON budget). */
const EYEBROW = "text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]";

interface StorefrontEarner {
  /**
   * ⚠️ The comment that stood here — "Not sensitive — user ids are already public on /experts/:id
   * and similar surfaces" — is the same circular claim CLAUDE.md Locked Decision 40 retracted
   * server-side (`storefront.routes.ts`), and it is retracted here too.
   *
   * `users.id` is INTERNAL; this page's earner is addressed by `handle` everywhere now — the
   * Message CTA (`POST /api/conversations/start` with `{ handle }`) and the own-storefront check
   * both read the handle. OPTIONAL because lane 2 removes the field from `loadStorefront`'s
   * payload; nothing on this page reads it any more, and nothing new may.
   */
  id?: string;
  name: string;
  bio: string | null;
  profileImageUrl: string | null;
  role: string;
  handle: string | null;
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
  /** The expert's own stated response time (raw); shown only through `responseTimeFigure`. */
  responseTime?: string | null;
  /** A provider form's self-declared insurance flag; "Insured" only when `true`. */
  hasInsurance?: boolean | null;
  /** Whether this earner can be invited onto a traveler's plan (server's `isExpertHireable`). */
  acceptsPlanShares?: boolean;
  specialties?: string[];
  destinations?: string[];
  languages?: string[];
  neighborhoods?: string[];
  localSpecialties?: string[];
  headline?: string | null;
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
  /** The listing's public terms, for the booking panel's "every listing agrees" lines. */
  leadTimeHours?: number | null;
  cancellationPolicyType?: string | null;
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

function RatingLine({ rating, count }: { rating: string | number | null; count: number | null }) {
  if (!count || count === 0 || rating == null) {
    // A listing with no reviews yet says so in the mock's faint mono register — never a score.
    return (
      <span
        className="w-fit rounded-full border border-[color:var(--earn-border)] bg-[var(--earn-chip)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[color:var(--earn-muted)]"
        style={{ fontFamily: EARN_MONO }}
      >
        New
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-xs font-semibold text-[color:var(--earn-gold-ink)]"
      style={{ fontFamily: EARN_MONO }}
    >
      <Star className="w-3.5 h-3.5" style={{ color: "var(--earn-gold)", fill: "var(--earn-gold)" }} />
      {Number(rating).toFixed(1)}
      <span className="font-normal text-[color:var(--earn-muted)]">· {count} review{count === 1 ? "" : "s"}</span>
    </span>
  );
}

/**
 * One heading per lane. It carries NO count: the header's figures already state how many offerings
 * this earner has, and a third copy of the same number was one of the duplicates the storefront
 * booking-panel lane removed (ledger `2026-09-23-storefront-booking-panel`).
 */
function LaneHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <div className={EYEBROW} style={{ fontFamily: EARN_MONO }}>{eyebrow}</div>
      <h2 className="mt-1 text-[24px] font-semibold tracking-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>{title}</h2>
    </div>
  );
}

/**
 * One header figure — a serif number over a mono label (the "figures replace the meta line" design,
 * option B). Each is rendered only when its value is real; the caller omits the rest (§13).
 */
function HeaderFigure({ value, label, testId }: { value: ReactNode; label: string; testId: string }) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <strong className="text-[22px] font-semibold leading-none text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>
        {value}
      </strong>
      <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Storefront-local offering card — the continuity mock's `.psc-offering` treatment
 * (category label on the image, rating+price header row, footer "Secure checkout" +
 * CTA) reimplemented page-locally rather than by editing the then-shared
 * `client/src/components/OfferingCard.tsx`. It kept that card's prop contract and its
 * rendered text/testid/href behaviour, so offering-card.spec.ts's assertions (title
 * heading, price/CTA text, href pattern, testid) held unchanged.
 *
 * THAT SHARED CARD IS GONE (ledger `2026-09-15-buy-label-cards`, §18c). Forking it here
 * and forking it again as `CatalogPreviewOfferCard` in `client/src/pages/provider/
 * services.tsx` left it with ZERO importers, so it was deleted rather than left standing
 * as an unrendered fourth author of a buy label. THIS card is the one the public
 * storefront renders, and it is the surface the remaining `ld23-buy-action-gap` note
 * below is about.
 *
 * Wedding-flow restyle: hairline card, Fraunces navy title, mono price/meta/chips, and a
 * --earn-chip photo well (the artboards' `[photo · …]` placeholder) instead of a brand-pink
 * gradient — the traveler brand red and the earn coral on one screen is the "two reds" the
 * console palette note in CLAUDE.md names.
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
  showCategory = true,
}: {
  href: string;
  testId: string;
  image: string | null;
  categoryLabel: string;
  /** false when every offering on the page is the same kind — a "SERVICE" tag on every card says nothing. */
  showCategory?: boolean;
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
  // ld23-buy-action-gap: THIS CARD STILL AUTHORS ITS OWN CTA — recorded, not decided. Ruling 9
  // (lane L23) makes `resolveBuyAction` the SOLE author of a buy button, and the storefront
  // payload now CARRIES its answer (`loadStorefront` ships `buyAction` per service row). Two
  // things still block rendering it here, and both are server-side facts this file must not
  // invent:
  //   (a) VACATION MODE. `away` is a page-level flag and `buildListingBuyActions` is called with
  //       `isLive: true` for every service regardless, so the descriptor cannot say "this
  //       provider is away" — repointing would replace today's honest "View listing →" with
  //       "Book" on an away storefront, a §13 regression. Widening `ListingBuyRow.isLive` is a
  //       change to the module that just landed, not this lane's to make.
  //   (b) THE READY-MADE LANE gets no descriptor at all (only `services` are resolved), so the
  //       second caller below would still be authoring its own "Preview trip →".
  // Repointing also moves the rendered label off the CTA literals
  // `playwright/tests/offering-card.spec.ts` asserts, which is a real change to prove and not a
  // byte-identical one. Kept VERBATIM; the gap is the finding.
  //
  // RE-VERIFIED 2026-09-15 (ledger `2026-09-15-buy-label-cards`): both blockers HOLD, unchanged.
  // (a) `server/routes/storefront.routes.ts` still passes a literal `isLive: true` for every row
  // and computes `away` further down from `users.vacation_until`, so the two facts never meet;
  // `BuyActionRow` carries no seller-state field at all and `BuyRefusalReason` has no member for
  // it. (b) `readyMade` rows are still built with no `buyAction` key. THE EXACT FIELD THAT WOULD
  // LIFT (a): a seller-away fact on `BuyActionRow` — e.g. `sellerAway?: boolean` — plus its OWN
  // `BuyRefusalReason` member (`seller_away`), because §13 forbids folding it into
  // `not_available`, which means "not approved/active, or the provider chose `hidden`": an away
  // seller's listing IS live and IS coming back, and one refusal reason standing for both facts
  // is how a surface starts saying the wrong one. Deciding that is ruling 9's author's call and
  // is deliberately NOT taken here.
  const ctaLabel =
    bookingMode === "request" ? "Request to book →"
    : bookingMode === "hidden" ? "Enquire →"
    : cta;
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] no-underline text-inherit transition-all duration-150 hover:-translate-y-0.5 hover:border-[color:var(--earn-coral-border)]"
    >
      <div
        className={`relative h-36 w-full shrink-0 border-b border-[color:var(--earn-border)] ${image ? "bg-cover bg-center" : ""}`}
        style={
          image
            ? { backgroundImage: `url(${image})` }
            : { background: "var(--earn-chip)" }
        }
      >
        {/* Scrim only under a real photo — a flat chip well needs no darkening, and darkening
            it would read as a second, dimmer surface colour. */}
        {image && <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />}
        {showCategory && <span
          className="absolute left-2.5 bottom-2.5 rounded-md border border-[color:var(--earn-border)] bg-[color:var(--earn-card)] px-2 py-1 text-[9.5px] font-medium uppercase tracking-[0.1em] text-[color:var(--earn-muted)]"
          style={{ fontFamily: EARN_MONO }}
        >
          {categoryLabel}
        </span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          {ratingSlot}
          <span
            className="whitespace-nowrap text-[11px] text-[color:var(--earn-muted)]"
            style={{ fontFamily: EARN_MONO }}
          >
            {priceHidden ? null : (
              <>
                <span className="text-[15px] font-semibold tabular-nums text-[color:var(--earn-ink)]">{price}</span>
                {unit && <span className="ml-1">{unit}</span>}
              </>
            )}
          </span>
        </div>
        {/* line-clamp keeps card heights aligned across a row — an unclamped long title
            previously made one card in a grid row taller than its siblings. */}
        <h3
          className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-[color:var(--earn-navy)]"
          style={{ fontFamily: FRAUNCES }}
        >
          {title}
        </h3>
        {meta && <p className="line-clamp-1 text-[11.5px] leading-snug text-[color:var(--earn-muted)]">{meta}</p>}
        {chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full border border-[color:var(--earn-border)] bg-[var(--earn-chip)] px-2 py-0.5 text-[10.5px] text-[color:var(--earn-muted)]"
                style={{ fontFamily: EARN_MONO }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[color:var(--earn-border)] pt-2.5">
          {priceHidden ? (
            <span
              className="text-[11px] text-[color:var(--earn-muted)]"
              style={{ fontFamily: EARN_MONO }}
              data-testid={`${testId}-enquire-price`}
            >
              Enquire for pricing
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[color:var(--earn-green-ink)]"
              style={{ fontFamily: EARN_MONO }}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure checkout
            </span>
          )}
          <span className="whitespace-nowrap text-sm font-semibold text-[color:var(--earn-coral-ink)]">{ctaLabel}</span>
        </div>
      </div>
    </Link>
  );
}

export default function StorefrontPage() {
  const [, storefrontParams] = useRoute("/s/:handle");
  const [, legacyStorefrontParams] = useRoute("/p/:handle");
  const [, legacyExpertParams] = useRoute("/experts/:id");
  const [, legacyLocalExpertParams] = useRoute("/local-experts/:id");
  const handle = storefrontParams?.handle ?? legacyStorefrontParams?.handle ?? "";
  const legacyId = legacyExpertParams?.id ?? legacyLocalExpertParams?.id ?? "";
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
    queryKey: [
      legacyId ? `/api/storefront/by-id/${legacyId}` : `/api/storefront/${handle}`,
      { locale },
    ],
    queryFn: async () => {
      const endpoint = legacyId
        ? `/api/storefront/by-id/${encodeURIComponent(legacyId)}`
        : `/api/storefront/${encodeURIComponent(handle)}`;
      const response = await fetch(`${endpoint}?locale=${encodeURIComponent(locale)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Storefront not found");
      return response.json();
    },
    enabled: Boolean(handle || legacyId),
    retry: false,
  });

  // `?tripId=` — the plan a traveler arrived with (the planner's expert finish appends it, and any
  // plan page may link here with it). It is only a CLAIM until the owner-gated read answers: the
  // hook resolves it to a plan the viewer owns, or to nothing (§13 — ledger
  // `2026-09-23-storefront-booking-panel`). Called before the early returns so hook order holds.
  const search = useSearch();
  const tripIdParam = new URLSearchParams(search).get("tripId")?.trim() || null;
  const planContext = useStorefrontPlanContext(tripIdParam, data?.earner.handle ?? handle);

  function copyLink() {
    const canonicalHandle = data?.earner.handle ?? handle;
    const path = canonicalHandle ? `/s/${canonicalHandle}` : window.location.pathname;
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Link copied",
        description: canonicalHandle
          ? "Share it anywhere — it books and pays."
          : "Share this expert profile.",
      });
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
  // §13: "this earner has published nothing" and "your filter matched nothing" are different
  // facts and get different empty states. Before this split, an earner with an empty catalog was
  // told their visitor's filter was at fault, beside a Clear-filters button with nothing to clear
  // (the toolbar isn't even rendered in that case — availableCategories is ["All"] alone).
  const hasAnyOfferings = services.length + readyMade.length > 0;
  // Tabs only when there is a real choice between KINDS: "All | Services" on a page that sells
  // nothing but services offers a choice that changes nothing (ledger
  // `2026-09-23-storefront-booking-panel`).
  const showCategoryTabs = services.length > 0 && readyMade.length > 0;
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
          <div className={EYEBROW} style={{ fontFamily: EARN_MONO }}>Storefront</div>
          <h1
            className="mt-1.5 mb-2 text-[28px] font-semibold tracking-tight text-[color:var(--earn-navy)]"
            style={{ fontFamily: FRAUNCES }}
          >
            Storefront not found
          </h1>
          <p className="text-[color:var(--earn-muted)] mb-6">
            This link may be incorrect, or the owner has no bookable offerings yet.
          </p>
          <Link href="/discover">
            <Button className="text-white bg-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90">
              Explore Traveloure
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { earner, away } = data;
  if (legacyId && earner.handle) {
    return <Redirect to={`/s/${earner.handle}${search ? `?${search}` : ""}`} />;
  }
  // Hide the CTA when the signed-in visitor IS the earner — no message-myself button/band.
  // Locked Decision 40 (lane 3): compared by HANDLE, not by `users.id`. A storefront is keyed by
  // handle, and the signed-in user's own handle is on the session payload already, so this needs
  // no id on either side. A visitor with no handle is never this earner (§13 — an absent handle
  // is not a match), which is exactly the previous answer for everyone but the owner.
  const isOwnStorefront =
    !!user?.handle &&
    !!earner.handle &&
    String(user.handle).toLowerCase() === String(earner.handle).toLowerCase();
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
  const aboutGroups = [
    { label: "Specialties", values: Array.from(new Set(earner.specialties ?? [])) },
    { label: "Destinations", values: Array.from(new Set(earner.destinations ?? [])) },
    { label: "Languages", values: Array.from(new Set(earner.languages ?? [])) },
    {
      label: "Neighborhoods & local specialties",
      values: Array.from(new Set([...(earner.neighborhoods ?? []), ...(earner.localSpecialties ?? [])])),
    },
  ].filter((group) => group.values.length > 0);

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

  // Header figures (option B). The member-since year and the location used to appear twice — as
  // header lines and again in a separate fact strip; each now appears once. Expert: offerings,
  // gems shared (only when > 0, ruling 7), typical reply (only a readable promise), joined.
  // Provider: services, joined. The rating stays on its own line above, so reviews are not a
  // figure too. Every value real; the rest omitted (§13).
  const replyFigure = isProviderRole(earner.role) ? null : responseTimeFigure(earner.responseTime);
  const headerFigures: { value: ReactNode; label: string; testId: string }[] = [
    isProviderRole(earner.role)
      ? { value: services.length, label: services.length === 1 ? "Service" : "Services", testId: "fact-offerings" }
      : { value: earner.offeringsCount, label: earner.offeringsCount === 1 ? "Offering" : "Offerings", testId: "fact-offerings" },
    ...((earner.gemsSharedCount ?? 0) > 0
      ? [{ value: earner.gemsSharedCount, label: earner.gemsSharedCount === 1 ? "Gem shared" : "Gems shared", testId: "fact-gems-shared" }]
      : []),
    ...(replyFigure ? [{ value: replyFigure, label: "Typical reply", testId: "fact-response-time" }] : []),
    ...(memberSinceYear ? [{ value: memberSinceYear, label: "On Traveloure since", testId: "fact-member-since" }] : []),
  ];

  function messageEarner() {
    askExpert({
      // Locked Decision 40 (lane 3): the HANDLE is the address. This page IS `/s/:handle`, so the
      // address is the URL it was opened with; the server resolves the earner itself. `earner.id`
      // is no longer read here — lane 2 removes it from `loadStorefront`'s payload.
      handle: earner.handle ?? handle,
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
      <div className="border-b border-[color:var(--earn-border)] bg-[var(--earn-card)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center" data-testid="link-storefront-logo">
            <TraveloureLogo />
          </Link>
          <LanguageMenu />
        </div>
      </div>

      <div className={`max-w-6xl mx-auto px-4 py-6 sm:py-10 ${isOwnStorefront ? "" : "pb-28 lg:pb-10"}`}>
        {/* Identity hero card — cover + overlapping avatar + identity, the header FIGURES, and the
            two header actions pinned to its bottom-right corner (ledger
            `2026-09-23-storefront-booking-panel`, the approved mockup's option B). The separate
            fact strip that used to follow is folded in here, minus the two figures the header
            already said (the member-since line and the location). The bio is NOT repeated here:
            it appears once, in About below. */}
        <div className="overflow-hidden rounded-2xl border border-[color:var(--earn-border)] bg-[var(--earn-card)]">
          {/* Cover band — earner-chosen (users.preferences.storefront.coverImageUrl), token wash
              fallback. Link-landing polish (mockup §08): shorter on mobile so a texted storefront
              link gets its first bookable card above the fold on a 375px viewport. */}
          <div
            className={`h-28 sm:h-44 w-full border-b border-[color:var(--earn-border)] ${earner.coverImageUrl ? "bg-cover bg-center" : ""}`}
            style={
              earner.coverImageUrl
                ? { backgroundImage: `url(${earner.coverImageUrl})` }
                : {
                    background:
                      "linear-gradient(135deg, var(--earn-teal-wash) 0%, var(--earn-gold-wash) 100%), var(--earn-chip)",
                  }
            }
            data-testid="storefront-cover"
          />

          <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[88px_1fr_220px] gap-x-4 gap-y-4 sm:gap-x-5 px-5 sm:px-7 pb-6">
            {earner.profileImageUrl ? (
              <img
                src={earner.profileImageUrl}
                alt={earner.name}
                className="-mt-9 sm:-mt-11 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-full object-cover border-4 border-[color:var(--earn-card)] shrink-0"
              />
            ) : (
              <div
                className="-mt-9 sm:-mt-11 w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-full border-4 border-[color:var(--earn-card)] shrink-0 flex items-center justify-center bg-[var(--earn-chip)] text-2xl sm:text-3xl font-semibold text-[color:var(--earn-navy)]"
                style={{ fontFamily: FRAUNCES }}
              >
                {initial}
              </div>
            )}

            <div className="pt-3 sm:pt-4 min-w-0">
              <div className={EYEBROW} style={{ fontFamily: EARN_MONO }}>{eyebrowLabel}</div>
              <h1 className="mt-1 text-[30px] sm:text-[34px] font-semibold tracking-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }} data-testid="storefront-name">{earner.name}</h1>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
                <span>@{earner.handle}</span>
                {earner.location && (
                  <>
                    <span className="text-[color:var(--earn-faint)]">·</span>
                    <span className="inline-flex items-center gap-1" data-testid="storefront-location">
                      <MapPin className="w-3.5 h-3.5" />
                      {earner.location}
                    </span>
                  </>
                )}
                {away && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-[0.08em]"
                    style={{
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "var(--earn-gold-ink)",
                      background: "var(--earn-gold-wash)",
                      color: "var(--earn-gold-ink)",
                    }}
                    data-testid="badge-storefront-away"
                  >
                    Away — back {awayUntilLabel}
                  </span>
                )}
              </div>

              {away?.message && (
                <p className="mt-1.5 text-sm text-[color:var(--earn-gold-ink)]" data-testid="storefront-away-message">
                  {away.message}
                </p>
              )}

              {/* The rating line — a real score, or "New" when there are no reviews (§13). */}
              <div className="mt-3 text-[11px]" data-testid="storefront-earner-rating">
                <RatingLine rating={earner.averageRating} count={earner.reviewCount} />
              </div>

              {/* Header figures — every value real, each omitted when there is nothing true to show. */}
              {/* Two per row on a phone (no dividers — a wrapped divider would float); one row with
                  hairline dividers from `sm:` up. */}
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:items-stretch sm:gap-x-5" data-testid="storefront-facts">
                {headerFigures.map((f, i) => (
                  <div key={f.testId} className="flex items-stretch sm:gap-5">
                    {i > 0 && <div className="hidden sm:block w-px self-stretch bg-[color:var(--earn-border)]" aria-hidden="true" />}
                    <HeaderFigure value={f.value} label={f.label} testId={f.testId} />
                  </div>
                ))}
              </div>
              {planWaysNote && (
                <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[color:var(--earn-muted)] max-w-md" style={{ fontFamily: EARN_MONO }} data-testid="storefront-plan-ways-note">
                  <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--earn-teal-ink)]" />
                  <span>{planWaysNote}</span>
                </div>
              )}
            </div>

            {/* Right column: the verified badge at the top, the two actions pinned to the bottom so
                they line up with the figures. On a phone they stack full-width under the identity. */}
            <div className="col-span-2 sm:col-span-1 flex flex-col justify-between gap-4 sm:pt-4">
              <div className="flex sm:justify-end">
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
              <div className="flex flex-col gap-2">
                {isOwnStorefront ? (
                  <Link href={isProviderRole(earner.role) ? "/provider/settings?tab=profile" : "/expert/settings?tab=profile"} className="w-full">
                    <Button
                      variant="outline"
                      className="w-full border-[color:var(--earn-border)] bg-[var(--earn-card)] text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]"
                      data-testid="button-edit-storefront"
                    >
                      Edit profile
                    </Button>
                  </Link>
                ) : (
                  <Button
                    className="w-full text-white bg-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90"
                    onClick={messageEarner}
                    data-testid="button-message-storefront"
                  >
                    <MessageCircle className="w-4 h-4 mr-1.5 shrink-0" />
                    Start a conversation
                  </Button>
                )}
                {/* "Share page", not "Share": the booking panel's "Share my plan" is a different act
                    (it puts this expert on the traveler's plan), and two buttons both called
                    "Share" would not say which is which. */}
                <Button
                  variant="outline"
                  className="w-full border-[color:var(--earn-border)] bg-[var(--earn-card)] text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]"
                  onClick={copyLink}
                  data-testid="button-share-storefront"
                >
                  <Share2 className="w-4 h-4 mr-1.5 shrink-0" />
                  Share page
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Body: the page's content on the left, the booking panel on the right (sticky on a wide
            screen). The panel comes FIRST in the DOM so a phone shows it straight under the
            header; the grid places it in the right column from `lg:` up. */}
        {/* The owner sees no panel on their own page, so their content takes the full width. */}
        <div className={`mt-6 grid grid-cols-1 gap-6 items-start ${isOwnStorefront ? "" : "lg:grid-cols-[minmax(0,1fr)_360px]"}`}>
          <div id={PANEL_ANCHOR_ID} className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6">
            <StorefrontBookingPanel
              earner={{
                name: earner.name,
                handle: earner.handle ?? "",
                role: earner.role,
                profileImageUrl: earner.profileImageUrl,
                hasInsurance: earner.hasInsurance ?? null,
              }}
              isProvider={isProviderRole(earner.role)}
              isOwnStorefront={isOwnStorefront}
              acceptsPlanShares={earner.acceptsPlanShares === true}
              services={services}
              away={away}
              plan={planContext}
              servicesAnchorId={SERVICES_ANCHOR_ID}
              planEntry={
                /* Plan entry (ledger `2026-09-04-entry-unification`; Locked Decision 42 D13, ledger
                   `2026-09-05-doors-source-fields`), now the expert panel's start action. Rendered
                   HERE so the planning-entry guard keeps finding this door on this page. Hidden on
                   your OWN storefront (the panel is not drawn there at all).

                   BARE of a city, DELIBERATELY (§13) — `earner.location` LOOKS like a city and is
                   not reliably one: `resolveEarnerLocation` prefers the admin-managed neighbourhood
                   assignment and returns "<neighbourhood>, <city>". Forwarding it as `city` would
                   put a neighbourhood into the modal's destination field.
                   WHAT IT DOES PASS (lane L22, ledger `2026-09-07-doors-pass-tripid`; Locked
                   Decision 42 **D15**): the RETURN ADDRESS, by HANDLE (Locked Decision 40). The
                   planner's expert finish now brings the traveler back here WITH the new plan's id
                   (`withPlanTripId`), which is what turns this panel into "Share my plan". */
                <PlanEntryCta
                  className="w-full text-white bg-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90"
                  source={
                    earner.handle
                      ? { returnTo: { kind: "expert", handle: String(earner.handle) } }
                      : undefined
                  }
                  testId="button-plan-entry-storefront"
                />
              }
            />
          </div>

          <div className="lg:col-start-1 lg:row-start-1 min-w-0">
        {/* Exactly one profile story: the bio and profile-backed chip groups live here rather
            than repeating header figures or hero copy. Empty facts are honestly omitted. */}
        {(earner.bio || aboutGroups.length > 0) && (
          <section className={`px-6 py-5 ${CARD_SHELL}`} data-testid="storefront-about">
            <div className={EYEBROW} style={{ fontFamily: EARN_MONO }}>
              About {firstName}
            </div>
            {earner.bio && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--earn-ink)]">{earner.bio}</p>
            )}
            {aboutGroups.length > 0 && (
              <div className={`grid gap-5 ${earner.bio ? "mt-5 border-t border-[color:var(--earn-border)] pt-5" : "mt-4"} sm:grid-cols-2`}>
                {aboutGroups.map((group) => (
                  <div key={group.label}>
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--earn-faint)]" style={{ fontFamily: EARN_MONO }}>
                      {group.label}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.values.map((value) => (
                        <span key={value} className="rounded-full border border-[color:var(--earn-border)] bg-[var(--earn-chip)] px-2.5 py-1 text-xs text-[color:var(--earn-ink)]">
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Offerings — category tabs + search over the three real lanes. Default state (category
            "All", empty search) is the exact pre-rebuild render: nothing here changes what
            offering-card.spec.ts already proves. */}
        {/* Offerings. ONE heading per lane (below) — the outer "Choose your starting point" heading
            and its offering count repeated the lane heading and the header figure (ledger
            `2026-09-23-storefront-booking-panel`). The tabs + search still appear only when the
            earner genuinely sells more than one kind of offering. */}
        <section className="mt-8">
          {(showCategoryTabs || services.length + readyMade.length > 1) && (
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {showCategoryTabs ? <div className="flex gap-1 overflow-x-auto rounded-lg border border-[color:var(--earn-border)] bg-[var(--earn-chip)] p-1" role="tablist" aria-label="Offering categories">
                {availableCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={category === c}
                    onClick={() => setCategory(c)}
                    data-testid={`tab-storefront-category-${categorySlug(c)}`}
                    style={{ fontFamily: EARN_MONO }}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                      category === c
                        ? "bg-[var(--earn-card)] text-[color:var(--earn-ink)]"
                        : "text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div> : <span aria-hidden="true" />}
              <label className="flex items-center gap-2 rounded-lg border border-[color:var(--earn-border)] bg-[var(--earn-card)] px-3 py-1.5 text-sm text-[color:var(--earn-muted)] min-w-[200px]">
                <Search className="w-4 h-4 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this storefront"
                  aria-label="Search this storefront"
                  data-testid="input-storefront-search"
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-[color:var(--earn-ink)] outline-none placeholder:text-[color:var(--earn-faint)]"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </label>
            </div>
          )}

          {/* §13: nothing published is the earner's own state, not the visitor's filter — it
              says so plainly, claims no count, and offers no control that could not act. */}
          {!hasAnyOfferings && (
            <div
              className="rounded-xl border border-dashed border-[color:var(--earn-border-dash)] px-6 py-8 text-center"
              data-testid="storefront-empty-listings"
            >
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-faint)]" style={{ fontFamily: EARN_MONO }}>
                Nothing listed yet
              </div>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[color:var(--earn-muted)]">
                {firstName} has not published an offering on this storefront. Anything published later shows up here.
              </p>
            </div>
          )}

          {hasAnyOfferings && visibleTotal === 0 && (
            <div className="flex min-h-[130px] flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--earn-border-dash)] p-6 text-center text-sm text-[color:var(--earn-muted)]" data-testid="storefront-empty-filter">
              <Search className="w-5 h-5" />
              <span>No offerings match your filter.</span>
              <button type="button" onClick={clearFilters} className="font-semibold text-[color:var(--earn-coral-ink)]">
                Clear filters
              </button>
            </div>
          )}

          {/* Lane 1: services — book directly */}
          {visibleServices.length > 0 && (
            <div className="mb-10 sm:mb-12 scroll-mt-6" id={SERVICES_ANCHOR_ID} data-testid="storefront-lane-services">
              <LaneHeader eyebrow="Book directly" title="Services" />
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
                  const unit = priceUnitPhrase({ priceType: s.priceType, pricingUnit: s.pricingUnit });
                  const price = s.price ? `$${Number(s.price).toFixed(0)}` : "Custom quote";
                  // Vacation mode: the CTA stops promising "book" while the owner is away —
                  // the listing itself stays visible and clickable (its detail page carries
                  // the same honest away state and disables the actual booking action).
                  const cta = away ? "View listing →" : s.pricingUnit === "per_night" ? "Check dates →" : "View & book →";
                  return (
                    <StorefrontOfferingCard
                      key={s.id}
                      // A plan the viewer OWNS (resolved by the panel's hook, never the raw query
                      // param) rides along, so the listing's "Add to plan" targets that plan.
                      href={`/services/${s.id}${planContext.ownedTrip ? `?tripId=${encodeURIComponent(planContext.ownedTrip.id)}` : ""}`}
                      testId={`storefront-service-${s.id}`}
                      image={s.serviceImage}
                      categoryLabel="Service"
                      showCategory={readyMade.length > 0}
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
              <LaneHeader eyebrow="Start from a finished plan" title="Ready-Made Trips" />
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
                      showCategory={services.length > 0}
                      meta="Editable trip · clones into your planner"
                      title={r.title}
                      chips={chips}
                      // Ready Made Trips have no review mechanism yet (§13) — no rating line,
                      // never a perpetual fake "New" badge for a lane that can't earn reviews.
                      ratingSlot={
                        <span
                          className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--earn-muted)]"
                          style={{ fontFamily: EARN_MONO }}
                        >
                          Complete trip
                        </span>
                      }
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
          <div className={`mt-4 flex flex-wrap items-center gap-5 p-6 ${CARD_SHELL}`} data-testid="storefront-message-band">
            {earner.profileImageUrl ? (
              <img src={earner.profileImageUrl} alt={earner.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div
                className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center bg-[var(--earn-chip)] text-lg font-semibold text-[color:var(--earn-navy)]"
                style={{ fontFamily: FRAUNCES }}
              >
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-[240px]">
              <div className={EYEBROW} style={{ fontFamily: EARN_MONO }}>A good place to begin</div>
              <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>Not sure what you're looking for?</h3>
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--earn-muted)] max-w-xl">
                Tell {firstName} what you're planning — a private tour, a special
                occasion, something seasonal — and get pointed to the right offering, or something custom.
              </p>
            </div>
            <Button
              className="text-white bg-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90"
              onClick={messageEarner}
              data-testid="button-message-band"
            >
              <MessageCircle className="w-4 h-4 mr-1.5" />
              Start a conversation
            </Button>
          </div>
        )}

          </div>
        </div>

        {/* Trust strip — three real, general platform facts (no response-time/fabricated stats). */}
        <div
          className="mt-8 mb-10 grid gap-5 sm:grid-cols-3 border-t border-[color:var(--earn-border)] pt-6 text-sm"
          data-testid="storefront-trust-strip"
        >
          <div className="flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--earn-teal-ink)]" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5 text-[color:var(--earn-ink)]">Payment held until your booking completes</strong>
              <span className="text-xs leading-relaxed text-[color:var(--earn-muted)]">
                Funds are secured through Traveloure and release to {firstName} only after your experience.
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--earn-teal-ink)]" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5 text-[color:var(--earn-ink)]">Every listing is admin-reviewed</strong>
              <span className="text-xs leading-relaxed text-[color:var(--earn-muted)]">
                Offerings appear here only after Traveloure approves them.
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Handshake className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--earn-teal-ink)]" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5 text-[color:var(--earn-ink)]">Book and message in one place</strong>
              <span className="text-xs leading-relaxed text-[color:var(--earn-muted)]">
                Your conversation, booking, and receipts stay on Traveloure.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* The phone layout's pinned bar — the panel's price and its one action (hidden from `lg:`). */}
      <StorefrontBookingBar
        earner={{
          name: earner.name,
          handle: earner.handle ?? "",
          role: earner.role,
          profileImageUrl: earner.profileImageUrl,
          hasInsurance: earner.hasInsurance ?? null,
        }}
        isProvider={isProviderRole(earner.role)}
        isOwnStorefront={isOwnStorefront}
        acceptsPlanShares={earner.acceptsPlanShares === true}
        services={services}
        away={away}
        plan={planContext}
        servicesAnchorId={SERVICES_ANCHOR_ID}
        panelAnchorId={PANEL_ANCHOR_ID}
        planEntry={null}
      />
    </div>
  );
}
