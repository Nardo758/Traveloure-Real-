import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Sparkles, Crown, UserCheck, Loader2, RotateCcw, AlertTriangle } from "lucide-react";
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

interface ConciergeRequest {
  id: string;
  intent: string;
  event_type: string | null;
  chosen_tier: "expert" | "full" | string | null;
  status: string;
  created_at: string | null;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  // Linked coordination engagement (Full tier) — Phase 1a/1c.
  coordination_id: string | null;
  coordination_status: string | null;
  fee_payment_status: string | null;
  revenue_reversal_missing: boolean | null;
  assigned_expert_id: string | null;
  coordinator_first_name: string | null;
  coordinator_last_name: string | null;
  coordinator_email: string | null;
}

interface Coordinator {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
}

function tierBadge(tier: string | null) {
  if (tier === "full") {
    return (
      <Badge className="bg-purple-100 text-purple-700 border-purple-200">
        <Crown className="w-3 h-3 mr-1" /> Full / Done-for-You
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
      <UserCheck className="w-3 h-3 mr-1" /> Expert
    </Badge>
  );
}

function requesterName(r: ConciergeRequest) {
  const full = `${r.user_first_name || ""} ${r.user_last_name || ""}`.trim();
  return full || r.user_email || "Guest";
}

function coordinatorLabel(c: Coordinator) {
  const full = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  return full ? `${full}${c.email ? ` · ${c.email}` : ""}` : c.email || c.id;
}

function feeBadge(status: string | null) {
  if (status === "paid") return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Fee paid</Badge>;
  if (status === "pending") return <Badge variant="outline">Payment in progress</Badge>;
  if (status === "refunded") return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Fee refunded</Badge>;
  return <Badge variant="outline">Fee due</Badge>;
}

function RefundFeeButton({ request }: { request: ConciergeRequest }) {
  const { toast } = useToast();

  const refund = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coordination-states/${request.coordination_id}/refund`, {});
      return res.json() as Promise<{ success?: boolean; alreadyRefunded?: boolean; feePaymentStatus?: string }>;
    },
    onSuccess: (data) => {
      if (data?.alreadyRefunded) {
        toast({ title: "Already refunded", description: "This coordination fee was already refunded." });
      } else {
        toast({ title: "Fee refunded", description: "The coordination fee has been reversed and the credit restored." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/concierge-requests"] });
    },
    onError: (err: any) => {
      toast({ title: "Refund failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          disabled={refund.isPending}
          data-testid={`button-refund-fee-${request.coordination_id}`}
        >
          {refund.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
          Refund fee
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Refund coordination fee?</AlertDialogTitle>
          <AlertDialogDescription>
            This will issue a full Stripe refund, release the consumed credit, and reverse the
            platform revenue entry. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => refund.mutate()}
            data-testid={`button-confirm-refund-${request.coordination_id}`}
          >
            Yes, refund
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CoordinatorAssign({ request, coordinators }: { request: ConciergeRequest; coordinators: Coordinator[] }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>(request.assigned_expert_id || "");

  const assign = useMutation({
    mutationFn: (expertId: string) =>
      apiRequest("POST", `/api/admin/coordination-states/${request.coordination_id}/assign-coordinator`, { expertId }),
    onSuccess: () => {
      toast({ title: "Coordinator assigned", description: "The expert will see this engagement in their workspace." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/concierge-requests"] });
    },
    onError: (err: any) => {
      toast({ title: "Assignment failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  const assignedName = `${request.coordinator_first_name || ""} ${request.coordinator_last_name || ""}`.trim()
    || request.coordinator_email;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2" data-testid={`coordination-panel-${request.id}`}>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-medium text-foreground">Engagement</span>
        <Badge variant="secondary" className="capitalize">{request.coordination_status || "intake"}</Badge>
        {feeBadge(request.fee_payment_status)}
        {assignedName ? (
          <span className="text-muted-foreground">Coordinator: <span className="text-foreground">{assignedName}</span></span>
        ) : (
          <span className="text-muted-foreground">No coordinator assigned</span>
        )}
      </div>
      {request.revenue_reversal_missing && (
        <div
          className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
          data-testid={`alert-revenue-reversal-missing-${request.coordination_id}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>
            <strong>Ledger gap:</strong> Fee was refunded but no platform revenue row was found to reverse. Manual review required.
          </span>
        </div>
      )}
      {request.fee_payment_status === "paid" && (
        <div className="flex items-center">
          <RefundFeeButton request={request} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-9 max-w-xs" data-testid={`select-coordinator-${request.id}`}>
            <SelectValue placeholder="Select a coordinator" />
          </SelectTrigger>
          <SelectContent>
            {coordinators.map((c) => (
              <SelectItem key={c.id} value={c.id}>{coordinatorLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!selected || selected === request.assigned_expert_id || assign.isPending}
          onClick={() => assign.mutate(selected)}
          data-testid={`button-assign-coordinator-${request.id}`}
        >
          {assign.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          {request.assigned_expert_id ? "Reassign" : "Assign"}
        </Button>
      </div>
    </div>
  );
}

export default function AdminConciergeRequests() {
  const { data, isLoading } = useQuery<{ requests: ConciergeRequest[]; count: number }>({
    queryKey: ["/api/admin/concierge-requests"],
  });
  const { data: coordinatorData } = useQuery<{ coordinators: Coordinator[] }>({
    queryKey: ["/api/admin/coordinators"],
  });

  const requests = data?.requests ?? [];
  const coordinators = coordinatorData?.coordinators ?? [];

  return (
    <AdminLayout title="Concierge Requests">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Concierge Requests
          </h1>
          <p className="text-muted-foreground mt-1">
            Human-fulfillment concierge leads (Expert &amp; Full / Done-for-You tiers). Full-tier
            requests spin up a coordination engagement — assign an expert coordinator to it below.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Incoming requests ({requests.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </>
            ) : requests.length > 0 ? (
              requests.map((r) => (
                <div
                  key={r.id}
                  className="p-4 border rounded-lg"
                  data-testid={`card-concierge-request-${r.id}`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tierBadge(r.chosen_tier)}
                        <Badge variant="outline">{r.status}</Badge>
                        {r.event_type && (
                          <span className="text-sm text-muted-foreground">{r.event_type}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm">{r.intent}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {requesterName(r)}
                        {r.user_email ? ` · ${r.user_email}` : ""}
                      </p>
                      {r.coordination_id && (
                        <CoordinatorAssign request={r} coordinators={coordinators} />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <Sparkles className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No concierge requests yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
