import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Calendar, 
  Clock, 
  DollarSign, 
  FileText, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  Star,
  Plane,
  FileCheck,
  Search,
  ThumbsUp,
  ThumbsDown,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSignInModal } from "@/contexts/SignInModalContext";

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
  serviceId: string;
  providerId: string;
  contractId: string | null;
  tripId: string | null;
  bookingDetails: {
    scheduledDate?: string;
    notes?: string;
    quantity?: number;
  };
  bookingMetadata?: VisaBookingMetadata;
  status: string;
  totalAmount: string;
  platformFee: string;
  providerEarnings: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  hasReview?: boolean;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "In Progress", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
  refunded: { label: "Refunded", variant: "outline", icon: DollarSign },
};

const VISA_STATUS_STEPS: Array<{
  key: VisaBookingMetadata["visaApplicationStatus"];
  label: string;
  description: string;
  icon: any;
  color: string;
}> = [
  { key: "pending", label: "Pending", description: "Your application is being reviewed by the expert", icon: Clock, color: "text-yellow-500" },
  { key: "submitted", label: "Submitted", description: "Documents submitted to the embassy", icon: FileCheck, color: "text-blue-500" },
  { key: "in_review", label: "Under Review", description: "Embassy is processing your application", icon: Search, color: "text-purple-500" },
  { key: "approved", label: "Approved", description: "Your visa has been approved!", icon: ThumbsUp, color: "text-green-600" },
  { key: "rejected", label: "Rejected", description: "Visa application was not approved", icon: ThumbsDown, color: "text-red-500" },
];

function isVisaBooking(booking: Booking): boolean {
  const meta = booking.bookingMetadata;
  return !!(meta && (meta.passportNationality || meta.destinationCountry || meta.visaType || meta.visaApplicationStatus));
}

