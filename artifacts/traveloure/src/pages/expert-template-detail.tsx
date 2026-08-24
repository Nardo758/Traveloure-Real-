import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import StripeCheckout from "@/components/booking/StripeCheckout";
import {
  MapPin,
  Calendar,
  Star,
  CheckCircle,
  Lock,
  Package,
  Clock,
  Lightbulb,
} from "lucide-react";

/**
 * Public expert-package (template) detail page — Marketplace Phase B2.
 *
 * Reads the content-gated GET /api/expert-templates/:id: non-purchasers get a TEASER
 * (`itineraryPreview`: day + title only); a purchaser/owner/admin gets full `itineraryData`.
 * Purchase is the existing safe 2-step flow: POST /:id/purchase (202, PaymentIntent) →
 * Stripe Elements → POST /:id/purchase/confirm (server-verifies the intent). Price is
 * whatever the server derives — the client never sends an amount (§14).
 */

interface ItineraryActivity {
  time?: string;
  title: string;
  description: string;
  location?: string;
  tips?: string;
}
interface ItineraryDay {
  day: number;
  title: string | null;
  activities?: ItineraryActivity[];
}
interface TemplateDetail {
  id: string;
  title: string;
  description: string;
  shortDescription?: string | null;
  destination: string;
  duration: number;
  price: string;
  currency?: string | null;
  category?: string | null;
  coverImage?: string | null;
  highlights?: string[] | null;
  includes?: string[] | null;
  averageRating?: string | null;
  reviewCount?: number | null;
  salesCount?: number | null;
  // Teaser (public) vs full (purchaser/owner/admin) — exactly one is present.
  itineraryPreview?: Array<{ day: number; title: string | null }>;
  itineraryData?: { days?: ItineraryDay[] } | null;
  hasPurchased?: boolean;
}

interface PurchaseIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  purchaseId: string;
  subtotal: number;
}

