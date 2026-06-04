import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  TrendingUp,
  MousePointerClick,
  Eye,
  ShoppingCart,
  ArrowRight,
  BarChart3,
} from "lucide-react";

interface CrossSellFunnel {
  funnel: {
    impressions: number;
    clicks: number;
    conversions: number;
    bookings: number;
    clickThroughRate: number;
    conversionRate: number;
  };
  topSourceTypes: Array<{ sourceContentType: string; clicks: number }>;
  topServices: Array<{ serviceId: string; serviceName: string; clicks: number }>;
  cities: string[];
}

function FunnelStep({
  icon: Icon,
  label,
  value,
  rate,
  rateLabel,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  rate?: number;
  rateLabel?: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${color}`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {rate !== undefined && (
        <Badge variant="outline" className="text-xs" data-testid={`badge-rate-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          {rate}% {rateLabel}
        </Badge>
      )}
    </div>
  );
}

export default function AdminCrossSellAnalytics() {
  const [selectedCity, setSelectedCity] = useState<string>("all");

  const { data, isLoading } = useQuery<CrossSellFunnel>({
    queryKey: ["/api/admin/cross-sell/funnel", selectedCity],
    queryFn: async () => {
      const url =
        selectedCity && selectedCity !== "all"
          ? `/api/admin/cross-sell/funnel?city=${encodeURIComponent(selectedCity)}`
          : "/api/admin/cross-sell/funnel";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const cities = data?.cities ?? [];
  const funnel = data?.funnel;

  return (
    <AdminLayout title="Cross-Sell Analytics">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cross-Sell Funnel</h1>
            <p className="text-gray-500 mt-1">
              Platform-wide impression → click → booking attribution for cross-sell strips
            </p>
          </div>
          <div className="w-48" data-testid="select-city-filter">
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger>
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city ?? ""}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Funnel Steps */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>From strip impression to completed booking</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-around py-8 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-36 w-28" />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-around py-8 gap-2 flex-wrap">
                <FunnelStep
                  icon={Eye}
                  label="Impressions"
                  value={funnel?.impressions ?? 0}
                  color="bg-blue-500"
                  data-testid="funnel-impressions"
                />
                <ArrowRight className="text-gray-300 w-6 h-6 shrink-0" />
                <FunnelStep
                  icon={MousePointerClick}
                  label="Clicks"
                  value={funnel?.clicks ?? 0}
                  rate={funnel?.clickThroughRate}
                  rateLabel="CTR"
                  color="bg-violet-500"
                  data-testid="funnel-clicks"
                />
                <ArrowRight className="text-gray-300 w-6 h-6 shrink-0" />
                <FunnelStep
                  icon={TrendingUp}
                  label="Conversions"
                  value={funnel?.conversions ?? 0}
                  color="bg-amber-500"
                  data-testid="funnel-conversions"
                />
                <ArrowRight className="text-gray-300 w-6 h-6 shrink-0" />
                <FunnelStep
                  icon={ShoppingCart}
                  label="Bookings"
                  value={funnel?.bookings ?? 0}
                  rate={funnel?.conversionRate}
                  rateLabel="of clicks"
                  color="bg-green-500"
                  data-testid="funnel-bookings"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Source Content Types */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-violet-600" />
                Top Source Content Types
              </CardTitle>
              <CardDescription>Which content types drive the most cross-sell clicks</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (data?.topSourceTypes?.length ?? 0) === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">No click data yet</p>
              ) : (
                <div className="space-y-3">
                  {(data?.topSourceTypes ?? []).map((row, i) => {
                    const maxClicks = data?.topSourceTypes?.[0]?.clicks ?? 1;
                    return (
                      <div key={row.sourceContentType} className="space-y-1" data-testid={`row-source-type-${i}`}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-800 capitalize">
                            {row.sourceContentType.replace(/_/g, " ")}
                          </span>
                          <span className="text-gray-500">{row.clicks.toLocaleString()} clicks</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500 rounded-full"
                            style={{ width: `${(row.clicks / maxClicks) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Converting Services */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Top Clicked Services
              </CardTitle>
              <CardDescription>Services receiving the most cross-sell clicks</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (data?.topServices?.length ?? 0) === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">No service click data yet</p>
              ) : (
                <div className="space-y-3">
                  {(data?.topServices ?? []).map((row, i) => {
                    const maxClicks = data?.topServices?.[0]?.clicks ?? 1;
                    return (
                      <div key={row.serviceId} className="space-y-1" data-testid={`row-service-${i}`}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-800 truncate max-w-[200px]">
                            {row.serviceName}
                          </span>
                          <span className="text-gray-500">{row.clicks.toLocaleString()} clicks</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${(row.clicks / maxClicks) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary callout when no data */}
        {!isLoading && (funnel?.impressions ?? 0) === 0 && (
          <Card className="border-dashed border-gray-200">
            <CardContent className="py-12 text-center">
              <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No cross-sell events recorded yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Events are captured automatically when travellers view and click the "Users also book" strip.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
