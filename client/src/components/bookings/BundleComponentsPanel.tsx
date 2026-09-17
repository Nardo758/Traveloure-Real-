/**
 * A PURCHASED BUNDLE'S PARTS, AND WHAT SETTLED — one panel, two audiences.
 *
 * Ledger `2026-09-17-surfaces-quotes-settlement`. Locked Decisions 48 and 50 gave a bundle
 * per-component rows, three write rails and a settlement, and no surface at all: a traveler could
 * not see which part had failed and a seller had no button to say one would not be delivered. This
 * reads the ONE new read (`GET /api/bookings/:id/components`) and calls only rails that already
 * exist:
 *   seller   POST /api/{provider|expert}/bookings/:id/component-failed
 *   traveler POST /api/bookings/:id/components/:componentServiceId/cancel
 *
 * IT IS ONE COMPONENT WITH AN AUDIENCE, NOT TWO. The traveler's view and the seller's view read the
 * same rows and must agree about them; a second panel is the drift class §18 rule 1 names.
 *
 * NO NUMBER IS SHOWN BEFORE THE ACT (§13). There is no server preview of a component cancellation —
 * the percent is resolved from the SNAPSHOTTED policy inside the cancel's own atomic statement, so
 * nothing can promise it beforehand. The dialog says what decides it and shows the pinned percent
 * and the refunded amount AFTERWARDS, off the row (`COMPONENT_CANCEL_NO_PREVIEW_NOTE`).
 *
 * NO CAPACITY CLAIM IS RENDERED. Both write rails answer `componentCapacity: { released: 0, reason:
 * "no_component_capacity_reserved" }` — the code stating that nothing per-component was reserved.
 * A "0 released" line would describe a release that does not exist, so none is drawn.
 *
 * "PREPARED, AWAITING" IS NOT "REFUNDED". A failed or cancelled part with a known allocation has
 * had nothing refunded until `refunded_at` is stamped; a settlement row with no `settled_at` is
 * claimed, not settled. Both distinctions live in `bundle-component-state-copy.ts` and this file
 * restates neither.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, PackageOpen, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiRefusalMessage } from "@/lib/api-refusal";
import { useToast } from "@/hooks/use-toast";
import {
  COMPONENT_CANCEL_NO_PREVIEW_NOTE,
  componentAllocationLine,
  componentCanBeCancelled,
  componentCanBeMarkedFailed,
  componentCancelTermsLine,
  componentRefundLine,
  componentSourceNote,
  componentStateCopy,
  componentsAreActionable,
  settlementReadout,
  type BundleComponentStateRow,
  type BundleSettlementRow,
} from "@/lib/bundle-component-state-copy";

const TONE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  waiting: "secondary",
  good: "default",
  bad: "destructive",
  money: "outline",
};

interface ComponentsResponse {
  bookingId: string;
  audience: "traveler" | "seller";
  bookingStatus?: string;
  source: string;
  components: BundleComponentStateRow[];
  settlement?: BundleSettlementRow;
}

export interface BundleComponentsPanelProps {
  bookingId: string;
  /** Which person is looking. The SERVER decides what they may do; this decides what is drawn. */
  audience: "traveler" | "seller";
  /**
   * Which of the two identical seller rails to call. Both are the same handler mounted twice
   * (`/api/provider/...` and `/api/expert/...`); the console that mounts this panel names its own.
   */
  sellerRail?: "provider" | "expert";
}

