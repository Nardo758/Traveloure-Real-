import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  Users,
  MapPin,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Eye,
  Loader2,
  AlertCircle,
  Flame,
  MousePointerClick,
  PlusCircle,
  Activity,
} from "lucide-react";
import { useState } from "react";

interface AnalyticsData {
  metrics: Array<{ label: string; value: string; change: string; positive: boolean }>;
  topDestinations: Array<{ name: string; bookings: number; revenue: string }>;
  userDemographics: Array<{ segment: string; percentage: number }>;
  weeklyActivity: Array<{ day: string; users: number }>;
}

interface ImpressionFunnelRow {
  content_type: string;
  city: string | null;
  impressions: number;
  unique_sessions: number;
}

interface ImpressionFunnelData {
  impressionsByType: ImpressionFunnelRow[];
  attributedClicks: Array<{ content_type: string; city: string | null; attributed_clicks: number }>;
  attributedAdds: Array<{ content_type: string; city: string | null; itinerary_adds: number }>;
  summary: {
    totalImpressions: number;
    totalAttributedClicks: number;
    totalAttributedAdds: number;
  };
}

interface DemandSignalRow {
  offeringTypeKey: string;
  city: string;
  country: string | null;
  requestCount: number;
  firstRequestAt: string;
  lastRequestAt: string;
}

interface DemandSignalsData {
  rows: DemandSignalRow[];
  summary: {
    totalRequests: number;
    uniqueCities: number;
    uniqueOfferingTypes: number;
  };
}

