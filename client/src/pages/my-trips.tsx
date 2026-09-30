import { useTrips } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Plus, Loader2, Search, Grid, List, Filter, Plane, Heart, PartyPopper, Briefcase, Star, ChevronRight, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/dashboard-layout";
import { IntakePanel } from "@/components/intake-panel";
import { PlanSlipStrip } from "@/components/dashboard/PlanSlipStrip";
import { format, differenceInDays } from "date-fns";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseTripDate } from "@/lib/calendar-date";
import {
  buildPlanRowModel,
  planRowSection,
  type PlanRowAdvisorLike,
  type PlanRowModel,
  type PlanRowSection,
} from "@/lib/plan-row-model";
import type { SlipData } from "@/components/plancard/SlipView";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function formatOccasionDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return format(new Date(year, month - 1, day), "MMM d");
}

const eventTypeIcons: Record<string, any> = {
  vacation: Plane,
  wedding: Heart,
  honeymoon: Heart,
  proposal: Heart,
  anniversary: Heart,
  birthday: PartyPopper,
  corporate: Briefcase,
  adventure: Plane,
};

const filterOptions = [
  { value: "all", label: "All" },
  { value: "vacation", label: "Travel" },
  { value: "wedding", label: "Weddings" },
  { value: "birthday", label: "Birthdays" },
  { value: "corporate", label: "Corporate" },
];

// L3 (ledger `2026-09-07-my-plans-rows`): the status filter now maps onto the SAME four sections
// the page renders — one derivation (planRowSection), so the filter and the sections cannot
// disagree about where a plan belongs. "Upcoming" covers Final-ahead and In-planning alike.
const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
];

const NEXT_ACTION_LABELS: Record<string, (n: number) => string> = {
  ready_for_checkout: (n) => `${n} ready for checkout`,
  with_expert: (n) => `${n} with your expert`,
  in_planning: (n) => `${n} in planning`,
};

/**
 * L3 my-plans-rows: ONE row. It reads the SAME plancard DTO the slip strip reads (same query
 * key — shared cache, the slip page pays nothing extra) plus the owner-gated expert-advisor
 * read, and derives its whole state through `buildPlanRowModel` (pure, pinned by
 * client/src/lib/__tests__/plan-row-model.test.ts). Hoisted out of the page component so React
 * Query hooks inside it survive the parent's re-renders (an inline-defined component remounts on
 * every render, refiring them).
 */
