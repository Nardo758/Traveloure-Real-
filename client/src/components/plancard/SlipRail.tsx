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
 *  · `slip-expert-no-handle` — GONE with D22 (ledger `2026-09-05-slip-decisions-d18-d22`). The
 *    rail said out loud that a handle-less advisor had no address, which was true under Locked
 *    Decision 40's three kinds and is no longer: the `advisor` kind addresses the PLAN, so the
 *    Message row is offered for every advisor on it and the sentence has nothing left to say.
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
import { helpArticlePath } from "@shared/help-article-slugs";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Crown,
  ExternalLink,
  FileDown,
  Loader2,
  MapPin,
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
import { freeFindingsPromptLine, unreachableStopLines, type Finding } from "@shared/optimizer-lead";
import { createPortal } from "react-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as sharedQueryClient } from "@/lib/queryClient";
import { optimizeCheckoutHeading } from "@/lib/checkout-headings";
import StripeCheckout from "@/components/booking/StripeCheckout";
import { createComparison, type ComparisonPinnedAnchor } from "@/lib/create-comparison";
import {
  cancelOptimizationPayment,
  confirmOptimizationPayment,
  requestOptimizationGate,
  type OptimizationPaymentSheet,
} from "@/lib/optimization-gate";
import { runFreeDraft, type FreeDraftResult } from "@/lib/slip-free-draft";
import { OptimizerLead } from "@/components/plan/OptimizerLead";
import { useOptimizerLeadData } from "@/components/plan/use-optimizer-lead-data";
import { FeedbackTap } from "@/components/plan/FeedbackTap";
import { FEEDBACK_CODES } from "@shared/feedback";
import { readSlipHasItemsRefusal } from "@/lib/ai-draft-refusal";
import { countOptimizableItems, slipOptimizeDisabledReason } from "@/lib/slip-plan-actions";
import {
  countCheckoutReadyItems,
  slipAdvisorStandingLine,
  slipOtherAdvisorsLine,
  slipBrowseServicesHref,
  slipBuildAiAction,
  slipDraftItemCount,
  type SlipBuildAiAction,
  slipCalendarPath,
  slipDraftDisabledReason,
  slipExpertRailState,
  slipPdfPath,
  slipShareUrl,
  type SlipExpertRailState,
  type SlipRailAdvisor,
} from "@/lib/slip-rail";
// S6/S7 — the Plan card's "Stops & timezone" row composes the header's OWN two lines; it derives
// neither (§18 rule 1). Both arrive as props from `SlipView`, which resolves them once.
import { slipPlanMetaLine } from "@/lib/slip-meta";
import { travelerFeePreviewDisplay, type TravelerFeePreviewBlock } from "@/lib/traveler-fee-preview";
// The row is a DOOR of the ONE planning modal (Locked Decision 33's opener), whose step 2 IS the
// ordered stop-list editor (Locked Decision 34's one client writer) — never a second stop editor.
import { usePlanning } from "@/contexts/PlanningContext";
// Locked Decision 40: an earner's PUBLIC page is their handle's. `earnerProfilePath` is the ONE
// builder of it, and with no `id` on this row its documented id fallback cannot fire — a
// handle-less advisor resolves to `null`, which is exactly §13's answer here (no link at all).
import { earnerProfilePath } from "@/lib/earner-address";
// L16 lanes 2/3 (ledger `2026-09-16-l16-lanes2-3-drawer`) — the Ask-AI rail is a card of its OWN,
// deliberately NOT a third branch of `slipBuildAiAction`, whose two-way answer (draft on an empty
// plan, optimize otherwise — LD 41 (b)) is unchanged and is READ by the drawer, never restated.
import { AskAiDrawer } from "./AskAiDrawer";
// Ledger `2026-09-07-my-events-fold` — the ONE spelling of an engagement's title / status / fee
// words, shared with `/my-events` (§18 rule 1). No amount and no charge decision rides with it.
import {
  engagementFee,
  engagementStatusLabel,
  engagementTitle,
  engagementsForPlan,
  type CoordinationEngagementRow,
} from "@/lib/coordination-engagement";
import { useAskExpert } from "@/lib/use-ask-expert";
import { useOccasionSwitches } from "@/hooks/use-occasion-switches";
import type { PlanCardActivity } from "./plancard-types";
import type { PlanEvent } from "@/lib/slip-events";
import type { SlipTrip } from "./SlipView";
import { DatesGate, type PlanWindow } from "@/components/plan/SlipAnchorPanels";
import { BuildAroundDialog } from "./BuildAroundDialog";
import { FinalizeBookingModal } from "./FinalizeBookingModal";
import { useReopenMutation } from "./use-reopen-mutation";
import { openHandoffChooser } from "@/lib/handoff-client";
import { SlipOrganizeEventsRow } from "./SlipLogisticsSection";
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
  // LAYOUT (ledger `2026-09-06-role-chips-filter`). Both halves used to be `truncate` inside a
  // 320px rail, so the row's own NAME was the thing that gave way: at a ~1110px viewport "Stops &
  // timezone" rendered as "Stops & ti…" while its meta — a composed line that can run to
  // "Kyoto → Osaka · Times shown in Asia/Tokyo" — kept its width. A control whose label is
  // ellipsised is a control the traveler cannot read, and the meta is the half that can afford to
  // yield: it RESTATES facts the header already prints in full (§18 rule 1 — `slipPlanMetaLine`
  // composes the header's own two lines), while the label appears nowhere else.
  //
  // So the label WRAPS (`whitespace-normal`, no truncation — the Button is already `h-auto`, and
  // `whitespace-nowrap` from the Button base is overridden on the row).
  //
  // THE META THEN WRAPPED TOO — LATE, AND ONLY BY ELLIPSIS (ledger `2026-09-06-publish-preflight`).
  // Shrinking the meta fixed the LABEL and left the meta unreadable: at 1920px the Plan card's
  // "Stops & timezone" meta measured scrollWidth 207 against clientWidth 161, so
  // "Kyoto, Japan · Times shown in Asia/Tokyo" rendered as "Kyoto, Japan · Times sho…". A 320px
  // rail simply has no line wide enough for both halves, and `truncate` answers that by DELETING
  // the plan's destination and zone from the row — which is the §13 shape of the problem: the row
  // still looks complete.
  //
  // So the ROW wraps instead of either half being cut: `flex-wrap` on the button, and the meta
  // keeps `min-w-0` but drops `shrink`/`truncate` for `whitespace-normal break-words text-right`.
  // A meta that fits beside its label still sits on the same line, right-aligned by `ml-auto` (so
  // every other rail row is visually unchanged); one that does not fit drops to its own full-width
  // second line, where it has the whole 320px rather than the ~161px left over beside the label,
  // and wraps rather than truncating if even that is not enough. Nothing about the row's labels,
  // testids or handlers changes.
  const inner = (
    <>
      <span className="flex items-center gap-2 min-w-0 text-left">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> : icon}
        <span className="whitespace-normal break-words">{label}</span>
      </span>
      {meta ? (
        <span className="ml-auto pl-2 min-w-0 font-mono text-[10px] font-normal text-muted-foreground whitespace-normal break-words text-right">
          {meta}
        </span>
      ) : null}
    </>
  );
  const className =
    "w-full justify-start h-auto py-2 px-2.5 text-[13px] font-semibold whitespace-normal flex-wrap";

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
/**
 * THE ONE AI ACTION (Locked Decision 41 (b)), as a hook (step 8b-1, ledger
 * `2026-10-06-step8b1-slip-extraction`) so the map layout reads the same answer the rail does
 * (§18 rule 1). Moved verbatim from `SlipRail`; `SlipRail` is its first caller.
 */
