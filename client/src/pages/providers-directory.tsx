/**
 * /providers — public "Service Providers" directory (nav-storefront lane).
 *
 * Browses provider BUSINESSES (not individual services — that's /services), each card
 * linking into its own storefront (/p/:handle) where its actual bookable listings live.
 * Data source is GET /api/provider-storefronts (server/routes/storefront.routes.ts,
 * loadProviderStorefrontDirectory) — a real, server-aggregated row per approved provider
 * with a handle. That endpoint carries no category/location/specialty facet, so the only
 * filter this page can honestly offer is name/handle search (§13) — no invented filters.
 *
 * Card grammar follows the just-landed continuity rebuilds (storefront.tsx,
 * service-detail.tsx): shadcn tokens (bg-card/border/text-muted-foreground), rounded-xl
 * cards, and the same "New" vs. real-rating rule as RatingLine on the storefront page —
 * reviewCount === 0 is always "New", never a fabricated average.
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

function ProviderCard({ provider }: { provider: ProviderStorefrontListing }) {
  const rating = formatProviderRating(provider.averageRating, provider.reviewCount);
  const initials = providerInitials(provider.name);

  return (
    <Link
      href={`/p/${provider.handle}`}
      data-testid={`card-provider-${provider.handle}`}
      className="group flex flex-col rounded-xl border bg-card p-5 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          <h3 className="truncate font-bold text-foreground" data-testid={`text-provider-name-${provider.handle}`}>
            {provider.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">@{provider.handle}</p>
        </div>
      </div>

      {provider.bio && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{provider.bio}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
        <span className="tabular-nums text-muted-foreground" data-testid={`text-provider-service-count-${provider.handle}`}>
          {formatServiceCountLabel(provider.serviceCount)}
        </span>
        {rating.kind === "rated" ? (
          <span className="flex items-center gap-1 text-muted-foreground" data-testid={`text-provider-rating-${provider.handle}`}>
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <span className="tabular-nums">{rating.ratingLabel}</span>
            <span className="tabular-nums">{rating.reviewCountLabel}</span>
          </span>
        ) : (
          <span
            className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground"
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
    <div className="rounded-xl border bg-card p-5">
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

  const filtered = (providers ?? []).filter((p) =>
    matchesProviderSearch(searchQuery, p.name, p.handle),
  );

  return (
    <div className="min-h-screen bg-background" data-testid="page-providers-directory">
      <SEOHead
        title="Service Providers | Traveloure"
        description="Browse local service-provider businesses on Traveloure and book directly from their storefront."
        url="/providers"
      />

      {/* Masthead — same centered-title band idiom as /experts and /discover. */}
      <section className="border-b bg-card py-10">
        <div className="container mx-auto max-w-6xl px-4 text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground md:text-3xl">
            Service Providers
          </h1>
          <p className="mx-auto mt-1.5 max-w-2xl text-[15px] text-muted-foreground">
            Local businesses you can book directly — no middleman, no markup beyond the listing price.
          </p>
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="relative mx-auto mb-8 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or handle..."
            className="pl-9"
            aria-label="Search service providers"
            data-testid="input-search-providers"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="providers-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProviderCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border bg-card px-6 py-16 text-center" data-testid="providers-error">
            <p className="text-muted-foreground">
              Couldn't load service providers right now. Please try again shortly.
            </p>
          </div>
        ) : (providers ?? []).length === 0 ? (
          <div className="rounded-xl border bg-card px-6 py-16 text-center" data-testid="providers-empty">
            <Store className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">No providers yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back soon — approved local businesses will appear here as they join.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card px-6 py-16 text-center" data-testid="providers-no-results">
            <p className="text-muted-foreground">
              No providers match "{searchQuery}".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="providers-grid">
            {filtered.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
