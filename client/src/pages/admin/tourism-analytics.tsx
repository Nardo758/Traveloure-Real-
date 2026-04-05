import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  MapPin,
  TrendingUp,
  Globe,
  DollarSign,
  Users,
  Calendar,
  Download,
  RefreshCw,
  Plane,
  Sun,
  Loader2,
} from "lucide-react";

interface DestinationDemand {
  destination: string;
  searches: number;
  totalBudget: number;
  avgBudget: number;
}

interface BookingTrend {
  month: string;
  bookings: number;
  revenue: number;
}

interface SourceMarket {
  country: string;
  travelers: number;
}

interface SpendingPattern {
  destination: string;
  avgSpend: number;
  minSpend: number;
  maxSpend: number;
  trips: number;
}

interface PartyComposition {
  type: string;
  count: number;
  color: string;
}

interface SeasonalityData {
  month: string;
  monthNum: number;
  bookings: number;
  avgBudget: number;
}

interface EventType {
  type: string;
  count: number;
}

interface TourismAnalyticsData {
  destinationDemand: DestinationDemand[];
  bookingTrends: BookingTrend[];
  sourceMarkets: SourceMarket[];
  userGrowth: { month: string; users: number }[];
  spendingPatterns: SpendingPattern[];
  partyComposition: PartyComposition[];
  seasonality: SeasonalityData[];
  eventTypes: EventType[];
  summary: {
    totalTrips: number;
    totalBookings: number;
    completedBookings: number;
    totalRevenue: number;
    avgTripDuration: number;
    avgPartySize: number;
  };
  generatedAt: string;
}

const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7c43", "#a4de6c", "#d0ed57", "#83a6ed", "#8dd1e1"];

