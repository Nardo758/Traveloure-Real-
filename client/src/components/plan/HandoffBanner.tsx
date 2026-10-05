/**
 * `HandoffBanner` — the slip's line about its handoff (step 7b, R323; surface spec §12 steps 2–5).
 *
 *   finding   "Finding your Kyoto local · usually within N hours" (N only when measured — §13)
 *   24 h      the concierge fallback is offered (R-q)
 *   48 h      the hold was released; nothing was charged (R-q)
 *   working   "<name> is working on your plan" + Accept all (Plan it all) + the suggestions that
 *             name no stop yet (adds)
 *   delivered Approve · Request changes (two rounds included) — auto-approves after 7 days (R-s)
 *   approved  the `post_handoff` tap; on-trip support if the local offered it
 * Withdraw is offered at every live stage with its cost said first (R-t).
 *
 * Every sentence comes from `@/lib/handoff-client`; every number from the server's own read.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FEEDBACK_CODES, type FeedbackMoment } from "@shared/feedback";
import { HANDOFF_CHANGE_ROUNDS_INCLUDED } from "@shared/handoff";
import { FeedbackTap } from "./FeedbackTap";
import { HoldForm } from "./HandoffChooser";
import { Elements } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { getStripePromise } from "@/components/booking/StripeCheckout";
import {
  expertSuggestionsQueryKey,
  handoffBannerLine,
  handoffQueryKey,
  money,
  withdrawLine,
  type ClientSuggestion,
  type HandoffRead,
} from "@/lib/handoff-client";

async function post(url: string, body: unknown = {}) {
  const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `Request failed (${res.status})`);
  return json;
}

/** The plan's suggestions — one cache for the banner and every row's strip. */
export function useExpertSuggestions(tripId: string, enabled: boolean) {
  return useQuery<{ suggestions: ClientSuggestion[] }>({
    queryKey: expertSuggestionsQueryKey(tripId),
    enabled,
    staleTime: 15_000,
  });
}

export function useHandoff(tripId: string, enabled: boolean) {
  return useQuery<HandoffRead>({ queryKey: handoffQueryKey(tripId), enabled, staleTime: 30_000 });
}

/** The traveler's answer to ONE suggestion — shared by the banner and the row strip. */
export function useResolveSuggestion(tripId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (id: string, decision: "accept" | "decline") => {
    setBusy(id);
    try {
      await post(`/api/trips/${tripId}/expert-suggestions/${id}/${decision}`);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't answer that suggestion", description: e.message });
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: expertSuggestionsQueryKey(tripId) });
      void qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    }
  };
  return { resolve, busy };
}

