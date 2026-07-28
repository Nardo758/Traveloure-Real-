/**
 * SharePromote — the "Share & Promote" backoffice surface (Wave SH, task SH2;
 * docs/backoffice/mockups/mockup-social-sharing.html; docs/backoffice/MOCKUP_CODE_AUDIT.md
 * "Mockup 4 — Share Your Offerings").
 *
 * Console IA C2 (§17 17→9 collapse): the EXPERT route (/expert/share-promote) now redirects
 * to /expert/catalog — Catalog absorbed the offering-scoped creation half (per-row share
 * kits, posting opportunities, storefront caption) and Performance already carries the
 * measurement half. This page stays mounted for the PROVIDER console (/provider/share-promote)
 * until the C9 provider nine-module stamp; the sharing primitives it uses were MOVED to
 * components/backoffice/share-tools.tsx (one implementation, identical server calls) and are
 * composed here exactly as before.
 *
 * Only APPROVED (+ active/published, matching each lane's own public read-gate — F2 / §10)
 * offerings are offered for sharing: a submitted/draft listing has no public page and its
 * share-image endpoint 404s (F2 gate in share-images.routes.ts), so surfacing it here would be
 * a dead preview.
 *
 * §16: every share action is copy-to-clipboard or an informational wa.me/X intent link (never
 * a raw booking CTA), always routing back through /r/:code or /p/:handle.
 * §13: captions are generated server-side by the shared promo-text service (deterministic
 * fallback) and stay user-editable. Nothing fabricated either way.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Store } from "lucide-react";
import {
  OfferingShareDetail,
  OfferingShareOption,
  PostingOpportunitiesCard,
  StorefrontShareTools,
} from "@/components/backoffice/share-tools";

function isProviderRole(role?: string | null): boolean {
  return role === "service_provider";
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
  // /mine returns { listings: [...] } (ready-made.routes.ts) — audit finding: the old
  // Array.isArray guard silently emptied the Ready Made lane here forever.
  const readyMadeQuery = useQuery<{ listings: any[] }>({
    queryKey: ["/api/expert/ready-made/mine"],
    enabled: !isProvider,
  });

  const isLoading =
    servicesQuery.isLoading || (!isProvider && (templatesQuery.isLoading || readyMadeQuery.isLoading));

  const offerings: OfferingShareOption[] = useMemo(() => {
    const rows: OfferingShareOption[] = [];
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
      for (const r of readyMadeQuery.data?.listings ?? []) {
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

        <PostingOpportunitiesCard
          onSelectService={(serviceId) => setSelectedKey(`service-${serviceId}`)}
        />

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
              <Link href={isProvider ? "/provider/services" : "/expert/services/new"}>
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
                <CardContent>
                  <OfferingShareDetail offering={selected} showImages={selected.lane === "service"} />
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
                <StorefrontShareTools handle={handle} />
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
