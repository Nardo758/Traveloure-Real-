import { useQuery } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Calendar,
  CreditCard,
  Clock,
  CheckCircle,
  Loader2,
  PieChart,
} from "lucide-react";
import { StripeConnectCard } from "@/components/stripe-connect-card";

interface ConnectStatus {
  connected: boolean;
  status: string;
}

interface EarningsData {
  earnings: Array<{
    id: string;
    amount: string;
    type: string;
    status: string;
    createdAt: string;
    description?: string;
  }>;
  summary: {
    totalEarnings: number;
    monthlyEarnings: number;
    pendingPayout: number;
    lastPayout: number;
    lastPayoutDate?: string;
    platformFeeTotal: number;
    grossBookingTotal: number;
    revenueShareRate: number;
  };
}

export default function ExpertEarnings() {
  const { data, isLoading } = useQuery<EarningsData>({
    queryKey: ["/api/expert/earnings"],
  });

  const { data: connectStatus } = useQuery<ConnectStatus>({
    queryKey: ["/api/stripe/connect/status"],
  });

  const canRequestPayout = connectStatus?.connected && connectStatus?.status === "active";

  const summary = data?.summary;
  const earnings = data?.earnings || [];

  const stats = [
    { label: "Total Earnings", value: `$${(summary?.totalEarnings ?? 0).toLocaleString()}`, icon: DollarSign },
    { label: "This Month", value: `$${(summary?.monthlyEarnings ?? 0).toLocaleString()}`, icon: Calendar },
    { label: "Pending Payout", value: `$${(summary?.pendingPayout ?? 0).toLocaleString()}`, icon: Clock },
    { label: "Last Payout", value: `$${(summary?.lastPayout ?? 0).toLocaleString()}`, date: summary?.lastPayoutDate, icon: CreditCard },
  ];

  const recentTransactions = earnings.slice(0, 5);

  // Group by month for breakdown
  const monthlyBreakdown: Record<string, { earnings: number; clients: number }> = {};
  earnings.forEach((e) => {
    const date = new Date(e.createdAt);
    const month = date.toLocaleString("en-US", { month: "long" });
    if (!monthlyBreakdown[month]) monthlyBreakdown[month] = { earnings: 0, clients: 0 };
    monthlyBreakdown[month].earnings += parseFloat(e.amount || "0");
    monthlyBreakdown[month].clients++;
  });
  const monthlyData = Object.entries(monthlyBreakdown).slice(0, 4).map(([month, data]) => ({
    month,
    earnings: data.earnings,
    clients: data.clients,
  }));

  if (isLoading) {
    return (
      <ExpertLayout title="Earnings">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </ExpertLayout>
    );
  }

  const shareRate = summary?.revenueShareRate ?? 0.70;
  const platformRate = 1 - shareRate;

  return (
    <ExpertLayout title="Earnings">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Earnings Dashboard</h1>
            <p className="text-gray-600">Track your revenue and manage payouts</p>
          </div>
          <div className="flex items-center gap-2">
            {!canRequestPayout && (
              <p className="text-sm text-amber-600">Connect Stripe to enable payouts</p>
            )}
            <Button
              className="bg-[#FF385C] disabled:opacity-50"
              disabled={!canRequestPayout}
              data-testid="button-request-payout"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Request Payout
            </Button>
          </div>
        </div>

        <StripeConnectCard />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <Card key={index} className="border border-gray-200" data-testid={`card-earnings-stat-${index}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    {stat.date && <p className="text-sm text-gray-500">{stat.date}</p>}
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-[#FF385C]/10 flex items-center justify-center">
                    <stat.icon className="w-6 h-6 text-[#FF385C]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Revenue Share Breakdown */}
        <Card className="border border-gray-200" data-testid="card-revenue-share">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PieChart className="w-5 h-5 text-[#FF385C]" />
              Revenue Share Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center" data-testid="stat-gross-total">
                <p className="text-sm text-gray-500 mb-1">Gross Booking Value</p>
                <p className="text-xl font-bold text-gray-900">
                  ${(summary?.grossBookingTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-400 mt-1">Total from all bookings</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-100 text-center" data-testid="stat-platform-fee">
                <p className="text-sm text-red-600 mb-1">Platform Fee ({Math.round(platformRate * 100)}%)</p>
                <p className="text-xl font-bold text-red-700">
                  -${(summary?.platformFeeTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-red-400 mt-1">Traveloure service charge</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center" data-testid="stat-your-share">
                <p className="text-sm text-green-600 mb-1">Your Share ({Math.round(shareRate * 100)}%)</p>
                <p className="text-xl font-bold text-green-700">
                  ${(summary?.totalEarnings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-green-500 mt-1">Your lifetime earnings</p>
              </div>
            </div>
            {/* Visual bar */}
            <div className="mt-4 h-3 bg-gray-100 rounded-full overflow-hidden flex" data-testid="bar-revenue-split">
              <div
                className="h-full bg-[#FF385C] transition-all"
                style={{ width: `${Math.round(platformRate * 100)}%` }}
              />
              <div className="h-full bg-green-500 flex-1" />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Platform {Math.round(platformRate * 100)}%</span>
              <span>You {Math.round(shareRate * 100)}%</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Transactions */}
          <div className="lg:col-span-2">
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Recent Transactions</CardTitle>
                  <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="button-view-all-transactions">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentTransactions.length > 0 ? recentTransactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{transaction.type || "Earning"}</p>
                          <p className="text-sm text-gray-500">{transaction.description || ""}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">+${parseFloat(transaction.amount || "0").toLocaleString()}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{new Date(transaction.createdAt).toLocaleDateString()}</span>
                          <Badge
                            variant="outline"
                            className={transaction.status === "completed"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-yellow-50 text-yellow-700 border-yellow-200"}
                          >
                            {transaction.status === "completed"
                              ? <CheckCircle className="w-3 h-3 mr-1" />
                              : <Clock className="w-3 h-3 mr-1" />}
                            {transaction.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <p className="text-gray-500 text-center py-4">No transactions yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Monthly Breakdown */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Monthly Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {monthlyData.length > 0 ? monthlyData.map((month, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg hover-elevate" data-testid={`monthly-breakdown-${index}`}>
                      <div>
                        <p className="font-medium text-gray-900">{month.month}</p>
                        <p className="text-sm text-gray-500">{month.clients} transactions</p>
                      </div>
                      <p className="font-semibold text-gray-900">${month.earnings.toLocaleString()}</p>
                    </div>
                  )) : (
                    <p className="text-gray-500 text-center py-2">No data yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Bank Account</p>
                    <p className="text-sm text-gray-500">Set up your payment method</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-3" data-testid="button-update-payment">
                  Update Payment Method
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ExpertLayout>
  );
}
