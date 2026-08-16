/**
 * Public earner storefront — /p/:handle (backoffice Phase 1b, identity-hero rebuild).
 *
 * Rebuilt to the approved mockup (docs/backoffice/mockups/mockup-offering-page.html /p/yuki-flowers
 * concept): a cover band + overlapping avatar identity hero, a verified pill gated on a genuinely
 * approved verification signal, a real fact strip, Yuki-spec offering cards across the three lanes,
 * a "not sure what you're looking for?" message band, and an honest trust strip. Every number/badge
 * maps to a real field returned by GET /api/storefront/:handle — reviewCount=0 renders "New", never
 * a fabricated score, and the verified pill only renders when the server says the identity
 * verification is genuinely approved (§13).
 */
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo-head";
import { useAuth } from "@/hooks/use-auth";
import { useAskExpert } from "@/lib/use-ask-expert";
import { OfferingCard } from "@/components/OfferingCard";
import { LanguageMenu } from "@/components/language-menu";
import { useLocale } from "@/hooks/use-locale";
import { useTranslation } from "react-i18next";
import { isPlaceAnchored } from "@shared/service-fundamentals";
import {
  Star,
  MapPin,
  Share2,
  ShieldCheck,
  MessageCircle,
  ShieldAlert,
  Handshake,
  BadgeCheck,
} from "lucide-react";

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

interface StorefrontTemplate {
  id: string;
  title: string;
  destination: string;
  price: string;
  coverImage: string | null;
  duration: number | null;
  averageRating: string | null;
  reviewCount: number | null;
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
  templates: StorefrontTemplate[];
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
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
      {Number(rating).toFixed(1)}
      <span>· {count} review{count === 1 ? "" : "s"}</span>
    </span>
  );
}

function LaneHeader({ eyebrow, title, count }: { eyebrow: string; title: string; count: number }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-2">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{eyebrow}</div>
        <h2 className="mt-0.5 text-xl font-bold">{title}</h2>
      </div>
      <div className="text-sm tabular-nums text-muted-foreground">
        {count} available
      </div>
    </div>
  );
}

