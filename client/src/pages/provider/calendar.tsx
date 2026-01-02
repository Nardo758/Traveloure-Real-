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
  Plus
} from "lucide-react";
import { useState } from "react";

const events = [
  { id: 1, date: 12, title: "Corporate Event", time: "6 PM - 11 PM", guests: 100, status: "confirmed" },
  { id: 2, date: 13, title: "Wedding - Johnson", time: "2 PM - 10 PM", guests: 150, status: "confirmed" },
  { id: 3, date: 15, title: "Birthday Party", time: "4 PM - 9 PM", guests: 60, status: "pending" },
  { id: 4, date: 18, title: "Anniversary Dinner", time: "7 PM - 10 PM", guests: 2, status: "confirmed" },
  { id: 5, date: 20, title: "Product Launch", time: "5 PM - 9 PM", guests: 75, status: "confirmed" },
  { id: 6, date: 25, title: "Wedding - Davis", time: "3 PM - 11 PM", guests: 180, status: "pending" },
];

const blockedDates = [8, 9, 22, 23];

export default function ProviderCalendar() {
  const [currentMonth] = useState("January 2026");
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  
  const daysInMonth = 31;
  const firstDayOffset = 3; // Wednesday
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOffset }, (_, i) => i);

  const getEventForDay = (day: number) => events.find(e => e.date === day);
  const isBlocked = (day: number) => blockedDates.includes(day);

  const selectedEvent = selectedDate ? getEventForDay(selectedDate) : null;

  return (
    <ProviderLayout title="Calendar">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Availability Calendar</h2>
            <p className="text-gray-600">Manage your venue availability and bookings</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" data-testid="button-block-dates">
              Block Dates
            </Button>
            <Button data-testid="button-add-event">
              <Plus className="w-4 h-4 mr-2" /> Add Event
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <Button variant="ghost" size="icon" data-testid="button-prev-month">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <CardTitle data-testid="text-current-month">{currentMonth}</CardTitle>
              <Button variant="ghost" size="icon" data-testid="button-next-month">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {emptyDays.map((i) => (
                  <div key={`empty-${i}`} className="h-20 bg-gray-50 rounded-lg" />
                ))}
                {days.map((day) => {
                  const event = getEventForDay(day);
                  const blocked = isBlocked(day);
                  const isSelected = selectedDate === day;
                  
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(day)}
                      className={`h-20 p-1 rounded-lg border transition-colors text-left ${
                        isSelected 
                          ? "border-[#FF385C] bg-[#FF385C]/5" 
                          : blocked 
                            ? "bg-gray-100 border-gray-200" 
                            : event 
                              ? "bg-green-50 border-green-200" 
                              : "bg-white border-gray-200 hover:bg-gray-50"
                      }`}
                      data-testid={`calendar-day-${day}`}
                    >
                      <span className={`text-sm font-medium ${blocked ? "text-gray-400" : "text-gray-900"}`}>
                        {day}
                      </span>
                      {event && (
                        <div className="mt-1">
                          <Badge 
                            className={`text-xs truncate max-w-full ${
                              event.status === "confirmed" 
                                ? "bg-green-100 text-green-700 border-green-200" 
                                : "bg-amber-100 text-amber-700 border-amber-200"
                            }`}
                          >
                            {event.title.length > 10 ? event.title.slice(0, 10) + "..." : event.title}
                          </Badge>
                        </div>
                      )}
                      {blocked && (
                        <Badge variant="outline" className="text-xs mt-1">Blocked</Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-50 border border-green-200 rounded" />
                  <span className="text-sm text-gray-600">Confirmed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-amber-50 border border-amber-200 rounded" />
                  <span className="text-sm text-gray-600">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded" />
                  <span className="text-sm text-gray-600">Blocked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border border-gray-200 rounded" />
                  <span className="text-sm text-gray-600">Available</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#FF385C]" />
                {selectedDate ? `January ${selectedDate}, 2026` : "Select a Date"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEvent ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg space-y-3" data-testid="card-selected-event">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">{selectedEvent.title}</h3>
                      <Badge 
                        className={selectedEvent.status === "confirmed" 
                          ? "bg-green-100 text-green-700 border-green-200" 
                          : "bg-amber-100 text-amber-700 border-amber-200"
                        }
                      >
                        {selectedEvent.status}
                      </Badge>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {selectedEvent.time}
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {selectedEvent.guests} guests
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" data-testid="button-view-booking">View Booking</Button>
                      <Button variant="outline" size="sm" data-testid="button-contact-client">Contact</Button>
                    </div>
                  </div>
                </div>
              ) : selectedDate && isBlocked(selectedDate) ? (
                <div className="text-center py-8" data-testid="text-blocked-date">
                  <p className="text-gray-500">This date is blocked</p>
                  <Button variant="outline" className="mt-4" data-testid="button-unblock-date">
                    Unblock Date
                  </Button>
                </div>
              ) : selectedDate ? (
                <div className="text-center py-8" data-testid="text-available-date">
                  <p className="text-gray-500 mb-4">This date is available</p>
                  <div className="space-y-2">
                    <Button className="w-full" data-testid="button-add-event-date">
                      <Plus className="w-4 h-4 mr-2" /> Add Event
                    </Button>
                    <Button variant="outline" className="w-full" data-testid="button-block-date">
                      Block This Date
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Click on a date to see details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Events List */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {events.map((event) => (
                <div 
                  key={event.id}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                  data-testid={`row-event-${event.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex flex-col items-center justify-center">
                      <span className="text-xs text-gray-500">Jan</span>
                      <span className="font-bold text-gray-900">{event.date}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{event.title}</p>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>{event.time}</span>
                        <span>{event.guests} guests</span>
                      </div>
                    </div>
                  </div>
                  <Badge 
                    className={event.status === "confirmed" 
                      ? "bg-green-100 text-green-700 border-green-200" 
                      : "bg-amber-100 text-amber-700 border-amber-200"
                    }
                  >
                    {event.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
