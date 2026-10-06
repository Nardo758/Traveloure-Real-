/**
 * `HandoffChooser` — THE one door to a local expert (step 7b, R323; surface spec §12 step 1).
 *
 * "Hand off to a local expert" (the slip rail) and "Book this for me" (an item, a leg, the whole
 * plan) open this same dialog: Polish my plan · Book these for me · Plan it all. The scope is the
 * ticked stops; the fee is the SERVER's quote, shown before confirming (§14 — the client never
 * names an amount). Confirming places a HOLD on the card (R-q: authorized now, captured only when a
 * local accepts) and the slip's `HandoffBanner` takes it from there.
 *
 * Mounted ONCE per slip through `HandoffChooserHost`, which listens for `openHandoffChooser`.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getStripePromise } from "@/components/booking/StripeCheckout";
import { HANDOFF_KINDS, HANDOFF_KIND_LINE, type HandoffKind } from "@shared/handoff";
import {
  HANDOFF_CHOOSER_EVENT,
  handoffQueryKey,
  kindLabel,
  money,
  type HandoffChooserRequest,
} from "@/lib/handoff-client";

export interface ChooserItem {
  id: string;
  title: string;
  dayNum: number | null;
}

interface Quote {
  kind: HandoffKind;
  scopeItemIds: string[];
  feeCents: number;
  travelerFeeCents: number;
  travelerFeeWaived: boolean;
  totalCents: number;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `Request failed (${res.status})`);
  return json;
}

export function HoldForm({ amountCents, onHeld, line, cta }: { amountCents: number; onHeld: () => void; line?: string; cta?: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    setBusy(false);
    setAttempt((n) => n + 1);
    // Smoke 13 #8: EVERY declined confirm says why — Stripe's own decline message, whether it comes
    // back as an error or as the intent's `last_payment_error` — never a silent second press.
    if (err) return setError(err.message || "Your card couldn't be held.");
    // A manual-capture intent stops at `requires_capture`: the hold is in place, nothing is taken.
    if (paymentIntent && (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")) return onHeld();
    const declined = (paymentIntent as any)?.last_payment_error?.message as string | undefined;
    setError(declined || `The hold isn't in place yet (${paymentIntent?.status ?? "unknown"}).`);
  };
  return (
    <div className="space-y-3" data-testid="handoff-hold-form">
      {/* Smoke 13 #8 (decision-maker, Oct 6, 2026): Link draws its OWN confirm inside the Payment
          Element, a second button beside "Place the hold". On the hold sheets Link is hidden so
          "Place the hold" is the one action; cards and Apple/Google Pay stay (LD 43(c)). Stripe
          cannot exclude Link on the PaymentIntent, so this is the Element's own `wallets.link`
          option — current Stripe.js v3 (loaded unpinned) reads it; the installed type predates it. */}
      <PaymentElement onReady={() => setReady(true)} options={{ wallets: { link: "never" } } as any} />
      {/* keyed on the attempt so a repeated decline re-announces even when its words are the same */}
      {error ? <p key={attempt} role="alert" className="text-sm text-destructive" data-testid="handoff-hold-error">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        {line ??
          `We place a hold of ${money(amountCents)} now. It is only taken when a local accepts; if nobody does within two days, the hold is released.`}
      </p>
      <Button className="w-full" disabled={!ready || busy} onClick={submit} data-testid="handoff-hold-submit">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {cta ?? "Place the hold"}
      </Button>
    </div>
  );
}

