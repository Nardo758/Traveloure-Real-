import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  MapPin,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Eye
} from "lucide-react";

const metrics = [
  { label: "Page Views", value: "245,892", change: "+18%", positive: true },
  { label: "Active Users", value: "12,450", change: "+12%", positive: true },
  { label: "Conversion Rate", value: "3.8%", change: "+0.5%", positive: true },
  { label: "Avg Session", value: "4m 32s", change: "-8%", positive: false },
];

const topDestinations = [
  { name: "Paris, France", bookings: 342, revenue: "$156,000" },
  { name: "Tokyo, Japan", bookings: 287, revenue: "$128,500" },
  { name: "New York, USA", bookings: 256, revenue: "$115,200" },
  { name: "Bali, Indonesia", bookings: 198, revenue: "$89,100" },
  { name: "Barcelona, Spain", bookings: 176, revenue: "$79,200" },
];

const userDemographics = [
  { segment: "Age 25-34", percentage: 38 },
  { segment: "Age 35-44", percentage: 28 },
  { segment: "Age 45-54", percentage: 18 },
  { segment: "Age 18-24", percentage: 10 },
  { segment: "Age 55+", percentage: 6 },
];

const trafficSources = [
  { source: "Organic Search", visits: 85420, percentage: 42 },
  { source: "Direct", visits: 52340, percentage: 26 },
  { source: "Social Media", visits: 34210, percentage: 17 },
  { source: "Referral", visits: 20180, percentage: 10 },
  { source: "Paid Ads", visits: 10120, percentage: 5 },
];

const weeklyActivity = [
  { day: "Mon", users: 1850 },
  { day: "Tue", users: 2100 },
  { day: "Wed", users: 1950 },
  { day: "Thu", users: 2300 },
  { day: "Fri", users: 2150 },
  { day: "Sat", users: 1420 },
  { day: "Sun", users: 1280 },
];

export default function AdminAnalytics() {
  const maxUsers = Math.max(...weeklyActivity.map(d => d.users));
  const maxVisits = Math.max(...trafficSources.map(s => s.visits));

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
                {weeklyActivity.map((day, index) => (
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

          {/* Traffic Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-green-600" />
                Traffic Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {trafficSources.map((source, index) => (
                <div key={source.source} className="space-y-1" data-testid={`row-traffic-${index}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{source.source}</span>
                    <div>
                      <span className="font-medium">{source.visits.toLocaleString()}</span>
                      <span className="text-gray-500 ml-1">({source.percentage}%)</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${source.percentage}%` }}
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
      </div>
    </AdminLayout>
  );
}
