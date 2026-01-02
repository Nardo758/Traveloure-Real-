import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  TrendingUp, 
  ArrowUpRight,
  ArrowDownRight,
  Download,
  CreditCard,
  Users,
  Building2
} from "lucide-react";

const stats = [
  { label: "Total Revenue", value: "$1,256,000", change: "+15%", positive: true },
  { label: "This Month", value: "$125,600", change: "+8%", positive: true },
  { label: "Platform Fees", value: "$125,600", change: "+12%", positive: true },
  { label: "Pending Payouts", value: "$45,200", change: null, positive: null },
];

const monthlyRevenue = [
  { month: "Jan 2026", revenue: 125600, fees: 12560 },
  { month: "Dec 2025", revenue: 142500, fees: 14250 },
  { month: "Nov 2025", revenue: 118000, fees: 11800 },
  { month: "Oct 2025", revenue: 152000, fees: 15200 },
  { month: "Sep 2025", revenue: 138000, fees: 13800 },
  { month: "Aug 2025", revenue: 95000, fees: 9500 },
];

const revenueBySource = [
  { source: "User Subscriptions", amount: "$42,500", percentage: 34 },
  { source: "Expert Commissions", amount: "$35,200", percentage: 28 },
  { source: "Provider Fees", amount: "$28,400", percentage: 23 },
  { source: "Premium Features", amount: "$19,500", percentage: 15 },
];

const recentTransactions = [
  { id: 1, type: "Booking Payment", user: "Sarah Mitchell", amount: "+$2,500", time: "5 min ago" },
  { id: 2, type: "Expert Payout", user: "Emily Rose", amount: "-$1,800", time: "1 hour ago" },
  { id: 3, type: "Provider Payout", user: "Grand Estate Venue", amount: "-$12,500", time: "2 hours ago" },
  { id: 4, type: "Subscription", user: "John Davidson", amount: "+$29.99", time: "3 hours ago" },
  { id: 5, type: "Booking Payment", user: "Lisa Parker", amount: "+$8,500", time: "5 hours ago" },
];

export default function AdminRevenue() {
  const maxRevenue = Math.max(...monthlyRevenue.map(m => m.revenue));

  return (
    <AdminLayout title="Revenue">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    {stat.change && (
                      <div className={`flex items-center gap-1 text-sm ${stat.positive ? "text-green-600" : "text-red-600"}`}>
                        {stat.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {stat.change} vs last month
                      </div>
                    )}
                  </div>
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button data-testid="button-download-report">
            <Download className="w-4 h-4 mr-2" /> Download Report
          </Button>
          <Button variant="outline" data-testid="button-process-payouts">
            <CreditCard className="w-4 h-4 mr-2" /> Process Payouts
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Monthly Revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {monthlyRevenue.map((month, index) => (
                <div key={month.month} className="space-y-1" data-testid={`chart-bar-${index}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{month.month}</span>
                    <div className="text-right">
                      <span className="font-medium text-gray-900">${month.revenue.toLocaleString()}</span>
                      <span className="text-gray-500 ml-2">(Fees: ${month.fees.toLocaleString()})</span>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(month.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Revenue by Source */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                Revenue by Source
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {revenueBySource.map((source, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                  data-testid={`row-source-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      index === 0 ? "bg-blue-100" : 
                      index === 1 ? "bg-purple-100" : 
                      index === 2 ? "bg-green-100" : "bg-amber-100"
                    }`}>
                      {index === 0 ? <Users className="w-5 h-5 text-blue-600" /> :
                       index === 1 ? <Users className="w-5 h-5 text-purple-600" /> :
                       index === 2 ? <Building2 className="w-5 h-5 text-green-600" /> :
                       <CreditCard className="w-5 h-5 text-amber-600" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{source.source}</p>
                      <p className="text-sm text-gray-500">{source.percentage}% of total</p>
                    </div>
                  </div>
                  <span className="font-semibold text-gray-900">{source.amount}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Recent Transactions</CardTitle>
            <Button variant="ghost" size="sm" data-testid="button-view-all-transactions">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTransactions.map((tx) => (
                <div 
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                  data-testid={`row-transaction-${tx.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.amount.startsWith("+") ? "bg-green-100" : "bg-blue-100"
                    }`}>
                      {tx.amount.startsWith("+") ? (
                        <ArrowUpRight className="w-5 h-5 text-green-600" />
                      ) : (
                        <ArrowDownRight className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tx.type}</p>
                      <p className="text-sm text-gray-500">{tx.user}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.amount.startsWith("+") ? "text-green-600" : "text-gray-900"}`}>
                      {tx.amount}
                    </p>
                    <p className="text-xs text-gray-500">{tx.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
