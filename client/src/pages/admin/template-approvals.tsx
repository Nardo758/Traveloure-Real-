import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/admin-layout";
import { AdminTabNav } from "@/components/admin/AdminTabNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { READY_MADE_BADGE_VALUES } from "@shared/ready-made-badges";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle } from "lucide-react";

/** A live (approved + active) store listing, as returned by the public feed. */
interface LiveReadyMade {
  id: string;
  title: string;
  market: string;
  authorName: string;
  badge: string | null;
}

interface PendingReadyMade {
  id: string;
  title: string;
  plan_type: string | null;
  market: string;
  duration_days: number;
  best_season: string | null;
  pricing_mode: string;
  price_cents: number | null;
  hero_image_url: string | null;
  submitted_at: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  author_role: string | null;
  item_count: number;
  days_with_items: number;
}

// Admin approval + curation surface for the Ready Made Trips store lane.
// The expert-template half of this queue RETIRED with that product
// (ledger 2026-09-03-expert-templates-consumer-sunset); `ready_made_trips` is the single
// surviving store lane, so this page now has one approval queue, not two.
export default function TemplateApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Ready-made STORE LISTINGS (cloneable trips).
  const [rmReasons, setRmReasons] = useState<Record<string, string>>({});
  const { data: rmPendingData, isLoading: rmLoading } = useQuery<{ pending: PendingReadyMade[] }>({
    queryKey: ["/api/admin/ready-made/pending"],
  });
  const rmPending = rmPendingData?.pending ?? [];
  const rmInvalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ready-made/pending"] });

  const rmApproveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/ready-made/${id}/approve`, {}),
    onSuccess: () => { toast({ title: "Store listing approved" }); rmInvalidate(); },
    onError: (e: any) => toast({ title: "Approve failed", description: e.message, variant: "destructive" }),
  });
  const rmRejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/admin/ready-made/${id}/reject`, { reason }),
    onSuccess: () => { toast({ title: "Store listing rejected" }); rmInvalidate(); },
    onError: (e: any) => toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
  });

  // ── CURATION (MP-3): editorial badges on the APPROVED store shelf.
  // Reuses the PUBLIC feed as its list — /api/ready-made already returns exactly the
  // approved+active listings a curator acts on (with their current badge), so this adds
  // no second backend for the same set. The approval queue above is a different set
  // (submitted), which is why curation needs its own section rather than a column there.
  const { data: rmLiveData } = useQuery<{ listings: LiveReadyMade[] }>({
    queryKey: ["/api/ready-made"],
  });
  const rmLive = rmLiveData?.listings ?? [];
  const rmBadgeMutation = useMutation({
    mutationFn: ({ id, badge }: { id: string; badge: string | null }) =>
      apiRequest("PATCH", `/api/admin/ready-made/${id}/badge`, { badge }),
    onSuccess: () => {
      toast({ title: "Badge updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/ready-made"] });
    },
    onError: (e: any) => toast({ title: "Badge update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <AdminTabNav tabs={[{ label: "Catalog", href: "/admin/expert-templates" }, { label: "Approvals", href: "/admin/template-approvals" }]} />
        <div>
          <h1 className="text-2xl font-semibold">Store Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Ready Made Trips awaiting review, and editorial badges on the live shelf.
          </p>
        </div>

        {/* ── Store listings (cloneable ready-made trips) — the workstation→store pipeline ── */}
        <div className="pt-4">
          <h2 className="text-xl font-semibold">Store Listings</h2>
          <p className="text-sm text-muted-foreground">
            Cloneable trips built in the expert Workstation. Approval snapshots the "what's inside"
            counts and puts the listing on the Ready Made Trips shelf feed.
          </p>
        </div>

        {rmLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rmPending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No store listings awaiting review.
            </CardContent>
          </Card>
        ) : (
          rmPending.map((l) => (
            <Card key={l.id} data-testid={`pending-ready-made-${l.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {l.hero_image_url && (
                    <img src={l.hero_image_url} alt="" className="w-20 h-14 object-cover rounded-md flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <CardTitle className="truncate">{l.title}</CardTitle>
                    <div className="text-sm text-muted-foreground truncate">
                      {l.plan_type ?? "No plan type"} · {l.market} · {l.duration_days} days ·{" "}
                      {[l.author_first_name, l.author_last_name].filter(Boolean).join(" ") || "Expert"}{" "}
                      ({l.author_role === "local_expert" ? "Local Expert" : "Advisor"})
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Build: {l.item_count} items across {l.days_with_items} days
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">
                  {l.price_cents === null ? "No price" : `$${(l.price_cents / 100).toFixed(2)}${l.pricing_mode === "per_traveler" ? " /traveler" : ""}`}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Rejection reason (required to reject)"
                  value={rmReasons[l.id] ?? ""}
                  onChange={(e) => setRmReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                  data-testid={`rm-reject-reason-${l.id}`}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => rmApproveMutation.mutate(l.id)}
                    disabled={rmApproveMutation.isPending}
                    data-testid={`button-rm-approve-${l.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => rmRejectMutation.mutate({ id: l.id, reason: rmReasons[l.id] ?? "" })}
                    disabled={rmRejectMutation.isPending || !(rmReasons[l.id] ?? "").trim()}
                    data-testid={`button-rm-reject-${l.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {/* ── Store curation: editorial badges on the live shelf ─────────────────
            These badges are the platform's OWN editorial voice, from a closed
            vocabulary (shared/ready-made-badges.ts). There is deliberately no
            "Most popular"/"Best selling" option: the lane has no sales or rating
            aggregate behind such a claim, and a ranking label with nothing behind
            it is the §13 fabricated-claim class. Badged listings lead the store
            shelf; everything else falls back to most-recently-approved. */}
        <div className="pt-4">
          <h2 className="text-xl font-semibold">Store curation</h2>
          <p className="text-sm text-muted-foreground">
            Editorial badges on live Ready Made Trips. Badged listings lead the store shelf.
          </p>
        </div>
        {rmLive.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="rm-curation-empty">
            No live store listings yet.
          </p>
        ) : (
          rmLive.map((l) => (
            <Card key={l.id} data-testid={`rm-curation-${l.id}`}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.title}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {l.market} · by {l.authorName}
                    {l.badge && <> · currently <span className="font-medium">{l.badge}</span></>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {READY_MADE_BADGE_VALUES.map((b) => (
                    <Button
                      key={b}
                      size="sm"
                      variant={l.badge === b ? "default" : "outline"}
                      onClick={() => rmBadgeMutation.mutate({ id: l.id, badge: b })}
                      disabled={rmBadgeMutation.isPending}
                      data-testid={`rm-badge-${b.replace(/\s+/g, "-").toLowerCase()}-${l.id}`}
                    >
                      {b}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => rmBadgeMutation.mutate({ id: l.id, badge: null })}
                    disabled={rmBadgeMutation.isPending || !l.badge}
                    data-testid={`rm-badge-clear-${l.id}`}
                  >
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
