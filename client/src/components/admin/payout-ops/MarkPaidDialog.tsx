/**
 * Gap 9: Mark paid on one payout row — enter how and a reference, review, confirm. The amount shown is the payout
 * row's own; the route checks it against what is owed. On success the cached rows are updated in place.
 */
import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  MARK_PAID_REFERENCE_MAX,
  PAYOUT_METHOD_OPTIONS,
  PAYOUT_OPS_COPY as T,
  apiErrorMessage,
  markPaidBody,
  payoutMethodLabel,
  referenceReady,
  usd,
  withMarkedPaid,
} from "@/lib/payout-ops";

export interface MarkPaidTarget {
  id: string;
  requesterType: "expert" | "provider";
  amount: string;
  requesterName: string | null;
}

/** The dialog's body, without the portal, so it renders on its own in tests. */
export function MarkPaidPanel({
  target,
  onClose,
  initialStep = "enter",
  initialMethod = PAYOUT_METHOD_OPTIONS[0].value,
  initialReference = "",
}: {
  target: MarkPaidTarget;
  onClose: () => void;
  initialStep?: "enter" | "confirm";
  initialMethod?: string;
  initialReference?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = React.useState<"enter" | "confirm">(initialStep);
  const [method, setMethod] = React.useState<string>(initialMethod);
  const [reference, setReference] = React.useState(initialReference);

  const mark = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/admin/payouts/${encodeURIComponent(target.id)}/mark-paid`, markPaidBody(target.requesterType, method, reference))).json(),
    onSuccess: (updated: { id: string; status?: string; payoutMethod?: string; completedAt?: string }) => {
      queryClient.setQueriesData({ queryKey: ["/api/admin/payouts"] }, (rows: any) => (Array.isArray(rows) ? withMarkedPaid(rows, target.requesterType, updated) : rows));
      toast({ title: T.markPaidDone });
      onClose();
    },
    onError: (err) => toast({ title: T.markPaidFailed, description: apiErrorMessage(err) ?? undefined, variant: "destructive" }),
  });

  return (
    <div className="space-y-4" data-testid="mark-paid-panel">
      <div>
        <h2 className="text-lg font-semibold">{step === "enter" ? T.markPaidTitle : T.confirmTitle}</h2>
        <p className="text-sm text-muted-foreground">{T.markPaidDescription}</p>
      </div>
      {step === "enter" ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="mark-paid-method">{T.fieldMethod}</Label>
            <select id="mark-paid-method" data-testid="mark-paid-method" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYOUT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mark-paid-reference">{T.fieldReference}</Label>
            <Input id="mark-paid-reference" data-testid="mark-paid-reference" maxLength={MARK_PAID_REFERENCE_MAX} value={reference} onChange={(e) => setReference(e.target.value)} />
            <p className="text-xs text-muted-foreground">{T.referenceHelp}</p>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-testid="mark-paid-confirm">
          <dt className="text-muted-foreground">{T.confirmAmount}</dt>
          <dd className="font-medium">{usd(target.amount)}</dd>
          <dt className="text-muted-foreground">{T.confirmEarner}</dt>
          <dd>{target.requesterName ?? T.unnamed}</dd>
          <dt className="text-muted-foreground">{T.confirmMethod}</dt>
          <dd>{payoutMethodLabel(method)}</dd>
          <dt className="text-muted-foreground">{T.confirmReference}</dt>
          <dd className="break-words">{reference.trim()}</dd>
        </dl>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" data-testid="mark-paid-cancel" onClick={onClose}>{T.cancel}</Button>
        {step === "enter" ? (
          <Button data-testid="mark-paid-review" disabled={!referenceReady(reference)} onClick={() => setStep("confirm")}>{T.review}</Button>
        ) : (
          <>
            <Button variant="outline" data-testid="mark-paid-back" onClick={() => setStep("enter")}>{T.back}</Button>
            <Button data-testid="mark-paid-submit" disabled={mark.isPending || !referenceReady(reference)} onClick={() => mark.mutate()}>{T.confirm}</Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Mark paid on one payout row. Closing at any step (Cancel, Escape, outside click) sends nothing. */
export function MarkPaidDialog({ target, onClose }: { target: MarkPaidTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-testid="mark-paid-dialog" aria-describedby={undefined}>
        <DialogHeader className="sr-only">
          <DialogTitle>{T.markPaidTitle}</DialogTitle>
          <DialogDescription>{T.markPaidDescription}</DialogDescription>
        </DialogHeader>
        {target ? <MarkPaidPanel key={`${target.requesterType}-${target.id}`} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}
