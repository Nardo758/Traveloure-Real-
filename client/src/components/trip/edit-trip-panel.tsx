import { useEffect, useState } from "react";
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
import { clearTripContext, updateTripContext, useTripContext } from "@/lib/trip-context";

/**
 * EditTripPanel — THE shared edit surface for the site-wide trip context
 * (Trip-Strip program, P2). One form behind every entry point: the cart header
 * today; the P3 strip popover and the experience-template empty state next.
 * Writes ONLY the TripContext (merge semantics); once a trip row exists the
 * downstream flow (resolve-trip reuse + trip PATCH at confirm) syncs the server.
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
  const [eventType, setEventType] = useState("trip");

  // Seed the form from the live context each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setTitle(ctx.title || "");
    setDestination(ctx.destination || "");
    setStartDate(ctx.startDate || "");
    setEndDate(ctx.endDate || "");
    setTravelers(ctx.travelers && ctx.travelers > 0 ? ctx.travelers : 2);
    setEventType(ctx.experienceType || ctx.eventType || "trip");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    const start = startDate || undefined;
    let end = endDate || undefined;
    if (start && end && new Date(end) < new Date(start)) end = start;
    updateTripContext({
      title: title.trim() || undefined,
      destination: destination.trim() || undefined,
      startDate: start,
      endDate: end,
      travelers,
      experienceType: eventType || undefined,
    });
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
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger id="etp-event-type" data-testid="select-etp-event-type">
                  <SelectValue placeholder="What are you planning?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trip">A trip</SelectItem>
                  <SelectItem value="wedding">A wedding</SelectItem>
                  <SelectItem value="proposal">A proposal</SelectItem>
                  <SelectItem value="honeymoon">A honeymoon</SelectItem>
                  <SelectItem value="anniversary">An anniversary</SelectItem>
                  <SelectItem value="corporate">A corporate event</SelectItem>
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
