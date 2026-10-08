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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  MoreHorizontal,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { freeFindingsPromptLine, unreachableStopLines, type Finding } from "@shared/optimizer-lead";
import { createPortal } from "react-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { useSlipFreeDraft } from "@/components/plan/useSlipFreeDraft";
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
  // Slip conformance (ledger `2026-10-08-conformance-slip-phase0`): the ONE free-draft action,
  // shared with the Empty board's draft card. On a plan whose dates nobody chose it asks for them
  // first (canvas note s12); otherwise it drafts exactly as before.
  const draft = useSlipFreeDraft(trip as any, tripId);
  const draftDisabledReason = draft.disabledReason;

  return (
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
          {draft.datesDialog}
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
  leadCopy = null,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  leadCopy?: SlipLeadCopy | null;
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
  // Ruling 3: "after the first run" — the plan's own `lastOptimizedAt` on the plancard the slip already read.
  const { data: runPlan } = useQuery<{ lastOptimizedAt?: string | null }>({
    queryKey: [`/api/trips/${trip.id}/plancard`],
    enabled: false,
  });
  const hasRun = !!runPlan?.lastOptimizedAt;
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

  // The board's "Local expert" beside Optimize: the SAME handoff chooser the hire row opens.
  const openLocalExpert = () => openHandoffChooser({});
  const optimizerBlock = (
        <>
          {/* Surface step 4 (spec §8): the ONE optimizer card — findings, the realised delta after a
              run, and the fee on the CTA. Same handler the old row had (the build-around step first). */}
          <span title={optimizeDisabledReason ?? undefined} className="block" data-testid="slip-action-optimize-wrap">
          <OptimizerLead
            drafted={aiAction === "optimize"}
            findings={leadData.findings}
            hasPricedItems={leadData.hasPricedItems}
            fee={leadData.fee}
            realised={leadData.realised as any}
            testId="slip-action-optimize"
            onClick={() => {
              if (optimizing || creatingComparison || optimizeDisabledReason) return;
              setBuildAroundOpen(true);
            }}
            busy={optimizing || creatingComparison}
            disabledReason={optimizeDisabledReason}
            ctaLabelOverride={creatingComparison ? "Building…" : null}
            tone="board"
            title={leadCopy?.title ?? null}
            intro={leadCopy?.intro ?? null}
            noStay={leadCopy?.noStay === true}
            onLocalExpert={expertState.kind === "hire" ? openLocalExpert : null}
            localExpertTestId="slip-action-hire-expert"
          />
          </span>
          {/* RULING 3 (Main board): the Trip Pass is offered HERE, under the optimizer card, once the
              plan has had a run — never as a standing card. The SAME card; one purchase rail. Purchase
              is the owner's (LD 52 — a helper never pays). "Included in your Trip Pass" is no longer a
              label: it is the CTA's own state ("Optimize · included · N runs left"). Feedback moved to
              the ⋯ plan menu. */}
          {hasRun ? (
            <div data-testid="slip-trip-pass-offer">
              <TripPassCard tripId={tripId} planName={trip.title || trip.destination} />
            </div>
          ) : null}
        </>
  );

  return (
    <>
      {/* Smoke 9 S9-4: the optimizer LEADS the page (§8) — rendered under the tools tray through the
          slip's slot (a portal: the state stays here, the card moves). Main board (ledger
          `2026-10-08-slip-main-rail`): the rail is gone, so this component draws nothing of its own
          — the card, the Trip Pass offer and the two dialogs are all it mounts. */}
      {isOwner ? (optimizerSlot ? createPortal(optimizerBlock, optimizerSlot) : optimizerBlock) : null}
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
    </>
  );
}

/**
 * "Message <name>" — the ONE message control (D22: the address is the PLAN). Moved verbatim from the
 * Build card when the rail dissolved (ledger `2026-10-08-slip-main-rail`); same testid, same body.
 */