function VisaStatusTimeline({ metadata }: { metadata: VisaBookingMetadata }) {
  const currentStatus = metadata.visaApplicationStatus || "pending";
  const isRejected = currentStatus === "rejected";

  const stepsToShow = isRejected
    ? VISA_STATUS_STEPS.filter(s => s.key !== "approved")
    : VISA_STATUS_STEPS.filter(s => s.key !== "rejected");

  const currentIdx = stepsToShow.findIndex(s => s.key === currentStatus);

  return (
    <div className="mt-4 border rounded-lg p-4 bg-muted/30" data-testid="visa-status-timeline">
      <div className="flex items-center gap-2 mb-3">
        <Plane className="w-4 h-4 text-[#FF385C]" />
        <span className="text-sm font-semibold">Visa Application Status</span>
        {metadata.visaStatusUpdatedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Updated {format(new Date(metadata.visaStatusUpdatedAt), "MMM d, yyyy")}
          </span>
        )}
      </div>

      {(metadata.passportNationality || metadata.destinationCountry) && (
        <div className="text-xs text-muted-foreground mb-3 flex gap-3">
          {metadata.passportNationality && <span>Passport: <strong>{metadata.passportNationality}</strong></span>}
          {metadata.destinationCountry && <span>Destination: <strong>{metadata.destinationCountry}</strong></span>}
          {metadata.visaType && <span>Type: <strong className="capitalize">{metadata.visaType}</strong></span>}
        </div>
      )}

      <div className="relative">
        <div className="flex items-start gap-0" data-testid="visa-steps">
          {stepsToShow.map((step, idx) => {
            const isPast = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const StepIcon = step.icon;
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center relative" data-testid={`visa-step-${step.key}`}>
                {idx < stepsToShow.length - 1 && (
                  <div
                    className={`absolute top-4 left-1/2 w-full h-0.5 ${isPast || isCurrent ? "bg-[#FF385C]" : "bg-muted-foreground/20"}`}
                    style={{ left: "50%", width: "100%" }}
                  />
                )}
                <div
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCurrent
                      ? isRejected
                        ? "border-red-500 bg-red-50 text-red-500"
                        : "border-[#FF385C] bg-[#FF385C] text-white"
                      : isPast
                      ? "border-[#FF385C] bg-[#FF385C]/10 text-[#FF385C]"
                      : "border-muted-foreground/30 bg-background text-muted-foreground/40"
                  }`}
                >
                  <StepIcon className="w-4 h-4" />
                </div>
                <span
                  className={`mt-1 text-xs text-center font-medium leading-tight ${
                    isCurrent ? (isRejected ? "text-red-500" : "text-[#FF385C]") : isPast ? "text-foreground" : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {metadata.visaStatusNotes && (
        <div className="mt-3 flex gap-2 p-2 rounded bg-background border text-xs" data-testid="visa-status-notes">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{metadata.visaStatusNotes}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2 text-center">
        {stepsToShow.find(s => s.key === currentStatus)?.description}
      </p>
    </div>
  );
}

export default function MyBookingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/my-bookings"],
    enabled: !!user,
  });

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="container py-8 max-w-4xl mx-auto text-center">
          <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground mb-6">Please sign in to view your bookings</p>
          <Button onClick={() => openSignInModal()} data-testid="button-sign-in">Sign In</Button>
        </div>
      </DashboardLayout>
    );
  }

  const pendingBookings = bookings?.filter(b => b.status === "pending") || [];
  const activeBookings = bookings?.filter(b => ["confirmed", "in_progress"].includes(b.status)) || [];
  const completedBookings = bookings?.filter(b => ["completed", "cancelled", "refunded"].includes(b.status)) || [];

  const openReviewDialog = (booking: Booking) => {
    setSelectedBooking(booking);
    setReviewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container py-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">My Bookings</h1>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !bookings || bookings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No bookings yet</h2>
              <p className="text-muted-foreground mb-6">Browse our services and make your first booking</p>
              <Button asChild data-testid="button-browse-services">
                <Link href="/discover">Browse Services</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList data-testid="tabs-booking-status">
              <TabsTrigger value="all" data-testid="tab-all">
                All ({bookings.length})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">
                Pending ({pendingBookings.length})
              </TabsTrigger>
              <TabsTrigger value="active" data-testid="tab-active">
                Active ({activeBookings.length})
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                Completed ({completedBookings.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {bookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
              ))}
            </TabsContent>

            <TabsContent value="pending" className="space-y-4">
              {pendingBookings.length === 0 ? (
                <EmptyState message="No pending bookings" />
              ) : (
                pendingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              {activeBookings.length === 0 ? (
                <EmptyState message="No active bookings" />
              ) : (
                activeBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedBookings.length === 0 ? (
                <EmptyState message="No completed bookings" />
              ) : (
                completedBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <ReviewDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        booking={selectedBooking}
      />
    </DashboardLayout>
  );
}

function BookingCard({ booking, onReview }: { booking: Booking; onReview: (booking: Booking) => void }) {
  const status = statusConfig[booking.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const canReview = booking.status === "completed" && !booking.hasReview;
  const showVisaTimeline = isVisaBooking(booking) && booking.bookingMetadata;

  return (
    <Card data-testid={`card-booking-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant={status.variant} data-testid={`badge-status-${booking.id}`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
              {showVisaTimeline && (
                <Badge variant="outline" className="text-[#FF385C] border-[#FF385C]/30" data-testid={`badge-visa-${booking.id}`}>
                  <Plane className="w-3 h-3 mr-1" />
                  Visa Application
                </Badge>
              )}
              {booking.hasReview && (
                <Badge variant="outline" data-testid={`badge-reviewed-${booking.id}`}>
                  <Star className="w-3 h-3 mr-1 fill-current" />
                  Reviewed
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Booked on {format(new Date(booking.createdAt), "MMM d, yyyy")}
              </span>
            </div>
            
            <div className="text-sm text-muted-foreground space-y-1">
              {booking.bookingDetails?.scheduledDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Scheduled: {format(new Date(booking.bookingDetails.scheduledDate), "PPP")}
                </div>
              )}
              {booking.bookingDetails?.notes && (
                <p className="line-clamp-2">
                  Notes: {booking.bookingDetails.notes}
                </p>
              )}
            </div>

            {showVisaTimeline && booking.bookingMetadata && (
              <VisaStatusTimeline metadata={booking.bookingMetadata} />
            )}
          </div>
          
          <div className="text-right">
            <p className="font-bold text-lg" data-testid={`text-amount-${booking.id}`}>
              ${parseFloat(booking.totalAmount).toFixed(2)}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap justify-end">
              {canReview && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => onReview(booking)}
                  data-testid={`button-review-${booking.id}`}
                >
                  <Star className="w-4 h-4 mr-1" />
                  Review
                </Button>
              )}
              {booking.tripId && (
                <Button variant="outline" size="sm" asChild data-testid={`button-view-itinerary-${booking.id}`}>
                  <Link href={`/my-itinerary/${booking.tripId}`}>
                    <Package className="w-4 h-4 mr-1" />
                    View Itinerary
                  </Link>
                </Button>
              )}
              {booking.contractId && (
                <Button variant="outline" size="sm" asChild data-testid={`button-view-contract-${booking.id}`}>
                  <Link href={`/contracts/${booking.contractId}`}>
                    <FileText className="w-4 h-4 mr-1" />
                    Contract
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild data-testid={`button-message-${booking.id}`}>
                <Link href={`/chat?provider=${booking.providerId}`}>
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Message
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewDialog({ 
  open, 
  onOpenChange, 
  booking 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  booking: Booking | null;
}) {
  const { toast } = useToast();
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);

  const mutation = useMutation({
    mutationFn: async (data: { rating: number; reviewText: string }) => {
      return apiRequest("POST", `/api/services/${booking?.serviceId}/reviews`, {
        bookingId: booking?.id,
        rating: data.rating,
        reviewText: data.reviewText,
      });
    },
    onSuccess: () => {
      toast({ title: "Review submitted", description: "Thank you for your feedback!" });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      onOpenChange(false);
      setRating(5);
      setReviewText("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit review", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (rating < 1 || rating > 5) {
      toast({ title: "Invalid rating", description: "Please select a rating", variant: "destructive" });
      return;
    }
    mutation.mutate({ rating, reviewText });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle data-testid="text-review-dialog-title">Leave a Review</DialogTitle>
          <DialogDescription>
            Share your experience with this service
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="mb-2 block">Rating</Label>
            <div className="flex gap-1" data-testid="input-rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                  data-testid={`button-star-${star}`}
                >
                  <Star 
                    className={`w-8 h-8 ${
                      star <= (hoveredRating || rating) 
                        ? "fill-yellow-400 text-yellow-400" 
                        : "text-muted-foreground"
                    }`} 
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="reviewText" className="mb-2 block">Your Review (optional)</Label>
            <Textarea
              id="reviewText"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Tell others about your experience..."
              rows={4}
              data-testid="input-review-text"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-review"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={mutation.isPending}
            data-testid="button-submit-review"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Review"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}
