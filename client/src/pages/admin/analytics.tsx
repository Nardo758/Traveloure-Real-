import { AdminLayout } from "@/components/admin-layout";
import { FunnelChart } from "@/components/admin/FunnelChart";
import { AdminTabNav } from "@/components/admin/AdminTabNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  Loader2
} from "lucide-react";

type Preset = "7d" | "30d" | "90d" | "custom" | "all";

/** Format a Date as YYYY-MM-DD using the browser's local calendar (not UTC). */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetDates(preset: Preset): { from: string; to: string } {
  const today = new Date();
  // "to" is today's local calendar date; the server will treat it as inclusive
  // (advancing to start-of-next-day internally).
  const to = localIsoDate(today);
  if (preset === "7d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6); // today + 6 prior days = 7 inclusive days
    return { from: localIsoDate(from), to };
  }
  if (preset === "30d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: localIsoDate(from), to };
  }
  if (preset === "90d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 89);
    return { from: localIsoDate(from), to };
  }
  return { from: "", to: "" };
}

interface AnalyticsData {
  metrics: Array<{ label: string; value: string; change: string; positive: boolean }>;
  topDestinations: Array<{ name: string; bookings: number; revenue: string }>;
  userDemographics: Array<{ segment: string; percentage: number }>;
  weeklyActivity: Array<{ day: string; users: number }>;
}

export default function AdminAnalytics() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics/overview"],
  });

  function getExportRange(): { from: string; to: string } {
    if (preset === "custom") return { from: customFrom, to: customTo };
    if (preset === "all") return { from: "", to: "" };
    return presetDates(preset);
  }

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      setCustomFrom("");
      setCustomTo("");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { from, to } = getExportRange();
      const params = new URLSearchParams({ format: "csv" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const r = await fetch(`/api/admin/analytics/export?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Export failed: ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Analytics CSV downloaded." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

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
        <AdminTabNav tabs={[{ label: "Overview", href: "/admin/analytics" }, { label: "Tourism", href: "/admin/tourism-analytics" }]} />
        {/* Conversion funnel drop-off (relocated from Dashboard) */}
        <FunnelChart />

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

        {/* Export date-range picker + actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-4 h-4 text-gray-500" />
              Export Date Range
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preset buttons */}
            <div className="flex flex-wrap gap-2" data-testid="export-range-presets">
              {(["all", "7d", "30d", "90d", "custom"] as Preset[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={preset === p ? "default" : "outline"}
                  data-testid={`preset-${p}`}
                  onClick={() => applyPreset(p)}
                >
                  {p === "all" ? "All time" : p === "7d" ? "Last 7 days" : p === "30d" ? "Last 30 days" : p === "90d" ? "Last 90 days" : "Custom range"}
                </Button>
              ))}
            </div>

            {/* Custom date inputs — visible only when "Custom range" is selected */}
            {preset === "custom" && (
              <div className="flex flex-wrap gap-4 items-end" data-testid="custom-date-inputs">
                <div className="space-y-1">
                  <Label htmlFor="export-from">From</Label>
                  <Input
                    id="export-from"
                    data-testid="input-export-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="export-to">To</Label>
                  <Input
                    id="export-to"
                    data-testid="input-export-to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-44"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-1">
              <Button data-testid="button-export-data" onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Export Data
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" disabled data-testid="button-custom-report">
                      Custom Report
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Custom reporting coming soon</TooltipContent>
              </Tooltip>
            </div>
          </CardContent>
        </Card>

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
                <MapPin className="w-5 h-5 text-primary" />
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

          {/* Empty placeholder for layout balance */}
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
      </div>
    </AdminLayout>
  );
}
