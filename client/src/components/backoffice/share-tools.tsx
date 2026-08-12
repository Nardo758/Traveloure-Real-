/**
 * share-tools — the offering-scoped sharing/creation primitives, MOVED verbatim out of
 * pages/backoffice/share-promote.tsx by Console IA C2 (§17 17→9 collapse) so Catalog can
 * absorb Share & Promote's creation half without rebuilding it. C9 finished the collapse:
 * share-promote.tsx is deleted (both console routes redirect into their Catalogs — expert
 * /expert/catalog, provider /provider/services), and BOTH Catalog pages compose these
 * primitives — ONE implementation, every server call identical to the SH2/SH3/A3 originals:
 *   - POST /api/short-links (tracked short link, graceful full-URL fallback)
 *   - GET  /api/promo-text?targetType=… (server captions, deterministic client fallback)
 *   - GET  /api/me/posting-opportunities (SH3 — real rows only, §13)
 *   - /api/share-image/service/:id.png?format=feed|story + /api/share-image/review/:id.png
 * §16: every action is copy-to-clipboard or an informational wa.me/X intent link routing
 * back through /r/:code or /p/:handle — never an off-site booking CTA.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, MessageCircle, Share2, Sparkles, Instagram, ArrowRight } from "lucide-react";
import type { ShareFrame } from "@shared/share-frames";
import { SHARE_FRAME_LABEL } from "@shared/share-frames";
import { connectInstagram } from "@/lib/instagram-connect";

export type ShareLane = "service" | "template" | "ready_made";

export interface OfferingShareOption {
  id: string;
  lane: ShareLane;
  laneLabel: string;
  name: string;
  city: string | null;
  price: string | null;
  publicHref: string;
}

// SH3 — Posting Opportunities. Every entry is backed by a real row surfaced by
// GET /api/me/posting-opportunities (server: expert-console.routes.ts); §13: no fabricated
// prompts. The union deliberately has no 'seasonal' member — seasonal_opportunities has no
// writer/seeder anywhere in the codebase (0 rows), so that source is honestly omitted rather
// than faked, not just hidden client-side.
//
// D4 — every opportunity carries a `suggestedFrame` (server-derived, deterministic; see
// expert-console.routes.ts's posting-opportunities handler for the exact mapping) so acting on
// an opportunity opens the right share-image frame and tags the resulting short link with it.
export type PostingOpportunity =
  | {
      kind: "new_review";
      reviewId: string;
      rating: number;
      text: string;
      serviceId: string;
      serviceName: string;
      createdAt: string;
      suggestedFrame: ShareFrame;
    }
  | {
      kind: "open_slots";
      serviceId: string;
      serviceName: string;
      nextDate: string;
      openSpots: number;
      suggestedFrame: ShareFrame;
    };

function buildReviewCaption(o: Extract<PostingOpportunity, { kind: "new_review" }>): string {
  const quote = o.text ? ` — "${o.text}"` : "";
  return `New ${o.rating}★ review on ${o.serviceName}${quote} 🙌`;
}

function formatOpportunityDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildSlotCaption(o: Extract<PostingOpportunity, { kind: "open_slots" }>): string {
  const spots = o.openSpots === 1 ? "1 spot" : `${o.openSpots} spots`;
  return `${spots} still open for ${o.serviceName} on ${formatOpportunityDate(o.nextDate)} — book yours on Traveloure.`;
}

export function buildOfferingCaption(offering: OfferingShareOption): string {
  const location = offering.city ? ` in ${offering.city}` : "";
  // Ruling 69 disposition 2 — the NEUTRAL direct-link line, kept byte-identical to the server's
  // `DIRECT_LINK_CAPTION_LINE` so the instant client fallback and the caption that replaces it a
  // moment later do not say two different things. It claims nothing about fees: the fee-waiver
  // wording stays HELD until the traveler fee is actually billed on the direct path.
  return `${offering.name}${location} — book it on Traveloure. Book direct through my link.`;
}

export async function ensureShortLink(
  // D4 (migration 193): optional `frame` — omit for the historical untagged link (unchanged
  // behavior). Passing a frame gets its OWN short link (server-side dedupe keys on it too), so a
  // frame-tagged link never collides with — or gets served instead of — the generic one.
  body: { targetType: string; targetId?: string; frame?: ShareFrame },
  fallbackHref: string,
): Promise<string> {
  try {
    const res = await fetch("/api/short-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Failed (${res.status})`);
    const data = (await res.json()) as { url: string };
    return `${window.location.origin}${data.url}`;
  } catch {
    // Graceful fallback to the existing full public URL (same pattern as MyOfferingsTable's share()).
    return `${window.location.origin}${fallbackHref}`;
  }
}

/**
 * InstagramPublishButton — D4's publish button: wires the EXISTING Instagram publish rail
 * (server/routes/instagram.ts POST /api/instagram/publish — real OAuth + container + publish,
 * unchanged) into the share kit so an owner can post a frame + caption without leaving here for
 * Content Studio. No second Instagram integration; this is the same endpoint Content Studio uses.
 *
 * Honesty states (§13 — never a button that silently fails):
 *   - `available: false` (the caller already knows the frame can't render — e.g. an unapproved
 *     listing, or a route frame with no stops) -> disabled, with the reason shown.
 *   - Instagram not connected -> the button says so and triggers the SAME connect flow Content
 *     Studio uses (`connectInstagram`, `client/src/lib/instagram-connect.ts`) rather than a dead
 *     button or a second OAuth implementation.
 *   - Otherwise -> publishes `imageUrl` (resolved to an absolute, publicly-reachable URL — Meta's
 *     Graph API fetches the image server-side, it cannot see a relative path) + caption via the
 *     existing endpoint.
 */
