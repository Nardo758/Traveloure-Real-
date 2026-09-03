import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearTripContext,
  getTripContext,
  switchTripContext,
  updateTripContext,
  useTripContext,
} from "@/lib/trip-context";
import { apiRequest } from "@/lib/queryClient";
import { eventTypeForSlug, normalizeOccasionKey } from "@shared/occasions";
import type { ExperienceType } from "@shared/schema";

/**
 * EditTripPanel — THE shared edit surface for the site-wide trip context
 * (Trip-Strip program, P2). One form behind every entry point: the cart header
 * today; the P3 strip popover and the experience-template empty state next.
 *
 * Writes via switchTripContext (REPLACE semantics for the identity-coupled
 * fields), not a plain merge: once a trip row exists (`tripId` bound —
 * Server-truth mode), editing the DESTINATION here means the user is now
 * describing a DIFFERENT trip than the one `tripId` points at, so `tripId` is
 * cleared in the SAME atomic write — a stale identity must never survive a
 * destination edit and end up paired with a destination it no longer matches
 * (money-adjacent: downstream optimize/payment requests derive the target trip
 * from `tripId`, so a stale one silently operates on the wrong trip while the
 * screen shows the right destination). Editing only dates/travelers/title
 * (destination unchanged) keeps the bound trip — this is not a blanket clear.
 *
 * OCCASION (ledger `2026-09-03-occasion-vocabulary`) — two things changed here:
 *
 * 1. THE LIST IS THE TABLE. The occasion select was a hand-typed six-item list whose
 *    default value ("trip") was not a member of ANY of the platform's occasion
 *    vocabularies, so the commonest saved value was one nothing downstream could read.
 *    It now renders rows from `GET /api/experience-types` — the same query key IntakePanel
 *    uses, so the two entry points can never offer different occasions — labelled by `name`
 *    and valued by `slug`. Nothing is hardcoded and nothing is dropped (§13); if the fetch
 *    yields no rows the control says so rather than falling back to an invented list.
 *
 * 2. IT WRITES THE TRIP ROW, NOT ONLY THE CONTEXT. The save persisted the occasion into
 *    `trip_contexts.context` (jsonb) and nowhere else, while `SlipLogisticsSection` gates the
 *    wedding Guest/Anchor tooling on `trips.event_type` — a different table. Correcting "A
 *    trip" to "A wedding" therefore never unlocked the wedding tools. When a `tripId` is bound
 *    the save now ALSO calls `PATCH /api/trips/:tripId/occasion` (owner-gated, allowlist body)
 *    with the mapped `eventTypeForSlug(slug)`. The context write is unchanged and still
 *    authoritative for the strip; this is an ADDITIONAL write, never a replacement.
 *
 * NOTHING IS PRESELECTED (§13). There is no "A trip" default: an occasion the traveler has not
 * chosen stays unchosen, and a save that carries no occasion leaves the stored one alone rather
 * than clearing it — the control never asked to clear anything.
 */
