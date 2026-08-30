/**
 * MyOfferingsTable — the mockup's single cross-lane offerings table (backoffice Phase 1c;
 * docs/backoffice/mockups/mockup-backoffice-dashboard.html "My Offerings"; Console IA C2 —
 * mockup-console-pages.html section 5, the Catalog frame).
 *
 * Pure client aggregation of the three existing owner-console endpoints — no new backend
 * (EXPERT_SIDE_MAP: "client aggregation + a normalized status column"). Status vocabulary maps
 * 1:1 onto the real approval lifecycle (D1a): draft → submitted ("Pending Review") → approved /
 * rejected. Share links only exist for approved items (the public read-gates would 404 otherwise).
 *
 * C2 (§17 17→9): the table absorbed the per-service actions that used to live only on
 * /expert/services (the C1-found gap that kept "My Offerings" in the sidebar):
 *   - Edit    → /expert/services/:id/edit (the real ServiceForm edit route; the old
 *               editHref was the bare page link "/expert/services" — a dead affordance)
 *   - Pause / Activate → PATCH /api/expert/services/:id/status  (lifted from services.tsx)
 *   - Duplicate        → POST  /api/expert/services/:id/duplicate (lifted from services.tsx)
 * Ready Made rows open their SOURCE BUILD in the Workstation (/expert/workspace/:sourceTripId
 * — listing editing lives on the build's Distribute panel, per the C1 Store Listings record).
 * It also absorbed Share & Promote's per-offering creation half: the Share menu offers the
 * tracked short link plus the full share kit (feed/story images + caption) via the moved
 * share-tools components — identical server calls (§16-safe).
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LayoutList, Share2, Pencil, Copy, Pause, Play, Link2, Image as ImageIcon, Hammer } from "lucide-react";
import { OfferingShareDetail, OfferingShareOption } from "@/components/backoffice/share-tools";

type Lane = "service" | "template" | "ready_made";

interface OfferingRow {
  id: string;
  lane: Lane;
  laneLabel: string;
  name: string;
  city: string | null;
  price: string | null;
  approval: string; // normalized: approved | submitted | draft | rejected | unknown
  /** service lane only: the provider_services active/paused/draft visibility status. */
  serviceStatus: string | null;
  editHref: string | null;
  editLabel: string;
  publicHref: string | null; // only when approved (+published where applicable)
  nextAvailability: string | null; // ISO date, service lane only; null = no slots / not applicable
}

