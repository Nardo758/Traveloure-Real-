import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/admin-layout";
import { AdminTabNav } from "@/components/admin/AdminTabNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle } from "lucide-react";

interface PendingTemplate {
  id: string;
  title: string;
  description: string | null;
  destination: string | null;
  price: string | null;
  currency: string | null;
  category: string | null;
  submittedAt: string | null;
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

// Admin approval queue for expert-template marketplace listings (shared queue = Phase 4's
// queue). A template is purchasable only after an admin approves it here (approval is the gate
// the expert cannot self-satisfy). Reject requires a reason.
export default function TemplateApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { data: pending = [], isLoading } = useQuery<PendingTemplate[]>({
    queryKey: ["/api/admin/expert-templates/pending"],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/admin/expert-templates/pending"] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/expert-templates/${id}/approve`, {}),
    onSuccess: () => { toast({ title: "Template approved" }); invalidate(); },
    onError: (e: any) => toast({ title: "Approve failed", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/admin/expert-templates/${id}/reject`, { reason }),
    onSuccess: () => { toast({ title: "Template rejected" }); invalidate(); },
    onError: (e: any) => toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
  });

  // ── Ready-made STORE LISTINGS (cloneable trips) — same shared queue surface, second product.
  // §10: one admin approval surface, never a forked workflow; task #158.
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

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <AdminTabNav tabs={[{ label: "Catalog", href: "/admin/expert-templates" }, { label: "Approvals", href: "/admin/template-approvals" }]} />
        <div>
          <h1 className="text-2xl font-semibold">Template Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Expert marketplace packages awaiting review. A package is not purchasable until approved.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : pending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No templates awaiting review.
            </CardContent>
          </Card>
        ) : (
          pending.map((t) => (
            <Card key={t.id} data-testid={`pending-template-${t.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{t.title}</CardTitle>
                  <div className="text-sm text-muted-foreground truncate">{t.destination}</div>
                </div>
                <Badge variant="secondary">
                  {t.currency ?? "USD"} {t.price}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.description && <p className="text-sm">{t.description}</p>}
                <Textarea
                  placeholder="Rejection reason (required to reject)"
                  value={reasons[t.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [t.id]: e.target.value }))}
                  data-testid={`reject-reason-${t.id}`}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => approveMutation.mutate(t.id)}
                    disabled={approveMutation.isPending}
                    data-testid={`button-approve-${t.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => rejectMutation.mutate({ id: t.id, reason: reasons[t.id] ?? "" })}
                    disabled={rejectMutation.isPending || !(reasons[t.id] ?? "").trim()}
                    data-testid={`button-reject-${t.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}

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
      </div>
    </AdminLayout>
  );
}
