/**
 * LOCATION MISMATCH DIALOG — the thin consumer of client/src/lib/location-mismatch.ts.
 * Ledger `2026-09-04-location-mismatch`.
 *
 * The WHOLE decision (which city, which comparison target, whether to speak at all) lives in the
 * reader module; this file renders it and nothing else. It restates no rule and re-derives no city
 * — a second copy of the decision at the view layer is the derivation-drift class CLAUDE.md §18
 * rule 1 names.
 *
 * THE THIRD ACTION LANDED (ledger `2026-09-04-plan-stops-ui`). "Add <city> as a stop" was OMITTED
 * — not stubbed, not disabled — while `trip_destinations` did not exist, because omitting an
 * action is honest and a dead button is not. The table exists (migration 281, CLAUDE.md Locked
 * Decision 34), so the action is here, and it keeps the same rule it was held to: it renders ONLY
 * when the gate can actually write it (`onAddAsStop` non-null), and is otherwise absent rather
 * than shown greyed out. Its LABEL is derived from the decision (`addAsStopLabel`), never
 * assembled here — the city named on the button and the city written to the plan are one value.
 *
 * The dialog is ADVISORY: it never blocks the add, it writes nothing, and Cancel persists nothing.
 */
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  MISMATCH_HONESTY_LINE,
  addAsStopLabel,
  mismatchHeadline,
  mismatchSubline,
  type MismatchAlert,
} from "@/lib/location-mismatch";

export interface LocationMismatchDialogProps {
  /** The decision to render. `null` closes the dialog — there is no "empty" state to draw. */
  alert: MismatchAlert | null;
  /** The listing's own name, echoed back so the traveler knows which add they are confirming. */
  listingName: string;
  /**
   * The category/price line the calling surface ALREADY has (e.g. "Wedding cake · from $310").
   * Omitted when the surface has nothing to say — never assembled here, and never a fee/rate
   * literal (§8): the caller passes text it already renders elsewhere.
   */
  listingMeta?: string | null;
  onAddAnyway: () => void;
  /**
   * "Add <city> as a stop". `null`/omitted ⇒ the action is not rendered at all — the gate could
   * not read the plan, or the plan already names that city. Never a disabled button.
   */
  onAddAsStop?: (() => void) | null;
  onCancel: () => void;
}

export function LocationMismatchDialog({
  alert,
  listingName,
  listingMeta,
  onAddAnyway,
  onAddAsStop = null,
  onCancel,
}: LocationMismatchDialogProps) {
  return (
    <Dialog open={alert !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent
        className="max-w-[520px] bg-[var(--earn-ground)] border-[color:var(--earn-border)] rounded-[12px] p-7 gap-[18px]"
        data-testid="dialog-location-mismatch"
      >
        {alert === null ? null : (
          <>
            <div className="flex items-start gap-[14px]">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--earn-coral-bg)] shrink-0">
                <MapPin className="w-[18px] h-[18px] text-[color:var(--earn-coral-ink)]" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <DialogTitle
                  className="text-[20px] font-semibold text-[color:var(--earn-navy)]"
                  data-testid="text-mismatch-headline"
                >
                  {mismatchHeadline(alert)}
                </DialogTitle>
                <DialogDescription
                  className="text-[14px] text-[color:var(--earn-ink)]"
                  data-testid="text-mismatch-subline"
                >
                  {mismatchSubline(alert)}
                </DialogDescription>
              </div>
            </div>

            <div
              className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-[10px] border border-[color:var(--earn-border)] bg-[var(--earn-card)] text-[14px]"
              data-testid="row-mismatch-listing"
            >
              <span className="font-semibold text-[color:var(--earn-ink)]">{listingName}</span>
              {/* §13: no meta line at all when the surface has none — never a placeholder. */}
              {listingMeta ? (
                <span className="text-[color:var(--earn-muted)] text-right">{listingMeta}</span>
              ) : null}
            </div>

            <p className="text-[13px] text-[color:var(--earn-muted)]" data-testid="text-mismatch-honesty">
              {MISMATCH_HONESTY_LINE}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-[8px] border-[color:var(--earn-border)] bg-[var(--earn-card)] text-[color:var(--earn-ink)] text-[13px] font-semibold"
                onClick={onAddAnyway}
                data-testid="button-mismatch-add-anyway"
              >
                Add anyway
              </Button>
              {onAddAsStop ? (
                <Button
                  variant="outline"
                  className="rounded-[8px] border-[color:var(--earn-border)] bg-[var(--earn-card)] text-[color:var(--earn-ink)] text-[13px] font-semibold"
                  onClick={onAddAsStop}
                  data-testid="button-mismatch-add-as-stop"
                >
                  {addAsStopLabel(alert)}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="text-[13px] font-medium text-[color:var(--earn-muted)]"
                onClick={onCancel}
                data-testid="button-mismatch-cancel"
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
