import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, CheckCircle, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import StripeCheckout from "./StripeCheckout";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export interface ActivityBookingItem {
  provider: string;
  productCode?: string | null;
  title: string;
  price: number;
  currency: string;
  imageUrl?: string | null;
  bookingUrl?: string | null;
}

interface BookActivityModalProps {
  activity: ActivityBookingItem;
  trigger: React.ReactNode;
}

type ModalStep = "details" | "payment" | "confirmed";

export default function BookActivityModal({ activity, trigger }: BookActivityModalProps) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>("details");
  const [creating, setCreating] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
  } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [confirmedPaymentId, setConfirmedPaymentId] = useState<string | null>(null);

  const handleOpen = () => {
    if (!user) {
      openSignInModal();
      return;
    }
    setOpen(true);
    setStep("details");
    setPaymentIntent(null);
    setBookingId(null);
    setConfirmedPaymentId(null);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const startCheckout = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/bookings/activity/checkout", {
        provider: activity.provider,
        productCode: activity.productCode || null,
        title: activity.title,
        price: activity.price,
        currency: activity.currency || "USD",
        imageUrl: activity.imageUrl || null,
        bookingUrl: activity.bookingUrl || null,
      });
      const data = await res.json();
      if (!data.clientSecret) throw new Error(data.error || "Failed to create checkout");
      setPaymentIntent({
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId,
        amount: data.amount,
      });
      setBookingId(data.bookingId);
      setStep("payment");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Checkout failed", description: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    try {
      if (bookingId) {
        await apiRequest("POST", "/api/bookings/activity/confirm", { bookingId, paymentIntentId });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/my-activity-bookings"] });
      setConfirmedPaymentId(paymentIntentId);
      setStep("confirmed");
    } catch {
      setStep("confirmed");
    }
  };

  const handlePaymentError = (error: string) => {
    toast({ variant: "destructive", title: "Payment failed", description: error });
  };

  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: activity.currency || "USD",
    minimumFractionDigits: 0,
  }).format(activity.price);

  return (
    <>
      <span onClick={handleOpen} className="cursor-pointer">
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="modal-book-activity">
          <DialogHeader>
            <DialogTitle>
              {step === "details" && "Book Activity"}
              {step === "payment" && "Complete Payment"}
              {step === "confirmed" && "Booking Confirmed!"}
            </DialogTitle>
            <DialogDescription>
              {step === "details" && "Review details and proceed to secure payment"}
              {step === "payment" && "Your payment is processed securely via Stripe"}
              {step === "confirmed" && "Your activity has been booked successfully"}
            </DialogDescription>
          </DialogHeader>

          {/* Step: Details */}
          {step === "details" && (
            <div className="space-y-4">
              {activity.imageUrl && (
                <div className="h-44 rounded-lg overflow-hidden">
                  <img
                    src={activity.imageUrl}
                    alt={activity.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-base leading-snug" data-testid="modal-activity-title">
                    {activity.title}
                  </h3>
                  <Badge variant="outline" className="capitalize flex-shrink-0 text-xs">
                    {activity.provider}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-primary" data-testid="modal-activity-price">
                    {formattedPrice}
                  </span>
                  <span className="text-xs text-muted-foreground">per person</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
                <p>You will be charged <strong>{formattedPrice}</strong> through our secure platform.</p>
                <p>A reference link to the provider will be included in your booking confirmation.</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleClose} data-testid="button-cancel-booking">
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={startCheckout}
                  disabled={creating}
                  data-testid="button-proceed-to-payment"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>Proceed to Payment</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Payment */}
          {step === "payment" && paymentIntent && (
            <StripeCheckout
              paymentIntent={paymentIntent}
              bookingIds={bookingId ? [bookingId] : []}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onCancel={() => setStep("details")}
            />
          )}

          {/* Step: Confirmed */}
          {step === "confirmed" && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg" data-testid="modal-confirm-title">Payment Successful!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your booking for <strong>{activity.title}</strong> is confirmed.
                </p>
                {confirmedPaymentId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Reference: {confirmedPaymentId.slice(-8).toUpperCase()}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-left space-y-1">
                <p className="text-muted-foreground">
                  To complete your experience with the provider, visit their site using the link below.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {activity.bookingUrl && (
                  <a
                    href={activity.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-view-with-provider"
                  >
                    <Button variant="outline" className="w-full">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View with Provider
                    </Button>
                  </a>
                )}
                <Button
                  asChild
                  className="w-full"
                  data-testid="button-view-my-bookings"
                >
                  <a href="/bookings">View My Bookings</a>
                </Button>
                <Button variant="ghost" className="w-full" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
