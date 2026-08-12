/**
 * Provider Distribute — the ONE distribution hub (Catalog+Distribute ruling 74, lane D1).
 *
 * A full page reached from the Workstation ("one door for building" → one hub for getting it
 * seen). Ruling 74 disposition 6: Distribute is four channels — Storefront · Marketplace ·
 * Direct · Social. This lane (D1) ships the SHELL plus the first two channels; Direct (D2),
 * Social (D3), the channel-state strip + analytics deep-link (D4) and Promote→Distribute (C6)
 * mount into the `<section data-testid="channels-container">` seam below — pure addition, no
 * rework of what lands here.
 *
 * REUSE, not reimplementation (ruling 74 — storefront/share tools STAY on Catalog; this is a
 * SECOND MOUNT of the same components, Distribute deep-links to Catalog where a listing needs
 * fixing):
 *   - Storefront channel  ← <ProviderStorefrontHeader/> (client/src/pages/provider/services.tsx),
 *     which itself composes StorefrontShareTools + ensureShortLink({targetType:'storefront'}).
 *   - Marketplace channel ← GET /api/provider/services/:id/publish-readiness, the owner-gated
 *     read that COMPOSES the three real gate authorities (approval + F2 verification +
 *     SS-5a attestation). A listing that cannot go live shows the TRUE blocker(s) with a fix
 *     deep-link (§13), never an optimistic "ready".
 *
 * Caption hold (ruling 74 / ruling 69 disposition 2): every caption here is the NEUTRAL
 * "book direct through my link" line — the storefront caption is owned by StorefrontShareTools,
 * which already holds it. No fee-waiver wording ("skip the service fee") until the traveler fee
 * is actually billed on the direct path (a later unlock).
 *
 * Measurement stays on Analytics/Earnings (ruling 74 disposition 8) — this page grows NO
 * analytics of its own; D4 will deep-link out to them.
 */
import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { PageHeader } from "@/components/backoffice/primitives";
import { ProviderStorefrontHeader } from "@/pages/provider/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Share2,
  Store,
  ShoppingBag,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Link2,
  Sparkles,
} from "lucide-react";

// Owner-console shape (GET /api/provider/services — session-scoped, intentionally ungated on
// approval so the owner sees every listing in their pipeline, not only the live ones).
interface OwnerService {
  id: string;
  serviceName: string;
  approvalStatus?: string | null;
  status: string;
  productShape?: string | null;
}

// GET /api/provider/services/:id/publish-readiness — the composed, honest state.
interface PublishReadiness {
  serviceId: string;
  name: string;
  approvalStatus: string;
  status: string;
  isLive: boolean;
  publicHref: string;
  verification: {
    ok: boolean;
    role: string | null;
    identityVerified: boolean;
    businessVerified: boolean | null;
  };
  attestation: {
    ok: boolean;
    unaffirmed: { key: string; label: unknown }[];
  };
  blockers: { code: string; message: string; fixHref: string }[];
}

