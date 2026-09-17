/**
 * THE SELLER'S QUOTE QUEUE — issue and withdraw, on the console module that owns "what I sell".
 *
 * Ledger `2026-09-17-surfaces-quotes-settlement`. Locked Decision 49's owner rails
 * (`POST /api/provider/quotes/:id/issue`, `.../withdraw`) had no affordance anywhere, so a
 * traveler's request landed in a table nobody could answer from. This reads
 * `GET /api/provider/quotes` and calls those two rails; it adds no rail and writes nothing else.
 *
 * PLACEMENT follows the C9 precedent Locked Decision 22 (b) states: per-listing curation belongs
 * to the Catalog — the "what I sell" module — not to the Workstation.
 *
 * THE VALIDITY IS THE SERVER'S RULE, NOT THIS FORM'S. D-29 puts the default and the ceiling in
 * `server/config/quote-validity.config.ts` and REFUSES a choice above the ceiling with the number
 * STATED, never silently clamping. So this form:
 *  · sends `validityDays` ONLY when the seller typed one — absent means "use the platform default",
 *    which is the server's to know and not this component's;
 *  · carries NO ceiling of its own and NO max attribute derived from one — it would be a second
 *    authority that drifts the day an operator changes the env;
 *  · words the server's refusal back with the server's own `ceilingDays` / `requestedDays`
 *    (`quoteIssueRefusalLine`), so the seller reads the real number rather than "too long".
 *
 * THE AMOUNT is the seller's own price for this traveler — owner business data, like
 * `provider_services.price`. It is not a fee, a rate or a band (§8/§18), and it reaches a booking
 * only through the traveler's acceptance, which carries no amount at all (§14).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, FileText, Send, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiRefusalMessage, parseApiRefusal } from "@/lib/api-refusal";
import { useToast } from "@/hooks/use-toast";
import {
  quoteAmountLine,
  quoteIsIssuable,
  quoteIsWithdrawable,
  quoteIssueRefusalLine,
  quoteStateCopy,
  quoteValidityLine,
  type QuoteCardRow,
  type QuoteValidityRefusal,
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

/** Dollars typed by a human to the integer cents the rail admits. Exact, no floating drift. */
function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) && cents >= 1 ? cents : null;
}

function IssueForm({ quote, onDone }: { quote: QuoteCardRow; onDone: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [note, setNote] = useState("");
  const [refusal, setRefusal] = useState<QuoteValidityRefusal | null>(null);

  const issue = useMutation({
    mutationFn: async () => {
      const amountCents = dollarsToCents(amount);
      if (amountCents === null) throw new Error("Enter the amount as a number, for example 1250 or 1250.50.");
      const days = validityDays.trim();
      const res = await apiRequest("POST", `/api/provider/quotes/${quote.id}/issue`, {
        amountCents,
        // Absent means the platform default — the server's number, never restated here.
        ...(days.length > 0 ? { validityDays: Number(days) } : {}),
        ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      });
      return res;
    },
    onSuccess: () => {
      setRefusal(null);
      queryClient.invalidateQueries({ queryKey: ["/api/provider/quotes"] });
      toast({ title: "Quote issued", description: "The traveler can accept it until the date the platform set." });
      onDone();
    },
    onError: (err: unknown) => {
      // The server refuses a window above the ceiling WITH the number stated (D-29 never clamps
      // silently), so the body is recovered through the ONE parse and worded from its own fields.
      const body = parseApiRefusal(err) as QuoteValidityRefusal;
      setRefusal(body);
      toast({
        title: "Quote not issued",
        description: quoteIssueRefusalLine(body) ?? "The quote could not be issued.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3" data-testid={`quote-issue-form-${quote.id}`}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`amount-${quote.id}`} className="text-xs">Your price</Label>
          <Input
            id={`amount-${quote.id}`}
            inputMode="decimal"
            placeholder="e.g. 1250"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid={`input-quote-amount-${quote.id}`}
          />
        </div>
        <div>
          <Label htmlFor={`validity-${quote.id}`} className="text-xs">Stands for (days, optional)</Label>
          <Input
            id={`validity-${quote.id}`}
            inputMode="numeric"
            placeholder="platform default"
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            data-testid={`input-quote-validity-${quote.id}`}
          />
        </div>
      </div>
      <Textarea
        placeholder="Anything the traveler should know about this price (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        data-testid={`input-quote-note-${quote.id}`}
      />
      <p className="text-[11px] text-muted-foreground">
        Leave the window blank to use the platform's default. If you ask for longer than the
        platform allows, nothing is issued and you are told the limit.
      </p>
      {refusal && (
        <p className="text-[11px] text-destructive" data-testid={`quote-issue-refusal-${quote.id}`}>
          {quoteIssueRefusalLine(refusal)}
        </p>
      )}
      <Button size="sm" onClick={() => issue.mutate()} disabled={issue.isPending} data-testid={`button-issue-quote-${quote.id}`}>
        {issue.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
        Send this price
      </Button>
    </div>
  );
}

export function SellerQuotesPanel() {
  const { toast } = useToast();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ quotes: QuoteCardRow[] }>({
    queryKey: ["/api/provider/quotes"],
  });

  const withdraw = useMutation({
    mutationFn: (quoteId: string) => apiRequest("POST", `/api/provider/quotes/${quoteId}/withdraw`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/quotes"] });
      toast({ title: "Offer withdrawn", description: "The traveler can no longer accept it." });
    },
    onError: (err: unknown) =>
      toast({
        title: "Not withdrawn",
        description: apiRefusalMessage(err, "The offer could not be withdrawn."),
        variant: "destructive",
      }),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" data-testid="seller-quotes-loading" />;

  const quotes = data?.quotes ?? [];
  if (quotes.length === 0) {
    return (
      <Card data-testid="seller-quotes-empty">
        <CardContent className="py-8 text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No one has asked you for a custom price yet. A request creates no booking and charges
            nothing until you issue a price and the traveler accepts it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="seller-quotes-list">
      {quotes.map((q) => {
        const copy = quoteStateCopy(q.lifecycle);
        const validity = quoteValidityLine(q, formatDay);
        return (
          <Card key={q.id} data-testid={`seller-quote-card-${q.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">
                  {q.serviceName ?? "This listing's name is unavailable"}
                </CardTitle>
                <Badge variant={TONE_VARIANT[copy.tone] ?? "outline"} data-testid={`seller-quote-status-${q.id}`}>
                  {copy.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-base font-semibold" data-testid={`seller-quote-amount-${q.id}`}>
                {quoteAmountLine(q)}
              </p>
              {validity && (
                <p className="text-xs text-muted-foreground" data-testid={`seller-quote-validity-${q.id}`}>
                  {validity}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{copy.seller}</p>
              {q.requestNote && (
                <p className="text-sm rounded-md border bg-muted/30 px-3 py-2" data-testid={`seller-quote-request-note-${q.id}`}>
                  {q.requestNote}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                {quoteIsIssuable(q) && openFor !== q.id && (
                  <Button size="sm" onClick={() => setOpenFor(q.id)} data-testid={`button-open-issue-${q.id}`}>
                    <Send className="w-4 h-4 mr-2" />
                    {q.lifecycle === "expired" ? "Send a new price" : "Send a price"}
                  </Button>
                )}
                {quoteIsWithdrawable(q) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => withdraw.mutate(q.id)}
                    disabled={withdraw.isPending}
                    data-testid={`button-withdraw-quote-${q.id}`}
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    Withdraw
                  </Button>
                )}
              </div>
              {openFor === q.id && <IssueForm quote={q} onDone={() => setOpenFor(null)} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default SellerQuotesPanel;
