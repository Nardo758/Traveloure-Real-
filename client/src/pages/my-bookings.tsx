import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
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
  AlertTriangle,
  Calendar, 
  Clock, 
  DollarSign, 
  ExternalLink,
  FileText, 
  Mail,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  Pencil,
  Star,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSignInModal } from "@/contexts/SignInModalContext";

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
  serviceName?: string | null;
  existingReview?: { id: string; rating: number; reviewText: string | null; responseText: string | null } | null;
}

interface ActivityBooking {
  id: string;
  userId: string;
  provider: string;
  productCode: string | null;
  productOptionCode: string | null;
  productTitle: string;
  imageUrl: string | null;
  priceAmount: string;
  priceCurrency: string;
  bookingUrl: string | null;
  stripePaymentIntentId: string | null;
  providerBookingRef: string | null;
  travelDate: string | null;
  travelerCount: number | null;
  status: string;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "In Progress", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
  refunded: { label: "Refunded", variant: "outline", icon: DollarSign },
};

export default function MyBookingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);

  const { toast } = useToast();

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/bookings/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast({ title: "Booking cancelled", description: "Your booking has been cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      setCancelDialogOpen(false);
      setCancellingBooking(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not cancel this booking. Please try again.", variant: "destructive" });
    },
  });

  const openCancelDialog = useCallback((booking: Booking) => {
    setCancellingBooking(booking);
    setCancelDialogOpen(true);
  }, []);

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/my-bookings"],
    enabled: !!user,
  });

  const { data: activityBookings, isLoading: activityLoading } = useQuery<ActivityBooking[]>({
    queryKey: ["/api/my-activity-bookings"],
    queryFn: async () => {
      const res = await fetch("/api/bookings/my-activity-bookings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity bookings");
      return res.json();
    },
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
          <Button onClick={() => openSignInModal({ returnTo: "/bookings" })} data-testid="button-sign-in">Sign In</Button>
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
        ) : (!bookings || bookings.length === 0) && (!activityBookings || activityBookings.length === 0) ? (
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
                All ({bookings?.length ?? 0})
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
              <TabsTrigger value="activities" data-testid="tab-activities">
                Activities ({activityBookings?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {(bookings?.length ?? 0) === 0 ? (
                <EmptyState message="No bookings yet" />
              ) : (
                bookings!.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} onCancel={openCancelDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="pending" className="space-y-4">
              {pendingBookings.length === 0 ? (
                <EmptyState message="No pending bookings" />
              ) : (
                pendingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} onCancel={openCancelDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              {activeBookings.length === 0 ? (
                <EmptyState message="No active bookings" />
              ) : (
                activeBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} onCancel={openCancelDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedBookings.length === 0 ? (
                <EmptyState message="No completed bookings" />
              ) : (
                completedBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} onCancel={openCancelDialog} />
                ))
              )}
            </TabsContent>

            <TabsContent value="activities" className="space-y-4">
              {activityLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : !activityBookings || activityBookings.length === 0 ? (
                <EmptyState message="No activity bookings yet" />
              ) : (
                activityBookings.map((ab) => (
                  <ActivityBookingCard key={ab.id} booking={ab} />
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
      <CancelDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        booking={cancellingBooking}
        isPending={cancelMutation.isPending}
        onConfirm={(reason) => {
          if (cancellingBooking) cancelMutation.mutate({ id: cancellingBooking.id, reason });
        }}
      />
    </DashboardLayout>
  );
}

function ActivityBookingCard({ booking }: { booking: ActivityBooking }) {
  const status = statusConfig[booking.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: booking.priceCurrency || "USD",
    minimumFractionDigits: 0,
  }).format(parseFloat(booking.priceAmount));

  const formattedDate = booking.travelDate
    ? format(new Date(booking.travelDate + "T12:00:00"), "MMM d, yyyy")
    : null;

  return (
    <Card data-testid={`card-activity-booking-${booking.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-4">
          {booking.imageUrl ? (
            <img
              src={booking.imageUrl}
              alt={booking.productTitle}
              className="w-20 h-16 object-cover rounded-md flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-16 bg-muted rounded-md flex-shrink-0 flex items-center justify-center">
              <Ticket className="w-6 h-6 text-muted-foreground/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant={status.variant} data-testid={`badge-activity-status-${booking.id}`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
              <Badge variant="outline" className="text-xs capitalize">{booking.provider}</Badge>
            </div>
            <h3 className="font-semibold text-sm line-clamp-2" data-testid={`text-activity-title-${booking.id}`}>
              {booking.productTitle}
            </h3>
            <div className="flex flex-wrap gap-3 mt-1">
              {formattedDate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formattedDate}
                </p>
              )}
              {booking.travelerCount && booking.travelerCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {booking.travelerCount} traveler{booking.travelerCount > 1 ? "s" : ""}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Booked {format(new Date(booking.createdAt), "MMM d, yyyy")}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-lg" data-testid={`text-activity-amount-${booking.id}`}>
              {formattedPrice}
            </p>
            {booking.bookingUrl && (
              <a
                href={booking.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block"
                data-testid={`link-activity-provider-${booking.id}`}
              >
                <Button size="sm" variant="outline" className="text-xs">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  View with Provider
                </Button>
              </a>
            )}
          </div>
        </div>
        {/* Viator booking reference */}
        {booking.providerBookingRef && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
            <p className="text-xs text-green-700 dark:text-green-400 font-medium">
              Viator Booking Ref:{" "}
              <span className="font-mono font-bold text-green-900 dark:text-green-200" data-testid={`text-viator-ref-${booking.id}`}>
                {booking.providerBookingRef}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CANCELLABLE_STATUSES = new Set(["pending", "confirmed"]);

function BookingCard({
  booking,
  onReview,
  onCancel,
}: {
  booking: Booking;
  onReview: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
}) {
  const { toast } = useToast();
  const status = statusConfig[booking.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const canReview = booking.status === "completed" && !booking.hasReview;
  const canCancel = CANCELLABLE_STATUSES.has(booking.status);
  const canResendEmail = booking.status === "confirmed";

  const resendEmailMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/bookings/send-confirmation", { bookingId: booking.id }),
    onSuccess: () => {
      toast({
        title: "Confirmation sent",
        description: "A confirmation email has been queued to your inbox.",
      });
    },
    onError: () => {
      toast({
        title: "Could not send email",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

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
              {booking.hasReview && booking.existingReview && (
                <Badge variant="outline" className="gap-1" data-testid={`badge-reviewed-${booking.id}`}>
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className={`w-3 h-3 ${s <= booking.existingReview!.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                  ))}
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
                <p className="line-clamp-2">Notes: {booking.bookingDetails.notes}</p>
              )}
            </div>

            {/* Your review excerpt */}
            {booking.existingReview?.reviewText && (
              <p className="text-xs text-muted-foreground italic mt-2 line-clamp-2" data-testid={`text-review-excerpt-${booking.id}`}>
                "{booking.existingReview.reviewText}"
              </p>
            )}

            {/* Provider response */}
            {booking.existingReview?.responseText && (
              <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20 px-3 py-2" data-testid={`provider-response-${booking.id}`}>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1 mb-1">
                  <MessageSquare className="w-3 h-3" />
                  Provider replied
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-300 line-clamp-3">
                  {booking.existingReview.responseText}
                </p>
              </div>
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
                  className="bg-[#FF385C] hover:bg-[#e0314f] text-white"
                  data-testid={`button-review-${booking.id}`}
                >
                  <Star className="w-4 h-4 mr-1" />
                  Review
                </Button>
              )}
              {booking.hasReview && booking.existingReview && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReview(booking)}
                  data-testid={`button-edit-review-${booking.id}`}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit Review
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
              {canResendEmail && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resendEmailMutation.mutate()}
                  disabled={resendEmailMutation.isPending}
                  data-testid={`button-resend-email-${booking.id}`}
                >
                  {resendEmailMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-1" />
                  )}
                  Resend Email
                </Button>
              )}
              <Button variant="outline" size="sm" asChild data-testid={`button-message-${booking.id}`}>
                <Link href={`/chat?provider=${booking.providerId}`}>
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Message
                </Link>
              </Button>
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCancel(booking)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  data-testid={`button-cancel-booking-${booking.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const SENTIMENT_LABELS: Record<number, { label: string; color: string; placeholder: string }> = {
  1: { label: "Poor", color: "text-red-500", placeholder: "What went wrong? Your honest feedback helps us improve." },
  2: { label: "Fair", color: "text-orange-500", placeholder: "What could have been better?" },
  3: { label: "Good", color: "text-yellow-500", placeholder: "What did you like or dislike?" },
  4: { label: "Great", color: "text-lime-500", placeholder: "What stood out to you?" },
  5: { label: "Excellent", color: "text-emerald-500", placeholder: "What did you love most about this experience?" },
};

const MAX_REVIEW_CHARS = 500;

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
  const isEditing = !!(booking?.hasReview && booking?.existingReview);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Reset / pre-populate state when a different booking is opened
  const bookingId = booking?.id;
  const [lastBookingId, setLastBookingId] = useState<string | undefined>();
  if (bookingId !== lastBookingId) {
    setLastBookingId(bookingId);
    setRating(booking?.existingReview?.rating ?? 0);
    setReviewText(booking?.existingReview?.reviewText ?? "");
    setSubmitted(false);
  }

  const mutation = useMutation({
    mutationFn: async (data: { rating: number; reviewText: string }) => {
      if (isEditing && booking?.existingReview?.id) {
        return apiRequest("PATCH", `/api/services/${booking.serviceId}/reviews/${booking.existingReview.id}`, {
          rating: data.rating,
          reviewText: data.reviewText,
        });
      }
      return apiRequest("POST", `/api/services/${booking?.serviceId}/reviews`, {
        bookingId: booking?.id,
        rating: data.rating,
        reviewText: data.reviewText,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      setSubmitted(true);
    },
    onError: () => {
      toast({
        title: "Error",
        description: isEditing ? "Failed to update review. Please try again." : "Failed to submit review. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (rating < 1 || rating > 5) {
      toast({ title: "Rating required", description: "Please select a star rating before submitting.", variant: "destructive" });
      return;
    }
    mutation.mutate({ rating, reviewText: reviewText.trim() });
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setRating(0);
      setReviewText("");
      setSubmitted(false);
    }
    onOpenChange(v);
  };

  const activeRating = hoveredRating || rating;
  const sentiment = activeRating > 0 ? SENTIMENT_LABELS[activeRating] : null;
  const charsLeft = MAX_REVIEW_CHARS - reviewText.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          /* ── Success state ── */
          <div className="py-8 text-center space-y-4" data-testid="review-success-state">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold" data-testid="text-review-success-heading">
                {isEditing ? "Review updated!" : "Review submitted!"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isEditing
                  ? "Your review has been updated."
                  : "Thank you for sharing your experience. Your feedback helps other travelers."}
              </p>
            </div>
            {rating > 0 && (
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-5 h-5 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                ))}
              </div>
            )}
            <Button onClick={() => handleClose(false)} className="w-full" data-testid="button-close-review-success">
              Done
            </Button>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <DialogHeader>
              <DialogTitle data-testid="text-review-dialog-title">
                {isEditing
                  ? (booking?.serviceName ? `Edit Review: ${booking.serviceName}` : "Edit Your Review")
                  : (booking?.serviceName ? `Review: ${booking.serviceName}` : "Leave a Review")}
              </DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "Update your star rating or review text below."
                  : booking?.serviceName
                    ? "Your honest review helps other travelers and rewards great providers."
                    : "Share your experience with this service"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Star picker */}
              <div>
                <Label className="mb-3 block text-sm font-medium">
                  How would you rate this experience?
                </Label>
                <div className="flex items-center gap-1" data-testid="input-rating-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="p-1 transition-all hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                      aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                      data-testid={`button-star-${star}`}
                    >
                      <Star
                        className={`w-9 h-9 transition-colors ${
                          star <= activeRating
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/40 hover:text-amber-200"
                        }`}
                      />
                    </button>
                  ))}
                  {sentiment && (
                    <span className={`ml-3 text-sm font-semibold ${sentiment.color}`} data-testid="text-sentiment-label">
                      {sentiment.label}
                    </span>
                  )}
                </div>
                {rating === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Click to select a rating</p>
                )}
              </div>

              {/* Review text */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="reviewText" className="text-sm font-medium">
                    Your review <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <span className={`text-xs ${charsLeft < 50 ? "text-destructive" : "text-muted-foreground"}`}>
                    {charsLeft} left
                  </span>
                </div>
                <Textarea
                  id="reviewText"
                  value={reviewText}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_REVIEW_CHARS) setReviewText(e.target.value);
                  }}
                  placeholder={sentiment?.placeholder ?? "Tell others about your experience…"}
                  rows={4}
                  className="resize-none"
                  data-testid="input-review-text"
                />
              </div>

              {/* Provider response (read-only, edit mode only) */}
              {isEditing && booking?.existingReview?.responseText && (
                <div className="rounded-md border border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20 px-3 py-3" data-testid="dialog-provider-response">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1 mb-1.5">
                    <MessageSquare className="w-3 h-3" />
                    Provider's response
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    {booking.existingReview.responseText}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={mutation.isPending}
                data-testid="button-cancel-review"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={mutation.isPending || rating === 0}
                className="bg-[#FF385C] hover:bg-[#e0314f] text-white"
                data-testid="button-submit-review"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEditing ? "Updating…" : "Submitting…"}
                  </>
                ) : (
                  isEditing ? "Update Review" : "Submit Review"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  booking,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  isPending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason("");
  };

  const handleClose = (v: boolean) => {
    if (!v) setReason("");
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-cancel-dialog-title">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Cancel Booking
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this booking? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Label htmlFor="cancel-reason" className="mb-2 block text-sm">
            Reason for cancellation <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let us know why you're cancelling…"
            rows={3}
            data-testid="input-cancel-reason"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isPending}
            data-testid="button-cancel-dialog-dismiss"
          >
            Keep Booking
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
            data-testid="button-cancel-dialog-confirm"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cancelling…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Cancel Booking
              </>
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
