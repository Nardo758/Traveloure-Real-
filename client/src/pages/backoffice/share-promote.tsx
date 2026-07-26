/**
 * SharePromote — the "Share & Promote" backoffice surface (Wave SH, task SH2;
 * docs/backoffice/mockups/mockup-social-sharing.html; docs/backoffice/MOCKUP_CODE_AUDIT.md
 * "Mockup 4 — Share Your Offerings").
 *
 * One shared page for both consoles (role-picked layout, same pattern as the rest of the
 * backoffice components living in components/backoffice/*): renders inside ExpertLayout for
 * expert-family roles, ProviderLayout for service_provider. Reuses the SAME owner-console
 * queries MyOfferingsTable already uses (/api/expert/services, /api/expert/templates,
 * /api/expert/ready-made/mine for experts; /api/provider/services for providers) — no new
 * backend, per the SH2 brief ("mostly mockup 4 verbatim").
 *
 * Only APPROVED (+ active/published, matching each lane's own public read-gate — F2 / §10)
 * offerings are offered for sharing: a submitted/draft listing has no public page and its
 * share-image endpoint 404s (F2 gate in share-images.routes.ts), so surfacing it here would be
 * a dead preview. Real share images (SH1, /api/share-image/service/:id.png) exist for the
 * SERVICE lane only; templates and Ready Made Trips get link + caption sharing for now.
 *
 * §16: every share action here is either copy-to-clipboard or an informational wa.me/X intent
 * link (never a raw booking CTA), and the link always routes back through the platform's own
 * short link (/r/:code) or storefront (/p/:handle) — never off-platform.
 * §13: captions are pre-filled from real offering fields only (name, city, the short link) and
 * are user-editable; nothing fabricated.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, MessageCircle, Share2, Store } from "lucide-react";

type Lane = "service" | "template" | "ready_made";

interface OfferingOption {
  id: string;
  lane: Lane;
  laneLabel: string;
  name: string;
  city: string | null;
  price: string | null;
  publicHref: string;
}

function isProviderRole(role?: string | null): boolean {
  return role === "service_provider";
}

function buildOfferingCaption(offering: OfferingOption): string {
  const location = offering.city ? ` in ${offering.city}` : "";
  return `${offering.name}${location} — book it on Traveloure.`;
}

async function ensureShortLink(
  body: { targetType: string; targetId?: string },
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

function ShareActions({
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

export default function SharePromote() {
  const { user } = useAuth();
  const isProvider = isProviderRole(user?.role);
  const Layout = isProvider ? ProviderLayout : ExpertLayout;
  const handle = (user as any)?.handle as string | null | undefined;

  const servicesQuery = useQuery<any[]>({
    queryKey: [isProvider ? "/api/provider/services" : "/api/expert/services"],
  });
  const templatesQuery = useQuery<any[]>({
    queryKey: ["/api/expert/templates"],
    enabled: !isProvider,
  });
  const readyMadeQuery = useQuery<any[]>({
    queryKey: ["/api/expert/ready-made/mine"],
    enabled: !isProvider,
  });

  const isLoading =
    servicesQuery.isLoading || (!isProvider && (templatesQuery.isLoading || readyMadeQuery.isLoading));

  const offerings: OfferingOption[] = useMemo(() => {
    const rows: OfferingOption[] = [];
    for (const s of Array.isArray(servicesQuery.data) ? servicesQuery.data : []) {
      // Matches the F2 read-gate share-images.routes.ts enforces (approved + active) — no
      // dead preview for a listing that can't actually render one.
      if (s.approvalStatus === "approved" && s.status === "active") {
        rows.push({
          id: s.id,
          lane: "service",
          laneLabel: "Service",
          name: s.serviceName ?? s.title ?? "Untitled service",
          city: s.city ?? null,
          price: s.price != null ? `$${Number(s.price).toFixed(0)}` : null,
          publicHref: `/services/${s.id}`,
        });
      }
    }
    if (!isProvider) {
      for (const t of Array.isArray(templatesQuery.data) ? templatesQuery.data : []) {
        if (t.approvalStatus === "approved" && t.isPublished) {
          rows.push({
            id: t.id,
            lane: "template",
            laneLabel: "Itinerary Template",
            name: t.title ?? "Untitled template",
            city: null,
            price: t.price != null ? `$${Number(t.price).toFixed(0)}` : null,
            publicHref: `/expert-templates/${t.id}`,
          });
        }
      }
      for (const r of Array.isArray(readyMadeQuery.data) ? readyMadeQuery.data : []) {
        if (r.status === "approved") {
          rows.push({
            id: r.id,
            lane: "ready_made",
            laneLabel: "Ready Made Trip",
            name: r.title ?? "Untitled trip",
            city: null,
            price: r.priceCents != null ? `$${(r.priceCents / 100).toFixed(0)}` : null,
            publicHref: `/ready-made/${r.id}`,
          });
        }
      }
    }
    return rows;
  }, [servicesQuery.data, templatesQuery.data, readyMadeQuery.data, isProvider]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    offerings.find((o) => `${o.lane}-${o.id}` === selectedKey) ?? offerings[0] ?? null;

  const [caption, setCaption] = useState("");
  useEffect(() => {
    if (selected) setCaption(buildOfferingCaption(selected));
  }, [selected?.lane, selected?.id]);

  const [storefrontCaption, setStorefrontCaption] = useState("");
  useEffect(() => {
    if (handle) {
      setStorefrontCaption(`Check out everything I offer on Traveloure — my storefront is @${handle}.`);
    }
  }, [handle]);

  return (
    <Layout title="Share & Promote">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#1A1A18" }}>
            Share &amp; Promote
          </h1>
          <p className="text-sm mt-1" style={{ color: "#7A7A72" }}>
            Turn a live offering into a ready-to-post card — every link routes back to Traveloure.
          </p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading your offerings…
            </CardContent>
          </Card>
        ) : offerings.length === 0 ? (
          <Card data-testid="card-share-empty-state">
            <CardContent className="py-10 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Nothing to share yet — an offering becomes shareable once it's approved and live.
              </p>
              <Link href={isProvider ? "/provider/services" : "/expert/services"}>
                <Button size="sm" data-testid="button-create-offering">
                  Create an offering first
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card data-testid="card-offering-picker">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Choose what to share</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {offerings.map((o) => {
                    const key = `${o.lane}-${o.id}`;
                    const isSelected = selected ? `${selected.lane}-${selected.id}` === key : false;
                    return (
                      <Button
                        key={key}
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => setSelectedKey(key)}
                        data-testid={`button-pick-offering-${key}`}
                      >
                        {o.name}
                        <Badge variant="secondary" className="ml-2 text-[10px] font-normal">
                          {o.laneLabel}
                        </Badge>
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {selected && (
              <Card data-testid={`card-share-detail-${selected.lane}-${selected.id}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{selected.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selected.lane === "service" ? (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Feed (1080×1350)</p>
                        <img
                          src={`/api/share-image/service/${selected.id}.png?format=feed`}
                          alt={`${selected.name} — feed share card`}
                          className="w-full rounded-lg border"
                          style={{ borderColor: "#E8E8E2" }}
                          data-testid={`img-share-feed-${selected.id}`}
                        />
                        <a
                          href={`/api/share-image/service/${selected.id}.png?format=feed`}
                          download={`${selected.id}-feed.png`}
                          className="inline-flex items-center gap-1 text-xs font-medium"
                          style={{ color: "#E85D55" }}
                          data-testid={`link-download-feed-${selected.id}`}
                        >
                          <Download className="w-3 h-3" /> Download image
                        </a>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Story (1080×1920)</p>
                        <img
                          src={`/api/share-image/service/${selected.id}.png?format=story`}
                          alt={`${selected.name} — story share card`}
                          className="w-full rounded-lg border"
                          style={{ borderColor: "#E8E8E2" }}
                          data-testid={`img-share-story-${selected.id}`}
                        />
                        <a
                          href={`/api/share-image/service/${selected.id}.png?format=story`}
                          download={`${selected.id}-story.png`}
                          className="inline-flex items-center gap-1 text-xs font-medium"
                          style={{ color: "#E85D55" }}
                          data-testid={`link-download-story-${selected.id}`}
                        >
                          <Download className="w-3 h-3" /> Download image
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Share images aren't available for {selected.laneLabel.toLowerCase()}s yet — share the
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
                    idPrefix={`offering-${selected.lane}-${selected.id}`}
                    onGetLink={() =>
                      ensureShortLink({ targetType: selected.lane, targetId: selected.id }, selected.publicHref)
                    }
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Card data-testid="card-share-storefront">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              Your storefront
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {handle ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Your storefront is live at <span className="font-medium">/p/{handle}</span> — share the
                  whole thing instead of just one offering.
                </p>
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
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Claim a handle to get one shareable link for everything you offer.{" "}
                <Link href={isProvider ? "/provider/settings" : "/expert/settings"}>
                  <span
                    className="underline cursor-pointer font-medium"
                    style={{ color: "#E85D55" }}
                    data-testid="link-claim-handle"
                  >
                    Claim your handle
                  </span>
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
