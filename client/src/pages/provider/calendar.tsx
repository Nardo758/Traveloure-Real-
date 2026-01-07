import { ProviderLayout } from "@/components/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  Users,
  MapPin,
  Loader2
} from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ServiceBooking, ProviderService } from "@shared/schema";

type BookingWithService = ServiceBooking & { service?: ProviderService };

export default function ProviderCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  
  const { data: bookings, isLoading } = useQuery<BookingWithService[]>({
    queryKey: ["/api/provider/bookings"],
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const bookingsByDate = useMemo(() => {
    if (!bookings) return {};
    const map: Record<number, BookingWithService[]> = {};
    bookings.forEach((booking) => {
      const details = booking.bookingDetails as { scheduledDate?: string } | null;
      if (details?.scheduledDate) {
        const bookingDate = new Date(details.scheduledDate);
        if (bookingDate.getFullYear() === year && bookingDate.getMonth() === month) {
          const day = bookingDate.getDate();
          if (!map[day]) map[day] = [];
          map[day].push(booking);
        }
      }
    });
    return map;
  }, [bookings, year, month]);

  const getBookingsForDay = (day: number) => bookingsByDate[day] || [];
  const selectedBookings = selectedDate ? getBookingsForDay(selectedDate) : [];

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(year, month + direction, 1));
    setSelectedDate(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-100 text-green-700 border-green-200";
      case "completed": return "bg-blue-100 text-blue-700 border-blue-200";
      case "pending": return "bg-amber-100 text-amber-700 border-amber-200";
      case "cancelled": return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const upcomingBookings = useMemo(() => {
    if (!bookings) return [];
    const today = new Date();
    return bookings
      .filter((booking) => {
        const details = booking.bookingDetails as { scheduledDate?: string } | null;
        if (!details?.scheduledDate) return false;
        const bookingDate = new Date(details.scheduledDate);
        return bookingDate >= today && booking.status !== "cancelled";
      })
      .sort((a, b) => {
        const dateA = new Date((a.bookingDetails as any)?.scheduledDate || 0);
        const dateB = new Date((b.bookingDetails as any)?.scheduledDate || 0);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 6);
  }, [bookings]);

  if (isLoading) {
    return (
      <ProviderLayout title="Calendar">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
        </div>
      </ProviderLayout>
    );
  }

  return (
    <ProviderLayout title="Calendar">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Availability Calendar</h2>
            <p className="text-gray-600">View and manage your upcoming bookings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigateMonth(-1)}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <CardTitle data-testid="text-current-month">{monthName} {year}</CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigateMonth(1)}
                data-testid="button-next-month"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-7 gap-1">
                {emptyDays.map((i) => (
                  <div key={`empty-${i}`} className="h-20 bg-gray-50 dark:bg-gray-800/50 rounded-lg" />
                ))}
                {days.map((day) => {
                  const dayBookings = getBookingsForDay(day);
                  const hasBookings = dayBookings.length > 0;
                  const isSelected = selectedDate === day;
                  const hasConfirmed = dayBookings.some(b => b.status === "confirmed");
                  const hasPending = dayBookings.some(b => b.status === "pending");
                  
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(day)}
                      className={`h-20 p-1 rounded-lg border transition-colors text-left ${
                        isSelected 
                          ? "border-[#FF385C] bg-[#FF385C]/5" 
                          : hasBookings 
                            ? hasConfirmed 
                              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                              : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                            : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                      data-testid={`calendar-day-${day}`}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {day}
                      </span>
                      {hasBookings && (
                        <div className="mt-1">
                          <Badge 
                            className={`text-xs truncate max-w-full ${
                              hasConfirmed 
                                ? "bg-green-100 text-green-700 border-green-200" 
                                : "bg-amber-100 text-amber-700 border-amber-200"
                            }`}
                          >
                            {dayBookings.length} booking{dayBookings.length > 1 ? "s" : ""}
                          </Badge>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-50 border border-green-200 rounded" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Confirmed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-amber-50 border border-amber-200 rounded" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border border-gray-200 rounded" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Available</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#FF385C]" />
                {selectedDate ? `${monthName} ${selectedDate}, ${year}` : "Select a Date"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedBookings.length > 0 ? (
                <div className="space-y-3">
                  {selectedBookings.map((booking) => {
                    const details = booking.bookingDetails as { notes?: string; quantity?: number } | null;
                    return (
                      <div 
                        key={booking.id}
                        className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3" 
                        data-testid={`card-booking-${booking.id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                            {booking.service?.serviceName || "Service"}
                          </h3>
                          <Badge className={getStatusColor(booking.status || "pending")}>
                            {booking.status || "pending"}
                          </Badge>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                          {booking.service?.location && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              {booking.service.location}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Qty: {details?.quantity || 1}
                          </div>
                          {details?.notes && (
                            <p className="text-xs italic">{details.notes}</p>
                          )}
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          ${booking.totalAmount}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : selectedDate ? (
                <div className="text-center py-8" data-testid="text-no-bookings">
                  <CalendarIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">No bookings on this date</p>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p>Click on a date to see bookings</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingBookings.length > 0 ? (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => {
                  const details = booking.bookingDetails as { scheduledDate?: string } | null;
                  const date = details?.scheduledDate ? new Date(details.scheduledDate) : null;
                  return (
                    <div 
                      key={booking.id}
                      className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
                      data-testid={`row-booking-${booking.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col items-center justify-center">
                          {date && (
                            <>
                              <span className="text-xs text-gray-500">{date.toLocaleString('default', { month: 'short' })}</span>
                              <span className="font-bold text-gray-900 dark:text-gray-100">{date.getDate()}</span>
                            </>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {booking.service?.serviceName || "Service Booking"}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span>${booking.totalAmount}</span>
                            {booking.service?.location && (
                              <span>{booking.service.location}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge className={getStatusColor(booking.status || "pending")}>
                        {booking.status || "pending"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <CalendarIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No upcoming bookings</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
