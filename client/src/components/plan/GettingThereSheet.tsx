/**
 * "Getting there" (surface spec §5, R-j; step 2, ledger `2026-10-03-surface-step2-tools-tray`).
 *
 * Two blocks — the flight IN (day 1) and the flight OUT (the last day). Enter a flight number and a
 * date → the server's ONE lookup (`POST /api/trips/:tripId/flight-lookup`) → "Add to plan" writes a
 * `flight_arrival` / `flight_departure` anchor through the EXISTING `POST /api/trips/:tripId/anchors`
 * (no second anchor writer). When the lookup is off, finds nothing, fails or is capped, the block
 * asks for the time instead — a flight we did not look up never gets an invented time (§13).
 * An added flight shows what it is and can be removed (the EXISTING `DELETE /api/anchors/:id`).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  anchorWallTime,
  flightAnchorBody,
  manualFlightAnchorBody,
  normalizeFlightNumber,
  type FlightDirection,
  type FlightInfo,
} from "@shared/getting-there";

export const GETTING_THERE_WORDS = {
  arrival: "Your flight in",
  departure: "Your flight out",
  flightNumber: "Flight number",
  date: "Date",
  lookUp: "Look up",
  add: "Add to plan",
  remove: "Remove",
  manualPrompt: "We can't look this flight up right now — enter its time and we'll build around it.",
  notFound: "No flight with that number on that date. Check the number, or enter the time yourself.",
  capReached: "Flight lookups are busy today — enter the time yourself and we'll build around it.",
  time: "Time",
  airport: "Airport (optional)",
} as const;

interface AnchorRowData {
  id: string;
  anchorType: string;
  anchorDatetime: string;
  location?: string | null;
  description?: string | null;
}

type LookupAnswer =
  | { kind: "found"; flight: FlightInfo; cached: boolean }
  | { kind: "not_found" | "off" | "error" | "cap_reached" };

function FlightBlock({
  tripId,
  direction,
  defaultDate,
  existing,
}: {
  tripId: string;
  direction: FlightDirection;
  defaultDate: string;
  existing: AnchorRowData | null;
}) {
  const { toast } = useToast();
  const [flightNumber, setFlightNumber] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [answer, setAnswer] = useState<LookupAnswer | null>(null);
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [airport, setAirport] = useState("");
  const key = `${normalizeFlightNumber(flightNumber) ?? ""}:${date}`;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/anchors`] });
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
  };

  const lookup = useMutation({
    mutationFn: async (): Promise<LookupAnswer> => {
      const res = await fetch(`/api/trips/${tripId}/flight-lookup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightNumber, date }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) return { kind: "cap_reached" };
      if (!res.ok) throw new Error(body?.message || "Couldn't look that flight up");
      return body as LookupAnswer;
    },
    onSuccess: (a) => {
      setAnswer(a);
      setLookedUp(key);
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't look that flight up", variant: "destructive" }),
  });

  const add = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiRequest("POST", `/api/trips/${tripId}/anchors`, body)).json(),
    onSuccess: () => {
      refresh();
      setAnswer(null);
      setFlightNumber("");
      setTime("");
      setAirport("");
    },
    onError: () => toast({ title: "Couldn't add the flight", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/anchors/${id}`),
    onSuccess: refresh,
    onError: () => toast({ title: "Couldn't remove the flight", variant: "destructive" }),
  });

  const title = direction === "arrival" ? GETTING_THERE_WORDS.arrival : GETTING_THERE_WORDS.departure;
  const manual = answer && answer.kind !== "found";

  return (
    <section className="space-y-3 rounded-lg border border-border p-3" data-testid={`getting-there-${direction}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Plane className="h-4 w-4" aria-hidden="true" /> {title}
      </p>
      {existing ? (
        <div className="flex items-start justify-between gap-2 text-sm" data-testid={`getting-there-${direction}-added`}>
          <div>
            <p className="text-foreground">{[anchorWallTime(existing.anchorDatetime), existing.location].filter(Boolean).join(" · ")}</p>
            {existing.description ? <p className="text-xs text-muted-foreground">{existing.description}</p> : null}
          </div>
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(existing.id)} disabled={remove.isPending} data-testid={`getting-there-${direction}-remove`}>
            {GETTING_THERE_WORDS.remove}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              {GETTING_THERE_WORDS.flightNumber}
              <Input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="JL 61" data-testid={`getting-there-${direction}-number`} />
            </label>
            <label className="text-xs text-muted-foreground">
              {GETTING_THERE_WORDS.date}
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid={`getting-there-${direction}-date`} />
            </label>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => lookup.mutate()}
            // One lookup per flight entered: the same number and date are not looked up twice.
            disabled={!normalizeFlightNumber(flightNumber) || !date || lookup.isPending || lookedUp === key}
            data-testid={`getting-there-${direction}-lookup`}
          >
            {lookup.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {GETTING_THERE_WORDS.lookUp}
          </Button>
          {answer?.kind === "found" ? (
            <div className="space-y-2 rounded-md bg-muted/30 p-2 text-sm" data-testid={`getting-there-${direction}-found`}>
              <p className="text-foreground">
                {answer.flight.number} · {answer.flight.depAirport} {answer.flight.depAt.slice(11)} → {answer.flight.arrAirport} {answer.flight.arrAt.slice(11)}
              </p>
              <Button size="sm" onClick={() => add.mutate(flightAnchorBody(direction, answer.flight))} disabled={add.isPending} data-testid={`getting-there-${direction}-add`}>
                {GETTING_THERE_WORDS.add}
              </Button>
            </div>
          ) : null}
          {manual ? (
            <div className="space-y-2" data-testid={`getting-there-${direction}-manual`}>
              <p className="text-xs text-muted-foreground">
                {answer!.kind === "not_found" ? GETTING_THERE_WORDS.notFound : answer!.kind === "cap_reached" ? GETTING_THERE_WORDS.capReached : GETTING_THERE_WORDS.manualPrompt}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">
                  {GETTING_THERE_WORDS.time}
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid={`getting-there-${direction}-time`} />
                </label>
                <label className="text-xs text-muted-foreground">
                  {GETTING_THERE_WORDS.airport}
                  <Input value={airport} onChange={(e) => setAirport(e.target.value)} data-testid={`getting-there-${direction}-airport`} />
                </label>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  add.mutate(manualFlightAnchorBody(direction, { date, time, flightNumber: normalizeFlightNumber(flightNumber), airport: airport.trim() || null }))
                }
                disabled={!/^\d{2}:\d{2}$/.test(time) || !date || add.isPending}
                data-testid={`getting-there-${direction}-manual-add`}
              >
                {GETTING_THERE_WORDS.add}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function GettingThereSheet({
  tripId,
  trip,
}: {
  tripId: string;
  trip: { destination: string | null; startDate: string | null; endDate: string | null };
}) {
  const { data: anchors } = useQuery<AnchorRowData[]>({ queryKey: [`/api/trips/${tripId}/anchors`] });
  const find = (t: string) => (anchors ?? []).find((a) => a.anchorType === t) ?? null;
  return (
    <div className="space-y-4" data-testid="getting-there-sheet">
      <FlightBlock tripId={tripId} direction="arrival" defaultDate={(trip.startDate ?? "").slice(0, 10)} existing={find("flight_arrival")} />
      <FlightBlock tripId={tripId} direction="departure" defaultDate={(trip.endDate ?? "").slice(0, 10)} existing={find("flight_departure")} />
    </div>
  );
}