export default function StorefrontPage() {
  const [, params] = useRoute("/p/:handle");
  const handle = params?.handle ?? "";
  const { toast } = useToast();
  const { user } = useAuth();
  const askExpert = useAskExpert();
  const { t } = useTranslation("common");
  // Ruling 116 (distribution-language audit P1): the storefront is a first-class link/QR landing,
  // so the receiver must be able to switch language here like on /services/:id. The resolved
  // chrome locale rides the read as ?locale= (part of the key → switching refetches) and the
  // server overlays approved content translations on the cards.
  const { locale } = useLocale();

  const { data, isLoading, isError } = useQuery<StorefrontData>({
    queryKey: [`/api/storefront/${handle}`, { locale }],
    enabled: handle.length > 0,
    retry: false,
  });

  function copyLink() {
    const url = `${window.location.origin}/p/${handle}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied", description: "Share it anywhere — it books and pays." });
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Skeleton className="h-28 sm:h-56 w-full rounded-none" />
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
          <Skeleton className="h-24 w-full rounded-xl" />
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto px-4 py-20 text-center" data-testid="storefront-not-found">
          <h1 className="text-2xl font-bold mb-2">Storefront not found</h1>
          <p className="text-muted-foreground mb-6">
            This link may be incorrect, or the owner has no bookable offerings yet.
          </p>
          <Link href="/discover">
            <Button>Explore Traveloure</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { earner, services, templates, readyMade, away } = data;
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

  function messageEarner() {
    askExpert({
      expertId: earner.id,
      returnTo: `/p/${handle}`,
      fallbackName: earner.name,
      fallbackAvatar: earner.profileImageUrl ?? undefined,
    });
  }

  return (
    <div className="min-h-screen bg-background" data-testid="storefront-page">
      <SEOHead
        title={`${earner.name} — Book local experiences | Traveloure`}
        description={earner.bio ?? `Bookable experiences from ${earner.name} on Traveloure.`}
      />

      {/* Minimal branded header (standalone page, no site chrome) — same idiom as the
          ready-made-detail.tsx share/OG page frame. Ruling 116: the 🌐 selector rides here so a
          link/QR recipient (guest included) can switch language — same one-selector rule as the
          Layout header (ruling 60 entry point (b)). */}
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 no-underline text-inherit" data-testid="link-storefront-logo">
            <div className="w-7 h-7 rounded-[8px] flex items-center justify-center" style={{ background: "#E85D55" }}>
              <span className="text-white text-sm font-bold">T</span>
            </div>
            <span className="font-semibold text-foreground">Traveloure</span>
          </Link>
          <LanguageMenu />
        </div>
      </div>

      {/* Cover band — earner-chosen (users.preferences.storefront.coverImageUrl), gradient fallback.
          Link-landing polish (mockup §08): shorter on mobile (h-28) so a texted storefront link
          gets its first bookable card above the fold on a 375px viewport — same band, same image,
          just less of it above small screens. */}
      <div
        className={`h-28 sm:h-56 w-full ${earner.coverImageUrl ? "bg-cover bg-center" : "bg-gradient-to-br from-primary/50 via-primary/70 to-primary"}`}
        style={earner.coverImageUrl ? { backgroundImage: `url(${earner.coverImageUrl})` } : undefined}
        data-testid="storefront-cover"
      />

      <div className="max-w-5xl mx-auto px-4">
        {/* Identity hero: overlapping avatar + name/handle/verified/location/rating + actions */}
        <div className="-mt-12 sm:-mt-14 flex flex-wrap items-end gap-5 pb-2">
          {earner.profileImageUrl ? (
            <img
              src={earner.profileImageUrl}
              alt={earner.name}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-background shadow-md shrink-0"
            />
          ) : (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-background shadow-md shrink-0 flex items-center justify-center text-3xl font-bold text-white bg-gradient-to-br from-primary/60 to-primary">
              {initial}
            </div>
          )}

          <div className="flex-1 min-w-[260px] pb-1">
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="storefront-name">{earner.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>@{earner.handle}</span>
              {earner.verified && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
                  data-testid="badge-storefront-verified"
                  title="This earner's identity has been verified"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Identity verified
                </span>
              )}
              {earner.location && (
                <span className="inline-flex items-center gap-1" data-testid="storefront-location">
                  <MapPin className="w-3.5 h-3.5" />
                  {earner.location}
                </span>
              )}
              <span data-testid="storefront-earner-rating">
                <RatingLine rating={earner.averageRating} count={earner.reviewCount} />
              </span>
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
              <p className="mt-2 text-sm text-foreground max-w-2xl">{earner.bio}</p>
            )}
          </div>

          <div className="flex gap-2 pb-1 shrink-0">
            {!isOwnStorefront && (
              <Button onClick={messageEarner} data-testid="button-message-storefront">
                <MessageCircle className="w-4 h-4 mr-1.5" />
                Message @{earner.handle}
              </Button>
            )}
            <Button variant="outline" onClick={copyLink} data-testid="button-share-storefront">
              <Share2 className="w-4 h-4 mr-1.5" />
              Share
            </Button>
          </div>
        </div>

        {/* Fact strip — every number real: sum of the three lanes, real review count, real join year. */}
        <div className="mt-6 flex flex-wrap gap-8 rounded-xl border bg-card px-6 py-4" data-testid="storefront-facts">
          <div>
            <div className="text-xl font-bold tabular-nums" data-testid="fact-offerings">{earner.offeringsCount}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">Offerings</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums" data-testid="fact-reviews">{earner.reviewCount}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">Reviews</div>
          </div>
          {memberSinceYear && (
            <div>
              <div className="text-xl font-bold tabular-nums" data-testid="fact-member-since">{memberSinceYear}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">On Traveloure since</div>
            </div>
          )}
        </div>

        {/* Lane 1: services — book directly */}
        {services.length > 0 && (
          <section className="mt-8 sm:mt-12" data-testid="storefront-lane-services">
            <LaneHeader eyebrow="Book directly" title="Services" count={services.length} />
            {/* Ruling 116 (§13): when any card falls back to its original language under the
                viewer's locale, say so once — never a silent mix. */}
            {services.some((s) => s.shownInOriginal) && (
              <p className="mb-3 -mt-2 text-xs text-muted-foreground" data-testid="text-storefront-original-language-note">
                {t("contentTranslation.someInOriginal")}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((s) => {
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
                  <OfferingCard
                    key={s.id}
                    href={`/services/${s.id}`}
                    testId={`storefront-service-${s.id}`}
                    image={s.serviceImage}
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
          </section>
        )}

        {/* Lane 2: itinerary templates (seller-side vocabulary; §10) */}
        {templates.length > 0 && (
          <section className="mt-12" data-testid="storefront-lane-templates">
            <LaneHeader eyebrow="Guided itineraries" title="Itinerary Templates" count={templates.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => {
                const chips = [
                  ...(t.duration ? [`${t.duration} day${t.duration === 1 ? "" : "s"}`] : []),
                  t.destination,
                ];
                return (
                  <OfferingCard
                    key={t.id}
                    href={`/expert-templates/${t.id}`}
                    testId={`storefront-template-${t.id}`}
                    image={t.coverImage}
                    title={t.title}
                    chips={chips}
                    ratingSlot={<RatingLine rating={t.averageRating} count={t.reviewCount} />}
                    price={`$${Number(t.price).toFixed(0)}`}
                    cta="View template →"
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Lane 3: Ready Made Trips — buy the whole plan (§10/§17 store channel) */}
        {readyMade.length > 0 && (
          <section className="mt-12" data-testid="storefront-lane-readymade">
            <LaneHeader eyebrow="Buy the whole plan" title="Ready Made Trips" count={readyMade.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {readyMade.map((r) => {
                const chips = [
                  ...(r.durationDays ? [`${r.durationDays} day${r.durationDays === 1 ? "" : "s"}`] : []),
                  ...(r.insideCounts?.items ? [`${r.insideCounts.items} stops`] : []),
                ];
                return (
                  <OfferingCard
                    key={r.id}
                    href={`/ready-made/${r.id}`}
                    testId={`storefront-readymade-${r.id}`}
                    image={r.heroImageUrl}
                    title={r.title}
                    chips={chips}
                    // Ready Made Trips have no review mechanism yet (§13) — no rating line,
                    // never a perpetual fake "New" badge for a lane that can't earn reviews.
                    price={typeof r.priceCents === "number" ? `$${(r.priceCents / 100).toFixed(0)}` : "Contact for price"}
                    cta="Preview trip →"
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* "Not sure what you're looking for?" message band — same wiring as the hero CTA. */}
        {!isOwnStorefront && (
          <div className="mt-14 flex flex-wrap items-center gap-5 rounded-xl border bg-card p-6" data-testid="storefront-message-band">
            {earner.profileImageUrl ? (
              <img src={earner.profileImageUrl} alt={earner.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center text-lg font-bold text-white bg-gradient-to-br from-primary/60 to-primary">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-[240px]">
              <h3 className="font-bold">Not sure what you're looking for?</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                Tell {earner.name.split(" ")[0]} what you're planning — a private tour, a special
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
          className="mt-8 mb-10 grid gap-4 sm:grid-cols-3 rounded-md border-l-4 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-5 text-sm text-amber-900 dark:text-amber-200"
          data-testid="storefront-trust-strip"
        >
          <div className="flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5">Payment held until your booking completes</strong>
              Funds are secured through Traveloure and release to {earner.name.split(" ")[0]} only after your experience.
            </div>
          </div>
          <div className="flex gap-2">
            <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5">Every listing is admin-reviewed</strong>
              Offerings appear here only after Traveloure approves them.
            </div>
          </div>
          <div className="flex gap-2">
            <Handshake className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <strong className="block text-xs font-semibold mb-0.5">Book and message in one place</strong>
              Your conversation, booking, and receipts stay on Traveloure.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
