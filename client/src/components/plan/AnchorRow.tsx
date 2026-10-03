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
 * no-op until step 2 ("Getting there") gives it a rail.
 */
import type { ReactNode } from "react";
import { Anchor } from "lucide-react";
import { ROUTING_TINTS } from "@/components/plancard/slip-tokens";

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
 * Day 1's / the last day's placeholder. `city` is the plan's own destination; with none there is no
 * honest title and nothing renders (§13). "Add your flight" does nothing until step 2.
 */
export function TravelAnchorPlaceholder({ kind, city }: { kind: "arrival" | "departure"; city: string | null }) {
  const name = (city ?? "").split(",")[0].trim();
  if (!name) return null;
  return (
    <div className="py-3 px-3" data-testid={`slip-travel-anchor-${kind}`}>
      <AnchorRow
        id={`travel-${kind}`}
        time={null}
        title={kind === "arrival" ? TRAVEL_ANCHOR_WORDS.arrival(name) : TRAVEL_ANCHOR_WORDS.departure(name)}
        fromTool={null}
        action={{ label: TRAVEL_ANCHOR_WORDS.addFlight, onClick: () => {} }}
      />
    </div>
  );
}
