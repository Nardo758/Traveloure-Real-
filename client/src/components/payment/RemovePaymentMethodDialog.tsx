/**
 * R3 U8a - the remove confirm, extracted from PaymentMethodsCard so the profile card and the R3 page render the SAME
 * dialog with the SAME copy and the SAME test ids.
 */
import { Loader2 } from "lucide-react";
import { savedPaymentMethodLabel } from "@shared/saved-payment-method";
import type { SavedCard } from "@/hooks/use-saved-payment";
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

export function RemovePaymentMethodDialog({
  target,
  pending,
  onOpenChange,
  onConfirm,
}: {
  target: SavedCard | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this payment method?</AlertDialogTitle>
          <AlertDialogDescription>
            {target ? `${savedPaymentMethodLabel(target)} will be removed from your account. You can add it again later.` : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-remove-card">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            data-testid="button-confirm-remove-card"
          >
            {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
