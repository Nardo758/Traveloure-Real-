/**
 * UI brief 1 (page frame), commit 1: ONE action row with exactly two actions.
 *
 * EACH BUTTON KEEPS THE VISIBILITY RULE IT HAS TODAY, and the row is NOT gated as a whole:
 *   Optimize        - owner only, the same gate the optimizer slot carries (`SlipView.tsx:2688`).
 *   expert door     - `expertDoorLive && expertDoorState === "dismissed"`, the same gate the header's
 *                     `slip-add-local-expert` carried (`SlipView.tsx:2475`), which this replaces.
 * The expert action opens the ONE HandoffChooser through `openHandoffChooser` - the same opener every other
 * door uses - so nothing about what the door DOES changes. Optimize scrolls to the existing optimizer card
 * (the rail still portals it into the slot): this commit moves layout, not behaviour.
 */
import { optimizeBoardCtaLabel } from "@/components/plan/OptimizerLead";
import type { OptimizationFeeQuote } from "@/lib/optimization-preview";

/**
 * THE BUTTON SAYS WHAT THE CARD SAYS: the row calls `optimizeBoardCtaLabel` itself - the function the card
 * uses in its `tone="board"` mount (`SlipRail.tsx:654,673`, `OptimizerLead.tsx:109`) - with the SAME fee quote
 * the card is given. No wrapper, no second label rule, no literal, no second fetch: the fee is the one
 * `useOptimizerLeadData` already reads for the card (query key `["/api/optimization-fee", { tripId }]`).
 *
 * Loading and disabled match the card exactly: no fee yet -> "Optimize"; `fee.aiDisabled` -> "Optimize".
 */

export interface SlipActionRowProps {
  showOptimize: boolean;
  showExpert: boolean;
  /** The same fee quote the optimizer card is given; null while it loads. */
  fee: OptimizationFeeQuote | null | undefined;
  onOptimize: () => void;
  onExpert: () => void;
}

export function SlipActionRow({ showOptimize, showExpert, fee, onOptimize, onExpert }: SlipActionRowProps) {
  const optimizeLabel = optimizeBoardCtaLabel(fee);
  if (!showOptimize && !showExpert) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="slip-action-row">
      {showOptimize ? (
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-full bg-[color:var(--slip-navy)] px-5 text-sm font-semibold text-white"
          onClick={onOptimize}
          data-testid="button-slip-optimize"
        >
          {optimizeLabel}
        </button>
      ) : null}
      {showExpert ? (
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-full border border-[color:var(--slip-line)] px-5 text-sm font-semibold"
          onClick={onExpert}
          data-testid="button-slip-expert-help"
        >
          Get help from a local expert
        </button>
      ) : null}
    </div>
  );
}
