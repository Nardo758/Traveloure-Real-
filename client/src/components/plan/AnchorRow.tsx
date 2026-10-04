/**
 * `AnchorRow` — a FIXED point in the day (surface spec v1.2 §3; step 1, ledger
 * `2026-10-03-surface-step1-item-row`): time · title · "Anchor · fixed · from <tool>". Immovable in
 * drags and re-times, which is why `ItemRow` drops "Move" from its ⋯ menu for an anchor.
 *
 * On the slip today two things are anchors: the item the plan is BUILT AROUND (the primary anchor of
 * stop 0 — from "Where to stay" for a stay, from "Build my days around this" otherwise) and a
 * PURCHASED item once a real optimization was applied (from your booking). `fromTool` names which —
 * the caller resolves it and this component restates nothing.
 *
 * A PLACEHOLDER (step-1 amendment R-aa) is the same row with `fromTool: null`: day 1's "Arrival in
 * <city>" and the last day's "Departure from <city>", carrying an "Add your flight" action. It says
 * NOTHING is fixed yet — no "Anchor · fixed" label on a flight nobody entered (§13). The action is a
 * Since step 2 it opens the Getting there sheet.
 */
import type { ReactNode } from "react";
import { Anchor } from "lucide-react";
import { ROUTING_TINTS } from "@/components/plancard/slip-tokens";
import { anchorWallTime } from "@shared/getting-there";

export interface AnchorRowProps {
  id: string;
  time: string | null;
  title: string;
  /** Null ⇒ a placeholder: nothing is fixed yet, and no "fixed" label is drawn. */
  fromTool: string | null;
  /** The placeholder's one action ("Add your flight"). */
  action?: { label: string; onClick: () => void } | null;
  /** Whatever the row carries under its title (place line, facts line, note, menu). */
  children?: ReactNode;
}

export function anchorLabel(fromTool: string): string {
  return `Anchor · fixed · from ${fromTool}`;
}

export function AnchorRow({ id, time, title, fromTool, action = null, children }: AnchorRowProps) {
  return (
    <div data-testid={`slip-anchor-row-${id}`} data-anchor-placeholder={fromTool ? undefined : "true"}>
      <p className="font-medium text-foreground flex items-start gap-1.5">
        <Anchor className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: ROUTING_TINTS.purchased.fg }} aria-hidden="true" />
        {time ? <span className="text-muted-foreground font-normal tabular-nums">{time}</span> : null}
        <span className="min-w-0 break-words" data-testid={`slip-item-name-${id}`}>{title}</span>
      </p>
      {fromTool ? (
        <p className="text-[11px] text-muted-foreground" data-testid={`slip-anchor-label-${id}`}>
          {anchorLabel(fromTool)}
        </p>
      ) : null}
      {action ? (
        <button
          type="button"
          className="mt-0.5 text-xs underline text-muted-foreground hover:text-foreground min-h-[32px]"
          onClick={action.onClick}
          data-testid={`slip-anchor-action-${id}`}
        >
          {action.label}
        </button>
      ) : null}
      {children}
    </div>
  );
}

/** The words, ONCE (R-aa). */
export const TRAVEL_ANCHOR_WORDS = {
  arrival: (city: string) => `Arrival in ${city}`,
  departure: (city: string) => `Departure from ${city}`,
  addFlight: "Add your flight",
} as const;

/**
 * Smoke 10 S10-4: the travel row's title — ours, never the model's. An AI arrival/departure item that
 * IS the travel row ("Arrive at Kansai International Airport", "Depart for Airport") renders under
 * this title, with the flight line beneath. Null when the plan names no city (§13 — no honest title).
 */
export function travelRowTitle(kind: "arrival" | "departure", destination: string | null | undefined): string | null {
  const name = (destination ?? "").split(",")[0].trim();
  if (!name) return null;
  return kind === "arrival" ? TRAVEL_ANCHOR_WORDS.arrival(name) : TRAVEL_ANCHOR_WORDS.departure(name);
}

