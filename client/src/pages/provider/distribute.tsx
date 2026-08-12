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
import { useState, useMemo, useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { PageHeader } from "@/components/backoffice/primitives";
import { ProviderStorefrontHeader } from "@/pages/provider/services";
import { ensureShortLink, buildOfferingCaption } from "@/components/backoffice/share-tools";
import { qrCodeSvgDataUrl } from "@/lib/qrcode";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  ExternalLink,
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

// ── Social-kit channel (D3, per-listing) ────────────────────────────────────────────────────
//
// The share kit — a preview of the three real share-image frames + a caption + a deep-link INTO
// the Catalog share studio for full authoring (ruling 22b: per-listing share authoring stays on
// Catalog). REUSE, not reimplementation: the images point at the EXISTING share-image rail
// (`GET /api/share-image/service/:id.png?format=feed|story|route`) — no second renderer; the
// caption comes from the EXISTING promo-text endpoint with the shared `buildOfferingCaption`
// neutral fallback — no new caption engine. §13: the share images gate on approved+active, so the
// kit is honestly UNAVAILABLE for a non-live listing (the render would 404), and the Route frame
// collapses to an honest "no stops yet" when the service has no route (the endpoint 404s).
function SocialKitChannel({
  serviceId,
  serviceName,
}: {
  serviceId: string | null;
  serviceName: string;
}) {
  const { toast } = useToast();
  const readiness = useQuery<PublishReadiness>({
    queryKey: [`/api/provider/services/${serviceId}/publish-readiness`],
    enabled: !!serviceId,
  });
  const isLive = readiness.data?.isLive ?? false;

  const [caption, setCaption] = useState("");
  const [routeAvailable, setRouteAvailable] = useState(true);
  useEffect(() => {
    setRouteAvailable(true);
    if (!serviceId) {
      setCaption("");
      return;
    }
    // Neutral fallback shows immediately; the server caption (when available) replaces it.
    setCaption(
      buildOfferingCaption({
        id: serviceId,
        lane: "service",
        laneLabel: "Service",
        name: serviceName,
        city: null,
        price: null,
        publicHref: `/services/${serviceId}`,
      }),
    );
    let cancelled = false;
    fetch(`/api/promo-text?targetType=service&targetId=${serviceId}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.caption) setCaption(data.caption);
      })
      .catch(() => {
        /* keep the neutral fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, serviceName]);

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      toast({ title: "Caption copied", description: "Paste it into your post." });
    } catch {
      toast({ title: "Couldn't copy", description: "Copy it manually.", variant: "destructive" });
    }
  }

  const feedSrc = serviceId ? `/api/share-image/service/${serviceId}.png?format=feed` : "";
  const storySrc = serviceId ? `/api/share-image/service/${serviceId}.png?format=story` : "";
  const routeSrc = serviceId ? `/api/share-image/service/${serviceId}.png?format=route` : "";

  return (
    <Card className="border border-console-light" data-testid="card-channel-social">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-console-darkest">
          <Images className="w-4 h-4 text-primary" />
          Social kit
        </CardTitle>
        <p className="text-sm text-console-mid">
          Ready-to-post images and a caption for this listing. Full authoring lives in the Catalog
          share studio.
        </p>
      </CardHeader>
      <CardContent>
        {!serviceId ? (
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
          // honestly unavailable rather than rendering broken images.
          <div className="space-y-2" data-testid="social-unavailable">
            <p className="text-sm text-console-mid">
              Social images unlock once this listing is approved and active on the marketplace.
            </p>
            <Link href="/provider/services">
              <Button size="sm" variant="outline" data-testid="link-social-catalog">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Catalog
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              {/* Feed */}
              <div className="space-y-1.5" data-testid="tile-social-feed">
                <p className="text-xs font-medium text-console-mid">Feed</p>
                <img
                  src={feedSrc}
                  alt={`${serviceName} — feed share card`}
                  className="w-full rounded-lg border border-console-light"
                  data-testid="img-social-feed"
                />
                <a
                  href={feedSrc}
                  download={`${serviceId}-feed.png`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  data-testid="link-social-download-feed"
                >
                  <Download className="w-3 h-3" /> Download image
                </a>
              </div>
              {/* Story */}
              <div className="space-y-1.5" data-testid="tile-social-story">
                <p className="text-xs font-medium text-console-mid">Story</p>
                <img
                  src={storySrc}
                  alt={`${serviceName} — story share card`}
                  className="w-full rounded-lg border border-console-light"
                  data-testid="img-social-story"
                />
                <a
                  href={storySrc}
                  download={`${serviceId}-story.png`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  data-testid="link-social-download-story"
                >
                  <Download className="w-3 h-3" /> Download image
                </a>
              </div>
              {/* Route — §13: honestly absent when the service has no route stops (endpoint 404s). */}
              <div className="space-y-1.5" data-testid="tile-social-route">
                <p className="text-xs font-medium text-console-mid">Route</p>
                {routeAvailable ? (
                  <>
                    <img
                      src={routeSrc}
                      alt={`${serviceName} — route share card`}
                      className="w-full rounded-lg border border-console-light"
                      onError={() => setRouteAvailable(false)}
                      data-testid="img-social-route"
                    />
                    <a
                      href={routeSrc}
                      download={`${serviceId}-route.png`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                      data-testid="link-social-download-route"
                    >
                      <Download className="w-3 h-3" /> Download image
                    </a>
                  </>
                ) : (
                  <div
                    className="rounded-lg border border-dashed border-console-light p-3 text-xs text-console-mid"
                    data-testid="text-social-route-absent"
                  >
                    No route stops on this listing yet — add stops on the Catalog map to unlock the
                    Route frame.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-console-mid" htmlFor="social-caption">
                Caption
              </label>
              <Textarea
                id="social-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                data-testid="textarea-social-caption"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copyCaption} data-testid="button-social-copy-caption">
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy caption
              </Button>
              <Link href="/provider/services">
                <Button size="sm" variant="outline" data-testid="link-social-studio">
                  <Share2 className="w-3.5 h-3.5 mr-1.5" /> Open share studio in Catalog
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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

  const selectedName =
    listings.find((s) => s.id === selectedId)?.serviceName ?? "this listing";

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
          <SocialKitChannel serviceId={selectedId} serviceName={selectedName} />
        </section>
      </div>
    </ProviderLayout>
  );
}