export function useSlipAiAction(tripId: string, activities: PlanCardActivity[]): SlipBuildAiAction {
  // Smoke 9 S9-1: the ONE AI action reads the SERVER's draft-gate count (non-anchor items — a plan
  // holding only its stay is still empty to draft), from the plancard the slip already loaded.
  const { data: planGate } = useQuery<{ draftItemCount?: number }>({
    queryKey: [`/api/trips/${tripId}/plancard`],
    enabled: false,
  });
  const aiAction = slipBuildAiAction(slipDraftItemCount(planGate?.draftItemCount, activities.length));
  return aiAction;
}

/**
 * The "Draft it with AI" row and its mutation, lifted VERBATIM out of `BuildCard` (step 8b-1) so the
 * map layout can render the same row. `BuildCard` still decides WHEN it shows (owner, empty plan).
 */
export function SlipDraftAiRow({ trip, tripId }: { trip: SlipTrip; tripId: string }) {
  const { toast } = useToast();
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
  const draft = useMutation<FreeDraftResult, Error, PlanWindow>({
    // ONE call, shared with the expert door (`@/lib/slip-free-draft`, §18 rule 1). Smoke 4 item 5:
    // it always drafts — where to stay is recommended after the draft, never asked before it.
    // Lane E1: the window is the GATE's — the plan's own, or the one just set in the inline panel.
    mutationFn: (dates) => runFreeDraft({ ...(trip as any), startDate: dates.startDate, endDate: dates.endDate }),
    onSuccess: (result) => {
      sharedQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      sharedQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/option-sets`] });
      sharedQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/where-to-stay`] });
      toast({
        title: "Draft added to your plan",
        description:
          result.basisLine ?? "A starting sketch — one version, without live prices. Optimize builds around it.",
      });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't draft this plan", description: err?.message });
    },
  });

  return (
        <>
          {/* Lane E1 (ledger `2026-10-08-e1-zero-questions`, ruling 7): no confirmed dates ⇒ the dates
              panel opens right here, and the draft continues once they are saved. */}
          <DatesGate trip={trip} action="Draft it with AI" testId="slip-draft-dates-gate">
            {(guard) => (
              <RailRow
                label="Draft it with AI"
                meta="empty plan"
                icon={<Sparkles className="w-3.5 h-3.5" />}
                onClick={() => guard((dates) => draft.mutate(dates))}
                busy={draft.isPending}
                disabled={!!draftDisabledReason}
                title={draftDisabledReason ?? undefined}
                testId="slip-action-draft-ai"
              />
            )}
          </DatesGate>
          <RailNote testId="slip-draft-note">
            Offered only on an empty plan — one row of any status and this becomes Optimize.
          </RailNote>
        </>
  );
}