export function InstagramPublishButton({
  imageUrl,
  caption,
  available,
  unavailableReason,
  idPrefix,
}: {
  /** Path (relative or absolute) to the share-image render this button publishes. */
  imageUrl: string;
  caption: string;
  /** Whether this exact frame can be published right now (caller has already checked the
   *  approval gate / route-stops gate the way the image itself is gated). */
  available: boolean;
  unavailableReason?: string;
  idPrefix: string;
}) {
  const { toast } = useToast();
  const [publishing, setPublishing] = useState(false);
  const statusQuery = useQuery<{ connected: boolean; reason?: string }>({
    queryKey: ["/api/instagram/status"],
    enabled: available,
  });
  const connected = statusQuery.data?.connected ?? false;

  if (!available) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        title={unavailableReason}
        data-testid={`button-${idPrefix}-publish-ig-disabled`}
      >
        <Instagram className="w-3.5 h-3.5 mr-1.5" />
        {unavailableReason ?? "Can't publish this frame yet"}
      </Button>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <Button size="sm" variant="outline" disabled data-testid={`button-${idPrefix}-publish-ig-checking`}>
        <Instagram className="w-3.5 h-3.5 mr-1.5" />
        Checking Instagram…
      </Button>
    );
  }

  if (!connected) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          const result = await connectInstagram();
          if (!result.ok) {
            toast({
              title: "Couldn't start Instagram connect",
              description: "Please try again.",
              variant: "destructive",
            });
          }
        }}
        data-testid={`button-${idPrefix}-connect-ig`}
      >
        <Instagram className="w-3.5 h-3.5 mr-1.5" />
        Connect Instagram to publish
      </Button>
    );
  }

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const absoluteUrl = imageUrl.startsWith("http") ? imageUrl : `${window.location.origin}${imageUrl}`;
      const res = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageUrl: absoluteUrl, caption }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Publish failed (${res.status})`);
      }
      toast({ title: "Published to Instagram", description: "Your post is now live." });
    } catch (err: any) {
      toast({
        title: "Publish failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Button
      size="sm"
      disabled={publishing}
      onClick={handlePublish}
      data-testid={`button-${idPrefix}-publish-ig`}
    >
      <Instagram className="w-3.5 h-3.5 mr-1.5" />
      {publishing ? "Publishing…" : "Publish to Instagram"}
    </Button>
  );
}

export function ShareActions({
  caption,
  onGetLink,
  idPrefix,
}: {
  caption: string;
  onGetLink: () => Promise<string>;
  idPrefix: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(kind: "copy" | "whatsapp" | "x") {
    setBusy(kind);
    try {
      const link = await onGetLink();
      if (kind === "copy") {
        await navigator.clipboard.writeText(`${caption}\n\n${link}`);
        toast({ title: "Copied", description: "Caption + link copied to your clipboard." });
      } else if (kind === "whatsapp") {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(`${caption}\n\n${link}`)}`,
          "_blank",
          "noopener,noreferrer",
        );
      } else {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(link)}`,
          "_blank",
          "noopener,noreferrer",
        );
      }
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={busy === "copy"}
        onClick={() => run("copy")}
        data-testid={`button-${idPrefix}-copy`}
      >
        <Copy className="w-3.5 h-3.5 mr-1.5" />
        Copy caption + link
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy === "whatsapp"}
        onClick={() => run("whatsapp")}
        data-testid={`button-${idPrefix}-whatsapp`}
      >
        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
        WhatsApp
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy === "x"}
        onClick={() => run("x")}
        data-testid={`button-${idPrefix}-x`}
      >
        <Share2 className="w-3.5 h-3.5 mr-1.5" />
        X
      </Button>
    </div>
  );
}

/**
 * OfferingShareDetail — the share kit for ONE offering: feed/story share images (service
 * lane only, matching the F2 approved+active gate share-images.routes.ts enforces — the
 * caller passes showImages accordingly), the server-generated editable caption, and the
 * §16 share actions. Moved verbatim from share-promote's detail card body.
 */
export function OfferingShareDetail({
  offering,
  showImages,
}: {
  offering: OfferingShareOption;
  showImages: boolean;
}) {
  const [caption, setCaption] = useState("");
  // Ruling 22(d): the Route frame only exists for a service that HAS route stops — the
  // share-image endpoint 404s otherwise (honest absence, §13) and the img onError below
  // collapses the block instead of showing a broken image.
  const [routeAvailable, setRouteAvailable] = useState(true);
  useEffect(() => {
    setRouteAvailable(true);
  }, [offering.id]);
  useEffect(() => {
    // Client-side fallback shows immediately; the server caption (when available) replaces it.
    setCaption(buildOfferingCaption(offering));
    // The promo-text endpoint only knows the service/ready_made lanes today — templates keep the
    // local deterministic fallback above.
    if (offering.lane !== "service" && offering.lane !== "ready_made") return;
    let cancelled = false;
    fetch(`/api/promo-text?targetType=${offering.lane}&targetId=${offering.id}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.caption) setCaption(data.caption);
      })
      .catch(() => {
        // Fetch error — the client-side fallback set above stays in place.
      });
    return () => {
      cancelled = true;
    };
  }, [offering.lane, offering.id]);

  return (
    <div className="space-y-4">
      {showImages ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Feed (1080×1350)</p>
            <img
              src={`/api/share-image/service/${offering.id}.png?format=feed`}
              alt={`${offering.name} — feed share card`}
              className="w-full rounded-lg border"
              style={{ borderColor: "#E8E8E2" }}
              data-testid={`img-share-feed-${offering.id}`}
            />
            <a
              href={`/api/share-image/service/${offering.id}.png?format=feed`}
              download={`${offering.id}-feed.png`}
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "#E85D55" }}
              data-testid={`link-download-feed-${offering.id}`}
            >
              <Download className="w-3 h-3" /> Download image
            </a>
            <InstagramPublishButton
              imageUrl={`/api/share-image/service/${offering.id}.png?format=feed`}
              caption={caption}
              available
              idPrefix={`offering-feed-${offering.id}`}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Story (1080×1920)</p>
            <img
              src={`/api/share-image/service/${offering.id}.png?format=story`}
              alt={`${offering.name} — story share card`}
              className="w-full rounded-lg border"
              style={{ borderColor: "#E8E8E2" }}
              data-testid={`img-share-story-${offering.id}`}
            />
            <a
              href={`/api/share-image/service/${offering.id}.png?format=story`}
              download={`${offering.id}-story.png`}
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "#E85D55" }}
              data-testid={`link-download-story-${offering.id}`}
            >
              <Download className="w-3 h-3" /> Download image
            </a>
            <InstagramPublishButton
              imageUrl={`/api/share-image/service/${offering.id}.png?format=story`}
              caption={caption}
              available
              idPrefix={`offering-story-${offering.id}`}
            />
          </div>
          {offering.lane === "service" && (
            <div className="space-y-2">
              {routeAvailable && <p className="text-xs font-medium text-muted-foreground">Route (1080×1350)</p>}
              {routeAvailable && (
                <>
                  <img
                    src={`/api/share-image/service/${offering.id}.png?format=route`}
                    alt={`${offering.name} — route share card`}
                    className="w-full rounded-lg border"
                    style={{ borderColor: "#E8E8E2" }}
                    onError={() => setRouteAvailable(false)}
                    data-testid={`img-share-route-${offering.id}`}
                  />
                  <a
                    href={`/api/share-image/service/${offering.id}.png?format=route`}
                    download={`${offering.id}-route.png`}
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: "#E85D55" }}
                    data-testid={`link-download-route-${offering.id}`}
                  >
                    <Download className="w-3 h-3" /> Download image
                  </a>
                </>
              )}
              <InstagramPublishButton
                imageUrl={`/api/share-image/service/${offering.id}.png?format=route`}
                caption={caption}
                available={routeAvailable}
                unavailableReason={routeAvailable ? undefined : "This service has no route stops yet"}
                idPrefix={`offering-route-${offering.id}`}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Share images aren't available for {offering.laneLabel.toLowerCase()}s yet — share the
          link and caption below.
        </p>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="offering-caption">
          Caption
        </label>
        <Textarea
          id="offering-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          data-testid="textarea-offering-caption"
        />
      </div>

      <ShareActions
        caption={caption}
        idPrefix={`offering-${offering.lane}-${offering.id}`}
        onGetLink={() =>
          ensureShortLink({ targetType: offering.lane, targetId: offering.id }, offering.publicHref)
        }
      />
    </div>
  );
}