function ExpertMessageRow({ trip, tripId, expertState }: { trip: SlipTrip; tripId: string; expertState: SlipExpertRailState }) {
  const askExpert = useAskExpert();
  if (expertState.kind !== "message") return null;
  return (
    <RailRow
      label={`Message ${expertState.name}`}
      meta={expertState.isConciergeReadGrant ? "reads this plan" : expertState.pending ? "awaiting reply" : "expert"}
      icon={<MessageCircle className="w-3.5 h-3.5" />}
      onClick={() =>
        void askExpert({
          // D22 (ledger `2026-09-05-slip-decisions-d18-d22`) — the client names `{ tripId }` and the
          // SERVER resolves the counterpart; no user id or handle is sent (Locked Decision 40).
          tripId,
          subject: trip.title || trip.destination || null,
          fallbackName: expertState.name,
          returnTo: `/plans/${tripId}`,
        })
      }
      testId="slip-action-message-expert"
    />
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
  messageControl = null,
}: {
  /** The ONE "Message <name>" control (`ExpertMessageRow`), owner only. */
  messageControl?: React.ReactNode;
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
        {/* Main board (ledger `2026-10-08-slip-main-rail`): the Build card is gone, so the ONE
            message control sits with the person it messages (the Handoff board's own placement). */}
        {messageControl}
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
    // No card heading (Main board): what is left here — organize-into-events and the budget — is
    // drawn bare and draws nothing when it has nothing to say.
    <div className="space-y-2" data-testid="slip-plan-extras">
      {/* Ruling 3 (ledger `2026-10-08-slip-main-rail`): "Stops & timezone" left this card — the
          header's stops line and its owner-only Edit open the SAME planning modal, and the zone is
          on the header subline and the Travel party sheet. */}

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
    </div>
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
  layout = "card",
}: {
  trip: SlipTrip;
  isOwner: boolean;
  /** `tripCardIsPrimary(...)` — resolved ONCE by the caller and never recomputed here. */
  isPrimary: boolean;
  activities: PlanCardActivity[];
  /** `bar`: the slip's sticky bottom bar (ledger `2026-10-08-slip-main-rail`). The map band keeps the card. */
  layout?: "card" | "bar";
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

  if (layout === "bar") {
    // THE BOTTOM BAR (Main board): the same mutations, testids and lines as the card below — the
    // finished plan's three controls, or Finalize with the checkout and fee lines above it.
    const primaryBtn =
      "inline-flex h-[50px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[color:var(--slip-primary)] px-4 text-[15px] font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60";
    const quietBtn =
      "inline-flex h-[50px] flex-shrink-0 items-center justify-center rounded-[14px] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-4 text-[15px] font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)] disabled:opacity-60";
    if (isPrimary) {
      return (
        <div className="flex min-w-0 flex-1 gap-2.5" data-testid="slip-bar-finish" data-finish-state="finished">
          {offerRefinal ? (
            <button type="button" className={primaryBtn} onClick={refinalize} disabled={finalizeMutation.isPending} data-testid="slip-action-refinalize">
              Make it final again
            </button>
          ) : null}
          <Link href={`/trip/${trip.id}`} className={offerRefinal ? quietBtn : primaryBtn} data-testid="slip-action-view-trip-card">
            View as Trip card
          </Link>
          {showReopen ? (
            <button type="button" className={quietBtn} onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending} data-testid="slip-action-reopen">
              Back to planning
            </button>
          ) : null}
          {chooser}
        </div>
      );
    }
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2" data-testid="slip-bar-finish" data-finish-state="working">
        {freeLine ? (
          <p className="text-xs text-[color:var(--slip-gold-ink)]" data-testid="slip-finalize-free-prompt">
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
        {checkoutReady > 0 ? (
          <p className="text-xs text-[color:var(--slip-muted)]">
            <Link href="/cart" className="font-semibold text-[color:var(--slip-navy)] underline underline-offset-2" data-testid="slip-action-go-to-checkout">
              Go to checkout ({checkoutReady})
            </Link>
            {slipFeeDisplay ? (
              <span className="mt-0.5 block" data-testid="slip-traveler-fee-preview">
                {slipFeeDisplay.label}:{" "}
                {slipFeeDisplay.kind === "charged" ? (
                  <span className="font-medium text-[color:var(--slip-ink)]">${slipFeeDisplay.amount.toFixed(2)}</span>
                ) : (
                  <span className="line-through">${slipFeeDisplay.wouldHaveBeen.toFixed(2)}</span>
                )}{" "}
                {slipFeeDisplay.note}{" "}
                <Link href={helpArticlePath("trip-pass-and-fees")} className="underline underline-offset-2" data-testid="link-slip-fee-help">
                  About this fee
                </Link>
              </span>
            ) : null}
          </p>
        ) : null}
        <button type="button" className={`${primaryBtn} w-full flex-none`} onClick={refinalize} disabled={finalizeMutation.isPending} data-testid="slip-action-finalize-plan">
          {hasFinal ? "Make it final again" : "Finalize plan"}
        </button>
        {chooser}
      </div>
    );
  }

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

/** The optimizer card's group-specific words (slip conformance, Moment board). */
export interface SlipLeadCopy {
  title: string | null;
  intro: string | null;
  /** The plan is not built around a place to stay — drop "where you stay" wording. */
  noStay: boolean;
}

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
  leadCopy = null,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  /**
   * The optimizer card's group-specific words (a Moment's title and intro), resolved by `SlipView`
   * from the plan's own facts. Null ⇒ the board's Trip wording.
   */
  leadCopy?: SlipLeadCopy | null;
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
  const { advisor, expertState, otherAdvisorsLine } = useSlipAdvisor(tripId, isOwner);

  return (
    /**
     * THE RAIL IS GONE (slip conformance, Main board; ruling 3, ledger `2026-10-08-slip-main-rail`).
     * What this component still mounts sits INSIDE the plan column, and every control kept one home:
     *   · Expert — the person on the plan, with the ONE message control (the Handoff board's place);
     *   · the done-for-you engagement, only when there is one (kept pending a ruling — LD 45 (5));
     *   · organize-into-events and the budget, drawn bare;
     *   · Build — no card of its own: the optimizer card (portaled under the tray), the Trip Pass
     *     offer after the first run, and the two dialogs.
     * Ask AI and Finalize are the bottom bar (`SlipBottomBar`); Share, PDF, calendar, Browse and
     * feedback are the ⋯ plan menu (`SlipPlanMenu`); the hire door is the optimizer card's "Local
     * expert"; Stops & timezone is the header's own stops line.
     */
    <div className="space-y-3" data-testid="slip-plan-panel">
      <ExpertCard
        advisor={advisor}
        expertState={expertState}
        otherAdvisorsLine={otherAdvisorsLine}
        messageControl={isOwner ? <ExpertMessageRow trip={trip} tripId={tripId} expertState={expertState} /> : null}
      />
      <CoordinationCard tripId={tripId} isOwner={isOwner} />
      <PlanCard
        tripId={tripId}
        isOwner={isOwner}
        planEvents={planEvents}
        budgetLine={budgetLine}
        stopsLine={stopsLine}
        zoneLine={zoneLine}
      />
      <BuildCard
        trip={trip}
        tripId={tripId}
        isOwner={isOwner}
        canEditItems={canEditItems}
        activities={activities}
        expertState={expertState}
        aiAction={aiAction}
        optimizerSlot={optimizerSlot}
        leadCopy={leadCopy}
      />
    </div>
  );
}

/**
 * THE ONE ADVISOR READ (ledger `2026-09-06-slip-conformance`), now a hook: the plan panel and the ⋯
 * menu both need the row, and one query key plus one derivation is one answer (§18 rule 1).
 * Owner-gated at the route, so only enabled for the owner.
 */
export function useSlipAdvisor(tripId: string, isOwner: boolean) {
  const { data } = useQuery<{ advisor: SlipRailAdvisor | null; advisors?: SlipRailAdvisor[] }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled: isOwner && !!tripId,
  });
  const advisor = data?.advisor ?? null;
  return { advisor, expertState: slipExpertRailState(advisor), otherAdvisorsLine: slipOtherAdvisorsLine(data?.advisors) };
}

