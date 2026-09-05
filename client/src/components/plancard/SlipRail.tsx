/**
 * SlipRail — the slip's action rail, regrouped into FOUR cards.
 *
 * Ledger `2026-09-05-slip-rail-regroup` (LD 42 build-order row 1.5, ratified); the canvas "rail"
 * annotation in `slip-canvas/gen.py`, whose `build_card` / `plan_card` / `share_card` /
 * `finish_card` this file renders. CLAUDE.md §13, §18 rule 1, Locked Decisions 12, 21, 22(c), 28,
 * 30, 34, 39, 40, 41, 42, 43.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * It is a REGROUPING. Every control here is the control that already existed: the same optimize
 * gate, the same preview line and fee label, the same finalize mutation and its chooser, the same
 * PDF anchor, the same logistics collapsibles, the same Trip Pass card. Two things are genuinely
 * new — the token share link (S10) and the trip-keyed calendar (S11) — and both are new CALLERS
 * of rails that already existed, never new rails.
 *
 * It is NOT a second home for anything. Each control appears in exactly ONE card, which is the
 * whole point: the flat button row it replaces had grown two ways to reach the Trip Card, two
 * expert pickers and a bulk-checkout button that duplicated what Finalize's own chooser does.
 *
 * ── WHAT LEFT THE RAIL, AND WHY (the removals are part of the ruling) ────────────────────────
 *  · `slip-action-add-all-checkout` — FOLDED INTO FINALIZE. `FinalizeBookingModal`'s "I book them
 *    myself" branch already runs `runBulkRouteToCheckout` over the same rows; a second button
 *    doing the same bulk write beside it is the drift class §18 rule 1 names. The helper itself
 *    is untouched and still Finalize's.
 *  · `slip-action-trip-card` ("Preview Trip Card") — REMOVED FROM THE PRE-FINAL RAIL. Before a
 *    snapshot exists `/trip/:id` has nothing of its own to render and bounces back here, so the
 *    control promised a surface that did not exist (§13). The Trip Card is reachable from the
 *    Finish card the moment the plan is finalized, and nowhere else.
 *  · `AssignExpertSlot` / `button-find-expert` — ONE PICKER (D7). The slip carried two advisor
 *    pickers writing through two different routes: `AssignExpertSlot` → the raw-body
 *    `POST /api/trips/:id/expert-advisor`, and `HireExpertDialog` → the pick-based, §19-shaped
 *    `POST /api/trips/:tripId/advisors`. The Build card mounts the pick-based one. THE OLDER
 *    SERVER ROUTE IS DELIBERATELY NOT DELETED IN THIS LANE — it still has callers elsewhere and
 *    retiring it is its own change.
 *
 * ── §13 THROUGHOUT ──────────────────────────────────────────────────────────────────────────
 * Nothing here renders a zero, a placeholder or a disabled control standing in for an absence.
 * A plan with no share token gets the token minted on press (the rail is idempotent); an expert
 * with no public address gets a sentence, not a dead button; a card whose rows are all gated away
 * is not rendered at all.
 */
import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  FileDown,
  Loader2,
  MessageCircle,
  Plus,
  Share2,
  ShoppingCart,
  Sparkles,
  Ticket,
  Undo2,
  UserPlus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as sharedQueryClient } from "@/lib/queryClient";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { VendorContractBoard } from "@/components/logistics/vendor-contract-board";
import { createComparison, type ComparisonPinnedAnchor } from "@/lib/create-comparison";
import {
  confirmOptimizationPayment,
  requestOptimizationGate,
  type OptimizationPaymentSheet,
} from "@/lib/optimization-gate";
import {
  describeOptimizationPreview,
  formatOptimizationFeeLabel,
  type OptimizationFeeQuote,
  type TripOptimizationPreview,
} from "@/lib/optimization-preview";
import { readSlipHasItemsRefusal } from "@/lib/ai-draft-refusal";
import { countOptimizableItems, slipOptimizeDisabledReason } from "@/lib/slip-plan-actions";
import {
  countCheckoutReadyItems,
  slipBuildAiAction,
  slipCalendarPath,
  slipDraftDisabledReason,
  slipExpertRailState,
  slipPdfPath,
  slipShareUrl,
  SLIP_EXPERT_NO_HANDLE_NOTE,
  type SlipRailAdvisor,
} from "@/lib/slip-rail";
import { useAskExpert } from "@/lib/use-ask-expert";
import { useOccasionSwitches } from "@/hooks/use-occasion-switches";
import { tripCardForcedPrimaryByDateAlone } from "@shared/trip-primary-surface";
import type { PlanCardActivity } from "./plancard-types";
import type { PlanEvent } from "@/lib/slip-events";
import type { SlipTrip } from "./SlipView";
import { BuildAroundDialog } from "./BuildAroundDialog";
import { FinalizeBookingModal } from "./FinalizeBookingModal";
import { HireExpertDialog } from "./HireExpertDialog";
import { SlipLogisticsSection } from "./SlipLogisticsSection";
import { TripPassCard } from "./TripPassCard";

