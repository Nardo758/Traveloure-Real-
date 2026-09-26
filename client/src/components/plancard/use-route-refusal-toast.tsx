/**
 * The routing rail's refusal toast, with "Reopen plan" where the server's code calls for it
 * (ledger `2026-09-26-finalized-checkout-messages`). The wording is `routeRefusalNotice`'s
 * (client/src/lib/route-refusal.ts); the reopen is the ONE `useReopenMutation` (§18 rule 1).
 * Mount only on OWNER surfaces — the reopen rail is owner-gated server-side, and it stays the gate.
 */
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { bulkOffersReopen, routeRefusalNotice } from "@/lib/route-refusal";
import type { BulkRouteResult } from "@/lib/slip-plan-actions";
import { summarizeBulkRoute } from "@/lib/slip-plan-actions";
import { useReopenMutation } from "./use-reopen-mutation";

export function useRouteRefusalToast(tripId: string | null | undefined) {
  const { toast } = useToast();
  const reopen = useReopenMutation(tripId ?? "");

  const reopenAction = () =>
    tripId ? (
      <ToastAction
        altText="Reopen plan"
        data-testid="toast-action-reopen-plan"
        onClick={() =>
          reopen.mutate(undefined, {
            onSuccess: () =>
              toast({
                title: "Plan reopened",
                description: "Finalize it again when it's ready, then book it.",
              }),
          })
        }
      >
        Reopen plan
      </ToastAction>
    ) : undefined;

  /** ONE refused item. */
  const showRefusal = (err: unknown, fallbackTitle: string, fallbackDescription?: string) => {
    const notice = routeRefusalNotice(err, fallbackTitle, fallbackDescription);
    toast({
      title: notice.title,
      description: notice.description,
      variant: notice.offerReopen ? undefined : "destructive",
      action: notice.offerReopen ? reopenAction() : undefined,
    });
  };

  /** A bulk result: the existing summary, plus Reopen when any failure was a finalized-plan refusal. */
  const showBulkResult = (result: BulkRouteResult) => {
    toast({
      ...summarizeBulkRoute(result),
      action: bulkOffersReopen(result.failed) ? reopenAction() : undefined,
    });
  };

  return { showRefusal, showBulkResult };
}
