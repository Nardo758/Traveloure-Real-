import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Filter, 
  Calendar, 
  Users, 
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare
} from "lucide-react";
import { useState } from "react";

const bookings = [
  {
    id: 1,
    eventType: "Wedding",
    clientName: "Sarah & Mike Johnson",
    date: "September 15, 2024",
    time: "2:00 PM - 10:00 PM",
    guests: 150,
    amount: "$25,000",
    status: "confirmed",
    expert: "Emily Rose",
  },
  {
    id: 2,
    eventType: "Corporate Event",
    clientName: "Tech Corp Annual Gala",
    date: "September 12, 2024",
    time: "6:00 PM - 11:00 PM",
    guests: 100,
    amount: "$12,000",
    status: "confirmed",
    expert: "David Chen",
  },
  {
    id: 3,
    eventType: "Birthday Party",
    clientName: "David Thompson",
    date: "June 5, 2024",
    time: "4:00 PM - 9:00 PM",
    guests: 60,
    amount: "$8,000",
    status: "pending",
    expert: "Maria Garcia",
  },
  {
    id: 4,
    eventType: "Anniversary Dinner",
    clientName: "Robert & Lisa Adams",
    date: "May 20, 2024",
    time: "7:00 PM - 10:00 PM",
    guests: 2,
    amount: "$500",
    status: "confirmed",
    expert: null,
  },
  {
    id: 5,
    eventType: "Wedding",
    clientName: "Jennifer & Mark Davis",
    date: "October 8, 2024",
    time: "3:00 PM - 11:00 PM",
    guests: 180,
    amount: "$28,000",
    status: "pending",
    expert: "Emily Rose",
  },
  {
    id: 6,
    eventType: "Product Launch",
    clientName: "StartupX",
    date: "April 15, 2024",
    time: "5:00 PM - 9:00 PM",
    guests: 75,
    amount: "$9,500",
    status: "completed",
    expert: "David Chen",
  },
];

const statusColors: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

export default function ProviderBookings() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredBookings = bookings.filter((booking) => {
    const matchesSearch = booking.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          booking.eventType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || booking.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: bookings.length,
    confirmed: bookings.filter(b => b.status === "confirmed").length,
    pending: bookings.filter(b => b.status === "pending").length,
    completed: bookings.filter(b => b.status === "completed").length,
  };

  return (
    <ProviderLayout title="Bookings">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Bookings</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-confirmed">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
              <p className="text-sm text-gray-500">Confirmed</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
              <p className="text-sm text-gray-500">Pending</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-completed">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.completed}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search bookings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-bookings"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant={statusFilter === null ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter(null)}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
                <Button 
                  variant={statusFilter === "confirmed" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("confirmed")}
                  data-testid="button-filter-confirmed"
                >
                  <CheckCircle className="w-4 h-4 mr-1" /> Confirmed
                </Button>
                <Button 
                  variant={statusFilter === "pending" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("pending")}
                  data-testid="button-filter-pending"
                >
                  <Clock className="w-4 h-4 mr-1" /> Pending
                </Button>
                <Button 
                  variant={statusFilter === "completed" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("completed")}
                  data-testid="button-filter-completed"
                >
                  Completed
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bookings List */}
        <Card>
          <CardHeader>
            <CardTitle>All Bookings ({filteredBookings.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredBookings.map((booking) => (
              <div 
                key={booking.id}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                data-testid={`card-booking-${booking.id}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusColors[booking.status]} data-testid={`badge-status-${booking.id}`}>
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </Badge>
                      <span className="font-semibold text-gray-900">{booking.eventType}</span>
                      <span className="text-gray-500">-</span>
                      <span className="text-gray-700">{booking.clientName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" /> {booking.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" /> {booking.time}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" /> {booking.guests} guests
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" /> {booking.amount}
                      </span>
                    </div>
                    {booking.expert && (
                      <p className="text-sm text-gray-500 mt-1">Expert: {booking.expert}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" data-testid={`button-view-${booking.id}`}>
                      View Details
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`button-message-${booking.id}`}>
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
