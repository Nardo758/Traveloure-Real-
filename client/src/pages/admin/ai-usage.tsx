import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Zap, Clock, Users, RefreshCw, AlertTriangle, Activity, TrendingUp } from "lucide-react";

interface UserAiRecord {
  userId: string;
  email?: string;
  minuteCount: number;
  minuteResetAt: number;
  hourCount: number;
  hourResetAt: number;
  totalCount: number;
  lastEndpoint: string;
  lastRequestAt: number;
}

interface AiUsageStats {
  totalUsersActive: number;
  platformCallsLastHour: number;
  platformCallsLastMinute: number;
  topUsers: UserAiRecord[];
  usersNearLimit: UserAiRecord[];
}

const MINUTE_LIMIT = 20;
const HOUR_LIMIT = 200;

function pct(value: number, max: number) {
  return Math.min(100, Math.round((value / max) * 100));
}

function timeAgo(ms: number) {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function UsageBar({ value, max, warn = 80 }: { value: number; max: number; warn?: number }) {
  const percent = pct(value, max);
  const color = percent >= warn ? "bg-red-500" : percent >= 50 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-16 text-right">{value}/{max}</span>
    </div>
  );
}

export default function AdminAiUsagePage() {
  const { data, isLoading, dataUpdatedAt } = useQuery<AiUsageStats>({
    queryKey: ["/api/admin/ai-usage"],
    refetchInterval: 15_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage"] });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Usage Monitor</h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time per-user AI request tracking · auto-refreshes every 15s
              {dataUpdatedAt ? ` · updated ${timeAgo(dataUpdatedAt)}` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} data-testid="button-refresh-ai-usage">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Platform-wide stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="stat-active-users">
                    {isLoading ? "—" : (data?.totalUsersActive ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Calls This Hour</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="stat-calls-hour">
                    {isLoading ? "—" : (data?.platformCallsLastHour ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <Activity className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Calls This Minute</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="stat-calls-minute">
                    {isLoading ? "—" : (data?.platformCallsLastMinute ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users near limit */}
        {(data?.usersNearLimit?.length ?? 0) > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                <AlertTriangle className="w-4 h-4" />
                Users Near Rate Limit ({data!.usersNearLimit.length})
              </CardTitle>
              <CardDescription className="text-amber-700">
                These users have consumed ≥80% of their per-minute or per-hour quota.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data!.usersNearLimit.map((u) => (
                  <div key={u.userId} className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-100">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate" data-testid={`text-near-limit-user-${u.userId}`}>
                        {u.email ?? u.userId}
                      </p>
                      <p className="text-xs text-gray-400 truncate">Last: {u.lastEndpoint}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {pct(u.minuteCount, MINUTE_LIMIT) >= 80 && (
                        <Badge variant="destructive" className="text-xs">
                          {u.minuteCount}/{MINUTE_LIMIT} /min
                        </Badge>
                      )}
                      {pct(u.hourCount, HOUR_LIMIT) >= 80 && (
                        <Badge className="text-xs bg-orange-500 hover:bg-orange-500">
                          {u.hourCount}/{HOUR_LIMIT} /hr
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top users table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gray-600" />
              Top Users by AI Requests
            </CardTitle>
            <CardDescription>
              Per-minute limit: {MINUTE_LIMIT} · Per-hour limit: {HOUR_LIMIT} · In-memory, resets on server restart
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !data?.topUsers?.length ? (
              <div className="text-center py-12 text-gray-400">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No AI requests recorded yet this session.</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 px-3 pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <div className="col-span-3">User</div>
                  <div className="col-span-3">Per-minute (cap {MINUTE_LIMIT})</div>
                  <div className="col-span-3">Per-hour (cap {HOUR_LIMIT})</div>
                  <div className="col-span-2 text-right">Total</div>
                  <div className="col-span-1 text-right">Last seen</div>
                </div>
                {data.topUsers.map((u, idx) => (
                  <div
                    key={u.userId}
                    className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-gray-50"
                    data-testid={`row-ai-user-${idx}`}
                  >
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {u.email ?? u.userId.slice(0, 12) + "…"}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{u.lastEndpoint}</p>
                    </div>
                    <div className="col-span-3">
                      <UsageBar value={u.minuteCount} max={MINUTE_LIMIT} />
                    </div>
                    <div className="col-span-3">
                      <UsageBar value={u.hourCount} max={HOUR_LIMIT} />
                    </div>
                    <div className="col-span-2 text-right text-sm font-semibold text-gray-700">
                      {u.totalCount.toLocaleString()}
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-400">
                      {timeAgo(u.lastRequestAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
