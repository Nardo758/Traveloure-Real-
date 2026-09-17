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
 *  · IT DOES NOT CHARGE. LD 49: the quote-born booking is born UNPAID and the charge through
 *    `/api/checkout` is its own lane, which has not landed — so Accept creates the booking and the
 *    card then says, in words, that paying for it is not available on the site yet
 *    (`QUOTE_CHECKOUT_UNAVAILABLE_NOTE`). A Pay button that leads nowhere would be the §13 lie.
 *  · IT RE-SPLITS NOTHING. The deposit-vs-full line is read off the MINTED BOOKING the server
 *    wrote (`quoteDepositLine`), so what the traveler reads is what `resolveDepositPlan` decided.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiRefusalMessage } from "@/lib/api-refusal";
import { useToast } from "@/hooks/use-toast";
import {
  QUOTE_CHECKOUT_UNAVAILABLE_NOTE,
  quoteAmountLine,
  quoteDepositLine,
  quoteIsAcceptable,
  quoteStateCopy,
  quoteValidityLine,
  type MintedBookingDepositRow,
  type QuoteCardRow,
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
              <p className="text-sm text-muted-foreground" data-testid={`quote-meaning-${q.id}`}>
                {copy.traveler}
              </p>
              {q.note && (
                <p className="text-sm rounded-md border bg-muted/30 px-3 py-2" data-testid={`quote-note-${q.id}`}>
                  {q.note}
                </p>
              )}
              {q.lifecycle === "accepted" && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1" data-testid={`quote-accepted-${q.id}`}>
                  {depositLine && <p className="text-sm">{depositLine}</p>}
                  <p className="text-xs text-muted-foreground">{QUOTE_CHECKOUT_UNAVAILABLE_NOTE}</p>
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
