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
  type: "stripe_charge_no_booking" | "booking_no_stripe_charge";
  chargeId?: string;
  bookingId?: string;
  paymentIntentId?: string;
  amount?: number;
  metadata?: Record<string, string>;
}

interface ReconciliationResult {
  mismatches: Mismatch[];
  checkedCharges: number;
  checkedBookings: number;
  ranAt: string;
  note: string;
}

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
  dispute_id: string | null;
  dispute_reason: string | null;
  stripe_payment_intent_id: string | null;
  total_amount: string | null;
  booking_type: string | null;
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

  // Trigger reconciliation now
  const runNowMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/admin/reconciliation/run-now"),
    onSuccess: async (res) => {
      const data: ReconciliationResult = await res.json();
      setLastRunResult(data);
      refetchWebhooks();
      refetchDisputes();
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

  const unprocessedCount = webhookData?.count ?? 0;
  const mismatchCount = lastRunResult?.mismatches.length ?? 0;
  const disputeCount = disputeData?.count ?? 0;

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
                  <p className="text-sm font-semibold text-gray-900 mt-1" data-testid="text-last-run">
                    {lastRunResult
                      ? new Date(lastRunResult.ranAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "Never"}
                  </p>
                  {lastRunResult && (
                    <p className="text-xs text-gray-400">
                      {new Date(lastRunResult.ranAt).toLocaleDateString()}
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
              <strong className="text-gray-700">Charge ↔ Booking drift</strong> — Fetches the last 100 Stripe charges
              (last 24 h) and compares against bookings created in the same window. Flags succeeded charges with no
              matching booking row, and confirmed bookings with no succeeded charge.
            </p>
            <p>
              <strong className="text-gray-700">Unprocessed webhooks</strong> — Shows events in the{" "}
              <code className="bg-gray-100 px-1 rounded">webhook_events</code> table where{" "}
              <code className="bg-gray-100 px-1 rounded">processed = FALSE</code>. These are either events that
              arrived but failed during processing (error set), or events stuck mid-flight.
            </p>
            <p>
              <strong className="text-gray-700">Daily schedule</strong> — Reconciliation runs automatically every 24 h,
              offset 1 hour from the admin digest. Mismatches are stored in{" "}
              <code className="bg-gray-100 px-1 rounded">admin_notifications</code> and appear in the digest email.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
