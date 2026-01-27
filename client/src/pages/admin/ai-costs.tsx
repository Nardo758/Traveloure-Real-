import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Cpu, 
  DollarSign, 
  Activity,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Zap,
  BarChart3
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostCents: number;
  totalCostDollars: number;
  byProvider: Record<string, { calls: number; tokens: number; costCents: number }>;
  byOperation: Record<string, { calls: number; tokens: number; costCents: number }>;
  byModel: Record<string, { calls: number; tokens: number; costCents: number }>;
  averageResponseTimeMs: number;
  successRate: number;
}

interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  costCents: number;
}

interface AiUsageLog {
  id: string;
  provider: string;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
  responseTimeMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

interface PricingInfo {
  providers: Record<string, {
    models: Record<string, { input: number; output: number }>;
    note: string;
  }>;
  lastUpdated: string;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function AdminAICosts() {
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<UsageSummary>({
    queryKey: ["/api/admin/ai-usage/summary"],
  });

  const { data: dailyUsage, isLoading: dailyLoading } = useQuery<DailyUsage[]>({
    queryKey: ["/api/admin/ai-usage/daily"],
  });

  const { data: logs, isLoading: logsLoading } = useQuery<AiUsageLog[]>({
    queryKey: ["/api/admin/ai-usage/logs"],
  });

  const { data: pricing } = useQuery<PricingInfo>({
    queryKey: ["/api/admin/ai-usage/pricing"],
  });

  const handleRefresh = () => {
    // Invalidate all AI usage queries
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/daily"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/pricing"] });
  };

  if (summaryLoading) {
    return (
      <AdminLayout title="AI Cost Tracking">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const statsData = [
    { 
      label: "Total Cost", 
      value: formatCost(summary?.totalCostCents || 0), 
      icon: DollarSign, 
      color: "text-green-600",
      subtext: `${summary?.totalCalls || 0} API calls`
    },
    { 
      label: "Total Tokens", 
      value: formatTokens(summary?.totalTokens || 0), 
      icon: Zap, 
      color: "text-blue-600",
      subtext: "Input + Output"
    },
    { 
      label: "Avg Response", 
      value: `${summary?.averageResponseTimeMs || 0}ms`, 
      icon: Clock, 
      color: "text-amber-600",
      subtext: "Response time"
    },
    { 
      label: "Success Rate", 
      value: `${summary?.successRate || 100}%`, 
      icon: CheckCircle, 
      color: "text-emerald-600",
      subtext: "API reliability"
    },
  ];

  return (
    <AdminLayout title="AI Cost Tracking">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">AI Cost Tracking</h1>
            <p className="text-muted-foreground">Monitor AI API usage and costs across all providers</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.subtext}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="card-usage-by-provider">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-5 h-5" />
                Usage by Provider
              </CardTitle>
              <CardDescription>Cost breakdown by AI provider</CardDescription>
            </CardHeader>
            <CardContent>
              {summary?.byProvider && Object.keys(summary.byProvider).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(summary.byProvider).map(([provider, data]) => (
                    <div key={provider} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize">{provider}</Badge>
                        <span className="text-sm text-muted-foreground">{data.calls} calls</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">{formatCost(data.costCents)}</p>
                        <p className="text-xs text-muted-foreground">{formatTokens(data.tokens)} tokens</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No usage data yet</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-usage-by-operation">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Usage by Operation
              </CardTitle>
              <CardDescription>Cost breakdown by operation type</CardDescription>
            </CardHeader>
            <CardContent>
              {summary?.byOperation && Object.keys(summary.byOperation).length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {Object.entries(summary.byOperation)
                    .sort((a, b) => b[1].costCents - a[1].costCents)
                    .map(([operation, data]) => (
                    <div key={operation} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <code className="text-xs bg-background px-2 py-1 rounded">{operation}</code>
                        <span className="text-sm text-muted-foreground">{data.calls} calls</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">{formatCost(data.costCents)}</p>
                        <p className="text-xs text-muted-foreground">{formatTokens(data.tokens)} tokens</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No usage data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-daily-usage">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Daily Usage (Last 30 Days)
            </CardTitle>
            <CardDescription>Daily API calls and costs</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : dailyUsage && dailyUsage.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground pb-2 border-b">
                  <span>Date</span>
                  <span className="text-right">Calls</span>
                  <span className="text-right">Tokens</span>
                  <span className="text-right">Cost</span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {dailyUsage.slice().reverse().map((day) => (
                    <div key={day.date} className="grid grid-cols-4 text-sm py-2 hover:bg-muted/50 rounded">
                      <span>{day.date}</span>
                      <span className="text-right">{day.calls}</span>
                      <span className="text-right">{formatTokens(day.tokens)}</span>
                      <span className="text-right font-medium text-green-600">{formatCost(day.costCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No daily usage data yet</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-logs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Recent API Calls
            </CardTitle>
            <CardDescription>Latest AI API requests</CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-6 text-xs font-medium text-muted-foreground pb-2 border-b">
                  <span>Time</span>
                  <span>Provider</span>
                  <span>Operation</span>
                  <span className="text-right">Tokens</span>
                  <span className="text-right">Cost</span>
                  <span className="text-right">Status</span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {logs.slice(0, 50).map((log) => (
                    <div key={log.id} className="grid grid-cols-6 text-sm py-2 hover:bg-muted/50 rounded items-center">
                      <span className="text-muted-foreground text-xs">{formatDate(log.createdAt)}</span>
                      <Badge variant="outline" className="w-fit capitalize">{log.provider}</Badge>
                      <code className="text-xs truncate">{log.operation}</code>
                      <span className="text-right">{formatTokens(log.totalTokens)}</span>
                      <span className="text-right font-medium text-green-600">{formatCost(log.estimatedCostCents)}</span>
                      <div className="flex justify-end">
                        {log.success ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No API calls logged yet. Usage will appear here as AI features are used.</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-pricing-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Current Pricing
            </CardTitle>
            <CardDescription>
              API pricing rates (last updated: {pricing?.lastUpdated || 'N/A'})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pricing?.providers ? (
              <div className="space-y-4">
                {Object.entries(pricing.providers).map(([provider, info]) => (
                  <div key={provider} className="space-y-2">
                    <h4 className="font-semibold capitalize flex items-center gap-2">
                      {provider}
                      <span className="text-xs text-muted-foreground font-normal">({info.note})</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(info.models).map(([model, prices]) => (
                        <div key={model} className="p-3 rounded-lg bg-muted/50">
                          <code className="text-xs">{model}</code>
                          <div className="mt-1 text-sm">
                            <span className="text-blue-600">${(prices.input / 100).toFixed(2)}</span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="text-green-600">${(prices.output / 100).toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">in / out per 1M</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Loading pricing info...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
