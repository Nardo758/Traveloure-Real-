import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  CreditCard,
  Users,
  Building2,
  Loader2,
  FileText,
  Minus,
  AlertCircle,
  Globe,
  Plane,
  Ticket,
  Hotel,
  Server,
  ChevronDown,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StreamData {
  configured: boolean;
  thisMonth: number;
  lastMonth: number;
  total: number;
  currency: string;
  growthPercent?: number;
}

interface PartnerCommission {
  partner: string;
  partnerLabel: string;
  thisMonth: number;
  lastMonth: number;
  total: number;
  currency: string;
}

interface TravelpayoutsData extends StreamData {
  balance: number;
  byPartner: PartnerCommission[];
}

interface ApiCostEntry {
  provider: string;
  calls: number;
  costDollars: number;
}

interface ApiCosts {
  entries: ApiCostEntry[];
  totalCostDollars: number;
}

interface UnifiedRevenue {
  period: string;
  totalNetRevenue: number;
  stripe: StreamData;
  travelpayouts: TravelpayoutsData;
  viator: StreamData;
  fever: StreamData;
  bookingCom: StreamData;
  apiCosts: ApiCosts;
}

interface RevenueSummary {
  totalPlatformFee: number;
  totalGross: number;
  bySource: Record<string, number>;
}

interface PlatformRevenue {
  id: string;
  date: string;
  sourceType: string;
  grossAmount: number;
  platformFee: number;
  trackingNumber?: string;
}

interface ExpertStats {
  totalPaid: number;
  totalPending: number;
  activeExperts: number;
}

interface ProviderStats {
  totalPaid: number;
  totalPending: number;
  activeProviders: number;
}

interface RevenueDashboard {
  platform: {
    totalRevenue: number;
    thisMonth: number;
    lastMonth: number;
    growthPercent: number;
    bySource: Record<string, number>;
  };
  experts: ExpertStats;
  providers: ProviderStats;
  recentTransactions: Array<{
    id: string;
    date: string;
    sourceType: string;
    grossAmount: number;
    platformFee: number;
    trackingNumber?: string;
  }>;
  dailyTrend: Array<{
    date: string;
    platformRevenue: number;
    expertPayouts: number;
    providerPayouts: number;
  }>;
}

function periodToDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (period === "last_month") {
    return {
      startDate: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (period === "last_90_days") {
    return {
      startDate: fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)),
      endDate: fmt(now),
    };
  }
  return {
    startDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: fmt(now),
  };
}

function formatCurrency(amount: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    booking_commission: "Service Bookings",
    template_commission: "Template Sales",
    affiliate_commission: "Affiliate Commissions",
    tip_commission: "Tips",
    subscription: "Subscriptions",
    other: "Other",
  };
  return labels[sourceType] || sourceType;
}

function getSourceColor(sourceType: string): string {
  const colors: Record<string, string> = {
    booking_commission: "bg-blue-500",
    template_commission: "bg-purple-500",
    affiliate_commission: "bg-green-500",
    tip_commission: "bg-amber-500",
    subscription: "bg-cyan-500",
    other: "bg-gray-500",
  };
  return colors[sourceType] || "bg-gray-500";
}

function MoMBadge({ thisMonth, lastMonth }: { thisMonth: number; lastMonth: number }) {
  if (lastMonth === 0) return null;
  const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
  const up = pct >= 0;
  return (
    <div
      className={`flex items-center gap-1 text-xs font-medium mt-1 ${up ? "text-green-600" : "text-red-500"}`}
    >
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% vs last month
    </div>
  );
}

