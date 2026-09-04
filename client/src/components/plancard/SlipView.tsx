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
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileDown,
  List as ListIcon,
  Loader2,
  Map as MapIcon,
  Share2,
  ShoppingCart,
  Sparkles,
  Ticket,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { parseTripDate } from "@/lib/calendar-date";
import { apiRequest, queryClient } from "@/lib/queryClient";
import StripeCheckout from "@/components/booking/StripeCheckout";
import {
  createComparison,
  type ComparisonPinnedAnchor,
} from "@/lib/create-comparison";
import {
  confirmOptimizationPayment,
  requestOptimizationGate,
  type OptimizationPaymentSheet,
} from "@/lib/optimization-gate";
import {
  countOptimizableItems,
  runBulkRouteToCheckout,
  selectBulkCheckoutItems,
  slipOptimizeDisabledReason,
  summarizeBulkRoute,
} from "@/lib/slip-plan-actions";
import type { TripPlanTransition } from "@shared/trip-plan";
import { tripCardForcedPrimaryByDateAlone, tripCardIsPrimary } from "@shared/trip-primary-surface";
import {
  type PlanCardActivity,
  type PlanCardData,
  type PlanCardDay,
  type PlanCardTransport,
  type RoutingStatus,
} from "./plancard-types";
import { RoutingActions, RoutingBadge } from "./ActivitiesSection";
import { ModeIcon } from "./plancard-types";
import { PlanApprovalBanner } from "./PlanApprovalBanner";
import { AssignExpertSlot } from "./AssignExpertDialog";
import { ExpertSuggestionsPanel } from "./ExpertSuggestionsPanel";
import { SlipLogisticsSection } from "./SlipLogisticsSection";
import { useOccasionSwitches } from "@/hooks/use-occasion-switches";
import { showsSchedule } from "@/lib/occasion-switches";
import {
  eventMetaLine,
  groupItemsByEvent,
  IMPLICIT_EVENT_GROUP_KEY,
  type PlanEvent,
} from "@/lib/slip-events";
import { HireExpertDialog } from "./HireExpertDialog";
import { MapControlCenter } from "./MapControlCenter";
import { FinalizeBookingModal } from "./FinalizeBookingModal";
import { BuildAroundDialog } from "./BuildAroundDialog";
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

// ── SlipHeader ─────────────────────────────────────────────────────────────────────────

