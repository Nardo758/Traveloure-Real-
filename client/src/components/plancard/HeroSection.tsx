import { useToast } from "@/hooks/use-toast";
import { differenceInDays, format } from "date-fns";
import { Users, Share2, Download, CheckCircle2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { computeDayCount, type PlanCardTrip, type PlanCardDay } from "./plancard-types";
import { PlanCardHeader } from "./PlanCardHeader";
import { parseCalendarDate } from "@/lib/calendar-date";

interface HeroSectionProps {
  trip: PlanCardTrip;
  traveloureScore: number | null | undefined;
  shareToken: string | null | undefined;
  totalCost: string | null | undefined;
  perPerson: string | null;
  budget: string | null;
  /** metric-strip inputs — same numbers the summary header shows, for continuity */
  days: PlanCardDay[];
  totalActivities: number;
  totalLegs: number;
  totalMinutes: number;
  /** template-aware labels (mirrors StatsRow) */
  statsLabels: string[];
  /**
   * QA_PUNCH_LIST item 13 — the polished-final dress flip (planApproval approved, or R-F
   * finalized-primacy). Adds a quiet "Final" chip beside the existing status badge; never
   * replaces the date-derived status label above, which stays honest about trip timing
   * regardless of approval state. Defaults to false (unchanged "in planning" chrome).
   */
  finalDress?: boolean;
  /**
   * Phase 2 (ledger 2026-08-31-two-surfaces-one-handoff): the trip_finals version this card renders,
   * or null when the trip has no final (the not-final state). When present and finalized the chip
   * reads "Final · v{N}" instead of the bare "Final".
   */
  finalVersion?: number | null;
  /**
   * Phase 2: the trip has a final but was reopened for revision on the slip (finalized_at cleared).
   * The card still renders the latest final version; this shows a quiet "Plan being revised on the
   * slip" chip in place of the "Final" chip so the traveler is never left without their command
   * center mid-revision.
   */
  revising?: boolean;
}

/**
 * FinalVersionChip — the "Final · v{N}" / "Being revised" status chip, extracted so the
 * unified header (both stages, Phase 2b) renders it identically. Dark-header variant
 * (white pill) for use inside PlanCardHeader's badges slot.
 */
export function FinalVersionChip({
  tripId,
  finalDress,
  finalVersion,
  revising,
}: {
  tripId: string;
  finalDress?: boolean;
  finalVersion?: number | null;
  revising?: boolean;
}) {
  if (revising) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-white/15 text-white border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        data-testid={`badge-revising-${tripId}`}
        title="Plan being revised on the slip"
      >
        <RefreshCw className="w-3 h-3" style={{ color: "#F5C97B" }} />
        Being revised
      </span>
    );
  }
  if (finalDress) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-white/15 text-white border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        data-testid={`badge-final-dress-${tripId}`}
      >
        <CheckCircle2 className="w-3 h-3" style={{ color: "#5DCAA5" }} />
        {finalVersion != null ? `Final · v${finalVersion}` : "Final"}
      </span>
    );
  }
  return null;
}

/**
 * HeroControls — Score + Share + Export, extracted so the unified header
 * (PlanCardHeader, both stages — Phase 2b, ledger 2026-08-31-manifest-is-the-boundary)
 * keeps B3 Share single-sourced. Share (B3 💰) and Export are must-not-regress.
 */
export function HeroControls({
  trip,
  traveloureScore,
  shareToken,
}: {
  trip: PlanCardTrip;
  traveloureScore: number | null | undefined;
  shareToken: string | null | undefined;
}) {
  const { toast } = useToast();
  function handleShare() {
    const shareUrl = shareToken
      ? `${window.location.origin}/itinerary-view/${shareToken}`
      : `${window.location.origin}/itinerary/${trip.id}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    toast({ title: "Link copied!", description: "Share link copied to clipboard." });
    if (navigator.share) {
      navigator.share({ title: `${trip.title} - Traveloure`, url: shareUrl }).catch(() => {});
    }
  }
  return (
    <div className="flex gap-1.5 items-center">
      {traveloureScore != null && (
        <div className="w-8 h-8 rounded-xl bg-card flex items-center justify-center shadow-lg" data-testid={`badge-score-${trip.id}`}>
          <span className="text-xs font-bold text-foreground" data-testid={`text-score-value-${trip.id}`}>{traveloureScore}</span>
        </div>
      )}
      <button
        onClick={handleShare}
        className="bg-background/50 backdrop-blur-sm border-0 text-foreground px-2 py-1.5 rounded-lg cursor-pointer text-xs font-semibold flex items-center gap-1 hover:bg-background/70 transition-colors"
        data-testid={`button-share-${trip.id}`}
      >
        <Share2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Share</span>
      </button>
      <Link href={`/itinerary/${trip.id}`} className="hidden sm:block">
        <button
          className="bg-background/50 backdrop-blur-sm border-0 text-foreground px-2 py-1.5 rounded-lg cursor-pointer text-xs font-semibold flex items-center gap-1 hover:bg-background/70 transition-colors"
          data-testid={`button-export-${trip.id}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </Link>
    </div>
  );
}

