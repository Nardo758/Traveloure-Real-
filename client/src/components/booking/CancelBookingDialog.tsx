/**
 * THE ONE TRAVELER CANCELLATION DIALOG.
 *
 * Ledger `2026-09-14-transport-card-cancel`; punchlist R-2. CLAUDE.md §13, §14, §18 rule 1.
 *
 * Extracted verbatim from `my-bookings.tsx`, which authored it, so the transport card can REUSE
 * it rather than grow a second one. A second confirmation dialog on the same rail is the
 * derivation-drift class §18 rule 1 names: two places would decide how a refund is worded, and
 * the day the policy vocabulary moved only one of them would follow.
 *
 * §14 — NOT ONE NUMBER ON THIS SURFACE IS COMPUTED HERE. Every amount, percentage and sentence
 * comes from the server: `GET /api/bookings/:id/cancel-preview` before the traveler confirms
 * (the same quote the cancel route itself will act on), and the cancel response afterwards. This
 * component formats what it is handed and derives nothing — no policy branch, no rate, no
 * time-to-start arithmetic, no "you will get X back" of its own.
 *
 * §13 — WHAT IT SAYS WHEN IT DOES NOT KNOW. The confirm button stays DISABLED until the server's
 * quote has arrived: a traveler is never asked to confirm a cancellation whose consequence
 * nobody has stated. The post-cancel toast reports a refund ONLY when the server's own response
 * says one was issued (`refund.issued`) — never inferred from a status flip, and never from the
 * preview, which is a quote and not a receipt.
 *
 * NEGATIVE SPACE: this component does not decide WHETHER a booking may be cancelled — the
 * surface that mounts it does, from the shared `@shared/booking-cancellation` list the server
 * route reads — and it does not invalidate any caller's queries. `onCancelled` hands the server's
 * own response back so each surface refreshes its own keys.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** The shape `GET /api/bookings/:id/cancel-preview` returns. Read, never recomputed. */
export interface CancelPreview {
  policyType: string;
  policyDefaulted: boolean;
  refundPercent: number;
  refundAmount: number;
  totalAmount: number;
  hoursUntilStart: number | null;
  automaticRefundAllowed: boolean;
  message: string;
  cancellable: boolean;
  bookingStatus: string;
}

/** The refund statement `POST /api/bookings/:id/cancel` returns. The server's word, verbatim. */
export interface CancelRefundResult {
  policyType?: string;
  refundPercent?: number;
  refundAmount?: number;
  message?: string;
  issued?: boolean;
}

export interface CancelBookingResult {
  status?: string;
  refund?: CancelRefundResult;
  [key: string]: unknown;
}

interface CancelBookingDialogProps {
  /** `service_bookings.id` — the id the cancel route takes. */
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The server's own cancel response, handed back so the caller can refresh its own queries. */
  onCancelled?: (result: CancelBookingResult) => void;
  /** Suffix for this dialog's data-testids. Defaults to the booking id. */
  testIdSuffix?: string;
}

export function CancelBookingDialog({
  bookingId,
  open,
  onOpenChange,
  onCancelled,
  testIdSuffix,
}: CancelBookingDialogProps) {
  const { toast } = useToast();
  const suffix = testIdSuffix ?? bookingId;

  // Fetched only while the dialog is open, so the traveler sees the exact refund consequence the
  // server will act on before confirming.
  const { data: cancelPreview, isLoading: previewLoading } = useQuery<CancelPreview>({
    queryKey: [`/api/bookings/${bookingId}/cancel-preview`],
    enabled: open,
    staleTime: 0,
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/bookings/${bookingId}/cancel`, { reason: "Cancelled by traveler" }),
    onSuccess: async (res: any) => {
      const data: CancelBookingResult =
        typeof res?.json === "function" ? await res.json() : res;
      onOpenChange(false);
      const refund = data?.refund;
      toast({
        title: "Booking cancelled",
        description: refund?.issued
          ? `A refund of $${Number(refund.refundAmount).toFixed(2)} has been issued to your original payment method.`
          : "No automatic refund was issued for this cancellation.",
      });
      onCancelled?.(data);
    },
    onError: () => {
      toast({
        title: "Could not cancel booking",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`dialog-cancel-${suffix}`}>
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            Review your refund before confirming — this is based on the service's cancellation policy.
          </DialogDescription>
        </DialogHeader>
        {previewLoading || !cancelPreview ? (
          <div
            className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
            data-testid={`cancel-preview-loading-${suffix}`}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Calculating your refund…
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Amount paid</span>
                <span className="font-medium">${cancelPreview.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Refund ({cancelPreview.refundPercent}%)</span>
                <span
                  className={`font-bold ${cancelPreview.refundAmount > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
                  data-testid={`text-refund-amount-${suffix}`}
                >
                  ${cancelPreview.refundAmount.toFixed(2)}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground" data-testid={`text-refund-policy-message-${suffix}`}>
              {cancelPreview.message}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid={`button-cancel-dialog-close-${suffix}`}
          >
            Keep booking
          </Button>
          <Button
            variant="destructive"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || previewLoading || !cancelPreview}
            data-testid={`button-cancel-confirm-${suffix}`}
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cancelling…
              </>
            ) : (
              "Confirm cancellation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
