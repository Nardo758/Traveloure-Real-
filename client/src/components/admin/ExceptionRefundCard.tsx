/**
 * Admin exception refund (lane 4 of the R154 status trace; ledger `2026-09-27-admin-exception-refund`).
 * Look up a booking, choose full or a partial amount, say why, confirm. Every rule is the server's:
 * this card shows the server's quote (what was charged, or why it cannot be refunded) and the server's
 * answer, and never computes a refund itself beyond checking the form before sending it.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Undo2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { checkExceptionRefundForm, formatCents, serverMessageOf } from "@/lib/exception-refund";

interface Quote {
  bookingId: string;
  status: string;
  bookingChargedCents: number;
  feeChargedCents: number;
  chargedCents: number;
  refusal: string | null;
  refusalMessage: string | null;
}

interface Outcome {
  refundId: string | null;
  refundedCents: number;
  bookingRefundCents: number;
  feeRefundCents: number;
  alreadyRefunded: boolean;
  skippedPaidOut: number;
  auditWarning?: string;
}

export function ExceptionRefundCard() {
  const [bookingId, setBookingId] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const reset = () => {
    setQuote(null);
    setMode("full");
    setAmount("");
    setReason("");
    setConfirming(false);
    setError(null);
    setOutcome(null);
  };

  const lookUp = async () => {
    reset();
    const id = bookingId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const res = await apiRequest("GET", `/api/admin/bookings/${encodeURIComponent(id)}/exception-refund`);
      setQuote(await res.json());
    } catch (err) {
      setError(serverMessageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const check = quote ? checkExceptionRefundForm({ mode, amount, reason, chargedCents: quote.chargedCents }) : null;

  const submit = async () => {
    if (!quote || !check?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest("POST", `/api/admin/bookings/${encodeURIComponent(quote.bookingId)}/exception-refund`, check.request);
      setOutcome(await res.json());
      setConfirming(false);
    } catch (err) {
      setError(serverMessageOf(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const refundCents = check?.ok ? (check.request.mode === "full" ? quote!.chargedCents : check.request.amountCents) : null;

  return (
    <Card data-testid="exception-refund-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Undo2 className="w-4 h-4" /> Exception refund
        </CardTitle>
        <CardDescription>
          Refund a booking outside its cancellation policy, in full or in part. It runs the normal refund, can be
          done once per booking, and records your name and reason. Unpaid, failed and disputed bookings cannot be
          refunded here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex gap-2">
          <Input
            placeholder="Booking id"
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            data-testid="input-exception-refund-booking"
          />
          <Button variant="outline" onClick={lookUp} disabled={busy || !bookingId.trim()} data-testid="button-exception-refund-lookup">
            {busy && !quote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
          </Button>
        </div>

        {error && (
          <p className="text-red-700" data-testid="text-exception-refund-error">
            {error}
          </p>
        )}

        {quote && !outcome && (
          <div className="space-y-3" data-testid="exception-refund-quote">
            <p>
              Status <strong>{quote.status}</strong> · charged <strong>{formatCents(quote.chargedCents)}</strong>
              {quote.feeChargedCents > 0 && (
                <span className="text-gray-500">
                  {" "}
                  ({formatCents(quote.bookingChargedCents)} booking + {formatCents(quote.feeChargedCents)} service fee)
                </span>
              )}
            </p>
            {quote.refusal ? (
              <p className="text-amber-800" data-testid="text-exception-refund-refusal">
                {quote.refusalMessage}
              </p>
            ) : (
              <>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} data-testid="radio-exception-refund-full" />
                    Full ({formatCents(quote.chargedCents)})
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={mode === "partial"} onChange={() => setMode("partial")} data-testid="radio-exception-refund-partial" />
                    Partial
                  </label>
                  {mode === "partial" && (
                    <Input
                      className="w-32"
                      placeholder="25.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      data-testid="input-exception-refund-amount"
                    />
                  )}
                </div>
                {mode === "partial" && quote.feeChargedCents > 0 && (
                  <p className="text-xs text-gray-500">
                    A partial refund returns the booking and the service fee at the same percentage.
                  </p>
                )}
                <Textarea
                  placeholder="Why is this refund being made? (required)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="input-exception-refund-reason"
                />
                {check && !check.ok && (reason.length > 0 || amount.length > 0) && (
                  <p className="text-xs text-gray-600">{check.message}</p>
                )}
                {!confirming ? (
                  <Button onClick={() => setConfirming(true)} disabled={!check?.ok} data-testid="button-exception-refund-review">
                    Review refund
                  </Button>
                ) : (
                  <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <p>
                      Refund <strong>{refundCents !== null ? formatCents(refundCents) : ""}</strong> to the traveler's original
                      payment method? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={submit} disabled={busy} data-testid="button-exception-refund-confirm">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refund now"}
                      </Button>
                      <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                        Back
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {outcome && (
          <div className="rounded border border-green-300 bg-green-50 p-3 space-y-1" data-testid="exception-refund-outcome">
            <p>
              {outcome.alreadyRefunded ? "Already refunded" : "Refunded"} <strong>{formatCents(outcome.refundedCents)}</strong>
              {outcome.refundId ? <span className="text-gray-500"> · {outcome.refundId}</span> : null}
            </p>
            {outcome.skippedPaidOut > 0 && (
              <p className="text-amber-800">
                {outcome.skippedPaidOut} earning(s) were already paid out and were not reversed; handle the clawback manually.
              </p>
            )}
            {outcome.auditWarning && <p className="text-amber-800">{outcome.auditWarning}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
