/**
 * TripPassCard — the slip-mounted Trip Pass offer/status card
 * (ruling 2026-08-29-trip-pass). Mounted in slip-view.tsx beside ConciergeCard.
 *
 * Earn grammar: mono price from the server row (GET /api/trips/:tripId/trip-pass —
 * the plans-row price, never a literal), ONE TEAL buy action — not coral (the slip's
 * coral budget belongs to Finalize). The card only DISPLAYS entitlement state; every
 * charge point re-checks coverage server-side.
 *
 * Purchase: the Ready-Made 2-step (POST /purchase 202 → shared StripeCheckout →
 * POST /purchase/confirm). A 409 from /purchase means the trip already holds an
 * active pass — surfaced, never retried into a second charge.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket, Loader2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StripeCheckout from "@/components/booking/StripeCheckout";
// LD 43(d): mount 1 of 2 — the Trip Pass purchase success state. Soft, dismissible, never
// blocking, and it renders only on a KNOWN-EMPTY vault (the component decides, not this file).
import { SavePaymentMethodPrompt } from "@/components/payment/SavePaymentMethodPrompt";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface TripPassStatus {
  active: boolean;
  priceCents: number;
  planName: string;
  grantedAt?: string;
}

export function TripPassCard({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const statusKey = [`/api/trips/${tripId}/trip-pass`];
  const { data: status } = useQuery<TripPassStatus>({ queryKey: statusKey, enabled: !!tripId });

  const [sheet, setSheet] = useState<{ clientSecret: string; paymentIntentId: string; amount: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!status) return null;

  const priceLabel = `$${(status.priceCents / 100).toFixed(0)}`;

  const startPurchase = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/trip-pass/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast({ title: "Already covered", description: body.message });
        void queryClient.invalidateQueries({ queryKey: statusKey });
        return;
      }
      if (!res.ok) throw new Error(body.message || "Could not start the purchase");
      setSheet({ clientSecret: body.clientSecret, paymentIntentId: body.paymentIntentId, amount: body.priceCents });
    } catch (e: any) {
      toast({ title: "Trip Pass", description: e?.message ?? "Could not start the purchase", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const confirmPurchase = async (paymentIntentId: string) => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/trip-pass/purchase/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentIntentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Could not confirm the purchase");
      toast({ title: "Trip Pass active", description: "Optimizer runs and AI tasks on this trip are now included." });
      void queryClient.invalidateQueries({ queryKey: statusKey });
    } catch (e: any) {
      toast({ title: "Trip Pass", description: e?.message ?? "Confirm failed — support can verify the payment", variant: "destructive" });
    } finally {
      setConfirming(false);
      setSheet(null);
    }
  };

  if (status.active) {
    return (
      <div className="space-y-2">
        <section
          className="flex items-center gap-2.5 rounded-lg border border-[color:var(--earn-border)] bg-[color:var(--earn-card)] px-3 py-3"
          data-testid="trip-pass-card-active"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[color:var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]">
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--earn-ink)]">Trip Pass active</p>
            <p className="text-[11px]" style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}>
              optimizer runs + AI tasks included · service fee waived on this trip
            </p>
          </div>
        </section>
        {/* LD 43(d), mount 1: after a Trip Pass purchase. The active state IS this card's purchase
            success state, and the prompt is scoped + dismissed per trip so a pass bought long ago
            stops asking after one "not now". It opens the existing AddCardDialog — no second rail. */}
        <SavePaymentMethodPrompt
          scope={`trip-pass:${tripId}`}
          message="Save a payment method for one-click bookings on this trip."
        />
      </div>
    );
  }

  return (
    <>
      {/* ── ONE COLUMN, FULL WIDTH (ledger `2026-09-06-slip-conformance`) ─────────────────────
          This was a three-across `flex-wrap` row — icon, a text block, and the buy button — which
          works at page width and fails inside the slip's 320px rail: the button takes the row, the
          text block is squeezed to a few characters, and the price line wraps roughly one word per
          line. Nothing about WHAT is shown changes; the parts are stacked so each gets the card's
          full width. The price is still the server's own `priceCents` from the plans row and is
          still never a literal (§14). */}
      <section
        className="flex flex-col gap-2 rounded-lg border border-[color:var(--earn-border)] bg-[color:var(--earn-card)] px-3 py-3"
        data-testid="trip-pass-card-offer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[color:var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]">
            <Ticket className="h-4 w-4" />
          </span>
          <p className="min-w-0 truncate text-sm font-semibold text-[color:var(--earn-ink)]">
            {status.planName || "Trip Pass"}
          </p>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}>
          <span data-testid="trip-pass-price" style={{ color: "var(--earn-teal-ink)" }}>{priceLabel}</span>
          {" "}· unlimited optimizer runs + AI tasks · 1 expert revision · service fee waived
        </p>
        <button
          type="button"
          disabled={starting}
          onClick={() => void startPurchase()}
          className="w-full rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors bg-[color:var(--earn-teal)] hover:bg-[color:var(--earn-teal-ink)] disabled:opacity-60"
          data-testid="button-buy-trip-pass"
        >
          {starting ? "Starting…" : "Get the Trip Pass"}
        </button>
      </section>

      <Dialog open={!!sheet} onOpenChange={(v) => !v && !confirming && setSheet(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Complete your purchase</DialogTitle></DialogHeader>
          {confirming ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Activating your Trip Pass…
            </div>
          ) : (
            sheet && (
              <StripeCheckout
                paymentIntent={sheet}
                bookingIds={[]}
                onSuccess={() => void confirmPurchase(sheet.paymentIntentId)}
                onError={(e: string) => toast({ title: "Payment failed", description: e, variant: "destructive" })}
                onCancel={() => setSheet(null)}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
