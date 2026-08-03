import { useState } from "react";
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
import type { ExperienceType, InsertTrip } from "@shared/schema";

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

  const canContinue = destination.trim().length > 0 && !!startDate && !!endDate;

  function reset() {
    setStep(1);
    setDestination("");
    setStartDate("");
    setEndDate("");
    setTravelers(2);
    setSelectedSlug(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handlePlanWithAI() {
    // Hand off exactly what the user entered in Step 1 — nothing invented.
    updateTripContext({
      destination: destination.trim(),
      startDate,
      endDate,
      travelers,
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
      eventType: selectedSlug,
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
              <DialogTitle>Start a new plan</DialogTitle>
              <DialogDescription>Where and when — we'll figure out the shape next.</DialogDescription>
            </DialogHeader>

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
              <DialogTitle>What are you planning?</DialogTitle>
              <DialogDescription>Pick a shape, or let AI build it with you.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={handlePlanWithAI}
                className="flex flex-col items-start gap-1 rounded-xl border border-border p-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                data-testid="button-intake-plan-with-ai"
              >
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-foreground">Plan it with AI</span>
                <span className="text-xs text-muted-foreground">Chat it out — we'll build the plan</span>
              </button>

              {typesLoading && (
                <div className="col-span-2 flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}

              {(experienceTypes ?? []).map((type) => {
                const isSelected = selectedSlug === type.slug;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedSlug(type.slug)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary hover:bg-primary/5"
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
