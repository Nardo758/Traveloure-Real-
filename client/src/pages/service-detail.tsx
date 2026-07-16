import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Star,
  DollarSign,
  ShoppingCart,
  MessageSquare,
  CheckCircle,
  Loader2,
  User,
  Users,
  ShieldCheck,
  Building2,
  Flag,
  Calendar,
  BookOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";

interface PricingTier {
  label: string;
  price: number;
  description?: string;
}

interface Service {
  id: string;
  userId: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  price: string;
  priceType: string | null;
  priceBasedOn: string | null;
  pricingTiers: PricingTier[] | null;
  location: string;
  averageRating: string;
  reviewCount: number;
  bookingsCount: number;
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
  status: string;
  createdAt: string;
}

interface ProviderVerification {
  identityVerified: boolean;
  businessVerified: boolean;
}

export default function ServiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  const { data: service, isLoading: serviceLoading } = useQuery<Service>({
    queryKey: ["/api/services", id],
    enabled: !!id,
  });

  const { data: reviews, isLoading: reviewsLoading } = useQuery<Review[]>({
    queryKey: ["/api/services", id, "reviews"],
    enabled: !!id,
  });

  const { data: providerVerification } = useQuery<ProviderVerification>({
    queryKey: ["/api/providers", service?.userId, "public-verification"],
    enabled: !!service?.userId,
  });

  // Same-owner cross-sell (marketplace Phase B4): purchasable packages by this service's
  // owner, if they're an expert with approved+published templates. Server-gated + teaser-only.
  const { data: ownerPackages = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-templates", { expertId: service?.userId }],
    queryFn: async () => {
      const res = await fetch(`/api/expert-templates?expertId=${service!.userId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!service?.userId,
  });

  const [, navigate] = useLocation();
  // Native "Book on Traveloure": capture a preferred date/time and carry it into the
  // cart (cart_items.scheduled_date → checkout bookingDetails). Optional — non-dated
  // services (e.g. a PDF deliverable) can book without it. This closes the gap where
  // Add-to-Cart wrote no date; the whole flow reuses the audited /api/cart + /api/checkout
  // rail (server-derived amount, idempotent), so there is no money-path change here.
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const addToCartMutation = useMutation({
    mutationFn: async (_vars: { proceed: boolean }) => {
      const scheduledDate = bookingDate
        ? new Date(`${bookingDate}T${bookingTime || "09:00"}:00`).toISOString()
        : undefined;
      return apiRequest("POST", "/api/cart", { serviceId: id, quantity: 1, scheduledDate });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      if (vars.proceed) {
        navigate("/cart");
      } else {
        toast({
          title: "Added to cart",
          description: bookingDate
            ? `Scheduled for ${format(new Date(`${bookingDate}T00:00:00`), "MMM d, yyyy")}${bookingTime ? ` at ${bookingTime}` : ""}`
            : "Service has been added to your cart",
        });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add to cart", variant: "destructive" });
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
  const priceNum = parseFloat(service.price || "0") || 0;
  const fmtPrice = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  const hasTiers = Array.isArray(service.pricingTiers) && service.pricingTiers.length > 0;
  const priceLabel = service.priceType === "hourly" && priceNum > 0
    ? `${fmtPrice(priceNum)} / hr`
    : service.priceType === "package_tiers" && priceNum > 0
    ? `from ${fmtPrice(priceNum)}`
    : service.priceType === "per_event" && priceNum > 0
    ? `${fmtPrice(priceNum)} / event`
    : service.priceType === "variable" && priceNum > 0
    ? `From ${fmtPrice(priceNum)}`
    : priceNum > 0
    ? fmtPrice(priceNum)
    : "Contact for price";
  const priceSubLabel = service.priceType === "hourly"
    ? "billed by the hour"
    : service.priceType === "package_tiers"
    ? "see tiers below"
    : service.priceType === "per_event"
    ? "flat rate per event"
    : service.priceType === "variable"
    ? "starting price"
    : "per service";

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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-service-name">
                {service.serviceName}
              </h1>
              {providerVerification?.identityVerified && (
                <Badge className="bg-blue-600 text-white text-xs" title="Provider identity verified" data-testid="badge-identity-verified">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  ID Verified
                </Badge>
              )}
              {providerVerification?.businessVerified && (
                <Badge className="bg-purple-600 text-white text-xs" title="Provider business verified" data-testid="badge-business-verified">
                  <Building2 className="w-3 h-3 mr-1" />
                  Business Verified
                </Badge>
              )}
            </div>
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

            {hasTiers && (
              <Card data-testid="card-pricing-tiers">
                <CardHeader>
                  <CardTitle>Pricing Tiers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {service.pricingTiers!.map((tier, idx) => (
                      <div key={idx} className="py-3 flex items-start justify-between gap-4" data-testid={`pricing-tier-${idx}`}>
                        <div className="flex-1">
                          <p className="font-medium">{tier.label}</p>
                          {tier.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{tier.description}</p>
                          )}
                        </div>
                        <p className="font-semibold text-lg shrink-0">{fmtPrice(Number(tier.price))}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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

            {/* Same-owner cross-sell — packages by this expert (Phase B4) */}
            {ownerPackages.length > 0 && (
              <Card data-testid="card-owner-packages">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" /> Ready made trips by this expert
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ownerPackages.slice(0, 3).map((pkg: any) => (
                    <Link key={pkg.id} href={`/expert-templates/${pkg.id}`}>
                      <div
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                        data-testid={`owner-package-${pkg.id}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{pkg.title}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {pkg.destination}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {pkg.duration} days
                            </span>
                          </div>
                        </div>
                        <p className="font-bold text-primary whitespace-nowrap">${pkg.price}</p>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

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
              <CardContent>
                {reviewsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : !reviews || reviews.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No reviews yet. Be the first to review this service!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <ReviewCard key={review.id} review={review} serviceId={id!} />
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
                    {priceLabel}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {priceSubLabel}
                  </p>
                  {(service.bookingsCount ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1" data-testid="text-bookings-count">
                      <Users className="w-3 h-3" />
                      {service.bookingsCount} booking{service.bookingsCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                <Separator className="my-4" />

                <div className="space-y-3">
                  {/* Preferred date/time — optional. Carried into the cart + booking. */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      Preferred date & time <span className="font-normal">(optional)</span>
                    </div>
                    <input
                      type="date"
                      min={todayStr}
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      data-testid="input-booking-date"
                      aria-label="Preferred date"
                    />
                    <input
                      type="time"
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      disabled={!bookingDate}
                      className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                      data-testid="input-booking-time"
                      aria-label="Preferred time"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!user) {
                        openSignInModal();
                        return;
                      }
                      addToCartMutation.mutate({ proceed: true });
                    }}
                    disabled={addToCartMutation.isPending}
                    data-testid="button-book-now"
                  >
                    {addToCartMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Booking...
                      </>
                    ) : (
                      <>
                        <BookOpen className="w-4 h-4 mr-2" />
                        Book on Traveloure
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (!user) {
                        openSignInModal();
                        return;
                      }
                      addToCartMutation.mutate({ proceed: false });
                    }}
                    disabled={addToCartMutation.isPending}
                    data-testid="button-add-to-cart"
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>

                  <Button
                    variant="ghost"
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

                {/* Provider commission transparency. §8: no hardcoded rate literal —
                    the real split is config-resolved server-side (fee_bands /
                    resolveCommissionRates), so the old "90% / 10%" numbers were both a
                    fee-literal violation and potentially wrong. State the model without
                    a fabricated number. */}
                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs text-muted-foreground text-center">
                    A platform service fee is deducted from each booking; the provider
                    receives the remainder.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ReviewCard({ review, serviceId }: { review: Review; serviceId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const flagMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/reviews/${review.id}/flag`, { reason: flagReason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", serviceId, "reviews"] });
      toast({ title: "Review reported", description: "Thank you. A moderator will review your report." });
      setFlagOpen(false);
      setFlagReason("");
    },
    onError: () => toast({ title: "Failed to report review", variant: "destructive" }),
  });

  if (review.status === "removed") {
    return (
      <div className="border-b last:border-0 pb-4 last:pb-0 text-sm text-muted-foreground italic" data-testid={`card-review-${review.id}`}>
        This review has been removed by a moderator.
      </div>
    );
  }

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
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${star <= review.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`}
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
            <p className="text-sm text-muted-foreground mb-1">
              {format(new Date(review.createdAt), "MMM d, yyyy")}
            </p>
            {review.reviewText && (
              <p className="text-sm" data-testid={`text-review-${review.id}`}>
                {review.reviewText}
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
          </div>
          {user && review.travelerId !== user.id && (
            <button
              onClick={() => setFlagOpen(true)}
              className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded"
              title="Report this review"
              data-testid={`button-flag-review-${review.id}`}
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this review</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Let us know why this review is inappropriate. Our moderation team will review it.
          </p>
          <Textarea
            placeholder="Describe the issue (optional)"
            value={flagReason}
            onChange={e => setFlagReason(e.target.value)}
            className="h-24"
            data-testid="input-flag-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagOpen(false)}>Cancel</Button>
            <Button
              onClick={() => flagMutation.mutate()}
              disabled={flagMutation.isPending}
              data-testid="button-submit-flag"
            >
              {flagMutation.isPending ? "Submitting…" : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
