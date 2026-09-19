/**
 * THE TRAVELER'S QUOTES — the surface Locked Decision 49 shipped its rails without.
 *
 * Ledger `2026-09-17-surfaces-quotes-settlement`. The request already had a door (the listing's
 * "Request a quote"); what it had nowhere was an ANSWER. This reads `GET /api/me/quotes` and draws
 * each row with the provider's amount, the window the SERVER says it stands for, and — inside that
 * window — Accept and Decline, which call the existing rails and nothing else.
 *
 * WHAT IT DOES NOT DO, deliberately:
 *  · IT DERIVES NO EXPIRY. `lifecycle` arrives resolved on the row (the ONE derivation, shared
 *    `quoteLifecycle`); this page words it. A client that recomputed "expired" from its own clock
 *    would be a second authority on the fact the accept claim carries in its WHERE clause, and the
 *    two would disagree the moment a clock did.
 *  · IT AUTHORS NO AMOUNT AND NO WINDOW. Every figure is the row's (§14). No day count appears.
 *  · IT MINTS NO CHECKOUT OF ITS OWN. Ledger `2026-09-18-quote-born-charge` landed LD 49's filed
 *    charge lane, so the accepted card now carries a real Pay control — which POSTs
 *    `{ quoteBookingId }` to the EXISTING `/api/checkout` and mounts the EXISTING `StripeCheckout`
 *    Payment Element the cart mounts. No second checkout component, no second rail, and no amount
 *    of this page's own: the sheet renders what the server answered, and the confirm falls back to
 *    the same `POST /api/bookings/confirm-payment` the cart uses when the webhook is slow.
 *  · IT RE-SPLITS NOTHING. The deposit-vs-full line is read off the MINTED BOOKING the server
 *    wrote (`quoteDepositLine`), so what the traveler reads is what `resolveDepositPlan` decided.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, FileText, CheckCircle2, XCircle, Clock, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiRefusalMessage, parseApiRefusal } from "@/lib/api-refusal";
import { useToast } from "@/hooks/use-toast";
import StripeCheckout from "@/components/booking/StripeCheckout";
import {
  QUOTE_CHECKOUT_UNAVAILABLE_NOTE,
  QUOTE_PAY_ACTION_LABEL,
  quoteAmountLine,
  quoteChargeRefusalLine,
  quoteDepositLine,
  quoteIsAcceptable,
  quotePlanLine,
  quoteStateCopy,
  quoteTravelerFeeLine,
  quoteValidityLine,
  type MintedBookingDepositRow,
  type QuoteCardRow,
  type QuoteTravelerServiceFee,
} from "@/lib/quote-copy";

const TONE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  waiting: "secondary",
  live: "default",
  done: "default",
  dead: "outline",
};

function formatDay(isoDate: string): string {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime())
    ? isoDate
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export interface TravelerQuotesPanelProps {
  /** The traveler's own bookings, already loaded by the page — the deposit answer is read off the
   *  minted row rather than re-derived. A page that has not loaded them passes none, and the
   *  deposit line is OMITTED rather than guessed (§13). */
  bookingsById?: Record<string, MintedBookingDepositRow>;
}

