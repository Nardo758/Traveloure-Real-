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
 * THE HANDOFF BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-handoff-board`): under
 * the slip's board look, while the expert holds the pen (accepted · delivered), the banner is the
 * board's gold card — "<name> has your plan", what was asked and when, the pills, Message and
 * Accept all — and the approve / changes / withdraw controls move to `HandoffFooter` below the days
 * ("When <name> is done"). Same rails, same testids; nothing is drawn that the reads do not carry.
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
import { useAskExpert } from "@/lib/use-ask-expert";
import { usePlanRowLook } from "./row-look";
import {
  expertSuggestionsQueryKey,
  handoffBannerLine,
  handoffBoardPills,
  handoffBoardSubline,
  handoffBoardTitle,
  handoffExpertLabel,
  handoffFooterLine,
  handoffHoldsPen,
  handoffQueryKey,
  money,
  withdrawLine,
  type ClientHandoff,
  type ClientSuggestion,
  type HandoffRead,
} from "@/lib/handoff-client";

// The board's buttons (ruling 2): the primary is the coral fill with white text; the quiet one is an
// outline; navy is the footer card's ground, never a button fill.
const BOARD_PRIMARY_BTN =
  "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--slip-radius-button)] bg-[color:var(--slip-primary)] px-4 text-sm font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60";
const BOARD_QUIET_BTN =
  "inline-flex h-11 flex-shrink-0 items-center justify-center rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-4 text-sm font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)] disabled:opacity-60";

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

/** The banner's and the footer's POSTs — the handoff read and the plancard refetched after each. */
function useHandoffAct(tripId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, url: string, body: unknown, ok: string) => {
    setBusy(key);
    try {
      await post(url, body);
      toast({ title: ok });
    } catch (e: any) {
      toast({ variant: "destructive", title: "That didn't go through", description: e.message });
    } finally {
      // Smoke 13 #5: the handoff read and the plancard are REFETCHED (awaited), so the banner moves
      // to its new state without a reload.
      await Promise.all([
        qc.refetchQueries({ queryKey: handoffQueryKey(tripId) }),
        qc.invalidateQueries({ queryKey: expertSuggestionsQueryKey(tripId) }),
        qc.refetchQueries({ queryKey: [`/api/trips/${tripId}/plancard`] }),
      ]).catch(() => {});
      setBusy(null);
    }
  };
  return { act, busy };
}

/** One suggestion, drawn as the board's gold card (board look) or the dashed strip (plain). */
function SuggestionCard({
  s,
  board,
  canAnswer,
  busy,
  onAnswer,
  waitingNote,
}: {
  s: ClientSuggestion;
  board: boolean;
  canAnswer: boolean;
  busy: boolean;
  onAnswer: (d: "accept" | "decline") => void;
  waitingNote: boolean;
}) {
  if (board) {
    return (
      <div
        className="flex flex-col gap-2 rounded-r-xl border-l-[3px] border-[color:var(--slip-gold)] bg-[color:var(--slip-gold-wash)] px-3 py-2.5"
        data-testid={`suggestion-${s.id}`}
      >
        <p className="text-[13px] font-semibold text-[color:var(--slip-gold-ink)]">Suggestion · {s.summary}</p>
        {canAnswer ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex h-9 items-center rounded-lg bg-[color:var(--slip-primary)] px-3.5 text-[13px] font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60" disabled={busy} onClick={() => onAnswer("accept")} data-testid={`suggestion-accept-${s.id}`}>
              Accept
            </button>
            <button type="button" className="inline-flex h-9 items-center rounded-lg border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-3.5 text-[13px] font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)] disabled:opacity-60" disabled={busy} onClick={() => onAnswer("decline")} data-testid={`suggestion-decline-${s.id}`}>
              Decline
            </button>
          </div>
        ) : waitingNote ? (
          <p className="text-xs text-[color:var(--slip-muted)]">waiting for the traveler</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-primary/50 bg-primary/5 px-2 py-1 text-xs" data-testid={`suggestion-${s.id}`}>
      {waitingNote ? <span className="font-medium">Suggested:</span> : null}
      <span className="flex-1">{s.summary}</span>
      {canAnswer ? (
        <>
          <Button size="sm" className="h-6 px-2" disabled={busy} onClick={() => onAnswer("accept")} data-testid={`suggestion-accept-${s.id}`}>Accept</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy} onClick={() => onAnswer("decline")} data-testid={`suggestion-decline-${s.id}`}>Decline</Button>
        </>
      ) : waitingNote ? (
        <span className="text-muted-foreground">waiting for the traveler</span>
      ) : null}
    </div>
  );
}

/** The pending suggestion(s) on ONE stop, drawn inside its `ItemRow` (§12 step 3). */
export function SuggestionStrip({ tripId, itemId, suggestions, canAnswer }: { tripId: string; itemId: string; suggestions: readonly ClientSuggestion[]; canAnswer: boolean }) {
  const { resolve, busy } = useResolveSuggestion(tripId);
  const board = usePlanRowLook() === "board";
  const mine = suggestions.filter((s) => s.itemId === itemId && s.status === "pending");
  if (!mine.length) return null;
  return (
    <div className={board ? "mt-1.5 space-y-1.5" : "mt-2 space-y-1"} data-testid={`item-suggestions-${itemId}`}>
      {mine.map((s) => (
        <SuggestionCard key={s.id} s={s} board={board} canAnswer={canAnswer} busy={busy === s.id} onAnswer={(d) => resolve(s.id, d)} waitingNote />
      ))}
    </div>
  );
}

export function HandoffBanner({ tripId, isOwner, bookedInScope = null }: { tripId: string; isOwner: boolean; bookedInScope?: number | null }) {
  const { toast } = useToast();
  const board = usePlanRowLook() === "board";
  const askExpert = useAskExpert();
  const { data } = useHandoff(tripId, true);
  const h = data?.handoff ?? null;
  const live = !!h && ["accepted", "delivered"].includes(h.status);
  const { data: sData } = useExpertSuggestions(tripId, live || h?.status === "approved");
  const { resolve, busy: resolving } = useResolveSuggestion(tripId);
  const { act, busy } = useHandoffAct(tripId);
  const [note, setNote] = useState("");
  const [support, setSupport] = useState<{ clientSecret: string; amountCents: number; stripe: Stripe } | null>(null);
  if (!data || !h) return null;
  const line = handoffBannerLine(data);
  const pending = (sData?.suggestions ?? []).filter((s) => s.status === "pending");
  const unanchored = pending.filter((s) => !s.itemId);

  const withdraw = withdrawLine(h);
  const roundsLeft = HANDOFF_CHANGE_ROUNDS_INCLUDED - (h.changeRounds ?? 0);
  // The Handoff board: while the expert holds the pen, the banner is the board's card and the
  // approve / changes / withdraw controls live in `HandoffFooter` under the days.
  const boardPen = board && handoffHoldsPen(h);

  if (boardPen) {
    // The expert viewer reads the same card about their own work: no traveler fee, no "your plan".
    const pills = handoffBoardPills({ pending: pending.length, booked: bookedInScope, handoff: isOwner ? h : { ...h, feeCents: null, travelerFeeCents: null, prepaid: false } });
    const who = handoffExpertLabel(h);
    return (
      <section
        className="space-y-3 rounded-[var(--slip-radius-card)] border-2 border-[color:var(--slip-gold)] bg-[color:var(--slip-card)] p-4 text-sm"
        data-testid="handoff-banner"
        data-state={h.status}
        data-look="board"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--slip-wash)] text-sm font-semibold text-[color:var(--slip-navy)]"
            aria-hidden="true"
          >
            {(h.expertName?.trim()?.[0] ?? "L").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[color:var(--slip-ink)]" data-testid="handoff-banner-title">{isOwner ? handoffBoardTitle(h) : "You have this plan"}</p>
            <p className="text-[13px] text-[color:var(--slip-muted)]" data-testid="handoff-banner-subline">{handoffBoardSubline(h, Date.now())}</p>
          </div>
        </div>
        {pills.length ? (
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p) => (
              <span
                key={p.key}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  p.key === "suggestions"
                    ? "bg-[color:var(--slip-gold-wash)] text-[color:var(--slip-gold-ink)]"
                    : p.key === "booked"
                      ? "bg-[color:var(--slip-teal-wash)] text-[color:var(--slip-teal-ink)]"
                      : "bg-[color:var(--slip-wash)] text-[color:var(--slip-muted)]"
                }`}
                data-testid={`handoff-pill-${p.key}`}
              >
                {p.text}
              </span>
            ))}
          </div>
        ) : null}
        {isOwner ? (
          <div className="flex gap-2">
            <button
              type="button"
              className={BOARD_PRIMARY_BTN}
              onClick={() =>
                void askExpert({
                  // D22: the client names `{ tripId }`; the SERVER resolves the counterpart (LD 40).
                  tripId,
                  subject: null,
                  fallbackName: who,
                  returnTo: `/plans/${tripId}`,
                })
              }
              data-testid="handoff-message-expert"
            >
              Message {h.expertName?.trim() || "your local"}
            </button>
            {pending.length > 1 ? (
              <button
                type="button"
                className={BOARD_QUIET_BTN}
                disabled={busy === "all"}
                onClick={() => act("all", `/api/trips/${tripId}/expert-suggestions/accept-all`, {}, "All suggestions accepted")}
                data-testid="handoff-accept-all"
              >
                {busy === "all" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Accept all {pending.length}
              </button>
            ) : null}
          </div>
        ) : null}
        {unanchored.length ? (
          <div className="space-y-1.5" data-testid="handoff-new-stops">
            {unanchored.map((sg) => (
              <SuggestionCard key={sg.id} s={sg} board canAnswer={isOwner} busy={resolving === sg.id} onAnswer={(d) => resolve(sg.id, d)} waitingNote={false} />
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={board ? "rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] p-4 text-sm" : "rounded-lg border border-border bg-card p-3 text-sm"}
      data-testid="handoff-banner"
      data-state={h.status}
    >
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

/**
 * THE HANDOFF BOARD'S FOOTER — "When <name> is done" (board look, owner, while the pen is held).
 * The approve / request-changes / withdraw controls the plain banner carries, at the foot of the
 * plan: Approve is offered only once the expert delivers ("Approve · not yet" before), and the
 * withdrawal's cost is said before the tap (R-t). Same rails and testids as the banner's.
 */
export function HandoffFooter({ tripId, isOwner }: { tripId: string; isOwner: boolean }) {
  const board = usePlanRowLook() === "board";
  const { data } = useHandoff(tripId, true);
  const { act, busy } = useHandoffAct(tripId);
  const [note, setNote] = useState("");
  const h: ClientHandoff | null = data?.handoff ?? null;
  if (!board || !isOwner || !h || !handoffHoldsPen(h)) return null;
  const who = handoffExpertLabel(h);
  const name = h.expertName?.trim() || "your local";
  const withdraw = withdrawLine(h);
  const roundsLeft = HANDOFF_CHANGE_ROUNDS_INCLUDED - (h.changeRounds ?? 0);
  const delivered = h.status === "delivered";
  const onNavyQuiet =
    "inline-flex h-11 flex-1 items-center justify-center rounded-[var(--slip-radius-button)] border border-[color:var(--slip-on-navy-line)] px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60";
  return (
    <section
      className="space-y-3 rounded-[var(--slip-radius-card)] bg-[color:var(--slip-navy)] p-4 text-sm text-white"
      data-testid="handoff-footer"
      data-state={h.status}
    >
      <h2 className="slip-display text-xl font-semibold text-white">{delivered ? `${name} says your plan is ready` : `When ${name} is done`}</h2>
      <p className="text-[color:var(--slip-on-navy-muted)]" data-testid="handoff-footer-line">
        {delivered ? `Approve it, or ask for changes. Approve hands every item back to you and pays ${who}.` : handoffFooterLine(who)}
      </p>
      {delivered && roundsLeft > 0 ? (
        <textarea
          className="w-full rounded-lg border border-[color:var(--slip-on-navy-line)] bg-white p-2 text-xs text-[color:var(--slip-ink)]"
          rows={2}
          placeholder="What should change?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid="handoff-changes-note"
        />
      ) : null}
      {/* R-t: what withdrawing costs is said before the tap. */}
      {withdraw ? (
        <p className="text-xs text-[color:var(--slip-on-navy-muted)]" data-testid="handoff-withdraw-cost">
          {withdraw}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {delivered ? (
          <button type="button" className={BOARD_PRIMARY_BTN} disabled={!!busy} onClick={() => act("approve", `/api/handoffs/${h.id}/approve`, {}, "Plan approved")} data-testid="handoff-approve">
            Approve
          </button>
        ) : (
          <button type="button" className={onNavyQuiet} disabled aria-disabled="true" data-testid="handoff-approve-not-yet">
            Approve · not yet
          </button>
        )}
        {delivered && roundsLeft > 0 ? (
          <button type="button" className={onNavyQuiet} disabled={!!busy} onClick={() => act("changes", `/api/handoffs/${h.id}/changes`, { note: note || null }, "Changes requested")} data-testid="handoff-request-changes">
            Request changes ({roundsLeft} left)
          </button>
        ) : null}
        {withdraw ? (
          <button
            type="button"
            className={onNavyQuiet}
            disabled={!!busy}
            onClick={() => act("withdraw", `/api/handoffs/${h.id}/withdraw`, {}, "Request withdrawn")}
            data-testid="handoff-withdraw"
          >
            Withdraw request
          </button>
        ) : null}
      </div>
      {delivered && roundsLeft <= 0 ? (
        <p className="text-xs text-[color:var(--slip-on-navy-muted)]">Both included rounds of changes are used — a new ask starts a new request.</p>
      ) : null}
      {delivered ? <p className="text-xs text-[color:var(--slip-on-navy-muted)]">Approves itself after 7 days if you don't answer.</p> : null}
    </section>
  );
}