function TripRow({ trip, viewMode, now }: { trip: any; viewMode: "grid" | "list"; now: Date }) {
  const [, setLocation] = useLocation();
  const { data: plancard } = useQuery<SlipData>({
    queryKey: [`/api/trips/${trip.id}/plancard`],
    staleTime: 30000,
  });
  const { data: advisorData } = useQuery<{ advisor: PlanRowAdvisorLike | null }>({
    queryKey: [`/api/trips/${trip.id}/expert-advisor`],
    staleTime: 60000,
  });
  const model: PlanRowModel = buildPlanRowModel(trip, plancard, advisorData?.advisor ?? null, now);

  const Icon = eventTypeIcons[trip.eventType || "vacation"] || Plane;
  // §13: the date line renders only from dates that actually parse — an absent date contributes
  // NOTHING (the old row handed null to `new Date(null)` and printed "Jan 1, 1970").
  const start = parseTripDate(trip.startDate);
  const end = parseTripDate(trip.endDate);
  const daysAway = start ? differenceInDays(start, now) : null;
  const finalVersion: number | null = trip.finalVersion ?? null;

  return (
    <div>
      {/* The slip strip the dashboard already fetches (R-A), now carried per row (L3):
          tracking ref + real routing-status counts, nothing when nothing is real. */}
      <PlanSlipStrip tripId={trip.id} />
      <Card
        className="border border-border hover:shadow-md transition-shadow cursor-pointer"
        data-testid={`trip-card-${trip.id}`}
        onClick={() => setLocation(model.primaryHref)}
      >
        <CardContent className={viewMode === "list" ? "p-5" : "p-4"}>
          <div className={viewMode === "list" ? "flex items-start gap-4" : "space-y-4"}>
            <div className={`${viewMode === "list" ? "w-16 h-16" : "w-full h-32"} rounded-lg bg-gradient-to-br from-[#FFE3E8] to-[#FFF1F3] flex items-center justify-center flex-shrink-0`}>
              <Icon className={`${viewMode === "list" ? "w-8 h-8" : "w-12 h-12"} text-primary`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start gap-2 mb-2">
                <div className="min-w-0 flex-[1_1_14rem]">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <h3 className="min-w-0 max-w-full font-semibold text-foreground dark:text-white truncate" data-testid={`text-trip-title-${trip.id}`}>
                      {trip.title}
                    </h3>
                    {/* Slip identity — render ONLY when the trips-list response carries a
                        tracking number (§13: never invent; omit when absent). */}
                    {trip.trackingNumber && (
                      <span
                        className="flex-shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        data-testid={`chip-tracking-${trip.id}`}
                      >
                        {trip.trackingNumber}
                      </span>
                    )}
                    {trip.occasion && (
                      <span
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: "var(--earn-gold-wash)",
                          color: "var(--earn-gold-ink)",
                          fontFamily: EARN_MONO,
                        }}
                        data-testid={`chip-occasion-${trip.id}`}
                      >
                        {trip.occasion.label} · {formatOccasionDate(trip.occasion.date)}
                      </span>
                    )}
                    {/* Final · v{N} — a trip with a frozen snapshot has a Trip Card at /trip/:id.
                        Same green treatment as the card's own Final chip (ledger 2026-08-31-stage-a-dashboard). */}
                    {model.hasFinal && (
                      <span
                        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                        data-testid={`chip-final-${trip.id}`}
                        title="This plan is finalized — open its Trip Card"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Final · v{finalVersion}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {start && end
                      ? `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")} • `
                      : ""}
                    {trip.destination}
                  </p>
                  {/* Advisor + next action (L3): the REAL advisor from the owner-gated read
                      ("requested" spelled out while pending — never implied), and the most-advanced
                      actionable routing stage off the plancard counts. Both omit when absent. */}
                  {(model.hasAdvisor || model.nextAction) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5" data-testid={`row-state-${trip.id}`}>
                      {model.hasAdvisor && (
                        <span data-testid={`chip-advisor-${trip.id}`}>
                          {model.advisorPending ? "Expert requested" : "Advisor"}
                          {model.advisorName ? ` · ${model.advisorName}` : ""}
                        </span>
                      )}
                      {model.hasAdvisor && model.nextAction && " · "}
                      {model.nextAction && (
                        <span data-testid={`next-action-${trip.id}`}>
                          Next: {NEXT_ACTION_LABELS[model.nextAction.status]?.(model.nextAction.n)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {/* Phase chip — the SAME section derivation the page buckets by (L3). */}
                {model.section === "past" ? (
                  <Badge variant="secondary" className="ml-auto flex-shrink-0">
                    <Star className="w-3 h-3 mr-1" /> Completed
                  </Badge>
                ) : model.section === "traveling" ? (
                  <Badge variant="outline" className="ml-auto flex-shrink-0">
                    Underway
                  </Badge>
                ) : daysAway != null && daysAway > 0 ? (
                  <Badge className="ml-auto flex-shrink-0 bg-blue-100 text-blue-600 hover:bg-blue-100">
                    {daysAway} days away
                  </Badge>
                ) : null}
              </div>

              {/* L3: the elapsed-time progress bar is REMOVED (Console & AI Concierge brief —
                  "no elapsed-time progress bar"). It measured time passing, not planning, and a
                  plan does not get more planned as the calendar advances. */}

              <div className="flex items-center gap-2 flex-wrap">
                {/* Final-aware primary (ledger 2026-08-31-stage-a-dashboard): post-final the plan is
                    frozen and has a Trip Card at /trip/:id; pre-final the plan lives on the slip.
                    One action, one destination. */}
                {model.hasFinal ? (
                  <Link href={`/trip/${trip.id}`} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" data-testid={`button-view-trip-card-${trip.id}`}>
                      View Trip Card
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/plans/${trip.id}`} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" data-testid={`button-open-slip-${trip.id}`}>
                      Open slip
                    </Button>
                  </Link>
                )}
                {/* L3 — Message only WITH an advisor (the owner-gated read returned one). Without
                    one the button opened /chat to an empty thread picker — a dead end dressed as
                    a conversation. */}
                {model.hasAdvisor && (
                  <Link href={`/chat?tripId=${encodeURIComponent(trip.id)}`} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="text-muted-foreground" data-testid={`button-message-${trip.id}`}>
                      Message
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyTrips() {
  const { data: trips, isLoading, isError } = useTrips();
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  // L3: "Show all" WORKS — the past list is capped at three only until the traveler asks for the
  // rest (the button used to have no handler at all).
  const [showAllPast, setShowAllPast] = useState(false);
  // R-C: both "+ New plan" CTAs on this page open the intake panel instead of navigating
  // to /experiences (CONSOLE_REALIGN_BRIEF.md).
  const [intakeOpen, setIntakeOpen] = useState(false);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl font-bold text-destructive">Something went wrong</h2>
          <p className="text-muted-foreground mt-2">Could not load your plans. Please try again later.</p>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();

  const filteredTrips = (trips || []).filter(trip => {
    if (typeFilter !== "all" && trip.eventType !== typeFilter) return false;

    if (statusFilter !== "all") {
      const section = planRowSection(trip, now);
      if (statusFilter === "active" && section !== "traveling") return false;
      if (statusFilter === "upcoming" && section !== "planning" && section !== "final") return false;
      if (statusFilter === "completed" && section !== "past") return false;
    }

    if (searchQuery && !(trip.title || "").toLowerCase().includes(searchQuery.toLowerCase()) &&
        !(trip.destination || "").toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    return true;
  });

  // Four mutually exclusive buckets from the ONE derivation (client/src/lib/plan-row-model.ts) —
  // a trip appears in EXACTLY ONE section, and the Final section now exists (L3): a finalized,
  // still-ahead plan is neither "in planning" nor past. `trips.status` is a documented-dead field
  // (CLAUDE.md §13, Lane 3 Option B) and is never read.
  const sections: Record<PlanRowSection, typeof filteredTrips> = {
    traveling: [],
    final: [],
    planning: [],
    past: [],
  };
  for (const trip of filteredTrips) {
    sections[planRowSection(trip, now)].push(trip);
  }
  const travelingNow = sections.traveling;
  const finalPlans = sections.final;
  const inPlanning = sections.planning;
  const pastTrips = sections.past;
  const visiblePast = showAllPast ? pastTrips : pastTrips.slice(0, 3);

  const renderSection = (
    title: string,
    list: typeof filteredTrips,
    testId: string,
  ) => (
    <section data-testid={testId}>
      <h2 className="text-lg font-semibold text-foreground dark:text-white mb-4 flex items-center gap-2">
        {title} ({list.length})
      </h2>
      <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
        {list.map((trip, i) => (
          <motion.div
            key={trip.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <TripRow trip={trip} viewMode={viewMode} now={now} />
          </motion.div>
        ))}
      </div>
    </section>
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-2xl font-bold text-foreground dark:text-white" data-testid="text-page-title">
            My Plans
          </h1>
          <Button
            className="bg-primary hover:bg-primary/90 text-white"
            data-testid="button-create-new"
            onClick={() => setIntakeOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <Input
              placeholder="Search plans..."
              className="pl-10 border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] border-border" data-testid="select-type-filter">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filterOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] border-border" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex border border-border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                className={viewMode === "grid" ? "bg-[#F3F4F6]" : ""}
                onClick={() => setViewMode("grid")}
                data-testid="button-grid-view"
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={viewMode === "list" ? "bg-[#F3F4F6]" : ""}
                onClick={() => setViewMode("list")}
                data-testid="button-list-view"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Traveling now — first when non-empty */}
        {travelingNow.length > 0 && renderSection("Traveling now", travelingNow, "section-traveling")}

        {/* Final — finalized and still ahead; the plan's Trip Card is its primary surface (L3) */}
        {finalPlans.length > 0 && renderSection("Final", finalPlans, "section-final")}

        {/* In planning (events live on My events — ratified; no "Upcoming Events" here) */}
        {inPlanning.length > 0 && renderSection("In planning", inPlanning, "section-planning")}

        {/* Past plans — capped at three until "Show all" asks for the rest (L3: it works now) */}
        {pastTrips.length > 0 && (
          <section data-testid="section-past">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground dark:text-white flex items-center gap-2">
                Past plans ({pastTrips.length})
              </h2>
              {pastTrips.length > 3 && (
                <Button
                  variant="ghost"
                  className="text-primary"
                  data-testid="button-show-all-completed"
                  onClick={() => setShowAllPast((v) => !v)}
                >
                  {showAllPast ? "Show less" : `Show all (${pastTrips.length})`}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
            <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-4"}>
              {visiblePast.map((trip, i) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TripRow trip={trip} viewMode={viewMode} now={now} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {filteredTrips.length === 0 && (
          <Card className="border-2 border-dashed border-border">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-[#FFE3E8] rounded-full flex items-center justify-center mx-auto mb-4">
                <Plane className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground dark:text-white mb-2">
                {searchQuery || typeFilter !== "all" || statusFilter !== "all"
                  ? "No matching plans found"
                  : "No plans yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || typeFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Start one, or let an occasion bring you one."}
              </p>
              {!searchQuery && typeFilter === "all" && statusFilter === "all" && (
                <Button
                  className="bg-primary hover:bg-primary/90 text-white"
                  data-testid="button-create-first"
                  onClick={() => setIntakeOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Plan
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <IntakePanel open={intakeOpen} onOpenChange={setIntakeOpen} />
    </DashboardLayout>
  );
}