/** A stored flight anchor, as the slip reads it from `GET /api/trips/:tripId/anchors`. */
export interface FlightAnchorView {
  time: string | null;
  location: string | null;
  description: string | null;
  /** S10-1: the anchor's own buffer — after landing (arrival) or before take-off (departure). */
  bufferMinutes?: number | null;
}

/** The plan's flight anchor of one direction, or null (the first one — a plan has one flight in, one out). */
export function flightAnchorFor(
  anchors:
    | ReadonlyArray<{ anchorType: string; anchorDatetime: string; location?: string | null; description?: string | null; bufferBefore?: number | null; bufferAfter?: number | null }>
    | undefined,
  type: "flight_arrival" | "flight_departure",
): FlightAnchorView | null {
  const a = (anchors ?? []).find((x) => x.anchorType === type);
  if (!a) return null;
  const buf = type === "flight_arrival" ? a.bufferAfter : a.bufferBefore;
  return {
    time: anchorWallTime(a.anchorDatetime),
    location: a.location ?? null,
    description: a.description ?? null,
    bufferMinutes: typeof buf === "number" ? buf : null,
  };
}

/**
 * The flight's line under its row (smoke 8 item 3), ONCE for both travel rows (the placeholder's
 * real form and an absorbed AI arrival/departure): the stored line ("JL 061 · lands KIX 09:05 ·
 * entered by you") is the whole line; the airport alone stands in only for a flight stored with none.
 */
export function flightRowText(flight: FlightAnchorView | null | undefined): string | null {
  if (!flight) return null;
  return (flight.description ?? "").trim() || (flight.location ?? "").trim() || null;
}

/** Where a flight anchor was fixed — the AnchorRow's "from <tool>". */
export const GETTING_THERE_TOOL = "Getting there";

/**
 * Day 1's / the last day's travel row. With no flight on the plan it is the step-1 PLACEHOLDER
 * (R-aa): "Arrival in <city>" with "Add your flight", which opens the Getting there sheet (step 2).
 * With a flight it is a REAL anchor: the flight's own time, "Anchor · fixed · from Getting there",
 * and what the flight is. `city` is the plan's own destination; with none there is no honest title
 * and nothing renders (§13).
 */
export function TravelAnchorPlaceholder({
  kind,
  city,
  flight = null,
  onAddFlight,
}: {
  kind: "arrival" | "departure";
  city: string | null;
  flight?: FlightAnchorView | null;
  onAddFlight?: () => void;
}) {
  const title = travelRowTitle(kind, city);
  if (!title) return null;
  if (flight) {
    return (
      <div className="py-3 px-3" data-testid={`slip-travel-anchor-${kind}`} data-anchor-real="true">
        <AnchorRow id={`travel-${kind}`} time={flight.time} title={title} fromTool={GETTING_THERE_TOOL}>
          {flightRowText(flight) ? (
            <p className="text-xs text-muted-foreground" data-testid={`slip-travel-anchor-${kind}-flight`}>
              {flightRowText(flight)}
            </p>
          ) : null}
        </AnchorRow>
      </div>
    );
  }
  return (
    <div className="py-3 px-3" data-testid={`slip-travel-anchor-${kind}`}>
      <AnchorRow
        id={`travel-${kind}`}
        time={null}
        title={title}
        fromTool={null}
        action={onAddFlight ? { label: TRAVEL_ANCHOR_WORDS.addFlight, onClick: onAddFlight } : null}
      />
    </div>
  );
}

/**
 * Smoke 9 S9-5 — the amber line under a travel row when stops sit outside the flight
 * (`flightTimeConflictLine`, shared). A count and a direction; never a minute value.
 */
export function AnchorConflictLine({ kind, text }: { kind: "arrival" | "departure"; text: string | null }) {
  if (!text) return null;
  return (
    <p
      className="mx-3 mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      role="status"
      data-testid={`slip-anchor-conflict-${kind}`}
    >
      {text}
    </p>
  );
}