export function TravelerQuotesPanel({ bookingsById }: TravelerQuotesPanelProps) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ quotes: QuoteCardRow[] }>({
    queryKey: ["/api/me/quotes"],
  });

  const accept = useMutation({
    mutationFn: async (quoteId: string) => {
      const res = await apiRequest("POST", `/api/quotes/${quoteId}/accept`, {});
      return (await res.json()) as { bookingId: string; minted: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({
        title: "Quote accepted",
        description: QUOTE_CHECKOUT_UNAVAILABLE_NOTE,
      });
    },
    onError: (err: unknown) =>
      toast({
        title: "Quote not accepted",
        // The server's own refusal sentence — it names WHICH fact refused (expired, withdrawn,
        // superseded), and the page never replaces that with one undifferentiated message.
        description: apiRefusalMessage(err, "The quote could not be accepted."),
        variant: "destructive",
      }),
  });

  const decline = useMutation({
    mutationFn: (quoteId: string) => apiRequest("POST", `/api/quotes/${quoteId}/decline`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/quotes"] });
      toast({ title: "Quote declined", description: "The provider has been told you said no." });
    },
    onError: (err: unknown) =>
      toast({
        title: "Not declined",
        description: apiRefusalMessage(err, "The quote could not be declined."),
        variant: "destructive",
      }),
  });

  // The open payment sheet, or null. ONE at a time: a traveler pays one booking at a time, and a
  // second open sheet would be a second clientSecret on screen with no way to say which is live.
  // Ledger `2026-09-19-quote-born-traveler-fee`: `travelerServiceFee`/`coveredByTripPass` are the
  // SERVER's own answer, carried straight through from the pay response — never computed here.
  const [paying, setPaying] = useState<
    | {
        bookingId: string;
        clientSecret: string;
        paymentIntentId: string;
        amount: number;
        travelerServiceFee?: QuoteTravelerServiceFee;
        coveredByTripPass?: boolean;
      }
    | null
  >(null);

  /**
   * LD 49's charge, through the EXISTING rail (ledger `2026-09-18-quote-born-charge`).
   *
   * §14: the body is the booking id and nothing else — no amount, no price, no user id. The server
   * composes the charge from the row the accept rail wrote and answers with the PaymentIntent it
   * created; this page renders THAT answer and never states a figure of its own.
   */
  const pay = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("POST", "/api/checkout", { quoteBookingId: bookingId });
      return (await res.json()) as {
        paymentIntent?: { clientSecret: string; paymentIntentId: string; amount: number };
        // Ledger `2026-09-19-quote-born-traveler-fee`: the fee disclosure the response carries
        // for this arm only. Absent ⇒ the fee line is simply not shown (§13 — not yet known).
        travelerServiceFee?: QuoteTravelerServiceFee;
        coveredByTripPass?: boolean;
      };
    },
    onSuccess: (data, bookingId) => {
      if (!data.paymentIntent?.clientSecret) {
        // §13: no clientSecret is NOT "paid" — it is no answer, and the sheet does not open.
        toast({
          variant: "destructive",
          title: "Payment could not be started",
          description: "The payment provider did not return a payment to complete. Nothing was charged.",
        });
        return;
      }
      setPaying({
        bookingId,
        ...data.paymentIntent,
        travelerServiceFee: data.travelerServiceFee,
        coveredByTripPass: data.coveredByTripPass,
      });
    },
    onError: (err: unknown) =>
      toast({
        variant: "destructive",
        title: "Payment not started",
        // The server's OWN refusal — `quote_expired` carries its expiry, and this page repeats it
        // rather than recomputing a deadline (the same rule the validity line follows).
        description:
          quoteChargeRefusalLine(parseApiRefusal(err), formatDay) ??
          apiRefusalMessage(err, "This booking could not be paid for right now."),
      }),
  });

  /**
   * The SAME client-side fallback the cart uses: the webhook is the primary promotion and this is
   * the belt — `POST /api/bookings/confirm-payment` refuses a PaymentIntent that is not the one the
   * SERVER stamped on this row, so it can confirm nothing the webhook would not have (§15c).
   */
  const confirmPaid = async (bookingId: string, paymentIntentId: string) => {
    await fetch("/api/bookings/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ bookingId, paymentIntentId }),
    }).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["/api/me/quotes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
    setPaying(null);
    toast({ title: "Payment complete", description: "Your provider has been told." });
  };

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="quotes-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const quotes = data?.quotes ?? [];
  if (quotes.length === 0) {
    return (
      <Card data-testid="quotes-empty">
        <CardContent className="py-10 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You have not asked any provider for a custom price yet. Requesting one books nothing and
            charges nothing.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="quotes-list">
      {quotes.map((q) => {
        const copy = quoteStateCopy(q.lifecycle);
        const validity = quoteValidityLine(q, formatDay);
        const planLine = quotePlanLine(q);
        const minted = q.bookingId ? bookingsById?.[q.bookingId] : undefined;
        const depositLine = q.bookingId ? quoteDepositLine(minted ?? null) : null;
        return (
          <Card key={q.id} data-testid={`quote-card-${q.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base" data-testid={`quote-service-${q.id}`}>
                  {/* §13: a listing whose name did not come back is named as unavailable, never
                      invented. */}
                  {q.serviceName ?? "This listing's name is unavailable"}
                </CardTitle>
                <Badge variant={TONE_VARIANT[copy.tone] ?? "outline"} data-testid={`quote-status-${q.id}`}>
                  {copy.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-lg font-semibold" data-testid={`quote-amount-${q.id}`}>
                {quoteAmountLine(q)}
              </p>
              {validity && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid={`quote-validity-${q.id}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {validity}
                </p>
              )}
              {planLine && (
                <p className="text-xs text-muted-foreground" data-testid={`quote-plan-${q.id}`}>
                  {planLine}
                </p>
              )}
              <p className="text-sm text-muted-foreground" data-testid={`quote-meaning-${q.id}`}>
                {copy.traveler}
              </p>
              {q.note && (
                <p className="text-sm rounded-md border bg-muted/30 px-3 py-2" data-testid={`quote-note-${q.id}`}>
                  {q.note}
                </p>
              )}
              {q.lifecycle === "accepted" && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2" data-testid={`quote-accepted-${q.id}`}>
                  {depositLine && <p className="text-sm">{depositLine}</p>}
                  <p className="text-xs text-muted-foreground">{QUOTE_CHECKOUT_UNAVAILABLE_NOTE}</p>
                  {/* §13: an accepted row whose booking id did not come back gets the note and NO
                      pay control — a Pay button with nothing to address is worse than none. */}
                  {!q.bookingId ? null : paying?.bookingId === q.bookingId ? (
                    <>
                      {/* Ledger `2026-09-19-quote-born-traveler-fee`: shown BEFORE the traveler
                          completes the Payment Element below — the server's own figures, read
                          straight off the pay response (§13/§14: no client-computed amount). */}
                      {quoteTravelerFeeLine(paying.travelerServiceFee) && (
                        <p className="text-xs text-muted-foreground" data-testid={`quote-traveler-fee-${q.id}`}>
                          {quoteTravelerFeeLine(paying.travelerServiceFee)}
                        </p>
                      )}
                      <StripeCheckout
                        paymentIntent={{
                          clientSecret: paying.clientSecret,
                          paymentIntentId: paying.paymentIntentId,
                          amount: paying.amount,
                        }}
                        bookingIds={[q.bookingId]}
                        onSuccess={(paymentIntentId) => confirmPaid(q.bookingId!, paymentIntentId)}
                        onError={(error) =>
                          toast({ variant: "destructive", title: "Payment failed", description: error })
                        }
                        onCancel={() => setPaying(null)}
                      />
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => pay.mutate(q.bookingId!)}
                      disabled={pay.isPending || paying !== null}
                      data-testid={`button-pay-quote-${q.id}`}
                    >
                      {pay.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4 mr-2" />
                      )}
                      {QUOTE_PAY_ACTION_LABEL}
                    </Button>
                  )}
                </div>
              )}
              {quoteIsAcceptable(q) && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => accept.mutate(q.id)}
                    disabled={accept.isPending || decline.isPending}
                    data-testid={`button-accept-quote-${q.id}`}
                  >
                    {accept.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Accept this price
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decline.mutate(q.id)}
                    disabled={accept.isPending || decline.isPending}
                    data-testid={`button-decline-quote-${q.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Decline
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default TravelerQuotesPanel;
