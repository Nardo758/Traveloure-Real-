import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  BarChart3,
  Plane,
  Globe
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface AiUsageSummary {
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

interface ApiUsageSummary {
  totalCalls: number;
  totalCostCents: number;
  totalCostDollars: number;
  byProvider: Record<string, { calls: number; costCents: number }>;
  byEndpoint: Record<string, { calls: number; costCents: number }>;
  averageResponseTimeMs: number;
  successRate: number;
}

interface DailyUsage {
  date: string;
  calls: number;
  tokens?: number;
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

interface ApiUsageLog {
  id: string;
  provider: string;
  endpoint: string;
  operation: string;
  requestCount: number;
  estimatedCostCents: number;
  responseTimeMs: number;
  success: boolean;
  errorMessage: string | null;
  resultCount: number;
  createdAt: string;
}

interface AiPricingInfo {
  providers: Record<string, {
    models: Record<string, { input: number; output: number }>;
    note: string;
  }>;
  lastUpdated: string;
}

interface ApiPricingInfo {
  providers: Record<string, {
    endpoints: Record<string, number>;
    note: string;
  }>;
  lastUpdated: string;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(4)}`;
}

function formatApiCost(tenths: number): string {
  // External API costs are stored in tenths of cents
  return `$${(tenths / 1000).toFixed(4)}`;
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
  // AI Usage queries
  const { data: aiSummary, isLoading: aiSummaryLoading } = useQuery<AiUsageSummary>({
    queryKey: ["/api/admin/ai-usage/summary"],
  });

  const { data: aiDailyUsage, isLoading: aiDailyLoading } = useQuery<DailyUsage[]>({
    queryKey: ["/api/admin/ai-usage/daily"],
  });

  const { data: aiLogs, isLoading: aiLogsLoading } = useQuery<AiUsageLog[]>({
    queryKey: ["/api/admin/ai-usage/logs"],
  });

  const { data: aiPricing } = useQuery<AiPricingInfo>({
    queryKey: ["/api/admin/ai-usage/pricing"],
  });

  // External API Usage queries
  const { data: apiSummary, isLoading: apiSummaryLoading } = useQuery<ApiUsageSummary>({
    queryKey: ["/api/admin/api-usage/summary"],
  });

  const { data: apiDailyUsage, isLoading: apiDailyLoading } = useQuery<DailyUsage[]>({
    queryKey: ["/api/admin/api-usage/daily"],
  });

  const { data: apiLogs, isLoading: apiLogsLoading } = useQuery<ApiUsageLog[]>({
    queryKey: ["/api/admin/api-usage/logs"],
  });

  const { data: apiPricing } = useQuery<ApiPricingInfo>({
    queryKey: ["/api/admin/api-usage/pricing"],
  });

  const handleRefresh = () => {
    // Invalidate all usage queries
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/daily"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/pricing"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/api-usage/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/api-usage/daily"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/api-usage/logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/api-usage/pricing"] });
  };

  // AI costs are in cents, Amadeus costs are in tenths of cents
  // Convert both to tenths for accurate total, then display as dollars
  const aiCostTenths = (aiSummary?.totalCostCents || 0) * 10; // Convert cents to tenths
  const apiCostTenths = apiSummary?.totalCostCents || 0; // Already in tenths
  const totalCostTenths = aiCostTenths + apiCostTenths;
  const totalCalls = (aiSummary?.totalCalls || 0) + (apiSummary?.totalCalls || 0);

  if (aiSummaryLoading && apiSummaryLoading) {
    return (
      <AdminLayout title="API Cost Tracking">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="API Cost Tracking">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">External API Cost Tracking</h1>
            <p className="text-muted-foreground">Monitor AI and external API usage and costs</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Combined Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total-cost">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost (All APIs)</p>
                  <p className="text-2xl font-bold text-green-600">{formatApiCost(totalCostTenths)}</p>
                  <p className="text-xs text-muted-foreground">{totalCalls} total API calls</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-ai-cost">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">AI Costs</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCost(aiSummary?.totalCostCents || 0)}</p>
                  <p className="text-xs text-muted-foreground">{formatTokens(aiSummary?.totalTokens || 0)} tokens</p>
                </div>
                <Cpu className="w-8 h-8 text-blue-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-amadeus-cost">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Amadeus Costs</p>
                  <p className="text-2xl font-bold text-amber-600">{formatApiCost(apiSummary?.totalCostCents || 0)}</p>
                  <p className="text-xs text-muted-foreground">{apiSummary?.totalCalls || 0} API calls</p>
                </div>
                <Plane className="w-8 h-8 text-amber-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-success-rate">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overall Success Rate</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {Math.round(((aiSummary?.successRate || 100) + (apiSummary?.successRate || 100)) / 2)}%
                  </p>
                  <p className="text-xs text-muted-foreground">API reliability</p>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for AI vs External APIs */}
        <Tabs defaultValue="ai" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="ai" data-testid="tab-ai">
              <Cpu className="w-4 h-4 mr-2" />
              AI APIs (Grok, Claude)
            </TabsTrigger>
            <TabsTrigger value="external" data-testid="tab-external">
              <Globe className="w-4 h-4 mr-2" />
              External APIs (Amadeus)
            </TabsTrigger>
          </TabsList>

          {/* AI Tab Content */}
          <TabsContent value="ai" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card data-testid="card-ai-by-provider">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="w-5 h-5" />
                    AI Usage by Provider
                  </CardTitle>
                  <CardDescription>Cost breakdown by AI provider</CardDescription>
                </CardHeader>
                <CardContent>
                  {aiSummary?.byProvider && Object.keys(aiSummary.byProvider).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(aiSummary.byProvider).map(([provider, data]) => (
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
                    <p className="text-muted-foreground text-center py-8">No AI usage data yet</p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-ai-by-operation">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    AI Usage by Operation
                  </CardTitle>
                  <CardDescription>Cost breakdown by operation type</CardDescription>
                </CardHeader>
                <CardContent>
                  {aiSummary?.byOperation && Object.keys(aiSummary.byOperation).length > 0 ? (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {Object.entries(aiSummary.byOperation)
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
                    <p className="text-muted-foreground text-center py-8">No AI usage data yet</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-ai-logs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Recent AI API Calls
                </CardTitle>
                <CardDescription>Latest AI API requests</CardDescription>
              </CardHeader>
              <CardContent>
                {aiLogsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : aiLogs && aiLogs.length > 0 ? (
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
                      {aiLogs.slice(0, 50).map((log) => (
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
                  <p className="text-muted-foreground text-center py-8">No AI calls logged yet</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-ai-pricing">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  AI Pricing
                </CardTitle>
                <CardDescription>
                  AI API pricing rates (last updated: {aiPricing?.lastUpdated || 'N/A'})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {aiPricing?.providers ? (
                  <div className="space-y-4">
                    {Object.entries(aiPricing.providers).map(([provider, info]) => (
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
          </TabsContent>

          {/* External API Tab Content */}
          <TabsContent value="external" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card data-testid="card-api-by-provider">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    External API by Provider
                  </CardTitle>
                  <CardDescription>Cost breakdown by API provider</CardDescription>
                </CardHeader>
                <CardContent>
                  {apiSummary?.byProvider && Object.keys(apiSummary.byProvider).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(apiSummary.byProvider).map(([provider, data]) => (
                        <div key={provider} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="capitalize">{provider}</Badge>
                            <span className="text-sm text-muted-foreground">{data.calls} calls</span>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-amber-600">{formatApiCost(data.costCents)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No external API usage data yet</p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-api-by-endpoint">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Usage by Endpoint
                  </CardTitle>
                  <CardDescription>Cost breakdown by API endpoint</CardDescription>
                </CardHeader>
                <CardContent>
                  {apiSummary?.byEndpoint && Object.keys(apiSummary.byEndpoint).length > 0 ? (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {Object.entries(apiSummary.byEndpoint)
                        .sort((a, b) => b[1].costCents - a[1].costCents)
                        .map(([endpoint, data]) => (
                        <div key={endpoint} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <code className="text-xs bg-background px-2 py-1 rounded">{endpoint}</code>
                            <span className="text-sm text-muted-foreground">{data.calls} calls</span>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-amber-600">{formatApiCost(data.costCents)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No endpoint usage data yet</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-api-daily">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Daily API Usage (Last 30 Days)
                </CardTitle>
                <CardDescription>Daily Amadeus API calls and costs</CardDescription>
              </CardHeader>
              <CardContent>
                {apiDailyLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : apiDailyUsage && apiDailyUsage.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground pb-2 border-b">
                      <span>Date</span>
                      <span className="text-right">Calls</span>
                      <span className="text-right">Cost</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {apiDailyUsage.slice().reverse().map((day) => (
                        <div key={day.date} className="grid grid-cols-3 text-sm py-2 hover:bg-muted/50 rounded">
                          <span>{day.date}</span>
                          <span className="text-right">{day.calls}</span>
                          <span className="text-right font-medium text-amber-600">{formatApiCost(day.costCents)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No daily API usage data yet</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-api-logs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Recent External API Calls
                </CardTitle>
                <CardDescription>Latest Amadeus and other API requests</CardDescription>
              </CardHeader>
              <CardContent>
                {apiLogsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : apiLogs && apiLogs.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-6 text-xs font-medium text-muted-foreground pb-2 border-b">
                      <span>Time</span>
                      <span>Provider</span>
                      <span>Endpoint</span>
                      <span className="text-right">Results</span>
                      <span className="text-right">Cost</span>
                      <span className="text-right">Status</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {apiLogs.slice(0, 50).map((log) => (
                        <div key={log.id} className="grid grid-cols-6 text-sm py-2 hover:bg-muted/50 rounded items-center">
                          <span className="text-muted-foreground text-xs">{formatDate(log.createdAt as string)}</span>
                          <Badge variant="outline" className="w-fit capitalize">{log.provider}</Badge>
                          <code className="text-xs truncate">{log.endpoint}</code>
                          <span className="text-right">{log.resultCount}</span>
                          <span className="text-right font-medium text-amber-600">{formatApiCost(log.estimatedCostCents)}</span>
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
                  <p className="text-muted-foreground text-center py-8">No external API calls logged yet. Amadeus usage will appear here.</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-api-pricing">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Amadeus Pricing
                </CardTitle>
                <CardDescription>
                  External API pricing rates (last updated: {apiPricing?.lastUpdated || 'N/A'})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {apiPricing?.providers ? (
                  <div className="space-y-4">
                    {Object.entries(apiPricing.providers).map(([provider, info]) => (
                      <div key={provider} className="space-y-2">
                        <h4 className="font-semibold capitalize flex items-center gap-2">
                          {provider}
                          <span className="text-xs text-muted-foreground font-normal">({info.note})</span>
                        </h4>
                        <div className="grid grid-cols-4 gap-2">
                          {Object.entries(info.endpoints).map(([endpoint, price]) => (
                            <div key={endpoint} className="p-3 rounded-lg bg-muted/50">
                              <code className="text-xs">{endpoint}</code>
                              <div className="mt-1 text-sm">
                                <span className="text-amber-600">${(price / 1000).toFixed(4)}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">per call</p>
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
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
