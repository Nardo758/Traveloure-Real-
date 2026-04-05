import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Star,
  Building2,
  UserCheck
} from "lucide-react";

interface AnalyticsData {
  metrics: Array<{ label: string; value: string; change: string; positive: boolean }>;
  topDestinations: Array<{ name: string; bookings: number; revenue: string }>;
  userDemographics: Array<{ segment: string; percentage: number }>;
  weeklyActivity: Array<{ day: string; users: number }>;
}

interface CountryAnalytics {
  expertsByCountry: Array<{ country: string; total: number; approved: number; pending: number }>;
  providersByCountry: Array<{ country: string; total: number; approved: number; pending: number }>;
  tripsByDestination: Array<{ destination: string; count: number }>;
  bookingsSummary: { total: number; completed: number; pending: number; cancelled: number };
}

interface ExpertAnalytics {
  byCountry: Array<{ country: string; total: number; approved: number }>;
  byCity: Array<{ city: string; country: string; count: number }>;
  statusSummary: { total: number; pending: number; approved: number; rejected: number };
  byExperience: Array<{ years: string; count: number }>;
}

interface ProviderAnalytics {
  byBusinessType: Array<{ type: string; total: number; approved: number }>;
  byCountry: Array<{ country: string; total: number; approved: number }>;
  statusSummary: { total: number; pending: number; approved: number; rejected: number };
  activeServicesCount: number;
  topProviders: Array<{ serviceName: string; bookings: number; revenue: string; rating: string }>;
}

export default function AdminAnalytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics/overview"],
  });

  const { data: countryAnalytics } = useQuery<CountryAnalytics>({
    queryKey: ["/api/admin/analytics/by-country"],
  });

  const { data: expertAnalytics } = useQuery<ExpertAnalytics>({
    queryKey: ["/api/admin/analytics/experts"],
  });

  const { data: providerAnalytics } = useQuery<ProviderAnalytics>({
    queryKey: ["/api/admin/analytics/providers"],
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

        {/* Market Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#FF385C]" />
              Market Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Market</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Active Users</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Bookings</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Revenue</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {countryAnalytics?.tripsByDestination?.slice(0, 5).map((market, index) => (
                    <tr key={index} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 px-2 font-medium text-gray-900">{market.destination}</td>
                      <td className="py-2 px-2 text-gray-600">{countryAnalytics.expertsByCountry?.find(e => e.country === market.destination)?.approved || 0}</td>
                      <td className="py-2 px-2 text-gray-600">{market.count}</td>
                      <td className="py-2 px-2 text-gray-600">—</td>
                      <td className="py-2 px-2 text-right text-green-600 font-medium">+5.2%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top Experts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-purple-600" />
              Top Experts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Expert Name</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Market</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Clients Served</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Revenue</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {expertAnalytics?.byCity?.slice(0, 10).map((expert, index) => (
                    <tr key={index} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 px-2 font-medium text-gray-900">Expert #{index + 1}</td>
                      <td className="py-2 px-2 text-gray-600">{expert.city}, {expert.country}</td>
                      <td className="py-2 px-2 text-gray-600">{expert.count}</td>
                      <td className="py-2 px-2 text-gray-600">—</td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="font-medium">4.8</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top Providers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-green-600" />
              Top Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Provider Name</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Market</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Bookings Fulfilled</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Revenue</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {providerAnalytics?.topProviders?.slice(0, 10).map((provider, index) => (
                    <tr key={index} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 px-2 font-medium text-gray-900">{provider.serviceName}</td>
                      <td className="py-2 px-2 text-gray-600">—</td>
                      <td className="py-2 px-2 text-gray-600">{provider.bookings}</td>
                      <td className="py-2 px-2 text-gray-600">{provider.revenue}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="font-medium">{provider.rating}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