export default function ExpertTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [paymentIntent, setPaymentIntent] = useState<PurchaseIntentResponse | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const { data: template, isLoading, error } = useQuery<TemplateDetail>({
    queryKey: [`/api/expert-templates/${id}`],
    enabled: !!id,
    retry: false,
  });

  const { data: reviews } = useQuery<Array<{ id: string; rating: number; review: string | null; createdAt: string }>>({
    queryKey: [`/api/expert-templates/${id}/reviews`],
    enabled: !!id,
  });

  const startPurchaseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/expert-templates/${id}/purchase`);
      return (await res.json()) as PurchaseIntentResponse;
    },
    onSuccess: (data) => setPaymentIntent(data),
    onError: (err: any) => {
      toast({
        title: "Unable to start purchase",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBuy = () => {
    if (!isAuthenticated) {
      openSignInModal();
      return;
    }
    startPurchaseMutation.mutate();
  };

  // After Stripe.js reports success, the SERVER re-verifies the intent and unlocks the
  // content (idempotent — a retry returns alreadyCompleted, never a double credit).
  const handleStripeSuccess = async (paymentIntentId: string) => {
    if (!paymentIntent) return;
    setIsConfirming(true);
    try {
      await apiRequest("POST", `/api/expert-templates/${id}/purchase/confirm`, {
        paymentIntentId,
        purchaseId: paymentIntent.purchaseId,
      });
      setPaymentIntent(null);
      queryClient.invalidateQueries({ queryKey: [`/api/expert-templates/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-purchased-templates"] });
      toast({
        title: "Purchase complete!",
        description: "The full itinerary is now unlocked below.",
      });
    } catch {
      toast({
        title: "Payment received — confirmation pending",
        description:
          "Your payment went through but unlocking hit an error. Refresh this page; if the itinerary stays locked, contact support.",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !template) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto p-6 text-center py-20">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Trip not found</h1>
          <p className="text-muted-foreground mb-6">
            This trip doesn't exist or isn't available for purchase.
          </p>
          <Link href="/discover">
            <Button variant="outline">Browse Discover</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const owned = !!template.itineraryData; // full content present ⇒ purchaser/owner/admin
  const fullDays: ItineraryDay[] = template.itineraryData?.days ?? [];
  const previewDays = template.itineraryPreview ?? [];
  const ratingNum = template.averageRating ? parseFloat(template.averageRating) : 0;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {template.coverImage && (
          <img
            src={template.coverImage}
            alt={template.title}
            className="w-full h-64 object-cover rounded-xl"
          />
        )}

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {template.category && <Badge variant="outline">{template.category}</Badge>}
              {owned && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                  <CheckCircle className="w-3 h-3 mr-1" /> Purchased
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-template-title">
              {template.title}
            </h1>
            <div className="flex items-center gap-4 text-muted-foreground mt-2 flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" /> {template.destination}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> {template.duration} days
              </span>
              {(template.reviewCount ?? 0) > 0 && ratingNum > 0 ? (
                <span className="flex items-center gap-1 text-amber-600">
                  <Star className="w-4 h-4 fill-current" /> {ratingNum.toFixed(1)} ({template.reviewCount})
                </span>
              ) : (
                <Badge variant="outline">New</Badge>
              )}
            </div>
          </div>

          {!owned && (
            <Card className="md:w-64 shrink-0">
              <CardContent className="p-4 space-y-3">
                <p className="text-3xl font-bold text-primary" data-testid="text-template-price">
                  ${template.price}
                </p>
                <Button
                  className="w-full"
                  onClick={handleBuy}
                  disabled={startPurchaseMutation.isPending}
                  data-testid="button-buy-template"
                >
                  {startPurchaseMutation.isPending ? "Preparing checkout…" : "Buy this itinerary"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Instant access to the full day-by-day itinerary after purchase.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="prose dark:prose-invert max-w-none">
          <p>{template.description}</p>
        </div>

        {(template.highlights?.length ?? 0) > 0 && (
          <Card>
            <CardContent className="p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" /> Highlights
              </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {template.highlights!.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {h}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Itinerary — full for purchasers, day-title teaser for everyone else */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Itinerary</h2>
          {owned ? (
            <div className="space-y-4">
              {fullDays.map((day) => (
                <Card key={day.day} data-testid={`day-${day.day}`}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">
                      Day {day.day}
                      {day.title ? ` — ${day.title}` : ""}
                    </h3>
                    <div className="space-y-3">
                      {(day.activities ?? []).map((act, i) => (
                        <div key={i} className="border-l-2 border-primary/30 pl-3">
                          <p className="font-medium text-sm flex items-center gap-2">
                            {act.time && (
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {act.time}
                              </span>
                            )}
                            {act.title}
                          </p>
                          <p className="text-sm text-muted-foreground">{act.description}</p>
                          {act.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="w-3 h-3" /> {act.location}
                            </p>
                          )}
                          {act.tips && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                              💡 {act.tips}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : previewDays.length > 0 ? (
            <div className="space-y-2">
              {previewDays.map((day) => (
                <Card key={day.day} className="bg-muted/40">
                  <CardContent className="p-3 flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Day {day.day}
                      {day.title ? ` — ${day.title}` : ""}
                    </p>
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
              <p className="text-sm text-muted-foreground pt-2">
                <Lock className="w-3 h-3 inline mr-1" />
                Full day-by-day details, times, locations and local tips unlock after purchase.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {template.duration}-day itinerary — full details unlock after purchase.
            </p>
          )}
        </div>

        {/* Reviews (create is purchase-gated server-side) */}
        {(reviews?.length ?? 0) > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Reviews</h2>
            <div className="space-y-3">
              {reviews!.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1 text-amber-500 mb-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < r.rating ? "fill-current" : ""}`} />
                      ))}
                    </div>
                    {r.review && <p className="text-sm text-muted-foreground">{r.review}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stripe checkout dialog — server-derived amount; confirm verifies server-side */}
      <Dialog open={!!paymentIntent} onOpenChange={(open) => !open && !isConfirming && setPaymentIntent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buy “{template.title}”</DialogTitle>
            <DialogDescription>
              One-time purchase — the full itinerary unlocks immediately after payment.
            </DialogDescription>
          </DialogHeader>
          {isConfirming ? (
            <div className="py-8 text-center text-muted-foreground">Confirming your purchase…</div>
          ) : (
            paymentIntent && (
              <StripeCheckout
                paymentIntent={{
                  clientSecret: paymentIntent.clientSecret,
                  paymentIntentId: paymentIntent.paymentIntentId,
                  amount: Math.round((paymentIntent.subtotal ?? 0) * 100),
                }}
                bookingIds={[]}
                onSuccess={handleStripeSuccess}
                onError={() => {
                  /* error message already rendered inside the Stripe form */
                }}
                onCancel={() => setPaymentIntent(null)}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
