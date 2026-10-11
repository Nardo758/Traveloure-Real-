/**
 * `StayBookButton` — S1-d-3b (ledger `2026-10-11-s1-d3b-stay-book-ui`; S1-d-3 ruling 3): "Book" in the item
 * sheet, beside "Book this for me", on a stay the server says is bookable. It asks the server to re-quote and
 * prebook (the price shown is the server's, before the SDK opens), then mounts Nuitée's Payment SDK, which
 * returns the traveler to `/plans/:tripId/stays/:itemId/booked` where the booking is completed. The card never
 * touches our server; the offer, price and payment method are never the page's to choose.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mountPaymentSdk } from "@/lib/liteapi-payment-sdk";
import {
  STAY_BOOK_WORDS,
  paymentSdkPublicKey,
  postStayBooking,
  stayBookedReturnPath,
  stayPriceText,
  stayRefusalText,
  type StayPrebook,
} from "@/lib/stay-booking";

type Phase = { kind: "idle" } | { kind: "checking" } | { kind: "price"; pre: StayPrebook } | { kind: "paying" } | { kind: "refused"; text: string };

export function StayBookButton({ tripId, itemId, hotelName }: { tripId: string; itemId: string; hotelName: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const target = `liteapi-payment-${itemId}`;

  const start = async () => {
    setOpen(true);
    setPhase({ kind: "checking" });
    try {
      const out = await postStayBooking(tripId, itemId, "prebook");
      setPhase(out.state === "prebooked" ? { kind: "price", pre: out as StayPrebook } : { kind: "refused", text: stayRefusalText(out.state) });
    } catch (e: any) {
      setPhase({ kind: "refused", text: e?.message || stayRefusalText("") });
    }
  };

  const pay = async (pre: StayPrebook) => {
    const publicKey = paymentSdkPublicKey(pre.env);
    if (!publicKey) return setPhase({ kind: "refused", text: stayRefusalText("booking_unavailable") });
    setPhase({ kind: "paying" });
    try {
      await mountPaymentSdk({
        publicKey,
        secretKey: pre.secretKey,
        targetSelector: `#${target}`,
        returnUrl: `${window.location.origin}${stayBookedReturnPath(tripId, itemId)}`,
        businessName: "Traveloure",
      });
    } catch {
      setPhase({ kind: "refused", text: stayRefusalText("booking_unavailable") });
    }
  };

  return (
    <>
      <Button size="sm" onClick={start} data-testid={`item-sheet-stay-book-${itemId}`}>
        {STAY_BOOK_WORDS.book}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid={`stay-book-dialog-${itemId}`}>
          <DialogHeader>
            <DialogTitle>{hotelName}</DialogTitle>
            <DialogDescription>
              {phase.kind === "price" ? `${phase.pre.checkin} → ${phase.pre.checkout} · ${phase.pre.adults} adult${phase.pre.adults === 1 ? "" : "s"}` : " "}
            </DialogDescription>
          </DialogHeader>
          {phase.kind === "checking" ? <p className="text-sm text-muted-foreground">{STAY_BOOK_WORDS.checking}</p> : null}
          {phase.kind === "refused" ? (
            <p className="text-sm" data-testid={`stay-book-refusal-${itemId}`}>
              {phase.text}
            </p>
          ) : null}
          {phase.kind === "price" ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{STAY_BOOK_WORDS.priceLead}</p>
                <p className="text-2xl font-semibold" data-testid={`stay-book-price-${itemId}`}>
                  {stayPriceText(phase.pre.amountCents, phase.pre.currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{STAY_BOOK_WORDS.priceNote}</p>
              </div>
              <Button onClick={() => pay(phase.pre)} data-testid={`stay-book-continue-${itemId}`}>
                {STAY_BOOK_WORDS.continue}
              </Button>
            </div>
          ) : null}
          {phase.kind === "paying" ? <p className="text-sm text-muted-foreground">{STAY_BOOK_WORDS.paying}</p> : null}
          {/* Nuitée's Payment SDK mounts here; no field inside it is ours. */}
          <div id={target} data-testid={`stay-book-sdk-${itemId}`} />
        </DialogContent>
      </Dialog>
    </>
  );
}
