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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { format, isValid } from "date-fns";
import {
  Anchor,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { TripPlanTransition } from "@shared/trip-plan";
import {
  type PlanCardActivity,
  type PlanCardData,
  type PlanCardDay,
  type PlanCardTransport,
  type RoutingStatus,
} from "./plancard-types";
import { RoutingActions, RoutingBadge } from "./ActivitiesSection";
import { ModeIcon } from "./plancard-types";
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
}

export interface SlipData extends PlanCardData {
  trip?: SlipTrip;
  /** The §4 diary — last 20 log rows, newest first. Absent on pre-BUILD-1 responses. */
  recentTransitions?: TripPlanTransition[];
  meta?: PlanCardData["meta"] & {
    deliveredBy?: { expertId: string; name: string | null; avatar: string | null } | null;
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────────────

function safeDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isValid(d) ? d : null;
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

// ── SlipActions ────────────────────────────────────────────────────────────────────────

function SlipActions({ trip }: { trip: SlipTrip }) {
  const { toast } = useToast();

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
    <div className="flex items-center gap-2" data-testid="slip-actions">
      <Button variant="outline" size="sm" onClick={handleShare} data-testid="slip-action-share">
        <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share
      </Button>
      <Link href={`/trip/${trip.id}`}>
        <Button variant="outline" size="sm" data-testid="slip-action-trip-card">
          Preview Trip Card
        </Button>
      </Link>
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

  const allActivities = useMemo(() => days.flatMap((d) => d.activities), [days]);
  const itemTitleById = useMemo(
    () => new Map(allActivities.map((a) => [a.id, a.name])),
    [allActivities],
  );

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

  return (
    <div className="max-w-2xl mx-auto space-y-5" data-testid={`slip-view-${tripId}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SlipHeader data={data} hasOptimized={hasOptimized} />
        {data.trip && <SlipActions trip={data.trip} />}
      </div>

      <SlipStatusStrip activities={allActivities} />

      <Card>
        <CardContent className="p-2 sm:p-3 divide-y divide-border">
          {sortedDays.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No items on this plan yet.</p>
          )}
          {sortedDays.map((day) => {
            const dayActivities = [...day.activities].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
            return (
              <div key={day.dayNum} className="py-2 first:pt-0 last:pb-0">
                <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Day {day.dayNum}
                  {day.date ? ` · ${day.date}` : ""}
                </p>
                {dayActivities.map((a) => (
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
                ))}
                {(day.transports ?? []).map((leg) => (
                  <LogisticsRow key={leg.id} leg={leg} />
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <TransitionLogFooter
        transitions={transitions}
        planVersion={planVersion}
        itemTitleById={itemTitleById}
        expertName={expertName}
      />
    </div>
  );
}
