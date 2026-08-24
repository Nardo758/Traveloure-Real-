/**
 * Public provider storefront — canonical /s/:handle.
 *
 * This page is intentionally backed only by GET /api/storefront/:handle. Identity, trust,
 * availability, prices, reviews, and every offering shown here are production storefront data.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo-head";
import { useAuth } from "@/hooks/use-auth";
import { useAskExpert } from "@/lib/use-ask-expert";
import { useLocale } from "@/hooks/use-locale";
import { useTranslation } from "react-i18next";
import { isPlaceAnchored } from "@shared/service-fundamentals";
import {
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Handshake,
  MapPin,
  MessageCircle,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import "./storefront.css";

interface StorefrontEarner {
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
  city: string | null;
  productShape: string | null;
  showPrice?: boolean;
  bookingMode?: "instant" | "request" | "hidden";
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
  away: { until: string; message: string | null } | null;
}

type OfferingCategory = "All" | "Services" | "Templates" | "Ready-made";

interface DisplayOffering {
  id: string;
  category: Exclude<OfferingCategory, "All">;
  href: string;
  testId: string;
  title: string;
  image: string | null;
  chips: string[];
  rating?: string | number | null;
  reviews?: number | null;
  price: string;
  unit?: string | null;
  cta: string;
  showPrice?: boolean;
  bookingMode?: "instant" | "request" | "hidden";
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

const CARD_GRADIENTS = [
  "linear-gradient(135deg, #f5a2b5, #d92d55)",
  "linear-gradient(135deg, #84c7c4, #287a79)",
  "linear-gradient(135deg, #f6c982, #b96c18)",
  "linear-gradient(135deg, #91bad4, #315e7e)",
];

function gradientFor(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length];
}

function priceUnitLabel(priceType: string | null, pricingUnit: string | null): string | null {
  if (pricingUnit === "per_night") return "per night";
  if (priceType === "per_person") return "per person";
  if (priceType === "hourly") return "per hour";
  if (priceType === "per_event") return "per event";
  return null;
}

function RatingLine({ rating, count }: { rating: string | number | null; count: number | null }) {
  if (!count || rating == null) return <span className="sf-new">New listing</span>;
  return (
    <span className="sf-rating">
      <Star aria-hidden="true" />
      {Number(rating).toFixed(1)}
      <span>({count} review{count === 1 ? "" : "s"})</span>
    </span>
  );
}

function StorefrontCard({ item }: { item: DisplayOffering }) {
  const priceHidden = item.showPrice === false;
  const cta = item.bookingMode === "request"
    ? "Request to book"
    : item.bookingMode === "hidden"
      ? "Enquire"
      : item.cta;

  return (
    <Link href={item.href} className="sf-offering-card" data-testid={item.testId}>
      <div
        className="sf-offering-image"
        style={{
          backgroundImage: item.image ? `url(${item.image})` : gradientFor(item.title),
        }}
        role="img"
        aria-label={item.image ? item.title : `${item.title} image placeholder`}
      >
        <span>{item.category}</span>
      </div>
      <div className="sf-offering-body">
        <div className="sf-card-top">
          {item.rating !== undefined ? (
            <RatingLine rating={item.rating ?? null} count={item.reviews ?? null} />
          ) : <span className="sf-new">Complete trip</span>}
          <div className="sf-price">
            {priceHidden ? (
              <span data-testid={`${item.testId}-enquire-price`}>Enquire for pricing</span>
            ) : (
              <><strong>{item.price}</strong>{item.unit && <small>{item.unit}</small>}</>
            )}
          </div>
        </div>
        <h3>{item.title}</h3>
        {item.chips.length > 0 && (
          <div className="sf-chips">
            {item.chips.map((chip) => <span key={chip}>{chip}</span>)}
          </div>
        )}
        <div className="sf-card-foot">
          <span><ShieldCheck aria-hidden="true" /> Secure checkout</span>
          <strong>{cta}<ArrowUpRight aria-hidden="true" /></strong>
        </div>
      </div>
    </Link>
  );
}

function Lane({
  testId,
  eyebrow,
  title,
  items,
  note,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  items: DisplayOffering[];
  note?: ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section className="sf-lane" data-testid={testId}>
      <div className="sf-lane-heading">
        <div><p>{eyebrow}</p><h2>{title}</h2></div>
        <span>{items.length} available</span>
      </div>
      {note}
      <div className="sf-grid">{items.map((item) => <StorefrontCard item={item} key={item.id} />)}</div>
    </section>
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
    }).catch(() => {
      toast({ title: "Could not copy link", description: "Copy this page's address from your browser." });
    });
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="sf-page sf-loading">
          <div className="sf-shell">
          <Skeleton className="sf-loading-cover" />
          <Skeleton className="sf-loading-profile" />
          <div className="sf-loading-grid">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="sf-loading-card" />)}
          </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !data) {
    return (
      <Layout>
        <div className="sf-page sf-error">
          <div className="sf-error-card" data-testid="storefront-not-found">
            <h1>Storefront not found</h1>
            <p>This link may be incorrect, or the owner has no bookable offerings yet.</p>
            <Link href="/discover"><Button>Explore Traveloure</Button></Link>
          </div>
        </div>
      </Layout>
    );
  }

  const { earner, services, templates, readyMade, away } = data;
  const isOwnStorefront = !!user && String(user.id) === String(earner.id);
  const awayUntilLabel = away
    ? new Date(away.until).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  const memberSinceYear = earner.memberSince ? new Date(earner.memberSince).getFullYear() : null;
  const initial = earner.name.charAt(0).toUpperCase() || "T";
  const firstName = earner.name.split(" ")[0];
  const areaName = earner.location?.split(",")[0].trim();
  const offeringsHeading = areaName ? `Plans shaped around ${areaName}` : `Plans from ${firstName}`;

  function messageEarner() {
    askExpert({
      expertId: earner.id,
      returnTo: `/s/${handle}`,
      fallbackName: earner.name,
      fallbackAvatar: earner.profileImageUrl ?? undefined,
    });
  }

  const allOfferings: DisplayOffering[] = [
    ...services.map((service) => {
      const chips = service.deliveryMethod && DELIVERY_LABELS[service.deliveryMethod]
        ? [DELIVERY_LABELS[service.deliveryMethod]]
        : [];
      if (isPlaceAnchored({ deliveryMethod: service.deliveryMethod, productShape: service.productShape }) && service.city?.trim()) {
        chips.push(service.city.trim());
      }
      const normalCta = service.pricingUnit === "per_night" ? "Check dates" : "View & book";
      return {
        id: service.id,
        category: "Services" as const,
        href: `/services/${service.id}`,
        testId: `storefront-service-${service.id}`,
        title: service.serviceName,
        image: service.serviceImage,
        chips,
        rating: service.averageRating,
        reviews: service.reviewCount,
        price: service.price ? `$${Number(service.price).toFixed(0)}` : "Custom quote",
        unit: service.price ? priceUnitLabel(service.priceType, service.pricingUnit) : null,
        cta: away ? "View listing" : normalCta,
        showPrice: service.showPrice,
        bookingMode: away ? undefined : service.bookingMode,
      };
    }),
    ...templates.map((template) => ({
      id: template.id,
      category: "Templates" as const,
      href: `/expert-templates/${template.id}`,
      testId: `storefront-template-${template.id}`,
      title: template.title,
      image: template.coverImage,
      chips: [
        ...(template.duration ? [`${template.duration} day${template.duration === 1 ? "" : "s"}`] : []),
        template.destination,
      ].filter(Boolean),
      rating: template.averageRating,
      reviews: template.reviewCount,
      price: `$${Number(template.price).toFixed(0)}`,
      cta: "View template",
    })),
    ...readyMade.map((trip) => ({
      id: trip.id,
      category: "Ready-made" as const,
      href: `/ready-made/${trip.id}`,
      testId: `storefront-readymade-${trip.id}`,
      title: trip.title,
      image: trip.heroImageUrl,
      chips: [
        ...(trip.durationDays ? [`${trip.durationDays} day${trip.durationDays === 1 ? "" : "s"}`] : []),
        ...(trip.insideCounts?.items ? [`${trip.insideCounts.items} stops`] : []),
      ],
      price: typeof trip.priceCents === "number" ? `$${(trip.priceCents / 100).toFixed(0)}` : "Contact for price",
      cta: "Preview trip",
    })),
  ];

  const visibleOfferings = (() => {
    const term = query.trim().toLocaleLowerCase();
    return allOfferings.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const searchable = `${item.title} ${item.category} ${item.chips.join(" ")}`.toLocaleLowerCase();
      return matchesCategory && (!term || searchable.includes(term));
    });
  })();

  const visibleByCategory = (itemCategory: DisplayOffering["category"]) =>
    visibleOfferings.filter((item) => item.category === itemCategory);

  return (
    <Layout>
      <div className="sf-page" data-testid="storefront-page">
        <SEOHead
          title={`${earner.name} — Book local experiences | Traveloure`}
          description={earner.bio ?? `Bookable experiences from ${earner.name} on Traveloure.`}
        />

        <div className="sf-shell sf-main">
        <nav className="sf-breadcrumb" aria-label="Breadcrumb">
          <Link href="/destinations">Marketplace</Link>
          <ChevronRight aria-hidden="true" />
          <Link href="/services">Experts &amp; services</Link>
          <ChevronRight aria-hidden="true" />
          <span aria-current="page">{earner.name}</span>
        </nav>
        <section className="sf-hero">
          <div
            className={`sf-cover ${earner.coverImageUrl ? "" : "sf-cover-fallback"}`}
            style={earner.coverImageUrl ? { backgroundImage: `url(${earner.coverImageUrl})` } : undefined}
            data-testid="storefront-cover"
            role="img"
            aria-label={`${earner.name}'s storefront cover`}
          />
          <div className="sf-profile">
            {earner.profileImageUrl ? (
              <img src={earner.profileImageUrl} alt={earner.name} className="sf-avatar" />
            ) : (
              <div className="sf-avatar sf-avatar-fallback" aria-label={earner.name}>{initial}</div>
            )}
            <div className="sf-identity">
              <p className="sf-eyebrow">Local expert storefront</p>
              <div className="sf-name-row">
                <h1 data-testid="storefront-name">{earner.name}</h1>
                {earner.verified && (
                  <span className="sf-verified" data-testid="badge-storefront-verified" title="This earner's identity has been verified">
                    <ShieldCheck aria-hidden="true" /> Identity verified
                  </span>
                )}
              </div>
              {earner.bio && <p className="sf-bio">{earner.bio}</p>}
              <div className="sf-meta">
                <span>@{earner.handle}</span>
                {earner.location && (
                  <span data-testid="storefront-location"><MapPin aria-hidden="true" />{earner.location}</span>
                )}
                <span data-testid="storefront-earner-rating">
                  <RatingLine rating={earner.averageRating} count={earner.reviewCount} />
                </span>
                {memberSinceYear && <span><BadgeCheck aria-hidden="true" /> On Traveloure since {memberSinceYear}</span>}
                {away && (
                  <Badge variant="outline" className="sf-away" data-testid="badge-storefront-away">
                    Away — back {awayUntilLabel}
                  </Badge>
                )}
              </div>
              {away?.message && <p className="sf-away-message" data-testid="storefront-away-message">{away.message}</p>}
            </div>
            <div className="sf-actions">
              {!isOwnStorefront && (
                <Button onClick={messageEarner} data-testid="button-message-storefront">
                  <MessageCircle aria-hidden="true" /> Message {firstName}
                </Button>
              )}
              <Button variant="outline" onClick={copyLink} data-testid="button-share-storefront">
                <Share2 aria-hidden="true" /> Share
              </Button>
            </div>
          </div>
        </section>

        <section className="sf-facts" data-testid="storefront-facts">
          <div><strong data-testid="fact-offerings">{earner.offeringsCount}</strong><span>Offerings</span></div>
          <div><strong data-testid="fact-reviews">{earner.reviewCount}</strong><span>Reviews</span></div>
          {earner.location && <div><strong data-testid="fact-location">{earner.location.split(",")[0]}</strong><span>Area of expertise</span></div>}
          <aside>
            <Sparkles aria-hidden="true" />
            <p><strong>One expert, three ways to plan</strong><span>Book time, bring home a route, or start with a complete trip.</span></p>
          </aside>
        </section>

        <section className="sf-offerings">
          <div className="sf-offerings-heading">
            <div><p className="sf-eyebrow">Choose your starting point</p><h2>{offeringsHeading}</h2></div>
            <span>{visibleOfferings.length} offering{visibleOfferings.length === 1 ? "" : "s"}</span>
          </div>
          <div className="sf-toolbar">
            <div className="sf-tabs" aria-label="Filter offerings by category">
              {(["All", "Services", "Templates", "Ready-made"] as OfferingCategory[]).map((tab) => (
                <button
                  type="button"
                  aria-pressed={category === tab}
                  className={category === tab ? "active" : ""}
                  onClick={() => setCategory(tab)}
                  key={tab}
                >
                  {tab}
                </button>
              ))}
            </div>
            <label className="sf-search">
              <Search aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this storefront"
                aria-label="Search this storefront"
              />
            </label>
          </div>

          {visibleOfferings.length === 0 ? (
            <div className="sf-empty">
              <Search aria-hidden="true" />
              <strong>No offerings found</strong>
              <p>Try another category or a different search.</p>
              <button type="button" onClick={() => { setCategory("All"); setQuery(""); }}>Clear filters</button>
            </div>
          ) : (
            <>
              <Lane
                testId="storefront-lane-services"
                eyebrow="Book directly"
                title="Services"
                items={visibleByCategory("Services")}
                note={services.some((service) => service.shownInOriginal) && (
                  <p className="sf-language-note" data-testid="text-storefront-original-language-note">
                    {t("contentTranslation.someInOriginal")}
                  </p>
                )}
              />
              <Lane testId="storefront-lane-templates" eyebrow="Bring home a route" title="Itinerary templates" items={visibleByCategory("Templates")} />
              <Lane testId="storefront-lane-readymade" eyebrow="Start with the whole plan" title="Ready-made trips" items={visibleByCategory("Ready-made")} />
            </>
          )}
        </section>

        {!isOwnStorefront && (
          <section className="sf-message-band" data-testid="storefront-message-band">
            {earner.profileImageUrl
              ? <img src={earner.profileImageUrl} alt="" />
              : <div className="sf-mini-avatar" aria-hidden="true">{initial}</div>}
            <div>
              <p className="sf-eyebrow">A good place to begin</p>
              <h2>Have a trip in mind, but not a format yet?</h2>
              <p>Tell {firstName} what you are planning and get pointed to the right offering, or something custom.</p>
            </div>
            <Button onClick={messageEarner} data-testid="button-message-band">
              <MessageCircle aria-hidden="true" /> Start a conversation
            </Button>
          </section>
        )}

        <section className="sf-trust" data-testid="storefront-trust-strip">
          <div><ShieldCheck aria-hidden="true" /><p><strong>Payment is held until your booking completes</strong><span>Funds stay secured through Traveloure according to the booking terms.</span></p></div>
          <div><BadgeCheck aria-hidden="true" /><p><strong>Offerings are reviewed before publishing</strong><span>Listings appear here only after Traveloure approves them.</span></p></div>
          <div><Handshake aria-hidden="true" /><p><strong>Keep planning in one place</strong><span>Your messages, booking details, and receipts stay together.</span></p></div>
        </section>
        </div>
      </div>
    </Layout>
  );
}