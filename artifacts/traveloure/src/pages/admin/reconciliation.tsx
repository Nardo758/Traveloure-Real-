import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CreditCard,
  BookOpen,
  Clock,
  Loader2,
  Siren,
  ExternalLink,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Mismatch {
  type: string;
  chargeId?: string;
  bookingId?: string;
  paymentIntentId?: string;
  amount?: number;
  metadata?: Record<string, string>;
}

interface ReconciliationResult {
  mismatches: Mismatch[];
  status: "completed" | "skipped" | "failed";
  newExceptions: number;
  promoted: number;
  checkedPaymentIntents: number;
  checkedCharges: number;
  checkedRefunds: number;
  checkedCartBookings: number;
  checkedBookings: number;
  ranAt: string;
  note: string;
}

/** A persisted drift fact (reconciliation-detection lane). Append-only — a drift that persists
 *  across passes is ONE row stamped with the run that first saw it. */
interface DriftException {
  id: string;
  run_id: string;
  detected_at: string;
  rail: "cart" | "legacy";
  kind: string;
  severity: "critical" | "warning";
  booking_id: string | null;
  payment_intent_id: string | null;
  charge_id: string | null;
  expected_amount: string | null;
  actual_amount: string | null;
  currency: string | null;
  details: Record<string, unknown> | null;
}

interface ReconciliationRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  status: string;
  exceptions_detected: number;
  exceptions_new: number;
  promoted: number;
  scanned_payment_intents: number;
  scanned_cart_bookings: number;
  scanned_legacy_bookings: number;
  note: string | null;
}

/** Plain-language labels for the drift vocabulary (shared/schema.ts
 *  RECONCILIATION_EXCEPTION_KINDS). An ops surface that shows only the enum name makes the
 *  reader look up what it means, which is how a critical row gets skimmed past. */
const KIND_LABELS: Record<string, string> = {
  pi_succeeded_no_booking: "Payment succeeded — NO booking exists",
  pi_succeeded_claim_provisional: "Payment succeeded — booking still an unpromoted claim",
  pi_succeeded_booking_voided: "Payment succeeded — booking is voided/terminal",
  booking_confirmed_no_pi: "Booking says paid — no PaymentIntent at all",
  booking_confirmed_pi_not_succeeded: "Booking says paid — PaymentIntent not succeeded",
  amount_mismatch: "Charged amount ≠ server-derived total",
  refund_not_reversed: "Stripe refund with no reversal in the database",
  payment_provenance_unverified: "PaymentIntent id the checkout never wrote — provenance unverifiable",
  stripe_charge_no_booking: "Legacy: Stripe charge — no matching booking",
  booking_no_stripe_charge: "Legacy: booking confirmed — no Stripe charge",
};

