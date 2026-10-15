/**
 * `StayCancelButton` — the traveler's cancel sheet for a LiteAPI stay (ledger
 * `2026-10-15-liteapi-cancel-with-charges`). Step one asks; when the server answers `charges_apply` (the stored
 * policy says cancelling now costs money), step two shows the policy and the amount the server stated and sends
 * `acknowledgeCharges` only after the traveler confirms again. No figure is computed here.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  STAY_CANCEL_WORDS,
  postStayBooking,
  stayBookingQueryKey,
  stayCancelChargeLines,
  stayRefusalText,
  type StayCancelTerms,
} from "@/lib/stay-booking";

type Phase = { kind: "ask" } | { kind: "working" } | { kind: "charges"; terms: StayCancelTerms } | { kind: "done"; text: string };

export function StayCancelButton({ tripId, itemId, hotelName }: { tripId: string; itemId: string; hotelName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });

  const send = async (acknowledgeCharges: boolean) => {
    setPhase({ kind: "working" });
    try {
      const out = await postStayBooking(tripId, itemId, "cancel", acknowledgeCharges ? { acknowledgeCharges: true } : {});
      if (out.state === "charges_apply") {
        return setPhase({ kind: "charges", terms: { policy: out.policy ?? null, deadline: out.deadline ?? null, amount: out.amount ?? null, currency: out.currency ?? null } });
      }
      setPhase({ kind: "done", text: stayRefusalText(out.state) });
    } catch (e: any) {
      setPhase({ kind: "done", text: e?.message || stayRefusalText("") });
    }
    qc.invalidateQueries({ queryKey: stayBookingQueryKey(tripId, itemId) });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setPhase({ kind: "ask" });
          setOpen(true);
        }}
        data-testid={`item-sheet-stay-cancel-${itemId}`}
      >
        {STAY_CANCEL_WORDS.open}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* z-[111]: opened from the item sheet, whose overlay sits at z-[100] (the StayBookButton precedent). */}
        <DialogContent className="z-[111]" data-testid={`stay-cancel-dialog-${itemId}`}>
          <DialogHeader>
            <DialogTitle>{phase.kind === "charges" ? STAY_CANCEL_WORDS.chargesTitle : STAY_CANCEL_WORDS.confirmTitle}</DialogTitle>
            <DialogDescription>{hotelName}</DialogDescription>
          </DialogHeader>
          {phase.kind === "ask" ? <p className="text-sm">{STAY_CANCEL_WORDS.confirmBody}</p> : null}
          {phase.kind === "working" ? <p className="text-sm text-muted-foreground">{STAY_CANCEL_WORDS.working}</p> : null}
          {phase.kind === "charges" ? (
            <div className="space-y-1 text-sm" data-testid={`stay-cancel-charges-${itemId}`}>
              {stayCancelChargeLines(phase.terms).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          {phase.kind === "done" ? (
            <p className="text-sm" data-testid={`stay-cancel-result-${itemId}`}>
              {phase.text}
            </p>
          ) : null}
          <DialogFooter>
            {phase.kind === "ask" || phase.kind === "charges" ? (
              <Button variant="outline" onClick={() => setOpen(false)}>
                {STAY_CANCEL_WORDS.keep}
              </Button>
            ) : null}
            {phase.kind === "ask" ? (
              <Button variant="destructive" onClick={() => send(false)} data-testid={`stay-cancel-confirm-${itemId}`}>
                {STAY_CANCEL_WORDS.confirm}
              </Button>
            ) : null}
            {phase.kind === "charges" ? (
              <Button variant="destructive" onClick={() => send(true)} data-testid={`stay-cancel-accept-${itemId}`}>
                {STAY_CANCEL_WORDS.acceptAndCancel}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
