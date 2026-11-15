/**
 * Row P-1c (ledger `2026-11-02-p1c-waitlist-save-to-plan`): in waitlist mode a buy on an item that is already on the
 * plan becomes "Save to plan" — the item is already saved, so the press says "Saved to plan" and changes nothing.
 * ONE component for every such site (slip item sheet, leg rows, transport options, routing actions).
 */
import { WAITLIST_COPY } from "@/lib/waitlist-copy";
import { useRefSavedState } from "@/lib/saved-refs";

export function SaveToPlanButton({ testId, className, onSave, onNoPlan, disabled, savedKey }: {
  testId: string;
  className?: string;
  /** The press that actually writes (a browse save, a ref add). */
  onSave?: () => void;
  /**
   * E6: what a press does when it has no write to run - a traveler with no plan, or a site that never passed
   * `onSave`. It must open the dates panel (or the plan flow); it must never toast "Saved to plan", which
   * claims a save that did not happen. Absent, the press is inert and says so with `data-no-plan`.
   */
  onNoPlan?: () => void;
  disabled?: boolean;
  savedKey?: string | null;
}) {
  // R4-5 (round 4): a browse save whose row the server confirmed reads "Saved to plan", like every PlanActions site.
  // R4b-3: read from the plan's items; signed in it stays pressable (a second plan), inert on the guest rail only.
  const { saved, inert } = useRefSavedState(savedKey ?? null);
  if (saved && inert) {
    return (
      <button type="button" disabled className={className ?? "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold"} data-testid={testId} data-saved="true">
        {WAITLIST_COPY.savedToPlan}
      </button>
    );
  }
  return (
    <button
      type="button"
      // A-12: a browse save is disabled until the session and mode reads answer (`useBrowseSaveToPlan().pending`).
      disabled={disabled}
      className={className ?? "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold"}
      // GATE-1B: a browse save passes `onSave`, which writes to the guest plan and toasts on the server's answer.
      // E6: with no write and no `onNoPlan`, the press does NOT toast "Saved to plan" - that claimed a save
      // nobody performed. It runs the caller's no-plan action when there is one, and is otherwise a no-op the
      // surface can see (`data-no-plan`).
      onClick={() => {
        if (onSave) onSave();
        else if (onNoPlan) onNoPlan();
      }}
      data-testid={testId}
      {...(onSave || onNoPlan ? {} : { "data-no-plan": "true" })}
      {...(saved ? { "data-saved": "true" } : {})}
    >
      {saved ? WAITLIST_COPY.savedToPlan : WAITLIST_COPY.saveToPlan}
    </button>
  );
}