function StreamCard({
  label,
  data,
  icon: Icon,
  iconColor,
  "data-testid": testId,
}: {
  label: string;
  data: StreamData;
  icon: React.ElementType;
  iconColor: string;
  "data-testid"?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
              {!data.configured && (
                <Badge
                  variant="outline"
                  className="text-xs text-gray-400 border-gray-300 py-0"
                >
                  Not connected
                </Badge>
              )}
            </div>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(data.total)}</p>
            <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span>This mo: {formatCurrency(data.thisMonth)}</span>
              <span>Last mo: {formatCurrency(data.lastMonth)}</span>
            </div>
            <MoMBadge thisMonth={data.thisMonth} lastMonth={data.lastMonth} />
          </div>
          <div className={`p-2 rounded-lg ${iconColor.replace("text-", "bg-").replace("-6", "-50")} shrink-0`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminRevenue() {
  const [period, setPeriod] = useState<string>("this_month");

  const { startDate, endDate } = periodToDateRange(period);

  const { data: unified, isLoading: unifiedLoading } = useQuery<UnifiedRevenue>({
    queryKey: ["/api/admin/revenue/unified", period],
    queryFn: () =>
      fetch(`/api/admin/revenue/unified?period=${period}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load unified revenue");
        return r.json();
      }),
    refetchInterval: 120000,
  });

  // Period-aware revenue summary for the breakdown tab
  const { data: revenueSummary, isLoading: summaryLoading } = useQuery<RevenueSummary>({
    queryKey: ["/api/admin/revenue/summary", startDate, endDate],
    queryFn: () =>
      fetch(`/api/admin/revenue/summary?startDate=${startDate}&endDate=${endDate}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load revenue summary");
        return r.json();
      }),
    refetchInterval: 120000,
  });

  // Period-aware transactions for the transactions tab
  const { data: transactions, isLoading: txnLoading } = useQuery<PlatformRevenue[]>({
    queryKey: ["/api/admin/revenue/transactions", startDate, endDate],
    queryFn: () =>
      fetch(`/api/admin/revenue/transactions?startDate=${startDate}&endDate=${endDate}`).then(
        (r) => {
          if (!r.ok) throw new Error("Failed to load transactions");
          return r.json();
        }
      ),
    refetchInterval: 120000,
  });

  // All-time dashboard for expert/provider stats and daily trend (inherently all-time)
  const { data: dashboard, isLoading: dashboardLoading } = useQuery<RevenueDashboard>({
    queryKey: ["/api/admin/revenue/dashboard"],
    refetchInterval: 60000,
  });

  const isLoading = unifiedLoading || summaryLoading || txnLoading || dashboardLoading;

  const periodLabel =
    period === "this_month"
      ? "This Month"
      : period === "last_month"
      ? "Last Month"
      : "Last 90 Days";

  const totalSourceRevenue = Object.values(revenueSummary?.bySource || {}).reduce(
    (a, b) => a + b,
    0
  );

  if (isLoading) {
    return (
      <AdminLayout title="Revenue">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Revenue">
      <div className="p-6 space-y-6">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Unified Revenue Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              All platform revenue streams combined · {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="last_90_days">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-download-report">
                  <Download className="w-4 h-4 mr-2" /> Export <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  data-testid="export-csv"
                  onClick={() => {
                    const url = `/api/admin/revenue/unified/export?period=${period}&format=csv`;
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `traveloure-revenue-${period}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" /> Download CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="export-pdf"
                  onClick={() => {
                    const url = `/api/admin/revenue/unified/export?period=${period}&format=pdf`;
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `traveloure-revenue-${period}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" /> Download PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" data-testid="button-process-payouts">
              <CreditCard className="w-4 h-4 mr-2" /> Process Payouts
            </Button>
          </div>
        </div>

        {/* Top-level Net Revenue card */}
        <Card
          className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
          data-testid="card-total-net-revenue"
        >
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Total Net Revenue
                </p>
                <p className="text-4xl font-bold mt-1">
                  {formatCurrency(unified?.totalNetRevenue ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Stripe + all affiliate commissions − API costs · {periodLabel}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2 text-green-600">
                  <TrendingUp className="w-4 h-4" />
                  <span>
                    {formatCurrency(
                      (unified?.stripe.total ?? 0) +
                        (unified?.travelpayouts.total ?? 0) +
                        (unified?.viator.total ?? 0) +
                        (unified?.fever.total ?? 0) +
                        (unified?.bookingCom.total ?? 0)
                    )}{" "}
                    gross revenue
                  </span>
                </div>
                <div className="flex items-center gap-2 text-red-500">
                  <Minus className="w-4 h-4" />
                  <span>
                    {formatCurrency(unified?.apiCosts.totalCostDollars ?? 0)} API costs
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stream Cards */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Revenue Streams · {periodLabel}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StreamCard
              label="Stripe Direct"
              data={
                unified?.stripe ?? {
                  configured: true,
                  thisMonth: 0,
                  lastMonth: 0,
                  total: 0,
                  currency: "USD",
                }
              }
              icon={CreditCard}
              iconColor="text-purple-600"
              data-testid="card-stream-stripe"
            />
            <StreamCard
              label="Travelpayouts"
              data={
                unified?.travelpayouts ?? {
                  configured: false,
                  thisMonth: 0,
                  lastMonth: 0,
                  total: 0,
                  currency: "USD",
                }
              }
              icon={Globe}
              iconColor="text-blue-600"
              data-testid="card-stream-travelpayouts"
            />
            <StreamCard
              label="Viator Partner"
              data={
                unified?.viator ?? {
                  configured: false,
                  thisMonth: 0,
                  lastMonth: 0,
                  total: 0,
                  currency: "USD",
                }
              }
              icon={Plane}
              iconColor="text-emerald-600"
              data-testid="card-stream-viator"
            />
            <StreamCard
              label="Fever / Impact.com"
              data={
                unified?.fever ?? {
                  configured: false,
                  thisMonth: 0,
                  lastMonth: 0,
                  total: 0,
                  currency: "USD",
                }
              }
              icon={Ticket}
              iconColor="text-orange-600"
              data-testid="card-stream-fever"
            />
            <StreamCard
              label="Booking.com Affiliate"
              data={
                unified?.bookingCom ?? {
                  configured: false,
                  thisMonth: 0,
                  lastMonth: 0,
                  total: 0,
                  currency: "USD",
                }
              }
              icon={Hotel}
              iconColor="text-cyan-600"
              data-testid="card-stream-bookingcom"
            />
          </div>
        </div>

        {/* Revenue Chart — stream comparison + daily trend */}
        <Card data-testid="card-revenue-chart">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Revenue Overview · {periodLabel}
                </CardTitle>
                <CardDescription>
                  Stream comparison (this period vs last month) and daily platform revenue trend
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Stacked bar — streams this period vs last month */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Streams: This Period vs Last Month
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[
                      {
                        name: "Stripe",
                        "This Period": unified?.stripe.total ?? 0,
                        "Last Month": unified?.stripe.lastMonth ?? 0,
                      },
                      {
                        name: "Travelpayouts",
                        "This Period": unified?.travelpayouts.total ?? 0,
                        "Last Month": unified?.travelpayouts.lastMonth ?? 0,
                      },
                      {
                        name: "Viator",
                        "This Period": unified?.viator.total ?? 0,
                        "Last Month": unified?.viator.lastMonth ?? 0,
                      },
                      {
                        name: "Fever",
                        "This Period": unified?.fever.total ?? 0,
                        "Last Month": unified?.fever.lastMonth ?? 0,
                      },
                      {
                        name: "Booking.com",
                        "This Period": unified?.bookingCom.total ?? 0,
                        "Last Month": unified?.bookingCom.lastMonth ?? 0,
                      },
                    ]}
                    margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                    barCategoryGap="30%"
                    barGap={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                      width={48}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(value),
                        undefined,
                      ]}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar dataKey="This Period" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Last Month" fill="#c4b5fd" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Line chart — daily platform revenue trend */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Daily Platform Revenue Trend
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={(() => {
                      const from = new Date(startDate);
                      const to = new Date(endDate);
                      const filtered = (dashboard?.dailyTrend || []).filter((d) => {
                        const dt = new Date(d.date);
                        return dt >= from && dt <= to;
                      });
                      return filtered.map((d) => ({
                        date: new Date(d.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        }),
                        Revenue: d.platformRevenue,
                        "Expert Payouts": d.expertPayouts,
                        "Provider Payouts": d.providerPayouts,
                      }));
                    })()}
                    margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                      width={48}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(value),
                        undefined,
                      ]}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Line
                      type="monotone"
                      dataKey="Revenue"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Expert Payouts"
                      stroke="#a855f7"
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray="4 2"
                      activeDot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Provider Payouts"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray="4 2"
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                {(dashboard?.dailyTrend || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center -mt-10">
                    No daily trend data yet — data appears as revenue is generated.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Secondary stat cards — Expert & Provider totals (all-time) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total-revenue">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Platform Revenue ({periodLabel})
                  </p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(revenueSummary?.totalPlatformFee ?? 0)}
                  </p>
                  {(dashboard?.platform.growthPercent ?? 0) !== 0 && (
                    <div
                      className={`flex items-center gap-1 text-sm ${
                        (dashboard?.platform.growthPercent || 0) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {(dashboard?.platform.growthPercent || 0) >= 0 ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4" />
                      )}
                      {dashboard?.platform.growthPercent}% MoM
                    </div>
                  )}
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-gross-revenue">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Gross Bookings ({periodLabel})
                  </p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(revenueSummary?.totalGross ?? 0)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {revenueSummary?.totalGross && revenueSummary?.totalPlatformFee
                      ? `${((revenueSummary.totalPlatformFee / revenueSummary.totalGross) * 100).toFixed(1)}% take rate`
                      : "No data"}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-expert-earnings">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Expert Earnings (All Time)</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(dashboard?.experts.totalPaid || 0)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {formatCurrency(dashboard?.experts.totalPending || 0)} pending
                    </Badge>
                  </div>
                </div>
                <Users className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-provider-earnings">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Provider Earnings (All Time)</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(dashboard?.providers.totalPaid || 0)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {formatCurrency(dashboard?.providers.totalPending || 0)} pending
                    </Badge>
                  </div>
                </div>
                <Building2 className="w-8 h-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="breakdown" className="space-y-4">
          <TabsList>
            <TabsTrigger value="breakdown" data-testid="tab-breakdown">
              Revenue Breakdown
            </TabsTrigger>
            <TabsTrigger value="partners" data-testid="tab-partners">
              Commissions by Partner
            </TabsTrigger>
            <TabsTrigger value="costs" data-testid="tab-costs">
              API Costs
            </TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">
              Transactions
            </TabsTrigger>
            <TabsTrigger value="trends" data-testid="tab-trends">
              Daily Trends
            </TabsTrigger>
          </TabsList>

          {/* Revenue Breakdown tab — period-filtered via revenueSummary */}
          <TabsContent value="breakdown" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                  Revenue by Source · {periodLabel}
                </CardTitle>
                <CardDescription>
                  Platform earnings breakdown by revenue type for the selected period
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(revenueSummary?.bySource || {}).map(([source, amount]) => {
                  const percentage =
                    totalSourceRevenue > 0 ? (amount / totalSourceRevenue) * 100 : 0;
                  return (
                    <div key={source} className="space-y-2" data-testid={`source-${source}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getSourceColor(source)}`} />
                          <span className="text-sm font-medium">{getSourceLabel(source)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium">{formatCurrency(amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getSourceColor(source)} rounded-full transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(revenueSummary?.bySource || {}).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No revenue data for {periodLabel}. Data will appear here as transactions are
                    processed.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions by Partner tab */}
          <TabsContent value="partners" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-600" />
                  Travelpayouts — Commissions by Sub-Partner · {periodLabel}
                </CardTitle>
                <CardDescription>
                  Affiliate commissions across Travelpayouts network partners
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!unified?.travelpayouts.configured ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>
                      Travelpayouts not connected. Set{" "}
                      <code className="text-xs bg-muted px-1 rounded">TRAVELPAYOUTS_TOKEN</code>{" "}
                      to enable.
                    </span>
                  </div>
                ) : (unified?.travelpayouts.byPartner?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No partner commission data for {periodLabel}.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead className="text-right">This Month</TableHead>
                        <TableHead className="text-right">Last Month</TableHead>
                        <TableHead className="text-right">Total ({periodLabel})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(unified?.travelpayouts.byPartner ?? []).map((row) => (
                        <TableRow key={row.partner} data-testid={`row-partner-${row.partner}`}>
                          <TableCell className="font-medium">{row.partnerLabel}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.thisMonth)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatCurrency(row.lastMonth)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatCurrency(row.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Costs tab — period-filtered via unified endpoint */}
          <TabsContent value="costs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-gray-600" />
                  Platform API Costs · {periodLabel}
                </CardTitle>
                <CardDescription>
                  Amadeus and SerpAPI usage costs for the selected period
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(unified?.apiCosts.entries?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No API usage recorded for {periodLabel}.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">Estimated Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(unified?.apiCosts.entries ?? []).map((entry) => (
                        <TableRow
                          key={entry.provider}
                          data-testid={`row-cost-${entry.provider
                            .toLowerCase()
                            .replace(/\s/g, "-")}`}
                        >
                          <TableCell className="font-medium">{entry.provider}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {entry.calls.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-600 font-medium">
                            {formatCurrency(entry.costDollars, 4)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">
                          {(unified?.apiCosts.entries ?? [])
                            .reduce((s, e) => s + e.calls, 0)
                            .toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">
                          {formatCurrency(unified?.apiCosts.totalCostDollars ?? 0, 4)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions tab — period-filtered */}
          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Transactions · {periodLabel}</CardTitle>
                  <CardDescription>
                    Revenue events from {startDate} to {endDate}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Tracking #</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Platform Fee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(transactions || []).map((txn) => (
                      <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`}>
                        <TableCell className="text-sm">{formatDate(txn.date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getSourceLabel(txn.sourceType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {txn.trackingNumber ? (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {txn.trackingNumber}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(txn.grossAmount)}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          +{formatCurrency(txn.platformFee)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(transactions || []).length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground py-8"
                        >
                          No transactions in {periodLabel}. Transactions appear here as revenue
                          is generated.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Daily Trends tab — filtered to selected period */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Daily Revenue Trends · {periodLabel}
                </CardTitle>
                <CardDescription>
                  Platform revenue recorded each day within {startDate} – {endDate}
                  {" "}(DB tracks last 30 days; older dates will show $0)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const from = new Date(startDate);
                  const to = new Date(endDate);
                  const filtered = (dashboard?.dailyTrend || []).filter((d) => {
                    const dt = new Date(d.date);
                    return dt >= from && dt <= to;
                  });
                  if (filtered.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No daily trend data for {periodLabel}.
                      </p>
                    );
                  }
                  const maxRevenue = Math.max(...filtered.map((d) => d.platformRevenue), 1);
                  return filtered.map((day, index) => {
                    const percentage = (day.platformRevenue / maxRevenue) * 100;
                    return (
                      <div key={day.date} className="space-y-1" data-testid={`trend-${index}`}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">
                            {formatDate(day.date)}
                          </span>
                          <span className="font-medium">
                            {formatCurrency(day.platformRevenue)}
                          </span>
                        </div>
                        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
