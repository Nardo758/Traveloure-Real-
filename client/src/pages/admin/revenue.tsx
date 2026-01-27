import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, 
  TrendingUp, 
  ArrowUpRight,
  ArrowDownRight,
  Download,
  CreditCard,
  Users,
  Building2,
  Loader2,
  FileText
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RevenueDashboard {
  platform: {
    totalRevenue: number;
    thisMonth: number;
    lastMonth: number;
    growthPercent: number;
    bySource: Record<string, number>;
  };
  experts: {
    totalPaid: number;
    totalPending: number;
    activeExperts: number;
  };
  providers: {
    totalPaid: number;
    totalPending: number;
    activeProviders: number;
  };
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    'booking_commission': 'Service Bookings',
    'template_commission': 'Template Sales',
    'affiliate_commission': 'Affiliate Commissions',
    'tip_commission': 'Tips',
    'subscription': 'Subscriptions',
    'other': 'Other',
  };
  return labels[sourceType] || sourceType;
}

function getSourceColor(sourceType: string): string {
  const colors: Record<string, string> = {
    'booking_commission': 'bg-blue-500',
    'template_commission': 'bg-purple-500',
    'affiliate_commission': 'bg-green-500',
    'tip_commission': 'bg-amber-500',
    'subscription': 'bg-cyan-500',
    'other': 'bg-gray-500',
  };
  return colors[sourceType] || 'bg-gray-500';
}

export default function AdminRevenue() {
  const { data: dashboard, isLoading } = useQuery<RevenueDashboard>({
    queryKey: ["/api/admin/revenue/dashboard"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <AdminLayout title="Revenue">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const totalSourceRevenue = Object.values(dashboard?.platform.bySource || {}).reduce((a, b) => a + b, 0);

  return (
    <AdminLayout title="Revenue">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total-revenue">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Platform Revenue</p>
                  <p className="text-2xl font-bold">{formatCurrency(dashboard?.platform.totalRevenue || 0)}</p>
                  {(dashboard?.platform.growthPercent ?? 0) !== 0 && (
                    <div className={`flex items-center gap-1 text-sm ${(dashboard?.platform.growthPercent || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {(dashboard?.platform.growthPercent || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {dashboard?.platform.growthPercent}% vs last month
                    </div>
                  )}
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-this-month">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">This Month</p>
                  <p className="text-2xl font-bold">{formatCurrency(dashboard?.platform.thisMonth || 0)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    vs {formatCurrency(dashboard?.platform.lastMonth || 0)} last month
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">Expert Earnings</p>
                  <p className="text-2xl font-bold">{formatCurrency(dashboard?.experts.totalPaid || 0)}</p>
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">Provider Earnings</p>
                  <p className="text-2xl font-bold">{formatCurrency(dashboard?.providers.totalPaid || 0)}</p>
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

        <div className="flex flex-wrap gap-3">
          <Button data-testid="button-download-report">
            <Download className="w-4 h-4 mr-2" /> Download Report
          </Button>
          <Button variant="outline" data-testid="button-process-payouts">
            <CreditCard className="w-4 h-4 mr-2" /> Process Payouts
          </Button>
        </div>

        <Tabs defaultValue="breakdown" className="space-y-4">
          <TabsList>
            <TabsTrigger value="breakdown" data-testid="tab-breakdown">Revenue Breakdown</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">Recent Transactions</TabsTrigger>
            <TabsTrigger value="trends" data-testid="tab-trends">Daily Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="breakdown" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                  Revenue by Source
                </CardTitle>
                <CardDescription>Platform earnings breakdown by revenue stream</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(dashboard?.platform.bySource || {}).map(([source, amount]) => {
                  const percentage = totalSourceRevenue > 0 ? (amount / totalSourceRevenue) * 100 : 0;
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
                {Object.keys(dashboard?.platform.bySource || {}).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No revenue data available yet. Revenue will appear here as transactions are processed.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Recent Transactions</CardTitle>
                  <CardDescription>Latest revenue events across all sources</CardDescription>
                </div>
                <Button variant="ghost" size="sm" data-testid="button-view-all-transactions">
                  View All
                </Button>
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
                    {(dashboard?.recentTransactions || []).map((txn) => (
                      <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`}>
                        <TableCell className="text-sm">
                          {formatDate(txn.date)}
                        </TableCell>
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
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(txn.grossAmount)}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          +{formatCurrency(txn.platformFee)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(dashboard?.recentTransactions || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No transactions recorded yet. Transactions will appear here as revenue is generated.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Daily Revenue Trends
                </CardTitle>
                <CardDescription>Platform revenue over the last 14 days</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(dashboard?.dailyTrend || []).slice(-14).map((day, index) => {
                  const maxRevenue = Math.max(...(dashboard?.dailyTrend || []).map(d => d.platformRevenue), 1);
                  const percentage = (day.platformRevenue / maxRevenue) * 100;
                  return (
                    <div key={day.date} className="space-y-1" data-testid={`trend-${index}`}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{formatDate(day.date)}</span>
                        <div className="text-right">
                          <span className="font-medium">{formatCurrency(day.platformRevenue)}</span>
                        </div>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {(dashboard?.dailyTrend || []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No daily trend data available yet. Data will populate as transactions occur.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
