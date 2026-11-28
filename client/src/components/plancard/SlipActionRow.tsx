/**
 * UI brief 1 (page frame): ONE action row with exactly two actions.
 *
 * EACH ACTION KEEPS THE VISIBILITY RULE IT HAS TODAY, and the row is NOT gated as a whole:
 *   Optimize        - owner only, and only while the optimizer itself would be drawn.
 *   expert door     - `expertDoorLive`, the gate the header's `slip-add-local-expert` carried.
 *
 * FRAME LIFT (Leon, Nov 19, 2026): the row no longer draws an Optimize button of its own. It offers a SLOT,
 * and `SlipRail` - which owns the Optimize state (the dates gate, the build-around step, busy, the disabled
 * reason, the fee) - portals the one real control into it (`OptimizeAction`, `OptimizerLead.tsx`). So the
 * button here is the control that runs Optimize, with the testid it has always had (`slip-action-optimize`),
 * and the card under the tools keeps its findings but not a second pair of buttons. Before this the row's
 * button only scrolled to the card.
 *
 * The expert action opens the ONE HandoffChooser through `openHandoffChooser` - the opener the card's own
 * "Local expert" button used - and takes that button's testid (`slip-action-hire-expert`).
 *
 * A row with no button in it is not drawn: when the rail draws no Optimize (waitlist mode, or Optimize
 * unavailable) and the expert door is closed, `:has(button)` is false and the row hides itself.
 */

export interface SlipActionRowProps {
  showOptimize: boolean;
  showExpert: boolean;
  /** Receives the element `SlipRail` portals the Optimize control into. */
  optimizeSlotRef: (el: HTMLSpanElement | null) => void;
  onExpert: () => void;
}

export function SlipActionRow({ showOptimize, showExpert, optimizeSlotRef, onExpert }: SlipActionRowProps) {
  if (!showOptimize && !showExpert) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 [&:not(:has(button))]:hidden" data-testid="slip-action-row">
      {showOptimize ? <span ref={optimizeSlotRef} className="contents" data-testid="slip-action-optimize-slot" /> : null}
      {showExpert ? (
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-full border border-[color:var(--slip-line)] px-5 text-sm font-semibold"
          onClick={onExpert}
          data-testid="slip-action-hire-expert"
        >
          Get help from a local expert
        </button>
      ) : null}
    </div>
  );
}

/** The Optimize control's dress in the row (the navy pill the frame shipped with). */
export const SLIP_ACTION_OPTIMIZE_CLASS =
  "inline-flex h-10 items-center rounded-full bg-[color:var(--slip-navy)] px-5 text-sm font-semibold text-white disabled:opacity-60";
