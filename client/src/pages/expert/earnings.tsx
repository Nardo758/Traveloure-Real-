import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpRight } from "lucide-react";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  Clock,
  CheckCircle,
  Wallet,
  Loader2,
  TrendingUp,
  PieChart,
  Shield,
} from "lucide-react";
import { StripeConnectCard } from "@/components/stripe-connect-card";
import { EarningsBySourcePanel } from "@/components/backoffice/earnings-by-source-panel";
import { PageHeader, StatCard, StatusBadge, EmptyState } from "@/components/backoffice/primitives";

// Console IA C8 (§17 17→9 collapse): module renamed Earnings → Money — route moved to
// /expert/money (/expert/earnings redirects); label/title only, no endpoint or queryKey change.
// The one Money ledger endpoint (GET /api/expert/earnings/details, server/routes/experts.routes.ts:220)
// backed by revenue-tracking.service.ts:252-276. Vocabulary: `availableEarnings` = RELEASABLE (cleared,
// payable now); `pendingEarnings` = HELD in escrow. This page is its first consumer.

// Task 1193: mirror the server's STALE_PAYOUT_CONTACT_DAYS constant — if a pending/processing
// payout is older than this many days, show a "Contact support" nudge beneath that row so the
// earner knows there is a self-service escalation path. The gate bypass (14 days) is server-only;
// this shorter window is purely informational.
const PAYOUT_CONTACT_DAYS = 7;

function isPayoutOverdueForContact(payout: { status: string; requestedAt: string }): boolean {
  if (payout.status !== "pending" && payout.status !== "processing") return false;
  const requestedAt = new Date(payout.requestedAt);
  if (isNaN(requestedAt.getTime())) return false;
  return (Date.now() - requestedAt.getTime()) / 86_400_000 > PAYOUT_CONTACT_DAYS;
}

interface ExpertEarningRow {
  id: string;
  amount: string;
  type: string;
  status: string; // held | releasable | paid_out | reversed
  disputeState?: string | null; // none | open
  description?: string | null;
  createdAt: string;
}

interface ExpertPayoutRow {
  id: string;
  amount: string;
  status: string; // pending | processing | completed | failed
  requestedAt: string;
}

interface ExpertTipRow {
  id: string;
  amount: string;
  message?: string | null;
  createdAt: string;
}

interface AffiliateEarningRow {
  id: string;
  expertShare: string;
  createdAt: string;
}

interface ConnectStatus {
  connected: boolean;
}

interface EarningsDetails {
  summary: {
    totalEarnings: number;
    pendingEarnings: number;
    availableEarnings: number;
    paidOut: number;
    totalTips: number;
    totalAffiliateCommissions: number;
    // Revenue share breakdown from platform_revenue
    grossBookingValue: number;
    platformFeeTotal: number;
    expertShareFromRevenue: number;
    effectiveShareRate: number | null;
  };
  earnings: ExpertEarningRow[];
  payouts: ExpertPayoutRow[];
  recentTips: ExpertTipRow[];
  recentAffiliateEarnings: AffiliateEarningRow[];
}

