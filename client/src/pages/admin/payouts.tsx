import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Loader2,
  UserCheck,
  Building2,
  Banknote,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PayoutRequest {
  id: string;
  expertId?: string;
  providerId?: string;
  amount: string;
  currency: string | null;
  payoutMethod: string | null;
  status: string | null;
  requestedAt: string | null;
  processedAt: string | null;
  completedAt?: string | null;
  failureReason?: string | null;
  notes?: string | null;
  transactionId?: string | null;
  payoutReference?: string | null;
  requesterType: "expert" | "provider";
  requesterName: string | null;
  requesterEmail: string | null;
}

function formatCurrency(amount: string | number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(typeof amount === "string" ? parseFloat(amount) : amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case "approved":
    case "processing":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200" data-testid={`badge-status-${status}`}><Loader2 className="w-3 h-3 mr-1" />Processing</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800 border-green-200" data-testid={`badge-status-${status}`}><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
    case "failed":
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 border-red-200" data-testid={`badge-status-${status}`}><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge variant="outline" data-testid={`badge-status-unknown`}>{status || "Unknown"}</Badge>;
  }
}

function getMethodLabel(method: string | null): string {
  const labels: Record<string, string> = {
    bank_transfer: "Bank Transfer",
    paypal: "PayPal",
    stripe: "Stripe",
  };
  return labels[method || ""] || method || "Not specified";
}

