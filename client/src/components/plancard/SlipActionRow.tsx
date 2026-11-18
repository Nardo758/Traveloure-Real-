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
 * THE BUTTON SAYS WHAT THE CARD SAYS, because it is the card's own function, given the card's own fee.
 *
 * The card mounts with `tone="board"` (`SlipRail.tsx:654,673`), so its CTA is `optimizeBoardCtaLabel`
 * (`OptimizerLead.tsx:109`) - the Trip Pass states ("included", and the runs-left count) included. The row
 * calls that same function with the SAME fee quote, so it cannot drift: no second label rule, no literal, and
 * no second fetch - the fee is the one `useOptimizerLeadData` already reads for the card
 * (`use-optimizer-lead-data.ts:32-35`, query key `["/api/optimization-fee", { tripId }]`).
 *
 * Loading and disabled match the card exactly: no fee yet -> "Optimize"; `fee.aiDisabled` -> "Optimize".
 */
export function optimizeRowCtaLabel(fee: OptimizationFeeQuote | null | undefined): string {
  return optimizeBoardCtaLabel(fee);
}

export interface SlipActionRowProps {
  showOptimize: boolean;
  showExpert: boolean;
  /** The same fee quote the optimizer card is given; null while it loads. */
  fee: OptimizationFeeQuote | null | undefined;
  onOptimize: () => void;
  onExpert: () => void;
}

export function SlipActionRow({ showOptimize, showExpert, fee, onOptimize, onExpert }: SlipActionRowProps) {
  const optimizeLabel = optimizeRowCtaLabel(fee);
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
