import { useQuery } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarCheck,
  Calendar,
  DollarSign,
  Star,
  MessageSquare,
  TrendingUp,
  Clock,
  Users,
  ChevronRight,
  Package,
  Loader2,
  AlertCircle,
  TrendingDown,
  Zap,
  CheckCircle
} from "lucide-react";
import { Link } from "wouter";
import { ProviderAvailabilityManager, ProviderBookingContextPanel } from "@/components/logistics";

interface ProviderAnalytics {
  summary: {
    totalRevenue: number;
    totalBookings: number;
    avgRating: number;
    activeServices: number;
    pendingBookings: number;
    completedBookings: number;
  };
}

interface BookingRequest {
  id: string;
  status: string;
  totalAmount: string;
  bookingDetails: any;
  traveler?: { displayName: string };
  service?: { serviceName: string; serviceType: string };
  createdAt: string;
}

export default function ProviderDashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<ProviderAnalytics>({
    queryKey: ["/api/provider/analytics/dashboard"],
  });

  const { data: bookings } = useQuery<BookingRequest[]>({
    queryKey: ["/api/provider/bookings"],
  });

  const { data: requestsData } = useQuery<{ requests: any[] }>({
    queryKey: ["/api/provider/booking-requests"],
  });

  const pendingBookings = bookings?.filter(b => b.status === "pending") || [];
  const confirmedBookings = bookings?.filter(b => b.status === "confirmed") || [];

  const stats = [
    { label: "Pending Bookings", value: String(analytics?.summary?.pendingBookings ?? 0), icon: Clock, color: "text-amber-600" },
    { label: "This Month", value: String(analytics?.summary?.totalBookings ?? 0), icon: Calendar, color: "text-blue-600" },
    { label: "Revenue (MTD)", value: `$${(analytics?.summary?.totalRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-green-600" },
    { label: "Rating Average", value: (analytics?.summary?.avgRating ?? 0).toFixed(1), icon: Star, color: "text-amber-500" },
  ];

  if (analyticsLoading) {
    return (
      <ProviderLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </ProviderLayout>
    );
  }

  return (
    <ProviderLayout title="Dashboard">
      <div className="p-6 space-y-6">
        {/* Welcome Section */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900" data-testid="text-welcome">
            Welcome back!
          </h2>
          <p className="text-gray-600 mt-1">3 bookings today • {analytics?.summary?.totalBookings || 0} this month</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Two-Panel Layout: Left 60%, Right 40% */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - 60% width */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Actions */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-messages">
                    <MessageSquare className="w-5 h-5 mb-1" />
                    <span className="text-xs">Messages</span>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-update-calendar">
                    <Calendar className="w-5 h-5 mb-1" />
                    <span className="text-xs">Calendar</span>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-my-services">
                    <Package className="w-5 h-5 mb-1" />
                    <span className="text-xs">Services</span>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-center flex-col h-auto py-3" data-testid="button-view-analytics">
                    <TrendingUp className="w-5 h-5 mb-1" />
                    <span className="text-xs">Analytics</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Today's Bookings */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5 text-green-600" />
                    <CardTitle className="text-lg">Today's Bookings</CardTitle>
                  </div>
                  <Link href="/provider/calendar">
                    <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="button-view-all-bookings">
                      View All <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {confirmedBookings.length > 0 ? confirmedBookings.slice(0, 4).map((booking) => (
                  <div
                    key={booking.id}
                    className="p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                    data-testid={`card-booking-${booking.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900">{booking.service?.serviceName || "Service"}</p>
                            <p className="text-sm text-gray-500 mt-0.5">{booking.traveler?.displayName || "Client"}</p>
                          </div>
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            Confirmed
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-gray-900 mt-2">${parseFloat(booking.totalAmount || "0").toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500 text-center py-4">No confirmed bookings today</p>
                )}
              </CardContent>
            </Card>

            {/* My Services */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-lg">My Services</CardTitle>
                  </div>
                  <Link href="/provider/services">
                    <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="button-view-all-services">
                      View All <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-900">Premium Service</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-50">Active</Badge>
                    <span className="text-sm text-gray-500">8 bookings</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-900">Standard Service</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-50">Active</Badge>
                    <span className="text-sm text-gray-500">5 bookings</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="font-medium text-gray-900">Basic Package</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-gray-50">Inactive</Badge>
                    <span className="text-sm text-gray-500">0 bookings</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-2" data-testid="button-add-service">
                  <Zap className="w-4 h-4 mr-1" /> Add New Service
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - 40% width */}
          <div className="space-y-6">
            {/* Earnings Card */}
            <Card className="border border-gray-200 bg-gradient-to-br from-green-50 to-white">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">Earnings</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">This Month</p>
                  <p className="text-3xl font-bold text-gray-900">${(analytics?.summary?.totalRevenue ?? 0).toLocaleString()}</p>
                </div>
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: "72%" }}></div>
                </div>
                <Button className="w-full bg-green-600 hover:bg-green-700" data-testid="button-request-payout">
                  Request Payout
                </Button>
              </CardContent>
            </Card>

            {/* Action Items */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <CardTitle className="text-lg">Action Items ({pendingBookings.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingBookings.length > 0 ? pendingBookings.slice(0, 3).map((request) => (
                  <div
                    key={request.id}
                    className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm"
                    data-testid={`card-action-${request.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{request.service?.serviceName || "Request"}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{request.traveler?.displayName || "Client"}</p>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0 border-amber-300 bg-amber-100">
                        {request.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" data-testid={`button-action-${request.id}`}>
                        Review
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500 text-center py-3 text-sm">No pending items</p>
                )}
              </CardContent>
            </Card>

            {/* Performance */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" />
                  <CardTitle className="text-lg">Performance</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">Rating</span>
                    <span className="font-semibold text-amber-600">{(analytics?.summary?.avgRating ?? 0).toFixed(1)}/5</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">Bookings</span>
                    <span className="font-semibold text-gray-900">{analytics?.summary?.totalBookings ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Completion</span>
                    <span className="font-semibold text-green-600">94%</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full" data-testid="button-view-performance">
                  <TrendingUp className="w-4 h-4 mr-1" /> View Details
                </Button>
              </CardContent>
            </Card>

            {/* Expert Partners */}
            <Card className="border border-gray-200 bg-gradient-to-br from-blue-50 to-white">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-lg">Expert Partners</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Active Partners</span>
                  <span className="font-semibold text-gray-900">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Referral Revenue</span>
                  <span className="font-semibold text-green-600">$2,450</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">% of Business</span>
                  <span className="font-semibold text-blue-600">28%</span>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-view-partners">
                  View All Partners
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        {/* Logistics & Availability Management */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              <CardTitle>Logistics & Availability</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="availability">
              <TabsList>
                <TabsTrigger value="availability">My Availability</TabsTrigger>
                <TabsTrigger value="booking-requests">Booking Requests</TabsTrigger>
              </TabsList>
              <TabsContent value="availability" className="mt-4">
                <ProviderAvailabilityManager />
              </TabsContent>
              <TabsContent value="booking-requests" className="mt-4">
                <ProviderBookingContextPanel />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
