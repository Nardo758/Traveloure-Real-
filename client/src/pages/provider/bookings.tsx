import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Search,
  Filter,
  Calendar,
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  FileCheck,
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
  eventType?: string;
  clientName?: string;
  date?: string;
  time?: string;
  guests?: number;
  amount?: string | number;
  status: string;
  expert?: string;
  bookingMetadata?: VisaBookingMetadata;
  [key: string]: any;
}

const statusColors: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 border-green-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

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
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
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

export default function ProviderBookings() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [visaDialogOpen, setVisaDialogOpen] = useState(false);
  const [selectedVisaBooking, setSelectedVisaBooking] = useState<Booking | null>(null);

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/provider/bookings"],
  });

  // Accept (confirmed) / decline (cancelled) a pending booking. The server only
  // permits these two transitions here — completion stays traveler/escrow-driven,
  // so the provider cannot self-credit earnings by marking a booking completed.
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "confirmed" | "cancelled" }) =>
      apiRequest("PATCH", `/api/provider/bookings/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      toast({
        title: variables.status === "confirmed" ? "Booking accepted" : "Booking declined",
        description:
          variables.status === "confirmed"
            ? "The traveler has been notified you accepted."
            : "The traveler has been notified you declined.",
      });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not update the booking. Please try again.", variant: "destructive" });
    },
  });

  const filteredBookings = (bookings || []).filter((booking) => {
    const matchesSearch = (booking.clientName?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
                          (booking.eventType?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || booking.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: bookings?.length || 0,
    confirmed: (bookings || []).filter(b => b.status === "confirmed").length,
    pending: (bookings || []).filter(b => b.status === "pending").length,
    completed: (bookings || []).filter(b => b.status === "completed").length,
  };

  return (
    <ProviderLayout title="Bookings">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isLoading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </>
          ) : (
            <>
              <Card data-testid="card-stat-total">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-console-darkest">{stats.total}</p>
                  <p className="text-sm text-console-mid">Total Bookings</p>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-confirmed">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
                  <p className="text-sm text-console-mid">Confirmed</p>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-pending">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                  <p className="text-sm text-console-mid">Pending</p>
                </CardContent>
              </Card>
              <Card data-testid="card-stat-completed">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{stats.completed}</p>
                  <p className="text-sm text-console-mid">Completed</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-console-mid" />
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
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </>
            ) : filteredBookings.length > 0 ? (
              filteredBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="p-4 border border-console-light rounded-lg hover:bg-console-hover transition-colors"
                  data-testid={`card-booking-${booking.id}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={statusColors[booking.status]} data-testid={`badge-status-${booking.id}`}>
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </Badge>
                        <span className="font-semibold text-console-darkest">{booking.eventType || "Event"}</span>
                        <span className="text-console-mid">-</span>
                        <span className="text-console-dark">{booking.clientName || "Client"}</span>
                        {isVisaBooking(booking) && booking.bookingMetadata?.visaApplicationStatus && (
                          <VisaStatusBadge status={booking.bookingMetadata.visaApplicationStatus} />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-console-dark">
                        {booking.date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" /> {booking.date}
                          </span>
                        )}
                        {booking.time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" /> {booking.time}
                          </span>
                        )}
                        {booking.guests && (
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" /> {booking.guests} guests
                          </span>
                        )}
                        {booking.amount && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4" /> {booking.amount}
                          </span>
                        )}
                      </div>
                      {booking.expert && (
                        <p className="text-sm text-console-mid mt-1">Expert: {booking.expert}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {booking.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => statusMutation.mutate({ id: booking.id, status: "confirmed" })}
                            disabled={statusMutation.isPending}
                            data-testid={`button-accept-${booking.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => statusMutation.mutate({ id: booking.id, status: "cancelled" })}
                            disabled={statusMutation.isPending}
                            data-testid={`button-decline-${booking.id}`}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                        </>
                      )}
                      {isVisaBooking(booking) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedVisaBooking(booking);
                            setVisaDialogOpen(true);
                          }}
                          data-testid={`button-update-visa-status-${booking.id}`}
                        >
                          <FileCheck className="w-4 h-4 mr-1" />
                          Visa Status
                        </Button>
                      )}
                      <Button variant="outline" size="sm" data-testid={`button-view-${booking.id}`}>
                        View Details
                      </Button>
                      <Button variant="ghost" size="icon" data-testid={`button-message-${booking.id}`}>
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-console-mid">No bookings found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <VisaStatusDialog
        open={visaDialogOpen}
        onOpenChange={setVisaDialogOpen}
        booking={selectedVisaBooking}
      />
    </ProviderLayout>
  );
}
