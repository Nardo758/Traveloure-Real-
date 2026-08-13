/**
 * Provider Distribute — the ONE distribution hub (Catalog+Distribute ruling 74, lanes D1-D4/C6;
 * S6 — ruling-74-disposition-6 clarification).
 *
 * A full page reached from the Workstation ("one door for building" → one hub for getting it
 * seen) and, per lane S6, a first-class provider sidebar entry (Business group, after Catalog).
 * Ruling 74 disposition 6 originally read "storefront/share tools STAY on Catalog, Distribute
 * deep-links to them" — D1 (ledger 76) built the storefront channel as a literal SECOND MOUNT
 * of `ProviderStorefrontHeader` rather than a deep-link, which left the component genuinely
 * double-mounted (both this page and Catalog rendered it) and left Catalog's Promote container
 * standing even after C6 (ledger 77) pointed its actions here. **S6 records the clarification:
 * Distribute is the ONE home for every outward-facing distribution surface** — Catalog now
 * mounts none of them (just a per-card "Distribute this →" pointer, `?listing=<id>` below).
 * This page is five sections: Storefront · Marketplace · Direct · Social · Promote.
 *
 * REUSE, not reimplementation — every section composes an EXISTING component, never a fork:
 *   - Storefront channel ← <ProviderStorefrontHeader/> (client/src/pages/provider/services.tsx,
 *     still exported from there — the component's one authored copy — composes
 *     StorefrontShareTools + ensureShortLink({targetType:'storefront'})). Catalog no longer
 *     mounts it (S6); this is now its ONLY mount.
 *   - Marketplace channel ← GET /api/provider/services/:id/publish-readiness, the owner-gated
 *     read that COMPOSES the three real gate authorities (approval + F2 verification +
 *     SS-5a attestation). A listing that cannot go live shows the TRUE blocker(s) with a fix
 *     deep-link (§13), never an optimistic "ready".
 *   - Social channel ← the shared <OfferingShareDetail/> (client/src/components/backoffice/
 *     share-tools.tsx) — the SAME component Catalog's per-card Share dialog used to open in a
 *     Dialog wrapper; S6 mounts it inline here instead (no dialog needed, this IS the share
 *     surface's home now) so the Instagram-publish affordance it always carried is not lost.
 *   - Promote section ← the shared <PostingOpportunitiesCard/>, mounted WITHOUT `promoteHref`
 *     (that prop only made sense pointing FROM Catalog TO here; here the real inline share
 *     actions render directly, same as the expert Catalog's usage).
 *
 * Caption hold (ruling 74 / ruling 69 disposition 2): every caption here is the NEUTRAL
 * "book direct through my link" line — the storefront caption is owned by StorefrontShareTools,
 * which already holds it. No fee-waiver wording ("skip the service fee") until the traveler fee
 * is actually billed on the direct path (a later unlock).
 *
 * Measurement stays on Analytics/Earnings (ruling 74 disposition 8) — this page grows NO
 * analytics of its own; D4 deep-links out to them.
 */
import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { PageHeader } from "@/components/backoffice/primitives";
import { ProviderStorefrontHeader } from "@/pages/provider/services";
import {
  ensureShortLink,
  buildOfferingCaption,
  OfferingShareDetail,
  type OfferingShareOption,
  PostingOpportunitiesCard,
} from "@/components/backoffice/share-tools";
import { qrCodeSvgDataUrl } from "@/lib/qrcode";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
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
  LinkIcon,
  Copy,
  MessageCircle,
  QrCode,
  Download,
  Images,
  BarChart3,
} from "lucide-react";

