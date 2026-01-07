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
  ArrowDownRight,
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ServiceBooking, ProviderService } from "@shared/schema";

type BookingWithService = ServiceBooking & { service?: ProviderService };

export default function ProviderEarnings() {
  const { data: bookings, isLoading } = useQuery<BookingWithService[]>({
    queryKey: ["/api/provider/bookings"],
  });

  const stats = useMemo(() => {
    if (!bookings) return { total: 0, thisMonth: 0, pending: 0, available: 0 };
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    let total = 0;
    let monthly = 0;
    let pending = 0;
    let available = 0;
    
    bookings.forEach((b) => {
      const earnings = parseFloat(b.providerEarnings || "0");
      const bookingDate = b.createdAt ? new Date(b.createdAt) : new Date();
      
      if (b.status === "completed") {
        total += earnings;
        available += earnings;
        if (bookingDate.getMonth() === thisMonth && bookingDate.getFullYear() === thisYear) {
          monthly += earnings;
        }
      } else if (b.status === "confirmed" || b.status === "pending") {
        pending += earnings;
      }
    });
    
    return { total, thisMonth: monthly, pending, available };
  }, [bookings]);

  const transactions = useMemo(() => {
    if (!bookings) return [];
    return bookings
      .filter((b) => b.status === "completed" || b.status === "confirmed")
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10)
      .map((b) => ({
        id: b.id,
        type: "payment" as const,
        description: b.service?.serviceName || "Service Booking",
        date: b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
        amount: `+$${parseFloat(b.providerEarnings || "0").toFixed(2)}`,
        status: b.status === "completed" ? "completed" : "pending",
      }));
  }, [bookings]);

  const monthlyEarnings = useMemo(() => {
    if (!bookings) return [];
    
    const monthData: { key: string; label: string; amount: number }[] = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('default', { month: 'short' });
      monthData.push({ key, label, amount: 0 });
    }
    
    bookings.forEach((b) => {
      if (b.status === "completed" && b.createdAt) {
        const date = new Date(b.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthEntry = monthData.find(m => m.key === key);
        if (monthEntry) {
          monthEntry.amount += parseFloat(b.providerEarnings || "0");
        }
      }
    });
    
    return monthData.map(({ label, amount }) => ({ month: label, amount }));
  }, [bookings]);

  const maxEarning = Math.max(...monthlyEarnings.map(m => m.amount), 1);

  if (isLoading) {
    return (
      <ProviderLayout title="Earnings">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
        </div>
      </ProviderLayout>
    );
  }

  const statsData = [
    { label: "Total Earnings", value: `$${stats.total.toFixed(2)}`, icon: DollarSign, color: "text-green-600" },
    { label: "This Month", value: `$${stats.thisMonth.toFixed(2)}`, icon: TrendingUp, color: "text-blue-600" },
    { label: "Pending", value: `$${stats.pending.toFixed(2)}`, icon: Clock, color: "text-amber-600" },
    { label: "Available", value: `$${stats.available.toFixed(2)}`, icon: CheckCircle, color: "text-green-600" },
  ];

  return (
    <ProviderLayout title="Earnings">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button data-testid="button-request-payout">
            <DollarSign className="w-4 h-4 mr-2" /> Request Payout
          </Button>
          <Button variant="outline" data-testid="button-download-statement">
            <Download className="w-4 h-4 mr-2" /> Download Statement
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Monthly Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyEarnings.length > 0 ? (
                <div className="space-y-3">
                  {monthlyEarnings.map((month) => (
                    <div key={month.month} className="space-y-1" data-testid={`chart-bar-${month.month.toLowerCase()}`}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{month.month}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">${month.amount.toFixed(2)}</span>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#FF385C] rounded-full transition-all"
                          style={{ width: `${(month.amount / maxEarning) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No earnings data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Payout Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800" data-testid="card-available-balance">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-400">Available Balance</p>
                    <p className="text-xl font-bold text-green-800 dark:text-green-300">${stats.available.toFixed(2)}</p>
                  </div>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800" data-testid="card-pending-balance">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-700 dark:text-amber-400">Pending Earnings</p>
                    <p className="text-xl font-bold text-amber-800 dark:text-amber-300">${stats.pending.toFixed(2)}</p>
                  </div>
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">Clears after service completion</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div 
                    key={tx.id}
                    className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
                    data-testid={`row-transaction-${tx.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100 dark:bg-green-900/30">
                        <ArrowUpRight className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{tx.description}</p>
                        <p className="text-sm text-gray-500">{tx.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{tx.amount}</p>
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
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <DollarSign className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No transactions yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