/** C6 (ruling 74) — a per-opportunity "Promote in Distribute →" deep-link. When a caller passes
 *  `promoteHref` (the provider Catalog does, pointing at the Distribute hub), the opportunity card
 *  keeps the timely NUDGE (image + text + suggested frame) but its share ACTIONS route INTO the
 *  hub rather than opening a second full share surface on Catalog (ruling 74: "no second share
 *  surface"). Callers that omit it (expert Catalog, legacy share-promote) keep the inline actions
 *  byte-unchanged. */
function PromoteInDistributeLink({ href, idPrefix }: { href: string; idPrefix: string }) {
  return (
    <Link href={href}>
      <Button
        size="sm"
        variant="outline"
        className="w-full justify-center"
        data-testid={`button-${idPrefix}-promote-distribute`}
      >
        <Share2 className="w-3.5 h-3.5 mr-1.5" />
        Promote in Distribute
        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
      </Button>
    </Link>
  );
}

/** D4 — a review opportunity always suggests the dedicated review frame (its own share-image
 *  endpoint, no format param). Own state so an image-load failure (e.g. the review or its
 *  service loses approval between the list read and render) only disables THIS card's publish
 *  button, never the whole list. */
function ReviewOpportunityCard({
  o,
  promoteHref,
}: {
  o: Extract<PostingOpportunity, { kind: "new_review" }>;
  promoteHref?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = `/api/share-image/review/${o.reviewId}.png`;
  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      style={{ borderColor: "#E8E8E2" }}
      data-testid={`card-opportunity-review-${o.reviewId}`}
    >
      <img
        src={imageUrl}
        alt={`${o.rating}★ review on ${o.serviceName}`}
        className="w-full rounded-md border"
        style={{ borderColor: "#E8E8E2" }}
        onError={() => setImageFailed(true)}
        data-testid={`img-opportunity-review-${o.reviewId}`}
      />
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">
          New {o.rating}★ review on {o.serviceName} — share it
        </p>
        <Badge variant="outline" className="text-xs" data-testid={`badge-suggested-frame-review-${o.reviewId}`}>
          {SHARE_FRAME_LABEL[o.suggestedFrame]}
        </Badge>
      </div>
      {promoteHref ? (
        <PromoteInDistributeLink href={promoteHref} idPrefix={`opportunity-review-${o.reviewId}`} />
      ) : (
        <>
          <ShareActions
            caption={buildReviewCaption(o)}
            idPrefix={`opportunity-review-${o.reviewId}`}
            onGetLink={() =>
              ensureShortLink(
                { targetType: "service", targetId: o.serviceId, frame: o.suggestedFrame },
                `/services/${o.serviceId}`,
              )
            }
          />
          <InstagramPublishButton
            imageUrl={imageUrl}
            caption={buildReviewCaption(o)}
            available={!imageFailed}
            unavailableReason={imageFailed ? "Share image unavailable right now" : undefined}
            idPrefix={`opportunity-review-${o.reviewId}`}
          />
        </>
      )}
    </div>
  );
}

