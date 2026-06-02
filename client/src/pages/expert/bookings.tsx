import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Booking {
  id: string;
  travelerId?: string;
  travelerName?: string;
  date?: string;
  status: string;
  notes?: string;
  [key: string]: any;
}

export default function ExpertBookings() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/expert/bookings"],
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/expert/bookings/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/bookings"] });
      toast({
        title: variables.status === "confirmed" ? "Booking Accepted" : "Booking Declined",
        description:
          variables.status === "confirmed"
            ? "The booking has been confirmed."
            : "The booking has been declined.",
      });
    },
    onError: () => {
      toast({
        title: "Action Failed",
        description: "Could not update booking status. Please try again.",
        variant: "destructive",
      });
    },
  });

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
          <Button className="bg-[#FF385C] " data-testid="button-new-booking">
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
              {isLoading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </>
              ) : bookings && bookings.length > 0 ? (
                bookings.slice(0, 3).map((booking, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover-elevate"
                    data-testid={`today-event-${index}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 min-w-16">
                      <Clock className="w-4 h-4" />
                      {booking.date || "N/A"}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{booking.travelerName || "Booking"}</p>
                      <Badge variant="outline" className="text-xs mt-1">{booking.status}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No bookings scheduled for today</p>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">All Bookings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-[#F3F3EE] rounded-lg text-center" data-testid="stat-total">
                  <p className="text-2xl font-bold text-[#1A1A18]">{bookings?.length ?? 0}</p>
                  <p className="text-sm text-[#7A7A72]">Total</p>
                </div>
                <div className="p-3 bg-[#F3F3EE] rounded-lg text-center" data-testid="stat-pending">
                  <p className="text-2xl font-bold text-amber-600">
                    {bookings?.filter(b => b.status === "pending").length ?? 0}
                  </p>
                  <p className="text-sm text-[#7A7A72]">Pending</p>
                </div>
                <div className="p-3 bg-[#F3F3EE] rounded-lg text-center" data-testid="stat-confirmed">
                  <p className="text-2xl font-bold text-green-600">
                    {bookings?.filter(b => b.status === "confirmed").length ?? 0}
                  </p>
                  <p className="text-sm text-[#7A7A72]">Confirmed</p>
                </div>
                <div className="p-3 bg-[#F3F3EE] rounded-lg text-center" data-testid="stat-completed">
                  <p className="text-2xl font-bold text-blue-600">
                    {bookings?.filter(b => b.status === "completed").length ?? 0}
                  </p>
                  <p className="text-sm text-[#7A7A72]">Completed</p>
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
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </>
            ) : bookings && bookings.length > 0 ? (
              bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="p-4 rounded-lg border border-gray-200 hover-elevate"
                  data-testid={`booking-${booking.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-semibold text-gray-900">Booking</p>
                        {getStatusBadge(booking.status)}
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p className="flex items-center gap-2">
                          <User className="w-4 h-4" /> {booking.travelerName || "Traveler"}
                        </p>
                        {booking.date && (
                          <p className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" /> {booking.date}
                          </p>
                        )}
                      </div>
                      {booking.notes && (
                        <p className="text-sm text-gray-500 mt-2 italic">Note: {booking.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {booking.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: booking.id, status: "confirmed" })}
                            data-testid={`button-accept-booking-${booking.id}`}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: booking.id, status: "cancelled" })}
                            data-testid={`button-decline-booking-${booking.id}`}
                          >
                            Decline
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" data-testid={`button-edit-booking-${booking.id}`}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No bookings yet</p>
            )}
          </CardContent>
        </Card>
        {/* Booking Analytics */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Booking Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">View vendor management and detailed booking analytics from the trip logistics dashboard when managing specific trips.</p>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