export default function TourismAnalytics() {
  const { data, isLoading, refetch, isRefetching } = useQuery<TourismAnalyticsData>({
    queryKey: ["/api/admin/analytics/tourism"],
  });

  if (isLoading) {
    return (
      <AdminLayout title="Tourism Analytics">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  const {
    destinationDemand = [],
    bookingTrends = [],
    sourceMarkets = [],
    spendingPatterns = [],
    partyComposition = [],
    seasonality = [],
    eventTypes = [],
    summary = {
      totalTrips: 0,
      totalBookings: 0,
      completedBookings: 0,
      totalRevenue: 0,
      avgTripDuration: 0,
      avgPartySize: 0,
    },
  } = data || {};

  // Calculate max values for heatmap scaling
  const maxSearches = Math.max(...destinationDemand.map(d => d.searches), 1);

  // Get heat color based on intensity
  const getHeatColor = (value: number, max: number) => {
    const intensity = value / max;
    if (intensity > 0.8) return "bg-red-500";
    if (intensity > 0.6) return "bg-orange-500";
    if (intensity > 0.4) return "bg-yellow-500";
    if (intensity > 0.2) return "bg-green-400";
    return "bg-green-200";
  };

  return (
    <AdminLayout title="Tourism Analytics">
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tourism Analytics Dashboard</h2>
            <p className="text-gray-500">Comprehensive insights into travel patterns and demand</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button>
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Plane className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Trips</p>
                  <p className="text-xl font-bold">{summary.totalTrips.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Bookings</p>
                  <p className="text-xl font-bold">{summary.totalBookings.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Revenue</p>
                  <p className="text-xl font-bold">${summary.totalRevenue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100">
                  <Calendar className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Avg Duration</p>
                  <p className="text-xl font-bold">{summary.avgTripDuration} days</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pink-100">
                  <Users className="w-5 h-5 text-pink-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Avg Party Size</p>
                  <p className="text-xl font-bold">{summary.avgPartySize}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-100">
                  <Sun className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Completed</p>
                  <p className="text-xl font-bold">{summary.completedBookings.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 1: Destination Demand Heatmap + Booking Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Destination Demand Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-red-500" />
                Destination Demand Heatmap
              </CardTitle>
              <CardDescription>Most searched and booked destinations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {destinationDemand.length > 0 ? (
                  destinationDemand.slice(0, 10).map((dest, index) => (
                    <div key={dest.destination} className="flex items-center gap-3">
                      <span className="w-6 text-sm text-gray-500">{index + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm truncate max-w-[150px]">{dest.destination}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {dest.searches} trips
                            </Badge>
                            <span className="text-xs text-gray-500">
                              avg ${dest.avgBudget.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getHeatColor(dest.searches, maxSearches)}`}
                            style={{ width: `${(dest.searches / maxSearches) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-8">No destination data available</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Booking Trends Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Booking Trends
              </CardTitle>
              <CardDescription>Bookings and revenue over time</CardDescription>
            </CardHeader>
            <CardContent>
              {bookingTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={bookingTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'revenue' ? `$${value.toLocaleString()}` : value,
                        name === 'revenue' ? 'Revenue' : 'Bookings'
                      ]}
                    />
                    <Legend />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="bookings" 
                      stroke="#8884d8" 
                      fill="#8884d8" 
                      fillOpacity={0.3}
                      name="Bookings"
                    />
                    <Area 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#82ca9d" 
                      fill="#82ca9d" 
                      fillOpacity={0.3}
                      name="Revenue"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500">
                  No booking trend data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Source Markets + Spending Patterns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Source Markets */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-green-500" />
                Source Markets
              </CardTitle>
              <CardDescription>Where travelers come from</CardDescription>
            </CardHeader>
            <CardContent>
              {sourceMarkets.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sourceMarkets} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="country" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip />
                    <Bar dataKey="travelers" fill="#10b981" radius={[0, 4, 4, 0]}>
                      {sourceMarkets.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500">
                  No source market data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Spending Patterns */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-purple-500" />
                Spending Patterns by Destination
              </CardTitle>
              <CardDescription>Average spend per trip by destination</CardDescription>
            </CardHeader>
            <CardContent>
              {spendingPatterns.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={spendingPatterns.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="destination" 
                      tick={{ fontSize: 10 }} 
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Avg Spend']}
                    />
                    <Bar dataKey="avgSpend" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Avg Spend">
                      {spendingPatterns.slice(0, 8).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500">
                  No spending data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Party Composition + Seasonality */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Party Composition Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-500" />
                Party Composition
              </CardTitle>
              <CardDescription>Breakdown of traveler groups</CardDescription>
            </CardHeader>
            <CardContent>
              {partyComposition.some(p => p.count > 0) ? (
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={partyComposition.filter(p => p.count > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="count"
                        nameKey="type"
                        label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
                      >
                        {partyComposition.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [value, 'Trips']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500">
                  No party composition data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seasonality Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-500" />
                Seasonality
              </CardTitle>
              <CardDescription>Bookings by month</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={seasonality}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="bookings" fill="#f97316" radius={[4, 4, 0, 0]} name="Bookings">
                    {seasonality.map((entry, index) => {
                      // Highlight peak seasons
                      const isPeak = entry.bookings >= Math.max(...seasonality.map(s => s.bookings)) * 0.8;
                      return <Cell key={`cell-${index}`} fill={isPeak ? "#ef4444" : "#f97316"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Row 4: Event Types + Additional Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Event Types */}
          <Card>
            <CardHeader>
              <CardTitle>Trip Event Types</CardTitle>
              <CardDescription>Distribution of trip purposes</CardDescription>
            </CardHeader>
            <CardContent>
              {eventTypes.length > 0 ? (
                <div className="space-y-3">
                  {eventTypes.slice(0, 8).map((event, index) => {
                    const total = eventTypes.reduce((sum, e) => sum + e.count, 0);
                    const percentage = total > 0 ? (event.count / total) * 100 : 0;
                    return (
                      <div key={event.type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="capitalize font-medium">{event.type || 'vacation'}</span>
                          <span className="text-gray-500">{event.count} trips ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: COLORS[index % COLORS.length]
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">No event type data available</p>
              )}
            </CardContent>
          </Card>

          {/* Top Spending Destinations Table */}
          <Card>
            <CardHeader>
              <CardTitle>Top Spending Destinations</CardTitle>
              <CardDescription>Highest average spend per trip</CardDescription>
            </CardHeader>
            <CardContent>
              {spendingPatterns.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 text-xs font-medium text-gray-500 pb-2 border-b">
                    <span>Destination</span>
                    <span className="text-right">Avg Spend</span>
                    <span className="text-right">Range</span>
                    <span className="text-right">Trips</span>
                  </div>
                  {spendingPatterns.slice(0, 8).map((pattern) => (
                    <div key={pattern.destination} className="grid grid-cols-4 text-sm py-2 border-b border-gray-50">
                      <span className="font-medium truncate">{pattern.destination}</span>
                      <span className="text-right text-green-600 font-semibold">
                        ${pattern.avgSpend.toLocaleString()}
                      </span>
                      <span className="text-right text-gray-500 text-xs">
                        ${pattern.minSpend.toLocaleString()} - ${pattern.maxSpend.toLocaleString()}
                      </span>
                      <span className="text-right">{pattern.trips}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">No spending data available</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