/** D4 — an open-slot opportunity's suggested frame is server-derived (route when the service
 *  actually has route stops, else feed — expert-console.routes.ts). The preview image and the
 *  publish button both ride that SAME suggested frame, so acting on the opportunity always opens
 *  the frame the server picked, never a different one derived independently on the client. */
function SlotOpportunityCard({
  o,
  onSelectService,
  promoteHref,
}: {
  o: Extract<PostingOpportunity, { kind: "open_slots" }>;
  onSelectService?: (serviceId: string) => void;
  promoteHref?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = `/api/share-image/service/${o.serviceId}.png?format=${o.suggestedFrame}`;
  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      style={{ borderColor: "#E8E8E2" }}
      data-testid={`card-opportunity-slots-${o.serviceId}`}
    >
      {!imageFailed && (
        <img
          src={imageUrl}
          alt={`${o.serviceName} — ${SHARE_FRAME_LABEL[o.suggestedFrame]} share card`}
          className="w-full rounded-md border"
          style={{ borderColor: "#E8E8E2" }}
          onError={() => setImageFailed(true)}
          data-testid={`img-opportunity-slots-${o.serviceId}`}
        />
      )}
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">
          {o.serviceName} has {o.openSpots === 1 ? "1 open spot" : `${o.openSpots} open spots`} on{" "}
          {formatOpportunityDate(o.nextDate)} — promote it
        </p>
        <Badge variant="outline" className="text-xs" data-testid={`badge-suggested-frame-slots-${o.serviceId}`}>
          {SHARE_FRAME_LABEL[o.suggestedFrame]}
        </Badge>
      </div>
      {onSelectService && !promoteHref && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectService(o.serviceId)}
            data-testid={`button-opportunity-slots-select-${o.serviceId}`}
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" />
            Select in picker
          </Button>
        </div>
      )}
      {promoteHref ? (
        <PromoteInDistributeLink href={promoteHref} idPrefix={`opportunity-slots-${o.serviceId}`} />
      ) : (
        <>
          <ShareActions
            caption={buildSlotCaption(o)}
            idPrefix={`opportunity-slots-${o.serviceId}`}
            onGetLink={() =>
              ensureShortLink(
                { targetType: "service", targetId: o.serviceId, frame: o.suggestedFrame },
                `/services/${o.serviceId}`,
              )
            }
          />
          <InstagramPublishButton
            imageUrl={imageUrl}
            caption={buildSlotCaption(o)}
            available={!imageFailed}
            unavailableReason={imageFailed ? "Share image unavailable right now" : undefined}
            idPrefix={`opportunity-slots-${o.serviceId}`}
          />
        </>
      )}
    </div>
  );
}

