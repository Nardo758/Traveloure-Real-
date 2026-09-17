/**
 * AskAiDrawer — "Ask AI about this plan", PRE-FINAL on the slip.
 *
 * (L16 lanes 2 and 3; ledger `2026-09-16-l16-lanes2-3-drawer`. Brief of record:
 *  `docs/design/ASK_AI_DRAWER_BRIEF.md` §5. LOCKED rulings **D-45..D-50**, ledger
 *  `2026-09-16-l16-rulings-d45-d50`. CLAUDE.md Locked Decision 45 (3), Locked Decision 41 (b)/(c),
 *  Locked Decision 42 **D16** / **D18** / **D23**, §8, §13, §14, §18 rule 1.)
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────────────────────
 * The ONE renderer of the AI-task rail. It owns NO copy and NO rule: every sentence, every
 * visibility answer and every refusal reading comes from `client/src/lib/ask-ai-drawer.ts`, which
 * is the one home for them (§18 rule 1) and is provable without a DOM. This file fetches, mounts
 * and draws.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────────────────────────
 *  · **Not a third branch of `slipBuildAiAction`.** That function's two-way answer — `draft` on an
 *    empty plan, `optimize` otherwise (LD 41 (b)) — is unchanged and is READ here, never restated.
 *    On an empty plan this drawer DEFERS to the free draft and says so.
 *  · **Not a second write path into the plan.** Every write goes through the four landed proposal
 *    rails and lane 1's create rail. This surface proposes; the traveler applies; the SERVER
 *    charges, authorizes and writes.
 *  · **Not a place that names the engine.** LD 41 (c): `model_tier` is a cost record. No badge and
 *    no degraded-quality disclaimer — the prohibition binds both directions.
 *  · **Not an undo.** Locked Decision 42 D18: there is no reverse and none is drawn. An applied
 *    proposal renders as a RECORD of what it created.
 *  · **Not the post-final mount.** That is lane 4's own work (brief §7.2). Pre-final only here.
 *
 * ── THE MONEY, AND WHERE THE NUMBER COMES FROM ───────────────────────────────────────────────
 * From the SERVER's `aiTask: { coveredByTripPass, priceCents }` block on
 * `GET /api/trips/:tripId/proposals` — D-48's read half, the SAME `concierge:ai_task` band the
 * charge point resolves, behind the gate that route already runs. **No literal (§8), and no second
 * fee read (D-48's own words, §18 rule 1)** — which is why this surface does NOT also read
 * `GET /api/pricing`'s `aiTaskCents`: the two would be one band read twice, free to disagree in
 * flight, and D-48 named the proposals GET as the drawer's source precisely to prevent that.
 */
import { useState } from "react";
import { Loader2, Sparkles, Ticket } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import StripeCheckout from "@/components/booking/StripeCheckout";
import {
  ASK_AI_COPY,
  appliedRecordLine,
  askAiDeferralToDraft,
  askAiPriceLine,
  askAiRailVisibility,
  askAiRowState,
  readAskRefusal,
  readChangeSet,
  readEstimatedCost,
  readProposalActionRefusal,
  type AskAiAskRefusal,
  type AskAiProposalRow,
  type AskAiProposalsResponse,
} from "@/lib/ask-ai-drawer";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface PaySheet {
  proposalId: string;
  clientSecret: string;
  paymentIntentId: string;
  feeCents: number;
}

export interface AskAiDrawerProps {
  tripId: string;
  /** `plancard.tripRole === "owner"`. */
  isOwner: boolean;
  /** `plancard.tripRole === "expert"` — an advisor of ANY §12 status, `pending` included. */
  isExpertViewer: boolean;
  /**
   * `slipBuildAiAction(activities.length)`'s answer, passed in by the rail. READ, never re-derived:
   * that function is LD 41 (b)'s one home and this surface adds no second copy of the rule.
   */
  aiAction: "draft" | "optimize";
}

/**
 * THE RAIL CARD + THE DRAWER. One component, because the card IS the drawer's trigger and its
 * coverage line; splitting them would put the same visibility answer in two places.
 */