/**
 * THE ⋯ PLAN MENU (ruling 3, Main board's top bar). Share link, the PDF, the calendar, Browse services
 * and Send feedback — the same rails, testids and gates the Share card and Build card had. An entry
 * whose gate is closed is absent, never greyed (§13), and the menu itself is absent when it would be
 * empty.
 */
export function SlipPlanMenu({
  trip,
  tripId,
  isOwner,
  canEditItems,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  canEditItems: boolean;
}) {
  const { toast } = useToast();
  const { isHidden: occasionHidden } = useOccasionSwitches(tripId);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { data: feedback } = useQuery<{ open?: string[] }>({
    queryKey: [`/api/plans/${tripId}/feedback`],
    enabled: isOwner && !!tripId,
  });
  const share = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/share`);
      return (await res.json()) as { success?: boolean; shareToken?: string | null };
    },
    onSuccess: (data) => {
      const token = typeof data?.shareToken === "string" ? data.shareToken : "";
      if (!token) {
        toast({ variant: "destructive", title: "Couldn't create a share link", description: "Please try again." });
        return;
      }
      const url = slipShareUrl(window.location.origin, token);
      navigator.clipboard?.writeText(url).catch(() => {});
      toast({ title: "Link copied!", description: "Anyone with this link can view your plan." });
      if (navigator.share) {
        navigator.share({ title: `${trip.title || trip.destination || "Trip"} - Traveloure`, url }).catch(() => {});
      }
    },
    onError: () => toast({ variant: "destructive", title: "Couldn't create a share link" }),
  });

  // Under a hidden-visibility occasion the share entries are absent (LD 28), as the Share card was.
  const showShare = isOwner && !occasionHidden;
  const showFeedback = isOwner && Array.isArray(feedback?.open) && feedback!.open!.includes("post_draft");
  if (!showShare && !canEditItems && !showFeedback) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Plan menu"
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--slip-radius-button)] text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)]"
            data-testid="slip-plan-menu"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {showShare ? (
            <>
              <DropdownMenuItem onClick={() => share.mutate()} disabled={share.isPending} data-testid="slip-action-share">
                <Share2 className="mr-2 h-4 w-4" /> Share link
              </DropdownMenuItem>
              {/* The printable copy — the SAME canonical items this slip renders; a plain anchor to the
                  session-authenticated attachment route. */}
              <DropdownMenuItem asChild>
                <a href={slipPdfPath(tripId)} target="_blank" rel="noopener noreferrer" data-testid="slip-action-pdf">
                  <FileDown className="mr-2 h-4 w-4" /> Download PDF
                </a>
              </DropdownMenuItem>
              {/* The trip-keyed `.ics` (S11); the plan's `trips.timezone` pins the instants (LD 30). */}
              <DropdownMenuItem asChild>
                <a href={slipCalendarPath(tripId)} target="_blank" rel="noopener noreferrer" data-testid="slip-action-calendar">
                  <CalendarPlus className="mr-2 h-4 w-4" /> Add to calendar
                </a>
              </DropdownMenuItem>
            </>
          ) : null}
          {canEditItems ? (
            <DropdownMenuItem asChild>
              <Link href={slipBrowseServicesHref(tripId, trip.destination)} data-testid="slip-browse-services">
                <Plus className="mr-2 h-4 w-4" /> Browse services for this trip
              </Link>
            </DropdownMenuItem>
          ) : null}
          {showFeedback ? (
            <DropdownMenuItem onClick={() => setFeedbackOpen(true)} data-testid="slip-action-feedback">
              <MessageCircle className="mr-2 h-4 w-4" /> Send feedback
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Feedback phase A ("Does this draft fit?") — the SAME tap, opened from the menu while the
          server says the moment is open. */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
          </DialogHeader>
          <FeedbackTap tripId={tripId} moment="post_draft" codes={FEEDBACK_CODES.post_draft} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * THE STICKY BOTTOM BAR (ruling 3, Main board): Ask AI is the secondary action, Finalize the primary.
 * Both are the existing components in their `bar` layout — same rails, same testids, same gates —
 * so a viewer either one refuses sees nothing of it. List view only; the map band keeps its own
 * Finish card (ruling 7: map view unchanged).
 */
export function SlipBottomBar({
  trip,
  tripId,
  isOwner,
  isExpertViewer,
  isPrimary,
  activities,
}: {
  trip: SlipTrip;
  tripId: string;
  isOwner: boolean;
  isExpertViewer: boolean;
  isPrimary: boolean;
  activities: PlanCardActivity[];
}) {
  const aiAction = useSlipAiAction(tripId, activities);
  const box = useFixedBarBox();
  if (!isOwner && !isExpertViewer) return null;
  return (
    /* FIXED, NOT STICKY. The console's `<main>` is `overflow-auto` and grows with its content, so it
       is a scroll container that never scrolls and a sticky bar inside it never sticks. The bar is
       fixed to the window instead, measured onto the plan column (the sidebar may be open or
       collapsed), and this spacer holds its height so the last day is never hidden under it. */
    <div ref={box.spacerRef} style={{ height: box.height }} data-testid="slip-bottom-bar-space">
      <div
        ref={box.barRef}
        className="fixed bottom-0 z-30 border-t border-[color:var(--slip-line)] bg-[color:var(--slip-card)] px-4 pt-3 pb-5 shadow-[0_-4px_12px_rgba(13,33,55,0.06)] sm:rounded-t-[var(--slip-radius-card)]"
        style={box.rect ? { left: box.rect.left, width: box.rect.width } : { left: 0, right: 0 }}
        data-testid="slip-bottom-bar"
      >
        <div className="flex items-end gap-2.5">
          <AskAiDrawer tripId={tripId} isOwner={isOwner} isExpertViewer={isExpertViewer} aiAction={aiAction} layout="bar" />
          <FinishCard trip={trip} isOwner={isOwner} isPrimary={isPrimary} activities={activities} layout="bar" />
        </div>
      </div>
    </div>
  );
}

/** The bottom bar's box: the spacer's column (left + width) and the bar's own height. */
function useFixedBarBox() {
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);
  const [height, setHeight] = useState(96);
  useLayoutEffect(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;
    const update = () => {
      const r = spacer.getBoundingClientRect();
      setRect((prev) => (prev && prev.left === r.left && prev.width === r.width ? prev : { left: r.left, width: r.width }));
      const h = barRef.current?.offsetHeight;
      if (h) setHeight((prev) => (prev === h ? prev : h));
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(spacer);
    if (barRef.current) ro.observe(barRef.current);
    // The column moves without resizing when the sidebar opens or collapses; <main> resizes then.
    const main = spacer.closest("main");
    if (main) ro.observe(main);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return { spacerRef, barRef, rect, height };
}
