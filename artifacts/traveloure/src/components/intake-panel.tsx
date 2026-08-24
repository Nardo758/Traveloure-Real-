import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useCreateTrip } from "@/hooks/use-trips";
import { updateTripContext } from "@/lib/trip-context";
import { eventTypeEnum } from "@shared/schema";
import type { ExperienceType, InsertTrip } from "@shared/schema";

/**
 * GET /api/experience-types returns platform experience-type slugs (e.g.
 * "corporate-events", "wedding-anniversaries", "boys-trip") which are NOT the
 * same vocabulary as `trips.eventType` (shared/schema.ts eventTypeEnum). Writing
 * a raw slug there silently breaks isEventOptimizer/the coordination-fee event-
 * credit branch (optimization-fee.service.ts BRANCH_MAP reads literal
 * "wedding"/"corporate"). Map explicitly; never invent semantics — an
 * unrecognized slug (e.g. "boys-trip", "baby-shower") maps to "other".
 */
const EVENT_TYPE_SLUG_MAP: Record<string, (typeof eventTypeEnum)[number]> = {
  "corporate-events": "corporate",
  "wedding-anniversaries": "anniversary",
  vacation: "vacation",
  travel: "vacation",
};

function mapSlugToEventType(slug: string | null): (typeof eventTypeEnum)[number] | undefined {
  if (!slug) return undefined;
  if ((eventTypeEnum as readonly string[]).includes(slug)) {
    return slug as (typeof eventTypeEnum)[number];
  }
  return EVENT_TYPE_SLUG_MAP[slug] ?? "other";
}

/**
 * Entry Surfaces Redesign (ratification mockup): the common shapes are featured as
 * prominent cards; everything else sits behind "More types". This is presentation
 * ORDER only — the list itself stays 100% sourced from GET /api/experience-types
 * (§13: real data only; nothing hardcoded, nothing dropped). A featured slug that
 * the API doesn't return simply doesn't render.
 *
 * These are EXPERIENCE-TYPE slugs (the /api/experience-types vocabulary), NOT
 * eventTypeEnum values — the same two-vocabularies trap as EVENT_TYPE_SLUG_MAP
 * above. "vacation" was listed here originally but is an eventTypeEnum value, not
 * a real catalog slug, so it silently never rendered (runtime audit, Aug 4). The
 * three real featured slugs + the "Plan it with AI" card fill the 2×2 grid exactly.
 */
const FEATURED_SLUGS = ["anniversary-trip", "travel", "wedding"];

/** "Oct 12 – 17, 2026" / "Oct 12 – Nov 2, 2026" — recap pill from the exact step-1 values. */
function formatDateRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`;
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const left = `${month(s)} ${s.getDate()}`;
  const right = sameMonth ? `${e.getDate()}` : `${month(e)} ${e.getDate()}`;
  return `${left} – ${right}, ${e.getFullYear()}`;
}

const STEP_LABELS = ["Where & when", "What kind of trip", "Your slip"] as const;

/** 3-step rail. Step 3 ("Your slip") is the outcome — reached by landing on /plans/:tripId,
 *  never highlighted inside the panel. */
function StepRail({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center gap-1.5" data-testid="intake-step-rail">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        return (
          <div
            key={label}
            data-testid={`intake-step-${n}`}
            className={`flex-1 text-center rounded-full px-2 py-1.5 text-xs font-medium truncate ${
              active
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {n} · {label}
          </div>
        );
      })}
    </div>
  );
}

/**
 * IntakePanel — R-C: the one create-panel behind every "Plan new" / "New experience" /
 * "+ New plan" CTA (CONSOLE_REALIGN_BRIEF.md). Two steps:
 *   1. where / when / travelers (only what the user actually enters — §13, never invented)
 *   2. shape — the platform's real experience types (GET /api/experience-types), plus a
 *      "Plan it with AI" option that hands the Step-1 fields to the AI planner via
 *      TripContext instead of creating a trip (R-D: no trip is persisted unless created).
 * A shape pick (not AI) creates via the ONE create rail (useCreateTrip → POST /api/trips →
 * storage.createTrip, R-B) and lands on the slip (/plans/:tripId).
 */