function formatNextAvailability(dateStr: string | null): string {
  if (!dateStr) return "No slots scheduled";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "No slots scheduled";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  submitted: "Pending Review",
  draft: "Draft",
  rejected: "Rejected",
};
const STATUS_CLASS: Record<string, string> = {
  approved: "bg-green-100 text-green-800 border-green-200",
  submitted: "bg-amber-100 text-amber-800 border-amber-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

export function MyOfferingsTable() {
  const { toast } = useToast();
  const [shareTarget, setShareTarget] = useState<OfferingRow | null>(null);

  const services = useQuery<any[]>({ queryKey: ["/api/expert/services"] });
  const templates = useQuery<any[]>({ queryKey: ["/api/expert/templates"] });
  // /mine returns { listings: [...] } (ready-made.routes.ts), NOT a bare array — audit
  // finding: the old Array.isArray guard silently emptied this lane forever.
  const readyMade = useQuery<{ listings: any[] }>({ queryKey: ["/api/expert/ready-made/mine"] });
  // Backoffice C1: soonest future, not-fully-booked vendor_availability_slots row per
  // service id (service lane only — templates/Ready Made Trips have no slots).
  const nextAvailability = useQuery<Record<string, string>>({ queryKey: ["/api/me/next-availability"] });

  // C2: pause/activate + duplicate — the SAME endpoints/invalidations services.tsx used
  // (PATCH /api/expert/services/:id/status; POST /api/expert/services/:id/duplicate).
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/expert/services/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/analytics"] });
      toast({ title: "Service status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/expert/services/${id}/duplicate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      toast({ title: "Service duplicated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate service", variant: "destructive" });
    },
  });

  const isLoading = services.isLoading || templates.isLoading || readyMade.isLoading;

  const rows: OfferingRow[] = [
    ...(Array.isArray(services.data) ? services.data : []).map((s: any): OfferingRow => {
      const approval = s.approvalStatus ?? "unknown";
      return {
        id: s.id,
        lane: "service",
        laneLabel: "Service",
        name: s.serviceName ?? s.title ?? "Untitled service",
        city: s.city ?? null,
        price: s.price != null ? `$${Number(s.price).toFixed(0)}` : null,
        approval,
        serviceStatus: s.status ?? null,
        // C2: the real per-service ServiceForm edit route (was the dead page link
        // "/expert/services" — now itself a redirect to Catalog).
        editHref: `/expert/services/${s.id}/edit`,
        editLabel: "Edit",
        publicHref: approval === "approved" ? `/services/${s.id}` : null,
        nextAvailability: nextAvailability.data?.[s.id] ?? null,
      };
    }),
    ...(Array.isArray(templates.data) ? templates.data : []).map((t: any): OfferingRow => {
      const approval = t.approvalStatus ?? "unknown";
      return {
        id: t.id,
        lane: "template",
        laneLabel: "Itinerary Template",
        name: t.title ?? "Untitled template",
        city: null,
        price: t.price != null ? `$${Number(t.price).toFixed(0)}` : null,
        approval,
        serviceStatus: null,
        // Seller surface retired (§10/§17 sunset) — existing templates stay readable/sellable
        // but have no edit page; new store trips are built in the Workstation.
        editHref: null,
        editLabel: "Edit",
        publicHref: approval === "approved" && t.isPublished ? `/expert-templates/${t.id}` : null,
        nextAvailability: null,
      };
    }),
    ...(readyMade.data?.listings ?? []).map((r: any): OfferingRow => {
      const approval = r.status ?? "unknown";
      return {
        id: r.id,
        lane: "ready_made",
        laneLabel: "Ready Made Trip",
        name: r.title ?? "Untitled trip",
        city: null,
        price: r.priceCents != null ? `$${(r.priceCents / 100).toFixed(0)}` : null,
        nextAvailability: null,
        approval,
        serviceStatus: null,
        // C2: open the SOURCE BUILD in the Workstation (listing editing lives on the build's
        // Distribute panel). The old "/expert/ready-made" href now redirects back to Catalog —
        // a loop, not an edit path.
        editHref: r.sourceTripId ? `/expert/workspace/${r.sourceTripId}` : null,
        editLabel: "Open build",
        publicHref: approval === "approved" ? `/ready-made/${r.id}` : null,
      };
    }),
  ];

  async function copyShareLink(row: OfferingRow) {
    if (!row.publicHref) return;
    const fallbackUrl = `${window.location.origin}${row.publicHref}`;
    try {
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetType: row.lane, targetId: row.id }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json() as { url: string };
      const shortUrl = `${window.location.origin}${data.url}`;
      navigator.clipboard.writeText(shortUrl);
      toast({ title: "Link copied", description: shortUrl });
    } catch {
      // Graceful fallback to the existing full public URL on any error.
      navigator.clipboard.writeText(fallbackUrl);
      toast({ title: "Link copied", description: fallbackUrl });
    }
  }

  const shareOffering: OfferingShareOption | null = shareTarget && shareTarget.publicHref
    ? {
        id: shareTarget.id,
        lane: shareTarget.lane,
        laneLabel: shareTarget.laneLabel,
        name: shareTarget.name,
        city: shareTarget.city,
        price: shareTarget.price,
        publicHref: shareTarget.publicHref,
      }
    : null;

  return (
    <Card data-testid="card-my-offerings">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutList className="w-4 h-4 text-primary" />
          My Offerings
          {!isLoading && (
            <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-offerings">
            No offerings yet — create a service, itinerary template, or Ready Made Trip to start selling.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-semibold">Offering</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Price</th>
                  <th className="py-2 pr-3 font-semibold">Next availability</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.lane}-${row.id}`} className="border-b last:border-0" data-testid={`offering-row-${row.lane}-${row.id}`}>
                    <td className="py-2.5 pr-3 font-medium">{row.name}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{row.laneLabel}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className={`text-xs border ${STATUS_CLASS[row.approval] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {STATUS_LABEL[row.approval] ?? row.approval}
                        </Badge>
                        {row.lane === "service" && row.serviceStatus === "paused" && (
                          <Badge className="text-xs border bg-yellow-100 text-yellow-800 border-yellow-200">
                            Paused
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">{row.price ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground" data-testid={`next-availability-${row.lane}-${row.id}`}>
                      {row.lane === "service" ? formatNextAvailability(row.nextAvailability) : "—"}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        {row.editHref && (
                          <Link href={row.editHref}>
                            <Button size="sm" variant="ghost" data-testid={`button-edit-${row.lane}-${row.id}`}>
                              {row.lane === "ready_made" ? (
                                <Hammer className="w-3.5 h-3.5 mr-1" />
                              ) : (
                                <Pencil className="w-3.5 h-3.5 mr-1" />
                              )}
                              {row.editLabel}
                            </Button>
                          </Link>
                        )}
                        {row.lane === "service" && row.serviceStatus && row.serviceStatus !== "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={toggleStatusMutation.isPending}
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                id: row.id,
                                status: row.serviceStatus === "active" ? "paused" : "active",
                              })
                            }
                            data-testid={`button-toggle-status-${row.lane}-${row.id}`}
                          >
                            {row.serviceStatus === "active" ? (
                              <>
                                <Pause className="w-3.5 h-3.5 mr-1" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 mr-1" />
                                Activate
                              </>
                            )}
                          </Button>
                        )}
                        {row.lane === "service" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={duplicateMutation.isPending}
                            onClick={() => duplicateMutation.mutate(row.id)}
                            data-testid={`button-duplicate-${row.lane}-${row.id}`}
                          >
                            <Copy className="w-3.5 h-3.5 mr-1" />
                            Duplicate
                          </Button>
                        )}
                        {row.publicHref && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" data-testid={`button-share-${row.lane}-${row.id}`}>
                                <Share2 className="w-3.5 h-3.5 mr-1" />
                                Share
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => copyShareLink(row)}
                                data-testid={`menu-copy-link-${row.lane}-${row.id}`}
                              >
                                <Link2 className="w-4 h-4 mr-2" /> Copy link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setShareTarget(row)}
                                data-testid={`menu-share-kit-${row.lane}-${row.id}`}
                              >
                                <ImageIcon className="w-4 h-4 mr-2" /> Share images &amp; caption…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* C2: the per-offering share kit (feed/story images + caption + §16 actions), reusing
            the moved share-tools components — images only for approved+ACTIVE services, the
            same gate share-images.routes.ts enforces (a paused service's image 404s). */}
        <Dialog open={!!shareOffering} onOpenChange={(open) => !open && setShareTarget(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-share-kit">
            <DialogHeader>
              <DialogTitle>{shareOffering?.name ?? "Share"}</DialogTitle>
            </DialogHeader>
            {shareOffering && (
              <OfferingShareDetail
                offering={shareOffering}
                showImages={
                  shareOffering.lane === "service" && shareTarget?.serviceStatus === "active"
                }
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