function BuildCard({
  trip,
  tripId,
  isOwner,
  canEditItems,
  activities,
  expertState,
  aiAction,
  optimizerSlot,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  /** LD 52 (C): the owner, or the delegate who builds the plan for them (browse + add only). */
  canEditItems: boolean;
  activities: PlanCardActivity[];
  /** The ONE AI action (LD 41 (b)), resolved once by `SlipRail` from the server's draft count. */
  aiAction: SlipBuildAiAction;
  /** Smoke 9 S9-4: the slip's slot under the tools tray, where the optimizer card renders. */
  optimizerSlot?: HTMLElement | null;
  /**
   * The expert row's state, resolved ONCE by `SlipRail` from the ONE owner-gated advisor read
   * (ledger `2026-09-06-slip-conformance`). It used to be fetched here; the Expert card above now
   * reads the same row, and two `useQuery` calls for one fact — even sharing a cache entry — is
   * two places the same answer is derived (§18 rule 1).
   */
  expertState: SlipExpertRailState;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const askExpert = useAskExpert();

  // ── The ONE AI action (Locked Decision 41 (b)) — resolved by `SlipRail` and passed in. ──────

  // Optimize — the SAME shared gate sequence `cart.tsx` runs (`lib/optimization-gate.ts`), fed
  // from this trip's own DTO fields. Moved here verbatim from the flat action row; not re-cut.
  const [optimizing, setOptimizing] = useState(false);
  const [creatingComparison, setCreatingComparison] = useState(false);
  const [paySheet, setPaySheet] = useState<OptimizationPaymentSheet | null>(null);
  const [buildAroundOpen, setBuildAroundOpen] = useState(false);
  // Smoke 10 S10-2: the versions board's Optimize card lands here with `?optimize=1` — the SAME
  // flow the rail's own Optimize opens (what the run is built around, then the fee), never a second.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("optimize") !== "1") return;
      params.delete("optimize");
      const rest = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
      setBuildAroundOpen(true);
    } catch {
      /* no URL to read */
    }
  }, []);
  const [lastOptimizeCoveredByPass, setLastOptimizeCoveredByPass] = useState(false);
  const confirmedPinnedAnchor = useRef<ComparisonPinnedAnchor | undefined>(undefined);
  // Lane E1: the window the Optimize gate handed over — the plan's own, or the one just set inline
  // (the plancard refetch may not have landed when the run starts).
  const gatedWindow = useRef<PlanWindow | null>(null);

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
  // R321 S11-8: the ONE data source both OptimizerLead mounts read (the versions board too).
  const leadData = useOptimizerLeadData(trip.id, previewEnabled);

  async function runComparison(
    optimizationPaymentId?: string,
    pinnedAnchor?: ComparisonPinnedAnchor,
  ) {
    setCreatingComparison(true);
    try {
      const comparison = await createComparison({
        title: trip.title || undefined,
        destination: trip.destination!,
        startDate: gatedWindow.current?.startDate ?? String(trip.startDate).slice(0, 10),
        endDate: gatedWindow.current?.endDate ?? String(trip.endDate).slice(0, 10),
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
      if (outcome.kind === "paid") {
        // The plan's open intent was already paid and never run on — run on it (no second charge).
        await handleSheetSuccess(outcome.paymentIntentId);
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

  // Ledger `2026-10-08-optimize-pay-flow`: Cancel (or closing the sheet) cancels the open intent, so a
  // later press starts clean rather than leaving an uncaptured PaymentIntent behind.
  function cancelPaySheet() {
    const open = paySheet;
    setPaySheet(null);
    confirmedPinnedAnchor.current = undefined;
    if (open?.paymentIntentId) void cancelOptimizationPayment(open.paymentIntentId);
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

  // ── The expert (ONE door, ONE message control) ──────────────────────────────────────────────

  const optimizerBlock = (
        <>
          {/* Surface step 4 (spec §8): the ONE optimizer card — findings, the realised delta after a
              run, and the fee on the CTA. Same handler the old row had (the build-around step first). */}
          <span title={optimizeDisabledReason ?? undefined} className="block" data-testid="slip-action-optimize-wrap">
          {/* Lane E1 (ruling 7): no confirmed dates ⇒ the dates panel opens under the card, then the
              build-around step continues with the saved window. */}
          <DatesGate trip={trip} action="Optimize" testId="slip-optimize-dates-gate">
          {(guard) => (
          <OptimizerLead
            drafted={aiAction === "optimize"}
            findings={leadData.findings}
            hasPricedItems={leadData.hasPricedItems}
            fee={leadData.fee}
            realised={leadData.realised as any}
            testId="slip-action-optimize"
            onClick={() => {
              if (optimizing || creatingComparison || optimizeDisabledReason) return;
              guard((dates) => {
                gatedWindow.current = dates;
                setBuildAroundOpen(true);
              });
            }}
            busy={optimizing || creatingComparison}
            disabledReason={optimizeDisabledReason}
            ctaLabelOverride={creatingComparison ? "Building…" : null}
          />
          )}
          </DatesGate>
          </span>
          {/* Feedback phase A (ledger `2026-10-04-feedback-phase-a`): "Does this draft fit?" — under the
              optimizer card, once the plan has a draft; the server says when the moment is open. */}
          <FeedbackTap tripId={tripId} moment="post_draft" codes={FEEDBACK_CODES.post_draft} />
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
  );

  return (
    <RailCard card="build" title="Build">
      {canEditItems && (
        <RailRow
          label="Browse services for this trip"
          meta="/services"
          icon={<Plus className="w-3.5 h-3.5" />}
          href={slipBrowseServicesHref(tripId, trip.destination)}
          testId="slip-browse-services"
        />
      )}

      {/* THE ONE AI ACTION. Owner-only in both branches — the draft rebuilds the owner's plan and
          the optimization fee charges the signed-in traveler. */}
      {isOwner && aiAction === "draft" && <SlipDraftAiRow trip={trip} tripId={tripId} />}

      {/* Smoke 9 S9-4: the optimizer LEADS the page (§8) — rendered directly under the tools tray at
          every width through the slip's slot (a portal: the state stays here, the card moves). On a
          plan with no draft it reads "Draft first" with the CTA disabled. */}
      {isOwner ? (optimizerSlot ? createPortal(optimizerBlock, optimizerSlot) : optimizerBlock) : null}

      {/* THE EXPERT — two states since D22 (see `slipExpertRailState`): nobody on the plan, or
          somebody to message. */}
      {isOwner && expertState.kind === "hire" && (
        // R323 (step 7b, §12 step 1): THE one door — the handoff chooser (Polish my plan · Book
        // these for me · Plan it all), mounted once by the slip's `HandoffChooserHost`. The
        // pick-an-expert dialog that used to open here is retired.
        <RailRow
          label="Hand off to a local expert"
          meta="choose how much help"
          icon={<UserPlus className="w-3.5 h-3.5" />}
          onClick={() => openHandoffChooser({})}
          testId="slip-action-hire-expert"
        />
      )}
      {isOwner && expertState.kind === "message" && (
        <RailRow
          label={`Message ${expertState.name}`}
          meta={
            expertState.isConciergeReadGrant
              ? "reads this plan"
              : expertState.pending
                ? "awaiting reply"
                : "expert"
          }
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          onClick={() =>
            void askExpert({
              // D22 (ledger `2026-09-05-slip-decisions-d18-d22`) — THE ADDRESS IS THE PLAN. The
              // client names `{ tripId }` and the SERVER resolves the counterpart from the trip
              // plus its `trip_expert_advisors` row in a §12 access status. No user id and no
              // handle is sent, and none comes back: Locked Decision 40's rule is unweakened, and
              // this is the amendment that finally makes a handle-less advisor reachable — the
              // rail used to print a sentence here instead of a control.
              tripId,
              subject: trip.title || trip.destination || null,
              fallbackName: expertState.name,
              returnTo: `/plans/${tripId}`,
            })
          }
          testId="slip-action-message-expert"
        />
      )}

      {/* TRIP PASS — the entitlement that covers AI runs on this trip. The EXISTING card, moved
          into the card whose actions it covers; one component, never a second purchase rail.
          Purchase is the owner's (LD 52 — a helper never pays), so a delegate does not mount it. */}
      {isOwner ? (
        <div data-testid="slip-rail-trip-pass">
          <TripPassCard tripId={tripId} trip={trip} planName={trip.title || trip.destination} />
        </div>
      ) : null}

      <BuildAroundDialog
        open={buildAroundOpen}
        tripId={trip.id}
        planName={trip.title || trip.destination}
        fee={leadData.fee}
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
          if (!open) cancelPaySheet();
        }}
      >
        <DialogContent>
          <DialogHeader>
            {/* The sheet's own heading names the purchase; this title is for assistive tech only. */}
            <DialogTitle className="sr-only">{optimizeCheckoutHeading(trip.title || trip.destination)}</DialogTitle>
          </DialogHeader>
          {paySheet && (
            <StripeCheckout
              heading={optimizeCheckoutHeading(trip.title || trip.destination)}
              paymentIntent={{
                clientSecret: paySheet.clientSecret,
                paymentIntentId: paySheet.paymentIntentId,
                amount: paySheet.feeCents,
              }}
              bookingIds={[]}
              onSuccess={handleSheetSuccess}
              onError={(err) => toast({ variant: "destructive", title: "Payment failed", description: err })}
              onCancel={cancelPaySheet}
            />
          )}
        </DialogContent>
      </Dialog>
    </RailCard>
  );
}

// ── Expert ────────────────────────────────────────────────────────────────────────────────────

/**
 * THE EXPERT CARD — who is on this plan, above everything they might be asked to do.
 *
 * Ledger `2026-09-06-slip-conformance`; the ratified `SlipExpert` artboard's own rail card. The
 * rail previously named the advisor only inside the Build card's "Message <name>" row, so the
 * person helping with the plan appeared as a verb rather than as somebody who is here.
 *
 * IT READS THE SAME ROW THE BUILD CARD DOES — one owner-gated advisor read, resolved by `SlipRail`
 * and handed to both (§18 rule 1). No second query, and no second opinion about who the advisor is.
 *
 * WHAT IT DRAWS, and every one of them is a real value or nothing at all (§13):
 *  · the PHOTO when `users.profile_image_url` is set, and otherwise the person's INITIALS. Never a
 *    stock portrait, which is a picture of somebody who does not exist.
 *  · the NAME the row carries, or the stated generic fallback the rail already uses.
 *  · the STANDING — pending or advising — through `slipAdvisorStandingLine`, the SAME sentence the
 *    event header states, spelled once. No ETA: nothing knows when an expert will answer.
 *  · "View storefront" ONLY when the expert has claimed a handle. Locked Decision 40 makes the
 *    handle the public address, and `earnerProfilePath` returns `null` without one — so the row is
 *    ABSENT rather than a dead button or a placeholder link to a page that does not exist. It is
 *    never addressed by `users.id`, which this payload deliberately does not carry.
 *
 * NO MESSAGE CONTROL HERE. That lives once, in Build (D22's plan-addressed `advisor` kind), and the
 * card says so out loud so the absence reads as a decision rather than a gap.
 *
 * NO ADVISOR ⇒ NO CARD. "Nobody is advising this plan" is not a status worth a card; the Build
 * card's "Hand off to a local expert" is the answer to that state, and it is the only one.
 */
function ExpertCard({
  advisor,
  expertState,
  otherAdvisorsLine,
}: {
  /**
   * The raw advisor row, for the two DISPLAY facts the rail state deliberately does not carry —
   * the photo and the standing sentence. `slipExpertRailState` answers "which control does the
   * Build card offer"; widening it with presentation fields would make one type answer two
   * questions and would change what every existing caller receives.
   */
  advisor: SlipRailAdvisor | null;
  expertState: SlipExpertRailState;
  /**
   * D7: the other advisors on this plan, already reduced to ONE sentence by
   * `slipOtherAdvisorsLine`. Null when there are none — the card then reads exactly as before.
   */
  otherAdvisorsLine: string | null;
}) {
  if (expertState.kind !== "message") return null;
  const storefront = earnerProfilePath({ handle: expertState.handle });
  const initials = expertState.name.slice(0, 2).toUpperCase();
  const standing = slipAdvisorStandingLine(advisor);
  const avatarUrl =
    typeof advisor?.profile_image_url === "string" && advisor.profile_image_url.trim().length > 0
      ? advisor.profile_image_url
      : null;
  return (
    <Card data-testid="slip-rail-expert">
      <CardContent className="p-3 space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Expert
        </p>
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="h-9 w-9 flex-shrink-0">
            <AvatarImage src={avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground" data-testid="slip-rail-expert-name">
              {expertState.name}
            </p>
            {/* §13 — a row with no standing to state draws no line, never "status unknown". */}
            {standing && (
              <p
                className="font-mono text-[10px] leading-snug text-muted-foreground"
                data-testid="slip-rail-expert-standing"
              >
                {standing}
              </p>
            )}
          </div>
        </div>
        {storefront && (
          <RailRow
            label="View storefront"
            meta="public page"
            icon={<ExternalLink className="w-3.5 h-3.5" />}
            href={storefront}
            testId="slip-rail-expert-storefront"
          />
        )}
        {/* D7 — every advisor on the plan is named. §13: nothing renders when there is only one. */}
        {otherAdvisorsLine && (
          <p
            className="font-mono text-[10px] leading-snug text-muted-foreground"
            data-testid="slip-rail-expert-others"
          >
            {otherAdvisorsLine}
          </p>
        )}
        <RailNote testId="slip-rail-expert-message-note">
          Message them from the Build card — it is the one place that conversation opens.
        </RailNote>
      </CardContent>
    </Card>
  );
}

// ── Coordination ──────────────────────────────────────────────────────────────────────────────

/**
 * THE COORDINATION CARD — the done-for-you engagement THIS plan is under.
 *
 * Ledger `2026-09-07-my-events-fold` (CLAUDE.md Locked Decision 45 (5); brief §10 row L8). "My
 * events" was a peer console destination listing `coordination_states` rows; ruling 5 folds it
 * into My plans, and a plan is where its own engagement belongs.
 *
 * THE FEE-PAY RAIL IS UNTOUCHED, AND DELIBERATELY DOES NOT MOUNT HERE. Quoting and charging the
 * coordination fee is a money path (§14/§15) with one home — `/my-events`, whose Elements sheet,
 * one-click saved-card branch and `/pay/confirm` this lane did not open. A second mount of a
 * charge is a second place its claim and its idempotency have to be remembered, so the card
 * NAMES the fee's state and LINKS to that rail rather than re-hosting it.
 *
 * §13, both directions:
 *   · No engagement on this plan ⇒ NO CARD. "Nobody is coordinating this plan" is not a status
 *     worth a card, and the empty state for that is the concierge page, not a rail slot.
 *   · `coordination_states.trip_id` is NULLABLE, so an engagement with no plan appears on NO
 *     slip. It is not attached to the nearest-looking plan; it keeps rendering where it renders
 *     today, on `/my-events`, which is why that route stays live.
 *
 * OWNER ONLY. `GET /api/coordination-states` is scoped to the SESSION user server-side (§14), so
 * an advisor viewing this slip would read their OWN engagements and see none of the traveler's —
 * a card that silently answers a different question. The read is simply not enabled for them.
 */
function CoordinationCard({ tripId, isOwner }: { tripId: string; isOwner: boolean }) {
  const { data } = useQuery<CoordinationEngagementRow[]>({
    queryKey: ["/api/coordination-states"],
    enabled: isOwner && !!tripId,
  });
  const engagements = engagementsForPlan(data, tripId);
  if (engagements.length === 0) return null;
  return (
    <Card data-testid="slip-rail-coordination">
      <CardContent className="p-3 space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Coordination
        </p>
        {engagements.map((engagement) => {
          const status = engagementStatusLabel(engagement.status);
          const fee = engagementFee(engagement.feePaymentStatus);
          return (
            <div key={engagement.id} className="space-y-1.5" data-testid={`slip-rail-coordination-${engagement.id}`}>
              <div className="flex items-start gap-2 min-w-0">
                <Crown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
                <p className="min-w-0 text-sm font-semibold text-foreground">
                  {engagementTitle(engagement)}
                </p>
              </div>
              <p className="font-mono text-[10px] leading-snug text-muted-foreground">
                {/* §13 — a row with no recorded stage prints the fee state alone, never "Intake". */}
                {status ? `${status} · ${fee.label}` : fee.label}
              </p>
              <RailRow
                label={fee.tone === "due" || fee.tone === "pending" ? "Coordination fee" : "Engagement details"}
                meta="my events"
                icon={<ChevronRight className="w-3.5 h-3.5" />}
                href="/my-events"
                testId={`slip-rail-coordination-open-${engagement.id}`}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
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
 * STOPS & TIMEZONE ARE HERE NOW (ledger `2026-09-06-slip-conformance`). This card's own comment
 * used to say they were a later lane and that a placeholder row would be a promise (§13) — the
 * lane landed, so the row states what the plan actually answers to both questions and opens the
 * ONE planning modal, whose step 2 IS the ordered stop-list editor.
 */
function PlanCard({
  tripId,
  isOwner,
  planEvents,
  budgetLine,
  stopsLine,
  zoneLine,
}: {
  tripId: string;
  isOwner: boolean;
  planEvents: readonly PlanEvent[];
  /** The plan's DERIVED budget total, or null when no event states one (never "$0" — §13). */
  budgetLine: string | null;
  /**
   * The header's OWN two lines, resolved once by `SlipView` and handed down (§18 rule 1). This card
   * composes them into one row meta through `slipPlanMetaLine` and derives NEITHER: a second
   * `slipStopsLine(...)` here is how the row and the header would start disagreeing about the same
   * columns. `null` on both ⇒ the row still draws (it is the door to the editor) with no meta —
   * never an invented "not set", which is a claim about the plan.
   */
  stopsLine: string | null;
  zoneLine: string | null;
}) {
  // Locked Decision 33's opener. No source: the modal reads the plan the traveler is already on,
  // exactly as the header's own `Edit ›` calls it.
  const { open: openPlanModal } = usePlanning();

  // A non-owner viewer gets neither the logistics collapsibles (owner-only by ruling) nor the
  // contract board (its read tier is broader, but the card would then hold one row); with the
  // budget line absent too there is nothing to draw, and an empty card is not drawn.
  if (!isOwner && !budgetLine) return null;

  return (
    <RailCard card="plan" title="Plan">
      {/* ── STOPS & TIMEZONE (S6/S7) — the row the ratified Plan card draws, and the SECOND door
          to the ONE stop editor rather than a second editor. Locked Decision 34 gives the client
          exactly one stop writer (`plan-stops-writer.ts`) with exactly one editing surface (the
          modal's step 2); a list editor mounted here would be a second caller of that
          replace-list writer with its own read-before-replace, which is how stops nobody saw get
          silently dropped. Owner-only, like the header's own Edit affordance (D16). */}
      {isOwner && (
        <RailRow
          label="Stops & timezone"
          meta={slipPlanMetaLine(stopsLine, zoneLine)}
          icon={<MapPin className="w-3.5 h-3.5" />}
          onClick={() => openPlanModal()}
          testId="slip-plan-stops"
        />
      )}

      {/* SURFACE STEP 2 (ledger `2026-10-03-surface-step2-tools-tray`): the logistics pieces this card
          used to mount (main moment & schedule check, traveling party, guests & invites) and the
          vendor contract board are now TOOLS on the slip's tools tray, as the group manifest names
          them. What stays here is what the plan knows about itself: its stops, the organize-into-
          events offer and the derived budget. */}
      {isOwner && <SlipOrganizeEventsRow tripId={tripId} planEvents={planEvents} />}

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

// `useReopenMutation` moved to `./use-reopen-mutation` (ledger `2026-09-07-trip-card-one-page`)
// so the Trip Card rail's "Back to planning" is the same call — one implementation, two callers.

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
 * Card` button is gone. "Back to planning" is offered to the owner of any finalized plan, underway
 * included (R321 S11-1), and "Make it final again" appears whenever a final exists and the working
 * plan is not it.
 *
 * The finished state is keyed on the SAME `tripCardIsPrimary` rule the banner above the header
 * reads, passed in as `isPrimary` — one rule, read once by the caller (§18 rule 1).
 */
export function FinishCard({
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
  // Step 6 R-ay: a plan with no run sees its free findings once more before it is made final —
  // the SAME findings the Optimize card reads (shared query key), and the ONE line rule.
  const { data: finishPlan } = useQuery<{
    lastOptimizedAt?: string | null;
    trip?: { finalVersion?: number | null; finalOutOfDate?: boolean | null };
  }>({ queryKey: [`/api/trips/${trip.id}/plancard`], enabled: false });
  const unoptimized = !finishPlan?.lastOptimizedAt;
  const { data: finishPreview } = useQuery<{ findings?: Finding[] }>({
    queryKey: ["/api/optimization-preview", { tripId: trip.id }],
    enabled: isOwner && !isPrimary && unoptimized,
    retry: false,
  });
  const freeLine = unoptimized ? freeFindingsPromptLine(finishPreview?.findings) : null;
  // S12-4: the stops behind the reachability count, one per line with its day.
  const unreachableLines = freeLine ? unreachableStopLines(finishPreview?.findings) : [];
  const checkoutReady = countCheckoutReadyItems(activities);
  // R144 (ledger `2026-09-27-service-fee-before-checkout`): the traveler service fee for THIS plan's
  // staged lines, shown where the slip's checkout path starts. The amount is the server's
  // (`GET /api/cart` → `travelerFeePreview.byTrip[tripId]`, the charge's own resolver); the ONE
  // wording rule decides whether a line is drawn. Owner only — the cart is the session user's own.
  // This line moves into the slip's bookings section when that section lands (map step 4).
  // `staleTime: 0`: staging a row re-projects the cart server-side without touching this cache.
  const cartForFee = useQuery<{ travelerFeePreview?: TravelerFeePreviewBlock }>({
    queryKey: ["/api/cart"],
    enabled: isOwner && !isPrimary && checkoutReady > 0,
    staleTime: 0,
  });
  const slipFeeDisplay = travelerFeePreviewDisplay(cartForFee.data?.travelerFeePreview?.byTrip?.[trip.id]);

  // R321 S11-1 (decision-maker, smoke 11): Reopen is ALWAYS offered to the owner of a finalized
  // plan, underway included — a traveler mid-trip may need to change the plan. It is owner-gated
  // server-side (verifyTripOwnership). The 48-hour suppression it carried is retired: inside the
  // window the Trip Card stays primary, and the card keeps its last version until the plan is
  // made final again, so reopening there is a real (and reversible) step, not a false one.
  const showReopen = isOwner && !!trip.finalizedAt;
  // "Make it final again": a final exists and the working plan is not it — either it was edited
  // after the final (the server's own fingerprint comparison, `finalOutOfDate`) or it was
  // reopened. Re-finalizing appends the next `trip_finals` version; nothing else changes the card.
  const hasFinal = finishPlan?.trip?.finalVersion != null;
  const offerRefinal = hasFinal && (finishPlan?.trip?.finalOutOfDate === true || !trip.finalizedAt);
  const refinalize = () =>
    finalizeMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.finalCreated !== false && !data.alreadyFinalized) setFinalizeModalOpen(true);
      },
    });

  // A non-owner viewer has no finish controls at all: finalize, reopen and the chooser are all
  // owner-gated server-side, so the card would be a list of 403s.
  if (!isOwner) return null;

  // THE CHOOSER IS MOUNTED OUTSIDE BOTH STATES, AND THAT PLACEMENT IS LOAD-BEARING.
  //
  // Finalize's designed effect is "snapshot the Trip Card AND open the chooser on top of the
  // snapshot" — the two happen on ONE press. But the press is exactly what flips this card's
  // state: `finalizeMutation` invalidates the plancard query, `trip.finalizedAt` arrives set,
  // `tripCardIsPrimary` turns true, and the pre-final branch is replaced by the Finished one.
  // While the modal lived INSIDE the pre-final branch (the shape the rail regroup carried over
  // from `SlipView`, where it had always sat OUTSIDE the `!trip.finalizedAt` conditional), the
  // `setFinalizeModalOpen(true)` in that same `onSuccess` set state on a subtree React was about
  // to unmount: the snapshot was written, the toast fired, every server-side effect landed — and
  // the chooser never rendered. Nothing threw, and the only signal was a traveler who pressed
  // Finalize and was never asked how to book. It is mounted here, above the branch, so the state
  // it is opened from and the state it opens into both keep it alive.
  const chooser = (
    <FinalizeBookingModal
      open={finalizeModalOpen}
      onOpenChange={setFinalizeModalOpen}
      trip={{ id: trip.id, destination: trip.destination, travelers: trip.travelers }}
      activities={activities}
    />
  );

  if (isPrimary) {
    return (
      <RailCard card="finish" title="Finished">
        <RailNote>
          {trip.finalizedAt
            ? "This plan is locked as a Trip Card. Editing changes the working plan; make it final again to update the card."
            : hasFinal
              ? "Your Trip Card keeps its last version until you make the plan final again."
              : "Your trip is close — the Trip Card is the surface to travel with."}
        </RailNote>
        {offerRefinal && (
          <RailRow
            label="Make it final again"
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            primary
            onClick={refinalize}
            busy={finalizeMutation.isPending}
            testId="slip-action-refinalize"
          />
        )}
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
        {chooser}
      </RailCard>
    );
  }

  return (
    <RailCard card="finish" title="Finish">
      <RailNote>
        Snapshot the plan as your Trip Card, then choose how these get booked.
      </RailNote>
      {/* R-ay: the free plan's findings, said once more where it is made final — never a block. */}
      {freeLine ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs dark:bg-amber-950/20" data-testid="slip-finalize-free-prompt">
          <Link href={`/plans/${trip.id}?optimize=1`} className="underline underline-offset-2">
            {freeLine}
          </Link>
          {unreachableLines.length > 0 ? (
            <span className="mt-1 block" data-testid="slip-finalize-unreachable-stops">
              {unreachableLines.map((l) => (
                <span key={l} className="block">{l}</span>
              ))}
            </span>
          ) : null}
        </p>
      ) : null}
      <RailRow
        label={hasFinal ? "Make it final again" : "Finalize Plan"}
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        primary
        // Open the chooser only when a NEW version was actually captured (inside `refinalize`).
        onClick={refinalize}
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
      {checkoutReady > 0 && slipFeeDisplay && (
        <RailNote testId="slip-traveler-fee-preview">
          {slipFeeDisplay.label}:{" "}
          {slipFeeDisplay.kind === "charged" ? (
            <span className="font-medium text-foreground">${slipFeeDisplay.amount.toFixed(2)}</span>
          ) : (
            <span className="line-through">${slipFeeDisplay.wouldHaveBeen.toFixed(2)}</span>
          )}{" "}
          {slipFeeDisplay.note}{" "}
          <Link href={helpArticlePath("trip-pass-and-fees")} className="underline underline-offset-2" data-testid="link-slip-fee-help">
            About this fee
          </Link>
        </RailNote>
      )}
      {chooser}
    </RailCard>
  );
}

// ── the rail ──────────────────────────────────────────────────────────────────────────────────

export function SlipRail({
  trip,
  tripId,
  isOwner,
  canEditItems = isOwner,
  isExpertViewer,
  isPrimary,
  activities,
  planEvents,
  budgetLine,
  stopsLine,
  zoneLine,
  optimizerSlot = null,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  /** LD 52 (C): item-building for the owner or the delegate (`canEditPlanItems`); defaults to owner. */
  canEditItems?: boolean;
  /**
   * `plancard.tripRole === "expert"` — resolved ONCE by `SlipView` and passed down (§18 rule 1).
   * An advisor of ANY §12 access status, `pending` INCLUDED: `getTripRole`'s advisor branch is
   * `isTripAdvisor`, which grants `pending` correctly for READING. It is therefore never on its own
   * a write permission, and the one surface that needs the distinction — the Ask-AI card — gets it
   * from the SERVER's own gate rather than restating §12's status list here.
   */
  isExpertViewer: boolean;
  isPrimary: boolean;
  activities: PlanCardActivity[];
  planEvents: readonly PlanEvent[];
  budgetLine: string | null;
  /** The header's own stops/zone lines, resolved once by `SlipView` (§18 rule 1). */
  stopsLine: string | null;
  zoneLine: string | null;
  /** Smoke 9 S9-4: the slot under the tools tray where the optimizer card renders (§8). */
  optimizerSlot?: HTMLElement | null;
}) {
  /**
   * THE ONE ADVISOR READ FOR THE WHOLE RAIL (ledger `2026-09-06-slip-conformance`).
   *
   * The Build card fetched this itself; the Expert card above it needs the same row, and two
   * `useQuery` calls for one fact — even sharing a cache entry — are two places the same answer is
   * derived (§18 rule 1). Owner-gated at the route (it 404s for anyone else), which is why it is
   * only enabled for the owner: the expert viewing this slip IS the advisor and has no need of a
   * card about themself.
   */
  const aiAction = useSlipAiAction(tripId, activities);
  const { data: advisorData } = useQuery<{ advisor: SlipRailAdvisor | null; advisors?: SlipRailAdvisor[] }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled: isOwner && !!tripId,
  });
  const advisor = advisorData?.advisor ?? null;
  // D7 (ledger `2026-09-07-all-advisors-reader`): the reader returns ALL of them. The card
  // portrays the first — the most recently assigned, which is the server's own named pick — and
  // `slipOtherAdvisorsLine` names the rest, so a plan with two advisors shows two. An older
  // server that answers without `advisors` degrades to exactly today's behaviour (§13: an absent
  // list is "not told", not "there is only one").
  const expertState = slipExpertRailState(advisor);
  const otherAdvisorsLine = slipOtherAdvisorsLine(advisorData?.advisors);

  return (
    /**
     * ONE COLUMN AT `lg`, which is where the rail sits in its own 320px track (the caller owns the
     * width — see `SlipView`). Below that it is full width, so two-up keeps the four cards from
     * becoming four screens of scrolling before the plan.
     *
     * DOM ORDER IS THE RULING'S ORDER — Expert · Build · Plan · Share · Finish — and it is the
     * order in every layout, so nothing about it depends on the breakpoint. It was
     * Build · Finish · Plan · Share, which only ever read correctly as a two-column grid and put
     * "Finalize plan" above the plan's own facts.
     */
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 items-start" data-testid="slip-rail">
      <ExpertCard advisor={advisor} expertState={expertState} otherAdvisorsLine={otherAdvisorsLine} />
      {/* Ledger `2026-09-07-my-events-fold` — renders ONLY when this plan has an engagement, so
          the ruling's order (Expert · Build · Plan · Share · Finish) is unchanged for every plan
          that has none. It sits beside Expert because both answer "who is working on this". */}
      <CoordinationCard tripId={tripId} isOwner={isOwner} />
      <BuildCard
        trip={trip}
        tripId={tripId}
        isOwner={isOwner}
        canEditItems={canEditItems}
        activities={activities}
        expertState={expertState}
        aiAction={aiAction}
        optimizerSlot={optimizerSlot}
      />
      {/* ASK AI — its OWN card, beneath Build (L16 lanes 2/3). It renders NOTHING for a viewer the
          proposal-log route would refuse: the routes are the policy and this mirrors them, never
          widens them (Locked Decision 42 D16's own wording, the §14 posture). */}
      <AskAiDrawer
        tripId={tripId}
        isOwner={isOwner}
        isExpertViewer={isExpertViewer}
        aiAction={aiAction}
      />
      <PlanCard
        tripId={tripId}
        isOwner={isOwner}
        planEvents={planEvents}
        budgetLine={budgetLine}
        stopsLine={stopsLine}
        zoneLine={zoneLine}
      />
      <ShareCard trip={trip} tripId={tripId} isOwner={isOwner} />
      <FinishCard trip={trip} isOwner={isOwner} isPrimary={isPrimary} activities={activities} />
    </div>
  );
}