interface UnprocessedWebhook {
  id: string;
  stripe_event_id: string;
  event_type: string;
  processed: boolean;
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

interface DisputedBooking {
  id: string;
  status: string;
  dispute_id?: string | null;
  dispute_reason: string | null;
  stripe_payment_intent_id: string | null;
  total_amount: string | null;
  service_id?: string | null;
  title: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function AdminReconciliation() {
  const { toast } = useToast();
  const [lastRunResult, setLastRunResult] = useState<ReconciliationResult | null>(null);

  // Unprocessed webhooks (persistent, from DB)
  const { data: webhookData, isLoading: webhooksLoading, refetch: refetchWebhooks } = useQuery<{
    events: UnprocessedWebhook[];
    count: number;
    note: string;
  }>({
    queryKey: ["/api/admin/webhooks/unprocessed"],
  });

  // Disputed bookings (persistent, from DB)
  const { data: disputeData, isLoading: disputesLoading, refetch: refetchDisputes } = useQuery<{
    disputes: DisputedBooking[];
    count: number;
    note: string;
  }>({
    queryKey: ["/api/admin/disputes"],
  });

  // PERSISTED drift exceptions + the last recorded run (reconciliation-detection lane).
  // The `lastRun` half is load-bearing: an empty list means "clean" ONLY if a run happened.
  const {
    data: driftData,
    isLoading: driftLoading,
    refetch: refetchDrift,
  } = useQuery<{
    exceptions: DriftException[];
    count: number;
    lastRun: ReconciliationRun | null;
    note: string;
  }>({
    queryKey: ["/api/admin/reconciliation/exceptions"],
  });

  // Trigger reconciliation now
  const runNowMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/admin/reconciliation/run-now"),
    onSuccess: async (res) => {
      const data: ReconciliationResult = await res.json();
      setLastRunResult(data);
      refetchWebhooks();
      refetchDisputes();
      refetchDrift();
      toast({
        title: data.mismatches.length === 0 ? "Reconciliation clean" : "Mismatches found",
        description: data.note,
        variant: data.mismatches.length === 0 ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({ title: "Reconciliation failed", description: "Check server logs for details.", variant: "destructive" });
    },
  });

  // Reject a service-booking dispute (traveler's claim not upheld): clears the dispute flag so the
  // held earnings resume normal release and restores the booking to completed.
  const rejectMutation = useMutation({
    mutationFn: (bookingId: string) =>
      apiRequest("POST", `/api/admin/disputes/${bookingId}/reject`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      refetchDisputes();
      toast({
        title: "Dispute rejected",
        description: "Earnings resume release; booking restored to completed.",
      });
    },
    onError: () => {
      toast({ title: "Could not reject dispute", description: "Check server logs for details.", variant: "destructive" });
    },
  });

  // Uphold a dispute (traveler's claim valid — Phase 4): reverse the in-escrow earnings + platform
  // revenue and refund the traveler. Money-moving + destructive, so it's confirmed before firing.
  const upholdMutation = useMutation({
    mutationFn: (bookingId: string) =>
      apiRequest("POST", `/api/admin/disputes/${bookingId}/uphold`),
    onSuccess: async (res) => {
      const data = await res.json().catch(() => ({}));
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      refetchDisputes();
      toast({
        title: "Dispute upheld — traveler refunded",
        description: data?.skippedPaidOut > 0
          ? `Heads up: ${data.skippedPaidOut} earning(s) were already paid out and need a manual clawback.`
          : "Earnings and platform revenue reversed; refund issued.",
        variant: data?.skippedPaidOut > 0 ? "destructive" : "default",
      });
    },
    onError: () => {
      toast({ title: "Could not uphold dispute", description: "Check server logs for details.", variant: "destructive" });
    },
  });

  // Ready-Made concierge disputes (ledger 2026-08-22-concierge-p3): the buyer-concern queue.
  // Renders FACTS, not a verdict (§13): revision requested-at, the expert's workspace status,
  // suggestion count, and the earning's recoverability — the admin judges.
  const { data: rmDisputeData, isLoading: rmDisputesLoading, refetch: refetchRmDisputes } = useQuery<{
    disputes: Array<{
      id: string; purchase_status: string; dispute_status: string; dispute_reason: string | null;
      disputed_at: string | null; price_paid_cents: number; currency: string; purchased_at: string | null;
      revision_status: string | null; revision_requested_at: string | null; clone_trip_id: string | null;
      listing_id: string; listing_title: string;
      buyer_first_name: string | null; buyer_last_name: string | null;
      author_first_name: string | null; author_last_name: string | null;
      advisor_workspace_status: string | null; suggestion_count: number;
      earning_status: string | null; earning_dispute_state: string | null; earning_amount: string | null;
    }>;
  }>({ queryKey: ["/api/admin/ready-made/disputes"] });

  const rmRefundMutation = useMutation({
    mutationFn: (purchaseId: string) =>
      apiRequest("POST", `/api/admin/ready-made/disputes/${purchaseId}/refund`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/ready-made/disputes"] });
      refetchRmDisputes();
      toast({ title: "Buyer refunded", description: "Purchase refunded; the author's earning was reversed. The buyer keeps their trip." });
    },
    onError: async (err: any) => {
      const message = err?.message ?? "Check server logs for details.";
      toast({ title: "Could not refund", description: message, variant: "destructive" });
      refetchRmDisputes();
    },
  });

  const rmDismissMutation = useMutation({
    mutationFn: (purchaseId: string) =>
      apiRequest("POST", `/api/admin/ready-made/disputes/${purchaseId}/dismiss`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/ready-made/disputes"] });
      refetchRmDisputes();
      toast({ title: "Concern dismissed", description: "The author's earning resumes its release clock; the buyer was notified." });
    },
    onError: () => {
      toast({ title: "Could not dismiss", description: "Check server logs for details.", variant: "destructive" });
    },
  });

  const unprocessedCount = webhookData?.count ?? 0;
  const mismatchCount = lastRunResult?.mismatches.length ?? 0;
  const disputeCount = disputeData?.count ?? 0;
  const driftCount = driftData?.count ?? 0;
  const lastRun = driftData?.lastRun ?? null;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
              Payment Reconciliation
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Compare Stripe charges against Traveloure bookings to catch drift and missing data.
            </p>
          </div>
          <Button
            onClick={() => runNowMutation.mutate()}
            disabled={runNowMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="button-run-reconciliation"
          >
            {runNowMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Run Now
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Unprocessed Webhooks</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1" data-testid="text-unprocessed-count">
                    {webhooksLoading ? "—" : unprocessedCount}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${unprocessedCount > 0 ? "bg-red-100" : "bg-green-100"}`}>
                  {unprocessedCount > 0
                    ? <XCircle className="h-5 w-5 text-red-600" />
                    : <CheckCircle2 className="h-5 w-5 text-green-600" />}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Events stuck in webhook_events table</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Last Run Mismatches</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1" data-testid="text-mismatch-count">
                    {lastRunResult ? mismatchCount : "—"}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${mismatchCount > 0 ? "bg-amber-100" : lastRunResult ? "bg-green-100" : "bg-gray-100"}`}>
                  {mismatchCount > 0
                    ? <AlertTriangle className="h-5 w-5 text-amber-600" />
                    : lastRunResult
                      ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                      : <Clock className="h-5 w-5 text-gray-400" />}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {lastRunResult
                  ? `${lastRunResult.checkedCharges} charges · ${lastRunResult.checkedBookings} bookings checked`
                  : "Run reconciliation to see results"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Last Run</p>
                  {/* Reads the PERSISTED run row, not just this browser session's click — a
                      reload used to reset this to "Never" whether or not the job was healthy. */}
                  <p className="text-sm font-semibold text-gray-900 mt-1" data-testid="text-last-run">
                    {lastRun
                      ? new Date(lastRun.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "Never"}
                  </p>
                  {lastRun && (
                    <p className="text-xs text-gray-400">
                      {new Date(lastRun.started_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-full bg-blue-100">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Auto-runs daily at startup + 1 hour</p>
            </CardContent>
          </Card>

          {/* Disputes card — red/urgent */}
          <Card className={disputeCount > 0 ? "border-red-300 bg-red-50" : ""}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs uppercase tracking-wide ${disputeCount > 0 ? "text-red-700 font-semibold" : "text-gray-500"}`}>
                    Active Disputes
                  </p>
                  <p className="text-3xl font-bold text-gray-900 mt-1" data-testid="text-dispute-count">
                    {disputesLoading ? "—" : disputeCount}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${disputeCount > 0 ? "bg-red-200" : "bg-gray-100"}`}>
                  <Siren className={`h-5 w-5 ${disputeCount > 0 ? "text-red-700" : "text-gray-400"}`} />
                </div>
              </div>
              <p className={`text-xs mt-2 ${disputeCount > 0 ? "text-red-600 font-medium" : "text-gray-400"}`}>
                {disputeCount > 0 ? "Requires manual review — see below" : "No open chargebacks"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Disputes panel — always visible, red/urgent when populated */}
        <Card className={disputeCount > 0 ? "border-red-300" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Siren className={`h-4 w-4 ${disputeCount > 0 ? "text-red-600" : "text-gray-400"}`} />
                  Chargebacks & Disputes
                  {disputeCount > 0 && (
                    <Badge variant="destructive" className="ml-1">{disputeCount} open</Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {disputeData?.note ?? "Bookings flagged as disputed by Stripe. Do NOT refund or claw back payouts without Stripe dashboard confirmation."}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchDisputes()}
                disabled={disputesLoading}
                data-testid="button-refresh-disputes"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${disputesLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {disputesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading disputes…
              </div>
            ) : disputeCount === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
                <CheckCircle2 className="h-4 w-4" />
                No open disputes or chargebacks.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-red-200 bg-red-50">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-red-800">Booking</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-red-800">Status</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-red-800">Dispute ID</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-red-800">Reason</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-red-800">Amount</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-red-800">Updated</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-red-800">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputeData?.disputes.map((d) => (
                      <tr key={d.id} className="border-b border-red-100 hover:bg-red-50" data-testid={`row-dispute-${d.id}`}>
                        <td className="py-2 px-3">
                          <p className="font-mono text-xs text-gray-700 truncate max-w-[120px]">{d.id}</p>
                          {d.title && <p className="text-xs text-gray-500 truncate max-w-[120px]">{d.title}</p>}
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            variant={d.status === "dispute_lost" ? "destructive" : "outline"}
                            className={d.status === "disputed" ? "border-red-400 text-red-700 bg-red-50" : ""}
                          >
                            {d.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-gray-600 max-w-[140px] truncate">
                          {d.dispute_id ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600 capitalize">
                          {d.dispute_reason?.replace(/_/g, " ") ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-700 font-medium">
                          {d.total_amount ? `$${parseFloat(d.total_amount).toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-500">
                          {d.updated_at
                            ? new Date(d.updated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {d.dispute_id && (
                              <a
                                href={`https://dashboard.stripe.com/disputes/${d.dispute_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                data-testid={`link-dispute-stripe-${d.id}`}
                              >
                                Stripe <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {d.status === "disputed" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-gray-300 text-gray-700 hover:bg-gray-100"
                                  disabled={rejectMutation.isPending || upholdMutation.isPending}
                                  onClick={() => {
                                    if (window.confirm("Reject this dispute? The traveler's claim is not upheld — held earnings resume release and the booking returns to completed.")) {
                                      rejectMutation.mutate(d.id);
                                    }
                                  }}
                                  data-testid={`button-reject-dispute-${d.id}`}
                                >
                                  Reject
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-red-400 text-red-700 hover:bg-red-100"
                                  disabled={rejectMutation.isPending || upholdMutation.isPending}
                                  onClick={() => {
                                    if (window.confirm("Uphold this dispute? The traveler's claim IS valid — this reverses the provider/expert earnings and platform revenue and REFUNDS the traveler. This moves money and cannot be auto-undone.")) {
                                      upholdMutation.mutate(d.id);
                                    }
                                  }}
                                  data-testid={`button-uphold-dispute-${d.id}`}
                                >
                                  Uphold &amp; refund
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {disputeCount > 0 && (
              <p className="mt-3 text-xs text-red-700 font-medium bg-red-50 border border-red-200 rounded px-3 py-2">
                ⚠ Do NOT refund or initiate payout clawbacks without first confirming the dispute outcome in the Stripe dashboard.
                Each row above has a direct link.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Ready-Made concierge disputes (ledger 2026-08-22-concierge-p3) — buyer concerns after
            purchase. Sibling of the chargeback queue above: that one is Stripe-initiated on
            service bookings; this one is buyer-initiated on ready-made purchases, and refund
            here is the admin escape hatch (the self-serve refund is retired). */}
        {(rmDisputeData?.disputes?.length ?? 0) > 0 && (
          <Card className="border-amber-300">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Siren className="h-4 w-4 text-amber-600" />
                    Ready-Made concierge disputes
                    <Badge variant="destructive" className="ml-1">{rmDisputeData!.disputes.length} open</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Buyers who raised a concern on a Ready-Made purchase. The revision columns show whether
                    the included entitlement was even used; the earning column shows whether the author's
                    money is still recoverable (a paid-out earning refuses the refund path server-side).
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchRmDisputes()} disabled={rmDisputesLoading} data-testid="button-refresh-rm-disputes">
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${rmDisputesLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-200 bg-amber-50">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-800">Buyer & trip</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-800">Expert</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-800">Reason</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-800">Revision</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-800">Earning</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-800">Paid</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-800">Resolve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rmDisputeData!.disputes.map((d) => {
                      const stripePending = d.purchase_status === "refunded";
                      const recoverable = d.earning_status == null || d.earning_status === "held" || d.earning_status === "releasable";
                      return (
                        <tr key={d.id} className="border-b border-amber-100 hover:bg-amber-50" data-testid={`row-rm-dispute-${d.id}`}>
                          <td className="py-2 px-3">
                            <p className="text-xs font-medium text-gray-800">{[d.buyer_first_name, d.buyer_last_name].filter(Boolean).join(" ") || "—"}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[140px]">{d.listing_title}</p>
                            <p className="text-[11px] text-gray-400">
                              {d.disputed_at ? new Date(d.disputed_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </p>
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-600">
                            {[d.author_first_name, d.author_last_name].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-600 max-w-[180px]">
                            <p className="line-clamp-3">{d.dispute_reason ?? "—"}</p>
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-600">
                            {d.revision_requested_at ? (
                              <>
                                <p>Requested {new Date(d.revision_requested_at).toLocaleDateString([], { month: "short", day: "numeric" })}</p>
                                <p className="text-gray-400">workspace: {d.advisor_workspace_status ?? "—"} · {d.suggestion_count} suggestion{d.suggestion_count === 1 ? "" : "s"}</p>
                              </>
                            ) : (
                              <span className="text-amber-700 font-medium">Never requested</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-xs">
                            {stripePending ? (
                              <span className="text-red-700 font-medium">Reversal pending — retry refund</span>
                            ) : recoverable ? (
                              <span className="text-green-700">{d.earning_status ?? "none"}{d.earning_dispute_state === "open" ? " (frozen)" : ""}</span>
                            ) : (
                              <span className="text-red-700 font-medium">{d.earning_status} — not refundable here</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-700 font-medium">
                            ${(d.price_paid_cents / 100).toFixed(2)}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-xs border-gray-300 text-gray-700 hover:bg-gray-100"
                                disabled={rmRefundMutation.isPending || rmDismissMutation.isPending}
                                onClick={() => {
                                  if (window.confirm("Dismiss this concern? The purchase stands, the author's earning resumes its release clock, and the buyer is notified.")) {
                                    rmDismissMutation.mutate(d.id);
                                  }
                                }}
                                data-testid={`button-rm-dismiss-${d.id}`}
                              >
                                Dismiss
                              </Button>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-xs border-red-400 text-red-700 hover:bg-red-100"
                                disabled={rmRefundMutation.isPending || rmDismissMutation.isPending || (!recoverable && !stripePending)}
                                title={!recoverable && !stripePending ? "The author's earning already paid out — not refundable through this path" : undefined}
                                onClick={() => {
                                  if (window.confirm(stripePending
                                    ? "Retry the payment reversal? The ledger is already refunded; only the Stripe leg re-runs."
                                    : "Refund this buyer? This reverses the author's earning and platform revenue and refunds the full payment. The buyer keeps their trip. This moves money and cannot be auto-undone.")) {
                                    rmRefundMutation.mutate(d.id);
                                  }
                                }}
                                data-testid={`button-rm-refund-${d.id}`}
                              >
                                {stripePending ? "Retry refund" : "Refund buyer"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PERSISTED drift exceptions — the durable surface (reconciliation-detection lane).
            The panel below this one is the EPHEMERAL last-run view; this one survives a reload,
            a redeploy and the night shift. */}
        <Card className={driftCount > 0 ? "border-amber-300" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {driftCount === 0
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  Stripe ↔ Database Drift (recorded)
                  {driftCount > 0 && (
                    <Badge variant="destructive" className="ml-1">{driftCount}</Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {driftData?.note ??
                    "Drift detected by the daily scan across both booking rails. Append-only; nothing here is auto-repaired."}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchDrift()}
                disabled={driftLoading}
                data-testid="button-refresh-drift"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${driftLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* "No exceptions" is only good news if the job actually ran. */}
            {!lastRun ? (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span data-testid="text-no-run-recorded">
                  <strong>No reconciliation run has ever been recorded.</strong> An empty drift list below
                  means nothing until a run appears here — the scan may not be running at all.
                </span>
              </div>
            ) : (
              <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4" data-testid="text-last-recorded-run">
                Last recorded run: <strong>{new Date(lastRun.started_at).toLocaleString()}</strong>
                {" · "}{lastRun.triggered_by}{" · "}
                <span className={lastRun.status === "completed" ? "text-green-700" : "text-amber-700"}>
                  {lastRun.status}
                </span>
                {" · "}scanned {lastRun.scanned_payment_intents} PaymentIntent(s),{" "}
                {lastRun.scanned_cart_bookings} cart + {lastRun.scanned_legacy_bookings} legacy booking(s)
                {" · "}{lastRun.exceptions_detected} detected ({lastRun.exceptions_new} new)
                {lastRun.promoted > 0 && (
                  <> · <strong>{lastRun.promoted}</strong> paid claim(s) recovered via the shared promotion</>
                )}
                {lastRun.note && <> · {lastRun.note}</>}
              </div>
            )}

            {driftLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading drift exceptions…
              </div>
            ) : driftCount === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
                <CheckCircle2 className="h-4 w-4" />
                No recorded drift between Stripe and the database.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-200 bg-amber-50">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-900">Detected</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-900">Rail</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-900">What drifted</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-900">Booking</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-900">Expected</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-900">At Stripe</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-amber-900">Stripe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driftData?.exceptions.map((e) => (
                      <tr
                        key={e.id}
                        className={`border-b border-amber-100 ${e.severity === "critical" ? "hover:bg-red-50" : "hover:bg-amber-50"}`}
                        data-testid={`row-drift-${e.id}`}
                      >
                        <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(e.detected_at).toLocaleString([], {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-xs">{e.rail}</Badge>
                        </td>
                        <td className="py-2 px-3">
                          <p className={`text-xs font-medium ${e.severity === "critical" ? "text-red-700" : "text-amber-700"}`}>
                            {KIND_LABELS[e.kind] ?? e.kind}
                          </p>
                          <p className="text-[11px] text-gray-400 font-mono">{e.kind}</p>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-gray-600 max-w-[140px] truncate">
                          {e.booking_id ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-700">
                          {e.expected_amount != null ? `$${parseFloat(e.expected_amount).toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-700 font-medium">
                          {e.actual_amount != null ? `$${parseFloat(e.actual_amount).toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2 px-3">
                          {e.payment_intent_id ? (
                            <a
                              href={`https://dashboard.stripe.com/payments/${e.payment_intent_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              data-testid={`link-drift-stripe-${e.id}`}
                            >
                              PI <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : e.charge_id ? (
                            <a
                              href={`https://dashboard.stripe.com/charges/${e.charge_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              data-testid={`link-drift-stripe-${e.id}`}
                            >
                              Charge <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  ⚠ The scan DETECTS; it never repairs. Confirm each PaymentIntent in the Stripe dashboard
                  before refunding, cancelling or re-creating anything.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reconciliation mismatches */}
        {lastRunResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {mismatchCount === 0
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                Charge ↔ Booking Drift
                {mismatchCount > 0 && (
                  <Badge variant="destructive" className="ml-auto">{mismatchCount} mismatch{mismatchCount !== 1 ? "es" : ""}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {mismatchCount === 0
                  ? "All Stripe charges align with bookings — no drift detected."
                  : "Cross-check each row in the Stripe dashboard before taking action. Do not refund or cancel without confirming in Stripe."}
              </CardDescription>
            </CardHeader>
            {mismatchCount > 0 && (
              <CardContent>
                <div className="space-y-3">
                  {lastRunResult.mismatches.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50"
                      data-testid={`card-mismatch-${i}`}
                    >
                      <div className="mt-0.5">
                        {m.type === "stripe_charge_no_booking"
                          ? <CreditCard className="h-4 w-4 text-red-600" />
                          : <BookOpen className="h-4 w-4 text-amber-700" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {m.type === "stripe_charge_no_booking"
                            ? "Stripe charge — no matching booking"
                            : "Booking confirmed — no Stripe charge"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 font-mono break-all">
                          {m.type === "stripe_charge_no_booking"
                            ? `Charge: ${m.chargeId ?? "—"}${m.amount != null ? ` · $${m.amount.toFixed(2)}` : ""}`
                            : `Booking: ${m.bookingId ?? "—"} · PI: ${m.paymentIntentId ?? "—"}`}
                        </p>
                      </div>
                      <a
                        href={
                          m.type === "stripe_charge_no_booking"
                            ? `https://dashboard.stripe.com/charges/${m.chargeId}`
                            : `https://dashboard.stripe.com/payments/${m.paymentIntentId}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                        data-testid={`link-stripe-mismatch-${i}`}
                      >
                        View in Stripe →
                      </a>
                    </div>
                  ))}
                </div>
                <a
                  href="https://dashboard.stripe.com/payments"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 text-xs text-blue-600 hover:underline"
                >
                  Open Stripe Payments dashboard →
                </a>
              </CardContent>
            )}
          </Card>
        )}

        {/* Unprocessed webhooks */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {unprocessedCount === 0
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <XCircle className="h-4 w-4 text-red-600" />}
                  Unprocessed Webhook Events
                  {unprocessedCount > 0 && (
                    <Badge variant="destructive" className="ml-1">{unprocessedCount}</Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {webhookData?.note ?? "Events in the webhook_events table that have not been processed successfully."}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchWebhooks()}
                disabled={webhooksLoading}
                data-testid="button-refresh-webhooks"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${webhooksLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {webhooksLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading webhook events…
              </div>
            ) : unprocessedCount === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
                <CheckCircle2 className="h-4 w-4" />
                No unprocessed webhook events — all events are up to date.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Event ID</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Received</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Error</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookData?.events.map((evt) => (
                      <tr key={evt.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`row-webhook-${evt.id}`}>
                        <td className="py-2 px-3 font-mono text-xs text-gray-700 max-w-[160px] truncate">
                          {evt.stripe_event_id}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600">{evt.event_type}</td>
                        <td className="py-2 px-3 text-xs text-gray-500">
                          {new Date(evt.created_at).toLocaleString([], {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 px-3 max-w-[200px]">
                          {evt.error ? (
                            <span className="text-xs text-red-600 truncate block" title={evt.error}>
                              {evt.error.slice(0, 60)}{evt.error.length > 60 ? "…" : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600">Stuck mid-flight</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <a
                            href={`https://dashboard.stripe.com/events/${evt.stripe_event_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                            data-testid={`link-stripe-event-${evt.id}`}
                          >
                            Stripe →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">How this works</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500 space-y-2">
            <p>
              <strong className="text-gray-700">Stripe ↔ Database drift</strong> — Fetches the last 24 h of Stripe
              PaymentIntents, charges and refunds and compares them against <em>both</em> booking rails: cart
              checkout (<code className="bg-gray-100 px-1 rounded">service_bookings</code>) and the legacy
              <code className="bg-gray-100 px-1 rounded">bookings</code> table. Until this lane the scan read the
              legacy table only, so cart checkout — the primary checkout — was invisible to it. Nine
              classifications: payment with no booking, payment with an unpromoted claim, payment against a voided
              booking, booking with no PaymentIntent, booking whose PaymentIntent is not succeeded, charged amount ≠
              server-derived total, refund with no reversal, plus the two original legacy checks.
            </p>
            <p>
              <strong className="text-gray-700">Detect, don't repair</strong> — Findings are written as append-only
              rows and shown above; the job never voids, refunds or invents a booking. Its one exception is a
              PaymentIntent that succeeded while its booking is still an unpromoted claim, which is handed to the
              same shared promotion the Stripe webhook uses (recorded in the diary with actor{" "}
              <code className="bg-gray-100 px-1 rounded">reconciliation</code>).
            </p>
            <p>
              <strong className="text-gray-700">Every run is recorded</strong> — including a clean one, so "no drift"
              is distinguishable from "the job has not run". If the banner above says no run has ever been recorded,
              treat an empty list as unknown, not as healthy.
            </p>
            <p>
              <strong className="text-gray-700">Unprocessed webhooks</strong> — Shows events in the{" "}
              <code className="bg-gray-100 px-1 rounded">webhook_events</code> table where{" "}
              <code className="bg-gray-100 px-1 rounded">processed = FALSE</code>. These are either events that
              arrived but failed during processing (error set), or events stuck mid-flight.
            </p>
            <p>
              <strong className="text-gray-700">Daily schedule</strong> — Reconciliation runs automatically every 24 h,
              offset 1 hour from the admin digest. Findings are persisted to{" "}
              <code className="bg-gray-100 px-1 rounded">reconciliation_exceptions</code> (with a{" "}
              <code className="bg-gray-100 px-1 rounded">reconciliation_runs</code> row per pass) and also summarised
              into <code className="bg-gray-100 px-1 rounded">admin_notifications</code> so they appear in the digest
              email.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
