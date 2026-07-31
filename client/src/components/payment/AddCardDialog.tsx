/**
 * AddCardDialog — H7: the add-card flow (Stripe SetupIntent).
 *
 * Standard "vault a card for future off-session charges" flow: the server creates a
 * SetupIntent (POST /api/me/payment-methods/setup-intent — no amount anywhere on this path,
 * §14-clean by construction, a SetupIntent moves no money) and this dialog confirms it via
 * Stripe Elements. On success the saved-card list is invalidated so the new card appears
 * immediately.
 *
 * Deliberately NOT StripeCheckout (that component is PaymentIntent-shaped, confirmPayment).
 * This one uses stripe.confirmSetup against a SetupIntent client secret.
 *
 * Honest states (§13): unavailable (Stripe unconfigured / setup-intent 503) renders plain text,
 * never a fake form.
 */
import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, AlertCircle, Lock } from "lucide-react";

// Own module-scoped promise cache — deliberately not shared with StripeCheckout's, so this
// dialog has no dependency on that (PaymentIntent-shaped) component.
let _stripePromise: ReturnType<typeof loadStripe> | undefined;
function getStripePromise() {
  if (!_stripePromise) {
    _stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");
  }
  return _stripePromise;
}

function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !isReady) return;

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}`,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message || "Couldn't save the card.");
        return;
      }
      if (setupIntent?.status === "succeeded") {
        onSuccess();
        return;
      }
      setErrorMessage(
        setupIntent?.status
          ? `Couldn't save the card (status: ${setupIntent.status}). Please try again.`
          : "Couldn't save the card. Please try again."
      );
    } catch (err: any) {
      setErrorMessage(err?.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-add-card">
      <div className="border border-border rounded-lg p-3 min-h-[180px]">
        <PaymentElement
          onReady={() => setIsReady(true)}
          onLoadError={(e) => setErrorMessage(e.error.message || "Failed to load payment form")}
        />
        {!isReady && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading payment form...
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg" data-testid="text-add-card-error">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>Your card details are handled directly by Stripe and never touch our servers.</span>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="button-cancel-add-card"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !isReady || isSubmitting}
          data-testid="button-confirm-add-card"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save card
        </Button>
      </div>
    </form>
  );
}

export function AddCardDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stripe, setStripe] = useState<Stripe | null>(null);

  const setupIntentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/me/payment-methods/setup-intent");
      return (await res.json()) as { clientSecret: string };
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't start the add-card flow",
        description: err?.message || "Payments aren't available right now.",
        variant: "destructive",
      });
    },
  });

  const handleOpen = () => {
    setOpen(true);
    setupIntentMutation.mutate();
    if (!stripe) getStripePromise().then(setStripe);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/me/payment-methods"] });
    toast({ title: "Card added" });
    setOpen(false);
    setupIntentMutation.reset();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setupIntentMutation.reset();
  };

  const clientSecret = setupIntentMutation.data?.clientSecret;
  const loading = setupIntentMutation.isPending || (!stripe && !setupIntentMutation.isError);

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} data-testid="button-add-card">
        <Plus className="w-4 h-4 mr-1.5" />
        Add card
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a card</DialogTitle>
            <DialogDescription>
              Save a card to pay booking and coordination fees with one click.
            </DialogDescription>
          </DialogHeader>

          {setupIntentMutation.isError ? (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-add-card-unavailable">
              Adding a card isn't available right now. Try again later.
            </p>
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Preparing secure form...
            </div>
          ) : clientSecret && stripe ? (
            <Elements
              stripe={stripe}
              options={{
                clientSecret,
                appearance: { theme: "stripe" },
              }}
            >
              <AddCardForm onSuccess={handleSuccess} onCancel={() => handleOpenChange(false)} />
            </Elements>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-add-card-unavailable">
              Adding a card isn't available right now. Try again later.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
