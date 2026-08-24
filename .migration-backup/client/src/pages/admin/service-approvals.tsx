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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Clock, History } from "lucide-react";

/**
 * Provenance spine move 5 (ledger 2026-08-23-provenance-audit-read): the per-listing audit timeline.
 * Lazy-reads GET /api/admin/audit-logs?resourceType=provider_service&resourceId=<id> — the
 * approve/reject/edit-review rows the platform already writes, now readable. Collapsed by default;
 * fetches only when opened. §13: an empty history says so plainly (a fresh submission has none yet).
 */
function AuditHistory({ serviceId }: { serviceId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<{ logs: any[]; total: number }>({
    queryKey: [`/api/admin/audit-logs?resourceType=provider_service&resourceId=${serviceId}`],
    enabled: open,
    staleTime: 60_000,
  });
  const logs = data?.logs ?? [];
  return (
    <div className="text-sm" data-testid={`audit-history-${serviceId}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        data-testid={`button-audit-history-${serviceId}`}
      >
        <History className="w-3.5 h-3.5" />
        {open ? "Hide review history" : "Review history"}
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border p-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recorded actions yet — this listing hasn't been reviewed or edited.</p>
          ) : (
            <ul className="space-y-1.5">
              {logs.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span>
                    <span className="font-medium text-foreground">{String(l.action).replace(/_/g, " ")}</span>
                    {(l.actor_first_name || l.actor_email) && (
                      <span className="text-muted-foreground"> · by {l.actor_first_name ? `${l.actor_first_name} ${l.actor_last_name ?? ""}`.trim() : l.actor_email}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {l.created_at ? new Date(l.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface PendingService {
  id: string;
  title: string;
  description: string | null;
  price: string | null;
  duration: string | null;
  submittedAt: string | null;
  expertId: string | null;
}

// Admin approval queue for provider/expert SERVICE listings (provider_services born-submitted,
// F2/D1a). A listing is hidden from every public/bookable surface until an admin approves it here
// (approval_status submitted -> approved; the storage layer also flips operational status active).
// This is the ONLY path from "submitted" to "live" — the endpoints existed but had no admin UI.
export default function ServiceApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { data: pending = [], isLoading } = useQuery<PendingService[]>({
    queryKey: ["/api/admin/provider-services/pending"],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-services/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/services/summary"] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/provider-services/${id}/approve`, {}),
    onSuccess: () => { toast({ title: "Service approved", description: "It's now live and bookable." }); invalidate(); },
    onError: (e: any) => toast({ title: "Approve failed", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/admin/provider-services/${id}/reject`, { reason }),
    onSuccess: () => { toast({ title: "Service rejected" }); invalidate(); },
    onError: (e: any) => toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
  });

  return (
    <AdminLayout title="Service Approvals">
      <div className="space-y-6 p-6">
        <AdminTabNav tabs={[{ label: "Registry", href: "/admin/services" }, { label: "Approvals", href: "/admin/service-approvals" }]} />
        <div>
          <h1 className="text-2xl font-semibold">Service Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Provider &amp; expert service listings awaiting review. A listing stays hidden from search and
            booking until it's approved here.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : pending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No services awaiting review.
            </CardContent>
          </Card>
        ) : (
          pending.map((s) => (
            <Card key={s.id} data-testid={`pending-service-${s.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{s.title || "Untitled service"}</CardTitle>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    {s.duration && <span>{s.duration}</span>}
                    {s.submittedAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        submitted {new Date(s.submittedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(s as any).editReview && (
                    <Badge
                      className="border bg-amber-100 text-amber-800 border-amber-200"
                      data-testid={`badge-edit-review-${s.id}`}
                    >
                      Edit review — listing stays live
                    </Badge>
                  )}
                  {s.price != null && <Badge variant="secondary">${s.price}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {s.description && <p className="text-sm whitespace-pre-wrap">{s.description}</p>}
                {/* Ruling 112 Q8: an edit review shows EXACTLY what would change — approve
                    applies it to the live row; reject discards it and the approved version
                    stands untouched. */}
                {(s as any).editReview && (s as any).pendingChanges && (
                  <div
                    className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
                    data-testid={`panel-pending-changes-${s.id}`}
                  >
                    <p className="font-medium mb-1">Requested changes</p>
                    <ul className="space-y-0.5">
                      {Object.entries((s as any).pendingChanges as Record<string, unknown>).map(([k, v]) => (
                        <li key={k} className="flex gap-2">
                          <span className="text-muted-foreground">{k === "__routePoints" ? "route stops (new route)" : k}:</span>
                          <span className="truncate">
                            {k === "__routePoints" && Array.isArray(v)
                              ? `${v.length} stop${v.length === 1 ? "" : "s"}`
                              : String(v)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <AuditHistory serviceId={s.id} />
                <Textarea
                  placeholder="Rejection reason (required to reject)"
                  value={reasons[s.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [s.id]: e.target.value }))}
                  data-testid={`reject-reason-${s.id}`}
                />
                <div className="flex gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        disabled={approveMutation.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        data-testid={`button-approve-${s.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent data-testid={`dialog-approve-${s.id}`}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Approve this service?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to approve "{s.title || "this service"}"?
                          {(s as any).editReview
                            ? " The pending changes will be applied to the live listing."
                            : " It will immediately become live and bookable."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid={`button-approve-cancel-${s.id}`}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => approveMutation.mutate(s.id)}
                          data-testid={`button-approve-confirm-${s.id}`}
                        >
                          Approve
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="destructive"
                    onClick={() => rejectMutation.mutate({ id: s.id, reason: reasons[s.id] ?? "" })}
                    disabled={rejectMutation.isPending || !(reasons[s.id] ?? "").trim()}
                    data-testid={`button-reject-${s.id}`}
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
