/**
 * Row P-1c (ledger `2026-11-02-p1c-waitlist-save-to-plan`): in waitlist mode a buy on an item that is already on the
 * plan becomes "Save to plan" — the item is already saved, so the press says "Saved to plan" and changes nothing.
 * ONE component for every such site (slip item sheet, leg rows, transport options, routing actions).
 */
import { useToast } from "@/hooks/use-toast";
import { WAITLIST_COPY } from "@/lib/waitlist-copy";

export function SaveToPlanButton({ testId, className }: { testId: string; className?: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      className={className ?? "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold"}
      onClick={() => toast({ title: WAITLIST_COPY.savedToPlan })}
      data-testid={testId}
    >
      {WAITLIST_COPY.saveToPlan}
    </button>
  );
}
