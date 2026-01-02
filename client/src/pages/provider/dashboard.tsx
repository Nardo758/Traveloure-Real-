import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CalendarCheck, 
  Calendar, 
  DollarSign, 
  Star, 
  MessageSquare, 
  TrendingUp, 
  Clock,
  Users,
  ChevronRight
} from "lucide-react";

const stats = [
  { label: "Pending Bookings", value: "8", icon: Clock, color: "text-amber-600" },
  { label: "This Month", value: "12", icon: Calendar, color: "text-blue-600" },
  { label: "Revenue (MTD)", value: "$45,200", icon: DollarSign, color: "text-green-600" },
  { label: "Rating Average", value: "4.9", icon: Star, color: "text-amber-500" },
];

const pendingRequests = [
  {
    id: 1,
    type: "Wedding",
    clientName: "Sarah & Mike Johnson",
    date: "September 15, 2024",
    guests: 150,
    budget: "$25,000",
    style: "Rustic elegance, outdoor ceremony",
    services: ["Venue rental (6 hours)", "Catering for 150 guests", "Bar service", "Tables, chairs, linens"],
    expertNote: "Client loves your venue! Priority request.",
    urgent: true,
  },
  {
    id: 2,
    type: "Birthday Party",
    clientName: "David Thompson",
    date: "June 5, 2024",
    guests: 60,
    budget: "$8,000",
    style: "Elegant garden party",
    services: ["Venue rental (4 hours)", "Light catering"],
    expertNote: null,
    urgent: false,
  },
];

const upcomingBookings = [
  { day: "Saturday", event: "Corporate event", guests: 100, amount: "$12,000" },
  { day: "Sunday", event: "Wedding", guests: 180, amount: "$28,000" },
  { day: "Next Friday", event: "Anniversary dinner", guests: 2, amount: "$500" },
  { day: "Next Saturday", event: "Birthday party", guests: 75, amount: "$9,500" },
];

export default function ProviderDashboard() {
  return (
    <ProviderLayout title="Dashboard">
      <div className="p-6 space-y-6">
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900" data-testid="text-welcome">
              Welcome back, Grand Estate Venue!
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
              Pending Requests ({pendingRequests.length})
            </CardTitle>
            <Button variant="ghost" size="sm" data-testid="button-view-all-pending">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingRequests.map((request) => (
              <div 
                key={request.id} 
                className="p-4 border border-gray-200 rounded-lg space-y-3"
                data-testid={`card-request-${request.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {request.urgent && (
                        <Badge variant="destructive" className="text-xs" data-testid={`badge-urgent-${request.id}`}>
                          Urgent
                        </Badge>
                      )}
                      <span className="font-semibold text-gray-900">{request.type}</span>
                      <span className="text-gray-500">-</span>
                      <span className="text-gray-700">{request.clientName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-600">
                      <span>Date: {request.date}</span>
                      <span>Guests: {request.guests}</span>
                      <span>Budget: {request.budget}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Style: {request.style}</p>
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">Requested Services:</p>
                      <ul className="text-sm text-gray-600 list-disc list-inside">
                        {request.services.map((service, idx) => (
                          <li key={idx}>{service}</li>
                        ))}
                      </ul>
                    </div>
                    {request.expertNote && (
                      <p className="text-sm text-[#FF385C] mt-2 italic">
                        Expert Note: "{request.expertNote}"
                      </p>
                    )}
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
            ))}
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
                {upcomingBookings.map((booking, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    data-testid={`row-booking-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{booking.day}: {booking.event}</p>
                        <p className="text-sm text-gray-500">{booking.guests} guests</p>
                      </div>
                    </div>
                    <span className="font-semibold text-green-600">{booking.amount}</span>
                  </div>
                ))}
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
      </div>
    </ProviderLayout>
  );
}
