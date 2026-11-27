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
import { useSavedPayment, type SavedCard } from "@/hooks/use-saved-payment";
import { savedPaymentMethodLabel } from "@shared/saved-payment-method";
import { AddCardDialog } from "@/components/payment/AddCardDialog";
import { RemovePaymentMethodDialog } from "@/components/payment/RemovePaymentMethodDialog";
import { usePaymentMethodActions } from "@/hooks/use-payment-method-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Trash2, Check } from "lucide-react";

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
  const label = savedPaymentMethodLabel(card);
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
      data-testid={`row-payment-method-${card.id}`}
    >
      <div className="flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground dark:text-white">
            {label}
          </p>
          {card.expMonth != null && card.expYear != null ? (
            <p className="text-xs text-muted-foreground">
              Expires {String(card.expMonth).padStart(2, "0")}/{card.expYear}
            </p>
          ) : null}
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
  const { available, methods, defaultPaymentMethodId, isLoading } = useSavedPayment(true);
  const [removeTarget, setRemoveTarget] = useState<SavedCard | null>(null);
  const { setDefault, remove, pendingId, removing } = usePaymentMethodActions();

  return (
    <Card id="payment-methods" className="border border-border scroll-mt-20">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-lg text-foreground dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-muted-foreground" />
            Payment Methods
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Saved payment methods let you pay booking and coordination fees with one click. Stripe stores the details, not Traveloure.
          </CardDescription>
        </div>
        {!isLoading && available && <AddCardDialog />}
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
            No saved payment method yet. One is saved the next time you pay for a booking or fee, or you can add one now.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {methods.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                isDefault={card.id === defaultPaymentMethodId}
                onSetDefault={() => setDefault(card.id)}
                onRemove={() => setRemoveTarget(card)}
                busy={pendingId === card.id}
              />
            ))}
          </div>
        )}
      </CardContent>

      <RemovePaymentMethodDialog
        target={removeTarget}
        pending={removing}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          const id = removeTarget.id;
          setRemoveTarget(null);
          remove(id);
        }}
      />
    </Card>
  );
}
