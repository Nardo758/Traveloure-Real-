import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState } from "react";
import {
  Zap, Clock, Users, RefreshCw, AlertTriangle,
  Activity, TrendingUp, Database, BarChart3, DollarSign
} from "lucide-react";

const MINUTE_LIMIT = 20;
const HOUR_LIMIT = 200;

function pct(value: number, max: number) {
  return Math.min(100, Math.round((value / max) * 100));
}

function timeAgo(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function UsageBar({ value, max, warn = 80 }: { value: number; max: number; warn?: number }) {
  const p = pct(value, max);
  const color = p >= warn ? "bg-red-500" : p >= 50 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-14 text-right">{value}/{max}</span>
    </div>
  );
}

function MiniChart({ data, field }: { data: { date: string; calls: number; tokens: number; costCents: number }[]; field: "calls" | "tokens" | "costCents" }) {
  if (!data.length) return <div className="h-16 flex items-center justify-center text-xs text-gray-400">No data</div>;
  const values = data.map(d => d[field]);
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${fmtDate(d.date)}: ${d[field].toLocaleString()}`}>
          <div
            className="w-full rounded-t bg-blue-400 group-hover:bg-blue-600 transition-colors"
            style={{ height: `${Math.max(2, (d[field] / max) * 56)}px` }}
          />
        </div>
      ))}
    </div>
  );
}

interface LiveStats {
  totalUsersActive: number;
  platformCallsLastHour: number;
  platformCallsLastMinute: number;
  topUsers: { userId: string; email?: string; minuteCount: number; minuteResetAt: number; hourCount: number; hourResetAt: number; totalCount: number; lastEndpoint: string; lastRequestAt: number }[];
  usersNearLimit: { userId: string; email?: string; minuteCount: number; hourCount: number; lastEndpoint: string }[];
}

interface HistoricalStats {
  days: number;
  daily: { date: string; calls: number; tokens: number; costCents: number }[];
  topUsers: { userId: string; totalCalls: number; totalTokens: number; totalCostCents: number; providers: string[]; lastUsed: string }[];
  summary: { totalCalls: number; totalTokens: number; totalCostCents: number; totalCostDollars: number; successRate: number; averageResponseTimeMs: number };
}

export default function AdminAiUsagePage() {
  const [days, setDays] = useState("30");

  const { data: live, isLoading: liveLoading, dataUpdatedAt } = useQuery<LiveStats>({
    queryKey: ["/api/admin/ai-usage"],
    refetchInterval: 15_000,
  });

  const { data: hist, isLoading: histLoading } = useQuery<HistoricalStats>({
    queryKey: ["/api/admin/ai-usage/historical", days],
    queryFn: () => fetch(`/api/admin/ai-usage/historical?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/historical", days] });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Usage Monitor</h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time tracking + historical trends from the database
              {dataUpdatedAt ? ` · live updated ${timeAgo(dataUpdatedAt)}` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} data-testid="button-refresh-ai-usage">
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
        </div>

        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live" data-testid="tab-live-usage">
              <Activity className="w-4 h-4 mr-2" />Live
            </TabsTrigger>
            <TabsTrigger value="historical" data-testid="tab-historical-usage">
              <BarChart3 className="w-4 h-4 mr-2" />Historical
            </TabsTrigger>
          </TabsList>

          {/* ── LIVE TAB ──────────────────────────────────────── */}
          <TabsContent value="live" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg"><Users className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <p className="text-sm text-gray-500">Active Users</p>
                      <p className="text-2xl font-bold" data-testid="stat-active-users">{liveLoading ? "—" : (live?.totalUsersActive ?? 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-50 rounded-lg"><Clock className="w-5 h-5 text-purple-600" /></div>
                    <div>
                      <p className="text-sm text-gray-500">Calls This Hour</p>
                      <p className="text-2xl font-bold" data-testid="stat-calls-hour">{liveLoading ? "—" : (live?.platformCallsLastHour ?? 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 rounded-lg"><Activity className="w-5 h-5 text-emerald-600" /></div>
                    <div>
                      <p className="text-sm text-gray-500">Calls This Minute</p>
                      <p className="text-2xl font-bold" data-testid="stat-calls-minute">{liveLoading ? "—" : (live?.platformCallsLastMinute ?? 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {(live?.usersNearLimit?.length ?? 0) > 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                    <AlertTriangle className="w-4 h-4" />Near Rate Limit ({live!.usersNearLimit.length})
                  </CardTitle>
                  <CardDescription className="text-amber-700">Users at ≥80% of their per-minute or per-hour quota.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {live!.usersNearLimit.map(u => (
                      <div key={u.userId} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.email ?? u.userId}</p>
                          <p className="text-xs text-gray-400 truncate">{u.lastEndpoint}</p>
                        </div>
                        <div className="flex gap-2 ml-4 shrink-0">
                          {pct(u.minuteCount, MINUTE_LIMIT) >= 80 && <Badge variant="destructive" className="text-xs">{u.minuteCount}/{MINUTE_LIMIT} /min</Badge>}
                          {pct(u.hourCount, HOUR_LIMIT) >= 80 && <Badge className="text-xs bg-orange-500 hover:bg-orange-500">{u.hourCount}/{HOUR_LIMIT} /hr</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="w-4 h-4 text-gray-600" />Top Users — Current Session
                </CardTitle>
                <CardDescription>Per-minute cap {MINUTE_LIMIT} · Per-hour cap {HOUR_LIMIT} · Resets on restart</CardDescription>
              </CardHeader>
              <CardContent>
                {liveLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
                ) : !live?.topUsers?.length ? (
                  <div className="text-center py-10 text-gray-400">
                    <Zap className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No AI requests this session yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-12 gap-2 px-3 pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      <div className="col-span-3">User</div>
                      <div className="col-span-3">Per-minute</div>
                      <div className="col-span-3">Per-hour</div>
                      <div className="col-span-2 text-right">Total</div>
                      <div className="col-span-1 text-right">Last</div>
                    </div>
                    {live.topUsers.map((u, i) => (
                      <div key={u.userId} className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-lg hover:bg-gray-50" data-testid={`row-ai-user-${i}`}>
                        <div className="col-span-3 min-w-0">
                          <p className="text-sm font-medium truncate">{u.email ?? u.userId.slice(0, 12) + "…"}</p>
                          <p className="text-xs text-gray-400 truncate">{u.lastEndpoint}</p>
                        </div>
                        <div className="col-span-3"><UsageBar value={u.minuteCount} max={MINUTE_LIMIT} /></div>
                        <div className="col-span-3"><UsageBar value={u.hourCount} max={HOUR_LIMIT} /></div>
                        <div className="col-span-2 text-right text-sm font-semibold">{u.totalCount.toLocaleString()}</div>
                        <div className="col-span-1 text-right text-xs text-gray-400">{timeAgo(u.lastRequestAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HISTORICAL TAB ────────────────────────────────── */}
          <TabsContent value="historical" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Data from <code className="bg-gray-100 px-1 rounded text-xs">ai_usage_logs</code> database table</p>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-32" data-testid="select-days-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Calls", value: hist?.summary?.totalCalls?.toLocaleString() ?? "—", icon: Zap, color: "text-blue-600", bg: "bg-blue-50", testid: "stat-hist-calls" },
                { label: "Total Tokens", value: hist?.summary?.totalTokens ? (hist.summary.totalTokens / 1000).toFixed(1) + "K" : "—", icon: Database, color: "text-purple-600", bg: "bg-purple-50", testid: "stat-hist-tokens" },
                { label: "Est. Cost", value: hist?.summary?.totalCostDollars ? `$${hist.summary.totalCostDollars.toFixed(2)}` : "$0.00", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50", testid: "stat-hist-cost" },
                { label: "Success Rate", value: hist?.summary?.successRate != null ? `${hist.summary.successRate}%` : "—", icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50", testid: "stat-hist-success" },
              ].map(({ label, value, icon: Icon, color, bg, testid }) => (
                <Card key={label}>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1.5 ${bg} rounded`}><Icon className={`w-4 h-4 ${color}`} /></div>
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900" data-testid={testid}>{histLoading ? "—" : value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Daily chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily AI Calls — Last {days} Days</CardTitle>
              </CardHeader>
              <CardContent>
                {histLoading ? (
                  <div className="h-16 bg-gray-100 rounded animate-pulse" />
                ) : !hist?.daily?.length ? (
                  <div className="h-16 flex items-center justify-center text-sm text-gray-400">No logged AI calls in this period.</div>
                ) : (
                  <>
                    <MiniChart data={hist.daily} field="calls" />
                    <div className="flex justify-between mt-1 text-xs text-gray-400">
                      <span>{hist.daily.length > 0 ? fmtDate(hist.daily[0].date) : ""}</span>
                      <span>{hist.daily.length > 0 ? fmtDate(hist.daily[hist.daily.length - 1].date) : ""}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Top users (historical) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-600" />Top Users — Last {days} Days
                </CardTitle>
                <CardDescription>Ranked by total API calls to AI providers</CardDescription>
              </CardHeader>
              <CardContent>
                {histLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
                ) : !hist?.topUsers?.length ? (
                  <div className="text-center py-10 text-gray-400">
                    <Database className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No AI calls logged to the database in this period.</p>
                    <p className="text-xs mt-1">Calls are logged when AI services complete requests with token usage data.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-12 gap-2 px-3 pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      <div className="col-span-3">User ID</div>
                      <div className="col-span-2 text-right">Calls</div>
                      <div className="col-span-2 text-right">Tokens</div>
                      <div className="col-span-2 text-right">Cost</div>
                      <div className="col-span-2">Providers</div>
                      <div className="col-span-1 text-right">Last</div>
                    </div>
                    {hist.topUsers.map((u, i) => (
                      <div key={u.userId} className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-lg hover:bg-gray-50" data-testid={`row-hist-user-${i}`}>
                        <div className="col-span-3 min-w-0">
                          <p className="text-xs font-mono text-gray-700 truncate">{u.userId.slice(0, 16)}…</p>
                        </div>
                        <div className="col-span-2 text-right text-sm font-semibold">{u.totalCalls.toLocaleString()}</div>
                        <div className="col-span-2 text-right text-sm text-gray-600">{(u.totalTokens / 1000).toFixed(1)}K</div>
                        <div className="col-span-2 text-right text-sm text-emerald-700">${(u.totalCostCents / 100).toFixed(3)}</div>
                        <div className="col-span-2 flex flex-wrap gap-1">
                          {u.providers.map(p => (
                            <Badge key={p} variant="outline" className="text-xs px-1 py-0">{p}</Badge>
                          ))}
                        </div>
                        <div className="col-span-1 text-right text-xs text-gray-400">
                          {u.lastUsed ? timeAgo(new Date(u.lastUsed).getTime()) : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
