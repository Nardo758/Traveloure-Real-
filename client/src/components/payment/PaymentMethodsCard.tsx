/**
 * PaymentMethodsCard — FP-2: traveler-facing saved-card management.
 *
 * Thin UI over FP-1's /api/me/payment-methods (list/default/remove). Lives on the traveler
 * profile page; built as a standalone component so any other traveler-facing surface can
 * reuse it without duplicating the fetch/mutation wiring.
 *
 * Honest states (§13): unavailable (Stripe unconfigured) and empty (no cards yet) both render
 * as plain text, never a fabricated card.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSavedPayment, type SavedCard } from "@/hooks/use-saved-payment";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { CreditCard, Trash2, Loader2, Check } from "lucide-react";

function CardRow({
  card,
  isDefault,
  onSetDefault,
  onRemove,
  busy,
}: {
  card: SavedCard;
  isDefault: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
      data-testid={`row-payment-method-${card.id}`}
    >
      <div className="flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground dark:text-white">
            {brand} ••{card.last4}
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {String(card.expMonth).padStart(2, "0")}/{card.expYear}
          </p>
        </div>
        {isDefault && (
          <Badge variant="secondary" className="gap-1">
            <Check className="w-3 h-3" /> Default
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isDefault && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSetDefault}
            disabled={busy}
            data-testid={`button-set-default-${card.id}`}
          >
            Set default
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          disabled={busy}
          data-testid={`button-remove-card-${card.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function PaymentMethodsCard() {
  const { toast } = useToast();
  const { available, methods, defaultPaymentMethodId, isLoading, refresh } = useSavedPayment(true);
  const [removeTarget, setRemoveTarget] = useState<SavedCard | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const setDefaultMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      setPendingId(paymentMethodId);
      const res = await apiRequest("POST", "/api/me/payment-methods/default", { paymentMethodId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Default card updated" });
      refresh();
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update default card", description: err?.message, variant: "destructive" });
    },
    onSettled: () => setPendingId(null),
  });

  const removeMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      setPendingId(paymentMethodId);
      const res = await apiRequest("DELETE", `/api/me/payment-methods/${paymentMethodId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Card removed" });
      refresh();
    },
    onError: (err: any) => {
      toast({ title: "Couldn't remove card", description: err?.message, variant: "destructive" });
    },
    onSettled: () => {
      setPendingId(null);
      setRemoveTarget(null);
    },
  });

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-lg text-foreground dark:text-white flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-muted-foreground" />
          Payment Methods
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Saved cards let you pay booking and coordination fees with one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !available ? (
          <p className="text-sm text-muted-foreground" data-testid="text-payment-methods-unavailable">
            Payment methods aren't available right now. Try again later.
          </p>
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-payment-methods-empty">
            No saved cards yet. A card is saved automatically the next time you pay for a booking or fee.
          </p>
        ) : (
          <div className="space-y-2">
            {methods.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                isDefault={card.id === defaultPaymentMethodId}
                onSetDefault={() => setDefaultMutation.mutate(card.id)}
                onRemove={() => setRemoveTarget(card)}
                busy={pendingId === card.id}
              />
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this card?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && (
                <>
                  {removeTarget.brand.charAt(0).toUpperCase() + removeTarget.brand.slice(1)} ••{removeTarget.last4}{" "}
                  will be removed from your account. You can add it again at your next checkout.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-card">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
              disabled={removeMutation.isPending}
              data-testid="button-confirm-remove-card"
            >
              {removeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