function formatOfferingType(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminAnalytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics/overview"],
  });

  const [cityFilter, setCityFilter] = useState("");
  const [offeringTypeFilter, setOfferingTypeFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("30");

  const [funnelDays, setFunnelDays] = useState("30");
  const [funnelCity, setFunnelCity] = useState("");
  const [funnelType, setFunnelType] = useState("");

  const funnelParams = new URLSearchParams({ days: funnelDays });
  if (funnelCity.trim()) funnelParams.set("city", funnelCity.trim());
  if (funnelType.trim()) funnelParams.set("contentType", funnelType.trim());

  const { data: funnelData, isLoading: funnelLoading } = useQuery<ImpressionFunnelData>({
    queryKey: ["/api/admin/content/impression-funnel", funnelDays, funnelCity, funnelType],
    queryFn: () =>
      fetch(`/api/admin/content/impression-funnel?${funnelParams.toString()}`).then((r) => r.json()),
  });

  const demandParams = new URLSearchParams();
  if (cityFilter.trim()) demandParams.set("city", cityFilter.trim());
  if (offeringTypeFilter.trim()) demandParams.set("offeringType", offeringTypeFilter.trim());
  demandParams.set("days", daysFilter);

  const { data: demandData, isLoading: demandLoading } = useQuery<DemandSignalsData>({
    queryKey: ["/api/admin/demand-signals", cityFilter, offeringTypeFilter, daysFilter],
    queryFn: () =>
      fetch(`/api/admin/demand-signals?${demandParams.toString()}`).then((r) => r.json()),
  });

  const metrics = analytics?.metrics ?? [];
  const topDestinations = analytics?.topDestinations ?? [];
  const userDemographics = analytics?.userDemographics ?? [];
  const weeklyActivity = analytics?.weeklyActivity ?? [];

  const maxUsers = Math.max(...weeklyActivity.map(d => d.users), 1);

  if (isLoading) {
    return (
      <AdminLayout title="Analytics">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Analytics">
      <div className="p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <Card key={metric.label} data-testid={`card-metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{metric.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                    <div className={`flex items-center gap-1 text-sm ${metric.positive ? "text-green-600" : "text-red-600"}`}>
                      {metric.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {metric.change}
                    </div>
                  </div>
                  <BarChart3 className="w-8 h-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button data-testid="button-export-data">
            <Download className="w-4 h-4 mr-2" /> Export Data
          </Button>
          <Button variant="outline" data-testid="button-custom-report">
            Custom Report
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Weekly Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between h-48 gap-2">
                {weeklyActivity.map((day) => (
                  <div key={day.day} className="flex flex-col items-center flex-1" data-testid={`chart-bar-${day.day.toLowerCase()}`}>
                    <div
                      className="w-full bg-blue-500 rounded-t-md transition-all"
                      style={{ height: `${(day.users / maxUsers) * 150}px` }}
                    />
                    <span className="text-xs text-gray-500 mt-2">{day.day}</span>
                    <span className="text-xs font-medium">{day.users.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* User Demographics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                User Demographics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {userDemographics.map((demo, index) => (
                <div key={demo.segment} className="space-y-1" data-testid={`row-demographic-${index}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{demo.segment}</span>
                    <span className="font-medium">{demo.percentage}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${demo.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Destinations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#FF385C]" />
                Top Destinations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topDestinations.map((dest, index) => (
                  <div
                    key={dest.name}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    data-testid={`row-destination-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">{dest.name}</p>
                        <p className="text-sm text-gray-500">{dest.bookings} bookings</p>
                      </div>
                    </div>
                    <span className="font-semibold text-green-600">{dest.revenue}</span>
                  </div>
                ))}
                {topDestinations.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No destination data yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Platform Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-green-600" />
                Platform Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.map((metric, index) => (
                <div key={metric.label} className="space-y-1" data-testid={`row-traffic-${index}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{metric.label}</span>
                    <span className="font-medium">{metric.value}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── Traveler Demand Signals ── */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                Traveler Demand Signals
                <Badge variant="secondary" className="ml-1 text-xs font-normal">
                  Supply Gap Intelligence
                </Badge>
              </CardTitle>
              {demandData && (
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span data-testid="demand-summary-requests">
                    <span className="font-semibold text-gray-900">{demandData.summary.totalRequests}</span> requests
                  </span>
                  <span data-testid="demand-summary-cities">
                    <span className="font-semibold text-gray-900">{demandData.summary.uniqueCities}</span> cities
                  </span>
                  <span data-testid="demand-summary-types">
                    <span className="font-semibold text-gray-900">{demandData.summary.uniqueOfferingTypes}</span> offering types
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">City</label>
                <Input
                  placeholder="Filter by city…"
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="h-8 w-44 text-sm"
                  data-testid="input-demand-city-filter"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">Offering type</label>
                <Input
                  placeholder="Filter by type…"
                  value={offeringTypeFilter}
                  onChange={(e) => setOfferingTypeFilter(e.target.value)}
                  className="h-8 w-44 text-sm"
                  data-testid="input-demand-type-filter"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">Date range</label>
                <Select value={daysFilter} onValueChange={setDaysFilter}>
                  <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-demand-days-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="365">Last 365 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            {demandLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !demandData?.rows?.length ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400" data-testid="demand-empty-state">
                <AlertCircle className="w-8 h-8" />
                <p className="text-sm">No demand signals recorded yet.</p>
                <p className="text-xs text-gray-400">They'll appear here once travelers click "Request this" on offering cards.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-demand-signals">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Offering Type</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">City</th>
                      <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Requests</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">First Seen</th>
                      <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Last Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandData.rows.map((row, index) => (
                      <tr
                        key={`${row.offeringTypeKey}-${row.city}-${index}`}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        data-testid={`row-demand-${index}`}
                      >
                        <td className="py-2.5 pr-4 text-gray-400 font-medium">{index + 1}</td>
                        <td className="py-2.5 pr-4">
                          <span className="font-medium text-gray-900">
                            {formatOfferingType(row.offeringTypeKey)}
                          </span>
                          <span className="ml-2 text-xs text-gray-400 font-mono hidden lg:inline">
                            {row.offeringTypeKey}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-700">{row.city}</span>
                            {row.country && (
                              <span className="text-gray-400 text-xs">{row.country}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <Badge
                            variant={row.requestCount >= 10 ? "default" : row.requestCount >= 5 ? "secondary" : "outline"}
                            className={`font-semibold tabular-nums ${
                              row.requestCount >= 10
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : row.requestCount >= 5
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "text-gray-600"
                            }`}
                            data-testid={`badge-demand-count-${index}`}
                          >
                            {row.requestCount}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-400 text-xs hidden md:table-cell">
                          {new Date(row.firstRequestAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                        <td className="py-2.5 text-gray-400 text-xs hidden md:table-cell">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {timeAgo(row.lastRequestAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Discover Impression Funnel ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-500" />
              Discover Impression Funnel
              <Badge variant="secondary" className="ml-1 text-xs font-normal">
                Impression → Click → Add
              </Badge>
            </CardTitle>
            {funnelData && (
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span data-testid="funnel-summary-impressions">
                  <span className="font-semibold text-gray-900">{funnelData.summary.totalImpressions.toLocaleString()}</span> views
                </span>
                <span data-testid="funnel-summary-clicks">
                  <span className="font-semibold text-gray-900">{funnelData.summary.totalAttributedClicks.toLocaleString()}</span> clicks
                </span>
                <span data-testid="funnel-summary-adds">
                  <span className="font-semibold text-gray-900">{funnelData.summary.totalAttributedAdds.toLocaleString()}</span> adds
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">City</label>
              <Input
                placeholder="Filter by city…"
                value={funnelCity}
                onChange={(e) => setFunnelCity(e.target.value)}
                className="h-8 w-44 text-sm"
                data-testid="input-funnel-city-filter"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Content type</label>
              <Input
                placeholder="gem, event, …"
                value={funnelType}
                onChange={(e) => setFunnelType(e.target.value)}
                className="h-8 w-40 text-sm"
                data-testid="input-funnel-type-filter"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Date range</label>
              <Select value={funnelDays} onValueChange={setFunnelDays}>
                <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-funnel-days-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last 365 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Funnel summary bars */}
          {funnelLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : !funnelData || funnelData.summary.totalImpressions === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400" data-testid="funnel-empty-state">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm">No impression data yet.</p>
              <p className="text-xs">Cards on the Discover feed fire impressions when scrolled into view.</p>
            </div>
          ) : (
            <>
              {/* Top-level funnel bar chart */}
              <div className="grid grid-cols-3 gap-4" data-testid="funnel-summary-bars">
                {[
                  {
                    label: "Impressions",
                    value: funnelData.summary.totalImpressions,
                    icon: Eye,
                    color: "bg-violet-500",
                    pct: 100,
                  },
                  {
                    label: "Attributed Clicks",
                    value: funnelData.summary.totalAttributedClicks,
                    icon: MousePointerClick,
                    color: "bg-blue-500",
                    pct: funnelData.summary.totalImpressions
                      ? Math.round((funnelData.summary.totalAttributedClicks / funnelData.summary.totalImpressions) * 100)
                      : 0,
                  },
                  {
                    label: "Itinerary Adds",
                    value: funnelData.summary.totalAttributedAdds,
                    icon: PlusCircle,
                    color: "bg-green-500",
                    pct: funnelData.summary.totalImpressions
                      ? Math.round((funnelData.summary.totalAttributedAdds / funnelData.summary.totalImpressions) * 100)
                      : 0,
                  },
                ].map((step) => (
                  <div key={step.label} className="space-y-2" data-testid={`funnel-step-${step.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <step.icon className="w-4 h-4 text-gray-500" />
                      {step.label}
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{step.value.toLocaleString()}</p>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${step.color} rounded-full transition-all`} style={{ width: `${step.pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400">{step.pct}% of impressions</p>
                  </div>
                ))}
              </div>

              {/* Breakdown by content type */}
              {funnelData.impressionsByType.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-funnel-breakdown">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                        <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">City</th>
                        <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Impressions</th>
                        <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnelData.impressionsByType.slice(0, 20).map((row, i) => (
                        <tr
                          key={`${row.content_type}-${row.city}-${i}`}
                          className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                          data-testid={`row-funnel-${i}`}
                        >
                          <td className="py-2.5 pr-4">
                            <Badge variant="outline" className="text-xs font-medium capitalize">
                              {row.content_type}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-gray-600 hidden md:table-cell">
                            {row.city ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                {row.city}
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-gray-900">
                            {Number(row.impressions).toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-gray-500 hidden sm:table-cell">
                            {Number(row.unique_sessions).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}
