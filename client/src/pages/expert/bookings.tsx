import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  Clock,
  User,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Plane,
  FileCheck,
  Search,
  ThumbsUp,
  ThumbsDown,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VisaBookingMetadata {
  passportNationality?: string;
  destinationCountry?: string;
  travelStartDate?: string;
  travelEndDate?: string;
  visaType?: string;
  specialCircumstances?: string;
  visaApplicationStatus?: "pending" | "submitted" | "in_review" | "approved" | "rejected";
  visaStatusNotes?: string;
  visaStatusUpdatedAt?: string;
}

interface Booking {
  id: string;
  travelerId?: string;
  travelerName?: string;
  date?: string;
  status: string;
  notes?: string;
  bookingMetadata?: VisaBookingMetadata;
  [key: string]: any;
}

const VISA_STATUS_OPTIONS: Array<{ value: VisaBookingMetadata["visaApplicationStatus"]; label: string; icon: any; color: string }> = [
  { value: "pending", label: "Pending", icon: Clock, color: "text-yellow-600" },
  { value: "submitted", label: "Submitted to Embassy", icon: FileCheck, color: "text-blue-600" },
  { value: "in_review", label: "Under Embassy Review", icon: Search, color: "text-purple-600" },
  { value: "approved", label: "Approved", icon: ThumbsUp, color: "text-green-600" },
  { value: "rejected", label: "Rejected", icon: ThumbsDown, color: "text-red-600" },
];

function isVisaBooking(booking: Booking): boolean {
  const meta = booking.bookingMetadata;
  return !!(meta && (meta.passportNationality || meta.destinationCountry || meta.visaType || meta.visaApplicationStatus));
}

function VisaStatusBadge({ status }: { status: VisaBookingMetadata["visaApplicationStatus"] }) {
  const option = VISA_STATUS_OPTIONS.find(o => o.value === status);
  if (!option) return null;
  const Icon = option.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${option.color}`}>
      <Icon className="w-3 h-3" />
      {option.label}
    </span>
  );
}

function VisaStatusDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
}) {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>("pending");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && booking) {
      setSelectedStatus(booking.bookingMetadata?.visaApplicationStatus || "pending");
      setNotes(booking.bookingMetadata?.visaStatusNotes || "");
    }
  }, [open, booking]);

  const mutation = useMutation({
    mutationFn: ({ id, visaApplicationStatus, notes }: { id: string; visaApplicationStatus: string; notes: string }) =>
      apiRequest("PATCH", `/api/service-bookings/${id}/visa-status`, { visaApplicationStatus, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/bookings"] });
      toast({ title: "Visa status updated", description: "The traveler will see the updated status." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not update visa status. Please try again.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!booking) return;
    mutation.mutate({ id: booking.id, visaApplicationStatus: selectedStatus, notes });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle data-testid="text-visa-dialog-title">Update Visa Application Status</DialogTitle>
          <DialogDescription>
            {booking?.bookingMetadata?.passportNationality && booking?.bookingMetadata?.destinationCountry
              ? `${booking.bookingMetadata.passportNationality} → ${booking.bookingMetadata.destinationCountry} (${booking.bookingMetadata.visaType || "visa"})`
              : "Update the applicant's visa progress"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-2 block">Application Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger data-testid="select-visa-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISA_STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <SelectItem key={opt.value} value={opt.value!} data-testid={`option-visa-status-${opt.value}`}>
                      <span className={`flex items-center gap-2 ${opt.color}`}>
                        <Icon className="w-4 h-4" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="visa-notes" className="mb-2 block">Notes for traveler (optional)</Label>
            <Textarea
              id="visa-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Your appointment is on June 15th at 9am. Please bring all original documents."
              rows={3}
              data-testid="input-visa-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-visa-update">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending} data-testid="button-save-visa-status">
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Status"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpertBookings() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [visaDialogOpen, setVisaDialogOpen] = useState(false);
  const [selectedVisaBooking, setSelectedVisaBooking] = useState<Booking | null>(null);
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

  const openVisaDialog = (booking: Booking) => {
    setSelectedVisaBooking(booking);
    setVisaDialogOpen(true);
  };

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
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{booking.status}</Badge>
                        {isVisaBooking(booking) && (
                          <span className="text-xs text-[#FF385C] flex items-center gap-1">
                            <Plane className="w-3 h-3" /> Visa
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No bookings scheduled for today</p>
              )}
            </CardContent>
          </Card>

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
              {bookings && bookings.filter(isVisaBooking).length > 0 && (
                <div className="p-3 bg-[#FF385C]/5 rounded-lg text-center border border-[#FF385C]/20">
                  <p className="text-2xl font-bold text-[#FF385C]">
                    {bookings.filter(isVisaBooking).length}
                  </p>
                  <p className="text-sm text-[#7A7A72] flex items-center justify-center gap-1">
                    <Plane className="w-3 h-3" /> Visa Cases
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
              bookings.map((booking) => {
                const isVisa = isVisaBooking(booking);
                return (
                  <div
                    key={booking.id}
                    className="p-4 rounded-lg border border-gray-200 hover-elevate"
                    data-testid={`booking-${booking.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <p className="font-semibold text-gray-900">Booking</p>
                          {getStatusBadge(booking.status)}
                          {isVisa && (
                            <Badge variant="outline" className="text-[#FF385C] border-[#FF385C]/30 text-xs">
                              <Plane className="w-3 h-3 mr-1" /> Visa Application
                            </Badge>
                          )}
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
                        {isVisa && booking.bookingMetadata && (
                          <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                            {booking.bookingMetadata.passportNationality && (
                              <span className="mr-3">Passport: <strong>{booking.bookingMetadata.passportNationality}</strong></span>
                            )}
                            {booking.bookingMetadata.destinationCountry && (
                              <span className="mr-3">Destination: <strong>{booking.bookingMetadata.destinationCountry}</strong></span>
                            )}
                            {booking.bookingMetadata.visaApplicationStatus && (
                              <span className="block mt-1">
                                Visa status: <VisaStatusBadge status={booking.bookingMetadata.visaApplicationStatus} />
                              </span>
                            )}
                          </div>
                        )}
                        {booking.notes && (
                          <p className="text-sm text-gray-500 mt-2 italic">Note: {booking.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 ml-4">
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
                        {isVisa && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[#FF385C] border-[#FF385C]/30 hover:bg-[#FF385C]/5"
                            onClick={() => openVisaDialog(booking)}
                            data-testid={`button-update-visa-status-${booking.id}`}
                          >
                            <Plane className="w-3 h-3 mr-1" />
                            Visa Status
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No bookings yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Booking Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">View vendor management and detailed booking analytics from the trip logistics dashboard when managing specific trips.</p>
          </CardContent>
        </Card>
      </div>

      <VisaStatusDialog
        open={visaDialogOpen}
        onOpenChange={setVisaDialogOpen}
        booking={selectedVisaBooking}
      />
    </ExpertLayout>
  );
}