export function HandoffChooser(props: {
  tripId: string;
  items: readonly ChooserItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: HandoffChooserRequest | null;
}) {
  const { tripId, items, open, onOpenChange, initial } = props;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<HandoffKind | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hold, setHold] = useState<{ requestId: string; clientSecret: string; amountCents: number } | null>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? null);
    setTicked(new Set(initial?.itemIds ?? []));
    setQuote(null);
    setQuoteError(null);
    setHold(null);
  }, [open, initial]);

  const scopeIds = useMemo(() => (kind === "plan_all" ? items.map((i) => i.id) : Array.from(ticked)), [kind, ticked, items]);

  useEffect(() => {
    if (!open || !kind) return;
    if (kind !== "plan_all" && scopeIds.length === 0) {
      setQuote(null);
      return;
    }
    let live = true;
    setQuoteError(null);
    postJson(`/api/trips/${tripId}/handoff/quote`, { kind, ...(kind === "plan_all" ? {} : { itemIds: scopeIds }) })
      .then((q) => live && setQuote(q))
      .catch((e) => live && setQuoteError(e.message));
    return () => {
      live = false;
    };
  }, [open, kind, scopeIds.join(","), tripId]);

  useEffect(() => {
    if (hold && !stripe) void getStripePromise().then(setStripe);
  }, [hold, stripe]);

  const done = (title: string, description: string) => {
    void qc.invalidateQueries({ queryKey: handoffQueryKey(tripId) });
    void qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    toast({ title, description });
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!kind) return;
    setSending(true);
    try {
      const out = await postJson(`/api/trips/${tripId}/handoff`, { kind, ...(kind === "plan_all" ? {} : { itemIds: scopeIds }) });
      if (out.clientSecret) {
        setHold({ requestId: out.handoff.id, clientSecret: out.clientSecret, amountCents: out.quote.totalCents });
      } else {
        done("Ask sent", "We're finding your local.");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't send your ask", description: e.message });
    } finally {
      setSending(false);
    }
  };

  const held = async () => {
    if (!hold) return;
    try {
      await postJson(`/api/handoffs/${hold.requestId}/authorized`, {});
      done("Ask sent", "The hold is in place. We're finding your local.");
    } catch (e: any) {
      toast({ variant: "destructive", title: "The hold isn't confirmed yet", description: e.message });
    }
  };

  const byDay = useMemo(() => {
    const m = new Map<number | null, ChooserItem[]>();
    for (const i of items) m.set(i.dayNum, [...(m.get(i.dayNum) ?? []), i]);
    return Array.from(m.entries());
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="handoff-chooser">
        <DialogHeader>
          <DialogTitle>Get a local expert</DialogTitle>
          <DialogDescription>Your plan stays here. A local works on the stops you choose and sends changes for you to accept.</DialogDescription>
        </DialogHeader>
        {hold ? (
          stripe ? (
            <Elements stripe={stripe} options={{ clientSecret: hold.clientSecret }}>
              <HoldForm amountCents={hold.amountCents} onHeld={held} />
            </Elements>
          ) : (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          )
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2" role="radiogroup">
              {HANDOFF_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`rounded-lg border p-3 text-left ${kind === k ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid={`handoff-kind-${k}`}
                >
                  <div className="text-sm font-medium">{kindLabel(k)}</div>
                  <div className="text-xs text-muted-foreground">{HANDOFF_KIND_LINE[k]}</div>
                </button>
              ))}
            </div>
            {kind && kind !== "plan_all" ? (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded border border-border p-2" data-testid="handoff-scope">
                <p className="text-xs font-medium">Which stops?</p>
                {byDay.map(([day, list]) => (
                  <div key={String(day)}>
                    {day != null ? <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Day {day}</p> : null}
                    {list.map((i) => (
                      <label key={i.id} className="flex items-center gap-2 py-0.5 text-sm">
                        <input
                          type="checkbox"
                          checked={ticked.has(i.id)}
                          onChange={(e) =>
                            setTicked((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(i.id);
                              else n.delete(i.id);
                              return n;
                            })
                          }
                          data-testid={`handoff-scope-item-${i.id}`}
                        />
                        {i.title}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {quote ? (
              <div className="rounded border border-border bg-muted/40 p-2 text-sm" data-testid="handoff-quote">
                <div className="flex justify-between"><span>Local expert</span><span>{money(quote.feeCents)}</span></div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Service fee</span>
                  <span>{quote.travelerFeeWaived ? "Included in your Trip Pass" : money(quote.travelerFeeCents)}</span>
                </div>
                <div className="mt-1 flex justify-between font-medium"><span>Held now, taken on accept</span><span data-testid="handoff-quote-total">{money(quote.totalCents)}</span></div>
              </div>
            ) : quoteError ? (
              <p className="text-sm text-destructive">{quoteError}</p>
            ) : null}
            <Button className="w-full" disabled={!kind || !quote || sending} onClick={confirm} data-testid="handoff-confirm">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {kind ? `${kindLabel(kind)} · ${quote ? money(quote.totalCents) : "…"}` : "Choose one"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The slip's one host: listens for `openHandoffChooser` from any row, rail card or modal. */
export function HandoffChooserHost({ tripId, items, enabled }: { tripId: string; items: readonly ChooserItem[]; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<HandoffChooserRequest | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const on = (e: Event) => {
      setInitial((e as CustomEvent<HandoffChooserRequest>).detail ?? {});
      setOpen(true);
    };
    window.addEventListener(HANDOFF_CHOOSER_EVENT, on);
    // The template page's door lands here with `?handoff=open`.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("handoff") === "open") {
      setInitial({});
      setOpen(true);
    }
    return () => window.removeEventListener(HANDOFF_CHOOSER_EVENT, on);
  }, [enabled]);
  if (!enabled) return null;
  return <HandoffChooser tripId={tripId} items={items} open={open} onOpenChange={setOpen} initial={initial} />;
}