// ── Marketplace channel (per-listing) ──────────────────────────────────────────────────────
//
// The selected listing's live/approved state, shown HONESTLY from the real gates. Nothing is
// optimistic: `isLive` is the server's AND of approval + active + verification + attestation,
// and a blocked listing renders WHY with a deep-link to fix it in Catalog / status (§13).
function MarketplaceChannel({ serviceId }: { serviceId: string | null }) {
  const readiness = useQuery<PublishReadiness>({
    queryKey: [`/api/provider/services/${serviceId}/publish-readiness`],
    enabled: !!serviceId,
  });

  return (
    <Card className="border border-console-light" data-testid="card-channel-marketplace">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-console-darkest">
          <ShoppingBag className="w-4 h-4 text-primary" />
          Marketplace
        </CardTitle>
        <p className="text-sm text-console-mid">
          Where travelers discover this listing on Traveloure — Search, Discover and the feeds.
        </p>
      </CardHeader>
      <CardContent>
        {!serviceId ? (
          <p className="text-sm text-console-mid" data-testid="text-marketplace-no-selection">
            Pick a listing above to see its marketplace status.
          </p>
        ) : readiness.isLoading ? (
          <div className="space-y-2" data-testid="skeleton-marketplace">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : readiness.isError || !readiness.data ? (
          <p className="text-sm text-console-mid" data-testid="text-marketplace-error">
            Couldn't load this listing's status. Try again.
          </p>
        ) : (
          <div className="space-y-3" data-testid="marketplace-state">
            <div className="flex items-center gap-2 flex-wrap">
              {readiness.data.isLive ? (
                <Badge
                  className="text-xs border bg-green-100 text-green-800 border-green-200"
                  data-testid="badge-marketplace-live"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Live on the marketplace
                </Badge>
              ) : (
                <Badge
                  className="text-xs border bg-amber-100 text-amber-800 border-amber-200"
                  data-testid="badge-marketplace-blocked"
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  Not live yet
                </Badge>
              )}
            </div>

            {readiness.data.isLive ? (
              <div className="space-y-2">
                <p className="text-sm text-console-mid" data-testid="text-marketplace-live-detail">
                  Travelers can find and book <span className="font-medium text-console-darkest">{readiness.data.name}</span> right now.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `${window.location.origin}${readiness.data!.publicHref}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  data-testid="button-marketplace-view-public"
                >
                  <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                  View public page
                </Button>
              </div>
            ) : (
              <div className="space-y-2" data-testid="list-marketplace-blockers">
                <p className="text-sm text-console-mid">
                  This listing can't go live until you resolve the following:
                </p>
                {readiness.data.blockers.map((b) => (
                  <div
                    key={b.code}
                    className="flex items-start justify-between gap-3 rounded-lg border border-console-light bg-console-bg/50 p-3"
                    data-testid={`blocker-${b.code}`}
                  >
                    <p className="text-sm text-console-darkest">{b.message}</p>
                    <Link href={b.fixHref}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-shrink-0"
                        data-testid={`button-fix-${b.code}`}
                      >
                        Fix <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                ))}
                {readiness.data.blockers.length === 0 && (
                  <p className="text-sm text-console-mid" data-testid="text-marketplace-no-reason">
                    Status is resolving — check back in a moment.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProviderDistribute() {
  const { data: services, isLoading: servicesLoading } = useQuery<OwnerService[]>({
    queryKey: ["/api/provider/services"],
  });

  // Per-listing channels act on ONE selected listing (Marketplace here; Direct/Social in D2/D3).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Real, non-bundle-agnostic listing set (a bundle/property IS a provider_services row and
  // distributes the same way, so all owner listings are selectable). Default to the first.
  const listings = useMemo(
    () => (Array.isArray(services) ? services : []),
    [services],
  );
  useEffect(() => {
    if (!selectedId && listings.length > 0) setSelectedId(listings[0].id);
  }, [listings, selectedId]);

  return (
    <ProviderLayout title="Distribute">
      <div className="p-6 space-y-6">
        <PageHeader
          icon={Share2}
          title="Distribute"
          subtitle="One hub for getting what you sell seen — your storefront, the marketplace, and (soon) direct links and social kits."
          testId="text-distribute-title"
        />

        {/* ── Storefront channel (account-level) — a SECOND MOUNT of the Catalog component ──── */}
        <section data-testid="section-channel-storefront" className="space-y-2">
          <h2 className="text-xs font-semibold text-console-mid uppercase tracking-wide flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" /> Storefront
          </h2>
          <ProviderStorefrontHeader />
        </section>

        {/* ── Per-listing channels ─────────────────────────────────────────────────────────── */}
        <section data-testid="channels-container" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xs font-semibold text-console-mid uppercase tracking-wide">
              This listing
            </h2>
            {servicesLoading ? (
              <Skeleton className="h-9 w-64" />
            ) : listings.length === 0 ? (
              <p className="text-sm text-console-mid" data-testid="text-no-listings">
                No listings yet —{" "}
                <Link href="/provider/workstation">
                  <span className="underline cursor-pointer text-primary font-medium" data-testid="link-create-listing">
                    create one in the Workstation →
                  </span>
                </Link>
              </p>
            ) : (
              <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
                <SelectTrigger className="w-64" data-testid="select-listing">
                  <SelectValue placeholder="Pick a listing" />
                </SelectTrigger>
                <SelectContent>
                  {listings.map((s) => (
                    <SelectItem key={s.id} value={s.id} data-testid={`option-listing-${s.id}`}>
                      {s.serviceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Marketplace channel (per-listing) */}
          <MarketplaceChannel serviceId={selectedId} />

          {/* Seam for D2 (Direct-link), D3 (Social-kit) and D4 (channel-state strip +
              analytics deep-link). These per-listing cards slot in here keyed on `selectedId`
              — pure addition, this lane leaves the mount point ready. */}
          <Card className="border border-dashed border-console-light" data-testid="card-channels-placeholder">
            <CardContent className="p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-console-bg text-console-mid flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-console-darkest flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5" /> Direct links & social kit
                  <Badge variant="outline" className="text-[11px]">Coming next</Badge>
                </p>
                <p className="text-sm text-console-mid">
                  A tracked direct-booking link and ready-to-post images with captions for this
                  listing land here next. Measurement stays on Performance.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </ProviderLayout>
  );
}
