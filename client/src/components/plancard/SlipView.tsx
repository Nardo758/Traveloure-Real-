/**
 * SlipView — Spec A (the Slip, owner view) + Spec B (post-optimization additions) of
 * docs/briefs/SLIP_EXPERIENCE_DISPATCH.md §4. Part of the CANONICAL PlanCard family
 * (extend-never-fork): it renders the same `GET /api/trips/:tripId/plancard` DTO the
 * PlanCard reads, reuses the family's RoutingBadge/RoutingActions (one pill, one set of
 * routing edges everywhere — ruling 8), and takes its tints from `slip-tokens.ts`.
 *
 * Spec B is Spec A rendering different data — the OptimizedBadge / anchor glyph render
 * only when a real `variant_applied` diary row exists; nothing is fabricated (§13):
 *  - move/change annotations: the applied variant's per-item move metadata does NOT
 *    survive apply into `itinerary_items` (no source on this DTO), so no move annotation
 *    renders — honest nothing, never an invented rationale.
 *  - the day-end logistics list (`LogisticsRow`, with its "added by optimizer" line) is retired
 *    (FU-9C-1): every shown leg renders between its two stops through `renderLegBetween`
 *    (`slipLegBetween`, step 9c D5), so no leg loses its render.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
// Ruling 5 (ledger `2026-10-08-conformance-slip-phase0`): the slip's token layer, imported here only.
import "@/styles/slip-tokens.css";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  Anchor,
  CalendarDays,
  CheckCircle2,
  EyeOff,
  List as ListIcon,
  Map as MapIcon,
  Sparkles,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ITEM_BOOKING_NOTES,
  effectiveRoutingStatus,
  isBookedActivity,
  itemBookingAction,
  itemBookingState,
  slipItemBookingLine,
} from "@/lib/item-booking-state";
import { parseTripDate } from "@/lib/calendar-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TripPlanTransition } from "@shared/trip-plan";
import { TRIP_CARD_FINALIZE_NOW_TITLE, TRIP_CARD_READY_TITLE, tripCardBannerState, tripCardForcedPrimaryByDateAlone, tripCardIsPrimary } from "@shared/trip-primary-surface";
import {
  type PlanCardActivity,
  type PlanCardData,
  type PlanCardDay,
  type RoutingStatus,
} from "./plancard-types";
import { ItemBookingActionLink } from "./ActivitiesSection";
import { PlanApprovalBanner } from "./PlanApprovalBanner";
import { SlipSavedPlaces } from "./SlipSavedPlaces";
import { ExpertSuggestionsPanel } from "./ExpertSuggestionsPanel";
// The action rail, in four cards (ledger `2026-09-05-slip-rail-regroup`). It owns every
// `slip-action-*` control this file used to render inline, plus the browse link, the logistics
// collapsibles, the contract board, the Trip Pass card and the budget line — one home each.
import { FinishCard, SlipDraftAiRow, SlipRail, useSlipAiAction } from "./SlipRail";
import type { SlipLeadCopy } from "./SlipRail";
import { SlipHeaderMeta } from "./SlipHeaderMeta";
import { AnchorPanel, ANCHOR_PANEL_ADD_PLACES } from "@/components/plan/AnchorPanel";
import { LegRow } from "@/components/plan/LegRow";
import { airportLegLine, airportLegModes, showsAirportLeg } from "@shared/airport-leg";
import { manifestFor } from "@shared/group-manifest";
import { anchorSurfaces, isLodgingItem, replaceStayQuestion, type WhereToStayView } from "@shared/where-to-stay";
import { itemFactsLine } from "@/lib/place-facts";
import { ITEM_MENU_LABELS, ItemRow, type ItemRowMenu } from "@/components/plan/ItemRow";
import { ItemSheet } from "@/components/plan/ItemSheet";
import { PlacePhoto, usePlacePhotos } from "@/components/plan/PlacePhoto";
import { legsCheckedLine, navigateHref, readyMadeSourceLine } from "@/lib/trip-card";
import { DayBlock } from "@/components/plan/DayBlock";
import { PlanRowLookProvider } from "@/components/plan/row-look";
import {
  GETTING_THERE_TOOL,
  TRAVEL_ANCHOR_WORDS,
  TravelAnchorPlaceholder,
  flightAnchorFor,
  flightRowText,
  travelRowTitle,
  AnchorConflictLine,
  type FlightAnchorView,
} from "@/components/plan/AnchorRow";
import { absorbedTravelItemId, flightTimeConflictLine } from "@shared/getting-there";
import { ToolsTray } from "@/components/plan/ToolsTray";
import { SlipEmptyStart } from "@/components/plan/SlipEmptyStart";
import { MomentAnchorCard } from "@/components/plan/MomentAnchorCard";
import { momentEveningHeading, momentTimeSpan, momentLeadIntro, momentLeadTitle, momentSketchLine, momentSpanWord } from "@/lib/slip-moment";
import { useHealthFlags } from "@/lib/health-flags";
import type { ToolKey } from "@shared/group-manifest";
import { dayBlockHeading, dayBlockStats } from "@/lib/plan-day";
import { ASK_LOCAL_WORDS, anchorFromTool, anyLocalLive, findHostCategory, findHostHref } from "@/lib/item-row-menu";
import { ItemAskLocalPanel } from "@/components/plan/ItemAskLocalPanel";
import { isLocated } from "@/components/plancard/MapControlCenter";
import { areaShading, planMapAnchor, type MapAnchor, type MapArea, type MapVersion } from "@/lib/map-scene";
import type { VersionsBoardView } from "@/lib/versions-board";
import { CHECKING_HOURS_LABEL, showsCheckingHours } from "@/lib/plancard-refetch";
import type { FactView } from "@shared/content-facts";
import { useOccasionSwitches } from "@/hooks/use-occasion-switches";
import { durationShape, showsSchedule } from "@/lib/occasion-switches";
import {
  buildSlipDaySlots,
  countPlanEvents,
  eventMetaLine,
  showsSlipEmptyState,
  SLIP_EMPTY_EVENT_BODY,
  SLIP_UNDATED_SLOT_HEADING,
  type PlanEvent,
} from "@/lib/slip-events";
import { planBudgetLine, statedEventBudget } from "@/lib/plan-budget";
import { planHeaderCountLabel } from "@/lib/plan-vocabulary";
import {
  slipPlanMetaLine,
  slipStopsLine,
  slipZoneLine,
  type SlipDestinationRow,
} from "@/lib/slip-meta";
import { usePlanning } from "@/contexts/PlanningContext";
import { activateOpenedPlan, syncActiveTripToContext } from "@/lib/trip-selection";
import { usePenPrincipal } from "@/lib/trip-context";
import { TripExpertNote } from "./TripExpertNote";
import { ItemComments } from "./ItemComments";
// D6 (ledger `2026-09-06-slip-conformance`): the EVENT-level role question opens the PROVIDER
// browse. `roleLabel` is the ONE place a `service_categories.category_key` becomes words and is
// shared with the expert picker's own chips (§18 rule 1); `slip-event-roles` owns the keys, the
// hrefs and the §13 rule that a NULL `roles_needed` draws nothing at all.
import { roleLabel, type HireRoleCategory } from "@/lib/hire-from-slip";
import { slipEventRoleChips } from "@/lib/slip-event-roles";
import { servicesBrowseHref } from "@/lib/services-browse";
import {
  experienceGroupFor,
  resolvedTripsAnchor,
  tripsAnchorLine,
  tripsAnchorState,
  type TripsAnchor,
} from "@shared/experience-group";
// The advisor's standing, spelled ONCE — this header and the rail's Expert card read it.
import { slipAdvisorStandingLine, type SlipRailAdvisor } from "@/lib/slip-rail";
// LD 42 rows 1.6 / S1 / S2 / D16 (ledger `2026-09-05-slip-own-your-plan`): the owner's own hands on
// their own plan. The RULES are pure and live in `@/lib/slip-item-tools`; the buttons and the four
// existing rails they call live in `SlipItemTools.tsx`. Nothing here restates either (§18 rule 1).
import { SlipAddItemControl, useSlipItemActions } from "./SlipItemTools";
import { SLIP_DELEGATE_NOTE, canEditPlanItems, slipViewer } from "@/lib/slip-viewer-role";
import {
  SlipAnchorCompareButton,
  SlipOptionSetCard,
  usePromoteAnchor,
  useSetAsStay,
  primaryAnchorItemId,
  useOptionSets,
} from "./SlipOptionSets";
import { AddLocalExpertButton, ExpertDoorCard, useExpertDoorState } from "./ExpertDoor";
import { HandoffChooserHost } from "@/components/plan/HandoffChooser";
import { HandoffBanner, SuggestionStrip, useExpertSuggestions } from "@/components/plan/HandoffBanner";
import { openHandoffChooser } from "@/lib/handoff-client";
import {
  resolveAddDayNumber,
  slipItemTools,
  SLIP_ADD_DAY_LABEL,
  SLIP_ADD_EVENT_LABEL,
  SLIP_ASK_EXPERT_LABEL,
} from "@/lib/slip-item-tools";
import { MapControlCenter } from "./MapControlCenter";
// LD 43(d): mount 2 of 2 — the Finalize success / finished area, and ONLY when the plan
// actually holds bookable rows. The component itself decides visibility from the vault read.
import { SavePaymentMethodPrompt } from "@/components/payment/SavePaymentMethodPrompt";
import { mapDayChips } from "@/lib/map-days";
import {
  EXPERT_NOTE_TINT,
  OPTIMIZED_TINT,
  ROUTING_TINTS,
  SLIP_SURFACE_CLASS,
  SLIP_TITLE_FONT_CLASS,
  tintPillStyle,
} from "./slip-tokens";

// ── DTO shape (the plancard route response — PlanCardData plus the blocks the slip reads) ──

export interface SlipTrip {
  id: string;
  title: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  /** `null` = nobody has said who is going (RC-12); the header asks instead of printing a count. */
  travelers: number | null;
  /** `trips.event_type` — the coarse occasion key the plancard already sends. */
  eventType?: string | null;
  /** Lane S identity — NULL on pre-Lane-S rows; render NOTHING for null (never invent). */
  trackingNumber?: string | null;
  /** Version = item_transition_log row count (display-only, server-computed). */
  planVersion?: number;
  /** R-F: set once by POST .../finalize, cleared by POST .../reopen. NULL = never finalized. */
  finalizedAt?: string | null;
  /** Latest trip_finals version (server-emitted, Phase 2). NULL/absent = no final yet. The ready-
   *  banner renders it so the Finalize Plan button's disappearance reads as COMPLETED, not missing
   *  (adopt-finalize-conform D-2). */
  finalVersion?: number | null;
  /** §21 traveler-facing trip-level note — same DTO field PlanCard passes to the map's notes layer. */
  expertTravelerNote?: string | null;
  /**
   * S7 (ledger `2026-09-06-slip-small-additions`) — Locked Decision 30's ONE IANA zone per plan
   * (`trips.timezone`, migration 279), server-derived at mint and never client-settable.
   *
   * OPTIONAL AND ABSENT-WHEN-UNSET, not nullable-and-present: the plancard route SPREADS the key
   * only when the column holds a zone, so `undefined` here means NOT CAPTURED and the header
   * renders NO zone line at all. Locked Decision 30 forbids the alternatives by name — never UTC,
   * never the server's zone, never the nearest guess (§13).
   */
  timezone?: string;
  /**
   * D-22 (migration 302, ledger `2026-09-15-d22-dates-confirmed`) — WAS THIS PLAN'S WINDOW CHOSEN
   * BY ANYBODY, or filled in because `start_date`/`end_date` are NOT NULL?
   *
   * PRESENT-AND-BOOLEAN, deliberately the opposite shape from `timezone` above. An absent zone
   * means "say nothing about the zone", so omitting that key is the honest shape there; here the
   * FALSE value is the load-bearing half, and an omitted key would collapse "these dates are a
   * placeholder" into "this payload predates the field". `undefined` therefore reads as the
   * pre-field case and changes nothing (the header renders no chip), while an explicit `false`
   * renders the placeholder chip and, for the owner, the re-date CTA.
   *
   * It is a BOOLEAN and never the timestamp: when the dates were certified is nobody's business on
   * a read surface, and publishing it would invite a second reader to re-answer the question that
   * `planDatesAreConfirmed` answers once (§18 rule 1).
   */
  datesConfirmed?: boolean;
}