export default function ExpertEarnings() {
  const { toast } = useToast();
  const [requested, setRequested] = useState(false);
  const { data, isLoading } = useQuery<EarningsDetails>({
    queryKey: ["/api/expert/earnings/details"],
  });
  // Same queryKey/cache as StripeConnectCard below — shares the fetch, no duplicate request.
  const { data: connectStatus } = useQuery<ConnectStatus>({
    queryKey: ["/api/stripe/connect/status"],
  });

  // Self-service payout REQUEST. The amount is server-derived from the cleared
  // (releasable) balance; this only submits the request for admin processing.
  const payoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/payouts/request"),
    onSuccess: () => {
      setRequested(true);
      toast({ title: "Payout requested", description: "It's pending review — you'll be paid to your connected account once approved." });
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      if (msg.includes("payout_request_pending")) {
        setRequested(true);
        toast({ title: "Request already pending", description: "You already have a payout request under review." });
      } else if (msg.includes("payout_processing_stale")) {
        toast({ title: "Payout stuck in processing", description: "Your payout has been in processing for over 14 days. Contact support to resolve it.", variant: "destructive" });
      } else if (msg.includes("stripe_not_connected")) {
        toast({ title: "Stripe account required", description: "Connect your Stripe account before requesting a payout. Finish setup in Settings.", variant: "destructive" });
      } else if (msg.includes("below_minimum")) {
        toast({ title: "Below minimum", description: "The minimum payout is $10.00.", variant: "destructive" });
      } else if (msg.includes("no_balance")) {
        toast({ title: "No available balance", description: "You have no cleared earnings to withdraw yet.", variant: "destructive" });
      } else {
        toast({ title: "Could not submit request", description: "Please try again or contact support.", variant: "destructive" });
      }
    },
  });

  const summary = data?.summary;
  const earnings = data?.earnings ?? [];
  const payouts = data?.payouts ?? [];
  const recentTips = data?.recentTips ?? [];
  const recentAffiliateEarnings = data?.recentAffiliateEarnings ?? [];

  // EX-4: the button must never be reachable when it can only fail server-side —
  // no cleared balance to withdraw, or no payout destination to send it to.
  const availableBalance = summary?.availableEarnings ?? 0;
  const stripeNotConnected = !connectStatus?.connected;
  const payoutBlocked = availableBalance <= 0 || stripeNotConnected;
  const payoutBlockedReason = stripeNotConnected
    ? "Connect your Stripe account in Settings before requesting a payout."
    : availableBalance <= 0
    ? "You have no cleared balance available to pay out yet."
    : undefined;

  if (isLoading) {
    return (
      <ExpertLayout title="Money">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-console-mid" />
        </div>
      </ExpertLayout>
    );
  }

  return (
    <ExpertLayout title="Money">
      <div className="p-6 space-y-6">
        <PageHeader
          title="Money"
          subtitle="Your ledger: held, cleared, and paid — plus payout requests"
          actions={
            <Button
              disabled={payoutMutation.isPending || requested || payoutBlocked}
              onClick={() => payoutMutation.mutate()}
              title={!requested && !payoutMutation.isPending ? payoutBlockedReason : undefined}
              data-testid="button-request-payout"
            >
              {payoutMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Requesting…</>
              ) : requested ? (
                "Payout requested"
              ) : (
                <><ArrowUpRight className="w-4 h-4 mr-2" /> Request Payout</>
              )}
            </Button>
          }
        />

        <StripeConnectCard />

        {/* 7-day hold explainer — shown whenever the earner has held funds so they understand
            why the "Available to pay out" figure differs from their total earned.
            Hold window from earnings-hold.config.ts: 7 days for service_booking (the default).
            Template sales are 14 days; tips clear immediately — so the note stays generic. */}
        {(summary?.pendingEarnings ?? 0) > 0 && (
          <div
            className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            data-testid="banner-hold-explainer"
          >
            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
            <span>
              <strong>Why are some earnings held?</strong> Funds are held in escrow for 7 days after
              a booking completes. This covers dispute and refund windows. Once the hold clears, the
              balance moves to <em>Available to pay out</em> automatically.
            </span>
          </div>
        )}

        {/* Honest four-card ledger split — held/releasable are never conflated (§13). */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Available to pay out"
            value={`$${(summary?.availableEarnings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={Wallet}
            iconClassName="bg-green-100 text-green-600"
            testId="card-earnings-available"
          />
          <StatCard
            label="Held in escrow"
            value={`$${(summary?.pendingEarnings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={Clock}
            iconClassName="bg-amber-100 text-amber-600"
            testId="card-earnings-held"
          />
          <StatCard
            label="Paid out"
            value={`$${(summary?.paidOut ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={CheckCircle}
            iconClassName="bg-blue-100 text-blue-600"
            testId="card-earnings-paid-out"
          />
          <StatCard
            label="Total earned"
            value={`$${(summary?.totalEarnings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={DollarSign}
            iconClassName="bg-console-bg text-console-darkest"
            testId="card-earnings-total"
          />
        </div>

        {/* Revenue Share Breakdown — mirrors the provider Money page layout.
            Gross/fee figures come from platform_revenue (expertId-scoped), added to the
            GET /api/expert/earnings/details response in revenue-tracking.service.ts. */}
        <Card data-testid="card-revenue-share">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PieChart className="w-5 h-5 text-primary" />
              Revenue Share Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-console-bg rounded-lg border border-console-light text-center" data-testid="stat-gross-total">
                <p className="text-sm text-console-mid mb-1">Gross Booking Value</p>
                <p className="text-xl font-bold text-console-darkest">
                  ${(summary?.grossBookingValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-console-mid mt-1">Total from all bookings</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800 text-center" data-testid="stat-platform-fee">
                <p className="text-sm text-red-600 mb-1">
                  Platform Fee{summary?.effectiveShareRate != null ? ` (${Math.round((1 - summary.effectiveShareRate) * 100)}%)` : ""}
                </p>
                <p className="text-xl font-bold text-red-700">
                  -${(summary?.platformFeeTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-red-400 mt-1">Traveloure service charge</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-center" data-testid="stat-your-share">
                <p className="text-sm text-green-600 mb-1">
                  Your Share{summary?.effectiveShareRate != null ? ` (${Math.round(summary.effectiveShareRate * 100)}%)` : ""}
                </p>
                <p className="text-xl font-bold text-green-700">
                  ${(summary?.expertShareFromRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-green-500 mt-1">Your lifetime earnings</p>
              </div>
            </div>

            {/* Fee line items */}
            <div className="mt-4 rounded-lg border border-border bg-muted/30 divide-y divide-border" data-testid="section-fee-breakdown">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-sm text-muted-foreground">Platform commission</span>
                </div>
                <span className="text-sm font-medium text-red-600" data-testid="text-base-commission">
                  -${(summary?.platformFeeTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {(summary?.totalTips ?? 0) > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5" data-testid="row-tips">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Tips received</span>
                  </div>
                  <span className="text-sm font-medium text-blue-600">
                    +${(summary?.totalTips ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {(summary?.totalAffiliateCommissions ?? 0) > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5" data-testid="row-affiliate">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-sm text-muted-foreground">Affiliate commissions</span>
                  </div>
                  <span className="text-sm font-medium text-green-600">
                    +${(summary?.totalAffiliateCommissions ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-2.5 bg-green-50 dark:bg-green-950/20 rounded-b-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">Your net earnings</span>
                </div>
                <span className="text-sm font-bold text-green-600" data-testid="text-net-earnings">
                  ${(summary?.expertShareFromRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Proportional split bar — only rendered when gross data is available */}
            {summary?.effectiveShareRate != null ? (
              <>
                <div className="mt-3 h-3 bg-console-bg rounded-full overflow-hidden flex" data-testid="bar-revenue-split">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((1 - summary.effectiveShareRate) * 100)}%` }}
                  />
                  <div className="h-full bg-green-500 flex-1" />
                </div>
                <div className="flex justify-between text-xs text-console-mid mt-1">
                  <span>Platform {Math.round((1 - summary.effectiveShareRate) * 100)}%</span>
                  <span data-testid="text-expert-share-rate">You {Math.round(summary.effectiveShareRate * 100)}%</span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-console-mid text-center" data-testid="text-revenue-split-empty">
                No bookings yet — your split appears here after your first booking.
              </p>
            )}
          </CardContent>
        </Card>

        <EarningsBySourcePanel />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transactions — real expert_earnings ledger rows, not bookings-derived pseudo-transactions */}
          <Card className="border border-console-light">
            <CardHeader>
              <CardTitle className="text-lg">Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {earnings.length > 0 ? (
                <div className="space-y-3">
                  {earnings.map((txn) => (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-console-light bg-console-bg"
                      data-testid={`transaction-${txn.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-console-darkest capitalize">{txn.type?.replace(/_/g, " ") || "Earning"}</p>
                          <p className="text-sm text-console-mid">{new Date(txn.createdAt).toLocaleDateString()}</p>
                          {txn.disputeState === "open" && (
                            <p className="text-xs text-red-600 mt-0.5">held — traveler dispute under review</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-console-darkest">
                          ${parseFloat(txn.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <div className="mt-1">
                          <StatusBadge status={txn.status} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No transactions yet" body="Ledger entries appear here as you earn." testId="empty-transactions" />
              )}
            </CardContent>
          </Card>

          {/* Payout history — closes a real gap, no earner-facing payout list existed before */}
          <Card className="border border-console-light">
            <CardHeader>
              <CardTitle className="text-lg">Payout History</CardTitle>
            </CardHeader>
            <CardContent>
              {payouts.length > 0 ? (
                <div className="space-y-3">
                  {payouts.map((payout) => {
                    const overdue = isPayoutOverdueForContact(payout);
                    return (
                      <div
                        key={payout.id}
                        className="p-3 rounded-lg border border-console-light bg-console-bg"
                        data-testid={`payout-${payout.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-console-darkest">
                              ${parseFloat(payout.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-sm text-console-mid">
                              Requested {new Date(payout.requestedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <StatusBadge status={payout.status} />
                        </div>
                        {/* Task 1193: stale-payout nudge — appears after PAYOUT_CONTACT_DAYS of
                            no resolution so the earner knows there is an escalation path. The 14-day
                            server gate (STALE_PAYOUT_PROCESSING_DAYS) allows a fresh request after
                            that window; this shorter 7-day nudge is purely informational. */}
                        {overdue && (
                          <p
                            className="mt-2 text-xs text-amber-700"
                            data-testid={`text-payout-stale-${payout.id}`}
                          >
                            This request has been {payout.status} for more than {PAYOUT_CONTACT_DAYS} days.{" "}
                            <a
                              href="mailto:support@traveloure.com"
                              className="underline font-medium"
                              data-testid={`link-payout-support-${payout.id}`}
                            >
                              Contact support
                            </a>{" "}
                            if you need help.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No payout requests yet" body="Request a payout from your available balance above." testId="empty-payouts" />
              )}
            </CardContent>
          </Card>
        </div>

        {(recentTips.length > 0 || recentAffiliateEarnings.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {recentTips.length > 0 && (
              <Card className="border border-console-light">
                <CardHeader>
                  <CardTitle className="text-lg">Recent Tips</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentTips.map((tip) => (
                      <div
                        key={tip.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-console-light bg-console-bg"
                        data-testid={`tip-${tip.id}`}
                      >
                        <div>
                          <p className="font-medium text-console-darkest">
                            ${parseFloat(tip.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          {tip.message && <p className="text-sm text-console-mid">{tip.message}</p>}
                        </div>
                        <span className="text-sm text-console-mid">{new Date(tip.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {recentAffiliateEarnings.length > 0 && (
              <Card className="border border-console-light">
                <CardHeader>
                  <CardTitle className="text-lg">Recent Affiliate Earnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentAffiliateEarnings.map((aff) => (
                      <div
                        key={aff.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-console-light bg-console-bg"
                        data-testid={`affiliate-earning-${aff.id}`}
                      >
                        <p className="font-medium text-console-darkest">
                          ${parseFloat(aff.expertShare || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <span className="text-sm text-console-mid">{new Date(aff.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </ExpertLayout>
  );
}
