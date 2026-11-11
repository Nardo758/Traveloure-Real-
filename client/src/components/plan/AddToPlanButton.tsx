/**
 * Cut-list #1 slice C — THE ONE ADD BUTTON (ledger `2026-11-11-cutlist1-slice-c-add-actions`).
 *
 * Every add on the discover/location feed, /experiences and the planning surface draws this (through `PlanActions`'
 * save output, or directly on the map planner's browse add). Words come from `lib/add-to-plan.ts`:
 *
 *   idle      "Add to plan" — or "Add to Day {n}" when the caller knows the day
 *   pending   the same words, with a spinner and `aria-busy` (the first tap waits in the slot, or the save is in flight)
 *   added     "Added ✓" once the server confirmed the row
 *
 * It renders a <button> (or a wouter Link when the card's add is a page). The press never reaches a parent link.
 * Phone budget: a single line, `whitespace-nowrap`, icon 14px; the label is at most "Add to Day 14" (13 characters).
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { addLabel } from "@/lib/add-to-plan";
import { useAddPending } from "@/lib/plan-add-runner";

export interface AddToPlanButtonProps {
  testId: string;
  /** The item's saved key (`kind:source_id`): the spinner follows an add of THIS item, across a card remount. */
  pendingKey?: string | null;
  /** The caller's own in-flight state (a save whose promise it holds itself). */
  pending?: boolean;
  added?: boolean;
  /** Inert once added (the guest rail): the press would add nothing. */
  addedInert?: boolean;
  dayNumber?: number | null;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  icon?: ReactNode;
  data?: Record<string, string>;
}

export function AddToPlanButton({
  testId,
  pendingKey,
  pending: pendingProp,
  added = false,
  addedInert = false,
  dayNumber,
  onClick,
  href,
  disabled,
  className,
  style,
  icon,
  data,
}: AddToPlanButtonProps) {
  const queued = useAddPending(pendingKey ?? null);
  const pending = !added && (queued || !!pendingProp);
  const label = addLabel({ added, dayNumber });
  const attrs: Record<string, string> = { ...(data ?? {}), "data-add-state": added ? "added" : pending ? "pending" : "idle" };
  if (added) attrs["data-saved"] = "true";
  const body = (
    <>
      {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden data-testid={`${testId}-spinner`} /> : icon}
      <span className="whitespace-nowrap">{label}</span>
    </>
  );
  if (href && !added && !disabled) {
    return (
      <Link href={href} className={className} style={style} data-testid={testId} onClick={(e: any) => { e?.stopPropagation?.(); onClick?.(); }} {...attrs}>
        {body}
      </Link>
    );
  }
  const inert = disabled || pending || (added && addedInert);
  return (
    <button
      type="button"
      className={className}
      style={style}
      data-testid={testId}
      disabled={inert}
      aria-busy={pending ? "true" : undefined}
      aria-live="polite"
      onClick={(e) => {
        // A tile is often itself a link: the press is this action's, never the card's.
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      {...attrs}
    >
      {body}
    </button>
  );
}
