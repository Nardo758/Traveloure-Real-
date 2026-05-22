import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Star, 
  ShoppingCart,
  MessageSquare,
  CheckCircle,
  Loader2,
  User,
  Send,
  Lock,
  Pencil,
  Trash2,
  X
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface Service {
  id: string;
  userId: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  price: string;
  location: string;
  averageRating: string;
  reviewCount: number;
  status: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
  whatIncluded: string[];
  requirements: string[];
}

interface Review {
  id: string;
  bookingId: string;
  serviceId: string;
  providerId: string;
  travelerId: string;
  rating: number;
  reviewText: string | null;
  responseText: string | null;
  responseAt: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface ServiceBooking {
  id: string;
  serviceId: string;
  status: string;
  hasReview: boolean;
}

function StarPicker({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const [hovered, setHovered] = useState(0);
  const sz = size === "lg" ? "w-8 h-8" : size === "md" ? "w-6 h-6" : "w-4 h-4";
  const active = hovered || value;
  return (
    <div className="flex items-center gap-1" data-testid="star-picker">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star`}
          data-testid={`star-input-${star}`}
          className="focus:outline-none transition-transform hover:scale-110"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
        >
          <Star
            className={`${sz} transition-colors ${
              star <= active
                ? "text-amber-400 fill-amber-400"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm text-muted-foreground">
          {["", "Poor", "Fair", "Good", "Very good", "Excellent"][value]}
        </span>
      )}
    </div>
  );
}

export default function ServiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: service, isLoading: serviceLoading } = useQuery<Service>({
    queryKey: ["/api/services", id],
    enabled: !!id,
  });

  const { data: reviews, isLoading: reviewsLoading } = useQuery<Review[]>({
    queryKey: ["/api/services", id, "reviews"],
    enabled: !!id,
  });

  const { data: myBookings } = useQuery<ServiceBooking[]>({
    queryKey: ["/api/bookings/user"],
    enabled: !!user,
  });

  const eligibleBooking = myBookings?.find(
    (b) => b.serviceId === id && b.status === "completed" && !b.hasReview
  );
  const alreadyReviewed = myBookings?.some(
    (b) => b.serviceId === id && b.hasReview
  );
  const hasCompletedBooking = !!myBookings?.find(
    (b) => b.serviceId === id && b.status === "completed"
  );

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/cart", { serviceId: id, quantity: 1 });
    },
    onSuccess: () => {
      toast({ title: "Added to cart", description: "Service has been added to your cart" });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add to cart", variant: "destructive" });
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/services/${id}/reviews`, {
        rating: reviewRating,
        reviewText: reviewText.trim() || null,
        bookingId: eligibleBooking?.id,
      });
    },
    onSuccess: () => {
      toast({ title: "Review submitted!", description: "Thank you for your feedback." });
      setReviewRating(0);
      setReviewText("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/services", id, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/user"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to submit review";
      if (msg.includes("completed")) {
        toast({
          title: "Booking required",
          description: "You need a completed booking to review this service.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    },
  });

  if (serviceLoading) {
    return (
      <Layout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full mb-6" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Layout>
    );
  }

  if (!service) {
    return (
      <Layout>
        <div className="container py-8 max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-2">Service Not Found</h1>
          <p className="text-muted-foreground mb-6">The service you're looking for doesn't exist</p>
          <Button asChild data-testid="button-back-discover">
            <Link href="/discover">Browse Services</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;

  return (
    <Layout>
      <div className="container py-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" asChild data-testid="button-back">
            <Link href="/discover">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-service-name">
              {service.serviceName}
            </h1>
            <div className="flex items-center gap-4 mt-1 text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span data-testid="text-location">{service.location || "Remote"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span data-testid="text-rating">{rating.toFixed(1)} ({service.reviewCount} reviews)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>About this service</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground" data-testid="text-description">
                  {service.description || service.shortDescription || "No description available"}
                </p>

                {service.deliveryTimeframe && (
                  <div className="flex items-center gap-2 mt-4 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>Delivery: {service.deliveryTimeframe}</span>
                  </div>
                )}

                {service.deliveryMethod && (
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <Badge variant="outline">{service.deliveryMethod}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {service.whatIncluded && service.whatIncluded.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>What's Included</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {service.whatIncluded.map((item, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* ── Reviews ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span>Reviews</span>
                  {service.reviewCount > 0 && (
                    <div className="flex items-center gap-1 text-sm font-normal">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>{rating.toFixed(1)}</span>
                      <span className="text-muted-foreground">({service.reviewCount})</span>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* ── Write a Review CTA / Form ── */}
                {user && !alreadyReviewed && (
                  <div className="border rounded-lg p-4 bg-muted/30" data-testid="review-form-section">
                    {!showForm ? (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-sm font-medium">Share your experience</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {hasCompletedBooking
                              ? "You've completed this service — leave a review!"
                              : "Book and complete this service to leave a review"}
                          </p>
                        </div>
                        {hasCompletedBooking ? (
                          <Button
                            size="sm"
                            onClick={() => setShowForm(true)}
                            data-testid="button-write-review"
                          >
                            <Star className="w-4 h-4 mr-1.5" />
                            Write a Review
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Requires a completed booking</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <form
                        data-testid="review-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (reviewRating === 0) {
                            toast({ title: "Please select a star rating", variant: "destructive" });
                            return;
                          }
                          submitReviewMutation.mutate();
                        }}
                        className="space-y-4"
                      >
                        <div>
                          <p className="text-sm font-medium mb-2">Your rating</p>
                          <StarPicker value={reviewRating} onChange={setReviewRating} size="lg" />
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">
                            Your review <span className="text-muted-foreground font-normal">(optional)</span>
                          </p>
                          <Textarea
                            data-testid="input-review-text"
                            placeholder="Share details about your experience — what went well, what could improve..."
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            rows={3}
                            maxLength={1000}
                          />
                          {reviewText.length > 0 && (
                            <p className="text-xs text-muted-foreground text-right mt-1">
                              {reviewText.length}/1000
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => { setShowForm(false); setReviewRating(0); setReviewText(""); }}
                            data-testid="button-cancel-review"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={submitReviewMutation.isPending || reviewRating === 0}
                            data-testid="button-submit-review"
                          >
                            {submitReviewMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Submitting...</>
                            ) : (
                              <><Send className="w-4 h-4 mr-1.5" />Submit Review</>
                            )}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {user && alreadyReviewed && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg p-3 bg-muted/20" data-testid="already-reviewed-notice">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>You've already reviewed this service.</span>
                  </div>
                )}

                <Separator />

                {/* ── Review list ── */}
                {reviewsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : !reviews || reviews.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8" data-testid="text-no-reviews">
                    No reviews yet. Be the first to review this service!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <ReviewCard
                        key={review.id}
                        review={review}
                        currentUserId={(user as any)?.claims?.sub ?? (user as any)?.id ?? ""}
                        serviceId={id!}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="p-6">
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold" data-testid="text-price">
                    ${price.toFixed(0)}
                  </p>
                  <p className="text-sm text-muted-foreground">per service</p>
                </div>

                <Separator className="my-4" />

                <div className="space-y-3">
                  <Button 
                    className="w-full" 
                    onClick={() => addToCartMutation.mutate()}
                    disabled={addToCartMutation.isPending || !user}
                    data-testid="button-add-to-cart"
                  >
                    {addToCartMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Add to Cart
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    asChild
                    data-testid="button-contact-provider"
                  >
                    <Link href={`/chat?provider=${service.userId}`}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Contact Provider
                    </Link>
                  </Button>
                </div>

                {!user && (
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    <a href="/" className="underline">Sign in</a> to book this service
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ReviewCard({
  review,
  currentUserId,
  serviceId,
}: {
  review: Review;
  currentUserId: string;
  serviceId: string;
}) {
  const { toast } = useToast();
  const isOwner = !!currentUserId && review.travelerId === currentUserId;

  const [editing, setEditing]               = useState(false);
  const [editRating, setEditRating]         = useState(review.rating);
  const [editText, setEditText]             = useState(review.reviewText ?? "");
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [deleted, setDeleted]               = useState(false);
  const [displayRating, setDisplayRating]   = useState(review.rating);
  const [displayText, setDisplayText]       = useState(review.reviewText ?? "");

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/services/${serviceId}/reviews/${review.id}`, {
        rating: editRating,
        reviewText: editText.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Review updated!" });
      setDisplayRating(editRating);
      setDisplayText(editText.trim());
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/services", serviceId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", serviceId] });
    },
    onError: () => toast({ title: "Failed to update review", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/services/${serviceId}/reviews/${review.id}`),
    onSuccess: () => {
      toast({ title: "Review deleted", description: "The average rating has been recalculated." });
      setDeleted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/services", serviceId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services", serviceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/user"] });
    },
    onError: () => toast({ title: "Failed to delete review", variant: "destructive" }),
  });

  if (deleted) return null;

  return (
    <>
      <div className="border-b last:border-0 pb-4 last:pb-0" data-testid={`card-review-${review.id}`}>
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback>
              <User className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {/* ── Header row: stars + verified + owner actions ── */}
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= displayRating
                          ? "text-amber-500 fill-amber-500"
                          : "text-muted-foreground"
                      }`}
                    />
                  ))}
                </div>
                {review.isVerified && (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>

              {/* Owner-only edit / delete buttons */}
              {isOwner && !editing && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditRating(review.rating); setEditText(review.reviewText ?? ""); setEditing(true); }}
                    data-testid={`button-edit-review-${review.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(true)}
                    data-testid={`button-delete-review-${review.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground mb-1">
              {format(new Date(review.createdAt), "MMM d, yyyy")}
            </p>

            {/* ── Inline edit form ── */}
            {editing ? (
              <div className="space-y-3 mt-2 border rounded-lg p-3 bg-muted/20" data-testid={`edit-form-${review.id}`}>
                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Update rating</p>
                  <StarPicker value={editRating} onChange={setEditRating} size="md" />
                </div>
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="Update your review text (optional)…"
                  rows={3}
                  maxLength={1000}
                  data-testid={`input-edit-review-text-${review.id}`}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                    data-testid={`button-cancel-edit-${review.id}`}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={updateMutation.isPending || editRating === 0}
                    onClick={() => updateMutation.mutate()}
                    data-testid={`button-save-review-${review.id}`}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 mr-1" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {displayText && (
                  <p className="text-sm" data-testid={`text-review-${review.id}`}>
                    {displayText}
                  </p>
                )}
                {review.responseText && (
                  <div className="mt-3 pl-4 border-l-2 border-primary/20">
                    <p className="text-xs text-muted-foreground mb-1">Provider Response:</p>
                    <p className="text-sm" data-testid={`text-response-${review.id}`}>
                      {review.responseText}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Delete confirmation dialog ── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent data-testid={`dialog-delete-review-${review.id}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove your review and recalculate the service's average rating. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid={`button-cancel-delete-${review.id}`}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { setConfirmDelete(false); deleteMutation.mutate(); }}
              data-testid={`button-confirm-delete-${review.id}`}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Review"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
