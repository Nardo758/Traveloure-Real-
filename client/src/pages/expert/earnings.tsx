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
} from "lucide-react";
import { StripeConnectCard } from "@/components/stripe-connect-card";
import { EarningsBySourcePanel } from "@/components/backoffice/earnings-by-source-panel";
import { PageHeader, StatCard, StatusBadge, EmptyState } from "@/components/backoffice/primitives";

// The one Money ledger endpoint (GET /api/expert/earnings/details, server/routes/experts.routes.ts:220)
// backed by revenue-tracking.service.ts:252-276. Vocabulary: `availableEarnings` = RELEASABLE (cleared,
// payable now); `pendingEarnings` = HELD in escrow. This page is its first consumer.
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

interface EarningsDetails {
  summary: {
    totalEarnings: number;
    pendingEarnings: number;
    availableEarnings: number;
    paidOut: number;
    totalTips: number;
    totalAffiliateCommissions: number;
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

  if (isLoading) {
    return (
      <ExpertLayout title="Earnings">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-console-mid" />
        </div>
      </ExpertLayout>
    );
  }

  return (
    <ExpertLayout title="Earnings">
      <div className="p-6 space-y-6">
        <PageHeader
          title="Money"
          subtitle="Your ledger: held, cleared, and paid — plus payout requests"
          actions={
            <Button
              disabled={payoutMutation.isPending || requested}
              onClick={() => payoutMutation.mutate()}
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
                  {payouts.map((payout) => (
                    <div
                      key={payout.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-console-light bg-console-bg"
                      data-testid={`payout-${payout.id}`}
                    >
                      <div>
                        <p className="font-medium text-console-darkest">
                          ${parseFloat(payout.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-console-mid">{new Date(payout.requestedAt).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge status={payout.status} />
                    </div>
                  ))}
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
