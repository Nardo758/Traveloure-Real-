import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Calendar,
  Clock,
  Users,
  MapPin,
  Loader2,
  Edit2,
  Trash2
} from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ServiceBooking, ProviderService } from "@shared/schema";

type BookingWithService = ServiceBooking & { service?: ProviderService };

interface ScheduleRule {
  day: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

interface BlackoutDate {
  id: string;
  startDate: string;
  endDate: string;
  reason: "Personal" | "Vehicle Maintenance" | "Family" | "Holiday" | "Other";
}

export default function ProviderCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [scheduleRules, setScheduleRules] = useState<ScheduleRule[]>([
    { day: "Monday", startTime: "06:00", endTime: "22:00", active: true },
    { day: "Tuesday", startTime: "06:00", endTime: "22:00", active: true },
    { day: "Wednesday", startTime: "06:00", endTime: "22:00", active: true },
    { day: "Thursday", startTime: "06:00", endTime: "22:00", active: true },
    { day: "Friday", startTime: "06:00", endTime: "22:00", active: true },
    { day: "Saturday", startTime: "08:00", endTime: "20:00", active: true },
    { day: "Sunday", startTime: "08:00", endTime: "20:00", active: false },
  ]);
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([
    { id: "1", startDate: "2024-04-15", endDate: "2024-04-17", reason: "Holiday" },
  ]);
  const [newBlackoutStart, setNewBlackoutStart] = useState("");
  const [newBlackoutEnd, setNewBlackoutEnd] = useState("");
  const [newBlackoutReason, setNewBlackoutReason] = useState<"Personal" | "Vehicle Maintenance" | "Family" | "Holiday" | "Other">("Personal");

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

  const updateScheduleRule = (dayIndex: number, field: keyof ScheduleRule, value: any) => {
    const updated = [...scheduleRules];
    updated[dayIndex] = { ...updated[dayIndex], [field]: value };
    setScheduleRules(updated);
  };

  const addBlackoutDate = () => {
    if (newBlackoutStart && newBlackoutEnd) {
      const newId = (Math.max(...blackoutDates.map(b => parseInt(b.id)), 0) + 1).toString();
      setBlackoutDates([
        ...blackoutDates,
        { id: newId, startDate: newBlackoutStart, endDate: newBlackoutEnd, reason: newBlackoutReason }
      ]);
      setNewBlackoutStart("");
      setNewBlackoutEnd("");
      setNewBlackoutReason("Personal");
    }
  };

  const deleteBlackoutDate = (id: string) => {
    setBlackoutDates(blackoutDates.filter(b => b.id !== id));
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <Button
                size="sm"
                variant={viewMode === "month" ? "default" : "ghost"}
                onClick={() => setViewMode("month")}
                className="text-sm"
              >
                Month
              </Button>
              <Button
                size="sm"
                variant={viewMode === "week" ? "default" : "ghost"}
                onClick={() => setViewMode("week")}
                className="text-sm"
              >
                Week
              </Button>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="text-sm">
                  <Edit2 className="w-4 h-4 mr-2" /> Edit Schedule
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Edit Weekly Schedule</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-6">
                  {scheduleRules.map((rule, idx) => (
                    <div key={rule.day} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium">{rule.day}</Label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rule.active}
                            onChange={(e) => updateScheduleRule(idx, "active", e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-600">Active</span>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-gray-600">Start</Label>
                          <Input
                            type="time"
                            value={rule.startTime}
                            onChange={(e) => updateScheduleRule(idx, "startTime", e.target.value)}
                            disabled={!rule.active}
                            className="text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-gray-600">End</Label>
                          <Input
                            type="time"
                            value={rule.endTime}
                            onChange={(e) => updateScheduleRule(idx, "endTime", e.target.value)}
                            disabled={!rule.active}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90 mt-6">
                    Save Schedule
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="text-sm">
                  <Calendar className="w-4 h-4 mr-2" /> Block Dates
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Block Dates</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-6">
                  <div>
                    <Label htmlFor="block-start">Start Date</Label>
                    <Input
                      id="block-start"
                      type="date"
                      value={newBlackoutStart}
                      onChange={(e) => setNewBlackoutStart(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="block-end">End Date</Label>
                    <Input
                      id="block-end"
                      type="date"
                      value={newBlackoutEnd}
                      onChange={(e) => setNewBlackoutEnd(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="block-reason">Reason</Label>
                    <Select value={newBlackoutReason} onValueChange={(val: any) => setNewBlackoutReason(val)}>
                      <SelectTrigger id="block-reason" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Personal">Personal</SelectItem>
                        <SelectItem value="Vehicle Maintenance">Vehicle Maintenance</SelectItem>
                        <SelectItem value="Family">Family</SelectItem>
                        <SelectItem value="Holiday">Holiday</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addBlackoutDate} className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90">
                    Add Blocked Period
                  </Button>
                  <div className="space-y-2 mt-6">
                    <Label className="font-semibold">Current Blackouts</Label>
                    {blackoutDates.map((blackout) => (
                      <div key={blackout.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                        <div className="text-sm">
                          <p className="font-medium text-gray-900">{blackout.startDate} to {blackout.endDate}</p>
                          <p className="text-xs text-gray-600">{blackout.reason}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteBlackoutDate(blackout.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {viewMode === "week" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateMonth(-1)}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <CardTitle>Week of {currentDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateMonth(1)}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 gap-1">
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, dayIdx) => (
                    <div key={day} className="min-w-max">
                      <div className="text-center text-sm font-semibold text-gray-900 py-2 px-2 border-b border-gray-200">
                        {day.slice(0, 3)}
                      </div>
                      <div className="space-y-1">
                        {Array.from({ length: 17 }, (_, i) => {
                          const hour = 6 + i;
                          const hourStr = hour.toString().padStart(2, "0");
                          const activeRule = scheduleRules.find((r, idx) => dayIdx === idx);
                          const isActive = activeRule?.active ?? true;
                          const isAvailable =
                            isActive &&
                            hourStr >= (activeRule?.startTime.split(":")[0] || "06") &&
                            hourStr < (activeRule?.endTime.split(":")[0] || "22");

                          return (
                            <div
                              key={`${day}-${hourStr}`}
                              className={`h-8 px-1 text-xs flex items-center justify-center rounded border ${
                                isAvailable
                                  ? "bg-green-50 border-green-200 text-green-700 font-medium"
                                  : "bg-gray-100 border-gray-200 text-gray-600"
                              }`}
                            >
                              {hourStr}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {viewMode === "month" && (
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
        )}

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
