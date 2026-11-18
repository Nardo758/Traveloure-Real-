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
export interface SlipActionRowProps {
  showOptimize: boolean;
  showExpert: boolean;
  onOptimize: () => void;
  onExpert: () => void;
}

export function SlipActionRow({ showOptimize, showExpert, onOptimize, onExpert }: SlipActionRowProps) {
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
          Optimize
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
