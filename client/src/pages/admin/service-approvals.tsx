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
import { CheckCircle2, XCircle, Clock } from "lucide-react";

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
                {s.price != null && <Badge variant="secondary">${s.price}</Badge>}
              </CardHeader>
              <CardContent className="space-y-3">
                {s.description && <p className="text-sm whitespace-pre-wrap">{s.description}</p>}
                <Textarea
                  placeholder="Rejection reason (required to reject)"
                  value={reasons[s.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [s.id]: e.target.value }))}
                  data-testid={`reject-reason-${s.id}`}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => approveMutation.mutate(s.id)}
                    disabled={approveMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid={`button-approve-${s.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                  </Button>
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