export interface SlipData extends PlanCardData {
  trip?: SlipTrip;
  /** Step 5 (R-h): routed legs and their minutes render only when the travel-time service is on. */
  travelTimesShown?: boolean;
  /** A5 — each item's facts with their provenance, keyed by item id (server-projected; absent ⇒ none). */
  placeFacts?: Record<string, FactView[]>;
  /** Smoke 5 item 8 — item ids the latest draft's place-facts run is still checking (present only when non-empty). */
  factsPendingItemIds?: string[];
  /** Smoke 7 item 4: the viewer's own saved "Ask a local" questions, by item (present only when any). */
  savedQuestions?: { cityName: string | null; items: Record<string, { question: string | null; savedAt: string }> };
  /** The §4 diary — last 20 log rows, newest first. Absent on pre-BUILD-1 responses. */
  recentTransitions?: TripPlanTransition[];
  /**
   * Migration 277 (ledger `2026-09-04-slip-events`) — the plan's EVENTS, exactly as the plancard
   * route already ships them (its narrow projection of the trip's `user_experiences` rows, behind
   * the same owner/advisor/author gate as the rest of this DTO). Nothing new is requested for
   * this lane: the key was already on the wire with no reader. Absent/empty ⇒ the plan has only
   * its ONE implicit unnamed event, and the slip renders its flat day list unchanged.
   */
  events?: PlanEvent[];
  /**
   * LD 41 (c) / ledger `2026-09-05-draft-only-on-empty` — SERVER-DERIVED: true when this plan
   * holds items and EVERY one of them is still an untouched free-draft row (`origin='ai'` and
   * `routing_status='in_planning'`). The client does NOT recompute it: the activity DTO carries
   * no `origin`, so a client answering this would be guessing (§18 rule 1 — one predicate, one
   * place, and it lives on the server beside the rows). Absent on a pre-lane response ⇒ the line
   * simply does not render; `false` renders nothing either, never the inverse claim (§13).
   */
  aiSketch?: boolean;
  /**
   * Ledger `2026-09-26-send-to-expert-needs-expert` (audit G2): an advisor in a §12 WRITE status
   * (accepted/assigned) is on this plan — the SAME predicate the routing rail refuses "Send to
   * expert" on. `false` ⇒ no "Send to expert" and no "with your expert" label. Absent on an older
   * response ⇒ treated as not assigned (the server refuses the edge either way).
   */
  expertAssigned?: boolean;
  /**
   * S6 (ledger `2026-09-06-slip-small-additions`) — the plan's ORDERED STOPS, migration 281 /
   * Locked Decision 34, exactly as the plancard route already ships them. Nothing new is requested
   * for this lane: the key was already on the wire with no reader on this surface.
   *
   * §13 — AN EMPTY ARRAY MEANS NOT CAPTURED, NOT "no destination". There is no backfill, so every
   * legacy plan arrives here with `[]` and the header falls back EXPLICITLY to
   * `trip.destination` — the position-0 mirror — which is what that ruling requires of every
   * reader. `slipStopsLine` does the falling back, through the SAME `seedStops` the plan modal's
   * step 2 seeds its editor from (§18 rule 1).
   */
  destinations?: SlipDestinationRow[];
  meta?: PlanCardData["meta"] & {
    deliveredBy?: { expertId: string; name: string | null; avatar: string | null } | null;
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────────────

/** F-1: trip start/end arrive as bare "YYYY-MM-DD" (DATE columns) — `new Date()` would parse
 *  those as UTC midnight and render the PREVIOUS day west of UTC. `parseTripDate` reads a
 *  date-only string as LOCAL midnight while leaving real timestamps (diary `createdAt`) alone. */
function safeDate(raw: string | null | undefined): Date | null {
  return parseTripDate(raw);
}

/** Phase chip DERIVED FROM DATES vs now — NEVER trips.status (dead field, CLAUDE.md §13). */
function derivePhase(start: Date | null, end: Date | null): "upcoming" | "active" | "past" | null {
  const now = new Date();
  if (start && end && now >= start && now <= end) return "active";
  if (start && start > now) return "upcoming";
  if (end && end < now) return "past";
  return null;
}

const PHASE_LABELS: Record<string, string> = { upcoming: "Upcoming", active: "Active", past: "Past" };

/** R145: the ONE client reading of the booked state (`@/lib/item-booking-state`) — an ended
 *  (refunded / cancelled) booking is never a purchased row, even when routing still says so. */
function isPurchasedRow(a: PlanCardActivity): boolean {
  return isBookedActivity(a);
}

function expertFirstName(data: SlipData): string | null {
  const name = data.meta?.deliveredBy?.name;
  if (!name) return null;
  return name.split(" ")[0] || null;
}

/**
 * THE DAY HEADING (re-audit A17; the ratified `Slip` artboard's "Friday · Oct 2").
 *
 * A plan's days are read as days of the week — "the Friday" is what a traveler plans around — and
 * the ordinal "Day 1" is the plan's own internal index, which tells them nothing they can act on.
 *
 * §13 — THE ORDINAL IS THE FALLBACK, NOT THE DECORATION. The weekday can only be named from a real
 * calendar date, and `dateIso` is null for a plan with no start date (`dayDateIso` never guesses
 * one). Such a plan keeps "Day N" exactly as before, and gains no weekday. A `dateIso` that will
 * not parse is treated the same as an absent one: it is not shown as itself and not repaired.
 *
 * Parsed with `parseTripDate` so a bare "YYYY-MM-DD" lands on LOCAL midnight — `new Date()` would
 * render the previous day west of UTC (F-1), which is the whole reason that helper exists.
 *
 * `dayNum: null` (ledger `2026-09-05-slip-events-first-render`) is a slot the plan's EVENTS brought
 * into being rather than one of its item-derived days — it has no ordinal, so with no machine date
 * either there is nothing to name and the heading says exactly that (§13). It is NEVER given
 * "Day 1": a slot that exists because an event has no date must not be labelled with a day.
 */

// ── SlipHeader ─────────────────────────────────────────────────────────────────────────

export function SlipHeader({
  data,
  hasOptimized,
  eventCount,
  partyLabel,
  isHidden,
  isOwner,
  stopsLine,
  zoneLine,
  onEditStops,
  onAskParty,
  occasionName,
  anchorLine,
  expertControl,
  daySpan = null,
  sketchLine = null,
}: {
  data: SlipData;
  /** A one-day Moment's span ("evening" / "day"), for the window line (Moment board). */
  daySpan?: "evening" | "day" | null;
  /**
   * The Moment board's line beside the "AI starting sketch" chip ("4 stops · around your
   * reservation"). Present only for a Moment with an anchor; otherwise the sketch keeps its sentence.
   */
  sketchLine?: string | null;
  /** The expert door's small "Add a local expert" control (ledger `2026-09-29-expert-door`), or null. */
  expertControl?: React.ReactNode;
  hasOptimized: boolean;
  /**
   * A1 (ledger `2026-09-29-a1-trips-frame`) — the occasion's OWN name (`experience_types.name`),
   * the B1 header's eyebrow. Only when the occasion resolved to a row; `null` renders nothing — a
   * plan whose occasion did not resolve is never labelled with a guessed one (§13), and the
   * experience GROUP is never rendered at all (R127).
   */
  occasionName?: string | null;
  /** A1 — the Trips anchor state line (`tripsAnchorLine`), for a Trips plan only; `null` otherwise. */
  anchorLine?: string | null;
  /** `countPlanEvents(data.events)` — resolved by the caller, never counted twice (re-audit A16). */
  eventCount: number;
  /**
   * "2 guests" / "1 traveler" — the party count AND its occasion noun, resolved ONCE by the caller
   * through `partyCountLabel` (ledger `2026-09-05-slip-events-first-render`). This header used to
   * hard-code "traveler(s)" while step 4, the Trip Strip chip and `SlipTravelingParty` all read the
   * occasion's own `vocabulary` column (Locked Decision 28), so a wedding said "guests" everywhere
   * except here. `""` when the plan states no party, and the segment is then OMITTED (§13) exactly
   * as it was when the count itself was falsy.
   */
  partyLabel: string;
  /** `default_visibility: hidden` — the proposal case (re-audit A21). */
  isHidden: boolean;
  /** D16 — the stops line's Edit affordance is the OWNER'S, like every other edit on this slip. */
  isOwner: boolean;
  /**
   * S6 / S7 — WHERE THIS PLAN GOES, AND WHICH ZONE ITS TIMES ARE READ IN, resolved ONCE by the
   * caller (ledger `2026-09-06-slip-conformance`) and handed to the two surfaces that state them:
   * this header, and the rail's Plan card "Stops & timezone" row. Both lines are §13 rules first
   * (see `@/lib/slip-meta`): the stops line falls back EXPLICITLY to `trips.destination` when the
   * plan has no `trip_destinations` rows (Locked Decision 34 — no backfill, so that is every
   * legacy plan and the absence is not an error), and the zone line is OMITTED ENTIRELY when
   * `trips.timezone` is unset (Locked Decision 30 — never UTC, never the server's zone, never a
   * guess). Neither derives a distance, a duration or a route: the arrow is an ORDER (Locked
   * Decision 22(c)). `null` on either means the line does not render at all.
   */
  stopsLine: string | null;
  zoneLine: string | null;
  /**
   * S6 — opens the ONE plan modal, whose step 2 IS the ordered stop-list editor. Deliberately a
   * callback rather than an editor of its own: Locked Decision 34 gives the client ONE stop writer
   * (`plan-stops-writer.ts`), and the modal's step 2 is its ONE editing surface. A second list
   * editor here would be a second caller of that writer with its own read-before-replace, which is
   * exactly the mistake the replace-list contract warns about (a caller that sends a list it did
   * not first read silently drops stops it never saw).
   */
  onEditStops: () => void;
  /**
   * RC-12 (ledger `2026-09-25-rc12-party-size`): set only when the plan states NO party and the
   * viewer is the OWNER. Renders "Who's coming?" where the count would be, opening the one plan
   * modal on step 4 of THIS plan. Absent ⇒ nothing renders (a non-owner is never asked, D16).
   */
  onAskParty?: () => void;
}) {
  const trip = data.trip;
  const start = safeDate(trip?.startDate);
  const end = safeDate(trip?.endDate);
  const phase = derivePhase(start, end);

  return (
    <div className="space-y-1.5" data-testid="slip-header">
      {expertControl ? <div className="flex justify-end">{expertControl}</div> : null}
      {occasionName ? (
        <p
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
          data-testid="slip-occasion-name"
        >
          Your plan · {occasionName}
        </p>
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        {/* ── NO SLIP NUMBER AND NO VERSION ON THE WORKING HEADER ─────────────────────────────
            Ledger `2026-09-06-slip-conformance`; the ratified `header()` artboard says it in one
            line: "No slip number and no version: neither exists on a plan (a version exists only
            once it is final)."

            `slip-tracking-ref` used to print "Slip TRV-000123 · v7" here, where `v7` was
            `planVersion` — the item-transition-log ROW COUNT, which ticks every time anything
            moves. Read at the top of a working plan it looks like a released version of the plan,
            and it is not one: the only version a traveler can hold is the FINALIZED Trip Card's,
            and that one still renders — on the finished card, as `slip-final-version-chip`, from
            the server's own `trip.finalVersion` (see `TripCardPrimaryBanner`). One version number,
            in the one place where a version actually exists (§13).

            The tracking number itself is not deleted from the DTO and is not gone from the
            platform — `PlanSlipStrip` still prints it on the dashboard, where it is an identifier
            for finding a plan rather than a claim about its state. The transition log's own
            per-entry `v<n>` is likewise untouched: there it labels a row in a history, which is
            exactly what the count is. */}
        {phase && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border border-border text-muted-foreground"
            data-testid="slip-phase-chip"
          >
            <CalendarDays className="w-3 h-3" />
            {PHASE_LABELS[phase]}
          </span>
        )}
        {/* THE PRIVATE-PLAN BADGE (re-audit A21). Share and the guest surface are already
            correctly ABSENT under a hidden occasion — hidden, never disabled — but the absence
            said nothing, so a traveler could only read it as something missing. This is the
            positive signal, gated on the SAME `isHidden` the two absences are, so the badge and
            the behaviour can never disagree (§18 rule 1). §13 keeps its own direction here: an
            unresolved occasion or a NULL column is NOT hidden, so an undecided plan is never
            labelled private. */}
        {isHidden && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border border-border text-muted-foreground"
            data-testid="slip-private-badge"
            title="Share and the guest list are off for this plan"
          >
            <EyeOff className="w-3 h-3" /> private plan
          </span>
        )}
        {/* Spec B: OptimizedBadge — only when a REAL variant_applied diary row exists. */}
        {hasOptimized && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
            style={tintPillStyle(OPTIMIZED_TINT)}
            data-testid="slip-optimized-badge"
          >
            <Sparkles className="w-3 h-3" /> optimized
          </span>
        )}
        {/* LD 41 (ledger `2026-09-05-comparison-map-baseline-compare`): the board stays
            REVISITABLE after an adopt (adopt-finalize-conform D-4 removed the losing-variant
            discard), so the optimized state links back to it. The id is read STRAIGHT OFF this
            DTO (`lastComparisonId`, present only when a comparison row exists) — no surface
            fetches the user's comparisons to work out which board this was. Absent id ⇒ NO LINK
            (§13): a link to a board we cannot name is worse than none. */}
        {/* Smoke 10 S10-2: once a run exists the slip links to its versions board as "Compare
            versions" — whether or not a version was applied yet. */}
        {data.lastComparisonId && (
          <Link
            href={`/itinerary-comparison/${data.lastComparisonId}`}
            className="text-[10px] font-semibold underline underline-offset-2 text-muted-foreground hover:text-foreground"
            data-testid="slip-see-what-changed"
          >
            Compare versions
          </Link>
        )}
      </div>
      <h1
        className={`${SLIP_TITLE_FONT_CLASS} text-[30px] font-semibold leading-[1.1] tracking-[-0.01em] text-[color:var(--slip-ink)]`}
        data-testid="slip-title"
      >
        {trip?.title || trip?.destination || "Trip plan"}
      </h1>
      {readyMadeSourceLine(data.readyMadeSource) ? (
        <p className="text-xs text-muted-foreground" data-testid="slip-ready-made-source">
          {readyMadeSourceLine(data.readyMadeSource)}
          {legsCheckedLine(data.readyMadeSource, (trip as any)?.timezone ?? null) ? ` · ${legsCheckedLine(data.readyMadeSource, (trip as any)?.timezone ?? null)}` : ""}
        </p>
      ) : null}
      <SlipHeaderMeta
        tripId={trip?.id ?? ""}
        startDate={trip?.startDate ?? null}
        endDate={trip?.endDate ?? null}
        datesConfirmed={(trip as any)?.datesConfirmed}
        isOwner={isOwner}
        partyLabel={partyLabel}
        onAskParty={onAskParty}
        eventCount={eventCount}
        timezone={(trip as any)?.timezone ?? null}
        daySpan={daySpan}
      />
      {anchorLine ? (
        <p className="text-sm text-foreground" data-testid="slip-anchor-state">
          {anchorLine}
        </p>
      ) : null}
      {/* ── S6 · THE STOPS LINE, and S7 · THE ZONE LINE — the ratified header's third row ───────
          "Kyoto → Osaka  |  Times shown in Asia/Tokyo  ·  Edit ›". Three independent renders, and
          each absence is its own finished answer (§13):
            · NO STOPS LINE AT ALL only when the plan names nowhere, which `trips.destination`
              being NOT NULL makes impossible for a loaded plan — so in practice this always says
              at least the headline destination, and never an empty arrow-joined string.
            · NO ZONE LINE when `trips.timezone` is unset. The separator goes with it, so the row
              does not render a dangling rule (Locked Decision 30).
            · NO EDIT LINK for a non-owner (D16), and it OPENS THE ONE PLAN MODAL rather than
              mounting a second stop editor (Locked Decision 34's one-writer rule). */}
      {(stopsLine || zoneLine) && (
        <div
          className="flex items-center gap-2.5 flex-wrap text-xs text-muted-foreground"
          data-testid="slip-meta-place"
        >
          {stopsLine && (
            <span className="font-mono text-foreground" data-testid="slip-meta-stops">
              {stopsLine}
            </span>
          )}
          {stopsLine && zoneLine && <span className="text-border" aria-hidden="true">|</span>}
          {zoneLine && (
            <span className="font-mono" data-testid="slip-meta-timezone">
              {zoneLine}
            </span>
          )}
          {isOwner && (
            <button
              type="button"
              onClick={onEditStops}
              className="underline underline-offset-2 hover:text-foreground"
              data-testid="slip-meta-stops-edit"
            >
              Edit ›
            </button>
          )}
        </div>
      )}
      {/* LD 41 (c) — THE FREE DRAFT IS A SKETCH, SAID OUT LOUD. Nothing on the slip previously
          told a traveler that the plan in front of them was an AI first pass rather than a
          researched one, so the free draft and a delivered plan read identically. Rendered ONLY
          when the server says every item is still an untouched draft row (`data.aiSketch`) —
          absent/false renders nothing at all, never the inverse claim that the plan is
          hand-built (§13). It states what the draft IS (one version, no live prices) and what
          Optimize does; it makes no claim about which model wrote it, because the tier is a cost
          decision and never a product claim. */}
      {data.aiSketch === true && sketchLine ? (
        // The Moment board: a chip and a line, in place of the sentence.
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-[color:var(--slip-muted)]" data-testid="slip-ai-sketch-note">
          <span className="inline-flex items-center rounded-[var(--slip-radius-chip)] bg-[color:var(--slip-wash)] px-2.5 py-1 font-medium text-[color:var(--slip-navy)]">
            AI starting sketch
          </span>
          <span>{sketchLine}</span>
        </p>
      ) : data.aiSketch === true ? (
        <p className="text-xs text-muted-foreground" data-testid="slip-ai-sketch-note">
          <Sparkles className="w-3 h-3 inline mr-1" />
          This is an AI starting sketch — one version, without live prices. Optimize builds three
          proposals around it, anchored to what you have already booked.
        </p>
      ) : null}
    </div>
  );
}

// ── SlipStatusStrip ────────────────────────────────────────────────────────────────────

function SlipStatusStrip({ activities }: { activities: PlanCardActivity[] }) {
  const counts: Record<RoutingStatus, number> = {
    in_planning: 0,
    with_expert: 0,
    ready_for_checkout: 0,
    purchased: 0,
  };
  for (const a of activities) {
    // R154: the ONE routing-bucket reading — a disputed booking is purchased (it is a real booking),
    // a failed payment is back in checkout, and a not-booked link on a `purchased` item is nowhere.
    const rs = effectiveRoutingStatus(a) as RoutingStatus | null;
    if (rs && rs in counts) counts[rs]++;
  }

  const allSegments: Array<{ status: RoutingStatus; n: number; label: string }> = [
    { status: "in_planning", n: counts.in_planning, label: "planning" },
    { status: "with_expert", n: counts.with_expert, label: "with expert" },
    { status: "ready_for_checkout", n: counts.ready_for_checkout, label: "in checkout" },
    { status: "purchased", n: counts.purchased, label: "purchased" },
  ];
  const segments = allSegments.filter((s) => s.n > 0); // omit zero-count segments

  if (segments.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm flex-wrap" data-testid="slip-status-strip">
      {segments.map((s, i) => {
        const tint = ROUTING_TINTS[s.status];
        return (
          <span key={s.status} className="inline-flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/60">·</span>}
            <span
              className={tint.fg ? "font-semibold" : "font-semibold text-muted-foreground"}
              style={tint.fg ? { color: tint.fg } : undefined}
              data-testid={`slip-count-${s.status}`}
            >
              {s.n} {s.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ── Item rows (surface spec v1.2 step 1, ledger `2026-10-03-surface-step1-item-row`) ──────────
//
// The slip renders `DayBlock`s of `ItemRow`s (`@/components/plan`). What LEFT the row in step 1: the
// three status pills (routing · kind · origin), the per-item "Add to checkout"/"Send to expert"
// routing actions (R-l — the draft is a plan, not a basket), the "Build my days around this" link
// under the row (now a ⋯ entry), and `SlipItemTools`' second copy of the row (edit/move/delete are ⋯
// entries over the SAME rails, via `useSlipItemActions`). `ExpertNoteBlock` became `ExpertNote`.

// The row's booking line moved to `@/lib/item-booking-state` (step 6) so the Trip Card reads the SAME
// rule without importing the slip; re-exported here for the slip's existing readers (§18 rule 1).
export { slipItemBookingLine } from "@/lib/item-booking-state";

/** R-ah — the owner's "Keep this" / "Unlock" (`PUT …/lock`, `.strict()` `{ locked }`). */
function useToggleItemLock(tripId: string, itemId: string, locked: boolean): () => void {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/trips/${tripId}/itinerary-items/${itemId}/lock`, { locked: !locked })).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      toast({ title: locked ? "Unlocked" : "Kept — Optimize and redrafts will leave this in place" });
    },
    onError: () => toast({ title: "Couldn't change the lock", variant: "destructive" }),
  });
  return () => {
    if (!m.isPending) m.mutate();
  };
}

/** The Main board puts a leg in the row grid's stop column (ledger `2026-10-08-slip-main-rows`):
 *  past the 52px time column and the dot rail, short of the ⋯ column. Nothing is wrapped when the
 *  caller has no leg to draw. */
function BoardLegSlot({ children }: { children: ReactNode }) {
  if (children == null || children === false) return null;
  return <div className="pl-[102px] pr-4 pb-1">{children}</div>;
}

function SlipDayItem({
  tripId,
  activity,
  city,
  isOwner,
  canEditItems,
  isExpertViewer,
  hasAdvisor,
  expertName,
  anchorFrom,
  travel = null,
  onAddFlight,
  highlighted,
  rowRef,
  dayNumber,
  dayItemIds,
  groupItemIds,
  promotable = false,
  canSetAsStay = false,
  replacingStay = null,
  facts,
  dateIso = null,
  timeZone = null,
  checkingHours = false,
  onOpenExpertDoor,
  onFindHost,
  savedQuestion = null,
  savedCity = null,
  detailsRequest = 0,
}: {
  tripId: string;
  activity: PlanCardActivity;
  /** The plan's destination — what "a generic item" is read against (`findHostHref`). */
  city: string | null;
  facts?: FactView[];
  checkingHours?: boolean;
  dateIso?: string | null;
  /** S9-6: the plan's zone (`trips.timezone`) for the facts line's "checked" day; null ⇒ the UTC day. */
  timeZone?: string | null;
  /** M8 (A3b): this located, dated row may become what the plan is built around — decided by the caller. */
  promotable?: boolean;
  /** S9-2 amendment: a hand-added lodging row on a plan with no lodging set — decided by the caller. */
  canSetAsStay?: boolean;
  /** S10-6: the plan's current stay, by name — "Set as where you're staying" then confirms the swap. */
  replacingStay?: string | null;
  isOwner: boolean;
  /** LD 52 (C): the owner's item tools, shared with the delegate (`canEditPlanItems`). */
  canEditItems: boolean;
  isExpertViewer: boolean;
  /** S3 — an advisor in a §12 access status is on this plan (resolved once by `SlipView`). */
  hasAdvisor: boolean;
  expertName: string | null;
  /** Non-null ⇒ this row is a fixed point, fixed by that tool (`anchorFromTool`). */
  anchorFrom: string | null;
  /** Step 2 addendum: this AI item IS the day's arrival/departure row; `flight` is the plan's, if entered. */
  travel?: { kind: "arrival" | "departure"; flight: FlightAnchorView | null } | null;
  onAddFlight?: () => void;
  highlighted: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  dayNumber: number | null;
  dayItemIds: readonly string[];
  groupItemIds: readonly string[];
  /** R-m: "Ask a local about this" with no advisor on the plan opens the expert door. */
  onOpenExpertDoor: () => void;
  /** Step 5: "Find a host" opens the slip map's Browse layer filtered to this category (null = all). */
  onFindHost?: (categoryKey: string | null) => void;
  /** Smoke 7 item 4: the viewer's saved question on this item, if any, and the plan's market city. */
  savedQuestion?: { question: string | null } | null;
  savedCity?: string | null;
  /** R321 (S11-4): a change in this number opens the row's `ItemSheet` (the day photo's tap). */
  detailsRequest?: number;
}) {
  const a = activity;
  const [askSignal, setAskSignal] = useState(0);
  const [askLocalOpen, setAskLocalOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const askLocal = async () => {
    // R-r: one read (the door's own overview, shared cache) decides door vs. recorded interest.
    try {
      const overview = await queryClient.fetchQuery<{ levels: { expertCount: number }[] }>({
        queryKey: [`/api/trips/${tripId}/expert-help`],
      });
      if (anyLocalLive(overview)) return onOpenExpertDoor();
    } catch {
      /* no answer ⇒ ask the question here; nothing is charged either way */
    }
    setAskLocalOpen(true);
  };
  // D16 — the money rules of the ratified `ItemRow` artboard, decided by the ONE shared predicate the
  // DELETE rail refuses on: a paid row carries no tools, a booked row keeps reorder and edit, loses ✕.
  const tools = slipItemTools({
    isOwner: canEditItems,
    routingStatus: a.routingStatus ?? null,
    bookingId: a.booking?.id ?? null,
  });
  const actions = useSlipItemActions({ tripId, itemId: a.id, tools, dayNumber, dayItemIds, groupItemIds });
  const promote = usePromoteAnchor(tripId, a.id);
  const setAsStay = useSetAsStay(tripId, a.id);
  const [confirmStay, setConfirmStay] = useState(false);
  const toggleLock = useToggleItemLock(tripId, a.id, !!a.locked);
  // Step 6 R-ap: the stop's ItemSheet — title tap, ⋯ → Details. Its photo is read only while open.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (detailsRequest > 0) setSheetOpen(true);
  }, [detailsRequest]);
  const sheetPhotos = usePlacePhotos(tripId, sheetOpen ? [a.id] : []);
  const showThread = hasAdvisor && (isOwner || isExpertViewer);
  const menu: ItemRowMenu | null = canEditItems
    ? {
        onDetails: () => setSheetOpen(true),
        onSwap: actions.onSwap,
        onMoveUp: actions.onMoveUp,
        onMoveDown: actions.onMoveDown,
        onRemove: actions.onRemove,
        // R-ah: the lock is the OWNER's instruction to every machine rewrite.
        onToggleLock: isOwner ? toggleLock : undefined,
        // R-m: an advisor on the plan ⇒ the item's own thread; none ⇒ the expert door, which opens
        // whether or not any expert serves the market (the door says so itself). Owner only — the
        // door is the owner's to open.
        onAskLocal: hasAdvisor
          ? () => setAskSignal((n) => n + 1)
          : savedQuestion
            ? () => setQuestionOpen((v) => !v)
            : isOwner
              ? () => void askLocal()
              : undefined,
        askLocalSaved: !hasAdvisor && !!savedQuestion,
        findHostHref: findHostHref({ name: a.name, type: a.type, locationName: a.location }, { city, tripId }),
        onFindHost: onFindHost ? () => onFindHost(findHostCategory(a.type)) : undefined,
        onBuildAround: promotable ? promote : undefined,
        onSetAsStay: canSetAsStay ? (replacingStay ? () => setConfirmStay(true) : setAsStay) : undefined,
        // R323 (step 7b): the ONE handoff door, with this stop ticked. Owner only — the ask is theirs.
        onBookForMe: isOwner ? () => openHandoffChooser({ kind: "book", itemIds: [a.id] }) : undefined,
      }
    : null;
  // R323 (§12 step 3): an expert's change to this stop arrives as a suggestion ON the row.
  const { data: suggestionData } = useExpertSuggestions(tripId, hasAdvisor && (isOwner || isExpertViewer));
  return (
    <ItemRow
      item={a}
      facts={facts}
      dateIso={dateIso}
      timeZone={timeZone}
      mode={canEditItems ? "edit" : "read"}
      role={isExpertViewer ? "expert" : "traveler"}
      bookingState={slipItemBookingLine(a)}
      anchor={
        anchorFrom
          ? { fromTool: anchorFrom }
          : travel
            ? travel.flight
              ? {
                  fromTool: GETTING_THERE_TOOL,
                  time: travel.flight.time,
                  detail: flightRowText(travel.flight),
                  title: travelRowTitle(travel.kind, city),
                }
              : {
                  fromTool: null,
                  action: onAddFlight ? { label: TRAVEL_ANCHOR_WORDS.addFlight, onClick: onAddFlight } : null,
                  title: travelRowTitle(travel.kind, city),
                }
            : null
      }
      checkingHours={checkingHours}
      menu={menu}
      highlighted={highlighted}
      rowRef={rowRef}
      bookingAction={
        // R154: the owner's one action on a disputed (View booking) or failed (Try again) row.
        isOwner && itemBookingAction(a) ? <ItemBookingActionLink tripId={tripId} activity={a} showNote={false} /> : null
      }
      expertNote={a.expertNote ? { note: a.expertNote, author: expertName } : null}
      onOpenDetails={() => setSheetOpen(true)}
    >
      {suggestionData?.suggestions?.length ? (
        <SuggestionStrip tripId={tripId} itemId={a.id} suggestions={suggestionData.suggestions} canAnswer={isOwner} />
      ) : null}
      <ItemSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={{ id: a.id, name: anchorFrom || !travel ? a.name : travelRowTitle(travel.kind, city) ?? a.name, time: a.time, location: a.location }}
        facts={facts}
        timeZone={timeZone}
        photo={sheetPhotos[a.id] ?? null}
        expertNote={a.expertNote ? { note: a.expertNote, author: expertName } : null}
        onAskLocal={menu?.onAskLocal ? () => { setSheetOpen(false); menu.onAskLocal!(); } : null}
        askLocalLabel={menu?.askLocalSaved ? ITEM_MENU_LABELS.seeQuestion : ITEM_MENU_LABELS.askLocal}
        navigateHref={navigateHref({ name: a.name, lat: a.lat ?? null, lng: a.lng ?? null }, city)}
        bookingLine={slipItemBookingLine(a)}
        bookingAction={
          isOwner && itemBookingAction(a) ? (
            <ItemBookingActionLink tripId={tripId} activity={a} showNote={false} />
          ) : isOwner && !a.booking?.id ? (
            // R323 (step 7b, §12 step 1): "Book this for me" opens the ONE handoff chooser.
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSheetOpen(false);
                openHandoffChooser({ kind: "book", itemIds: [a.id] });
              }}
              data-testid={`item-sheet-book-for-me-${a.id}`}
            >
              {ITEM_MENU_LABELS.bookForMe}
            </Button>
          ) : null
        }
      />
      {/* S10-6: replacing the plan's stay is confirmed by name first; the SAME stay row is rewritten. */}
      {confirmStay && replacingStay ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-border bg-muted/40 px-2 py-1.5 text-xs" data-testid={`item-set-as-stay-confirm-${a.id}`}>
          <span>{replaceStayQuestion(replacingStay, a.name)}</span>
          <Button size="sm" className="h-7" onClick={() => { setConfirmStay(false); setAsStay(); }} data-testid={`item-set-as-stay-confirm-yes-${a.id}`}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmStay(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {/* S3 — "Ask your expert about this": the EXISTING per-item thread (`ItemComments`), drawn only
          when there is somebody to ask, for the two people on the conversation. No count (§13). */}
      {showThread && (
        <ItemComments
          tripId={tripId}
          itemId={a.id}
          className="mt-2"
          label={SLIP_ASK_EXPERT_LABEL}
          hideCount
          openSignal={askSignal}
        />
      )}
      {savedQuestion && !hasAdvisor ? (
        <div className="mt-1" data-testid={`item-ask-local-standing-${a.id}`}>
          <p className="text-xs text-muted-foreground">{ASK_LOCAL_WORDS.savedRow(savedCity)}</p>
          {questionOpen ? (
            <p className="mt-1 text-xs" data-testid={`item-ask-local-question-${a.id}`}>
              <span className="text-muted-foreground">{ASK_LOCAL_WORDS.yourQuestion}: </span>
              {savedQuestion.question ?? ""}
            </p>
          ) : null}
        </div>
      ) : askLocalOpen ? (
        <ItemAskLocalPanel tripId={tripId} itemId={a.id} onClose={() => setAskLocalOpen(false)} />
      ) : null}
      {actions.panel}
    </ItemRow>
  );
}

/**
 * THE EVENT HEADER'S ADVISOR STANDING (ledger `2026-09-04-hire-from-slip`; clause (c) of
 * `2026-09-04-slip-precondition`; D6 as landed by `2026-09-06-slip-conformance`).
 *
 * ── WHAT D6 MOVED, AND WHAT STAYED ────────────────────────────────────────────────────────────
 * This component used to have TWO states: the advisor's standing when one exists, and a "Hire an
 * expert" button when none does — a button that opened the plan-level EXPERT picker from an EVENT
 * header. Locked Decision 42's D6 rules that the two role questions are different questions with
 * different catalogs: "who plans this WITH me" is PLAN-level and its answer is the ONE expert
 * picker, which now lives only in the rail's Build card ("Hand off to a local expert"); "who do I
 * HIRE for this event" is EVENT-level and its answer is `experience_types.roles_needed` — the
 * PROVIDER catalog — which `EventRoleChips` below draws.
 *
 * So the BUTTON is gone from here and the STANDING stays, unchanged and in the same words. The
 * picker itself (`HireExpertDialog`) is untouched and still mounted, once, by the rail.
 *
 * IT SAYS "THIS PLAN", NOT "THIS EVENT", ON PURPOSE. `trip_expert_advisors` is keyed
 * (trip, expert) and has no event column - this lane did not add one - so the row that exists is
 * a PLAN-level advisor. The sentence never claims an expert belongs to the event. Where several
 * experts are on one plan the reader now returns ALL of them (Locked Decision 42 D7, ledger
 * `2026-09-07-all-advisors-reader`) and this line DELIBERATELY states the standing of the first —
 * the most recently assigned — because an event header is one line and a roll-call of advisors
 * belongs on the rail's Expert card, which names them. The pick is named here rather than taken
 * silently as `[0]`; the complete list is `advisors` on the same response.
 *
 * §13 — NO ADVISOR ⇒ NOTHING RENDERS. Not a greyed control, not "no expert yet": with the hire
 * button moved, an event header on a plan nobody is advising has nothing true to say here, and
 * the rail's Build card is where that absence is answered.
 */
function EventAdvisorStanding({ tripId, event }: { tripId: string; event: PlanEvent }) {
  // The owner-gated advisor read the rail's Build card already uses - one endpoint, one cache
  // entry, no second query shape for the same fact.
  const { data } = useQuery<{ advisor: SlipRailAdvisor | null }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled: !!tripId,
  });
  // THE ONE SENTENCE, shared with the rail's Expert card (`slipAdvisorStandingLine`). Written
  // inline here it was a second copy waiting to happen the moment the rail said the same thing
  // (§18 rule 1); the module owns the wording, the fallbacks and the no-ETA rule.
  const label = slipAdvisorStandingLine(data?.advisor ?? null);
  if (!label) return null;
  return (
    <p className="mt-1 text-[11px] text-muted-foreground" data-testid={`slip-event-advisor-${event.id}`}>
      {label}
    </p>
  );
}

/**
 * D6 · THE EVENT'S ROLE CHIPS — "who do I HIRE for this event" (ledger
 * `2026-09-06-slip-conformance`; CLAUDE.md Locked Decision 42 D6, Locked Decision 31).
 *
 * One chip per `experience_types.roles_needed` key on THIS event, each opening the EXISTING
 * marketplace browse pre-filtered to that `service_categories.category_key` and carrying this
 * plan's id, so Add to plan lands on the Locked Decision 39 rail (`itinerary_items`). No new
 * catalog, no new table, no new browse: D6's whole point is that both halves already exist.
 *
 * WHERE EVERY PART COMES FROM, so nothing here is a second copy (§18 rule 1):
 *  · the KEYS and the HREFS — `@/lib/slip-event-roles`, which also states why NULL draws nothing.
 *  · the LABEL for a key — `roleLabel` in `@/lib/hire-from-slip`, the ONE place a category key
 *    becomes words, shared with the expert picker's own chips.
 *  · the CATEGORY ROWS — the same public `/api/service-categories` read the picker uses, so
 *    react-query serves both from ONE cache entry and ONE request.
 *
 * §13 — `rolesNeeded` NULL / absent / empty ⇒ THIS RENDERS NOTHING AT ALL. Locked Decision 31 is
 * explicit that NULL means NOT SET and never "this occasion needs nobody", which is a claim only a
 * planner can make; and it declined to make `[]` a second empty state, so both are answered the
 * same silent way. Nothing is reconstructed from the event's title or its occasion's slug, and a
 * chip names a DISCIPLINE — it makes no claim that anyone is listed in it here.
 */
function EventRoleChips({ tripId, event }: { tripId: string; event: PlanEvent }) {
  const chips = slipEventRoleChips(event.rolesNeeded, tripId);
  // Fetched only when there is something to label. The picker's own read shares this cache entry.
  const { data: categories } = useQuery<HireRoleCategory[]>({
    queryKey: ["/api/service-categories"],
    enabled: chips.length > 0,
    staleTime: 10 * 60_000,
  });
  if (chips.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid={`slip-event-roles-${event.id}`}>
      {/* The verb, once, so a row of bare nouns is not mistaken for a list of who is booked. */}
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">browse</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted/40"
          data-testid={`slip-event-role-${event.id}-${chip.key}`}
        >
          {roleLabel(chip.key, categories)}
        </Link>
      ))}
    </span>
  );
}

/**
 * THE EVENT'S TIME, EDITED WHERE IT IS READ (ledger `2026-09-04-event-time-ui`; migration 282,
 * CLAUDE.md Locked Decision 35).
 *
 * Owner-only, and deliberately the smallest thing that works: a time input that PATCHes the
 * EXISTING owner-scoped `/api/user-experiences/:id` with `{ startTime }` and nothing else. No new
 * route was opened for it — `startTime` already rides the pick-based allowlist that route's POST
 * and PATCH share (`userExperienceBodySchema`), narrowed by the ONE format authority
 * `userExperienceStartTimeSchema` (§19; a second admission rail for one column is exactly what
 * that posture exists to prevent).
 *
 * THE THREE THINGS IT MAY NOT DO (§13):
 *  - it never SHOWS a time the row does not have. An empty control is an event with no time set,
 *    which is a real answer — not midnight, not "all day", not the plan's main moment standing in.
 *  - CLEARING is a first-class action: an explicit `null` is how a traveler takes back a time they
 *    set, which is why `userExperienceStartTimeSchema` is `.nullable()` and why an emptied input
 *    sends null rather than omitting the key.
 *  - it says NOTHING about the zone. The value is a wall clock read in the plan's `trips.timezone`
 *    (ruling 30), and where that is NULL the time is honestly zone-less — a "local time" label
 *    here would be a claim this component cannot check.
 *
 * The event heading is where the time is READ, so it is where it is written: the slip is what the
 * step-5 copy points at ("change any of them now or later from the slip").
 */
function EventTimeAffordance({ tripId, event }: { tripId: string; event: PlanEvent }) {
  const { toast } = useToast();
  const [value, setValue] = useState(event.startTime ?? "");
  // The row is the truth; a re-fetch that changes it (another tab, an expert) wins over a stale
  // local echo. Keyed on the id too, so a remounted header for a DIFFERENT event never inherits
  // the previous one's draft.
  useEffect(() => setValue(event.startTime ?? ""), [event.id, event.startTime]);

  const save = useMutation({
    mutationFn: (startTime: string | null) =>
      apiRequest("PATCH", `/api/user-experiences/${event.id}`, { startTime }),
    onSuccess: () => {
      // Both readers of this row: the plancard payload carries `events[]`, the user-scoped list
      // feeds the "Which event?" picker. Refreshing one and not the other is how two surfaces of
      // one plan start disagreeing about the same event.
      void queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: () => {
      setValue(event.startTime ?? "");
      toast({ title: "Could not save that time", variant: "destructive" });
    },
  });

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === (event.startTime ?? "")) return;
    // Empty ⇒ an EXPLICIT null (cleared), never an omitted key (which means "not mentioned").
    if (!trimmed) return void save.mutate(null);
    if (!/^\d{2}:\d{2}$/.test(trimmed)) return;
    save.mutate(trimmed);
  };

  return (
    <input
      type="time"
      value={value}
      disabled={save.isPending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      aria-label={`Start time${event.title ? ` for ${event.title}` : ""}`}
      className="mt-1 h-6 rounded border border-border bg-transparent px-1 text-[11px] text-muted-foreground disabled:opacity-50"
      data-testid={`slip-event-time-${event.id}`}
    />
  );
}

/**
 * THE EVENT'S BUDGET, EDITED WHERE IT IS READ (ledger `2026-09-04-event-budget`; CLAUDE.md Locked
 * Decision 29). The sibling of `EventTimeAffordance` above, and deliberately built to the same
 * shape: owner-only, one field, PATCHing the EXISTING owner-scoped `/api/user-experiences/:id`
 * with `{ budget }` and nothing else. No new route and no second admission rail — `budget` already
 * rides the pick-based allowlist that route's POST and PATCH share (`userExperienceBodySchema`),
 * narrowed by the ONE shape authority `userExperienceBudgetSchema` (§19).
 *
 * WHY THE BUDGET IS ASKED HERE AND NOT AT INTAKE. Step 5 of the planning modal does NOT ask for a
 * budget: at intake the events do not exist yet, and a single number typed before them would be a
 * PLAN-level budget — the second stored number this lane exists to avoid. The question is asked
 * once there is an event to attach it to.
 *
 * THE THINGS IT MAY NOT DO (§13):
 *  - it never SHOWS a number the row does not have. An empty control is an event with no budget
 *    stated, which is a real answer — not 0, not "free", not the plan's total divided up.
 *  - CLEARING is a first-class action: an explicit `null` is how a traveler takes back a budget
 *    they stated, which is why the shape authority is `.nullable()` and why an emptied input sends
 *    null rather than omitting the key.
 *  - it makes no claim about what anything COSTS. This is the traveler's stated intention; it is
 *    read by no charge, fee, payout or rate path (§14), and the slip's own cost lines are a
 *    different fact from a different source.
 */
function EventBudgetAffordance({ tripId, event }: { tripId: string; event: PlanEvent }) {
  const { toast } = useToast();
  // The ONE parse of a stored budget, shared with the plan total — a second reading of the same
  // column here is how the field and the total would start disagreeing (§18 rule 1).
  const stored = statedEventBudget(event.budget);
  const [value, setValue] = useState(stored === null ? "" : String(stored));
  // The row is the truth; a re-fetch wins over a stale local echo. Keyed on the id too, so a
  // remounted header for a DIFFERENT event never inherits the previous one's draft.
  useEffect(() => {
    const next = statedEventBudget(event.budget);
    setValue(next === null ? "" : String(next));
  }, [event.id, event.budget]);

  const save = useMutation({
    mutationFn: (budget: number | null) =>
      apiRequest("PATCH", `/api/user-experiences/${event.id}`, { budget }),
    onSuccess: () => {
      // Both readers of this row: the plancard payload carries `events[]` (which is what the plan
      // total is derived from), the user-scoped list feeds the "Which event?" picker.
      void queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: () => {
      const current = statedEventBudget(event.budget);
      setValue(current === null ? "" : String(current));
      toast({ title: "Could not save that budget", variant: "destructive" });
    },
  });

  const commit = (next: string) => {
    const trimmed = next.trim();
    const current = statedEventBudget(event.budget);
    // Empty ⇒ an EXPLICIT null (cleared), never an omitted key (which means "not mentioned").
    if (!trimmed) {
      if (current === null) return;
      return void save.mutate(null);
    }
    const parsed = Number(trimmed);
    // The server refuses these too — this only avoids a round-trip that would be rejected, and is
    // NOT a second authority on the shape: it invents no bound the schema does not already state.
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValue(current === null ? "" : String(current));
      return;
    }
    if (current !== null && parsed === current) return;
    save.mutate(parsed);
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      value={value}
      disabled={save.isPending}
      placeholder="Budget"
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      aria-label={`Budget${event.title ? ` for ${event.title}` : ""}`}
      className="mt-1 h-6 w-24 rounded border border-border bg-transparent px-1 text-[11px] text-muted-foreground disabled:opacity-50"
      data-testid={`slip-event-budget-${event.id}`}
    />
  );
}

/**
 * One EVENT inside the day (migration 277; ledger `2026-09-04-slip-events`). A bordered inset
 * around the items that name this `user_experiences` row — the same inset grammar
 * `ExpertNoteBlock` uses, drawn from theme tokens so it follows light/dark like everything else.
 *
 * WHAT IT MAY SAY, and what it may not (§13):
 *  - the event's TITLE when the row has one. A row with no title gets no title line — never an
 *    "Untitled event", which is a name nobody wrote.
 *  - its DAY, its TIME and its PLACE when set, through the ONE shared `eventMetaLine`. The time
 *    reads `user_experiences.start_time` (migration 282, ledger `2026-09-04-event-time-ui`) and
 *    NOTHING else — never `event_date`, which is a DATE column, and never a default: a row with no
 *    time set shows its day and no clock, exactly as every row did before that column existed.
 *  - nothing else. An event that has told us nothing renders as a bare inset: the grouping is
 *    still true (these items belong together), and no label is invented to decorate it.
 *
 * The plan's ONE implicit unnamed event never reaches this component — it renders as a bare
 * Fragment, with no heading at all (see `groupItemsByEvent`).
 */
function SlipEventGroupBlock({
  event,
  tripId,
  isOwner,
  addDayNumber,
  children,
}: {
  event: PlanEvent;
  tripId: string;
  // `destination` is GONE from this block (ledger `2026-09-06-slip-conformance`): it existed only
  // to seed the plan-level expert picker that D6 moved to the rail's Build card. The event's own
  // role chips need no destination — they open the PROVIDER browse by category key.
  isOwner: boolean;
  /**
   * S1 — the day a "+ Add something to this event" row would land on, already resolved by the
   * caller (`resolveAddDayNumber`). `null` means the plan has not told us one, and the control is
   * replaced by the reason rather than filing the item on a day nobody chose (§13).
   */
  addDayNumber: number | null;
  children: ReactNode;
}) {
  // ONE derivation, shared with the "Which event?" picker (ledger `2026-09-04-which-event-picker`):
  // date-when-set · place-when-set, and never a clock time. Restating it here is the drift class
  // §18 rule 1 names — and the second copy is exactly where a fabricated start time gets written.
  // SHORT form (re-audit A18): the DAY HEADING directly above this block already names the
  // calendar date, so repeating it here read as two different facts about the same row. Same ONE
  // derivation the "Which event?" picker calls, with the same option.
  const meta = eventMetaLine(event, { format: "short" });
  // The hire affordance is an owner-only planning action, so an event with neither a title nor a
  // meta line still gets a header for the owner — and still gets NO invented label (§13).
  const hasHeader = !!event.title || !!meta || isOwner;
  return (
    <section
      className="my-2 rounded-lg border border-border bg-muted/20"
      aria-label={event.title || undefined}
      data-testid={`slip-event-${event.id}`}
    >
      {hasHeader && (
        <header className="px-3 pt-2 pb-0.5">
          {event.title && (
            <p className="text-sm font-semibold text-foreground" data-testid={`slip-event-title-${event.id}`}>
              {event.title}
            </p>
          )}
          {meta && (
            <p className="text-[11px] text-muted-foreground" data-testid={`slip-event-meta-${event.id}`}>
              {meta}
            </p>
          )}
          {/* "58 attending" (re-audit A19). `user_experiences.guest_count` has ridden the plancard
              payload since the events array landed and no surface printed it, so a host's own
              headcount was collected and never read back.
              §13 — OMITTED WHEN NULL, and never "0 attending": a count nobody entered is an
              unanswered question, not an empty room, and the two render identically once a zero is
              printed. A stored zero is likewise not shown, for the same reason the party steppers
              carry no explicit zero (migration 241's de-masking). */}
          {typeof event.guestCount === "number" && event.guestCount > 0 && (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid={`slip-event-guests-${event.id}`}
            >
              {event.guestCount} attending
            </p>
          )}
          {isOwner && (
            <span className="flex flex-wrap items-center gap-2">
              <EventTimeAffordance tripId={tripId} event={event} />
              {/* Ledger `2026-09-04-event-budget`: the event is the BUDGET UNIT, so the field sits
                  on the event's own header beside its time — and the plan's total below the list
                  is derived from these, never stored. */}
              <EventBudgetAffordance tripId={tripId} event={event} />
              {/* D6 — the two role questions, kept apart. The STANDING of the plan's advisor (a
                  plan-level fact, stated where the traveler is standing) and, beside it, the
                  EVENT's own role chips into the PROVIDER browse. The "Hire an expert" button that
                  used to sit here opened the plan-level EXPERT picker from an event header; it
                  lives in the rail's Build card now, and the picker has ONE home. */}
              <EventAdvisorStanding tripId={tripId} event={event} />
              <EventRoleChips tripId={tripId} event={event} />
              {/* S1 — the add control the ratified artboards draw on every event header. It writes
                  the EXISTING LD 39 add rail with this event's id on the LD 29 allowlist, so the
                  row lands under the event that was pressed. */}
              <SlipAddItemControl
                tripId={tripId}
                dayNumber={addDayNumber}
                userExperienceId={event.id}
                label={SLIP_ADD_EVENT_LABEL}
                testId={`slip-event-add-${event.id}`}
              />
            </span>
          )}
        </header>
      )}
      <div className="pb-1">{children}</div>
    </section>
  );
}

// Smoke 9 S9-9 (ledger `2026-10-04-smoke9-addendum`): the slip no longer prints the item-transition
// diary ("v1 · Oct 3 · (removed item) (you)"). The diary stays on the server (`recentTransitions`,
// append-only, read by the "see what changed" link); the footer that numbered its rows as plan
// versions and named deleted items "(removed item)" is gone, not hidden (§18c).

// ── Finalize Plan / Reopen (ruling R-F; adopt-finalize-conform: finalize = lock) ─────────

/** Primary-surface inputs read straight off the DTO — same helper the server-side rule (R-F)
 *  uses, so client and scheduler agree on when Trip Card becomes primary. */
function primaryInputFromTrip(trip: SlipTrip | undefined) {
  return { finalizedAt: trip?.finalizedAt ?? null, startDate: trip?.startDate ?? null, endDate: trip?.endDate ?? null };
}

// ── TripCardPrimaryBanner ─────────────────────────────────────────────────────────────

/**
 * Renders only when the R-F primary rule says so (finalized ∨ T-48h window ∨ underway). Trip Card
 * is presented as the primary surface here.
 *
 * ITS CONTROLS MOVED TO THE FINISH CARD (ledger `2026-09-05-slip-rail-regroup`). This banner used
 * to carry "View Trip Card" and "Back to planning" as well as the statement, while the rail below
 * carried a THIRD way to the same card ("Preview Trip Card"). The rail's Finish card is now the
 * ONE home of both controls — same testids, same 48-hour suppression, same owner gate — and this
 * is the statement alone. A second copy of a control is the drift class §18 rule 1 names, and the
 * pre-final "Preview" was worse than duplication: before a snapshot exists `/trip/:id` has nothing
 * of its own to render (§13).
 */
function TripCardPrimaryBanner({ trip }: { trip: SlipTrip }) {
  // Step 6 finalize smoke: "ready" only when a final version exists (`tripCardBannerState`, the one
  // rule the card and the T-48h nudge read); inside the 48-hour window with no final, the slip says
  // to make the plan final instead — the card would only say "Not final yet".
  const state = tripCardBannerState({ finalizedAt: trip.finalizedAt, startDate: trip.startDate, endDate: trip.endDate, finalVersion: trip.finalVersion });
  if (state === "finalize_now") {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20" data-testid="slip-trip-card-finalize-now">
        <CardContent className="p-4 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <p className="text-sm font-medium text-foreground">{TRIP_CARD_FINALIZE_NOW_TITLE}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="slip-trip-card-primary-banner">
      <CardContent className="p-4 flex items-center gap-2 flex-wrap">
        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm font-medium text-foreground">{TRIP_CARD_READY_TITLE}</p>
        {/* Version chip (adopt-finalize-conform D-2): with it, the Finalize Plan button's absence
            reads as COMPLETED. §13: render only a real server-emitted version, never an invented
            one. */}
        {trip.finalVersion != null && (
          <span
            className="flex-shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary"
            data-testid="slip-final-version-chip"
          >
            v{trip.finalVersion}
          </span>
        )}
      </CardContent>
    </Card>
  );
}


// ── SlipView ───────────────────────────────────────────────────────────────────────────

/**
 * THE SLIP'S VIEW MODEL (step 8b-1, ledger `2026-10-06-step8b1-slip-extraction`; step 8 brief rev 3.1, item 8).
 *
 * Every calculation `SlipView` makes before it renders — its queries, its state and its derivations —
 * moved here VERBATIM, so the list layout below and the map layout 8b-2 adds read ONE model and can
 * never disagree (§18 rule 1). Nothing in it changed in the move: same queries, same keys, same
 * `enabled:` conditions (the neighbourhood and versions reads still wait for `slipView === "map"`, so
 * the list view's network traffic is unchanged), same derivations.
 *
 * It lives in THIS file on purpose: about 29 tests read `SlipView.tsx` as text and match lines of this
 * block, so it cannot leave the file until those assertions are scoped (FOLLOWUPS.md).
 */
export function useSlipViewModel({
  tripId,
  data,
  highlightItemId,
  initialView = null,
}: {
  tripId: string;
  data: SlipData;
  highlightItemId?: string | null;
  /** Step 8b-2: `?view=map` opens the map layout. No stored preference — the URL is the only input. */
  initialView?: "list" | "map" | null;
}) {
  const days: PlanCardDay[] = data.days ?? [];
  const isOwner = data.tripRole === "owner";
  const isExpertViewer = data.tripRole === "expert";
  // RC-5 (ledger `2026-09-25-rc345-active-plan`): opening YOUR plan makes it the active plan — the
  // one every "Add to plan" targets. ONE rule (`activateOpenedPlan`), shared with the Trip Card;
  // it waits for the pen to be bound to this viewer and leaves a pen already naming this plan alone.
  const penPrincipal = usePenPrincipal();
  const openedTrip = data.trip;
  useEffect(() => {
    activateOpenedPlan(
      openedTrip
        ? {
            id: openedTrip.id,
            destination: openedTrip.destination,
            startDate: openedTrip.startDate,
            endDate: openedTrip.endDate,
            title: openedTrip.title,
            travelers: openedTrip.travelers,
            // The slip DTO carries the total only; the pair and the occasion are not known here and
            // are NOT carried (RC-12: another plan's answers never seed this one). The RC-12 door
            // re-syncs with the resolved occasion when it opens the modal.
            eventType: openedTrip.eventType ?? null,
          }
        : null,
      data.tripRole,
      penPrincipal,
    );
  }, [openedTrip, data.tripRole, penPrincipal]);
  // LD 52 (C): an executive assistant building this plan for its owner edits items, nothing more.
  const viewer = slipViewer(data.tripRole);
  const canEditItems = canEditPlanItems(viewer);
  const expertName = expertFirstName(data);
  // S6 — the stops line's Edit affordance is a DOOR of the ONE planning modal (Locked Decision
  // 33's opener, Locked Decision 34's one stop editor), never a second editor mounted here.
  const { open: openPlanModal } = usePlanning();

  /**
   * ── D21 · THE INVITED COUNT (ledger `2026-09-05-slip-decisions-d18-d22`) ─────────────────────
   * The SERVER's own `totals.invited` off the derived roster (`GET /api/trips/:tripId/guests`,
   * Locked Decision 37 — one row per person, deduplicated by normalised email, computed and never
   * stored). This surface counts NOTHING: a second count on the client is the drift class §18
   * rule 1 names, and `SlipLogisticsSection`'s own totals block already reads this exact key, so
   * react-query serves both from ONE cache entry and ONE request.
   *
   * §13 — every failure mode is an UNKNOWN, not an empty roster: a 401/403 (the route is
   * owner-tier because the rows carry emails and dietary notes), a 404, an offline tab and a
   * still-loading read all leave `invitedCount` null, and `planHeaderCountLabel` then prints the
   * ordinary party label rather than "0 invited". `retry: false` is deliberate for the same
   * reason it is on the totals block: a refusal must not be retried into a zero.
   */
  const { data: guestRoster } = useQuery<{ totals?: { invited?: number } }>({
    queryKey: [`/api/trips/${tripId}/guests`],
    // Guest emails and dietary notes are owner-tier (LD 37). A delegate does not request them.
    enabled: !!tripId && data.tripRole === "owner",
    staleTime: 30_000,
    retry: false,
  });
  const invitedCount =
    typeof guestRoster?.totals?.invited === "number" ? guestRoster.totals.invited : null;

  /**
   * ── S3 · IS THERE ANYBODY TO ASK? (ledger `2026-09-06-slip-small-additions`) ─────────────────
   * "Ask your expert about this" opens the item's own thread and notifies the advisor, so it is
   * drawn ONLY when an advisor in a §12 access status is actually on this plan — with none, the
   * line is ABSENT rather than greyed: there is nobody it could address, and that absence is not
   * the traveler's to fix (§13, the same posture the rail's expert row takes).
   *
   * TWO VIEWERS, TWO WAYS OF KNOWING, and neither is a second predicate. An EXPERT viewing this
   * slip IS the advisor — `tripRole === "expert"` is `getTripRole`'s answer, which is already
   * gated on the canonical access statuses — so their presence is proof by construction. The
   * OWNER asks the same owner-gated advisor read the rail's Build card uses (one endpoint, one
   * cache entry, no second query shape for the same fact); that route is owner-only and would 404
   * for anyone else, which is exactly why it is not the expert's signal.
   */
  const { data: slipAdvisorData } = useQuery<{ advisor: { status?: string | null } | null }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled: isOwner && !!tripId,
  });
  const hasAdvisor = isExpertViewer || !!slipAdvisorData?.advisor;
  // THE EXPERT DOOR (ledger `2026-09-29-expert-door`): owner only, and only until an expert is
  // attached — the owner's own advisor read (above) is the one signal, never a second query. The
  // advisor read must have ANSWERED before the card shows, so a plan that has an expert never
  // flashes the question.
  const [expertDoorState, setExpertDoorState] = useExpertDoorState(tripId);
  const expertDoorLive = isOwner && slipAdvisorData !== undefined && !slipAdvisorData?.advisor;
  const transitions = data.recentTransitions ?? [];
  const hasOptimized = transitions.some((t) => t.eventType === "variant_applied");
  // R-F: `finalized_at ∨ now ≥ startDate−48h ∨ underway → Trip Card is primary` — the SAME rule
  // the server-side T-48h scheduler applies, read straight off this DTO's real fields.
  const isPrimary = data.trip ? tripCardIsPrimary(primaryInputFromTrip(data.trip)) : false;
  // Step 6 finalize smoke: the rail's "Finished · View as Trip card" only once a final exists — with
  // none, the Finish card keeps Finalize (`tripCardBannerState`, the one rule).
  const cardReady = data.trip ? tripCardBannerState({ ...primaryInputFromTrip(data.trip), finalVersion: data.trip.finalVersion }) === "ready" : false;

  const allActivities = useMemo(() => days.flatMap((d) => d.activities), [days]);

  // ── List | Map view toggle (ledger 2026-08-22-slip-map-view) ──────────────────────────
  // The map is the SAME MapControlCenter the PlanCard mounts (L6 — one implementation, one
  // more mount) over the SAME plancard DTO this slip already fetched. §13/§22 honesty: only
  // located items (lat+lng present) are pinned — the count line below matches the map's own
  // filter exactly; unlocated items are named under the map, never guessed onto it; and at
  // ZERO located items the Map view is not offered at all (disabled control with the true
  // reason — the same title-reason pattern the Optimize button uses).
  const [slipView, setSlipView] = useState<"list" | "map">(initialView === "map" ? "map" : "list");
  const [mapDay, setMapDay] = useState(0);
  // LD 43(d): "the plan holds bookable rows" = something staged for checkout, or already booked.
  // Derived from the rows this surface already has — no new fetch, and no claim when there are none.
  const hasBookableRows = useMemo(
    () => allActivities.some((a) => a.routingStatus === "ready_for_checkout" || isPurchasedRow(a)),
    [allActivities],
  );
  // Step 5 ruling 10: ONE located predicate — the map's own `isLocated` (§18 rule 1).
  const locatedActivities = useMemo(() => allActivities.filter(isLocated), [allActivities]);
  const unlocatedActivities = useMemo(() => allActivities.filter((a) => !isLocated(a)), [allActivities]);
  // Step 5: the map's Browse layer, opened by the layers control or by an item's "Find a host".
  const [mapBrowse, setMapBrowse] = useState<{ open: boolean; categoryKey: string | null }>({ open: false, categoryKey: null });
  const openFindHost = (categoryKey: string | null) => {
    setMapBrowse({ open: true, categoryKey });
    setSlipView("map");
  };
  // Step 8b-2 (item 10, ruling 2): the map is ALWAYS reachable. This reason no longer disables the Map
  // toggle; it is the empty "Your plan" line while nothing on the plan is located.
  const planEmptyReason =
    locatedActivities.length === 0
      ? "No stops are located yet — items need map locations before they can be shown on a map"
      : null;
  // Ruling 9: with nothing located the map opens on Browse — only "Your plan" waits for located stops.
  useEffect(() => {
    if (slipView === "map" && locatedActivities.length === 0 && !mapBrowse.open) setMapBrowse({ open: true, categoryKey: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slipView]);
  // The URL says which layout is shown (`?view=map`), so a reload or a shared link opens the same one.
  // Rewritten in place — never a navigation, and nothing is stored.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (slipView === "map") params.set("view", "map");
      else params.delete("view");
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, "", next);
      }
    } catch {
      /* no URL to write */
    }
  }, [slipView]);

  // ?item=<itemId>: scroll to + briefly highlight that row on mount.
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlighted, setHighlighted] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightItemId) return;
    const el = rowRefs.current[highlightItemId];
    if (!el) return;
    setHighlighted(highlightItemId);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlighted(null), 2400);
    return () => clearTimeout(timer);
    // Run once per target item after first data render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightItemId, days.length]);

  const sortedDays = [...days].sort((a, b) => a.dayNum - b.dayNum);
  // Step 8b-2 (ruling 1): the map's day chips — the plan's days plus the trip window's empty ones.
  const mapDays = useMemo(() => mapDayChips(sortedDays, data.trip), [sortedDays, data.trip]);
  // A3b (ledger `2026-09-29-a3b-option-sets-slip`): the plan's comparisons, with each option's
  // plan-fit derived by the server. Write = the item-tool holders and a §12 WRITE advisor; CHOOSE is
  // the owner's or delegate's alone (R129). Render rules only — the rails refuse on their own.
  const optionSetsQuery = useOptionSets(tripId, true);
  const optionSets = optionSetsQuery.data?.sets ?? [];
  const anchorItemId = primaryAnchorItemId(optionSets);
  // Step 1: which tool fixed the primary anchor (`anchorFromTool`) — the set it came from.
  const anchorSetCategory =
    optionSets?.find((s) => s.itineraryItemId === anchorItemId && s.anchorRole === "primary")?.categoryKey ?? null;
  const canWriteSets = canEditItems || (isExpertViewer && data.expertAssigned === true);
  const hasOpenLodgingSet = optionSets.some((st) => st.status === "open" && st.categoryKey === "accommodation");
  const planActivities = sortedDays.flatMap((d) => d.activities ?? []);
  const hasStayItem = planActivities.some((act) => act.type === "accommodation");
  // Surface step 3 (ledger `2026-10-03-surface-step3-anchor-panel`): the ONE AnchorPanel reads the
  // same view before AND after the draft — `no_draft` is its empty state, an eligible view its
  // drafted state, and `decided` (a stay, or a comparison open or chosen) means no panel; a Skip only
  // dismisses the state it was pressed in (smoke 8 item 1, `dismissed`). Asked whenever the
  // plan has no stay item; the server decides the rest and the client restates none of it.
  const whereToStayQuery = useQuery<WhereToStayView>({
    queryKey: [`/api/trips/${tripId}/where-to-stay`],
    enabled: !!tripId && !hasStayItem,
  });
  const whereToStay = whereToStayQuery.data?.eligible ? whereToStayQuery.data : null;
  // Smoke 8 item 1: a "Skip for now" dismisses the panel for the state it was pressed in; the
  // tray's "Where to stay" opens the full chooser whenever the stay is undecided (`anchorSurfaces`).
  const anchorSurface = anchorSurfaces(whereToStayQuery.data, hasStayItem);
  const [optimizerSlot, setOptimizerSlot] = useState<HTMLDivElement | null>(null);
  const anchorPanelEmpty = anchorSurface.slip === "empty";
  // Smoke 5 items 6/8: when the draft's lookups finish, its stops' coordinates have landed — re-ask
  // Where to stay once, which then ranks on them and stores that order for the draft.
  const factsPendingCount = data.factsPendingItemIds?.length ?? 0;
  const prevFactsPending = useRef(factsPendingCount);
  useEffect(() => {
    if (prevFactsPending.current > 0 && factsPendingCount === 0) {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/where-to-stay`] });
    }
    prevFactsPending.current = factsPendingCount;
  }, [factsPendingCount, tripId]);

  // ── DAY → EVENT → ITEMS (migration 277; ledger `2026-09-04-slip-events`) ──────────────────
  // TWO conditions, both real, and neither is guessed:
  //
  //  (1) THE OCCASION SAYS THIS PLAN HAS AN INTERNAL SCHEDULE — `experience_types.default_schedule`,
  //      read through the ONE switch reader (`showsSchedule`, Locked Decision 28). The column is
  //      nullable with no DB CHECK, so NULL / an unresolved occasion / an unreadable trip all mean
  //      NOT SET, and `showsSchedule` falls back to FALSE — the plain-plan shape, which here is the
  //      flat day list this surface has always rendered (§13). Grouping a plan nobody said has a
  //      schedule would put structure in the row's mouth.
  //
  //  (2) THE PLAN ACTUALLY HAS EVENTS. An empty `events` array is the honest state of every plan
  //      that exists today — one implicit unnamed event, no rows — and it renders EXACTLY as
  //      before, not as a degraded version of something else.
  //
  // When either is false the day renders its items flat, in the same Fragment-wrapped single
  // group, so the un-grouped DOM is byte-identical to the pre-lane render.
  const {
    occasion,
    isHidden: occasionIsHidden,
    /**
     * QA check 3 — the difference between "this plan has no occasion" and "we have not been told
     * yet". Both arrive here as `occasion === null`, and BOTH of this surface's first-paint
     * defects were a reader treating the second as the first: the party noun below, and the
     * "No items on this plan yet" line at the bottom of the day list. Resolved ONCE, by the hook
     * that owns the lookup (§18 rule 1).
     */
    isResolved: occasionResolved,
  } = useOccasionSwitches(tripId);
  const planEvents: PlanEvent[] = data.events ?? [];
  const groupByEvent = showsSchedule(occasion) && planEvents.length > 0;
  /**
   * A1 — THE TRIPS FRAME (ledger `2026-09-29-a1-trips-frame`; product map §B2, §M7). The group is
   * derived from the resolved occasion ROW only (see below for why not R132's coarse key), and only
   * the Trips group changes anything in this step: its header states the anchor, and its EMPTY slip
   * asks the anchor question instead of saying "No items". Every other group renders as before.
   * `null` anchor ⇒ not a Trip ⇒ nothing new renders.
   */
  // The coarse `trips.event_type` is deliberately NOT passed: the column DEFAULTS to `vacation`, so
  // R132's fallback would make every plan whose occasion was never recorded a Trip. A column default
  // is not the traveler's answer (§13) — the frame applies only when the occasion resolved to a row.
  const experienceGroup = experienceGroupFor(occasion);
  const tripsAnchor: TripsAnchor | null = resolvedTripsAnchor(occasion);
  // Surface step 3: the ONE lodging surface, in either state. Its question is the group manifest's.
  // Smoke 9 S9-2: the plan's lodging set (open or chosen, the primary first), for the tray's CHANGE form.
  const lodgingSet = (() => {
    const sets = optionSets.filter((st) => st.categoryKey === "accommodation" && (st.status === "open" || st.status === "chosen"));
    const pick = sets.find((st) => st.anchorRole === "primary") ?? sets[0];
    return pick ? { id: pick.id, status: pick.status } : null;
  })();
  // S10-6: the plan's current stay row — the lodging set's item, else an accommodation row added by
  // hand (the server's own reading, `setItemAsStay`).
  const currentStay = (() => {
    const setItemId = optionSets.find((st) => st.id === lodgingSet?.id)?.itineraryItemId ?? null;
    const bySet = setItemId ? planActivities.find((act) => act.id === setItemId) : undefined;
    const byType = planActivities.find((act) => act.type === "accommodation");
    const row = bySet ?? byType;
    return row ? { id: row.id, name: row.name } : null;
  })();
  const renderAnchorPanel = (stage: "empty" | "drafted" | "chooser" | "change") => (
    <AnchorPanel
      tripId={tripId}
      stage={stage}
      question={manifestFor(experienceGroup, occasion?.slug ?? null).anchorQuestion}
      anchorKind={tripsAnchor?.kind ?? "lodging"}
      fromFallback={!!tripsAnchor?.fromFallback}
      view={whereToStay}
      lodgingSet={lodgingSet}
      canChoose={canEditItems}
      addPlacesControl={hasOpenLodgingSet ? null : <SlipAnchorCompareButton tripId={tripId} label={ANCHOR_PANEL_ADD_PLACES} variant={stage === "empty" ? "board" : "outline"} />}
      addFixedControl={
        <SlipAddItemControl tripId={tripId} dayNumber={1} userExperienceId={null} label={SLIP_ADD_DAY_LABEL} testId="slip-anchor-add-fixed" />
      }
    />
  );

  /**
   * ── THE DAY SLOTS (ledger `2026-09-05-slip-events-first-render`) ──────────────────────────────
   * The day list used to be `sortedDays` alone, and `sortedDays` comes from the ITEMS: the
   * plancard's `days` array is built from `Array.from(new Set(items.map(i => i.dayNumber)))`, so a
   * plan with no items has NO days. A freshly minted plan is exactly that — four events ticked at
   * step 5, zero items — and the slip rendered "No items on this plan yet" directly under a header
   * that said "4 events". The header was right and the body was right; nothing tied them together.
   *
   * `buildSlipDaySlots` is that tie. It calls the SAME `groupItemsByEvent` per day — the grouping
   * rule is not restated here or forked (§18 rule 1) — and adds a slot for the events that have no
   * items ANYWHERE on the plan, on the calendar day each names, with a trailing UNDATED slot for
   * the ones that name none. An event that HAS items is untouched: it renders beside them, exactly
   * as before, so a plan with items comes out of here identical to today's render.
   */
  const daySlots = useMemo(
    () =>
      buildSlipDaySlots(
        sortedDays.map((day) => ({
          dayNum: day.dayNum,
          dateIso: day.dateIso ?? null,
          // THE PLAN'S OWN ORDER, and no longer a client-side time sort (ledger
          // `2026-09-05-slip-own-your-plan`). The producer emits a day's items in
          // `getItineraryItems` order — `sort_order` ASC, then `start_time` ASC — which is exactly
          // what `POST /api/trips/:tripId/itinerary/reorder` writes. Re-sorting by time here made
          // the owner's ↑/↓ a control that changed the stored order and moved nothing on screen,
          // which is a button that lies about what it did (§13). For every plan whose rows still
          // share one `sort_order` (an AI draft; anything never reordered) the tie-break IS the
          // start time, so those plans render exactly as they did before.
          items: [...day.activities],
        })),
        planEvents,
        { groupByEvent },
      ),
    [sortedDays, planEvents, groupByEvent],
  );
  /** The plan's own day rows, by ordinal — the heading's `date` fallback and the day's legs. */
  const dayByNum = useMemo(
    () => new Map(sortedDays.map((d) => [d.dayNum, d])),
    [sortedDays],
  );
  // Step 1 (`DayBlock`): the first day starts open, and so does the day a `?item=` link points into;
  // every other day is collapsed until the traveler opens it. Keyed by slot; a toggle is remembered.
  const [dayOpen, setDayOpen] = useState<Record<string, boolean>>({});
  const lastDayNum = sortedDays.length ? sortedDays[sortedDays.length - 1].dayNum : null;
  // R-aa: the arrival/departure placeholders belong to a RANGE-shaped plan (`durationShape`); a
  // day-shaped occasion (a date night) has nothing to arrive at.
  const showTravelAnchors = durationShape(occasion) === "range";
  // Surface step 2: which tool's sheet is open, and the plan's anchors (the SAME query key the
  // anchor manager and the Getting there sheet read), so a flight added there turns day 1's /
  // the last day's placeholder into the real anchor row.
  const [openTool, setOpenTool] = useState<ToolKey | null>(null);
  // ── Step 5: the slip map's anchor, neighbourhood shading and versions (spec §2.3; R-d) ─────────
  // The anchor: the plan's stay when it has one located, else the item the plan is built around.
  const mapAnchor: MapAnchor | null = planMapAnchor(planActivities, anchorItemId);
  // Neighbourhoods are shaded whenever the stay is located, and emphasised while the AnchorPanel is
  // open (on the slip or in the tray) — spec v1.3.4 §2.3, step 6 (`areaShading`).
  const anchorPanelOpen = anchorSurface.slip === "drafted" || (!!tripsAnchor && anchorPanelEmpty) || openTool === "where_to_stay";
  const shading = areaShading({ stayLocated: mapAnchor?.kind === "stay", panelOpen: anchorPanelOpen });
  const mapCity = (data.trip?.destination ?? "").split(",")[0].trim();
  const { data: areaRows } = useQuery<{ data?: Array<{ slug: string; name: string; centroidLat: string; centroidLng: string }> }>({
    queryKey: [`/api/city-neighborhoods?city=${encodeURIComponent(mapCity)}`],
    enabled: slipView === "map" && shading.show && !!mapCity,
    staleTime: 10 * 60_000,
  });
  const mapAreas: MapArea[] = (areaRows?.data ?? [])
    .map((r) => ({ slug: r.slug, name: r.name, lat: Number(r.centroidLat), lng: Number(r.centroidLng) }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  // Step 6 R-aq: ONE image per day on the slip — the day's first located stop (never the stay); none
  // on item rows, versions or the map. Resolved server-side in the R-aq order, with its attribution.
  const dayPhotoItemId = new Map<number, string>();
  for (const d of sortedDays) {
    const first = (d.activities ?? []).find((x) => isLocated(x) && x.type !== "accommodation");
    if (first) dayPhotoItemId.set(d.dayNum, first.id);
  }
  const dayPhotos = usePlacePhotos(tripId, Array.from(dayPhotoItemId.values()));
  const [detailsRequests, setDetailsRequests] = useState<Record<string, number>>({});
  // A paid run's versions: the Draft / A / B / C toggle (read gate; a non-reader is one 404 ⇒ no toggle).
  const { data: versionsView } = useQuery<VersionsBoardView>({
    queryKey: [`/api/trips/${tripId}/versions`],
    enabled: slipView === "map" && !!tripId,
    retry: false,
    staleTime: 30_000,
  });
  const mapVersions: MapVersion[] = (versionsView?.versions ?? []).map((v) => ({
    key: v.variantId,
    label: v.label,
    stops: v.stops,
    days: v.days,
    anchor: v.anchor ? { kind: "stay", name: v.anchor.name, lat: v.anchor.lat, lng: v.anchor.lng } : null,
  }));
  const { data: tripAnchors } = useQuery<Array<{ id: string; anchorType: string; anchorDatetime: string; location?: string | null; description?: string | null; bufferBefore?: number | null; bufferAfter?: number | null }>>({
    queryKey: [`/api/trips/${tripId}/anchors`],
    enabled: !!tripId && showTravelAnchors,
  });
  // R-i (surface step 3): the airport ↔ stay leg — only with a flight in that direction AND a stay.
  const { toast: legToast } = useToast();
  const stayName = planActivities.find((act) => act.type === "accommodation")?.name ?? null;
  const hasAnyFlight = !!flightAnchorFor(tripAnchors, "flight_arrival") || !!flightAnchorFor(tripAnchors, "flight_departure");
  const { data: airportLeg } = useQuery<{ platformCarFits: boolean }>({
    queryKey: [`/api/trips/${tripId}/airport-leg`],
    enabled: !!tripId && showTravelAnchors && hasAnyFlight && !!stayName,
  });
  const legRequest = useMutation({
    mutationFn: async (input: { direction: "arrival" | "departure"; airport: string | null }) => {
      const city = (data.trip?.destination ?? "").split(",")[0].trim();
      const from = input.direction === "arrival" ? input.airport || `${city} airport` : stayName || city;
      const to = input.direction === "arrival" ? stayName || city : input.airport || `${city} airport`;
      return (
        await apiRequest("POST", "/api/affiliate-booking-requests", {
          tripId,
          itemName: airportLegLine(input.direction, stayName ?? city, input.airport),
          partnerRoute: { partner: "12go", origin: from, destination: to },
        })
      ).json();
    },
    onSuccess: () => legToast({ title: "Booking request sent — a booking agent will arrange it and add it to your plan" }),
    onError: () => legToast({ title: "Couldn't send the booking request", variant: "destructive" }),
  });
  const renderAirportLeg = (direction: "arrival" | "departure") => {
    const flight = flightAnchorFor(tripAnchors, direction === "arrival" ? "flight_arrival" : "flight_departure");
    if (!showsAirportLeg({ hasFlight: !!flight, stayName })) return null;
    return (
      <LegRow
        direction={direction}
        stayName={stayName!}
        airport={flight?.location ?? null}
        modes={airportLegModes({ platformCarFits: !!airportLeg?.platformCarFits })}
        canBook={isOwner}
        driversHref={servicesBrowseHref("private_transportation", tripId)}
        busy={legRequest.isPending}
        onRequest={() => legRequest.mutate({ direction, airport: flight?.location ?? null })}
        routedMinutes={flight?.airportLegMinutes ?? null}
      />
    );
  };

  // ── THE PLAN'S BUDGET TOTAL (ledger `2026-09-04-event-budget`) ────────────────────────────
  // DERIVED from the events, never stored — one pure helper, so the line and the fields it sums
  // cannot drift apart (§18 rule 1). `null` when NO event states a budget, and the line is then
  // OMITTED entirely: "$0" is a claim the traveler never made, and an absence rendered as a
  // measurement is the §13 class this whole surface is built against.
  //
  // NOT gated on `groupByEvent`. That switch decides whether the DAY LIST is grouped by event; a
  // budget stated on an event is true whether or not the occasion asks for an internal schedule,
  // and hiding a number the traveler entered because of an unrelated switch would lose an answer
  // they gave.
  const budgetLine = planBudgetLine(planEvents);

  /**
   * ── THE PARTY LINE (ledger `2026-09-05-slip-events-first-render`) ─────────────────────────────
   * ONE derivation of "N <noun>", the same `partyCountLabel` the Trip Strip's chip and
   * `SlipTravelingParty` already call — so the count and the WORD both come from one place. The
   * count itself is the plan's own derived total (`trips.number_of_travelers`, written by the ONE
   * shared `partyTotal` on the trip-create path and on the occasion PATCH); the noun is the
   * occasion's `vocabulary` column, read through the switch reader (Locked Decision 28), with
   * `default_guests === false` forcing "travelers" inside the helper rather than here.
   * §13 — `""` for a count nobody stated, and the segment is omitted rather than printed as zero.
   *
   * ── AND THE NOUN WAITS FOR ITS ROW (QA check 3) ──────────────────────────────────────────────
   * `partyNoun`'s NULL ⇒ "travelers" fallback is ruling 28's answer for an occasion that HAS
   * resolved and states no vocabulary. It is not an answer for one still in flight, and this line
   * could not tell the two apart: a freshly minted wedding painted "3 travelers" until
   * `GET /api/trips/:id` and `GET /api/experience-types` answered, then settled to "3 guests".
   * `partyLabelForOccasion` renders the COUNT ALONE while the lookup is unsettled — the count is
   * the traveler's own and is true whatever the occasion turns out to be — and hands straight back
   * to `partyCountLabel`, fallback included, the moment it settles. Nothing about the settled
   * render changes.
   */
  /**
   * ── AND D21 ADDS THE SECOND POPULATION (ledger `2026-09-05-slip-decisions-d18-d22`) ──────────
   * Where the occasion HAS a guest list and the derived roster carries invitees, the header names
   * BOTH populations — "2 traveling · 64 invited" — because Locked Decision 37 keeps the traveling
   * party and the invited roster apart and a header printing one of them answers half a question.
   * `planHeaderCountLabel` DELEGATES straight back to `partyLabelForOccasion` for every plan
   * without a guest list, so nothing about the settled render above changes (§18 rule 1).
   */
  const partyLabel = planHeaderCountLabel(
    data.trip?.travelers ?? null,
    invitedCount,
    occasion?.vocabulary ?? null,
    occasion?.defaultGuests ?? null,
    occasionResolved,
  );

  /**
   * ── S6 / S7 · WHERE THIS PLAN GOES, AND WHICH ZONE ITS TIMES ARE READ IN ─────────────────────
   * Resolved ONCE here (ledger `2026-09-06-slip-conformance`) because TWO surfaces now state them:
   * the header's third row, and the rail's Plan card "Stops & timezone" row. They were the
   * header's own locals; a second `slipStopsLine(...)` call inside the rail would be the
   * derivation-drift class §18 rule 1 names, and the two would disagree the day either rule moves.
   * Both helpers keep their §13 absences (see `@/lib/slip-meta`): the stops line falls back
   * EXPLICITLY to `trips.destination`, and an unset zone renders NOTHING rather than UTC.
   */
  /**
   * ── RC-12 · "WHO'S COMING?" (ledger `2026-09-25-rc12-party-size`) ─────────────────────────
   * A plan whose party nobody stated (`travelers === null` — the pair and the stored total are all
   * unset) used to read "1 traveler". The owner is asked instead; everyone else sees no count.
   * Waits for the occasion lookup to SETTLE, because the door hands the modal this plan's own
   * occasion and must not hand it an unresolved one (§13).
   *
   * The door first loads THIS plan into the pen (`syncActiveTripToContext`) — the slip does not
   * bind the pen, and the modal edits whichever plan the pen holds — including its own party and
   * occasion, so another plan's answers can neither seed step 4 nor be saved onto this one. It
   * then opens the ONE modal on step 4 (`focusStep`, honoured by `resolvePlanSteps` only for a
   * door that names a plan).
   */
  const partyUnstated = !!data.trip && data.trip.travelers == null;
  const askParty =
    isOwner && partyUnstated && occasionResolved && data.trip
      ? () => {
          const t = data.trip!;
          syncActiveTripToContext({
            id: t.id,
            destination: t.destination,
            startDate: t.startDate,
            endDate: t.endDate,
            title: t.title,
            travelers: null,
            adults: null,
            kids: null,
            experienceSlug: occasion?.slug ?? null,
            eventType: t.eventType ?? null,
          });
          openPlanModal({
            tripId: t.id,
            focusStep: "who",
            ...(occasion?.slug ? { experienceSlug: occasion.slug } : {}),
          });
        }
      : undefined;

  const stopsLine = slipStopsLine(data.trip?.destination, data.destinations);
  const zoneLine = slipZoneLine(data.trip?.timezone);

  return {
    days,
    isOwner,
    isExpertViewer,
    viewer,
    canEditItems,
    expertName,
    openPlanModal,
    hasAdvisor,
    expertDoorState,
    setExpertDoorState,
    expertDoorLive,
    hasOptimized,
    isPrimary,
    cardReady,
    allActivities,
    slipView,
    setSlipView,
    mapDay,
    setMapDay,
    hasBookableRows,
    locatedActivities,
    unlocatedActivities,
    mapBrowse,
    setMapBrowse,
    openFindHost,
    planEmptyReason,
    mapDays,
    rowRefs,
    highlighted,
    sortedDays,
    optionSets,
    anchorItemId,
    anchorSetCategory,
    canWriteSets,
    whereToStay,
    anchorSurface,
    optimizerSlot,
    setOptimizerSlot,
    anchorPanelEmpty,
    planEvents,
    groupByEvent,
    experienceGroup,
    tripsAnchor,
    currentStay,
    renderAnchorPanel,
    daySlots,
    dayByNum,
    dayOpen,
    setDayOpen,
    lastDayNum,
    showTravelAnchors,
    openTool,
    setOpenTool,
    mapAnchor,
    shading,
    mapAreas,
    dayPhotoItemId,
    dayPhotos,
    detailsRequests,
    setDetailsRequests,
    mapVersions,
    tripAnchors,
    renderAirportLeg,
    budgetLine,
    partyLabel,
    askParty,
    stopsLine,
    zoneLine,
    occasion,
    occasionIsHidden,
    occasionResolved,
  };
}

export function SlipView({
  tripId,
  data,
  highlightItemId,
  initialView = null,
  renderLegBetween,
}: {
  tripId: string;
  data: SlipData;
  highlightItemId?: string | null;
  /** Step 8b-2: the layout `?view=map` asks for (D4's landing). */
  initialView?: "list" | "map" | null;
  /**
   * Logistics lane (ledger `2026-10-07-slip-leg-render-prop`): called between each pair of consecutive
   * items in a day, in the day's render order, with the day's index. Absent ⇒ nothing is rendered.
   */
  renderLegBetween?: (prevItem: PlanCardActivity, nextItem: PlanCardActivity, dayIndex: number) => ReactNode | null;
}) {
  // Flag-gated tools (Getting there) render only while their `/api/health` switch is on.
  const healthFlags = useHealthFlags();
  const {
    days,
    isOwner,
    isExpertViewer,
    viewer,
    canEditItems,
    expertName,
    openPlanModal,
    hasAdvisor,
    expertDoorState,
    setExpertDoorState,
    expertDoorLive,
    hasOptimized,
    isPrimary,
    cardReady,
    allActivities,
    slipView,
    setSlipView,
    mapDay,
    setMapDay,
    hasBookableRows,
    locatedActivities,
    unlocatedActivities,
    mapBrowse,
    setMapBrowse,
    openFindHost,
    planEmptyReason,
    mapDays,
    rowRefs,
    highlighted,
    sortedDays,
    optionSets,
    anchorItemId,
    anchorSetCategory,
    canWriteSets,
    whereToStay,
    anchorSurface,
    optimizerSlot,
    setOptimizerSlot,
    anchorPanelEmpty,
    planEvents,
    groupByEvent,
    experienceGroup,
    tripsAnchor,
    currentStay,
    renderAnchorPanel,
    daySlots,
    dayByNum,
    dayOpen,
    setDayOpen,
    lastDayNum,
    showTravelAnchors,
    openTool,
    setOpenTool,
    mapAnchor,
    shading,
    mapAreas,
    dayPhotoItemId,
    dayPhotos,
    detailsRequests,
    setDetailsRequests,
    mapVersions,
    tripAnchors,
    renderAirportLeg,
    budgetLine,
    partyLabel,
    askParty,
    stopsLine,
    zoneLine,
    occasion,
    occasionIsHidden,
    occasionResolved,
  } = useSlipViewModel({ tripId, data, highlightItemId, initialView });
  // Step 8b-2 (ruling 4): the map band reads the ONE AI action the rail reads.
  const aiAction = useSlipAiAction(tripId, allActivities);
  // The Empty board's start renders for the OWNER of a plan with no items, in list view only.
  const emptyStartShown = isOwner && aiAction === "draft" && slipView === "list";
  // ── THE MOMENT BOARD (slip conformance; ledger `2026-10-08-slip-moment-board`) ─────────────────
  // A resolved Moment occasion only (the group is an internal key, R127): its primary anchor (the
  // reservation) gets its own card, the tray marks "The reservation" done once it exists, and the
  // optimizer card speaks of the evening. Every word comes from `@/lib/slip-moment`.
  const isMoment = occasionResolved && manifestFor(experienceGroup, occasion?.slug ?? null).group === "moment";
  const momentAnchor = isMoment && anchorItemId ? allActivities.find((a) => a.id === anchorItemId) ?? null : null;
  const momentAnchorDayNum = momentAnchor ? days.find((d) => d.activities.some((a) => a.id === momentAnchor.id))?.dayNum ?? null : null;
  const momentAnchorDateIso = momentAnchorDayNum != null ? daySlots.find((sl) => sl.dayNum === momentAnchorDayNum)?.dateIso ?? null : null;
  // Expand all (Main board): the same open rule each day already reads, applied to every day.
  const dayIsOpen = (key: string, idx: number, items: readonly { id: string }[]) =>
    dayOpen[key] ?? (idx === 0 || (!!highlightItemId && items.some((a) => a.id === highlightItemId)));
  const allDaysOpen =
    daySlots.length > 0 && daySlots.every((slot, idx) => dayIsOpen(slot.key, idx, slot.groups.flatMap((g) => g.items)));
  const setAllDaysOpen = (open: boolean) =>
    setDayOpen(Object.fromEntries(daySlots.map((slot) => [slot.key, open])));
  const momentSpan = isMoment ? momentSpanWord(data.trip?.startDate as any, data.trip?.endDate as any, allActivities) : null;
  const leadCopy: SlipLeadCopy | null = isMoment
    ? { title: momentLeadTitle(momentSpan), intro: momentLeadIntro(momentAnchor), noStay: true }
    : null;
  const doneTools = useMemo(
    () => new Set<ToolKey>(momentAnchor ? ["the_reservation"] : []),
    [momentAnchor],
  );

  return (
    <div
      className={`${SLIP_SURFACE_CLASS} max-w-6xl mx-auto space-y-5`}
      data-testid={`slip-view-${tripId}`}
      /* A1: the group is an internal key (R127) — a data attribute for tests, never display text. */
      data-experience-group={occasionResolved ? experienceGroup : undefined}
    >
      {/* The Main board's rows (ledger `2026-10-08-slip-main-rows`): the shared day and item rows take
          the board look under the slip's tokens; the Trip Card and the Workstation keep the plain one. */}
      <PlanRowLookProvider look="board">
      {/* R-F: Trip Card presented as the primary surface once the rule fires. The slip itself
          stays fully reachable below — this is a presentation flip, not a navigation away. */}
      {isPrimary && data.trip && <TripCardPrimaryBanner trip={data.trip} />}

      {/* LD 43(d), mount 2: the finalize success / finished area, gated on the plan holding
          BOOKABLE rows — items staged for checkout, or bookings already made. A finished plan
          with nothing bookable has nothing one-click would speed up, so it is not asked. Owner
          only (the expert viewer has no card of the traveler's to save), and soft: the prompt
          renders nothing at all unless the vault read says the traveler has no method yet. */}
      {isOwner && isPrimary && hasBookableRows && (
        <SavePaymentMethodPrompt
          scope={`trip:${tripId}`}
          message="Save this for one-click bookings on this trip."
        />
      )}

      {/* Plan-approval delivery handshake (CC-11 fix, migration 164 / CLAUDE.md §18) — same
          component and same owner-only gate PlanCard.tsx:958-960 uses, fed from this page's own
          plancard DTO fetch (`meta.planApproval`, same queryKey — see slip-view.tsx). Mounted
          unconditionally like PlanCard: PlanApprovalBanner itself decides visibility from
          workspaceStatus/status (PlanApprovalBanner.tsx:84-88). This is the bell-notification
          landing surface (resolveNotificationLink rewrites /trip/:id → /plans/:tripId), so
          without this mount the delivery handshake had no Approve/Request-changes control here. */}
      {viewer === "delegate" && (
        <div
          className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          data-testid="slip-delegate-note"
        >
          {SLIP_DELEGATE_NOTE}
          {/* An empty plan has no day slot to add from; day 1 is the plan's own first day. */}
          {days.length === 0 && (
            <span className="mt-2 block">
              <SlipAddItemControl
                tripId={tripId}
                dayNumber={1}
                userExperienceId={null}
                label={SLIP_ADD_DAY_LABEL}
                testId="slip-delegate-add-first"
              />
            </span>
          )}
        </div>
      )}
      {isOwner && (
        <PlanApprovalBanner tripId={tripId} planApproval={data.meta?.planApproval} activities={allActivities} />
      )}

      {/* R323 (§12 step 1): the ONE handoff chooser — hosted once, opened by every door. */}
      <HandoffChooserHost
        tripId={tripId}
        enabled={isOwner}
        items={allActivities.map((a) => ({ id: a.id, title: a.name, dayNum: days.find((d) => d.activities.includes(a))?.dayNum ?? null }))}
      />
      <SlipHeader
        expertControl={
          expertDoorLive && expertDoorState === "dismissed" ? (
            <AddLocalExpertButton onOpen={() => setExpertDoorState("open")} />
          ) : null
        }
        occasionName={occasion?.name ?? null}
        anchorLine={
          tripsAnchor && occasionResolved
            ? tripsAnchorLine(tripsAnchor, tripsAnchorState({ anchor: tripsAnchor, items: allActivities, events: planEvents }))
            : null
        }
        data={data}
        hasOptimized={hasOptimized}
        eventCount={countPlanEvents(planEvents)}
        partyLabel={partyLabel}
        isHidden={occasionIsHidden}
        isOwner={isOwner}
        /* S6/S7 — resolved ONCE above and handed to BOTH surfaces that state them (this header and
           the rail's Plan card row). Neither derives them again (§18 rule 1). */
        stopsLine={stopsLine}
        zoneLine={zoneLine}
        /* S6 — the ONE plan modal, whose step 2 IS the ordered stop-list editor (Locked Decision
           34's one-writer rule). The SAME opener the Trip Strip's Edit uses, with no source: the
           modal reads the plan the traveler is already on. */
        onEditStops={() => openPlanModal()}
        onAskParty={askParty}
        daySpan={momentSpan}
        sketchLine={momentAnchor ? momentSketchLine(allActivities.length) : null}
      />

      {/* ── THE TWO COLUMNS (ledger `2026-09-06-slip-conformance`) ───────────────────────
          The ratified canvas `page()` draws ONE layout: the plan on the left and a fixed 320px
          rail on the right, side by side. The rail used to sit in the flow ABOVE the day list as a
          two-up card grid, which pushed the plan itself below the fold on every screen and made
          the Trip Pass card narrow enough to wrap its price line a word at a time.

          BELOW `lg` THE RAIL STACKS ABOVE THE LIST — the artboard's order, and the honest one on a
          phone: the four cards are what a traveler does next, and the day list is long. `order-*`
          does the flip, so the DOM order is unchanged and nothing about focus order or the reading
          order of the two regions depends on the breakpoint's direction. */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8" data-testid="slip-columns">
        <div className={`${tripsAnchor ? "order-1 lg:order-1" : "order-2 lg:order-1"} min-w-0 flex-1 space-y-5`}>
          {/* ── SURFACE STEP 2 · THE TOOLS TRAY (ledger `2026-10-03-surface-step2-tools-tray`) ─────────
              The group manifest's tools for THIS plan, each opening the EXISTING component in a sheet;
              the logistics pieces the rail used to mount live here now. Owner only, as they were. */}
          {isOwner && data.trip ? (
            <ToolsTray
              tripId={tripId}
              group={experienceGroup}
              occasionSlug={occasion?.slug ?? null}
              planEvents={planEvents}
              isHidden={occasionIsHidden}
              whereToStay={
                anchorSurface.trayChooser
                  ? renderAnchorPanel("chooser")
                  : anchorSurface.trayChange
                    ? renderAnchorPanel("change")
                    : <SlipAnchorCompareButton tripId={tripId} />
              }
              trip={{
                destination: data.trip.destination ?? null,
                startDate: (data.trip.startDate as any) ?? null,
                endDate: (data.trip.endDate as any) ?? null,
              }}
              openTool={openTool}
              onOpenToolChange={setOpenTool}
              flags={healthFlags}
              doneTools={doneTools}
            />
          ) : null}
          {/* Smoke 9 S9-4: the optimizer LEADS the page (§8) — directly under the tools tray at every
              width. The rail renders its OptimizerLead into this slot (a portal; its state stays there). */}
          {/* The Moment board's anchor card: the reservation, between the tray and the optimizer. */}
          {momentAnchor && slipView === "list" ? (
            <MomentAnchorCard
              item={momentAnchor}
              facts={data.placeFacts?.[momentAnchor.id]}
              dateIso={momentAnchorDateIso}
              timeZone={(data.trip as any)?.timezone ?? null}
            />
          ) : null}
          {isOwner ? <div ref={setOptimizerSlot} data-testid="slip-optimizer-slot" /> : null}
          {/* ── THE VIEW BAR — the counts and the view toggle, ONE row (the canvas `viewbar`) ──
              These were two stacked rows with the whole rail between them, so the plan's status
              line and the control that changes how the plan is displayed read as unrelated. They
              are one row now, and BOTH halves are exactly what they were:

              THE STATUS STRIP keeps the ONE taxonomy the slip has always shown (in planning · with
              expert · in checkout · purchased) and stays zero-omitting: a status no row is in is
              not a segment (§13). It does not count ORIGINS — who added a row is a per-row fact the
              item rows carry, and a second population summed into this line would read as the same
              taxonomy while answering a different question.

              THE TOGGLE keeps its honest map gating: Map is offered only when at least one stop is
              genuinely located, and its disabled title says why.

              §13 ON AN EMPTY PLAN (ledger `2026-09-06-role-chips-filter`) — the bar RENDERS, and
              its left half says "Nothing added yet" in the canvas's own words. It used to be
              absent altogether, which took the List | Map toggle with it: a fresh plan had no
              view control at all, and the one row the canvas draws simply was not there. The
              zero-omitting rule is untouched and is the reason the placeholder is a SENTENCE
              rather than "0 planning · 0 purchased" — a status no row is in is not a segment, and
              four zeroes would be four claims about rows that do not exist. `SlipStatusStrip`
              still returns null when every count is zero, so the two can never both draw. */}
          <div
            className="flex items-center justify-between gap-3 flex-wrap"
            data-testid="slip-viewbar"
          >
            <div className="min-w-0">
              {allActivities.length > 0 ? (
                <SlipStatusStrip activities={allActivities} />
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="slip-viewbar-empty">
                  Nothing added yet
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap" data-testid="slip-view-toggle">
              {/* The Main board's switch (ledger `2026-10-08-slip-main-rows`): "Days" and "Map · N of M",
                  where N is the located stops — a real coordinate, never a ward centroid. */}
              <div className="inline-flex rounded-[var(--slip-radius-chip)] bg-[color:var(--slip-wash)] p-[3px]">
                <button
                  type="button"
                  className={`inline-flex h-9 items-center rounded-[var(--slip-radius-chip)] px-[18px] text-sm ${slipView === "list" ? "bg-[color:var(--slip-card)] font-semibold text-[color:var(--slip-ink)]" : "font-medium text-[color:var(--slip-muted)]"}`}
                  onClick={() => setSlipView("list")}
                  aria-pressed={slipView === "list"}
                  data-testid="button-slip-view-list"
                >
                  Days
                </button>
                <button
                  type="button"
                  className={`inline-flex h-9 items-center rounded-[var(--slip-radius-chip)] px-[18px] text-sm ${slipView === "map" ? "bg-[color:var(--slip-card)] font-semibold text-[color:var(--slip-ink)]" : "font-medium text-[color:var(--slip-muted)]"} disabled:opacity-50 disabled:cursor-not-allowed`}
                  onClick={() => setSlipView("map")}
                  aria-pressed={slipView === "map"}
                  data-testid="button-slip-view-map"
                >
                  {allActivities.length > 0 ? `Map · ${locatedActivities.length} of ${allActivities.length}` : "Map"}
                </button>
              </div>
              {slipView === "list" && daySlots.length > 1 ? (
                <button
                  type="button"
                  className="h-9 px-3 text-[13px] font-medium text-[color:var(--slip-navy)] hover:underline"
                  onClick={() => setAllDaysOpen(!allDaysOpen)}
                  aria-label={allDaysOpen ? "Collapse all days" : "Expand all days"}
                  data-testid="slip-days-expand-all"
                >
                  {allDaysOpen ? "Collapse all" : "Expand all"}
                </button>
              ) : null}
              {slipView === "map" && (
                <span className="text-xs text-muted-foreground" data-testid="text-slip-map-located">
                  {/* Ledger `2026-10-03-no-ward-pins` (decision-maker): the line reads "N of M located".
                      Located means a real coordinate — never a ward or city centroid. */}
                  <span className="font-semibold text-foreground">
                    {locatedActivities.length} of {allActivities.length}
                  </span>{" "}
                  located
                </span>
              )}
            </div>
          </div>

      {/* ── S5 · THE TRIP-LEVEL EXPERT NOTE (ledger `2026-09-06-slip-small-additions`) ─────────
          Locked Decision 21's `trips.expert_traveler_note` — the note the expert wrote FOR the
          traveler about the plan as a whole. It has been on this DTO since §21 landed and this
          surface drew nothing with it; `PlanCard` has rendered it all along, which meant the same
          delivered note was visible on the finalized card and invisible on the plan the traveler
          actually works in.

          THE SAME COMPONENT, NOT A MIRRORED BLOCK. `TripExpertNote` is PlanCard's own treatment
          extracted verbatim (amber inset, 💡, "From your expert"); a second copy of "how a note
          from your expert looks" is the drift class §18 rule 1 names.

          THREE FIELDS, ONE RENDERED. `trips.expert_notes` is the Workstation's PRIVATE build
          notes and must never reach a traveler surface (Locked Decision 21 says so by name); it
          is not on this payload and is not read here. The per-item `itinerary_items.expert_note`
          keeps its own inline block on each row.

          LIST VIEW ONLY, and that is not a gate on the note — it is where the artboard puts it.
          The map view already renders the same note through `MapControlCenter`'s notes layer
          (`expertTravelerNote` is passed to it below), and drawing it twice on one screen would
          be the duplication this whole lane's neighbours keep removing.

          §13 — absent, empty or whitespace-only renders NOTHING (the component decides): no empty
          callout, and never "your expert hasn't left a note", which is a claim about their work. */}
      {slipView === "list" && (
        <TripExpertNote
          expertTravelerNote={data.trip?.expertTravelerNote}
          testId="slip-trip-expert-note"
        />
      )}

      {slipView === "map" && data.trip ? (
        <div className="space-y-3" data-testid="slip-map-view">
          {/* ── THE MAP BAND (step 8b-2, item 19; rulings 3 and 4) ─────────────────────────────────
              The header and the tools tray above are the band's plan name, dates, party, tools and
              expert door. Its AI button is `SlipDraftAiRow` — the free draft, owner only, and only
              while the plan is EMPTY (no AI button on a non-empty plan; "List" leads to Optimize) —
              and Finalize is `FinishCard`. Both are a SECOND PLACEMENT of the rail's own pieces: in
              map view the rail gives way to the map's Browse / Your plan rail, so exactly one of
              each renders per view. The save-payment prompt (two files) and the Trip Pass card
              (once, in SlipRail.tsx) are NOT mounted here. */}
          <div className="grid gap-3 sm:grid-cols-2" data-testid="map-band">
            {isOwner && aiAction === "draft" ? (
              <div className="rounded-lg border border-border p-2" data-testid="map-band-ai">
                <SlipDraftAiRow trip={data.trip} tripId={tripId} />
              </div>
            ) : null}
            <FinishCard trip={data.trip} isOwner={isOwner} isPrimary={cardReady} activities={allActivities} />
          </div>
          <MapControlCenter
            tripId={tripId}
            tripDestination={data.trip.destination ?? ""}
            days={mapDays}
            selectedDay={Math.min(mapDay, Math.max(0, mapDays.length - 1))}
            onSelectDay={setMapDay}
            expertTravelerNote={data.trip.expertTravelerNote}
            readOnly={!canEditItems}
            anchor={mapAnchor}
            areas={mapAreas}
            showAreas={shading.show}
            emphasizeAreas={shading.emphasize}
            versions={mapVersions}
            browse={mapBrowse}
            onBrowseChange={setMapBrowse}
            showTravelMinutes={data.travelTimesShown === true}
            layout="split"
            planEmptyNote={planEmptyReason}
          />
          {/* §13: unlocated items are NAMED, never guessed onto the map. */}
          {unlocatedActivities.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-slip-map-unlocated">
              Not on the map yet: {unlocatedActivities.map((a) => a.name).join(" · ")}
            </p>
          )}
        </div>
      ) : (
      <>
      {/* R323 (§12): the handoff's banner and the ONE chooser host every door opens. */}
      {isOwner || isExpertViewer ? <HandoffBanner tripId={tripId} isOwner={isOwner} /> : null}
      {expertDoorLive && expertDoorState === "open" && data.trip ? (
        <ExpertDoorCard
          trip={{
            id: tripId,
            destination: data.trip.destination ?? "",
            startDate: data.trip.startDate as any,
            endDate: data.trip.endDate as any,
            travelers: (data.trip as any).travelers ?? null,
          }}
          itemCount={allActivities.length}
          onDismiss={() => setExpertDoorState("dismissed")}
        />
      ) : null}
      {/* Surface step 3: the ONE AnchorPanel — empty before the draft, ranked after it (R-y may
          collapse it to one line). Gone once the stay is decided (a stay, a comparison, a Skip). */}
      {/* ── THE EMPTY BOARD (slip conformance, boards rev 15; ledger
          `2026-10-08-slip-empty-board`) ────────────────────────────────────────────────────
          An owner's plan with no items gets the board's start in the place the anchor question
          always held, under the view bar: the anchor question (a Trip's), the draft card and the
          two other ways in. Every control is an existing rail, and the anchor question renders here
          once, never twice. The tray, the optimizer card and the view bar keep their places above
          it, because the specs that pin them on an empty plan are unchanged. Taking them out of the
          empty state is the Main-rail PR's ruling, not this one. */}
      {emptyStartShown && data.trip ? (
        <div className="space-y-3.5" data-testid="slip-empty-board">
          {tripsAnchor && anchorPanelEmpty && anchorSurface.slip !== "drafted" ? renderAnchorPanel("empty") : null}
          <SlipEmptyStart tripId={tripId} trip={data.trip as any} onBrowse={() => setSlipView("map")} />
        </div>
      ) : null}
      {anchorSurface.slip === "drafted" ? renderAnchorPanel("drafted") : tripsAnchor && anchorPanelEmpty && !emptyStartShown ? renderAnchorPanel("empty") : null}
      {/* A3b — the plan's comparisons sit ABOVE the days they are about (golden path Step 2). An
          open set is not an item (R126): it never enters the day list, the cart or the counts. */}
      {/* Smoke 5 item 2 (ledger `2026-10-03-smoke5-fixes`): the legacy inline lodging card ("Where are
          you staying? / Compare places to stay / Suggest places") is GONE — on a drafted plan the
          Where-to-stay panel above is the ONE lodging surface. That card rendered whenever the panel
          did not, so a traveler who answered "Skip" (the server then reports the stay as decided)
          got the old card back on every reload. */}
      {optionSets.some((st) => st.status === "open" || (st.status === "chosen" && (st.easierCount ?? 0) > 0)) ? (
        <div className="space-y-3" data-testid="slip-option-sets">
          {optionSets.map((st) => (
            <SlipOptionSetCard key={st.id} tripId={tripId} set={st} canWrite={canWriteSets} canChoose={canEditItems} />
          ))}
        </div>
      ) : null}
      <div>
          {/* §13 — "No items" is now said ONLY when there is genuinely nothing to show. A plan
              with events and no items has slots (the event cards below), so this line no longer
              contradicts the header's own event count directly above it.

              QA check 3 — AND ONLY ONCE WE HAVE THE DATA THAT WOULD SHOW THEM. `daySlots` is built
              with `groupByEvent`, which needs the occasion row; while that lookup is in flight the
              row is absent, `showsSchedule` correctly falls back to false, and a brand-new plan's
              event cards do not exist yet. Saying "no items" there is a claim about the plan made
              before the plan has answered — so the sentence waits for `occasionResolved` (the ONE
              signal, from the hook that owns the lookup) and a neutral placeholder stands in its
              place. The placeholder states nothing; it is not an empty state and never says one. */}
          {showsSlipEmptyState(daySlots.length, occasionResolved) && tripsAnchor && anchorPanelEmpty ? null : showsSlipEmptyState(daySlots.length, occasionResolved) ? (
            <p
              className="rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] p-4 text-center text-sm text-[color:var(--slip-muted)]"
              data-testid="slip-empty-items"
            >
              No items on this plan yet.
            </p>
          ) : daySlots.length === 0 ? (
            <div className="space-y-2 rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] p-4" data-testid="slip-day-list-loading" aria-hidden="true">
              <div className="h-4 rounded bg-muted animate-pulse w-1/3" />
              <div className="h-4 rounded bg-muted animate-pulse w-2/3" />
              <div className="h-4 rounded bg-muted animate-pulse w-1/2" />
            </div>
          ) : null}
          {daySlots.map((slot, slotIdx) => {
            const slotItems = slot.groups.flatMap((g) => g.items);
            // Step 2 addendum: an AI arrival on day 1 / departure on the last day IS the travel row —
            // it takes the glyph and "Add your flight", and the placeholder is not drawn.
            const arrivalItemId =
              showTravelAnchors && slot.dayNum === 1 ? absorbedTravelItemId(slotItems, "arrival") : null;
            const departureItemId =
              showTravelAnchors && slot.dayNum != null && slot.dayNum === lastDayNum
                ? absorbedTravelItemId(slotItems, "departure")
                : null;
            // Smoke 9 S9-5: stops sitting outside the flight (before it lands / after it leaves).
            const stopTimes = slotItems.map((a) => ({ id: a.id, startTime: a.time, endTime: a.endTime ?? null }));
            const arrivalConflict =
              showTravelAnchors && slot.dayNum === 1
                ? flightTimeConflictLine("arrival", flightAnchorFor(tripAnchors, "flight_arrival")?.time, stopTimes, arrivalItemId, flightAnchorFor(tripAnchors, "flight_arrival")?.bufferMinutes ?? null)
                : null;
            const departureConflict =
              showTravelAnchors && slot.dayNum != null && slot.dayNum === lastDayNum
                ? flightTimeConflictLine("departure", flightAnchorFor(tripAnchors, "flight_departure")?.time, stopTimes, departureItemId, flightAnchorFor(tripAnchors, "flight_departure")?.bufferMinutes ?? null)
                : null;
            // The plan's own day row, when this slot is one — an EVENT-ONLY slot has no ordinal,
            // no `date` label of its own and no legs, and invents none of the three.
            const day = slot.dayNum != null ? dayByNum.get(slot.dayNum) : undefined;
            /**
             * S1/S2 — the two facts every control on this slot needs, resolved ONCE here.
             *
             * `dayItemIds` is the DAY's ordered id list, which is what the reorder rail rewrites
             * (`sort_order` is day-scoped). It is read off the plan's own day row, not off the
             * slot's groups, because the groups are a presentation of that list and a slot with no
             * day row has no list at all.
             *
             * `addDayNumber` is the day a hand-added item would land on: the slot's own ordinal, or
             * — for a slot the EVENTS alone brought into being, which is every slot on a freshly
             * minted plan — the exact inverse of the server's own `dayDateIso`. NULL when neither
             * is knowable, and NULL is then said out loud rather than defaulted (§13).
             */
            const dayItemIds = (day?.activities ?? []).map((a) => a.id);
            const addDayNumber = resolveAddDayNumber({
              dayNum: slot.dayNum,
              dateIso: slot.dateIso,
              tripStartDate: data.trip?.startDate ?? null,
            });
            return (
              <DayBlock
                key={slot.key}
                dayKey={String(slot.dayNum ?? slot.key)}
                heading={
                  (momentSpan === "evening" && daySlots.length === 1 ? momentEveningHeading(slot.dateIso) : null) ??
                  dayBlockHeading({ dayNum: slot.dayNum, date: day?.date ?? null, dateIso: slot.dateIso })
                }
                stats={[
                  momentSpan && daySlots.length === 1 ? momentTimeSpan(slotItems) : null,
                  dayBlockStats({
                    stops: slotItems.length,
                    hoursOn: slotItems.filter((a) => itemFactsLine(data.placeFacts?.[a.id], slot.dateIso ?? null)).length,
                  }),
                ]
                  .filter(Boolean)
                  .join(" · ") || null}
                open={dayIsOpen(slot.key, slotIdx, slotItems)}
                onOpenChange={(o) => setDayOpen((m) => ({ ...m, [slot.key]: o }))}
                thumb={
                  slot.dayNum != null && dayPhotoItemId.get(slot.dayNum) ? (
                    <PlacePhoto photo={dayPhotos[dayPhotoItemId.get(slot.dayNum)!]} size="thumb" testId={`slip-day-thumb-${slot.dayNum}`} />
                  ) : null
                }
                photo={
                  slot.dayNum != null && dayPhotoItemId.get(slot.dayNum) ? (
                    <PlacePhoto
                      photo={dayPhotos[dayPhotoItemId.get(slot.dayNum)!]}
                      size="band"
                      testId={`slip-day-photo-${slot.dayNum}`}
                      // R321 (S11-4): the day's photo opens its stop's ItemSheet.
                      onClick={() => {
                        const id = dayPhotoItemId.get(slot.dayNum!)!;
                        setDetailsRequests((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 }));
                      }}
                    />
                  ) : null
                }
              >
                {/* R-aa: day 1 opens with the placeholder arrival anchor, the last day closes with the
                    departure one — a range-shaped plan only (a day-shaped occasion has no arrival). */}
                {showTravelAnchors && slot.dayNum === 1 && !arrivalItemId ? (
                  <TravelAnchorPlaceholder
                    kind="arrival"
                    city={data.trip?.destination ?? null}
                    flight={flightAnchorFor(tripAnchors, "flight_arrival")}
                    onAddFlight={isOwner ? () => setOpenTool("getting_there") : undefined}
                  />
                ) : null}
                {!arrivalItemId ? <AnchorConflictLine kind="arrival" text={arrivalConflict} /> : null}
                {/* R-i: airport → stay, between the arrival anchor and the first stop. */}
                {showTravelAnchors && slot.dayNum === 1 && !arrivalItemId ? <BoardLegSlot>{renderAirportLeg("arrival")}</BoardLegSlot> : null}
                {slot.groups.map((group) => {
                  const groupItemIds = group.items.map((a) => a.id);
                  const rows = group.items.map((a) => (
                    <Fragment key={a.id}>
                    {renderLegBetween && slotItems.indexOf(a) > 0 ? (
                      <BoardLegSlot>{renderLegBetween(slotItems[slotItems.indexOf(a) - 1], a, slotIdx)}</BoardLegSlot>
                    ) : null}
                    {a.id === departureItemId ? <BoardLegSlot>{renderAirportLeg("departure")}</BoardLegSlot> : null}
                    <SlipDayItem
                      key={a.id}
                      tripId={tripId}
                      activity={a}
                      city={data.trip?.destination ?? null}
                      facts={data.placeFacts?.[a.id]}
                      checkingHours={showsCheckingHours(a.id, data.factsPendingItemIds, !!itemFactsLine(data.placeFacts?.[a.id], slot.dateIso ?? null))}
                      dateIso={slot.dateIso ?? null}
                      timeZone={data.trip?.timezone ?? null}
                      isOwner={isOwner}
                      canEditItems={canEditItems}
                      isExpertViewer={isExpertViewer}
                      hasAdvisor={hasAdvisor}
                      expertName={expertName}
                      anchorFrom={anchorFromTool({
                        isPrimaryAnchor: a.id === anchorItemId,
                        anchorSetCategory: anchorSetCategory,
                        purchasedAndOptimized: hasOptimized && isPurchasedRow(a),
                      })}
                      travel={
                        a.id === arrivalItemId
                          ? { kind: "arrival", flight: flightAnchorFor(tripAnchors, "flight_arrival") }
                          : a.id === departureItemId
                            ? { kind: "departure", flight: flightAnchorFor(tripAnchors, "flight_departure") }
                            : null
                      }
                      onAddFlight={isOwner ? () => setOpenTool("getting_there") : undefined}
                      highlighted={highlighted === a.id}
                      rowRef={(el) => {
                        rowRefs.current[a.id] = el;
                      }}
                      dayNumber={slot.dayNum}
                      dayItemIds={dayItemIds}
                      groupItemIds={groupItemIds}
                      promotable={
                        canEditItems &&
                        !data.trip?.finalizedAt &&
                        slot.dayNum != null &&
                        a.lat != null &&
                        a.lng != null &&
                        // Ledger `2026-10-03-build-around-places`: a Google pin (`pinSource:
                        // "places"`) is promotable too — the server reads the live fact, never copies it.
                        a.id !== anchorItemId
                      }
                      canSetAsStay={
                        // S9-2 amendment / S10-6: any lodging row still being planned that is not
                        // already the stay — with a stay on the plan it REPLACES it (confirmed
                        // first). The server refuses the rest itself.
                        canEditItems &&
                        isLodgingItem({ type: a.type, title: a.name }) &&
                        a.routingStatus === "in_planning" &&
                        !a.booking &&
                        a.id !== currentStay?.id &&
                        !optionSets.some((st) => st.itineraryItemId === a.id)
                      }
                      replacingStay={currentStay && currentStay.id !== a.id ? currentStay.name : null}
                      onOpenExpertDoor={() => setExpertDoorState("open")}
                      onFindHost={openFindHost}
                      savedQuestion={data.savedQuestions?.items[a.id] ?? null}
                      savedCity={data.savedQuestions?.cityName ?? null}
                      detailsRequest={detailsRequests[a.id] ?? 0}
                    />
                    {a.id === arrivalItemId ? <AnchorConflictLine kind="arrival" text={arrivalConflict} /> : null}
                    {a.id === departureItemId ? <AnchorConflictLine kind="departure" text={departureConflict} /> : null}
                    {a.id === arrivalItemId ? <BoardLegSlot>{renderAirportLeg("arrival")}</BoardLegSlot> : null}
                    </Fragment>
                  ));
                  // The implicit group carries NO heading — NULL is the plan's own unnamed event,
                  // not an "unassigned" bucket, and a label here would be a name nobody wrote (§13).
                  return group.event ? (
                    <SlipEventGroupBlock
                      key={group.key}
                      event={group.event}
                      tripId={tripId}
                      isOwner={isOwner}
                      addDayNumber={addDayNumber}
                    >
                      {/* An event with nothing under it says so, in the ONE string held beside the
                          grouping rule. It is an EMPTY body, not an absent card: the card is what
                          proves the event exists, and it carries the event's own time, budget and
                          hire affordances so the traveler's first act on a fresh plan is possible
                          from here. */}
                      {rows.length > 0 ? (
                        rows
                      ) : (
                        <p
                          className="px-3 py-2 text-xs text-muted-foreground"
                          data-testid={`slip-event-empty-${group.event.id}`}
                        >
                          {SLIP_EMPTY_EVENT_BODY}
                        </p>
                      )}
                    </SlipEventGroupBlock>
                  ) : (
                    <Fragment key={group.key}>{rows}</Fragment>
                  );
                })}
                {/* R-i: stay → airport, before the departure anchor. Smoke 8 item 5: the departure is
                    the LAST ROW inside the last day — after its stops and legs, above the day's
                    "Add something to this day" control (which adds to the day, not after the flight). */}
                {showTravelAnchors && slot.dayNum != null && slot.dayNum === lastDayNum && !departureItemId ? <BoardLegSlot>{renderAirportLeg("departure")}</BoardLegSlot> : null}
                {showTravelAnchors && slot.dayNum != null && slot.dayNum === lastDayNum && !departureItemId ? (
                  <TravelAnchorPlaceholder
                    kind="departure"
                    city={data.trip?.destination ?? null}
                    flight={flightAnchorFor(tripAnchors, "flight_departure")}
                    onAddFlight={isOwner ? () => setOpenTool("getting_there") : undefined}
                  />
                ) : null}
                {!departureItemId ? <AnchorConflictLine kind="departure" text={departureConflict} /> : null}
                {/* S1's second control: the plan's ONE implicit unnamed event has no header to hang
                    an add on, and a day with no events has no event header at all. `null` is that
                    event — a real answer, not an absence (Locked Decision 29) — so the day-level
                    control passes exactly that. Owner only (D16).
                    Omitted entirely on a slot with no resolvable day: such a slot exists ONLY
                    because an undated event put it there, its own event header already says what
                    is missing, and an item filed under the implicit event there would have no day
                    to sit on (§13 — the absence is explained once, not twice). */}
                {canEditItems && addDayNumber != null && (
                  <div className="px-3 pt-1.5 pb-0.5">
                    {/* The Main board's day footer: a rule across the card, the dashed add under it. */}
                    <div className="-mx-3 -mb-0.5 mt-0.5 border-t border-[color:var(--slip-line)] px-4 pt-2 pb-3">
                    <SlipAddItemControl
                      tripId={tripId}
                      dayNumber={addDayNumber}
                      userExperienceId={null}
                      label={SLIP_ADD_DAY_LABEL}
                      testId={`slip-day-add-${slot.key}`}
                    />
                  </div>
                  </div>
                )}
              </DayBlock>
            );
          })}
      </div>
      </>
      )}

      {/* WHAT USED TO SIT HERE, AND WHERE IT WENT (ledger `2026-09-05-slip-rail-regroup`):
          · the budget total (`slip-plan-budget`), the browse-services link (`slip-browse-services`)
            and `SlipLogisticsSection` (guests · traveling party · anchors · organize into events)
            are now ROWS of the rail's Build and Plan cards above. Same components, same testids,
            same gates — moved, not rebuilt.
          · `AssignExpertSlot` (`button-find-expert`) is GONE from this surface. The slip carried
            TWO advisor pickers writing through two different routes; the Build card mounts the
            pick-based, §19-shaped `HireExpertDialog` and that is the ONE picker (D7). The older
            `POST /api/trips/:id/expert-advisor` route is deliberately not deleted in this lane —
            it has callers elsewhere and retiring it is its own change.
          Expert suggestions stay here, under the plan they act on. */}

      {/* Row 11 (relocated): expert-suggestion accept/decline. Pre-final it acts on the live plan
          here; the same component mounts on the finalized Trip Card (PlanCard full) where accepting
          auto-creates a new final version. Renders nothing when there are no suggestions. */}
      <ExpertSuggestionsPanel tripId={tripId} className="border-t border-border pt-5" canReview={isOwner} />

      {/* Board #329: the owner's saved places in this plan's cities — how "Plan this city" brings
          its places in. The owner's own list, so owner only; renders nothing when none match. */}
      {isOwner && (
        <SlipSavedPlaces
          tripId={tripId}
          destination={data.trip?.destination}
          stops={data.destinations}
          itemNames={allActivities.map((a) => a.name)}
          className="border-t border-border pt-5 mt-5"
        />
      )}
        </div>

        {/* ── THE ACTION RAIL (ledger `2026-09-05-slip-rail-regroup`; placed by
            `2026-09-06-slip-conformance`) ───────────────────────────────────────
            Build · Plan · Share · Finish, in the ratified canvas's FIXED 320px right column
            (`lg:w-80`) that never shrinks (`lg:shrink-0`) — which is what stops the Trip Pass
            card's price line wrapping a word at a time. Below `lg` it is full width and stacks
            ABOVE the day list (`order-1`), which is the artboard's own order.

            The cards themselves are unchanged: every control keeps exactly ONE home, and
            `budgetLine`, `planEvents`, `stopsLine` and `zoneLine` are HANDED DOWN — the
            derivations stay this component's and are never recomputed inside the rail
            (§18 rule 1). */}
        {data.trip && slipView !== "map" && (
          /* A1 (ledger `2026-09-29-a1-trips-frame`; track-a-rollout A1, "list before rail on phone"):
             for a Trip the PLAN comes first below `lg`, so the anchor question is the first thing
             the traveler reads on a phone rather than the last. Every other group keeps the
             artboard's rail-first order; at `lg` nothing moves. */
          <div className={`${tripsAnchor ? "order-2 lg:order-2 mt-5 lg:mt-0" : "order-1 lg:order-2 mb-5"} lg:mb-0 lg:w-80 lg:shrink-0`}>
            <SlipRail
              trip={data.trip}
              tripId={tripId}
              isOwner={isOwner}
              canEditItems={canEditItems}
              isExpertViewer={isExpertViewer}
              isPrimary={cardReady}
              activities={allActivities}
              planEvents={planEvents}
              budgetLine={budgetLine}
              stopsLine={stopsLine}
              zoneLine={zoneLine}
              optimizerSlot={optimizerSlot}
              leadCopy={leadCopy}
            />
          </div>
        )}
      </div>
      </PlanRowLookProvider>
    </div>
  );
}
