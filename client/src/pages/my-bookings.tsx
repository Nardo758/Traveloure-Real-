import { useState } from "react";
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
  Calendar, 
  Clock, 
  DollarSign, 
  ExternalLink,
  FileText, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  Star,
  Ticket,
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
}

interface ActivityBooking {
  id: string;
  userId: string;
  provider: string;
  productCode: string | null;
  productTitle: string;
  imageUrl: string | null;
  priceAmount: string;
  priceCurrency: string;
  bookingUrl: string | null;
  stripePaymentIntentId: string | null;
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
                  <BookingCard key={booking.id} booking={booking} onReview={openReviewDialog} />
                ))
              )}
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

  return (
    <Card data-testid={`card-activity-booking-${booking.id}`}>
      <CardContent className="p-4">
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
            <p className="text-xs text-muted-foreground mt-1">
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
      </CardContent>
    </Card>
  );
}

function BookingCard({ booking, onReview }: { booking: Booking; onReview: (booking: Booking) => void }) {
  const status = statusConfig[booking.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const canReview = booking.status === "completed" && !booking.hasReview;

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
