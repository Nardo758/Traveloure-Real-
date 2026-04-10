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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, ExternalLink, CheckCircle, MapPin, Calendar,
  Users, AlertCircle, ChevronRight,
} from "lucide-react";
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

type ModalStep = "details" | "travel" | "payment" | "confirmed";

interface TravelDetails {
  travelDate: string;
  adults: number;
  productOptionCode?: string;
  startTime?: string;
  availabilityChecked: boolean;
  availabilityError?: string;
}

export default function BookActivityModal({ activity, trigger }: BookActivityModalProps) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>("details");
  const [creating, setCreating] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
  } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [confirmedPaymentId, setConfirmedPaymentId] = useState<string | null>(null);
  const [viatorBookingRef, setViatorBookingRef] = useState<string | null>(null);
  const [travelDetails, setTravelDetails] = useState<TravelDetails>({
    travelDate: "",
    adults: 1,
    availabilityChecked: false,
  });

  const isViator = activity.provider?.toLowerCase() === "viator";

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
    setViatorBookingRef(null);
    setTravelDetails({ travelDate: "", adults: 1, availabilityChecked: false });
  };

  const handleClose = () => setOpen(false);

  // Step 1 → 2: move to travel details collection (for Viator) or skip to payment
  const handleProceedFromDetails = () => {
    if (isViator && activity.productCode) {
      setStep("travel");
    } else {
      startCheckout();
    }
  };

  // Check Viator availability then proceed to payment
  const handleCheckAndPay = async () => {
    if (!travelDetails.travelDate) {
      toast({ variant: "destructive", title: "Please select a travel date" });
      return;
    }

    if (isViator && activity.productCode) {
      setCheckingAvailability(true);
      try {
        const res = await apiRequest("POST", "/api/bookings/activity/check-availability", {
          productCode: activity.productCode,
          travelDate: travelDetails.travelDate,
          adults: travelDetails.adults,
          currency: activity.currency || "USD",
        });
        const data = await res.json();

        if (!data.available || data.options.length === 0) {
          setTravelDetails(prev => ({
            ...prev,
            availabilityChecked: true,
            availabilityError: "This activity is not available on the selected date. Please choose another date.",
          }));
          return;
        }

        setTravelDetails(prev => ({
          ...prev,
          productOptionCode: data.options[0].productOptionCode,
          startTime: data.options[0].startTime,
          availabilityChecked: true,
          availabilityError: undefined,
        }));
      } catch {
        // If availability check fails, continue anyway — Viator booking will validate
        setTravelDetails(prev => ({ ...prev, availabilityChecked: true, availabilityError: undefined }));
      } finally {
        setCheckingAvailability(false);
      }
    }

    await startCheckout();
  };

  const startCheckout = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/bookings/activity/checkout", {
        provider: activity.provider,
        productCode: activity.productCode || null,
        productOptionCode: travelDetails.productOptionCode || null,
        title: activity.title,
        price: activity.price * travelDetails.adults,
        currency: activity.currency || "USD",
        imageUrl: activity.imageUrl || null,
        bookingUrl: activity.bookingUrl || null,
        travelDate: travelDetails.travelDate || null,
        travelerCount: travelDetails.adults,
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
    setConfirmedPaymentId(paymentIntentId);
    setStep("confirmed");

    try {
      // Confirm the booking in our DB
      if (bookingId) {
        await apiRequest("POST", "/api/bookings/activity/confirm", { bookingId, paymentIntentId });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/my-activity-bookings"] });

      // For Viator activities, make the actual booking with Viator's API
      if (isViator && bookingId && activity.productCode) {
        const viatorRes = await apiRequest("POST", "/api/bookings/activity/viator-book", { bookingId });
        const viatorData = await viatorRes.json();
        if (viatorData.viatorBookingRef) {
          setViatorBookingRef(viatorData.viatorBookingRef);
        }
      }
    } catch {
      // Non-blocking: confirmation or Viator booking may still succeed via webhook
    }
  };

  const handlePaymentError = (error: string) => {
    toast({ variant: "destructive", title: "Payment failed", description: error });
  };

  const totalPrice = activity.price * travelDetails.adults;
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: activity.currency || "USD",
    minimumFractionDigits: 0,
  }).format(totalPrice);

  const pricePerPerson = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: activity.currency || "USD",
    minimumFractionDigits: 0,
  }).format(activity.price);

  // Min date = tomorrow
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split("T")[0];

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
              {step === "travel" && "Travel Details"}
              {step === "payment" && "Complete Payment"}
              {step === "confirmed" && "Booking Confirmed!"}
            </DialogTitle>
            <DialogDescription>
              {step === "details" && "Review details and proceed to secure payment"}
              {step === "travel" && "When are you going and how many travelers?"}
              {step === "payment" && "Your payment is processed securely via Stripe"}
              {step === "confirmed" && "Your activity has been booked successfully"}
            </DialogDescription>
          </DialogHeader>

          {/* ── Step: Activity Details ── */}
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
                    {pricePerPerson}
                  </span>
                  <span className="text-xs text-muted-foreground">per person</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
                <p>You will be charged through our secure platform.</p>
                {isViator && activity.productCode && (
                  <p className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    We will confirm your reservation directly with Viator after payment.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleClose} data-testid="button-cancel-booking">
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleProceedFromDetails}
                  disabled={creating}
                  data-testid="button-proceed-to-payment"
                >
                  {creating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Preparing...</>
                  ) : isViator && activity.productCode ? (
                    <><Calendar className="h-4 w-4 mr-2" />Choose Dates<ChevronRight className="h-4 w-4 ml-1" /></>
                  ) : (
                    <>Proceed to Payment</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Travel Details (Viator) ── */}
          {step === "travel" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="travel-date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Travel Date
                </Label>
                <Input
                  id="travel-date"
                  type="date"
                  min={minDateStr}
                  value={travelDetails.travelDate}
                  onChange={(e) =>
                    setTravelDetails(prev => ({
                      ...prev,
                      travelDate: e.target.value,
                      availabilityChecked: false,
                      availabilityError: undefined,
                    }))
                  }
                  data-testid="input-travel-date"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Number of Adults
                </Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTravelDetails(prev => ({ ...prev, adults: Math.max(1, prev.adults - 1) }))}
                    data-testid="button-adults-minus"
                    disabled={travelDetails.adults <= 1}
                  >
                    −
                  </Button>
                  <span className="text-lg font-semibold w-8 text-center" data-testid="text-adults-count">
                    {travelDetails.adults}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTravelDetails(prev => ({ ...prev, adults: Math.min(20, prev.adults + 1) }))}
                    data-testid="button-adults-plus"
                    disabled={travelDetails.adults >= 20}
                  >
                    +
                  </Button>
                  <span className="text-sm text-muted-foreground ml-2">
                    × {pricePerPerson} = <strong>{formattedPrice}</strong>
                  </span>
                </div>
              </div>

              {travelDetails.availabilityError && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive p-3 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{travelDetails.availabilityError}</span>
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <p>We'll check availability with Viator before taking payment.</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("details")} data-testid="button-back-to-details">
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCheckAndPay}
                  disabled={!travelDetails.travelDate || checkingAvailability || creating}
                  data-testid="button-check-and-pay"
                >
                  {checkingAvailability ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking availability...</>
                  ) : creating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Preparing payment...</>
                  ) : (
                    <>Pay {formattedPrice}<ChevronRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Stripe Payment ── */}
          {step === "payment" && paymentIntent && (
            <StripeCheckout
              paymentIntent={paymentIntent}
              bookingIds={bookingId ? [bookingId] : []}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onCancel={() => setStep(isViator && activity.productCode ? "travel" : "details")}
            />
          )}

          {/* ── Step: Confirmed ── */}
          {step === "confirmed" && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg" data-testid="modal-confirm-title">
                  Payment Successful!
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your booking for <strong>{activity.title}</strong> is confirmed.
                </p>
                {travelDetails.travelDate && (
                  <p className="text-sm text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(travelDetails.travelDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short", year: "numeric", month: "long", day: "numeric",
                    })}
                    {" · "}
                    <Users className="h-3 w-3" />
                    {travelDetails.adults} adult{travelDetails.adults > 1 ? "s" : ""}
                  </p>
                )}
              </div>

              {/* Viator booking reference */}
              {viatorBookingRef ? (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-left">
                  <p className="font-semibold text-green-800 dark:text-green-300 text-xs uppercase tracking-wide mb-1">
                    Viator Booking Confirmed
                  </p>
                  <p className="font-mono text-green-900 dark:text-green-200 text-base font-bold" data-testid="text-viator-booking-ref">
                    {viatorBookingRef}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                    Save this reference number for your records. Viator will email your voucher.
                  </p>
                </div>
              ) : (
                <>
                  {confirmedPaymentId && (
                    <p className="text-xs text-muted-foreground">
                      Payment reference: {confirmedPaymentId.slice(-8).toUpperCase()}
                    </p>
                  )}
                  {isViator && activity.productCode && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-left">
                      <p className="text-amber-800 dark:text-amber-300 text-xs">
                        Your Viator booking reference will appear shortly. You can also view it in My Bookings.
                      </p>
                    </div>
                  )}
                </>
              )}

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
                <Button asChild className="w-full" data-testid="button-view-my-bookings">
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
