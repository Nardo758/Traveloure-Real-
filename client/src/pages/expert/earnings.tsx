import { useQuery } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Calendar,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  Download,
  Loader2
} from "lucide-react";

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
  };
}

export default function ExpertEarnings() {
  const { data, isLoading } = useQuery<EarningsData>({
    queryKey: ["/api/expert/earnings"],
  });

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

  return (
    <ExpertLayout title="Earnings">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Earnings Dashboard</h1>
            <p className="text-gray-600">Track your revenue and manage payouts</p>
          </div>
          <Button className="bg-[#FF385C] " data-testid="button-request-payout">
            <DollarSign className="w-4 h-4 mr-2" />
            Request Payout
          </Button>
        </div>

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