/**
 * PostingOpportunitiesCard — SH3's review share cards + open-slot promos, moved verbatim.
 * onSelectService is optional: share-promote passes its picker setter; Catalog omits it
 * (the per-opportunity ShareActions carry the full share flow either way).
 */
export function PostingOpportunitiesCard({
  onSelectService,
  promoteHref,
}: {
  onSelectService?: (serviceId: string) => void;
  /** C6 (ruling 74): when set, each opportunity's actions become a deep-link into the Distribute
   *  hub instead of an inline share surface — the Catalog Promote block becomes an on-ramp, not a
   *  second share surface. Omit for the legacy inline behavior (expert Catalog). */
  promoteHref?: string;
}) {
  const opportunitiesQuery = useQuery<{ opportunities: PostingOpportunity[] }>({
    queryKey: ["/api/me/posting-opportunities"],
  });
  const opportunities = opportunitiesQuery.data?.opportunities ?? [];

  return (
    <Card data-testid="card-posting-opportunities">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Posting opportunities
        </CardTitle>
      </CardHeader>
      <CardContent>
        {opportunitiesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking for reasons to post…</p>
        ) : opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-opportunities-empty">
            No posting opportunities right now — check back after a new review or an open slot.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {opportunities.map((o) =>
              o.kind === "new_review" ? (
                <ReviewOpportunityCard key={`review-${o.reviewId}`} o={o} promoteHref={promoteHref} />
              ) : (
                <SlotOpportunityCard
                  key={`slots-${o.serviceId}`}
                  o={o}
                  onSelectService={onSelectService}
                  promoteHref={promoteHref}
                />
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * StorefrontShareTools — the storefront caption + share actions (server caption via
 * GET /api/promo-text?targetType=storefront, deterministic fallback), moved verbatim.
 * The caller decides where it renders (share-promote's storefront card; Catalog's header).
 */
export function StorefrontShareTools({ handle }: { handle: string }) {
  const [storefrontCaption, setStorefrontCaption] = useState("");
  useEffect(() => {
    // Client-side fallback shows immediately; the server caption (when available) replaces it.
    setStorefrontCaption(`Check out everything I offer on Traveloure — my storefront is @${handle}.`);
    let cancelled = false;
    fetch(`/api/promo-text?targetType=storefront`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.caption) setStorefrontCaption(data.caption);
      })
      .catch(() => {
        // Fetch error — the client-side fallback set above stays in place.
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="storefront-caption">
          Caption
        </label>
        <Textarea
          id="storefront-caption"
          value={storefrontCaption}
          onChange={(e) => setStorefrontCaption(e.target.value)}
          rows={2}
          data-testid="textarea-storefront-caption"
        />
      </div>
      <ShareActions
        caption={storefrontCaption}
        idPrefix="storefront"
        onGetLink={() => ensureShortLink({ targetType: "storefront" }, `/p/${handle}`)}
      />
    </div>
  );
}
