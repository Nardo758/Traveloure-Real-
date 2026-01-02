import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { 
  CalendarDays, 
  Clock, 
  MapPin, 
  User,
  CheckCircle,
  AlertCircle,
  ArrowRight
} from "lucide-react";
import { useState } from "react";

export default function ExpertBookings() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  const upcomingBookings = [
    {
      id: 1,
      client: "Sarah & Mike",
      event: "Restaurant Reservation",
      date: "Today",
      time: "7:00 PM",
      location: "Sushi Saito, Roppongi",
      status: "confirmed",
      notes: "Table for 2, window seat requested"
    },
    {
      id: 2,
      client: "Jennifer",
      event: "Venue Viewing",
      date: "Tomorrow",
      time: "10:00 AM",
      location: "Shangri-La Paris",
      status: "pending",
      notes: "Proposal venue tour"
    },
    {
      id: 3,
      client: "David & Emma",
      event: "Final Menu Review",
      date: "Friday",
      time: "2:00 PM",
      location: "Le Bernardin",
      status: "confirmed",
      notes: "Anniversary dinner menu tasting"
    },
  ];

  const todayEvents = [
    { time: "9:00 AM", event: "Morning briefing", type: "internal" },
    { time: "11:00 AM", event: "Sarah & Mike check-in call", type: "call" },
    { time: "2:00 PM", event: "Jennifer venue research", type: "research" },
    { time: "7:00 PM", event: "Sarah & Mike dinner reservation", type: "booking" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200"><AlertCircle className="w-3 h-3 mr-1" /> Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ExpertLayout title="Bookings">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-bookings-title">Bookings & Calendar</h1>
            <p className="text-gray-600">Manage your appointments and reservations</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-new-booking">
            <CalendarDays className="w-4 h-4 mr-2" /> New Booking
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border"
                data-testid="calendar"
              />
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Today's Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayEvents.map((event, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                  data-testid={`today-event-${index}`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600 min-w-16">
                    <Clock className="w-4 h-4" />
                    {event.time}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{event.event}</p>
                    <Badge variant="outline" className="text-xs mt-1">{event.type}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">This Week</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg text-center" data-testid="stat-appointments">
                  <p className="text-2xl font-bold text-gray-900">8</p>
                  <p className="text-sm text-gray-600">Appointments</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center" data-testid="stat-reservations">
                  <p className="text-2xl font-bold text-gray-900">12</p>
                  <p className="text-sm text-gray-600">Reservations</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center" data-testid="stat-confirmed">
                  <p className="text-2xl font-bold text-green-600">15</p>
                  <p className="text-sm text-gray-600">Confirmed</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center" data-testid="stat-pending">
                  <p className="text-2xl font-bold text-yellow-600">5</p>
                  <p className="text-sm text-gray-600">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Bookings */}
        <Card className="border border-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Upcoming Bookings</CardTitle>
              <Button variant="ghost" size="sm" className="text-[#FF385C]" data-testid="button-view-all-bookings">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingBookings.map((booking) => (
              <div 
                key={booking.id} 
                className="p-4 rounded-lg border border-gray-200 hover:bg-gray-50"
                data-testid={`booking-${booking.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-semibold text-gray-900">{booking.event}</p>
                      {getStatusBadge(booking.status)}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p className="flex items-center gap-2">
                        <User className="w-4 h-4" /> {booking.client}
                      </p>
                      <p className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" /> {booking.date} at {booking.time}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> {booking.location}
                      </p>
                    </div>
                    {booking.notes && (
                      <p className="text-sm text-gray-500 mt-2 italic">Note: {booking.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" data-testid={`button-edit-booking-${booking.id}`}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`button-cancel-booking-${booking.id}`}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
