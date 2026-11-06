/**
 * Row P-1c (ledger `2026-11-02-p1c-waitlist-save-to-plan`): in waitlist mode a buy on an item that is already on the
 * plan becomes "Save to plan" — the item is already saved, so the press says "Saved to plan" and changes nothing.
 * ONE component for every such site (slip item sheet, leg rows, transport options, routing actions).
 */
import { useToast } from "@/hooks/use-toast";
import { WAITLIST_COPY } from "@/lib/waitlist-copy";
import { useRefSavedState } from "@/lib/saved-refs";

export function SaveToPlanButton({ testId, className, onSave, disabled, savedKey }: { testId: string; className?: string; onSave?: () => void; disabled?: boolean; savedKey?: string | null }) {
  const { toast } = useToast();
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
      // Without it the item is already on the plan (P-1c) and the press only says so.
      onClick={() => (onSave ? onSave() : toast({ title: WAITLIST_COPY.savedToPlan }))}
      data-testid={testId}
      {...(saved ? { "data-saved": "true" } : {})}
    >
      {saved ? WAITLIST_COPY.savedToPlan : WAITLIST_COPY.saveToPlan}
    </button>
  );
}
