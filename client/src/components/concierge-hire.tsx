/**
 * CN-1d-UI: the concierge listing's details and the hire consent dialog. Every word comes from
 * `CONCIERGE_HIRE_COPY` (client/src/lib/concierge-hire-copy.ts). Nothing here says hold/authorized/released:
 * a hire is charged at checkout and refunded in full on decline or timeout.
 */
import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CONCIERGE_HIRE_COPY,
  cancelRuleLine,
  chargeRuleLine,
  confirmLabel,
  consentLine,
  createSingleFlight,
  taskCapLine,
  taskLinkOnlyLine,
} from "@/lib/concierge-hire-copy";
import { conciergeResponseHoursLine } from "@shared/cn1-copy";

export interface ConciergeTaskView {
  taskKindKey: string;
  label: string;
  domain?: string | null;
  linkOnly: boolean;
  cap: number | null;
}

/** Response line (only when hours are set), the task list with caps, and the link-only line ONCE beneath it. */
export function ConciergeListingDetails({
  tasks,
  responseWindowHours,
  expertName,
}: {
  tasks: ConciergeTaskView[] | null | undefined;
  responseWindowHours: number | null | undefined;
  expertName: string | null;
}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const hasLinkOnly = list.some((t) => t.linkOnly);
  const hours = typeof responseWindowHours === "number" && responseWindowHours > 0 ? responseWindowHours : null;
  if (!hours && list.length === 0) return null;
  return (
    <div className="space-y-2 min-w-0" data-testid="concierge-listing-details">
      {hours !== null && (
        <p className="text-[12px] text-[color:var(--earn-muted)]" data-testid="text-concierge-response-hours">
          {conciergeResponseHoursLine(hours)}
        </p>
      )}
      {list.length > 0 && (
        <ul className="space-y-1 min-w-0" data-testid="list-concierge-tasks">
          {list.map((task) => (
            <li
              key={task.taskKindKey}
              className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-[color:var(--earn-ink)] break-words min-w-0"
              data-testid={`concierge-task-${task.taskKindKey}`}
            >
              <span className="min-w-0 break-words">{task.label}</span>
              {typeof task.cap === "number" && task.cap > 0 && (
                <span className="text-[12px] text-[color:var(--earn-muted)]" data-testid={`concierge-task-cap-${task.taskKindKey}`}>
                  {taskCapLine(task.cap)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasLinkOnly && expertName && (
        <p className="text-[12px] text-[color:var(--earn-muted)] break-words" data-testid="text-concierge-link-only">
          {taskLinkOnlyLine(expertName)}
        </p>
      )}
    </div>
  );
}

/**
 * The consent step's body (tick, the two rule lines, the error, confirm) — rendered inside the dialog, and on its
 * own in tests (a Radix dialog does not server-render). Confirm (H4) is disabled until ticked; the single-flight
 * latch sends one request for a double click and is released only when the request settles.
 */
export function ConciergeHireConsent({
  expertName,
  tripEndDate,
  pending,
  error,
  onConfirm,
  initiallyTicked = false,
}: {
  expertName: string;
  tripEndDate: string | null | undefined;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  /** Test seam: render the ticked state. */
  initiallyTicked?: boolean;
}) {
  const [ticked, setTicked] = useState(initiallyTicked);
  const flight = useRef(createSingleFlight());
  const consent = consentLine(expertName, tripEndDate);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) flight.current.settle();
    wasPending.current = pending;
  }, [pending]);
  const confirm = () => {
    if (!ticked || pending || !consent) return;
    if (!flight.current.tryStart()) return;
    onConfirm();
  };
  return (
    <>
      <div className="space-y-3 min-w-0">
        {consent && (
          <div className="flex items-start gap-2 min-w-0">
            <Checkbox
              id="concierge-hire-consent"
              checked={ticked}
              onCheckedChange={(v) => setTicked(v === true)}
              data-testid="checkbox-concierge-hire-consent"
            />
            <Label
              htmlFor="concierge-hire-consent"
              className="text-sm font-normal leading-snug break-words min-w-0"
              data-testid="label-concierge-hire-consent"
            >
              {consent}
            </Label>
          </div>
        )}
        <p className="text-[12px] text-muted-foreground break-words" data-testid="text-concierge-charge-rule">
          {chargeRuleLine(expertName)}
        </p>
        <p className="text-[12px] text-muted-foreground break-words" data-testid="text-concierge-cancel-rule">
          {cancelRuleLine(expertName)}
        </p>
        {error && (
          <p className="text-sm text-destructive break-words" data-testid="text-concierge-hire-error">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button
          type="button"
          className="w-full"
          onClick={confirm}
          disabled={!ticked || pending || !consent}
          data-testid="button-concierge-hire-confirm"
        >
          {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {confirmLabel(expertName)}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The consent dialog: the approved CTA as its title, and the body above. */
export function ConciergeHireDialog({
  open,
  onOpenChange,
  expertName,
  tripEndDate,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertName: string;
  tripEndDate: string | null | undefined;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full" data-testid="dialog-concierge-hire">
        <DialogHeader>
          <DialogTitle>{CONCIERGE_HIRE_COPY.cta}</DialogTitle>
          <DialogDescription className="sr-only">{chargeRuleLine(expertName)}</DialogDescription>
        </DialogHeader>
        {/* Remounted per open, so the tick and the latch start fresh every time. */}
        {open && (
          <ConciergeHireConsent
            expertName={expertName}
            tripEndDate={tripEndDate}
            pending={pending}
            error={error}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
