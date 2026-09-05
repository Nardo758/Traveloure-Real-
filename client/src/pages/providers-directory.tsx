/**
 * /providers — public "Service Providers" directory (nav-storefront lane).
 *
 * Browses provider BUSINESSES (not individual services — that's /services), each card
 * linking into its own storefront (/s/:handle) where its actual bookable listings live.
 * Data source is GET /api/provider-storefronts (server/routes/storefront.routes.ts,
 * loadProviderStorefrontDirectory) — a real, server-aggregated row per approved provider
 * with a handle. That endpoint carries no category/location/specialty facet, so the only
 * filter this page can honestly offer is name/handle search (§13) — no invented filters.
 *
 * Earn-grammar surface (SPEC §3.11): ShoppingBag band + FIND HELP rail + honest total (the
 * endpoint has no market facet, so no per-market count is claimed — §13) + the experts-card
 * grammar on the --earn-* palette, and the same "New" vs. real-rating rule as RatingLine on
 * the storefront page — reviewCount === 0 is always "New", never a fabricated average.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOHead } from "@/components/seo-head";
import {
  type ProviderStorefrontListing,
  formatServiceCountLabel,
  formatProviderRating,
  providerInitials,
  matchesProviderSearch,
} from "@/lib/provider-directory-presentation";
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
  const rating = formatProviderRating(provider.averageRating, provider.reviewCount);
  const initials = providerInitials(provider.name);

  return (
    <Link
      href={`/s/${provider.handle}`}
      data-testid={`card-provider-${provider.handle}`}
      className="group flex flex-col rounded-xl border bg-[var(--earn-card)] p-5 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-3">
        {provider.profileImageUrl ? (
          <img
            src={provider.profileImageUrl}
            alt={provider.name}
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/60 to-primary text-lg font-bold text-white"
            aria-hidden="true"
          >
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-bold text-[color:var(--earn-ink)]" data-testid={`text-provider-name-${provider.handle}`}>
            {provider.name}
          </h3>
          <p className="truncate text-xs text-[color:var(--earn-muted)]">@{provider.handle}</p>
        </div>
      </div>

      {provider.bio && (
        <p className="mt-3 line-clamp-2 text-sm text-[color:var(--earn-muted)]">{provider.bio}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
        <span className="tabular-nums text-[color:var(--earn-muted)]" data-testid={`text-provider-service-count-${provider.handle}`}>
          {formatServiceCountLabel(provider.serviceCount)}
        </span>
        {rating.kind === "rated" ? (
          <span className="flex items-center gap-1 text-[color:var(--earn-muted)]" data-testid={`text-provider-rating-${provider.handle}`}>
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <span className="tabular-nums">{rating.ratingLabel}</span>
            <span className="tabular-nums">{rating.reviewCountLabel}</span>
          </span>
        ) : (
          <span
            className="rounded-full border px-2 py-0.5 text-xs font-medium text-[color:var(--earn-muted)]"
            data-testid={`badge-provider-new-${provider.handle}`}
          >
            New
          </span>
        )}
      </div>
    </Link>
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
    matchesProviderSearch(searchQuery, p.name, p.handle),
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
