import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  Calendar,
  Download,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

const stats = [
  { label: "Total Earnings", value: "$125,450", change: "+12%", positive: true },
  { label: "This Month", value: "$45,200", change: "+8%", positive: true },
  { label: "Pending", value: "$12,500", change: null, positive: null },
  { label: "Available to Withdraw", value: "$32,700", change: null, positive: null },
];

const transactions = [
  {
    id: 1,
    type: "payment",
    description: "Wedding - Sarah & Mike Johnson",
    date: "Jan 2, 2026",
    amount: "+$25,000",
    status: "completed",
  },
  {
    id: 2,
    type: "payment",
    description: "Corporate Event - Tech Corp",
    date: "Dec 28, 2025",
    amount: "+$12,000",
    status: "completed",
  },
  {
    id: 3,
    type: "payout",
    description: "Bank Transfer - Chase ****1234",
    date: "Dec 25, 2025",
    amount: "-$30,000",
    status: "completed",
  },
  {
    id: 4,
    type: "payment",
    description: "Anniversary Dinner - Robert Adams",
    date: "Dec 20, 2025",
    amount: "+$500",
    status: "completed",
  },
  {
    id: 5,
    type: "payment",
    description: "Birthday Party - David Thompson",
    date: "Dec 15, 2025",
    amount: "+$8,000",
    status: "pending",
  },
  {
    id: 6,
    type: "refund",
    description: "Partial Refund - Cancelled Event",
    date: "Dec 10, 2025",
    amount: "-$2,500",
    status: "completed",
  },
];

const monthlyEarnings = [
  { month: "Jan", amount: 45200 },
  { month: "Dec", amount: 42500 },
  { month: "Nov", amount: 38000 },
  { month: "Oct", amount: 52000 },
  { month: "Sep", amount: 48000 },
  { month: "Aug", amount: 35000 },
];

export default function ProviderEarnings() {
  const maxEarning = Math.max(...monthlyEarnings.map(m => m.amount));

  return (
    <ProviderLayout title="Earnings">
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
          <Button data-testid="button-request-payout">
            <DollarSign className="w-4 h-4 mr-2" /> Request Payout
          </Button>
          <Button variant="outline" data-testid="button-download-statement">
            <Download className="w-4 h-4 mr-2" /> Download Statement
          </Button>
          <Button variant="outline" data-testid="button-view-tax-docs">
            View Tax Documents
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Earnings Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Monthly Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {monthlyEarnings.map((month, index) => (
                  <div key={month.month} className="space-y-1" data-testid={`chart-bar-${month.month.toLowerCase()}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{month.month}</span>
                      <span className="font-medium text-gray-900">${month.amount.toLocaleString()}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#FF385C] rounded-full transition-all"
                        style={{ width: `${(month.amount / maxEarning) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payout Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Payout Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200" data-testid="card-next-payout">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700">Next Scheduled Payout</p>
                    <p className="text-xl font-bold text-green-800">$32,700</p>
                  </div>
                  <Clock className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm text-green-600 mt-2">Processing on January 5, 2026</p>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-gray-900">Payout Method</p>
                <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Chase Bank</p>
                    <p className="text-sm text-gray-500">Account ending in ****1234</p>
                  </div>
                  <Button variant="ghost" size="sm" data-testid="button-change-payout">
                    Change
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-gray-900">Payout Frequency</p>
                <p className="text-gray-600">Weekly (Every Friday)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Transaction History</CardTitle>
            <Button variant="ghost" size="sm" data-testid="button-view-all-transactions">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div 
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                  data-testid={`row-transaction-${tx.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === "payment" ? "bg-green-100" : tx.type === "payout" ? "bg-blue-100" : "bg-red-100"
                    }`}>
                      {tx.type === "payment" ? (
                        <ArrowUpRight className="w-5 h-5 text-green-600" />
                      ) : tx.type === "payout" ? (
                        <ArrowDownRight className="w-5 h-5 text-blue-600" />
                      ) : (
                        <ArrowDownRight className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tx.description}</p>
                      <p className="text-sm text-gray-500">{tx.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.amount.startsWith("+") ? "text-green-600" : "text-gray-900"}`}>
                      {tx.amount}
                    </p>
                    <Badge 
                      className={tx.status === "completed" 
                        ? "bg-green-100 text-green-700 border-green-200" 
                        : "bg-amber-100 text-amber-700 border-amber-200"
                      }
                    >
                      {tx.status === "completed" ? <CheckCircle className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
