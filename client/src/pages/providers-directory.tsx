/**
 * /providers — public "Service Providers" directory (nav-storefront lane).
 *
 * Browses provider BUSINESSES (not individual services — that's /services), each card
 * linking into its own storefront (/s/:handle) where its actual bookable listings live.
 * Data source is GET /api/provider-storefronts (server/routes/storefront.routes.ts,
 * loadProviderStorefrontDirectory) — a real, server-aggregated row per approved provider
 * with a handle. Each card describes the BUSINESS (ledger `2026-09-23-provider-directory-card`):
 * its name and type, who runs it, up to three listings ordered by real bookings with at most one
 * "Most booked" tag (never a count), and the From / Rating / Services figures. Search is text over
 * what the card shows; there is no market facet to filter on, so none is offered (§13).
 *
 * Earn-grammar surface (SPEC §3.11): ShoppingBag band + FIND HELP rail + honest total (the
 * endpoint has no market facet, so no per-market count is claimed — §13) + the experts-card
 * grammar on the --earn-* palette, and the same "New" vs. real-rating rule as RatingLine on
 * the storefront page — reviewCount === 0 is always "New", never a fabricated average.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, MessageCircle, Search, ShieldCheck, Star, Store, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOHead } from "@/components/seo-head";
import {
  type ProviderStorefrontListing,
  formatListingPrice,
  formatProviderRating,
  matchesProviderSearch,
  moreListingsCount,
  providerCardTitle,
  providerInitials,
} from "@/lib/provider-directory-presentation";
import { priceUnitSuffix } from "@/lib/price-unit";
import { useAskExpert } from "@/lib/use-ask-expert";
// One-source nav-icon map (ruling 2026-08-25-nav-icons) — the masthead tile (ShoppingBag)
// reads it, never a restated glyph.
import { NAV_LEAF_ICONS } from "@/components/layout";
import { PlanEntryCta } from "@/components/planning/plan-entry-cta";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// FIND HELP rail (ruling 2026-08-25-surface-rail) — Providers is the current surface (filled
// navy); the three expert-role links carry live counts from /api/experts/counts.
const FIND_HELP_RAIL: Array<
  | { kind: "providers"; label: string }
  | { kind: "role"; role: string; label: string }
> = [
  { kind: "providers", label: "Providers" },
  { kind: "role", role: "local_expert", label: "Local Experts" },
  { kind: "role", role: "travel_expert", label: "Trip Planners" },
  { kind: "role", role: "event_planner", label: "Event Planners" },
];

function ProviderCard({ provider }: { provider: ProviderStorefrontListing }) {
  const askExpert = useAskExpert();
  const rating = formatProviderRating(provider.averageRating, provider.reviewCount);
  const { title, runBy } = providerCardTitle(provider);
  const initials = providerInitials(title);
  const listings = provider.listings ?? [];
  const more = moreListingsCount(provider.serviceCount, listings.length);
  const fromPrice = provider.fromPrice != null ? formatListingPrice(provider.fromPrice) : null;
  const storefrontHref = `/s/${provider.handle}`;

  function message() {
    // Locked Decision 40: the HANDLE is the address; the server resolves the recipient.
    askExpert({
      handle: provider.handle,
      returnTo: "/providers",
      fallbackName: title,
      fallbackAvatar: provider.profileImageUrl ?? undefined,
    });
  }

  return (
    <article
      data-testid={`card-provider-${provider.handle}`}
      className="flex flex-col gap-3.5 rounded-xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {provider.profileImageUrl ? (
          <img src={provider.profileImageUrl} alt="" className="h-[52px] w-[52px] shrink-0 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--earn-chip)] text-[19px] font-semibold text-[color:var(--earn-navy)]"
            style={{ fontFamily: FRAUNCES }}
            aria-hidden="true"
          >
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[18px] font-semibold leading-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>
            <Link
              href={storefrontHref}
              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              data-testid={`text-provider-name-${provider.handle}`}
            >
              {title}
            </Link>
          </h3>
          <p className="truncate text-[11px] text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
            {runBy ? `Run by ${runBy} · ` : ""}@{provider.handle}
          </p>
        </div>
      </div>

      {(provider.category || provider.location || provider.instantBooking || provider.businessVerified) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {provider.category && (
            <span className="rounded-full border border-[color:var(--earn-border)] bg-[var(--earn-chip)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[color:var(--earn-ink)]" data-testid={`chip-provider-category-${provider.handle}`}>
              {provider.category}
            </span>
          )}
          {provider.location && (
            <span className="inline-flex items-center gap-1 text-xs text-[color:var(--earn-muted)]">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {provider.location}
            </span>
          )}
          {provider.instantBooking && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--earn-teal-wash)] px-2.5 py-0.5 text-[11.5px] text-[color:var(--earn-teal-ink)]" data-testid={`chip-provider-instant-${provider.handle}`}>
              <Zap className="h-3 w-3" aria-hidden="true" />
              Instant booking
            </span>
          )}
          {provider.businessVerified && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--earn-green-ink)]" data-testid={`chip-provider-verified-${provider.handle}`}>
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Verified business
            </span>
          )}
        </div>
      )}

      {listings.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[color:var(--earn-border)] bg-[var(--earn-ground)] px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
            What you can book
          </p>
          <ul className="flex flex-col gap-1.5" data-testid={`list-provider-listings-${provider.handle}`}>
            {listings.map((listing) => {
              const amount = formatListingPrice(listing.price);
              // A unit only ever follows a real amount (`price-unit.ts` §13).
              const price = amount ? `${amount}${priceUnitSuffix(listing) ?? ""}` : null;
              return (
                <li key={listing.id} className="flex items-center justify-between gap-3 text-[13px] text-[color:var(--earn-ink)]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link href={`/services/${listing.id}`} className="truncate hover:underline" data-testid={`link-provider-listing-${listing.id}`}>
                      {listing.name}
                    </Link>
                    {listing.mostBooked && (
                      <span className="shrink-0 rounded-full bg-[var(--earn-coral-bg)] px-2 py-px text-[10.5px] font-bold text-[color:var(--earn-coral-ink)]" data-testid={`badge-most-booked-${listing.id}`}>
                        Most booked
                      </span>
                    )}
                  </span>
                  {price && (
                    <span className="shrink-0 tabular-nums text-xs text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
                      {price}
                    </span>
                  )}
                </li>
              );
            })}
            {more > 0 && (
              <li className="text-xs text-[color:var(--earn-muted)]">+{more} more</li>
            )}
          </ul>
        </div>
      )}

      <dl className="flex gap-3.5">
        {fromPrice && (
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-[9.5px] uppercase text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>From</dt>
            <dd className="text-lg font-semibold text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }} data-testid={`text-provider-from-${provider.handle}`}>{fromPrice}</dd>
          </div>
        )}
        <div className={`flex flex-col-reverse gap-0.5 ${fromPrice ? "border-l border-[color:var(--earn-border)] pl-3.5" : ""}`}>
          <dt className="text-[9.5px] uppercase text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>Rating</dt>
          {rating.kind === "rated" ? (
            <dd className="flex items-center gap-1 text-lg font-semibold text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }} data-testid={`text-provider-rating-${provider.handle}`}>
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
              <span className="tabular-nums">{rating.ratingLabel}</span>
              <span className="tabular-nums text-sm font-normal text-[color:var(--earn-muted)]">{rating.reviewCountLabel}</span>
            </dd>
          ) : (
            <dd className="text-lg font-semibold text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }} data-testid={`badge-provider-new-${provider.handle}`}>New</dd>
          )}
        </div>
        <div className="flex flex-col-reverse gap-0.5 border-l border-[color:var(--earn-border)] pl-3.5">
          <dt className="text-[9.5px] uppercase text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>Services</dt>
          <dd className="text-lg font-semibold tabular-nums text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }} data-testid={`text-provider-service-count-${provider.handle}`}>
            {Math.max(0, Math.trunc(provider.serviceCount || 0))}
          </dd>
        </div>
      </dl>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={message}
          className="min-h-[42px] border-[color:var(--earn-border)] bg-[var(--earn-card)] font-bold text-[color:var(--earn-navy)] hover:bg-[var(--earn-chip)]"
          data-testid={`button-message-provider-${provider.handle}`}
        >
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Message
        </Button>
        <Button
          asChild
          className="min-h-[42px] bg-[color:var(--earn-coral-ink)] font-bold text-white hover:bg-[color:var(--earn-coral-ink)]/90"
        >
          <Link href={storefrontHref} data-testid={`link-provider-storefront-${provider.handle}`}>
            View storefront
          </Link>
        </Button>
      </div>
    </article>
  );
}

function ProviderCardSkeleton() {
  return (
    <div className="rounded-xl border bg-[var(--earn-card)] p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-4/5" />
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  );
}

export default function ProvidersDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: providers, isLoading, isError } = useQuery<ProviderStorefrontListing[]>({
    queryKey: ["/api/provider-storefronts"],
  });

  // Live counts for the FIND HELP rail's three expert-role links (§3.8 grammar).
  const { data: roleCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/experts/counts"],
  });

  const filtered = (providers ?? []).filter((p) =>
    matchesProviderSearch(
      searchQuery,
      p.name,
      p.handle,
      p.businessName,
      p.category,
      ...(p.listings ?? []).map((l) => l.name),
    ),
  );
  const providerTotal = (providers ?? []).length;

  return (
    <div className="min-h-screen bg-[var(--earn-ground)]" data-testid="page-providers-directory">
      <SEOHead
        title="Service Providers | Traveloure"
        description="Browse local service-provider businesses on Traveloure and book directly from their storefront."
        url="/providers"
      />

      {/* Band + FIND HELP rail (SPEC §2/§3.11; rulings 2026-08-25-nav-icons + -surface-rail):
          ShoppingBag tile + Fraunces title + sub on the left; FIND HELP eyebrow + four-link
          rail on the right, Providers the current surface (filled navy). */}
      <section className="border-b border-[color:var(--earn-border)] bg-[var(--earn-card)] py-[26px]">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-3 text-left">
              <span className="w-[42px] h-[42px] rounded-xl bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)] grid place-items-center shrink-0">
                {(() => {
                  const Tile = NAV_LEAF_ICONS["Service Providers"] ?? Store;
                  return <Tile className="w-[22px] h-[22px]" />;
                })()}
              </span>
              <div>
                <h1 className="text-2xl md:text-[26px] font-semibold text-[color:var(--earn-navy)] leading-tight" style={{ fontFamily: FRAUNCES }}>
                  Service Providers
                </h1>
                <p className="text-sm text-[color:var(--earn-muted)] mt-1 max-w-[60ch]">
                  Local businesses you can book directly — no middleman, no markup beyond the listing price.
                </p>
              </div>
            </div>
            <nav className="md:text-right" aria-label="Find help">
              <p className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-muted)] mb-2" style={{ fontFamily: EARN_MONO }}>
                Find help
              </p>
              <div className="flex flex-wrap md:justify-end gap-1.5" style={{ fontFamily: EARN_MONO }}>
                {FIND_HELP_RAIL.map((item) => {
                  if (item.kind === "providers") {
                    return (
                      <span
                        key="providers"
                        aria-current="page"
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-[var(--earn-navy)] text-white"
                      >
                        {item.label}
                        <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[11px] font-semibold leading-none bg-white/25 text-white">
                          {providerTotal}
                        </span>
                      </span>
                    );
                  }
                  const count = roleCounts?.[item.role];
                  return (
                    <Link
                      key={item.role}
                      href={`/experts?role=${item.role}`}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-md text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]"
                    >
                      {item.label}
                      {count !== undefined && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[11px] font-semibold leading-none bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]">
                          {count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
          {/* Plan entry (ledger `2026-09-04-entry-unification`; Locked Decision 42 D13, ledger
              `2026-09-05-doors-source-fields`). A traveler standing on the provider directory had
              no way to start a plan — the page's only CTAs were supply-side.

              BARE, DELIBERATELY (§13). `GET /api/provider-storefronts` carries no location facet —
              the section heading above already refuses to claim a per-market count for exactly that
              reason — so this page holds no city, no destination and no occasion. An absent field is
              how `PlanningSource` says "not known"; a placeholder would be how it says something
              false, and D13's required-field list must never be satisfied by inventing one. */}
          <div className="mt-4 flex md:justify-end">
            <PlanEntryCta variant="outline" testId="button-plan-entry-providers" />
          </div>
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="relative mb-6 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--earn-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="What do you need help with?"
            className="pl-9"
            aria-label="Search service providers"
            data-testid="input-search-providers"
          />
        </div>

        {/* Section (§3.11) — honest total, no market: /api/provider-storefronts carries no
            location facet, so no per-market count is claimed (§13; decision-maker Phase 0). */}
        {!isLoading && !isError && providerTotal > 0 && (
          <div className="mb-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]" style={{ fontFamily: EARN_MONO }}>
              Providers · {providerTotal}
            </p>
            <h2 className="text-[24px] font-semibold tracking-tight text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>
              Book the business directly
            </h2>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="providers-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProviderCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border bg-[var(--earn-card)] px-6 py-16 text-center" data-testid="providers-error">
            <p className="text-[color:var(--earn-muted)]">
              Couldn't load service providers right now. Please try again shortly.
            </p>
          </div>
        ) : (providers ?? []).length === 0 ? (
          <div className="rounded-xl border bg-[var(--earn-card)] px-6 py-16 text-center" data-testid="providers-empty">
            <Store className="mx-auto mb-3 h-8 w-8 text-[color:var(--earn-muted)]" />
            <h2 className="text-lg font-semibold text-[color:var(--earn-ink)]">No providers yet</h2>
            <p className="mt-1 text-sm text-[color:var(--earn-muted)]">
              Check back soon — approved local businesses will appear here as they join.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-[var(--earn-card)] px-6 py-16 text-center" data-testid="providers-no-results">
            <p className="text-[color:var(--earn-muted)]">
              No providers match "{searchQuery}".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="providers-grid">
            {filtered.map((provider) => (
              <ProviderCard key={provider.handle} provider={provider} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
