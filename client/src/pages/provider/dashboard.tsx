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
  Loader2
} from "lucide-react";
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
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900" data-testid="text-welcome">
              Welcome back!
            </h2>
            <p className="text-gray-600">Manage your bookings and services</p>
          </div>
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

        {/* Pending Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              Pending Requests ({pendingBookings.length})
            </CardTitle>
            <Button variant="ghost" size="sm" data-testid="button-view-all-pending">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingBookings.length > 0 ? pendingBookings.slice(0, 3).map((request) => (
              <div
                key={request.id}
                className="p-4 border border-gray-200 rounded-lg space-y-3"
                data-testid={`card-request-${request.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{request.service?.serviceName || "Service"}</span>
                      <span className="text-gray-500">-</span>
                      <span className="text-gray-700">{request.traveler?.displayName || "Client"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-600">
                      <span>Amount: ${parseFloat(request.totalAmount || "0").toLocaleString()}</span>
                      <span>Status: {request.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" data-testid={`button-send-quote-${request.id}`}>
                    Send Quote
                  </Button>
                  <Button variant="outline" size="sm" data-testid={`button-decline-${request.id}`}>
                    Decline
                  </Button>
                  <Button variant="ghost" size="sm" data-testid={`button-request-info-${request.id}`}>
                    Request More Info
                  </Button>
                  <Button variant="ghost" size="sm" data-testid={`button-check-calendar-${request.id}`}>
                    <Calendar className="w-4 h-4 mr-1" /> Calendar
                  </Button>
                </div>
              </div>
            )) : (
              <p className="text-gray-500 text-center py-4">No pending requests</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Bookings */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-green-600" />
                Upcoming Confirmed Bookings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {confirmedBookings.length > 0 ? confirmedBookings.slice(0, 4).map((booking, index) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    data-testid={`row-booking-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{booking.service?.serviceName || "Booking"}</p>
                        <p className="text-sm text-gray-500">{booking.traveler?.displayName || "Client"}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-green-600">${parseFloat(booking.totalAmount || "0").toLocaleString()}</span>
                  </div>
                )) : (
                  <p className="text-gray-500 text-center py-4">No upcoming bookings</p>
                )}
              </div>
              <Button variant="ghost" className="w-full mt-4" data-testid="button-view-full-calendar">
                View Full Calendar
              </Button>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" data-testid="button-messages">
                <MessageSquare className="w-5 h-5" />
                <span>Messages</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" data-testid="button-update-calendar">
                <Calendar className="w-5 h-5" />
                <span>Update Calendar</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" data-testid="button-view-analytics">
                <TrendingUp className="w-5 h-5" />
                <span>View Analytics</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" data-testid="button-request-payout">
                <DollarSign className="w-5 h-5" />
                <span>Request Payout</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 col-span-2" data-testid="button-recent-reviews">
                <Star className="w-5 h-5" />
                <span>Recent Reviews</span>
              </Button>
            </CardContent>
          </Card>
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