export function BundleComponentsPanel({ bookingId, audience, sellerRail = "provider" }: BundleComponentsPanelProps) {
  const { toast } = useToast();
  const [cancelTarget, setCancelTarget] = useState<BundleComponentStateRow | null>(null);
  const [failTarget, setFailTarget] = useState<BundleComponentStateRow | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery<ComponentsResponse>({
    queryKey: [`/api/bookings/${bookingId}/components`],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/components`] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
    queryClient.invalidateQueries({ queryKey: [`/api/${sellerRail}/bookings`] });
  };

  const markFailed = useMutation({
    mutationFn: (row: BundleComponentStateRow) =>
      apiRequest("POST", `/api/${sellerRail}/bookings/${bookingId}/component-failed`, {
        componentServiceId: row.componentServiceId,
        ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setFailTarget(null);
      setReason("");
      toast({
        title: "Recorded as not delivered",
        description:
          "This part's allocated amount goes back to the traveler when the bundle settles. What you delivered is unaffected.",
      });
    },
    onError: (err: unknown) =>
      toast({
        title: "Not recorded",
        description: apiRefusalMessage(err, "This part could not be marked as not delivered."),
        variant: "destructive",
      }),
  });

  const cancelComponent = useMutation({
    mutationFn: (row: BundleComponentStateRow) =>
      apiRequest("POST", `/api/bookings/${bookingId}/components/${row.componentServiceId}/cancel`, {
        ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setCancelTarget(null);
      setReason("");
      toast({
        title: "Part cancelled",
        description: "What comes back is shown on this part once it is recorded — this page does not estimate it.",
      });
    },
    onError: (err: unknown) =>
      toast({
        title: "Not cancelled",
        description: apiRefusalMessage(err, "This part could not be cancelled."),
        variant: "destructive",
      }),
  });

  if (isLoading) return <Skeleton className="h-20 w-full" data-testid={`bundle-components-loading-${bookingId}`} />;
  // §13: nothing came back, or this booking is not a bundle — the panel draws nothing rather than
  // an empty "parts" heading, which would imply a bundle with no parts.
  if (!data || data.components.length === 0) return null;

  const sourceNote = componentSourceNote(data.source);
  const actionable = componentsAreActionable(data.source);
  const settlement = settlementReadout(data.settlement);

  return (
    <div className="mt-4 rounded-lg border p-4 bg-muted/20" data-testid={`bundle-components-${bookingId}`}>
      <div className="flex items-center gap-2 mb-3">
        <PackageOpen className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">What this bundle includes</span>
      </div>

      {sourceNote && (
        <p className="text-xs text-muted-foreground mb-3" data-testid={`bundle-components-source-${bookingId}`}>
          {sourceNote}
        </p>
      )}

      <div className="space-y-2">
        {data.components.map((c) => {
          const copy = componentStateCopy(c.status);
          const refundLine = componentRefundLine(c);
          const termsLine = componentCancelTermsLine(c);
          return (
            <div
              key={c.componentServiceId}
              className="rounded-md border bg-background px-3 py-2.5"
              data-testid={`bundle-component-${c.componentServiceId}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {/* §13: a part whose name was not snapshotted is named as unavailable, never
                        replaced with the live listing's current name. */}
                    {c.serviceName ?? "This part's name was not recorded"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {audience === "traveler" ? copy.traveler : copy.seller}
                  </p>
                </div>
                <Badge variant={TONE_VARIANT[copy.tone] ?? "outline"} data-testid={`bundle-component-status-${c.componentServiceId}`}>
                  {copy.label}
                </Badge>
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                <span data-testid={`bundle-component-allocation-${c.componentServiceId}`}>
                  {componentAllocationLine(c)}
                </span>
                {refundLine && (
                  <span data-testid={`bundle-component-refund-${c.componentServiceId}`}>{refundLine}</span>
                )}
              </div>
              {termsLine && (
                <p className="mt-1 text-[11px] text-muted-foreground" data-testid={`bundle-component-terms-${c.componentServiceId}`}>
                  {termsLine}
                </p>
              )}
              {c.failureReason && (
                <p className="mt-1 text-[11px]" data-testid={`bundle-component-failure-reason-${c.componentServiceId}`}>
                  Provider's reason: {c.failureReason}
                </p>
              )}
              {c.cancelReason && (
                <p className="mt-1 text-[11px]" data-testid={`bundle-component-cancel-reason-${c.componentServiceId}`}>
                  Traveler's reason: {c.cancelReason}
                </p>
              )}

              {actionable && audience === "seller" && componentCanBeMarkedFailed(c) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => { setFailTarget(c); setReason(""); }}
                  data-testid={`button-component-failed-${c.componentServiceId}`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                  Will not be delivered
                </Button>
              )}
              {actionable && audience === "traveler" && componentCanBeCancelled(c) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => { setCancelTarget(c); setReason(""); }}
                  data-testid={`button-component-cancel-${c.componentServiceId}`}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Cancel this part
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {settlement && (
        <div className="mt-3 rounded-md border bg-background px-3 py-2.5" data-testid={`bundle-settlement-${bookingId}`}>
          <p className="text-sm font-semibold" data-testid={`bundle-settlement-headline-${bookingId}`}>
            {settlement.headline}
          </p>
          <p className="text-xs text-muted-foreground mt-1" data-testid={`bundle-settlement-refund-${bookingId}`}>
            {settlement.refund}
          </p>
          {settlement.remainder && (
            <p className="text-xs text-muted-foreground mt-1" data-testid={`bundle-settlement-remainder-${bookingId}`}>
              {settlement.remainder}
            </p>
          )}
        </div>
      )}

      {/* THE TRAVELER'S CANCEL — no number before the act, by ruling. */}
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent data-testid="dialog-component-cancel">
          <DialogHeader>
            <DialogTitle>Cancel this part of your bundle?</DialogTitle>
            <DialogDescription>{COMPONENT_CANCEL_NO_PREVIEW_NOTE}</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Why are you cancelling this part? (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            data-testid="input-component-cancel-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} data-testid="button-component-cancel-abort">
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelTarget && cancelComponent.mutate(cancelTarget)}
              disabled={cancelComponent.isPending}
              data-testid="button-component-cancel-confirm"
            >
              {cancelComponent.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cancel this part
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* THE SELLER'S "WILL NOT BE DELIVERED". */}
      <Dialog open={failTarget !== null} onOpenChange={(open) => { if (!open) setFailTarget(null); }}>
        <DialogContent data-testid="dialog-component-failed">
          <DialogHeader>
            <DialogTitle>Record that this part will not be delivered?</DialogTitle>
            <DialogDescription>
              This part's allocated amount goes back to the traveler when the bundle settles, and what
              you did deliver still earns. This page does not reverse it — say why so the traveler has
              your words.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Why can this part not be delivered? (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            data-testid="input-component-failed-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailTarget(null)} data-testid="button-component-failed-abort">
              Not now
            </Button>
            <Button
              variant="destructive"
              onClick={() => failTarget && markFailed.mutate(failTarget)}
              disabled={markFailed.isPending}
              data-testid="button-component-failed-confirm"
            >
              {markFailed.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BundleComponentsPanel;