// ── card + row chrome ─────────────────────────────────────────────────────────────────────────

/** One rail card: a mono uppercase eyebrow over its rows. The four are Build / Plan / Share / Finish. */
function RailCard({
  card,
  title,
  children,
}: {
  card: "build" | "plan" | "share" | "finish";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card data-testid={`slip-rail-${card}`}>
      <CardContent className="p-3 space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

/** A rail row: full-width, label left, optional mono meta right — the artboard's `rowbtn`. */
function RailRow({
  label,
  meta,
  icon,
  onClick,
  href,
  external,
  disabled,
  title,
  busy,
  primary,
  testId,
}: {
  label: string;
  meta?: string | null;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  /** A plain <a> (a server download) rather than a client route. */
  external?: boolean;
  disabled?: boolean;
  title?: string;
  busy?: boolean;
  primary?: boolean;
  testId: string;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : icon}
        <span className="truncate">{label}</span>
      </span>
      {meta ? (
        <span className="ml-auto pl-2 font-mono text-[10px] font-normal text-muted-foreground truncate">
          {meta}
        </span>
      ) : null}
    </>
  );
  const className = "w-full justify-start h-auto py-2 px-2.5 text-[13px] font-semibold";

  if (href && external) {
    return (
      <Button variant="outline" size="sm" className={className} asChild data-testid={testId}>
        <a href={href} download>
          {inner}
        </a>
      </Button>
    );
  }
  if (href) {
    return (
      <Button variant="outline" size="sm" className={className} asChild data-testid={testId}>
        <Link href={href}>{inner}</Link>
      </Button>
    );
  }
  return (
    <span title={title} className="block">
      <Button
        variant={primary ? "default" : "outline"}
        size="sm"
        className={className}
        onClick={onClick}
        disabled={disabled || busy}
        data-testid={testId}
      >
        {inner}
      </Button>
    </span>
  );
}

/** A line of prose under a row — a preview, a fee label, an honest absence. Never a control. */
function RailNote({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="px-1 text-[11px] leading-relaxed text-muted-foreground" data-testid={testId}>
      {children}
    </p>
  );
}

// ── Build ─────────────────────────────────────────────────────────────────────────────────────

/**
 * THE BUILD CARD — the four ways a plan gains content, in the order the artboard draws them:
 * browse, the ONE AI action, the expert, and the entitlement that covers AI runs on this trip.
 */
function BuildCard({
  trip,
  tripId,
  isOwner,
  activities,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  activities: PlanCardActivity[];
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const askExpert = useAskExpert();

  // ── The ONE AI action (Locked Decision 41 (b)) ──────────────────────────────────────────────
  const aiAction = slipBuildAiAction(activities.length);

  // Optimize — the SAME shared gate sequence `cart.tsx` runs (`lib/optimization-gate.ts`), fed
  // from this trip's own DTO fields. Moved here verbatim from the flat action row; not re-cut.
  const [optimizing, setOptimizing] = useState(false);
  const [creatingComparison, setCreatingComparison] = useState(false);
  const [paySheet, setPaySheet] = useState<OptimizationPaymentSheet | null>(null);
  const [buildAroundOpen, setBuildAroundOpen] = useState(false);
  const [lastOptimizeCoveredByPass, setLastOptimizeCoveredByPass] = useState(false);
  const confirmedPinnedAnchor = useRef<ComparisonPinnedAnchor | undefined>(undefined);

  const optimizableCount = countOptimizableItems(activities);
  const optimizeDisabledReason = slipOptimizeDisabledReason({
    optimizableCount,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });

  /**
   * THE FREE PREVIEW BESIDE OPTIMIZE (Locked Decision 41 (d), ledger
   * `2026-09-05-optimize-preview-on-slip`) — MOVED, not rebuilt. Two server-resolved reads,
   * neither of which charges anything; the amount and the Trip Pass coverage are both server
   * truth and nothing here derives either (§14). Fetched only when Optimize could actually run,
   * and fail-soft: a refusal leaves the line rendering NOTHING rather than a zero (§13).
   */
  const previewEnabled = isOwner && aiAction === "optimize" && !optimizeDisabledReason;
  const { data: previewData } = useQuery<TripOptimizationPreview>({
    queryKey: ["/api/optimization-preview", { tripId: trip.id }],
    enabled: previewEnabled,
  });
  const { data: feeQuote } = useQuery<OptimizationFeeQuote>({
    queryKey: ["/api/optimization-fee", { tripId: trip.id }],
    enabled: previewEnabled,
  });
  const previewLine = previewEnabled ? describeOptimizationPreview(previewData) : null;
  const previewFeeLabel = previewEnabled ? formatOptimizationFeeLabel(feeQuote) : null;

  async function runComparison(
    optimizationPaymentId?: string,
    pinnedAnchor?: ComparisonPinnedAnchor,
  ) {
    setCreatingComparison(true);
    try {
      const comparison = await createComparison({
        title: trip.title || undefined,
        destination: trip.destination!,
        startDate: String(trip.startDate).slice(0, 10),
        endDate: String(trip.endDate).slice(0, 10),
        ...(trip.travelers ? { travelers: trip.travelers } : {}),
        tripId: trip.id,
        ...(optimizationPaymentId ? { optimizationPaymentId } : {}),
        ...(pinnedAnchor ? { pinnedAnchor } : {}),
      });
      // REVIEW-FIRST (ledger 2026-08-22-slip-optimize-review-first): a slip-originated
      // optimization lands as a PROPOSAL the traveler reviews, so `?autoApply=1` is omitted.
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } finally {
      setCreatingComparison(false);
    }
  }

  async function startOptimization(pinnedAnchor?: ComparisonPinnedAnchor) {
    if (optimizing || creatingComparison || optimizeDisabledReason) return;
    setOptimizing(true);
    setLastOptimizeCoveredByPass(false);
    try {
      const outcome = await requestOptimizationGate({
        tripId: trip.id,
        destination: trip.destination || undefined,
      });
      if (outcome.kind === "refused") {
        confirmedPinnedAnchor.current = undefined;
        toast({
          title: "Nothing to optimize yet",
          description:
            (typeof outcome.body.message === "string" && outcome.body.message) ||
            "This plan has no items the optimizer can work with.",
        });
        return;
      }
      if (outcome.kind === "free_rerun" || outcome.kind === "covered_by_pass") {
        if (outcome.kind === "covered_by_pass") setLastOptimizeCoveredByPass(true);
        await runComparison(undefined, pinnedAnchor);
        confirmedPinnedAnchor.current = undefined;
        return;
      }
      if (outcome.kind === "payment_sheet") setPaySheet(outcome.payment);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't start optimization",
        description: err?.message || "Please try again",
      });
      confirmedPinnedAnchor.current = undefined;
    } finally {
      setOptimizing(false);
    }
  }

  async function handleSheetSuccess(paymentIntentId: string) {
    const pinnedAnchor = confirmedPinnedAnchor.current;
    setPaySheet(null);
    try {
      await confirmOptimizationPayment(paymentIntentId);
      await runComparison(paymentIntentId, pinnedAnchor);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to generate itinerary",
        description: err?.message || "Your payment is recorded — try Optimize again (free re-run).",
      });
    } finally {
      confirmedPinnedAnchor.current = undefined;
    }
  }

  /**
   * DRAFT IT WITH AI — offered ONLY on a plan with zero rows (Locked Decision 41 (b)); one row of
   * any status and this card offers Optimize instead. It calls the EXISTING generate rail
   * (`POST /api/ai/generate-itinerary`) with this trip's own id, so the server re-checks the same
   * rule it owns and refuses with the 409 the shared `readSlipHasItemsRefusal` reads.
   *
   * IT LANDS BACK ON THE SLIP. The free draft is a SKETCH (LD 41 (c)) and the slip is where a
   * sketch is read — the header's own `aiSketch` line says so. The endpoint also mints a
   * comparison; this rail deliberately does not navigate there, because sending a traveler who
   * pressed "draft my plan" to a three-variant board is the review surface Optimize is for.
   */
  const draftDisabledReason = slipDraftDisabledReason({
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const draft = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/generate-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tripId: trip.id,
          destination: trip.destination,
          dates: { start: String(trip.startDate).slice(0, 10), end: String(trip.endDate).slice(0, 10) },
          travelers: trip.travelers || 1,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // The server's OWN sentence for a non-empty slip — never a second copy of the rule.
        const refusal = readSlipHasItemsRefusal(res.status, body);
        if (refusal) throw new Error(refusal.message);
        throw new Error(body?.message || "Couldn't draft this plan");
      }
      return res.json();
    },
    onSuccess: () => {
      sharedQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      toast({
        title: "Draft added to your plan",
        description: "A starting sketch — one version, without live prices. Optimize builds around it.",
      });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't draft this plan", description: err?.message });
    },
  });

  // ── The expert (ONE picker, ONE message control) ────────────────────────────────────────────
  const [hireOpen, setHireOpen] = useState(false);
  // The SAME owner-gated advisor read the event headers already use — one endpoint, one cache
  // entry, no second query shape for the same fact.
  const { data: advisorData } = useQuery<{ advisor: SlipRailAdvisor | null }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled: isOwner && !!tripId,
  });
  const expertState = slipExpertRailState(advisorData?.advisor ?? null);

  return (
    <RailCard card="build" title="Build">
      {isOwner && (
        <RailRow
          label="Browse services for this trip"
          meta="/services"
          icon={<Plus className="w-3.5 h-3.5" />}
          href={`/services?tripId=${encodeURIComponent(tripId)}`}
          testId="slip-browse-services"
        />
      )}

      {/* THE ONE AI ACTION. Owner-only in both branches — the draft rebuilds the owner's plan and
          the optimization fee charges the signed-in traveler. */}
      {isOwner && aiAction === "draft" && (
        <>
          <RailRow
            label="Draft it with AI"
            meta="empty plan"
            icon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={() => draft.mutate()}
            busy={draft.isPending}
            disabled={!!draftDisabledReason}
            title={draftDisabledReason ?? undefined}
            testId="slip-action-draft-ai"
          />
          <RailNote testId="slip-draft-note">
            Offered only on an empty plan — one row of any status and this becomes Optimize.
          </RailNote>
        </>
      )}

      {isOwner && aiAction === "optimize" && (
        <>
          <span title={optimizeDisabledReason ?? undefined} data-testid="slip-action-optimize-wrap">
            <RailRow
              label={creatingComparison ? "Building…" : "Optimize this plan"}
              meta="review first"
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={() => {
                if (optimizing || creatingComparison || optimizeDisabledReason) return;
                setBuildAroundOpen(true);
              }}
              busy={optimizing || creatingComparison}
              disabled={!!optimizeDisabledReason}
              testId="slip-action-optimize"
            />
          </span>
          {previewLine && (
            <RailNote testId="slip-optimize-preview">
              <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide">
                Free estimate
              </span>
              {previewLine.kind === "estimate" ? (
                <>
                  <span>{previewLine.headline}</span>{" "}
                  <span className="italic opacity-80">{previewLine.caveat}</span>
                  {previewFeeLabel && (
                    <span
                      className="ml-1.5 font-mono text-[10px] text-foreground/70"
                      data-testid="slip-optimize-preview-fee"
                    >
                      {previewFeeLabel}
                    </span>
                  )}
                </>
              ) : (
                <span>{previewLine.reason}</span>
              )}
            </RailNote>
          )}
          {lastOptimizeCoveredByPass && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--earn-border)] bg-[color:var(--earn-teal-wash)] px-2.5 py-1 text-xs font-medium text-[color:var(--earn-teal-ink)]"
              data-testid="trip-pass-covered-label"
            >
              <Ticket className="w-3.5 h-3.5" />
              Included in your Trip Pass
            </span>
          )}
        </>
      )}

      {/* THE EXPERT — three states, three different facts (see `slipExpertRailState`). */}
      {isOwner && expertState.kind === "hire" && (
        <>
          <RailRow
            label="Hand off to a local expert"
            meta="choose one"
            icon={<UserPlus className="w-3.5 h-3.5" />}
            onClick={() => setHireOpen(true)}
            testId="slip-action-hire-expert"
          />
          {/* The plan-level picker: `event={null}` is the plan's implicit unnamed event
              (Locked Decision 29), which is exactly what "hire for this plan" means. */}
          <HireExpertDialog
            tripId={tripId}
            destination={trip.destination}
            event={null}
            open={hireOpen}
            onOpenChange={setHireOpen}
          />
        </>
      )}
      {isOwner && expertState.kind === "message" && (
        <RailRow
          label={`Message ${expertState.name}`}
          meta={expertState.pending ? "awaiting reply" : "expert"}
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          onClick={() =>
            void askExpert({
              // Locked Decision 40: the conversation is opened by naming the HANDLE. No user id
              // is sent and none comes back.
              handle: expertState.handle,
              subject: trip.title || trip.destination || null,
              fallbackName: expertState.name,
              returnTo: `/plans/${tripId}`,
            })
          }
          testId="slip-action-message-expert"
        />
      )}
      {isOwner && expertState.kind === "no_handle" && (
        <RailNote testId="slip-expert-no-handle">
          {expertState.name} is on this plan. {SLIP_EXPERT_NO_HANDLE_NOTE}
        </RailNote>
      )}

      {/* TRIP PASS — the entitlement that covers AI runs on this trip. The EXISTING card, moved
          into the card whose actions it covers; one component, never a second purchase rail. */}
      <div data-testid="slip-rail-trip-pass">
        <TripPassCard tripId={tripId} />
      </div>

      <BuildAroundDialog
        open={buildAroundOpen}
        tripId={trip.id}
        busy={optimizing || creatingComparison}
        onOpenChange={setBuildAroundOpen}
        onConfirm={(pinnedAnchor) => {
          confirmedPinnedAnchor.current = pinnedAnchor;
          setBuildAroundOpen(false);
          void startOptimization(pinnedAnchor);
        }}
      />
      {/* The optimization fee sheet — the SAME StripeCheckout surface `cart.tsx` mounts, in a
          dialog. The amount shown comes from the server-created PaymentIntent (§14). */}
      <Dialog
        open={!!paySheet}
        onOpenChange={(open) => {
          if (!open) {
            setPaySheet(null);
            confirmedPinnedAnchor.current = undefined;
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay optimization fee</DialogTitle>
          </DialogHeader>
          {paySheet && (
            <StripeCheckout
              paymentIntent={{
                clientSecret: paySheet.clientSecret,
                paymentIntentId: paySheet.paymentIntentId,
                amount: paySheet.feeCents,
              }}
              bookingIds={[]}
              onSuccess={handleSheetSuccess}
              onError={(err) => toast({ variant: "destructive", title: "Payment failed", description: err })}
              onCancel={() => {
                setPaySheet(null);
                confirmedPinnedAnchor.current = undefined;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </RailCard>
  );
}

// ── Plan ──────────────────────────────────────────────────────────────────────────────────────

/**
 * THE PLAN CARD — what the plan knows about itself, as opposed to what is in it.
 *
 * Guests & invites, traveling party, main moment & schedule check and organize-into-events are
 * `SlipLogisticsSection`'s, unchanged and re-mounted here; the contract board is one more mount of
 * the EXISTING `VendorContractBoard`; the budget total is the EXISTING derived line, passed in
 * rather than recomputed (§18 rule 1 — `planBudgetLine` has one caller and it stays SlipView's).
 *
 * STOPS & TIMEZONE are deliberately ABSENT (S6/S7 are a later lane). §13: a placeholder row for a
 * surface that does not exist would be a promise, so there is none.
 */
function PlanCard({
  tripId,
  isOwner,
  planEvents,
  budgetLine,
}: {
  tripId: string;
  isOwner: boolean;
  planEvents: readonly PlanEvent[];
  /** The plan's DERIVED budget total, or null when no event states one (never "$0" — §13). */
  budgetLine: string | null;
}) {
  const [contractsOpen, setContractsOpen] = useState(false);

  // A non-owner viewer gets neither the logistics collapsibles (owner-only by ruling) nor the
  // contract board (its read tier is broader, but the card would then hold one row); with the
  // budget line absent too there is nothing to draw, and an empty card is not drawn.
  if (!isOwner && !budgetLine) return null;

  return (
    <RailCard card="plan" title="Plan">
      {isOwner && <SlipLogisticsSection tripId={tripId} planEvents={planEvents} />}

      {/* THE CONTRACT BOARD — `vendor_contracts` had four owner-gated read endpoints and, on this
          plan's own surface, no door at all; it mounted only inside the retired logistics
          dashboard. One more mount of the existing read-only board (ledger
          `2026-09-04-plan-islands`), collapsed by default like the anchors beside it. */}
      {isOwner && (
        <Collapsible open={contractsOpen} onOpenChange={setContractsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
              data-testid="button-toggle-slip-contracts"
            >
              <span className="flex items-center gap-2">Vendor contracts</span>
              <ChevronRight className={`w-4 h-4 transition-transform ${contractsOpen ? "rotate-90" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <VendorContractBoard tripId={tripId} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* THE BUDGET — stated PER EVENT, plan total DERIVED and never stored (ledger
          `2026-09-04-event-budget`). Rendered only when at least one event states one; the count
          is part of the claim, so the line says how many events it covers. */}
      {budgetLine && (
        <p className="px-1 text-[11px] text-muted-foreground" data-testid="slip-plan-budget">
          {budgetLine}
        </p>
      )}
    </RailCard>
  );
}

// ── Share ─────────────────────────────────────────────────────────────────────────────────────

/**
 * THE SHARE CARD — owner-only, and ABSENT under a hidden-visibility occasion.
 *
 * A HIDDEN OCCASION HAS NO SHARE CARD AT ALL (migration 276 `default_visibility`; Locked
 * Decision 28). Sharing a proposal plan is the failure mode that switch exists to prevent. The
 * PDF and the calendar go with the link here — under a hidden occasion the whole card is hidden,
 * which is the artboard's own ruling ("under a hidden-visibility occasion BOTH the Share card and
 * the Guests row are absent").
 *
 * §13: an unresolved occasion or a NULL column is NOT hidden, i.e. exactly today's behaviour. An
 * undecided plan never loses its Share card.
 */
function ShareCard({ trip, tripId, isOwner }: { trip: SlipTrip; tripId: string; isOwner: boolean }) {
  const { toast } = useToast();
  const { isHidden: occasionHidden } = useOccasionSwitches(tripId);

  /**
   * THE TOKEN SHARE LINK (S10) — the fix, and it needed no payload change.
   *
   * The slip copied `${origin}/itinerary/${trip.id}`, which redirects to `/trip/:id`, a
   * ProtectedRoute — so every recipient met a login wall and the link never worked for anyone but
   * the owner. `POST /api/trips/:id/share` is the platform's EXISTING owner-gated share rail
   * (`isTripOwnerCanonical`, then an idempotent retrieve-or-create over `shared_trips`), and
   * `/trips/shared/:token` is the public, trip-shaped read that renders it. This is one more
   * CALLER of that rail — `trip-details.tsx` is the other — and the URL is built by the ONE
   * `slipShareUrl` so the two can never disagree (§18 rule 1).
   *
   * DELIBERATELY NOT `trips.share_token`. That column is the GUEST-ACCESS credential
   * (`GET`/`PATCH /api/trips/:id?token=` accept it as authorization), so handing it out as a
   * "share link" would publish a write grant. The plancard payload therefore did NOT need a
   * `shareToken` field, and none was added: the token is minted on press by the rail that owns it.
   *
   * §13 — a rail that cannot answer copies NOTHING. There is no fallback to the id link: that is
   * the broken link this fix removes, and re-offering it on failure would put it straight back.
   */
  const share = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/share`);
      return (await res.json()) as { success?: boolean; shareToken?: string | null };
    },
    onSuccess: (data) => {
      const token = typeof data?.shareToken === "string" ? data.shareToken : "";
      if (!token) {
        toast({
          variant: "destructive",
          title: "Couldn't create a share link",
          description: "Please try again.",
        });
        return;
      }
      const url = slipShareUrl(window.location.origin, token);
      navigator.clipboard?.writeText(url).catch(() => {});
      toast({ title: "Link copied!", description: "Anyone with this link can view your plan." });
      if (navigator.share) {
        navigator
          .share({ title: `${trip.title || trip.destination || "Trip"} - Traveloure`, url })
          .catch(() => {});
      }
    },
    onError: () => {
      toast({ variant: "destructive", title: "Couldn't create a share link" });
    },
  });

  if (!isOwner || occasionHidden) return null;

  return (
    <RailCard card="share" title="Share">
      <RailRow
        label="Share link"
        meta="token"
        icon={<Share2 className="w-3.5 h-3.5" />}
        onClick={() => share.mutate()}
        busy={share.isPending}
        testId="slip-action-share"
      />
      {/* The printable copy — the SAME canonical `itinerary_items` this slip renders, so paper
          and screen can never disagree. A plain anchor: the endpoint is session-authenticated
          and answers with a Content-Disposition attachment. */}
      <RailRow
        label="Download PDF"
        icon={<FileDown className="w-3.5 h-3.5" />}
        href={slipPdfPath(tripId)}
        external
        testId="slip-action-pdf"
      />
      {/* ADD TO CALENDAR (S11) — the trip-keyed `.ics`. `generateIcsContent` had exactly one
          route before this lane, keyed on a COMPARISON id, so a plan that was never optimized had
          no calendar at all. Same generator, second caller; the plan's `trips.timezone` pins the
          instants and its absence keeps the honest floating output (Locked Decision 30). */}
      <RailRow
        label="Add to calendar"
        meta=".ics"
        icon={<CalendarPlus className="w-3.5 h-3.5" />}
        href={slipCalendarPath(tripId)}
        external
        testId="slip-action-calendar"
      />
    </RailCard>
  );
}

// ── Finish ────────────────────────────────────────────────────────────────────────────────────

/**
 * MOVED VERBATIM from `SlipView`'s flat action row (ledger `2026-09-05-slip-rail-regroup`). Every
 * branch is the one it had: the unchanged re-final says so WITH its version rather than reporting
 * a generic success (Phase 3 rider 2), and the staged-but-unbooked note WARNS without blocking —
 * finalize has already committed by the time the count is known (R-F).
 */
function useFinalizeMutation(tripId: string) {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/finalize`);
      // finalVersion / finalCreated are the Phase 2 additions (ledger
      // 2026-08-31-trip-card-snapshot-render): which version this finalize resolved to, and whether
      // it wrote a NEW one. Optional so an older server response still typechecks.
      return (await res.json()) as {
        alreadyFinalized: boolean;
        finalizedAt: string | null;
        stagedCount?: number;
        finalVersion?: number | null;
        finalCreated?: boolean;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      if (data.finalCreated === false) {
        toast({
          title: "Plan unchanged",
          description: `No changes since v${data.finalVersion ?? "?"} — nothing new to finalize.`,
        });
        return;
      }
      const v = data.finalVersion != null ? ` (v${data.finalVersion})` : "";
      if (data.stagedCount && data.stagedCount > 0) {
        toast({
          title: `Trip Card is ready${v}`,
          description: `${data.stagedCount} staged item${data.stagedCount > 1 ? "s" : ""} ${
            data.stagedCount > 1 ? "aren't" : "isn't"
          } booked yet. Your plan is finalized; you can book them later.`,
        });
      } else {
        toast({ title: `Trip Card is ready${v}`, description: "Your plan is finalized." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Couldn't finalize plan", description: err?.message || "Please try again", variant: "destructive" });
    },
  });
}

function useReopenMutation(tripId: string) {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/reopen`);
      return (await res.json()) as { alreadyOpen: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't reopen plan",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });
}

/**
 * THE FINISH CARD — two states and no more.
 *
 * PRE-FINAL: "Finalize plan", which snapshots the Trip Card and opens the EXISTING chooser
 * (`FinalizeBookingModal`) on top of the snapshot. That modal is NOT re-cut here (row 2.4 owns
 * it), and Finalize is what absorbed the removed "Add all to checkout": the chooser's own
 * "I book them myself" branch runs the same bulk route over the same rows. "Go to checkout (N)"
 * appears beside it only when rows are actually staged — §13, a checkout with nothing in it is
 * not offered.
 *
 * FINISHED: the plan is snapshotted, and this is the ONLY home of "View as Trip card" — before a
 * snapshot exists that link bounces back to the slip, which is why the pre-final `Preview Trip
 * Card` button is gone. "Reopen plan" keeps its existing 48-hour suppression verbatim: inside the
 * window (or underway) the Trip Card is primary regardless, so offering a reversal that would
 * change nothing would be dishonest (R-F).
 *
 * The finished state is keyed on the SAME `tripCardIsPrimary` rule the banner above the header
 * reads, passed in as `isPrimary` — one rule, read once by the caller (§18 rule 1).
 */
function FinishCard({
  trip,
  isOwner,
  isPrimary,
  activities,
}: {
  trip: SlipTrip;
  isOwner: boolean;
  /** `tripCardIsPrimary(...)` — resolved ONCE by the caller and never recomputed here. */
  isPrimary: boolean;
  activities: PlanCardActivity[];
}) {
  const finalizeMutation = useFinalizeMutation(trip.id);
  const reopenMutation = useReopenMutation(trip.id);
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const checkoutReady = countCheckoutReadyItems(activities);

  const forcedByDateAlone = tripCardForcedPrimaryByDateAlone({
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  // Reopen is owner-gated server-side (verifyTripOwnership) and only offered when it would
  // actually change something — never when the date arm alone already forces Trip Card primacy.
  const showReopen = isOwner && !!trip.finalizedAt && !forcedByDateAlone;

  // A non-owner viewer has no finish controls at all: finalize, reopen and the chooser are all
  // owner-gated server-side, so the card would be a list of 403s.
  if (!isOwner) return null;

  if (isPrimary) {
    return (
      <RailCard card="finish" title="Finished">
        <RailNote>
          {trip.finalizedAt
            ? "This plan is locked as a Trip Card. Editing changes the working plan; make it final again to update the card."
            : "Your trip is close — the Trip Card is the surface to travel with."}
        </RailNote>
        <RailRow
          label="View as Trip card"
          meta="read-only"
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          href={`/trip/${trip.id}`}
          testId="slip-action-view-trip-card"
        />
        {showReopen && (
          <RailRow
            label="Back to planning"
            icon={<Undo2 className="w-3.5 h-3.5" />}
            onClick={() => reopenMutation.mutate()}
            busy={reopenMutation.isPending}
            testId="slip-action-reopen"
          />
        )}
      </RailCard>
    );
  }

  return (
    <RailCard card="finish" title="Finish">
      <RailNote>
        Snapshot the plan as your Trip Card, then choose how these get booked.
      </RailNote>
      <RailRow
        label="Finalize Plan"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        primary
        onClick={() =>
          finalizeMutation.mutate(undefined, {
            // Open the chooser only when a NEW version was actually captured.
            onSuccess: (data) => {
              if (data.finalCreated !== false && !data.alreadyFinalized) setFinalizeModalOpen(true);
            },
          })
        }
        busy={finalizeMutation.isPending}
        testId="slip-action-finalize-plan"
      />
      {checkoutReady > 0 && (
        <RailRow
          label={`Go to checkout (${checkoutReady})`}
          icon={<ShoppingCart className="w-3.5 h-3.5" />}
          href="/cart"
          testId="slip-action-go-to-checkout"
        />
      )}
      <FinalizeBookingModal
        open={finalizeModalOpen}
        onOpenChange={setFinalizeModalOpen}
        trip={{ id: trip.id, destination: trip.destination, travelers: trip.travelers }}
        activities={activities}
      />
    </RailCard>
  );
}

// ── the rail ──────────────────────────────────────────────────────────────────────────────────

export function SlipRail({
  trip,
  tripId,
  isOwner,
  isPrimary,
  activities,
  planEvents,
  budgetLine,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  isPrimary: boolean;
  activities: PlanCardActivity[];
  planEvents: readonly PlanEvent[];
  budgetLine: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 items-start" data-testid="slip-rail">
      <BuildCard trip={trip} tripId={tripId} isOwner={isOwner} activities={activities} />
      <FinishCard trip={trip} isOwner={isOwner} isPrimary={isPrimary} activities={activities} />
      <PlanCard tripId={tripId} isOwner={isOwner} planEvents={planEvents} budgetLine={budgetLine} />
      <ShareCard trip={trip} tripId={tripId} isOwner={isOwner} />
    </div>
  );
}