// Owner-console shape (GET /api/provider/services — session-scoped, intentionally ungated on
// approval so the owner sees every listing in their pipeline, not only the live ones).
interface OwnerService {
  id: string;
  serviceName: string;
  approvalStatus?: string | null;
  status: string;
  productShape?: string | null;
  // S6: read by the Social channel to build the shared OfferingShareOption (same fields
  // Catalog's now-removed share dialog used) — both already ride the unfiltered row.
  price?: string | number | null;
  city?: string | null;
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

// GET /api/me/link-analytics — S5 earner rollup. Distribute reads ONLY the `links` array from it,
// and ONLY to derive existence ("does this listing already have a direct link?") for D2's get-link
// state and D4's honest "link ready" chip. Distribute renders NONE of the analytics numbers
// (clicks/bookings/revenue) — measurement stays on Analytics/Earnings (ruling 74 disposition 8 /
// ruling 22d); D4 DEEP-LINKS there, it does not mount a panel here.
interface OwnerShortLink {
  code: string;
  targetType: string;
  targetId: string | null;
  frame: string | null;
}
interface LinkAnalyticsShape {
  links: OwnerShortLink[];
}

// The generic (untagged) direct booking link for a service — frame === null distinguishes it from
// the frame-tagged social-kit links minted from posting opportunities.
function findDirectLink(links: OwnerShortLink[] | undefined, serviceId: string | null): OwnerShortLink | null {
  if (!links || !serviceId) return null;
  return (
    links.find((l) => l.targetType === "service" && l.targetId === serviceId && l.frame === null) ??
    null
  );
}

// ANALYTICS HOME — the real link-performance surface (provider Performance → Analytics tab, which
// mounts LinkAnalyticsPanel). /provider/analytics redirects here; we link the canonical path.
const ANALYTICS_HOME_HREF = "/provider/performance?tab=analytics";

// ── Direct-link channel (D2, per-listing) ───────────────────────────────────────────────────
//
// The trackable, rails-attributed booking link for the selected listing. REUSE: the short-links
// rail (`ensureShortLink` → POST /api/short-links, owner-verified server-side; the minted `code`
// rides checkout as `?ref=` and secures the provider's rails rate via rails-attribution.service).
// §13: the link is shown only once it actually EXISTS — either already minted (found in
// link-analytics) or freshly minted here; no optimistic "link ready" before a code exists.
// CAPTION HOLD (ruling 74 / 69 disp. 2): the framing claims attribution + rails ONLY, never a
// fee waiver — no "skip"/"waive"/"service fee" wording.
function DirectLinkChannel({
  serviceId,
  serviceName,
}: {
  serviceId: string | null;
  serviceName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const analytics = useQuery<LinkAnalyticsShape>({
    queryKey: ["/api/me/link-analytics"],
    enabled: !!serviceId,
  });

  const existing = findDirectLink(analytics.data?.links, serviceId);
  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // A change of listing resets the transient minted URL + QR toggle (the existing-link lookup
  // re-derives from analytics for the new listing).
  useEffect(() => {
    setMintedUrl(null);
    setShowQr(false);
  }, [serviceId]);

  const linkUrl = existing ? `${window.location.origin}/r/${existing.code}` : mintedUrl;
  const caption = buildOfferingCaption({
    id: serviceId ?? "",
    lane: "service",
    laneLabel: "Service",
    name: serviceName,
    city: null,
    price: null,
    publicHref: serviceId ? `/services/${serviceId}` : "/",
  });

  async function getLink() {
    if (!serviceId) return;
    setMinting(true);
    try {
      const url = await ensureShortLink(
        { targetType: "service", targetId: serviceId },
        `/services/${serviceId}`,
      );
      setMintedUrl(url);
      // Flip the D4 chip honestly: re-read link-analytics so "link ready" reflects the real row.
      queryClient.invalidateQueries({ queryKey: ["/api/me/link-analytics"] });
    } catch {
      toast({ title: "Couldn't create a link", description: "Please try again.", variant: "destructive" });
    } finally {
      setMinting(false);
    }
  }

  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      toast({ title: "Link copied", description: linkUrl });
    } catch {
      toast({ title: "Couldn't copy", description: "Copy it manually.", variant: "destructive" });
    }
  }