export function HeroSection({
  trip,
  traveloureScore,
  shareToken,
  totalCost,
  perPerson,
  budget,
  days,
  totalActivities,
  totalLegs,
  totalMinutes,
  statsLabels,
  finalDress = false,
  finalVersion = null,
  revising = false,
}: HeroSectionProps) {
  // The full-stage header is now PlanCardHeader (Phase 2b) — it sources its own destination photo.
  function safeDate(raw: string | null | undefined): Date | null {
    return parseCalendarDate(raw);
  }

  const startDate = safeDate(trip.startDate);
  const endDate = safeDate(trip.endDate);
  const daysUntil = startDate ? differenceInDays(startDate, new Date()) : null;
  // Mobile-lens audit #2: mid-flight trips fell through to the generic "Planning" label
  // because daysUntil <= 0 was never handled. Ports PlanCard's own getSummaryStatusLabel
  // logic (`now >= start && now <= end → "Active"`) — same dashboard-card rule, not new
  // date math — so the hero agrees with the summary card once a trip is underway.
  const now = new Date();
  const isActiveNow = !!(startDate && endDate && now >= startDate && now <= endDate);
  const statusLabel = isActiveNow
    ? "Active"
    : daysUntil != null && daysUntil > 0
    ? (daysUntil <= 30 ? `${daysUntil}d away` : "Upcoming")
    : "Planning";

  const destinationParts = trip.destination?.split(",") || [trip.destination];
  const city = destinationParts[0]?.trim() || trip.destination;
  const country = destinationParts.slice(1).join(",").trim() || "";

  const daysCount = computeDayCount(days, trip.startDate, trip.endDate);
  const dateRange = startDate && endDate
    ? `${format(startDate, "MMM d")} – ${format(endDate, "MMM d, yyyy")}`
    : "Dates not set";

  // Phase 2b (ledger 2026-08-31-manifest-is-the-boundary): "the summary, grown up — same header."
  // The full stage now renders the SAME PlanCardHeader the summary uses (the mockup's shared
  // `.phead`), instead of a separate tall photo hero — ONE header renderer, no drift (drift-audit
  // B1). HeroSection is now the full-stage adapter: it maps its props onto PlanCardHeader and
  // composes the must-not-regress hero controls (Score / Share B3 / Export) into `topRight` and the
  // version/revision chip into `badges`. Cost teaser and the header countdown are intentionally not
  // in the shared header (the mockup shows neither) — flagged for the visual sign-off.
  return (
    <PlanCardHeader
      title={trip.title ?? ""}
      destination={trip.destination ?? ""}
      dateRange={dateRange}
      statusLabel={statusLabel}
      metrics={{
        days: daysCount,
        activities: totalActivities,
        legs: totalLegs,
        transitTime: totalMinutes > 0 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : "-",
      }}
      testId={`plancard-hero-${trip.id}`}
      badges={
        <>
          <FinalVersionChip tripId={trip.id} finalDress={finalDress} finalVersion={finalVersion} revising={revising} />
          {trip.numberOfTravelers && trip.numberOfTravelers > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-white/15 text-white border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              data-testid={`badge-travelers-${trip.id}`}
            >
              <Users className="w-3 h-3" /> {trip.numberOfTravelers}
            </span>
          )}
        </>
      }
      topRight={<HeroControls trip={trip} traveloureScore={traveloureScore} shareToken={shareToken} />}
    />
  );
}