export function EditTripPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [ctx] = useTripContext();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  /** "" = nothing chosen. Never seeded with a placeholder occasion. */
  const [occasionSlug, setOccasionSlug] = useState("");

  // The ONE runtime occasion vocabulary. Same query key as IntakePanel so the cache is shared
  // and the two doors can never drift apart.
  const { data: occasions, isLoading: occasionsLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: open,
  });

  // Seed the form from the live context each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setTitle(ctx.title || "");
    setDestination(ctx.destination || "");
    setStartDate(ctx.startDate || "");
    setEndDate(ctx.endDate || "");
    setTravelers(ctx.travelers && ctx.travelers > 0 ? ctx.travelers : 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The occasion seeds SEPARATELY, because it can only resolve once the vocabulary has loaded.
  // The stored context may carry a slug (`experienceSlug`) or a display name (`experienceType`,
  // which experience-template.tsx writes) or a legacy value from the old hand-typed list — match
  // any of them against the real rows, and leave the control EMPTY when none matches rather than
  // showing a nearest-looking occasion the traveler never picked (§13).
  useEffect(() => {
    if (!open || !occasions) return;
    const wanted = [ctx.experienceSlug, ctx.experienceType]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map(normalizeOccasionKey);
    const match = occasions.find(
      (t) =>
        wanted.includes(normalizeOccasionKey(t.slug)) || wanted.includes(normalizeOccasionKey(t.name)),
    );
    setOccasionSlug(match ? match.slug : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, occasions]);

  const selectedOccasion = useMemo(
    () => (occasions ?? []).find((t) => t.slug === occasionSlug),
    [occasions, occasionSlug],
  );

  const save = () => {
    const start = startDate || undefined;
    let end = endDate || undefined;
    if (start && end && new Date(end) < new Date(start)) end = start;
    const trimmedDestination = destination.trim() || undefined;

    // Read fresh (not the `ctx` React-state snapshot from when the panel opened) —
    // this is the ground truth to compare the edited destination against.
    const liveCtx = getTripContext();
    const destinationChanged = (liveCtx.destination || "") !== (trimmedDestination || "");
    const preservedTripId = liveCtx.tripId && !destinationChanged ? liveCtx.tripId : undefined;

    switchTripContext({
      title: title.trim() || undefined,
      destination: trimmedDestination,
      startDate: start,
      endDate: end,
      travelers,
      // No occasion chosen ⇒ keep whatever was stored. switchTripContext has REPLACE semantics
      // for this field, so omitting it would silently CLEAR an occasion the panel never asked
      // the traveler to clear.
      experienceType: selectedOccasion?.name ?? liveCtx.experienceType,
      tripId: preservedTripId,
    });

    if (selectedOccasion) {
      const eventType = eventTypeForSlug(selectedOccasion.slug);
      // `eventType` is outside SWITCH_FIELDS, so it needs its own merge write.
      updateTripContext({ eventType });
      // …and the trip ROW, which is what the wedding tooling actually reads. Best-effort: a
      // guest (no session) or a non-owner gets a 4xx and the context write above still stands.
      if (preservedTripId) {
        void apiRequest("PATCH", `/api/trips/${preservedTripId}/occasion`, { eventType }).catch(
          (err) => {
            // eslint-disable-next-line no-console
            console.warn("[edit-trip-panel] occasion not persisted to the trip row:", err?.message);
          },
        );
      }
    }
    onOpenChange(false);
  };

  const clearAll = () => {
    clearTripContext();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="edit-trip-panel">
        <DialogHeader>
          <DialogTitle>Your trip details</DialogTitle>
          <DialogDescription>
            Set once — the whole site uses these while you plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="etp-destination">Destination</Label>
            <Input
              id="etp-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Kyoto, Japan"
              data-testid="input-etp-destination"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="etp-start">Start date</Label>
              <Input
                id="etp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-etp-start-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="etp-end">End date</Label>
              <Input
                id="etp-end"
                type="date"
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-etp-end-date"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="etp-travelers">Travelers</Label>
              <Input
                id="etp-travelers"
                type="number"
                min={1}
                max={500}
                value={travelers}
                onChange={(e) => setTravelers(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-etp-travelers"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="etp-event-type">What are you planning?</Label>
              <Select
                value={occasionSlug || undefined}
                onValueChange={setOccasionSlug}
                disabled={occasionsLoading || (occasions ?? []).length === 0}
              >
                <SelectTrigger id="etp-event-type" data-testid="select-etp-event-type">
                  <SelectValue
                    placeholder={
                      occasionsLoading
                        ? "Loading…"
                        : (occasions ?? []).length === 0
                          ? "Unavailable"
                          : "What are you planning?"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(occasions ?? []).map((t) => (
                    <SelectItem key={t.slug} value={t.slug} data-testid={`option-etp-${t.slug}`}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="etp-title">Trip name (optional)</Label>
            <Input
              id="etp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={destination ? `Your ${destination} trip` : "My trip"}
              data-testid="input-etp-title"
            />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={clearAll}
            data-testid="button-etp-clear"
          >
            Clear trip
          </Button>
          <Button type="button" onClick={save} data-testid="button-etp-save">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