  function shareWhatsApp() {
    if (!linkUrl) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${caption}\n\n${linkUrl}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <Card className="border border-console-light" data-testid="card-channel-direct">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-console-darkest">
          <LinkIcon className="w-4 h-4 text-primary" />
          Direct link
        </CardTitle>
        <p className="text-sm text-console-mid">
          Your own trackable booking link for this listing — share it anywhere.
        </p>
      </CardHeader>
      <CardContent>
        {!serviceId ? (
          <p className="text-sm text-console-mid" data-testid="text-direct-no-selection">
            Pick a listing above to get its direct link.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Honest framing — attribution + rails ONLY, no fee-waiver wording (caption hold). */}
            <p className="text-sm text-console-mid" data-testid="text-direct-framing">
              A booking through your own link is attributed to you and secures your rails rate.
            </p>

            {!linkUrl ? (
              <Button size="sm" onClick={getLink} disabled={minting} data-testid="button-direct-get-link">
                <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                {minting ? "Creating link…" : "Get link"}
              </Button>
            ) : (
              <div className="space-y-3">
                <p
                  className="text-[12.5px] text-console-darkest break-all rounded-md border border-console-light bg-console-bg/50 p-2"
                  style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
                  data-testid="text-direct-url"
                >
                  {linkUrl}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copyLink} data-testid="button-direct-copy">
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy link
                  </Button>
                  <Button size="sm" variant="outline" onClick={shareWhatsApp} data-testid="button-direct-whatsapp">
                    <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowQr((v) => !v)}
                    data-testid="button-direct-qr-toggle"
                  >
                    <QrCode className="w-3.5 h-3.5 mr-1.5" />
                    {showQr ? "Hide QR" : "Show QR"}
                  </Button>
                </div>
                {showQr && (
                  <div className="space-y-2" data-testid="block-direct-qr">
                    <img
                      src={qrCodeSvgDataUrl(linkUrl)}
                      alt={`QR code for the direct link to ${serviceName}`}
                      className="w-40 h-40 rounded-lg border border-console-light bg-white"
                      data-testid="img-direct-qr"
                    />
                    <a
                      href={qrCodeSvgDataUrl(linkUrl)}
                      download={`${serviceId}-direct-qr.svg`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                      data-testid="link-direct-qr-download"
                    >
                      <Download className="w-3 h-3" /> Download QR
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Social-kit channel (D3, per-listing; S6 — reuse, not reimplementation) ─────────────────────
//
// The share kit — the three real share-image frames + an editable caption + Instagram-publish
// + copy/WhatsApp/X actions, for THIS listing. S6 mounts the SAME <OfferingShareDetail/> Catalog's
// per-card Share dialog used to open (client/src/components/backoffice/share-tools.tsx) — no
// second renderer, no second caption engine, and no lost feature (the Instagram-publish button
// that lived only in Catalog's dialog is preserved by reusing the exact component). Per ruling
// 22b's own reasoning updated by S6: "per-listing share authoring" now stays on Distribute, since
// Distribute is the one home for outward-facing distribution surfaces — there is no longer a
// second surface on Catalog to defer to, so no deep-link back is needed.
function SocialKitChannel({ service }: { service: OwnerService | null }) {
  const serviceId = service?.id ?? null;
  const serviceName = service?.serviceName ?? "this listing";
  const readiness = useQuery<PublishReadiness>({
    queryKey: [`/api/provider/services/${serviceId}/publish-readiness`],
    enabled: !!serviceId,
  });
  const isLive = readiness.data?.isLive ?? false;

  const offering: OfferingShareOption | null = service
    ? {
        id: service.id,
        lane: "service",
        laneLabel: "Service",
        name: service.serviceName || "Untitled service",
        city: service.city ?? null,
        price:
          service.price != null && service.price !== ""
            ? `$${Number(service.price).toFixed(0)}`
            : null,
        publicHref: `/services/${service.id}`,
      }
    : null;

  return (
    <Card className="border border-console-light" data-testid="card-channel-social">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-console-darkest">
          <Images className="w-4 h-4 text-primary" />
          Social kit
        </CardTitle>
        <p className="text-sm text-console-mid">
          Ready-to-post images, an editable caption and one-tap Instagram publish for this listing.
        </p>
      </CardHeader>
      <CardContent>
        {!serviceId || !offering ? (
          <p className="text-sm text-console-mid" data-testid="text-social-no-selection">
            Pick a listing above to see its social kit.
          </p>
        ) : readiness.isLoading ? (
          <div className="grid sm:grid-cols-3 gap-3" data-testid="skeleton-social">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !isLive ? (
          // §13: the share-image endpoint 404s for a non-approved/inactive listing — the kit is
          // honestly unavailable rather than rendering broken images. No Catalog deep-link (S6 —
          // Catalog carries no share surface to send them to); resolving the block is Marketplace's
          // job, right above this card.
          <p className="text-sm text-console-mid" data-testid="social-unavailable">
            Social images unlock once this listing is approved and active on the marketplace.
          </p>
        ) : (
          <OfferingShareDetail offering={offering} showImages />
        )}
      </CardContent>
    </Card>
  );
}

// ── Promote section (posting-opportunity nudges; S6 — moved here from Catalog) ─────────────────
//
// Real, review/open-slot-scoped nudges (§13 — no invented opportunities) with their FULL inline
// share actions (Copy caption+link / WhatsApp / X / Instagram publish) — the same
// <PostingOpportunitiesCard/> the expert Catalog mounts, called WITHOUT `promoteHref` since that
// prop only ever made sense pointing FROM Catalog TO this hub; here the real actions belong
// in place. `onSelectService` wires "Select in picker" to the page's own listing selector, so
// acting on a nudge also loads that listing into the channels above.
function PromoteSection({ onSelectService }: { onSelectService: (serviceId: string) => void }) {
  return (
    <section data-testid="section-channel-promote" className="space-y-2">
      <h2 className="text-xs font-semibold text-console-mid uppercase tracking-wide flex items-center gap-1.5">
        <Share2 className="w-3.5 h-3.5" /> Promote
      </h2>
      <PostingOpportunitiesCard onSelectService={onSelectService} />
    </section>
  );
}

// ── Channel-state strip + analytics deep-link (D4, persistent) ───────────────────────────────
//
// Honest chips for the four channels, derived from REAL state ONLY (§13) — a chip reads "ready"
// only when the underlying thing actually exists:
//   · Storefront — live iff the account has a handle AND ≥1 approved+active listing (the SAME
//     predicate the storefront header uses).
//   · Marketplace — live iff the selected listing's publish-readiness `isLive` (approved+active).
//   · Direct — "link ready" iff a direct short link for the selected listing exists in
//     link-analytics (existence only — NO click/booking/revenue numbers rendered here).
//   · Social — "images ready" iff the listing is approved+active (the share-image render gate).
// Measurement stays on Analytics/Earnings (ruling 74 disp. 8 / 22d): the strip DEEP-LINKS to the
// Performance → Analytics home; it mounts NO analytics panel and renders NO metrics.
function ChannelStateStrip({
  services,
  selectedId,
}: {
  services: OwnerService[];
  selectedId: string | null;
}) {
  const { user } = useAuth();
  const handle = (user as any)?.handle as string | null | undefined;

  const readiness = useQuery<PublishReadiness>({
    queryKey: [`/api/provider/services/${selectedId}/publish-readiness`],
    enabled: !!selectedId,
  });
  const analytics = useQuery<LinkAnalyticsShape>({
    queryKey: ["/api/me/link-analytics"],
    enabled: !!selectedId,
  });

  const approvedActiveCount = services.filter(
    (s) => s.approvalStatus === "approved" && s.status === "active",
  ).length;
  const storefrontReady = !!handle && approvedActiveCount > 0;
  const marketplaceLive = readiness.data?.isLive ?? false;
  const directReady = !!findDirectLink(analytics.data?.links, selectedId);
  const socialReady = readiness.data?.isLive ?? false;

  const perListingResolving = !!selectedId && (readiness.isLoading || analytics.isLoading);

  function Chip({
    testId,
    icon,
    label,
    ready,
    readyText,
    notReadyText,
    resolving,
  }: {
    testId: string;
    icon: ReactNode;
    label: string;
    ready: boolean;
    readyText: string;
    notReadyText: string;
    resolving?: boolean;
  }) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-console-light bg-white px-3 py-2"
        data-testid={testId}
      >
        <span className="text-console-mid">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-console-darkest leading-tight">{label}</p>
          {resolving ? (
            <p className="text-[11px] text-console-mid leading-tight">Checking…</p>
          ) : ready ? (
            <p className="text-[11px] text-green-700 leading-tight flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {readyText}
            </p>
          ) : (
            <p className="text-[11px] text-console-mid leading-tight">{notReadyText}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-console-light bg-console-bg/40 p-3"
      data-testid="channel-state-strip"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-0">
        <Chip
          testId="chip-storefront"
          icon={<Store className="w-4 h-4" />}
          label="Storefront"
          ready={storefrontReady}
          readyText="live"
          notReadyText={handle ? "no approved listings" : "no handle yet"}
          resolving={false}
        />
        <Chip
          testId="chip-marketplace"
          icon={<ShoppingBag className="w-4 h-4" />}
          label="Marketplace"
          ready={marketplaceLive}
          readyText="live"
          notReadyText="not live yet"
          resolving={perListingResolving}
        />
        <Chip
          testId="chip-direct"
          icon={<LinkIcon className="w-4 h-4" />}
          label="Direct"
          ready={directReady}
          readyText="link ready"
          notReadyText="no link yet"
          resolving={perListingResolving}
        />
        <Chip
          testId="chip-social"
          icon={<Images className="w-4 h-4" />}
          label="Social"
          ready={socialReady}
          readyText="images ready"
          notReadyText="needs approval"
          resolving={perListingResolving}
        />
      </div>
      <Link href={ANALYTICS_HOME_HREF}>
        <Button size="sm" variant="outline" data-testid="button-view-link-performance">
          <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
          View link performance
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </Link>
    </div>
  );
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

  // Per-listing channels act on ONE selected listing (Marketplace/Direct/Social + the strip).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Real, non-bundle-agnostic listing set (a bundle/property IS a provider_services row and
  // distributes the same way, so all owner listings are selectable).
  const listings = useMemo(
    () => (Array.isArray(services) ? services : []),
    [services],
  );

  // S6: Catalog's per-card "Distribute this →" pointer lands here as `?listing=<id>` — the id
  // only PICKS a row out of THIS account's own listing read (same convention as Workstation's
  // `?property=`/`?bundle=` deep-links); a hand-edited or stale id that doesn't match one of the
  // owner's own listings is silently ignored and the page falls back to selecting the first
  // listing, same as arriving with no param at all (never a dead end, never someone else's row).
  const search = useSearch();
  const deepLinkListing = new URLSearchParams(search).get("listing");
  const consumedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId || listings.length === 0) return;
    if (deepLinkListing && consumedDeepLink.current !== deepLinkListing) {
      consumedDeepLink.current = deepLinkListing;
      const match = listings.find((s) => s.id === deepLinkListing);
      if (match) {
        setSelectedId(match.id);
        return;
      }
    }
    setSelectedId(listings[0].id);
  }, [listings, selectedId, deepLinkListing]);

  const selectedService = listings.find((s) => s.id === selectedId) ?? null;
  const selectedName = selectedService?.serviceName ?? "this listing";

  return (
    <ProviderLayout title="Distribute">
      <div className="p-6 space-y-6">
        <PageHeader
          icon={Share2}
          title="Distribute"
          subtitle="One hub for getting what you sell seen — your storefront, the marketplace, direct links, social kits and posting nudges."
          testId="text-distribute-title"
        />

        {/* ── Storefront channel (account-level) — the ONE mount of ProviderStorefrontHeader
            (S6: Catalog no longer mounts it) ─────────────────────────────────────────────── */}
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

          {/* D4 — persistent channel-state strip (honest chips) + analytics deep-link. Renders
              only when a listing is selected (the chips are per-listing where relevant). */}
          {selectedId && (
            <ChannelStateStrip services={listings} selectedId={selectedId} />
          )}

          {/* Marketplace channel (per-listing) */}
          <MarketplaceChannel serviceId={selectedId} />

          {/* D2 — Direct-link channel (per-listing) */}
          <DirectLinkChannel serviceId={selectedId} serviceName={selectedName} />

          {/* D3 — Social-kit channel (per-listing) */}
          <SocialKitChannel service={selectedService} />
        </section>

        {/* S6: Promote — moved here from Catalog (real posting-opportunity nudges + inline
            share actions), account-wide (not gated on the listing selector above). */}
        <PromoteSection onSelectService={setSelectedId} />
      </div>
    </ProviderLayout>
  );
}