export function AskAiDrawer({ tripId, isOwner, isExpertViewer, aiAction }: AskAiDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [askRefusal, setAskRefusal] = useState<AskAiAskRefusal | null>(null);
  const [actionNote, setActionNote] = useState<{ proposalId: string; text: string; reAsk: boolean } | null>(
    null,
  );
  const [paySheet, setPaySheet] = useState<PaySheet | null>(null);

  /**
   * THE PROPOSAL LOG — and, for an advisor, the VISIBILITY PROOF.
   *
   * `requireWriteAccess: true` is this route's own gate, so a successful read proves the §12 WRITE
   * status the ask and discard rails need and a 401/403 is the refusal. `retry: false` for the
   * §13 reason the guest roster gives one: a refusal must never be retried into an empty answer.
   */
  const logQuery = useQuery<AskAiProposalsResponse>({
    queryKey: [`/api/trips/${tripId}/proposals`],
    enabled: !!tripId && (isOwner || isExpertViewer),
    retry: false,
    staleTime: 15_000,
  });

  const logRead: "pending" | "ok" | "refused" | "error" = logQuery.isSuccess
    ? "ok"
    : logQuery.isError
      ? isRefusalStatus(logQuery.error)
        ? "refused"
        : "error"
      : "pending";

  const visibility = askAiRailVisibility({ isOwner, isExpertViewer, logRead });

  const ask = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/trips/${tripId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // The §19 `.strict()` allowlist is EXACTLY `{ question }`. Sending anything else is refused
        // at the door on purpose, and a client that sends more is a client that believes something
        // extra matters — which is what `.strict()` exists to surface.
        body: JSON.stringify({ question: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error("ask refused"), { refusal: readAskRefusal(res.status, body) });
      }
      return res.json();
    },
    onSuccess: () => {
      setAskRefusal(null);
      setQuestion("");
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/proposals`] });
    },
    onError: (err: any) => {
      // Every refusal renders IN the drawer, in the server's own words, rather than as a toast
      // that disappears: "not available yet" is a standing fact about the rail, not an event.
      setAskRefusal(err?.refusal ?? readAskRefusal(0, {}));
    },
  });

  const discard = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await fetch(`/api/trips/${tripId}/proposals/${proposalId}/discard`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.message === "string" ? body.message : "Couldn't discard this one");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/proposals`] });
    },
    onError: (err: any) =>
      toast({ variant: "destructive", title: "Couldn't discard", description: err?.message }),
  });

  /**
   * PAY → APPLY, review-first (Locked Decision 42 D18, LD 41 (d)/(e)).
   *
   * The change set is already rendered IN FULL above this control — that is the safeguard, and it
   * is the only one, because there is no undo. The pay rail answers one of three things and every
   * one of them is the SERVER's decision: covered by a Trip Pass (apply straight away, no sheet,
   * no PaymentIntent), a sheet to confirm, or a refusal with a reason.
   */
  async function startApply(proposalId: string) {
    setActionNote(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/proposals/${proposalId}/pay`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const refusal = readProposalActionRefusal(res.status, body);
        setActionNote({
          proposalId,
          text: [refusal.message, refusal.refundLine].filter(Boolean).join(" "),
          reAsk: refusal.offersReAsk,
        });
        return;
      }
      if (body?.coveredByTripPass === true) {
        // A covered apply takes no claim and spends no PaymentIntent (LD 41 (a)); there is nothing
        // to confirm, so there is no sheet to draw.
        await applyProposal(proposalId, null);
        return;
      }
      if (typeof body?.clientSecret === "string" && typeof body?.paymentIntentId === "string") {
        setPaySheet({
          proposalId,
          clientSecret: body.clientSecret,
          paymentIntentId: body.paymentIntentId,
          // §14: the amount on the sheet is the one the SERVER built the PaymentIntent from.
          feeCents: typeof body.feeCents === "number" ? body.feeCents : 0,
        });
        return;
      }
      setActionNote({ proposalId, text: ASK_AI_COPY.priceUnknown, reAsk: false });
    } catch (err: any) {
      setActionNote({ proposalId, text: err?.message || "We couldn't start this.", reAsk: false });
    }
  }

  async function applyProposal(proposalId: string, paymentIntentId: string | null) {
    try {
      const res = await fetch(`/api/trips/${tripId}/proposals/${proposalId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // The ONLY client-supplied value this rail accepts, and it authorizes nothing until Stripe
        // and the intent's own server-written metadata both vouch for it (§15c posture).
        body: JSON.stringify(paymentIntentId ? { paymentIntentId } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const refusal = readProposalActionRefusal(res.status, body);
        setActionNote({
          proposalId,
          text: [refusal.message, refusal.refundLine].filter(Boolean).join(" "),
          reAsk: refusal.offersReAsk,
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/proposals`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      // Rule 3: reported, never offered back. The toast states the record, not a reverse.
      toast({ title: "Applied to your plan", description: ASK_AI_COPY.appliedNoUndo });
    } catch (err: any) {
      setActionNote({ proposalId, text: err?.message || "We couldn't apply this one.", reAsk: false });
    }
  }

  if (!visibility.visible) return null;

  const proposals = Array.isArray(logQuery.data?.proposals) ? logQuery.data!.proposals! : [];
  const priceLine = askAiPriceLine(logQuery.data?.aiTask);
  const deferral = askAiDeferralToDraft(aiAction);

  return (
    <div data-testid="slip-rail-ask-ai" className="rounded-lg border bg-card p-3 space-y-2">
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ fontFamily: EARN_MONO }}
      >
        Ask AI
      </p>

      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => setOpen(true)}
        data-testid="slip-action-ask-ai"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">{ASK_AI_COPY.title}</span>
        <span className="font-mono text-[10px] text-muted-foreground" style={{ fontFamily: EARN_MONO }}>
          {ASK_AI_COPY.railMeta}
        </span>
      </Button>

      {/* LANE 2 — THE COVERAGE / PRICE LINE. Three server-decided states and no fourth; an
          `unknown` renders the "we have no answer" sentence and never a number (§13). */}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground" data-testid="ask-ai-price-line">
        {priceLine.kind === "covered" ? (
          <span className="inline-flex items-center gap-1">
            <Ticket className="w-3.5 h-3.5" />
            {priceLine.label}
          </span>
        ) : (
          priceLine.label
        )}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" data-testid="ask-ai-drawer">
          <DialogHeader>
            <DialogTitle>{ASK_AI_COPY.title}</DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground" data-testid="ask-ai-stateless-note">
            {ASK_AI_COPY.statelessNote}
          </p>

          {/* LD 41 (b) — ON AN EMPTY PLAN THE DRAWER DEFERS and offers no paid task. */}
          {deferral ? (
            <div className="rounded-md border p-3 text-sm" data-testid="ask-ai-empty-plan-deferral">
              <p className="font-medium">{ASK_AI_COPY.emptyPlanDeferralTitle}</p>
              <p className="mt-1 text-muted-foreground">{deferral}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2" data-testid="ask-ai-ask-box">
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={ASK_AI_COPY.askPlaceholder}
                  rows={3}
                  data-testid="ask-ai-question"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">{ASK_AI_COPY.askIsFree}</p>
                  <Button
                    size="sm"
                    onClick={() => {
                      const text = question.trim();
                      if (text === "") {
                        setAskRefusal({ kind: "failed", message: ASK_AI_COPY.askEmpty, canRetry: true });
                        return;
                      }
                      ask.mutate(text);
                    }}
                    disabled={ask.isPending}
                    data-testid="ask-ai-submit"
                  >
                    {ask.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ASK_AI_COPY.askAction}
                  </Button>
                </div>
                {askRefusal && (
                  <p className="text-[11px] text-destructive" data-testid={`ask-ai-refusal-${askRefusal.kind}`}>
                    {askRefusal.message}
                    {askRefusal.kind === "rate_limited" && askRefusal.retryAfterSec != null && (
                      <span className="ml-1 text-muted-foreground">
                        Try again in {askRefusal.retryAfterSec}s.
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* THE PRICE, restated where the charge actually happens (rule 2). Same derivation,
                  same server block — one `askAiPriceLine` call's result, rendered twice. */}
              <p className="text-[11px] text-muted-foreground" data-testid="ask-ai-drawer-price">
                {priceLine.label}
              </p>

              {/* D-48 — the apply controls are the OWNER's. An advisor is told why they are absent
                  rather than shown one the route will refuse. */}
              {visibility.applyAbsenceNote && (
                <p className="text-[11px] text-muted-foreground" data-testid="ask-ai-advisor-note">
                  {visibility.applyAbsenceNote}
                </p>
              )}

              {/* THE LOG — applied and discarded rows included (rule 7). */}
              {proposals.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="ask-ai-empty-log">
                  {ASK_AI_COPY.emptyLog}
                </p>
              ) : (
                <ul className="space-y-3" data-testid="ask-ai-log">
                  {proposals.map((row) => (
                    <ProposalRow
                      key={row.id}
                      row={row}
                      canApply={visibility.canApply}
                      canDiscard={visibility.canAsk}
                      note={actionNote?.proposalId === row.id ? actionNote : null}
                      onDiscard={() => discard.mutate(row.id)}
                      onApply={() => void startApply(row.id)}
                      onReAsk={() => {
                        setQuestion(row.question ?? "");
                        setActionNote(null);
                      }}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* The AI-task fee sheet — the SAME StripeCheckout surface the optimizer fee mounts. The
          amount shown is the server-created PaymentIntent's (§14). */}
      <Dialog open={!!paySheet} onOpenChange={(o) => !o && setPaySheet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay for this task</DialogTitle>
          </DialogHeader>
          {paySheet && (
            <StripeCheckout
              paymentIntent={{
                clientSecret: paySheet.clientSecret,
                paymentIntentId: paySheet.paymentIntentId,
                amount: paySheet.feeCents,
              }}
              bookingIds={[]}
              onSuccess={(paymentIntentId) => {
                const proposalId = paySheet.proposalId;
                setPaySheet(null);
                void applyProposal(proposalId, paymentIntentId);
              }}
              onError={(err) =>
                toast({ variant: "destructive", title: "Payment failed", description: err })
              }
              onCancel={() => setPaySheet(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ONE proposal, rendered IN FULL before any pay control is reachable (review-first, D18). */
function ProposalRow({
  row,
  canApply,
  canDiscard,
  note,
  onDiscard,
  onApply,
  onReAsk,
}: {
  row: AskAiProposalRow;
  canApply: boolean;
  canDiscard: boolean;
  note: { text: string; reAsk: boolean } | null;
  onDiscard: () => void;
  onApply: () => void;
  onReAsk: () => void;
}) {
  const state = askAiRowState(row, canApply);
  const changeSet = readChangeSet(row.proposal);
  const record = appliedRecordLine(row);

  return (
    <li className="rounded-md border p-3 space-y-2 text-sm" data-testid={`ask-ai-proposal-${row.id}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{row.question || "This plan"}</p>
        <span
          className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
          style={{ fontFamily: EARN_MONO }}
          data-testid={`ask-ai-state-${row.id}`}
        >
          {state.badge ?? ASK_AI_COPY.stagedBadge}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground" data-testid={`ask-ai-state-note-${row.id}`}>
        {state.note}
      </p>

      {/* RULE 8 — an empty change set is a real answer, and no pay control renders for it. */}
      {changeSet.isEmpty && state.kind === "staged" && (
        <p className="text-[11px] text-muted-foreground" data-testid={`ask-ai-empty-changeset-${row.id}`}>
          {ASK_AI_COPY.emptyChangeSet}
        </p>
      )}

      {changeSet.additions.length > 0 && (
        <ul className="space-y-1" data-testid={`ask-ai-additions-${row.id}`}>
          {changeSet.additions.map((add, i) => {
            const cost = readEstimatedCost(add);
            return (
              <li key={`${add.title}-${i}`} className="text-[13px]">
                <span className="font-medium">{add.title}</span>
                {typeof add.dayNumber === "number" && Number.isFinite(add.dayNumber) && (
                  <span className="ml-1.5 text-muted-foreground">Day {add.dayNumber}</span>
                )}
                {/* RULE 9 — an absent price is omitted. Never `$0`. */}
                {cost && (
                  <span
                    className="ml-1.5 font-mono text-[11px]"
                    style={{ fontFamily: EARN_MONO }}
                    data-testid="ask-ai-addition-cost"
                  >
                    {cost}
                  </span>
                )}
                {add.reason && <p className="text-[11px] text-muted-foreground">{add.reason}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {changeSet.replaces.length > 0 && (
        <p className="text-[11px] text-muted-foreground" data-testid={`ask-ai-replaces-${row.id}`}>
          {changeSet.replaces.length === 1
            ? "Would replace 1 item already on your plan."
            : `Would replace ${changeSet.replaces.length} items already on your plan.`}
        </p>
      )}

      {changeSet.notes.map((n, i) => (
        <p key={i} className="text-[12px] text-muted-foreground" data-testid={`ask-ai-note-${row.id}`}>
          {n}
        </p>
      ))}

      {/* RULE 10 — a day the proposal did not name is not the AI's answer. */}
      {changeSet.hasUnplacedAddition && (
        <p className="text-[11px] text-muted-foreground" data-testid={`ask-ai-unplaced-${row.id}`}>
          {ASK_AI_COPY.unplacedDay}
        </p>
      )}

      {/* RULE 5 — a present `protectedNote` renders verbatim; absent, NOTHING is said. */}
      {changeSet.protectedNote && (
        <p className="text-[11px]" data-testid={`ask-ai-protected-${row.id}`}>
          <span
            className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide"
            style={{ fontFamily: EARN_MONO }}
          >
            {ASK_AI_COPY.protectedEyebrow}
          </span>
          {changeSet.protectedNote}
        </p>
      )}

      {/* RULE 3 — what the apply created, as a record. No reverse is drawn. */}
      {record && (
        <p className="text-[11px] text-muted-foreground" data-testid={`ask-ai-applied-record-${row.id}`}>
          {record}
        </p>
      )}

      {note && (
        <p className="text-[11px] text-destructive" data-testid={`ask-ai-action-note-${row.id}`}>
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {state.canApply && (
          <Button size="sm" onClick={onApply} data-testid={`ask-ai-apply-${row.id}`}>
            {ASK_AI_COPY.applyAction}
          </Button>
        )}
        {state.canDiscard && canDiscard && (
          <Button size="sm" variant="ghost" onClick={onDiscard} data-testid={`ask-ai-discard-${row.id}`}>
            {ASK_AI_COPY.discardAction}
          </Button>
        )}
        {/* D-50 (c) — a refusal offers a RE-ASK, never a retry of the same proposal and never a
            silent reprice. It prefills the question; it does not send one. */}
        {((note?.reAsk ?? false) || state.kind === "refunded") && canDiscard && (
          <Button size="sm" variant="outline" onClick={onReAsk} data-testid={`ask-ai-re-ask-${row.id}`}>
            {ASK_AI_COPY.reAskAction}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Is this read error the ROUTE refusing us, rather than a network or server failure?
 *
 * §13 — the distinction is load-bearing: a 401/403 is "you may not read this plan's proposals",
 * which is a pending advisor and draws nothing; anything else is "we have no answer", which for an
 * advisor also draws nothing (we cannot prove their status) but is never recorded as a refusal.
 */
function isRefusalStatus(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  // `queryClient` throws `new Error(`${res.status}: ${text}`)` — the status leads the message.
  return /^(401|403)\b/.test(message);
}
