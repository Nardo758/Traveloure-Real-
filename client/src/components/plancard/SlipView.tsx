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
 *  - optimizer-attributed logistics rows: a leg whose `suggestedBy === "ai"` (the
 *    assembler's real unsettled-machine-leg marker) carries "added by optimizer".
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  Anchor,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  EyeOff,
  List as ListIcon,
  Map as MapIcon,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { parseTripDate } from "@/lib/calendar-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TripPlanTransition } from "@shared/trip-plan";
import { tripCardForcedPrimaryByDateAlone, tripCardIsPrimary } from "@shared/trip-primary-surface";
import {
  type PlanCardActivity,
  type PlanCardData,
  type PlanCardDay,
  type PlanCardTransport,
  type RoutingStatus,
} from "./plancard-types";
import { OriginBadge, RoutingActions, RoutingBadge } from "./ActivitiesSection";
import { ModeIcon } from "./plancard-types";
import { PlanApprovalBanner } from "./PlanApprovalBanner";
import { ExpertSuggestionsPanel } from "./ExpertSuggestionsPanel";
// The action rail, in four cards (ledger `2026-09-05-slip-rail-regroup`). It owns every
// `slip-action-*` control this file used to render inline, plus the browse link, the logistics
// collapsibles, the contract board, the Trip Pass card and the budget line — one home each.
import { SlipRail } from "./SlipRail";
import { useOccasionSwitches } from "@/hooks/use-occasion-switches";
import { showsSchedule } from "@/lib/occasion-switches";
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
import { eventCountLabel, planHeaderCountLabel } from "@/lib/plan-vocabulary";
import { slipStopsLine, slipZoneLine, type SlipDestinationRow } from "@/lib/slip-meta";
import { usePlanning } from "@/contexts/PlanningContext";
import { TripExpertNote } from "./TripExpertNote";
import { ItemComments } from "./ItemComments";
import { HireExpertDialog } from "./HireExpertDialog";
// LD 42 rows 1.6 / S1 / S2 / D16 (ledger `2026-09-05-slip-own-your-plan`): the owner's own hands on
// their own plan. The RULES are pure and live in `@/lib/slip-item-tools`; the buttons and the four
// existing rails they call live in `SlipItemTools.tsx`. Nothing here restates either (§18 rule 1).
import { SlipAddItemControl, SlipItemTools } from "./SlipItemTools";
import {
  resolveAddDayNumber,
  slipItemTools,
  SLIP_ADD_DAY_LABEL,
  SLIP_ADD_EVENT_LABEL,
} from "@/lib/slip-item-tools";
import { MapControlCenter } from "./MapControlCenter";
// LD 43(d): mount 2 of 2 — the Finalize success / finished area, and ONLY when the plan
// actually holds bookable rows. The component itself decides visibility from the vault read.
import { SavePaymentMethodPrompt } from "@/components/payment/SavePaymentMethodPrompt";
import {
  EXPERT_NOTE_TINT,
  OPTIMIZED_TINT,
  ROUTING_TINTS,
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
  travelers: number;
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
}

export interface SlipData extends PlanCardData {
  trip?: SlipTrip;
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

/** Short human vocabulary for diary from/to statuses. */
const STATUS_SHORT: Record<string, string> = {
  in_planning: "planning",
  with_expert: "with expert",
  ready_for_checkout: "in checkout",
  purchased: "purchased",
};

function isPurchasedRow(a: PlanCardActivity): boolean {
  return !!a.booking || a.routingStatus === "purchased";
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
function slipDayHeading(day: {
  dayNum: number | null;
  date?: string | null;
  dateIso?: string | null;
}): string {
  const parsed = parseTripDate(day.dateIso ?? null);
  if (parsed) return format(parsed, "EEEE · MMM d");
  if (day.dayNum == null) return SLIP_UNDATED_SLOT_HEADING;
  // No machine date. Keep the pre-existing heading verbatim, including its own date-when-present.
  return `Day ${day.dayNum}${day.date ? ` · ${day.date}` : ""}`;
}

// ── SlipHeader ─────────────────────────────────────────────────────────────────────────

function SlipHeader({
  data,
  hasOptimized,
  eventCount,
  partyLabel,
  isHidden,
  isOwner,
  onEditStops,
}: {
  data: SlipData;
  hasOptimized: boolean;
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
   * S6 — opens the ONE plan modal, whose step 2 IS the ordered stop-list editor. Deliberately a
   * callback rather than an editor of its own: Locked Decision 34 gives the client ONE stop writer
   * (`plan-stops-writer.ts`), and the modal's step 2 is its ONE editing surface. A second list
   * editor here would be a second caller of that writer with its own read-before-replace, which is
   * exactly the mistake the replace-list contract warns about (a caller that sends a list it did
   * not first read silently drops stops it never saw).
   */
  onEditStops: () => void;
}) {
  const trip = data.trip;
  const start = safeDate(trip?.startDate);
  const end = safeDate(trip?.endDate);
  const phase = derivePhase(start, end);
  const version = trip?.planVersion;

  // ── S6 / S7 — WHERE THIS PLAN GOES, AND WHICH ZONE ITS TIMES ARE READ IN ────────────────────
  // Both lines are §13 rules first (see `@/lib/slip-meta`): the stops line falls back EXPLICITLY
  // to `trips.destination` when the plan has no `trip_destinations` rows (Locked Decision 34 — no
  // backfill, so that is every legacy plan and the absence is not an error), and the zone line is
  // OMITTED ENTIRELY when `trips.timezone` is unset (Locked Decision 30 — never UTC, never the
  // server's zone, never a guess). Neither derives a distance, a duration or a route: the arrow is
  // an ORDER (Locked Decision 22(c)).
  const stopsLine = slipStopsLine(trip?.destination, data.destinations);
  const zoneLine = slipZoneLine(trip?.timezone);

  return (
    <div className="space-y-1.5" data-testid="slip-header">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tracking ref: mono, muted. NULL trackingNumber → render nothing for it (never invent). */}
        <span className="font-mono text-xs text-muted-foreground" data-testid="slip-tracking-ref">
          {trip?.trackingNumber ? `Slip ${trip.trackingNumber}` : null}
          {trip?.trackingNumber && version != null ? " · " : null}
          {version != null ? `v${version}` : null}
        </span>
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
        {hasOptimized && data.lastComparisonId && (
          <Link
            href={`/itinerary-comparison/${data.lastComparisonId}`}
            className="text-[10px] font-semibold underline underline-offset-2 text-muted-foreground hover:text-foreground"
            data-testid="slip-see-what-changed"
          >
            See what changed
          </Link>
        )}
      </div>
      <h1 className={`${SLIP_TITLE_FONT_CLASS} text-2xl font-bold text-foreground`} data-testid="slip-title">
        {trip?.title || trip?.destination || "Trip plan"}
      </h1>
      <p className="text-sm text-muted-foreground" data-testid="slip-meta">
        {start && end ? `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}` : null}
        {start && end && partyLabel ? " · " : null}
        {partyLabel ? (
          <span className="inline-flex items-center gap-1" data-testid="slip-meta-party">
            <Users className="w-3.5 h-3.5 inline" />
            {partyLabel}
          </span>
        ) : null}
        {/* THE EVENT COUNT (re-audit A16). The SAME derivation the Trip Strip's chip already
            renders — `countPlanEvents` / `eventCountLabel` — never a second count (§18 rule 1),
            and hidden at zero exactly as the chip is: a plan with no `user_experiences` row has
            only its one implicit unnamed event, which is not a row and is never counted as one,
            so "0 events" would be a claim about the plan rather than a count (§13). */}
        {eventCount > 0 ? (
          <span data-testid="slip-meta-events">
            {(start && end) || partyLabel ? " · " : null}
            {eventCountLabel(eventCount)}
          </span>
        ) : null}
      </p>
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
      {data.aiSketch === true && (
        <p className="text-xs text-muted-foreground" data-testid="slip-ai-sketch-note">
          <Sparkles className="w-3 h-3 inline mr-1" />
          This is an AI starting sketch — one version, without live prices. Optimize builds three
          proposals around it, anchored to what you have already booked.
        </p>
      )}
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
    if (isPurchasedRow(a)) counts.purchased++;
    else if (a.routingStatus) counts[a.routingStatus]++;
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

// ── ExpertNoteBlock ────────────────────────────────────────────────────────────────────

function ExpertNoteBlock({ note, expertName }: { note: string; expertName: string | null }) {
  // Bordered inset, teal label, NEVER truncated to invisibility (full note body renders).
  return (
    <div
      className="mt-2 rounded-md border-l-2 bg-muted/30 px-3 py-2"
      style={{ borderLeftColor: EXPERT_NOTE_TINT.border }}
      data-testid="slip-expert-note"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: EXPERT_NOTE_TINT.fg }}>
        Note from {expertName || "your expert"}
      </p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{note}</p>
    </div>
  );
}

// ── Item + logistics rows ──────────────────────────────────────────────────────────────

function secondaryLine(a: PlanCardActivity, expertName: string | null): string | null {
  if (isPurchasedRow(a)) {
    // "booked" + confirmation ref ONLY when a real ref exists (item's own confirmationNumber,
    // else the real booking row's short id) — no ref → just "booked", never a placeholder.
    const ref = a.confirmationNumber || (a.booking ? a.booking.id.slice(0, 8) : null);
    return ref ? `booked · #${ref}` : "booked";
  }
  if (a.routingStatus === "with_expert") {
    // Render a name ONLY when the DTO actually carries one — never invented.
    return expertName ? `With ${expertName}` : "With your expert";
  }
  if (a.routingStatus === "ready_for_checkout") {
    return a.cost > 0 ? `$${a.cost.toLocaleString()} · awaiting checkout` : "awaiting checkout";
  }
  // in_planning: the DTO carries no traveler-note field — blank is the honest render (§13).
  return null;
}

function SlipItemRow({
  tripId,
  activity,
  isOwner,
  isExpertViewer,
  hasAdvisor,
  expertName,
  hasOptimized,
  highlighted,
  rowRef,
  dayNumber,
  dayItemIds,
  groupItemIds,
}: {
  tripId: string;
  activity: PlanCardActivity;
  isOwner: boolean;
  isExpertViewer: boolean;
  /**
   * S3 — an advisor in a §12 access status is on this plan. Resolved ONCE by `SlipView` (see the
   * note beside `hasAdvisor` there) and handed down, never re-asked per row: a per-row advisor
   * query would be N requests for one fact about the plan.
   */
  hasAdvisor: boolean;
  expertName: string | null;
  hasOptimized: boolean;
  highlighted: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  /** The plan day this row sits on — `null` for a slot the events alone brought into being. */
  dayNumber: number | null;
  /** The DAY's ordered ids (what the reorder rail rewrites) and this row's GROUP's ordered ids
   *  (what "up" and "down" mean on screen). Both are needed; see `reorderedDayItemIds`. */
  dayItemIds: readonly string[];
  groupItemIds: readonly string[];
}) {
  const a = activity;
  const purchased = isPurchasedRow(a);
  const secondary = secondaryLine(a, expertName);
  // D16 — OWNER ONLY, and the money rules of the ratified `ItemRow` artboard: a paid row carries no
  // tools at all, a booked row keeps reorder and edit and loses ✕. Decided by the ONE shared
  // predicate the DELETE rail refuses on (`@shared/itinerary-item-money`), never a second copy.
  const tools = slipItemTools({
    isOwner,
    routingStatus: a.routingStatus ?? null,
    bookingId: a.booking?.id ?? null,
  });
  const showActions =
    (isOwner || isExpertViewer) && a.routingStatus != null && !a.booking && a.routingStatus !== "purchased";

  return (
    <div
      ref={rowRef}
      className={`py-3 px-3 rounded-lg transition-shadow ${
        highlighted ? "ring-2 ring-primary/60 bg-primary/5" : ""
      }`}
      data-testid={`slip-item-${a.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground flex items-center gap-1.5">
            {/* Spec B anchor glyph: purchased items are the plan's fixed points once a real
                optimization was applied. */}
            {purchased && hasOptimized && (
              <Anchor className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ROUTING_TINTS.purchased.fg }} data-testid={`slip-anchor-${a.id}`} />
            )}
            <span className="truncate">{a.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {a.time ? a.time : null}
            {a.time && a.location ? " · " : null}
            {a.location || null}
          </p>
          {secondary && <p className="text-xs text-muted-foreground mt-0.5">{secondary}</p>}
          {purchased && hasOptimized && (
            <p className="text-xs text-muted-foreground italic">fixed point — plan built around it</p>
          )}
          {/* NOTE (§13): per-item move annotations ("day 1 → day 5 · rationale") have NO data
              source on this DTO — apply does not persist variant move metadata onto
              itinerary_items — so none render. Real data only. */}
          {a.expertNote && <ExpertNoteBlock note={a.expertNote} expertName={expertName} />}
          {/* ── S3 · "ASK YOUR EXPERT ABOUT THIS" (ledger `2026-09-06-slip-small-additions`) ─────
              The ratified `ItemRow` artboard draws this directly under the Expert Note block, and
              it is the EXISTING per-item thread (`ItemComments`, migration 165 — the same
              component the Trip Card's ActivitiesSection and the Workstation's item editor mount,
              against the same `GET/POST /api/trips/:tripId/items/:itemId/comments` rails). One
              component, one more mount; a second per-item thread beside it would be the drift
              class §18 rule 1 names, and it is how the traveler's question and the expert's answer
              would end up in two places.

              DRAWN ONLY WHEN THERE IS SOMEBODY TO ASK, and for the two people who are on the
              conversation: the OWNER and the ADVISOR. With no advisor on the plan the line is
              ABSENT, not greyed — there is nobody it could address (§13), which is the artboard's
              own annotation and the same posture the rail's expert row takes.

              NO FABRICATED COUNT. The component's toggle shows a count from its OWN real per-item
              read, never from this DTO: the plancard activity carries no comment count, and a
              number derived here would be a guess. An empty thread reads "No comments yet". */}
          {hasAdvisor && (isOwner || isExpertViewer) && (
            <ItemComments tripId={tripId} itemId={a.id} className="mt-2" />
          )}
          {showActions && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2" data-testid={`slip-routing-actions-${a.id}`}>
              <RoutingActions
                tripId={tripId}
                itemId={a.id}
                routingStatus={a.routingStatus}
                hasBooking={!!a.booking}
                actor={isOwner ? "owner" : "expert"}
              />
            </div>
          )}
          {/* S2 — ↑ ↓ ✎ ✕. The component renders nothing at all when the toolset is empty, so an
              advisor's row and a paid row are byte-identical to what they were before this lane. */}
          <SlipItemTools
            tripId={tripId}
            itemId={a.id}
            tools={tools}
            dayNumber={dayNumber}
            dayItemIds={dayItemIds}
            groupItemIds={groupItemIds}
          />
        </div>
        {/* Status pill right-aligned — the SAME RoutingBadge every surface renders (ruling 8);
            the slip shows the neutral Planning pill too (showPlanning).

            THE ORIGIN CHIP SITS BESIDE IT, AFTER IT, exactly as the ratified `ItemRow` artboard
            draws the cluster (callout ②): the routing pill answers WHERE THE ITEM IS, the origin
            chip answers WHO PUT IT THERE, and they are two taxonomies rather than one — which is
            why the chip is a second pill and never a fourth routing value. Both render from the
            DTO alone; `OriginBadge` returns null (no chip, no gap) for an item whose `origin` was
            never stamped, so a legacy plan's rows are byte-identical to before this lane (§13). */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <RoutingBadge activity={a} showPlanning />
          <OriginBadge activity={a} />
        </div>
      </div>
    </div>
  );
}

/**
 * THE EVENT HEADER'S HIRE AFFORDANCE (ledger `2026-09-04-hire-from-slip`; clause (c) of
 * `2026-09-04-slip-precondition`).
 *
 * Owner-only, and deliberately TWO states and no more:
 *
 *  - NO advisor on the plan yet => "Hire an expert", which opens the picker for THIS event
 *    (`HireExpertDialog`); the event's occasion supplies the role chips (Locked Decision 31).
 *  - AN advisor exists => their standing, said plainly. `pending` is "Request sent - awaiting
 *    <name>": the invitation is out and the expert has accepted nothing, which is exactly what
 *    Locked Decision 12 means when it says a PENDING advisor may not write. NO ETA is shown -
 *    nothing on the platform knows when this expert will answer, and a guessed one would be the
 *    §13 fabricated-claim class.
 *
 * IT SAYS "THIS PLAN", NOT "THIS EVENT", ON PURPOSE. `trip_expert_advisors` is keyed
 * (trip, expert) and has no event column - this lane did not add one - so the row that exists is
 * a PLAN-level advisor. The affordance sits on the event header because that is where the
 * traveler decides, but the sentence never claims an expert belongs to the event. Where several
 * experts are on one plan, `GET /api/trips/:id/expert-advisor` returns the most recent
 * pending/accepted one, so this line is incomplete rather than wrong - recorded in the ledger.
 */
function EventHireAffordance({
  tripId,
  destination,
  event,
}: {
  tripId: string;
  destination: string | null | undefined;
  event: PlanEvent;
}) {
  const [open, setOpen] = useState(false);
  // The owner-gated advisor read the slip's own AssignExpertSlot already uses - one endpoint,
  // one cache entry, no second query shape for the same fact.
  const { data } = useQuery<{
    advisor: { status?: string | null; first_name?: string | null; last_name?: string | null } | null;
  }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled: !!tripId,
  });
  const advisor = data?.advisor ?? null;

  if (advisor) {
    const name = [advisor.first_name, advisor.last_name].filter(Boolean).join(" ").trim();
    const label =
      advisor.status === "pending"
        ? `Request sent — awaiting ${name || "your expert"}`
        : `${name || "An expert"} is advising this plan`;
    return (
      <p className="mt-1 text-[11px] text-muted-foreground" data-testid={`slip-event-advisor-${event.id}`}>
        {label}
      </p>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1 h-6 px-1.5 text-[11px] text-primary hover:text-primary"
        onClick={() => setOpen(true)}
        data-testid={`slip-event-hire-${event.id}`}
      >
        <UserPlus className="w-3 h-3 mr-1" />
        Hire an expert
      </Button>
      {open && (
        <HireExpertDialog
          tripId={tripId}
          destination={destination}
          event={event}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
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
  destination,
  isOwner,
  addDayNumber,
  children,
}: {
  event: PlanEvent;
  tripId: string;
  destination: string | null | undefined;
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
              <EventHireAffordance tripId={tripId} destination={destination} event={event} />
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

function LogisticsRow({ leg }: { leg: PlanCardTransport }) {
  const fromOptimizer = leg.suggestedBy === "ai";
  return (
    <div
      className="py-2 px-3 flex items-center justify-between gap-3 text-muted-foreground"
      data-testid={`slip-logistics-${leg.id}`}
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <ModeIcon mode={leg.mode} className="w-3.5 h-3.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs truncate">
            {leg.fromName || leg.from} → {leg.toName || leg.to}
            {leg.duration ? ` · ${leg.duration} min` : ""}
            {leg.cost ? ` · $${leg.cost}` : ""}
          </p>
          {/* Spec B: attributable from real data only (the assembler's machine-leg marker). */}
          {fromOptimizer && <p className="text-[11px] italic">added by optimizer</p>}
        </div>
      </div>
      {/* Muted outline pill labeled "logistics" — never a routing pill, never actions. */}
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border border-border text-muted-foreground flex-shrink-0">
        logistics
      </span>
    </div>
  );
}

// ── TransitionLogFooter ────────────────────────────────────────────────────────────────

function actorLabel(t: TripPlanTransition, expertName: string | null): string {
  switch (t.actorType) {
    case "traveler":
      return "you";
    case "expert":
      return expertName || "expert";
    case "checkout":
      return "checkout";
    case "optimizer":
      return "optimizer";
    case "refund":
      return "refund";
    default:
      return t.actorType;
  }
}

function transitionText(t: TripPlanTransition, itemTitleById: Map<string, string>): string {
  if (t.eventType === "variant_applied") return "optimized plan applied";
  const subject = t.itemId ? itemTitleById.get(t.itemId) || "(removed item)" : "plan";
  const from = t.fromStatus ? STATUS_SHORT[t.fromStatus] || t.fromStatus : null;
  const to = t.toStatus ? STATUS_SHORT[t.toStatus] || t.toStatus : null;
  if (from && to) return `${subject} ${from} → ${to}`;
  if (to) return `${subject} → ${to}`;
  return subject;
}

function TransitionLogFooter({
  transitions,
  planVersion,
  itemTitleById,
  expertName,
}: {
  transitions: TripPlanTransition[];
  planVersion: number;
  itemTitleById: Map<string, string>;
  expertName: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (transitions.length === 0) return null; // history starts when the log starts — honest

  const shown = expanded ? transitions : transitions.slice(0, 3);

  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2" data-testid="slip-transition-log">
      <div className="space-y-1">
        {shown.map((t, i) => {
          const d = safeDate(t.createdAt);
          // Newest-first: entry i is version (total − i). Display-only, from the real count.
          const v = planVersion - i;
          return (
            <p key={t.id} className="font-mono text-xs text-muted-foreground" data-testid={`slip-log-entry-${t.id}`}>
              {v > 0 ? `v${v} · ` : ""}
              {d ? `${format(d, "MMM d")} · ` : ""}
              {transitionText(t, itemTitleById)} ({actorLabel(t, expertName)})
            </p>
          );
        })}
      </div>
      {transitions.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          data-testid="slip-log-toggle"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "collapse log" : "view full log"}
        </button>
      )}
    </div>
  );
}

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
  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="slip-trip-card-primary-banner">
      <CardContent className="p-4 flex items-center gap-2 flex-wrap">
        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm font-medium text-foreground">Your Trip Card is ready</p>
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

export function SlipView({
  tripId,
  data,
  highlightItemId,
}: {
  tripId: string;
  data: SlipData;
  highlightItemId?: string | null;
}) {
  const days: PlanCardDay[] = data.days ?? [];
  const isOwner = data.tripRole === "owner";
  const isExpertViewer = data.tripRole === "expert";
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
    enabled: !!tripId,
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
  const transitions = data.recentTransitions ?? [];
  const hasOptimized = transitions.some((t) => t.eventType === "variant_applied");
  const planVersion = data.trip?.planVersion ?? transitions.length;
  // R-F: `finalized_at ∨ now ≥ startDate−48h ∨ underway → Trip Card is primary` — the SAME rule
  // the server-side T-48h scheduler applies, read straight off this DTO's real fields.
  const isPrimary = data.trip ? tripCardIsPrimary(primaryInputFromTrip(data.trip)) : false;

  const allActivities = useMemo(() => days.flatMap((d) => d.activities), [days]);
  const itemTitleById = useMemo(
    () => new Map(allActivities.map((a) => [a.id, a.name])),
    [allActivities],
  );

  // ── List | Map view toggle (ledger 2026-08-22-slip-map-view) ──────────────────────────
  // The map is the SAME MapControlCenter the PlanCard mounts (L6 — one implementation, one
  // more mount) over the SAME plancard DTO this slip already fetched. §13/§22 honesty: only
  // located items (lat+lng present) are pinned — the count line below matches the map's own
  // filter exactly; unlocated items are named under the map, never guessed onto it; and at
  // ZERO located items the Map view is not offered at all (disabled control with the true
  // reason — the same title-reason pattern the Optimize button uses).
  const [slipView, setSlipView] = useState<"list" | "map">("list");
  const [mapDay, setMapDay] = useState(0);
  // LD 43(d): "the plan holds bookable rows" = something staged for checkout, or already booked.
  // Derived from the rows this surface already has — no new fetch, and no claim when there are none.
  const hasBookableRows = useMemo(
    () => allActivities.some((a) => a.routingStatus === "ready_for_checkout" || isPurchasedRow(a)),
    [allActivities],
  );
  const locatedActivities = useMemo(
    () => allActivities.filter((a) => a.lat != null && a.lng != null),
    [allActivities],
  );
  const unlocatedActivities = useMemo(
    () => allActivities.filter((a) => a.lat == null || a.lng == null),
    [allActivities],
  );
  const mapDisabledReason =
    locatedActivities.length === 0
      ? "No stops are located yet — items need map locations before they can be shown on a map"
      : null;

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

  return (
    <div className="max-w-2xl mx-auto space-y-5" data-testid={`slip-view-${tripId}`}>
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
      {isOwner && <PlanApprovalBanner tripId={tripId} planApproval={data.meta?.planApproval} />}

      <SlipHeader
        data={data}
        hasOptimized={hasOptimized}
        eventCount={countPlanEvents(planEvents)}
        partyLabel={partyLabel}
        isHidden={occasionIsHidden}
        isOwner={isOwner}
        /* S6 — the ONE plan modal, whose step 2 IS the ordered stop-list editor (Locked Decision
           34's one-writer rule). The SAME opener the Trip Strip's Edit uses, with no source: the
           modal reads the plan the traveler is already on. */
        onEditStops={() => openPlanModal()}
      />

      {/* THE STATUS STRIP — routing-status counts and nothing else. It keeps the ONE taxonomy the
          slip has always shown (in planning · with expert · in checkout · purchased) and stays
          zero-omitting: a status no row is in is not a segment (§13). It does not count ORIGINS —
          who added a row is a per-row fact the item rows carry, and a second population summed
          into this line would read as the same taxonomy while answering a different question. */}
      <SlipStatusStrip activities={allActivities} />

      {/* ── THE ACTION RAIL, IN FOUR CARDS (ledger `2026-09-05-slip-rail-regroup`) ────────────
          Build · Plan · Share · Finish, above the List | Map toggle and the day list. It replaces
          the flat `slip-action-*` button row, and the regrouping is the ruling: every rail keeps
          exactly ONE home, and the two that had grown a second one (Add all to checkout, Preview
          Trip Card) are gone rather than re-placed. `budgetLine` and `planEvents` are HANDED DOWN
          — the derivations stay this component's and are never recomputed inside the rail
          (§18 rule 1). */}
      {data.trip && (
        <SlipRail
          trip={data.trip}
          tripId={tripId}
          isOwner={isOwner}
          isPrimary={isPrimary}
          activities={allActivities}
          planEvents={planEvents}
          budgetLine={budgetLine}
        />
      )}

      {/* List | Map toggle — map offered only when at least one stop is genuinely located. */}
      {allActivities.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="slip-view-toggle">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${slipView === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setSlipView("list")}
              data-testid="button-slip-view-list"
            >
              <ListIcon className="w-3.5 h-3.5" /> List
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${slipView === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"} disabled:opacity-50 disabled:cursor-not-allowed`}
              onClick={() => setSlipView("map")}
              disabled={!!mapDisabledReason}
              title={mapDisabledReason ?? undefined}
              data-testid="button-slip-view-map"
            >
              <MapIcon className="w-3.5 h-3.5" /> Map
            </button>
          </div>
          {slipView === "map" && (
            <span className="text-xs text-muted-foreground" data-testid="text-slip-map-located">
              <span className="font-semibold text-foreground">
                {locatedActivities.length} of {allActivities.length}
              </span>{" "}
              stop{allActivities.length === 1 ? "" : "s"} located
            </span>
          )}
        </div>
      )}

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
          <MapControlCenter
            tripId={tripId}
            tripDestination={data.trip.destination ?? ""}
            days={sortedDays}
            selectedDay={Math.min(mapDay, Math.max(0, sortedDays.length - 1))}
            onSelectDay={setMapDay}
            expertTravelerNote={data.trip.expertTravelerNote}
          />
          {/* §13: unlocated items are NAMED, never guessed onto the map. */}
          {unlocatedActivities.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-slip-map-unlocated">
              Not on the map yet: {unlocatedActivities.map((a) => a.name).join(" · ")}
            </p>
          )}
        </div>
      ) : (
      <Card>
        <CardContent className="p-2 sm:p-3 divide-y divide-border">
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
          {showsSlipEmptyState(daySlots.length, occasionResolved) ? (
            <p
              className="text-sm text-muted-foreground p-4 text-center"
              data-testid="slip-empty-items"
            >
              No items on this plan yet.
            </p>
          ) : daySlots.length === 0 ? (
            <div className="p-4 space-y-2" data-testid="slip-day-list-loading" aria-hidden="true">
              <div className="h-4 rounded bg-muted animate-pulse w-1/3" />
              <div className="h-4 rounded bg-muted animate-pulse w-2/3" />
              <div className="h-4 rounded bg-muted animate-pulse w-1/2" />
            </div>
          ) : null}
          {daySlots.map((slot) => {
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
              <div key={slot.key} className="py-2 first:pt-0 last:pb-0">
                {/* THE DAY HEADING NAMES THE DAY (re-audit A17, the ratified `Slip` artboard's
                    "Friday · Oct 2"). A traveler reads a plan by the days of the week it falls on;
                    "Day 1" is the plan's internal index and tells them nothing they can act on.
                    §13 — the ordinal is the FALLBACK, not the decoration: a plan whose start date
                    is unknown has no weekday to name (`dateIso` is null and `dayDateIso` never
                    guesses one), and it keeps "Day 1" rather than being given a weekday. A slot the
                    EVENTS alone brought into being has no ordinal at all, so an undated one reads
                    "Undated" — our knowledge, never a day we picked for it. */}
                <p
                  className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  data-testid={`slip-day-heading-${slot.dayNum ?? slot.key}`}
                >
                  {slipDayHeading({
                    dayNum: slot.dayNum,
                    date: day?.date ?? null,
                    dateIso: slot.dateIso,
                  })}
                </p>
                {slot.groups.map((group) => {
                  const groupItemIds = group.items.map((a) => a.id);
                  const rows = group.items.map((a) => (
                    <SlipItemRow
                      key={a.id}
                      tripId={tripId}
                      activity={a}
                      isOwner={isOwner}
                      isExpertViewer={isExpertViewer}
                      hasAdvisor={hasAdvisor}
                      expertName={expertName}
                      hasOptimized={hasOptimized}
                      highlighted={highlighted === a.id}
                      rowRef={(el) => {
                        rowRefs.current[a.id] = el;
                      }}
                      dayNumber={slot.dayNum}
                      dayItemIds={dayItemIds}
                      groupItemIds={groupItemIds}
                    />
                  ));
                  // The implicit group carries NO heading — NULL is the plan's own unnamed event,
                  // not an "unassigned" bucket, and a label here would be a name nobody wrote (§13).
                  return group.event ? (
                    <SlipEventGroupBlock
                      key={group.key}
                      event={group.event}
                      tripId={tripId}
                      destination={data.trip?.destination}
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
                {/* Logistics stay at DAY level: a leg connects two stops and carries no event link
                    of its own, so it is never filed under one (§13). */}
                {(day?.transports ?? []).map((leg) => (
                  <LogisticsRow key={leg.id} leg={leg} />
                ))}
                {/* S1's second control: the plan's ONE implicit unnamed event has no header to hang
                    an add on, and a day with no events has no event header at all. `null` is that
                    event — a real answer, not an absence (Locked Decision 29) — so the day-level
                    control passes exactly that. Owner only (D16).
                    Omitted entirely on a slot with no resolvable day: such a slot exists ONLY
                    because an undated event put it there, its own event header already says what
                    is missing, and an item filed under the implicit event there would have no day
                    to sit on (§13 — the absence is explained once, not twice). */}
                {isOwner && addDayNumber != null && (
                  <div className="px-3 pt-1.5 pb-0.5">
                    <SlipAddItemControl
                      tripId={tripId}
                      dayNumber={addDayNumber}
                      userExperienceId={null}
                      label={SLIP_ADD_DAY_LABEL}
                      testId={`slip-day-add-${slot.key}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
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
      <ExpertSuggestionsPanel tripId={tripId} className="border-t border-border pt-5" />

      <TransitionLogFooter
        transitions={transitions}
        planVersion={planVersion}
        itemTitleById={itemTitleById}
        expertName={expertName}
      />
    </div>
  );
}