export function IntakePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const { data: experienceTypes, isLoading: typesLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: open && step === 2,
  });

  const createTrip = useCreateTrip();
  const [showAllTypes, setShowAllTypes] = useState(false);

  // Presentation split only — both halves come straight from the API response.
  const { featured, more } = useMemo(() => {
    const all = experienceTypes ?? [];
    const featured = all.filter((t) => FEATURED_SLUGS.includes(t.slug));
    const more = all.filter((t) => !FEATURED_SLUGS.includes(t.slug));
    return { featured, more };
  }, [experienceTypes]);

  const canContinue = destination.trim().length > 0 && !!startDate && !!endDate;

  function reset() {
    setStep(1);
    setDestination("");
    setStartDate("");
    setEndDate("");
    setTravelers(2);
    setSelectedSlug(null);
    setShowAllTypes(false);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handlePlanWithAI() {
    // Hand off exactly what the user entered in Step 1 — nothing invented.
    // If a shape was picked before switching to AI, carry it forward as a
    // canonical eventType hint (mapped — never the raw non-enum slug).
    const mappedEventType = mapSlugToEventType(selectedSlug);
    updateTripContext({
      destination: destination.trim(),
      startDate,
      endDate,
      travelers,
      ...(mappedEventType ? { eventType: mappedEventType } : {}),
    });
    reset();
    onOpenChange(false);
    navigate("/ai-assistant");
  }

  function handleCreate() {
    if (!selectedSlug) return;
    const payload: InsertTrip = {
      title: `${destination.trim()} Trip`,
      destination: destination.trim(),
      startDate,
      endDate,
      numberOfTravelers: travelers,
      adults: travelers,
      kids: 0,
      eventType: mapSlugToEventType(selectedSlug) ?? "other",
    } as InsertTrip;

    createTrip.mutate(payload, {
      onSuccess: (trip) => {
        reset();
        onOpenChange(false);
        navigate(`/plans/${trip.id}`);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg" data-testid="intake-panel">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>New plan</DialogTitle>
              <DialogDescription>Where and when — we'll figure out the shape next.</DialogDescription>
            </DialogHeader>

            <StepRail current={1} />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="intake-destination">Destination</Label>
                <Input
                  id="intake-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Kyoto, Japan"
                  data-testid="input-intake-destination"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="intake-start">Start date</Label>
                  <Input
                    id="intake-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="input-intake-start-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="intake-end">End date</Label>
                  <Input
                    id="intake-end"
                    type="date"
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    data-testid="input-intake-end-date"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="intake-travelers">Travelers</Label>
                <Input
                  id="intake-travelers"
                  type="number"
                  min={1}
                  max={500}
                  value={travelers}
                  onChange={(e) => setTravelers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  data-testid="input-intake-travelers"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button disabled={!canContinue} onClick={() => setStep(2)} data-testid="button-intake-next">
                Next
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit -ml-2 mb-1 text-muted-foreground"
                onClick={() => setStep(1)}
                data-testid="button-intake-back"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
              <DialogTitle>What kind of trip</DialogTitle>
              <DialogDescription>Pick a shape, or let AI build it with you.</DialogDescription>
            </DialogHeader>

            <StepRail current={2} />

            {/* Step-1 recap pills — render the EXACT values entered on step 1; "edit"
                returns to step 1 without clearing anything (no reset()). */}
            <div className="flex flex-wrap items-center gap-1.5" data-testid="intake-recap-pills">
              {/* Pills mirror the values the create payload actually uses (destination is
                  trimmed in handleCreate/handlePlanWithAI too — same contract). */}
              <span
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground"
                data-testid="pill-recap-destination"
              >
                {destination.trim()}
              </span>
              <span
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground"
                data-testid="pill-recap-dates"
              >
                {formatDateRange(startDate, endDate)}
              </span>
              <span
                className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground"
                data-testid="pill-recap-travelers"
              >
                {travelers} traveler{travelers === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-1.5 py-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                data-testid="button-recap-edit"
              >
                edit
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto pr-1 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                {typesLoading && (
                  <div className="col-span-2 flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                )}

                {featured.map((type) => {
                  const isSelected = selectedSlug === type.slug;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedSlug(type.slug)}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${
                        isSelected
                          ? "border-primary ring-1 ring-primary bg-primary/5"
                          : "border-border hover:border-primary hover:bg-primary/5"
                      }`}
                      data-testid={`button-intake-shape-${type.slug}`}
                    >
                      <span className="text-sm font-semibold text-foreground">{type.name}</span>
                      {type.description && (
                        <span className="text-xs text-muted-foreground line-clamp-2">{type.description}</span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={handlePlanWithAI}
                  className="flex flex-col items-start gap-1 rounded-xl border border-border p-3.5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                  data-testid="button-intake-plan-with-ai"
                >
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Plan it with AI</span>
                  <span className="text-xs text-muted-foreground">Describe it in your words → AI planner</span>
                </button>
              </div>

              {more.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={showAllTypes}
                    onClick={() => setShowAllTypes((v) => !v)}
                    className="w-full text-left text-xs font-medium text-muted-foreground hover:text-foreground py-1"
                    data-testid="button-intake-more-types"
                  >
                    {showAllTypes ? "− Fewer types" : `+ More types (${more.length})`}
                  </button>

                  {showAllTypes && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {more.map((type) => {
                        const isSelected = selectedSlug === type.slug;
                        return (
                          <button
                            key={type.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedSlug(type.slug)}
                            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                              isSelected
                                ? "border-primary ring-1 ring-primary bg-primary/5"
                                : "border-border hover:border-primary hover:bg-primary/5"
                            }`}
                            data-testid={`button-intake-shape-${type.slug}`}
                          >
                            <span className="text-sm font-medium text-foreground">{type.name}</span>
                            {type.description && (
                              <span className="text-xs text-muted-foreground line-clamp-2">{type.description}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                disabled={!selectedSlug || createTrip.isPending}
                onClick={handleCreate}
                data-testid="button-intake-create"
              >
                {createTrip.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Creating…
                  </>
                ) : (
                  "Create plan"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