export default function AdminPayouts() {
  const [activeTab, setActiveTab] = useState("all");
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    payout: PayoutRequest | null;
    action: "approve" | "reject" | "execute";
  }>({ open: false, payout: null, action: "approve" });
  const [actionNotes, setActionNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const statusFilter = activeTab === "all" ? undefined : activeTab;

  const { data: payouts = [], isLoading } = useQuery<PayoutRequest[]>({
    queryKey: ["/api/admin/payouts", statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/api/admin/payouts?status=${statusFilter}`
        : "/api/admin/payouts";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payouts");
      return res.json();
    },
  });

  const updatePayoutMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
      requesterType,
    }: {
      id: string;
      status: string;
      notes?: string;
      requesterType: string;
    }) => {
      return apiRequest("PATCH", `/api/admin/payouts/${id}`, {
        status,
        notes,
        requesterType,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      const actionLabels: Record<string, string> = {
        processing: "approved",
        completed: "executed",
        failed: "rejected",
      };
      toast({
        title: `Payout ${actionLabels[variables.status] || variables.status}`,
        description: `The payout request has been ${actionLabels[variables.status] || "updated"}.`,
      });
      setActionDialog({ open: false, payout: null, action: "approve" });
      setActionNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Action failed",
        description: error.message || "Failed to update payout status.",
        variant: "destructive",
      });
    },
  });

  const handleAction = (
    payout: PayoutRequest,
    action: "approve" | "reject" | "execute"
  ) => {
    setActionDialog({ open: true, payout, action });
    setActionNotes("");
  };

  const confirmAction = () => {
    if (!actionDialog.payout) return;
    const statusMap = { approve: "processing", reject: "failed", execute: "completed" };
    updatePayoutMutation.mutate({
      id: actionDialog.payout.id,
      status: statusMap[actionDialog.action],
      notes: actionNotes || undefined,
      requesterType: actionDialog.payout.requesterType,
    });
  };

  const pendingCount = payouts.filter((p) => p.status === "pending").length;
  const processingCount = payouts.filter(
    (p) => p.status === "processing" || p.status === "approved"
  ).length;
  const completedCount = payouts.filter((p) => p.status === "completed").length;
  const totalPending = payouts
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

  const filteredPayouts =
    activeTab === "all"
      ? payouts
      : payouts.filter((p) => {
          if (activeTab === "processing") return p.status === "processing" || p.status === "approved";
          return p.status === activeTab;
        });

  return (
    <AdminLayout title="Payouts Management">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-pending-count">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Requests</p>
                  <p className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">{pendingCount}</p>
                </div>
                <div className="h-10 w-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-amount">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Amount</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-pending-amount">{formatCurrency(totalPending)}</p>
                </div>
                <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-processing-count">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Processing</p>
                  <p className="text-2xl font-bold text-blue-600" data-testid="text-processing-count">{processingCount}</p>
                </div>
                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-count">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Completed</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-completed-count">{completedCount}</p>
                </div>
                <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Payout Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList data-testid="tabs-status-filter">
                <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                <TabsTrigger value="pending" data-testid="tab-pending">
                  Pending {pendingCount > 0 && `(${pendingCount})`}
                </TabsTrigger>
                <TabsTrigger value="processing" data-testid="tab-processing">Processing</TabsTrigger>
                <TabsTrigger value="completed" data-testid="tab-completed">Completed</TabsTrigger>
                <TabsTrigger value="failed" data-testid="tab-rejected">Rejected</TabsTrigger>
              </TabsList>

              <div className="mt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12" data-testid="loading-payouts">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : filteredPayouts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500" data-testid="empty-payouts">
                    <Banknote className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No payout requests found.</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Requester</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPayouts.map((payout) => (
                          <TableRow key={`${payout.requesterType}-${payout.id}`} data-testid={`row-payout-${payout.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-gray-900" data-testid={`text-name-${payout.id}`}>
                                  {payout.requesterName || "Unknown"}
                                </p>
                                <p className="text-sm text-gray-500">{payout.requesterEmail}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  payout.requesterType === "expert"
                                    ? "border-purple-200 text-purple-700 bg-purple-50"
                                    : "border-blue-200 text-blue-700 bg-blue-50"
                                }
                                data-testid={`badge-type-${payout.id}`}
                              >
                                {payout.requesterType === "expert" ? (
                                  <UserCheck className="w-3 h-3 mr-1" />
                                ) : (
                                  <Building2 className="w-3 h-3 mr-1" />
                                )}
                                {payout.requesterType === "expert" ? "Expert" : "Provider"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="font-semibold text-gray-900" data-testid={`text-amount-${payout.id}`}>
                                {formatCurrency(payout.amount)}
                              </span>
                            </TableCell>
                            <TableCell data-testid={`text-method-${payout.id}`}>
                              {getMethodLabel(payout.payoutMethod)}
                            </TableCell>
                            <TableCell data-testid={`text-date-${payout.id}`}>
                              {formatDate(payout.requestedAt)}
                            </TableCell>
                            <TableCell>{getStatusBadge(payout.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {payout.status === "pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600 border-green-200 hover:bg-green-50"
                                      onClick={() => handleAction(payout, "approve")}
                                      data-testid={`button-approve-${payout.id}`}
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => handleAction(payout, "reject")}
                                      data-testid={`button-reject-${payout.id}`}
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {(payout.status === "processing" || payout.status === "approved") && (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleAction(payout, "execute")}
                                    data-testid={`button-execute-${payout.id}`}
                                  >
                                    <Send className="w-4 h-4 mr-1" />
                                    Execute Payout
                                  </Button>
                                )}
                                {payout.status === "completed" && (
                                  <span className="text-sm text-gray-500">
                                    {payout.transactionId || payout.payoutReference || "Completed"}
                                  </span>
                                )}
                                {payout.status === "failed" && (
                                  <span className="text-sm text-red-500">
                                    {payout.failureReason || payout.notes || "Rejected"}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={actionDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog({ open: false, payout: null, action: "approve" });
            setActionNotes("");
          }
        }}
      >
        <DialogContent data-testid="dialog-payout-action">
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "approve" && "Approve Payout Request"}
              {actionDialog.action === "reject" && "Reject Payout Request"}
              {actionDialog.action === "execute" && "Execute Payout"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === "approve" &&
                "This will mark the payout as approved and ready for execution."}
              {actionDialog.action === "reject" &&
                "This will reject the payout request. Please provide a reason."}
              {actionDialog.action === "execute" &&
                "This will mark the payout as completed. Confirm that funds have been transferred."}
            </DialogDescription>
          </DialogHeader>

          {actionDialog.payout && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Requester</span>
                  <span className="text-sm font-medium" data-testid="text-dialog-requester">
                    {actionDialog.payout.requesterName || "Unknown"} ({actionDialog.payout.requesterType})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Amount</span>
                  <span className="text-sm font-bold" data-testid="text-dialog-amount">
                    {formatCurrency(actionDialog.payout.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Method</span>
                  <span className="text-sm" data-testid="text-dialog-method">
                    {getMethodLabel(actionDialog.payout.payoutMethod)}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  {actionDialog.action === "reject" ? "Rejection Reason" : "Notes (optional)"}
                </label>
                <Textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder={
                    actionDialog.action === "reject"
                      ? "Enter the reason for rejection..."
                      : "Add any notes about this payout..."
                  }
                  rows={3}
                  data-testid="input-action-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialog({ open: false, payout: null, action: "approve" })}
              data-testid="button-cancel-action"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAction}
              disabled={updatePayoutMutation.isPending || (actionDialog.action === "reject" && !actionNotes.trim())}
              className={
                actionDialog.action === "reject"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              }
              data-testid="button-confirm-action"
            >
              {updatePayoutMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {actionDialog.action === "approve" && "Approve"}
              {actionDialog.action === "reject" && "Reject"}
              {actionDialog.action === "execute" && "Confirm Execution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