function SlipHeader({ data, hasOptimized }: { data: SlipData; hasOptimized: boolean }) {
  const trip = data.trip;
  const start = safeDate(trip?.startDate);
  const end = safeDate(trip?.endDate);
  const phase = derivePhase(start, end);
  const version = trip?.planVersion;

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
      </div>
      <h1 className={`${SLIP_TITLE_FONT_CLASS} text-2xl font-bold text-foreground`} data-testid="slip-title">
        {trip?.title || trip?.destination || "Trip plan"}
      </h1>
      <p className="text-sm text-muted-foreground" data-testid="slip-meta">
        {start && end ? `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}` : null}
        {start && end && trip?.travelers ? " · " : null}
        {trip?.travelers ? (
          <span className="inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5 inline" />
            {trip.travelers} traveler{trip.travelers > 1 ? "s" : ""}
          </span>
        ) : null}
      </p>
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
  expertName,
  hasOptimized,
  highlighted,
  rowRef,
}: {
  tripId: string;
  activity: PlanCardActivity;
  isOwner: boolean;
  isExpertViewer: boolean;
  expertName: string | null;
  hasOptimized: boolean;
  highlighted: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const a = activity;
  const purchased = isPurchasedRow(a);
  const secondary = secondaryLine(a, expertName);
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
        </div>
        {/* Status pill right-aligned — the SAME RoutingBadge every surface renders (ruling 8);
            the slip shows the neutral Planning pill too (showPlanning). */}
        <RoutingBadge activity={a} showPlanning />
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
 * One EVENT inside the day (migration 277; ledger `2026-09-04-slip-events`). A bordered inset
 * around the items that name this `user_experiences` row — the same inset grammar
 * `ExpertNoteBlock` uses, drawn from theme tokens so it follows light/dark like everything else.
 *
 * WHAT IT MAY SAY, and what it may not (§13):
 *  - the event's TITLE when the row has one. A row with no title gets no title line — never an
 *    "Untitled event", which is a name nobody wrote.
 *  - its DATE and its PLACE when set. `user_experiences.event_date` is a DATE column with NO
 *    time-of-day anywhere on the row, so no clock time is rendered — a start time here would be
 *    manufactured, and this surface has no source for one.
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
  children,
}: {
  event: PlanEvent;
  tripId: string;
  destination: string | null | undefined;
  isOwner: boolean;
  children: ReactNode;
}) {
  // ONE derivation, shared with the "Which event?" picker (ledger `2026-09-04-which-event-picker`):
  // date-when-set · place-when-set, and never a clock time. Restating it here is the drift class
  // §18 rule 1 names — and the second copy is exactly where a fabricated start time gets written.
  const meta = eventMetaLine(event);
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
          {isOwner && <EventHireAffordance tripId={tripId} destination={destination} event={event} />}
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

function useFinalizeMutation(tripId: string) {
  const { toast } = useToast();
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
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      // Phase 3 rider 2 (ledger 2026-08-31-trip-card-snapshot-render): a re-finalize that wrote NO
      // new version says so with the version, instead of a generic success — the traveler learns
      // there was nothing to capture, not that "something happened".
      if (data.finalCreated === false) {
        toast({
          title: "Plan unchanged",
          description: `No changes since v${data.finalVersion ?? "?"} — nothing new to finalize.`,
        });
        return;
      }
      // Warn, never block (R-F): finalize has already committed by the time we know the staged
      // count, so this is an informational note, not a gate. (The pre-finalize gate lives on the
      // Adopt button — Phase 3 rider 1.)
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
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/reopen`);
      return (await res.json()) as { alreadyOpen: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't reopen plan", description: err?.message || "Please try again", variant: "destructive" });
    },
  });
}

// ── TripCardPrimaryBanner ─────────────────────────────────────────────────────────────

/** Renders only when the R-F primary rule says so (finalized ∨ T-48h window ∨ underway). Trip
 *  Card is presented as the primary surface here; "Back to planning" only shows when reopening
 *  would actually change anything — i.e. NOT when the date arm alone already forces primacy
 *  (reopen only clears `finalizedAt`; inside the window/underway the Trip Card stays primary
 *  regardless, so offering a reversal there would be dishonest — R-F). */
function TripCardPrimaryBanner({ trip, isOwner }: { trip: SlipTrip; isOwner: boolean }) {
  const reopenMutation = useReopenMutation(trip.id);
  const forcedByDateAlone = tripCardForcedPrimaryByDateAlone({ startDate: trip.startDate, endDate: trip.endDate });
  // Reopen is owner-gated server-side (verifyTripOwnership) — never render the control for a
  // non-owner viewer (e.g. the assigned expert), who would only get a 403.
  const showBackToPlanning = isOwner && !!trip.finalizedAt && !forcedByDateAlone;

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="slip-trip-card-primary-banner">
      <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm font-medium text-foreground">Your Trip Card is ready</p>
          {/* Version chip (adopt-finalize-conform D-2): with it, the Finalize Plan button's
              absence reads as COMPLETED — the confusion that opened this lane. §13: render only
              a real server-emitted version, never an invented one. */}
          {trip.finalVersion != null && (
            <span
              className="flex-shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary"
              data-testid="slip-final-version-chip"
            >
              v{trip.finalVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={`/trip/${trip.id}`}>
            <Button size="sm" data-testid="slip-action-view-trip-card">
              View Trip Card
            </Button>
          </Link>
          {showBackToPlanning && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
              data-testid="slip-action-reopen"
            >
              <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Back to planning
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── SlipActions ────────────────────────────────────────────────────────────────────────

function SlipActions({
  trip,
  isOwner,
  activities,
}: {
  trip: SlipTrip;
  isOwner: boolean;
  activities: PlanCardActivity[];
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const finalizeMutation = useFinalizeMutation(trip.id);
  /**
   * A HIDDEN OCCASION HAS NO SHARE LINK (migration 276 `default_visibility`; ledger
   * `2026-09-03-switch-readers`). Sharing a proposal plan is the failure mode the switch exists
   * to prevent, so the Share button is not rendered — the PDF and the trip-card preview stay,
   * because neither hands anyone a link.
   *
   * §13: unresolved occasion or NULL column ⇒ NOT hidden, i.e. exactly today's behaviour. That is
   * also what a viewer who cannot read the trip row gets, and it is the right direction: an
   * undecided occasion must not lose its Share button.
   */
  const { isHidden: occasionHidden } = useOccasionSwitches(trip.id);

  // ── A1: Optimize this plan — the SAME shared gate sequence cart.tsx runs
  // (lib/optimization-gate.ts), fed from this trip's real DTO fields. The server reads the
  // trip's own in_planning + ready_for_checkout items (loadTripOptimizerInputs), so no
  // cart is required here.
  const [optimizing, setOptimizing] = useState(false);
  const [creatingComparison, setCreatingComparison] = useState(false);
  // Finalize Plan → the chooser asks "how do you want to book it?" (mock popup 3). Opened only on
  // a fresh finalize. The staged-but-unbooked warning (Phase 3 rider 1, ledger
  // 2026-08-31-trip-card-snapshot-render) now lives INSIDE the chooser (adopt-finalize-conform
  // row 13) — one press, one dialog, no separate pre-gate.
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [paySheet, setPaySheet] = useState<OptimizationPaymentSheet | null>(null);
  const [buildAroundOpen, setBuildAroundOpen] = useState(false);
  const runFinalize = () => {
    finalizeMutation.mutate(undefined, {
      // Open the "how do you want to book it?" chooser only when a NEW version was actually
      // captured (a fresh finalize or a changed re-final) — never on an unchanged re-final.
      onSuccess: (data) => {
        if (data.finalCreated !== false && !data.alreadyFinalized) setFinalizeModalOpen(true);
      },
    });
  };
  // Display-honesty fix (ledger 2026-08-29-persona-coverage-complete's filed finding):
  // startOptimization used to treat `covered_by_pass` identically to the ordinary
  // `free_rerun` — same silent proceed, no label distinguishing "this is free because you
  // have a Trip Pass" from "this is free because of the 24h window". Server truth only
  // (server/routes/optimization.routes.ts ~L276 `coveredByTripPass`); never inferred client-side.
  const [lastOptimizeCoveredByPass, setLastOptimizeCoveredByPass] = useState(false);
  const confirmedPinnedAnchorRef = useRef<ComparisonPinnedAnchor | undefined>(undefined);

  const optimizableCount = countOptimizableItems(activities);
  const optimizeDisabledReason = slipOptimizeDisabledReason({
    optimizableCount,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });

  // Guarded by optimizeDisabledReason: destination/dates are real trip fields here, never
  // invented (§13) — the action is disabled until they exist.
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
      // REVIEW-FIRST (ledger 2026-08-22-slip-optimize-review-first, decision-maker ratified):
      // a slip-originated optimization lands as a PROPOSAL the traveler reviews — money saved,
      // shorter drive time and what's trending/in-season — then confirms by applying a variant.
      // It does NOT auto-apply, so `?autoApply=1` is deliberately omitted (that flag drives the
      // cart's own auto-apply path, which is unchanged). The comparison page's default
      // (autoApply=false) is exactly this review UI.
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } finally {
      setCreatingComparison(false);
    }
  }

  async function handleOptimize() {
    if (optimizing || creatingComparison || optimizeDisabledReason) return;
    setBuildAroundOpen(true);
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
        confirmedPinnedAnchorRef.current = undefined;
        // Fix #971's pre-flight — surface the server's own reason, never swallowed.
        toast({
          title: "Nothing to optimize yet",
          description:
            (typeof outcome.body.message === "string" && outcome.body.message) ||
            "This plan has no items the optimizer can work with.",
        });
        return;
      }
      if (outcome.kind === "free_rerun" || outcome.kind === "covered_by_pass") {
        // 24h free re-run (server-side canRunOptimizer) — nothing to charge. `covered_by_pass`
        // gets the "Included in your Trip Pass" label alongside the free-run treatment.
        if (outcome.kind === "covered_by_pass") setLastOptimizeCoveredByPass(true);
        await runComparison(undefined, pinnedAnchor);
        confirmedPinnedAnchorRef.current = undefined;
        return;
      }
      if (outcome.kind === "payment_sheet") {
        setPaySheet(outcome.payment);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't start optimization",
        description: err?.message || "Please try again",
      });
      confirmedPinnedAnchorRef.current = undefined;
    } finally {
      setOptimizing(false);
    }
  }

  async function handleSheetSuccess(paymentIntentId: string) {
    const pinnedAnchor = confirmedPinnedAnchorRef.current;
    setPaySheet(null);
    try {
      await confirmOptimizationPayment(paymentIntentId);
      await runComparison(paymentIntentId, pinnedAnchor);
    } catch (err: any) {
      // Payment went through but the comparison didn't build — the server's 24h free
      // re-run window covers the retry, so say so honestly instead of a dead generic.
      toast({
        variant: "destructive",
        title: "Failed to generate itinerary",
        description: err?.message || "Your payment is recorded — try Optimize again (free re-run).",
      });
    } finally {
      confirmedPinnedAnchorRef.current = undefined;
    }
  }

  // ── A2: Add all to checkout — loops the EXISTING per-item routing endpoint over
  // in_planning items only (client-side filter; with_expert/purchased are never posted),
  // ONE cache invalidation at the end, per-item failures reported honestly.
  const [bulkPending, setBulkPending] = useState(false);
  const bulkTargets = selectBulkCheckoutItems(activities);

  async function handleBulkAddToCheckout() {
    if (bulkPending) return;
    setBulkPending(true);
    try {
      const result = await runBulkRouteToCheckout({
        items: activities,
        postRoute: (itemId) =>
          apiRequest("POST", `/api/trips/${trip.id}/items/${itemId}/route`, {
            to: "ready_for_checkout",
          }),
        invalidate: () => {
          // Same two keys RoutingActions invalidates — once for the whole batch.
          queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
          queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        },
      });
      toast(summarizeBulkRoute(result));
    } finally {
      setBulkPending(false);
    }
  }

  // Same share affordance the trip pages already use (HeroSection.handleShare):
  // clipboard copy + navigator.share of the itinerary link.
  function handleShare() {
    const shareUrl = `${window.location.origin}/itinerary/${trip.id}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    toast({ title: "Link copied!", description: "Share link copied to clipboard." });
    if (navigator.share) {
      navigator.share({ title: `${trip.title || trip.destination || "Trip"} - Traveloure`, url: shareUrl }).catch(() => {});
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="slip-actions">
      {!occasionHidden && (
        <Button variant="outline" size="sm" onClick={handleShare} data-testid="slip-action-share">
          <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share
        </Button>
      )}
      {/* Lane C (ledger 2026-09-03-slip-convergence) — the printable copy. Renders the SAME
          canonical itinerary_items this slip is showing, so the paper and the screen can never
          disagree. A plain anchor: the endpoint is session-authenticated and answers with a
          Content-Disposition attachment, so the browser saves it without a client-side blob. */}
      <Button variant="outline" size="sm" asChild data-testid="slip-action-pdf">
        <a href={`/api/trips/${trip.id}/pdf`} download>
          <FileDown className="w-3.5 h-3.5 mr-1.5" /> Download PDF
        </a>
      </Button>
      <Link href={`/trip/${trip.id}`}>
        <Button variant="outline" size="sm" data-testid="slip-action-trip-card">
          Preview Trip Card
        </Button>
      </Link>
      {/* A2 — owner-only (the routing endpoint's →ready_for_checkout edge is traveler-only);
          hidden entirely when no in_planning item exists (nothing it could do — §13). */}
      {isOwner && bulkTargets.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleBulkAddToCheckout}
          disabled={bulkPending}
          data-testid="slip-action-add-all-checkout"
        >
          {bulkPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
          )}
          Add all to checkout ({bulkTargets.length})
        </Button>
      )}
      {/* A1 — owner-only (the optimization fee charges the signed-in traveler). Disabled
          with an honest tooltip when the optimizer would have nothing to read. */}
      {isOwner && (
        <span title={optimizeDisabledReason ?? undefined} data-testid="slip-action-optimize-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOptimize}
            disabled={!!optimizeDisabledReason || optimizing || creatingComparison}
            data-testid="slip-action-optimize"
          >
            {optimizing || creatingComparison ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            )}
            {creatingComparison ? "Building..." : "Optimize this plan"}
          </Button>
        </span>
      )}
      {isOwner && lastOptimizeCoveredByPass && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--earn-border)] bg-[color:var(--earn-teal-wash)] px-2.5 py-1 text-xs font-medium text-[color:var(--earn-teal-ink)]"
          data-testid="trip-pass-covered-label"
        >
          <Ticket className="w-3.5 h-3.5" />
          Included in your Trip Pass
        </span>
      )}
      <BuildAroundDialog
        open={buildAroundOpen}
        tripId={trip.id}
        busy={optimizing || creatingComparison}
        onOpenChange={setBuildAroundOpen}
        onConfirm={(pinnedAnchor) => {
          confirmedPinnedAnchorRef.current = pinnedAnchor;
          setBuildAroundOpen(false);
          void startOptimization(pinnedAnchor);
        }}
      />
      {/* A1 payment sheet — the same StripeCheckout surface cart.tsx mounts for this fee,
          in a dialog. The fee amount shown comes from the server-created PaymentIntent. */}
      <Dialog
        open={!!paySheet}
        onOpenChange={(open) => {
          if (!open) {
            setPaySheet(null);
            confirmedPinnedAnchorRef.current = undefined;
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
                confirmedPinnedAnchorRef.current = undefined;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* Finalize Plan — the mock's lock press (adopt-finalize-conform D-2: adopt = merge on the
          comparison surfaces; THIS control is finalize = lock, and it says so). Owner-gated
          server-side (verifyTripOwnership) — never render it for a non-owner viewer. Once final,
          the primary banner (above) owns the finalized state ("Your Trip Card is ready · v{N}"
          + reopen where dates permit) — no duplicate control here. The former "Finalize without
          booking?" pre-gate is FOLDED into the chooser (D-13/row 13): FinalizeBookingModal itself
          carries the staged-but-unbooked note, so finalize is one press → one dialog. */}
      {isOwner && !trip.finalizedAt && (
        <Button
          size="sm"
          onClick={runFinalize}
          disabled={finalizeMutation.isPending}
          data-testid="slip-action-finalize-plan"
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Finalize Plan
        </Button>
      )}
      <FinalizeBookingModal
        open={finalizeModalOpen}
        onOpenChange={setFinalizeModalOpen}
        trip={{ id: trip.id, destination: trip.destination, travelers: trip.travelers }}
        activities={activities}
      />
    </div>
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
  const { occasion } = useOccasionSwitches(tripId);
  const planEvents: PlanEvent[] = data.events ?? [];
  const groupByEvent = showsSchedule(occasion) && planEvents.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5" data-testid={`slip-view-${tripId}`}>
      {/* R-F: Trip Card presented as the primary surface once the rule fires. The slip itself
          stays fully reachable below — this is a presentation flip, not a navigation away. */}
      {isPrimary && data.trip && <TripCardPrimaryBanner trip={data.trip} isOwner={isOwner} />}

      {/* Plan-approval delivery handshake (CC-11 fix, migration 164 / CLAUDE.md §18) — same
          component and same owner-only gate PlanCard.tsx:958-960 uses, fed from this page's own
          plancard DTO fetch (`meta.planApproval`, same queryKey — see slip-view.tsx). Mounted
          unconditionally like PlanCard: PlanApprovalBanner itself decides visibility from
          workspaceStatus/status (PlanApprovalBanner.tsx:84-88). This is the bell-notification
          landing surface (resolveNotificationLink rewrites /trip/:id → /plans/:tripId), so
          without this mount the delivery handshake had no Approve/Request-changes control here. */}
      {isOwner && <PlanApprovalBanner tripId={tripId} planApproval={data.meta?.planApproval} />}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SlipHeader data={data} hasOptimized={hasOptimized} />
        {data.trip && <SlipActions trip={data.trip} isOwner={isOwner} activities={allActivities} />}
      </div>

      <SlipStatusStrip activities={allActivities} />

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
          {sortedDays.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No items on this plan yet.</p>
          )}
          {sortedDays.map((day) => {
            const dayActivities = [...day.activities].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
            // Ungrouped: ONE implicit group holding the whole day, rendered as a bare Fragment —
            // the same rows in the same order with no extra wrapper, so nothing about the flat
            // day list changes for a plan with no events.
            const groups = groupByEvent
              ? groupItemsByEvent(dayActivities, planEvents)
              : [{ key: IMPLICIT_EVENT_GROUP_KEY, event: null, items: dayActivities }];
            return (
              <div key={day.dayNum} className="py-2 first:pt-0 last:pb-0">
                <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Day {day.dayNum}
                  {day.date ? ` · ${day.date}` : ""}
                </p>
                {groups.map((group) => {
                  const rows = group.items.map((a) => (
                    <SlipItemRow
                      key={a.id}
                      tripId={tripId}
                      activity={a}
                      isOwner={isOwner}
                      isExpertViewer={isExpertViewer}
                      expertName={expertName}
                      hasOptimized={hasOptimized}
                      highlighted={highlighted === a.id}
                      rowRef={(el) => {
                        rowRefs.current[a.id] = el;
                      }}
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
                    >
                      {rows}
                    </SlipEventGroupBlock>
                  ) : (
                    <Fragment key={group.key}>{rows}</Fragment>
                  );
                })}
                {/* Logistics stay at DAY level: a leg connects two stops and carries no event link
                    of its own, so it is never filed under one (§13). */}
                {(day.transports ?? []).map((leg) => (
                  <LogisticsRow key={leg.id} leg={leg} />
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>
      )}

      {/* Row 12 (relocated): one link, not a grid — browse the marketplace scoped to THIS trip.
          The /services grid's Add-to-trip targets the active trip (cart-is-slip), so a service
          added there lands on this slip. Owner-only planning affordance. */}
      {isOwner && (
        <Link href={`/services?tripId=${encodeURIComponent(tripId)}`}>
          <a className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" data-testid="slip-browse-services">
            Browse services for this trip
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </Link>
      )}

      {/* Row 10 (relocated from the trip-details expert-tab bolt-on): choosing an expert is a
          planning decision, so its home is the slip. Renders only for the owner while no expert
          is assigned. */}
      {data.trip && (
        <AssignExpertSlot tripId={tripId} destination={data.trip.destination} isOwner={isOwner} />
      )}

      {/* Row 11 (relocated): expert-suggestion accept/decline. Pre-final it acts on the live plan
          here; the same component mounts on the finalized Trip Card (PlanCard full) where accepting
          auto-creates a new final version. Renders nothing when there are no suggestions. */}
      <ExpertSuggestionsPanel tripId={tripId} className="border-t border-border pt-5" />

      {/* Rows 13/14 (relocated from the trip-details itinerary/logistics/guests tabs): temporal
          anchors + guest invites are planning inputs, so their home is the slip. Owner-only. */}
      {isOwner && <SlipLogisticsSection tripId={tripId} />}

      <TransitionLogFooter
        transitions={transitions}
        planVersion={planVersion}
        itemTitleById={itemTitleById}
        expertName={expertName}
      />
    </div>
  );
}