/** The pending suggestion(s) on ONE stop, drawn inside its `ItemRow` (§12 step 3). */
export function SuggestionStrip({ tripId, itemId, suggestions, canAnswer }: { tripId: string; itemId: string; suggestions: readonly ClientSuggestion[]; canAnswer: boolean }) {
  const { resolve, busy } = useResolveSuggestion(tripId);
  const mine = suggestions.filter((s) => s.itemId === itemId && s.status === "pending");
  if (!mine.length) return null;
  return (
    <div className="mt-2 space-y-1" data-testid={`item-suggestions-${itemId}`}>
      {mine.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded border border-dashed border-primary/50 bg-primary/5 px-2 py-1 text-xs" data-testid={`suggestion-${s.id}`}>
          <span className="font-medium">Suggested:</span>
          <span className="flex-1">{s.summary}</span>
          {canAnswer ? (
            <>
              <Button size="sm" className="h-6 px-2" disabled={busy === s.id} onClick={() => resolve(s.id, "accept")} data-testid={`suggestion-accept-${s.id}`}>Accept</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy === s.id} onClick={() => resolve(s.id, "decline")} data-testid={`suggestion-decline-${s.id}`}>Decline</Button>
            </>
          ) : (
            <span className="text-muted-foreground">waiting for the traveler</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function HandoffBanner({ tripId, isOwner }: { tripId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useHandoff(tripId, true);
  const h = data?.handoff ?? null;
  const live = !!h && ["accepted", "delivered"].includes(h.status);
  const { data: sData } = useExpertSuggestions(tripId, live || h?.status === "approved");
  const { resolve, busy: resolving } = useResolveSuggestion(tripId);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [support, setSupport] = useState<{ clientSecret: string; amountCents: number; stripe: Stripe } | null>(null);
  if (!data || !h) return null;
  const line = handoffBannerLine(data);
  const pending = (sData?.suggestions ?? []).filter((s) => s.status === "pending");
  const unanchored = pending.filter((s) => !s.itemId);

  const act = async (key: string, url: string, body: unknown, ok: string) => {
    setBusy(key);
    try {
      await post(url, body);
      toast({ title: ok });
    } catch (e: any) {
      toast({ variant: "destructive", title: "That didn't go through", description: e.message });
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: handoffQueryKey(tripId) });
      void qc.invalidateQueries({ queryKey: expertSuggestionsQueryKey(tripId) });
      void qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    }
  };

  const withdraw = withdrawLine(h);
  const roundsLeft = HANDOFF_CHANGE_ROUNDS_INCLUDED - (h.changeRounds ?? 0);

  return (
    <section className="rounded-lg border border-border bg-card p-3 text-sm" data-testid="handoff-banner" data-state={h.status}>
      {line ? <p data-testid="handoff-banner-line">{line}</p> : null}
      {h.status === "approved" ? (
        <p className="text-muted-foreground" data-testid="handoff-banner-line">
          Approved{h.approvedBy === "auto" ? " automatically after a week" : ""} — the plan is yours again{h.expertName ? `, planned with ${h.expertName}` : ""}.
        </p>
      ) : null}

      {isOwner && data.banner?.kind === "fallback_offered" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild data-testid="handoff-fallback-concierge">
            <Link href={`/concierge?tripId=${tripId}`}>Hand it to our concierge</Link>
          </Button>
        </div>
      ) : null}

      {isOwner && pending.length > 1 ? (
        <div className="mt-2">
          <Button
            size="sm"
            disabled={busy === "all"}
            onClick={() => act("all", `/api/trips/${tripId}/expert-suggestions/accept-all`, {}, "All suggestions accepted")}
            data-testid="handoff-accept-all"
          >
            {busy === "all" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Accept all {pending.length}
          </Button>
        </div>
      ) : null}

      {unanchored.length ? (
        <ul className="mt-2 space-y-1" data-testid="handoff-new-stops">
          {unanchored.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded border border-dashed border-primary/50 bg-primary/5 px-2 py-1 text-xs" data-testid={`suggestion-${s.id}`}>
              <span className="flex-1">{s.summary}</span>
              {isOwner ? (
                <>
                  <Button size="sm" className="h-6 px-2" disabled={resolving === s.id} onClick={() => resolve(s.id, "accept")} data-testid={`suggestion-accept-${s.id}`}>Accept</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2" disabled={resolving === s.id} onClick={() => resolve(s.id, "decline")} data-testid={`suggestion-decline-${s.id}`}>Decline</Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isOwner && h.status === "delivered" ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => act("approve", `/api/handoffs/${h.id}/approve`, {}, "Plan approved")} data-testid="handoff-approve">Approve</Button>
            {roundsLeft > 0 ? (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("changes", `/api/handoffs/${h.id}/changes`, { note: note || null }, "Changes requested")} data-testid="handoff-request-changes">
                Request changes ({roundsLeft} left)
              </Button>
            ) : null}
          </div>
          {roundsLeft > 0 ? (
            <textarea className="w-full rounded border border-border p-1 text-xs" rows={2} placeholder="What should change?" value={note} onChange={(e) => setNote(e.target.value)} data-testid="handoff-changes-note" />
          ) : (
            <p className="text-xs text-muted-foreground">Both included rounds of changes are used — a new ask starts a new request.</p>
          )}
          <p className="text-xs text-muted-foreground">Approves itself after 7 days if you don't answer.</p>
        </div>
      ) : null}

      {isOwner && h.status === "approved" && h.onTripSupportOfferedAt && !h.onTripSupportAcceptedAt && data.onTripSupportCents ? (
        <div className="mt-2 space-y-2 text-xs" data-testid="handoff-on-trip-support">
          <p>{h.expertName ?? "Your local"} offers on-trip support for {money(data.onTripSupportCents)} — messages during the trip go straight to them.</p>
          {support ? (
            <Elements stripe={support.stripe} options={{ clientSecret: support.clientSecret }}>
              <HoldForm
                amountCents={support.amountCents}
                line={`On-trip support is ${money(support.amountCents)}, taken when you confirm.`}
                cta="Turn on on-trip support"
                onHeld={() => {
                  setSupport(null);
                  void act("ots", `/api/handoffs/${h.id}/on-trip-support/confirm`, {}, "On-trip support is on");
                }}
              />
            </Elements>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={async () => {
                try {
                  const out = await post(`/api/handoffs/${h.id}/on-trip-support`);
                  const stripe = await getStripePromise();
                  if (stripe && out.clientSecret) setSupport({ clientSecret: out.clientSecret, amountCents: out.amountCents, stripe });
                } catch (e: any) {
                  toast({ variant: "destructive", title: "Couldn't start on-trip support", description: e.message });
                }
              }}
              data-testid="handoff-on-trip-support-start"
            >
              Add on-trip support
            </Button>
          )}
        </div>
      ) : null}

      {isOwner && h.status === "approved" ? <FeedbackTap tripId={tripId} moment={"post_handoff" as FeedbackMoment} codes={FEEDBACK_CODES.post_handoff} /> : null}

      {isOwner && withdraw ? (
        <button
          type="button"
          className="mt-2 text-xs text-muted-foreground underline underline-offset-2"
          disabled={!!busy}
          onClick={() => act("withdraw", `/api/handoffs/${h.id}/withdraw`, {}, "Request withdrawn")}
          data-testid="handoff-withdraw"
        >
          {withdraw}
        </button>
      ) : null}
    </section>
  );
}
