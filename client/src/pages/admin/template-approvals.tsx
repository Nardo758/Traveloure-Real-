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
      </div>
    </AdminLayout>
  );
}
