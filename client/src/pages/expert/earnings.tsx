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
  Download
} from "lucide-react";

export default function ExpertEarnings() {
  const stats = [
    { label: "Total Earnings", value: "$12,450", change: "+15%", trend: "up", icon: DollarSign },
    { label: "This Month", value: "$4,850", change: "+8%", trend: "up", icon: Calendar },
    { label: "Pending Payout", value: "$2,100", icon: Clock },
    { label: "Last Payout", value: "$3,500", date: "Dec 28", icon: CreditCard },
  ];

  const recentTransactions = [
    { id: 1, client: "Sarah & Mike", service: "Tokyo Trip Planning", amount: 850, status: "completed", date: "Dec 30" },
    { id: 2, client: "Jennifer", service: "Proposal Planning", amount: 650, status: "pending", date: "Dec 28" },
    { id: 3, client: "David & Emma", service: "Anniversary Dinner", amount: 300, status: "completed", date: "Dec 25" },
    { id: 4, client: "Corporate Tech Inc", service: "Team Retreat", amount: 1200, status: "completed", date: "Dec 20" },
    { id: 5, client: "Amanda", service: "Birthday Celebration", amount: 200, status: "pending", date: "Dec 18" },
  ];

  const payoutHistory = [
    { id: 1, amount: 3500, method: "Bank Transfer", date: "Dec 28, 2025", status: "completed" },
    { id: 2, amount: 2800, method: "Bank Transfer", date: "Nov 28, 2025", status: "completed" },
    { id: 3, amount: 4100, method: "Bank Transfer", date: "Oct 28, 2025", status: "completed" },
  ];

  const monthlyBreakdown = [
    { month: "December", earnings: 4850, clients: 8 },
    { month: "November", earnings: 3200, clients: 6 },
    { month: "October", earnings: 4100, clients: 9 },
    { month: "September", earnings: 2800, clients: 5 },
  ];

  return (
    <ExpertLayout title="Earnings">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Earnings Dashboard</h1>
            <p className="text-gray-600">Track your revenue and manage payouts</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-request-payout">
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
                    {stat.change && (
                      <p className={`text-sm flex items-center gap-1 ${stat.trend === "up" ? "text-green-600" : "text-red-600"}`}>
                        {stat.trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {stat.change} from last month
                      </p>
                    )}
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
                  {recentTransactions.map((transaction) => (
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
                          <p className="font-medium text-gray-900">{transaction.client}</p>
                          <p className="text-sm text-gray-500">{transaction.service}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">+${transaction.amount}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{transaction.date}</span>
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
                  ))}
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
                  {monthlyBreakdown.map((month, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50" data-testid={`monthly-breakdown-${index}`}>
                      <div>
                        <p className="font-medium text-gray-900">{month.month}</p>
                        <p className="text-sm text-gray-500">{month.clients} clients</p>
                      </div>
                      <p className="font-semibold text-gray-900">${month.earnings.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Payout History */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Payout History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {payoutHistory.map((payout) => (
                    <div 
                      key={payout.id} 
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100"
                      data-testid={`payout-${payout.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">${payout.amount.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">{payout.date}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" data-testid={`button-download-${payout.id}`}>
                        <Download className="w-4 h-4 text-gray-500" />
                      </Button>
                    </div>
                  ))}
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
                    <p className="text-sm text-gray-500">**** **** **** 4829</p>
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
