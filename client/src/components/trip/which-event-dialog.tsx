/**
 * "WHICH EVENT?" — the write surface for `itinerary_items.user_experience_id`.
 * Ledger `2026-09-04-which-event-picker`; migration 277; CLAUDE.md Locked Decision 29.
 *
 * Migration 277 landed the column, its §19 allowlist and its server-side pairing check, and
 * ledger `2026-09-04-slip-events` landed a reader that groups the slip by it. This is the missing
 * half: the moment a traveler is asked which event an item is going under. Every decision it
 * makes — whether to ask at all, what each row may say, what the confirm sends — lives in
 * `@/lib/which-event`, so it is testable without a DOM and cannot be restated here (§18 rule 1).
 *
 * TWO THINGS THE RATIFIED MOCK DRAWS THAT THIS DELIBERATELY DOES NOT BUILD:
 *
 *  - **CLOCK TIMES ("Fri 19:00").** They do not exist. `user_experiences.event_date` is a DATE
 *    column and there is no time-of-day column anywhere on the row (`shared/schema.ts`), so a
 *    start time here would be a schedule the traveler never gave us (§13). Each row shows the
 *    event's date when set and its place when set — `eventMetaLine`, the same derivation the
 *    slip's event heading uses — and nothing else.
 *
 *  - **A "suggested for florists" HINT.** That implies a mapping from a service's category to
 *    the event it belongs to, and **no such mapping exists in this codebase**: the column that
 *    would carry it (`experience_types.roles_needed`) is absent from the repo and HELD pending
 *    decision-maker ratification. Inventing one — keyword-matching a category against an event
 *    title — would be the platform claiming knowledge it does not have. So no row is marked,
 *    and no row is pre-selected on a guess.
 *
 * The subject card is passed in by the caller as a title and an already-composed meta line: this
 * component never reaches for a listing's fields itself, so it cannot decide to print something
 * the calling surface has judged unsafe to show (a raw category id, an "Unknown" location).
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  findWhichEventChoice,
  whichEventChoices,
  whichEventCtaLabel,
  INITIAL_WHICH_EVENT_SELECTION,
  UNLABELLED_EVENT_DESCRIPTION,
  type PlanEvent,
  type WhichEventChoice,
} from "@/lib/which-event";

/** The mock's footnote, and a true statement of rule 2 (`shouldAskWhichEvent`). */
export const WHICH_EVENT_FOOTNOTE = "A plan with one event skips this question.";

export interface WhichEventSubject {
  /** What is being added — the listing's own name. */
  title: string;
  /** A supporting line the CALLER composed from fields it already renders. Optional. */
  meta?: string;
}

export interface WhichEventPickerProps {
  subject: WhichEventSubject;
  /** The plan's events, already filtered to the plan and in the SERVER's order (never re-sorted). */
  events: readonly PlanEvent[];
  /** True while the add is in flight. */
  submitting?: boolean;
  /**
   * The chosen link. `null` is a REAL answer — the plan's ONE implicit unnamed event — and is
   * sent as an explicit `null`, never as an omitted key (Locked Decision 29).
   */
  onConfirm: (userExperienceId: string | null) => void;
  onCancel: () => void;
}

/**
 * The picker's body, exported without the modal chrome so it can be rendered in a test without a
 * portal. All of the honesty rules are asserted against THIS.
 */
export function WhichEventPicker({
  subject,
  events,
  submitting,
  onConfirm,
  onCancel,
}: WhichEventPickerProps) {
  const choices = whichEventChoices(events);
  // Rule 3 — NOTHING is pre-selected. There is no source in this codebase for a suggestion, so
  // the traveler's first click is the first answer that exists.
  const [selectedKey, setSelectedKey] = useState<string | null>(INITIAL_WHICH_EVENT_SELECTION);
  const selected = findWhichEventChoice(choices, selectedKey);

  // A row that disappears between renders (an event deleted in another tab) must not leave a
  // stale selection pointing at it — clearing back to "nothing chosen" is honest; silently
  // re-pointing at a different event would file the item under a row the traveler never picked.
  // Keyed on the row keys themselves, not the freshly-built array, so the effect settles.
  const choiceKeys = choices.map((c) => c.key).join("\u0000");
  useEffect(() => {
    if (selectedKey && !choiceKeys.split("\u0000").includes(selectedKey)) {
      setSelectedKey(INITIAL_WHICH_EVENT_SELECTION);
    }
  }, [choiceKeys, selectedKey]);

  return (
    <div className="flex flex-col gap-4" data-testid="which-event-picker">
      {/* The listing being added. */}
      <div
        className="flex items-center gap-3 rounded-[10px] border p-3"
        style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
        data-testid="which-event-subject"
      >
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <span
            className="truncate text-[15px] font-semibold"
            style={{ color: "var(--earn-ink)" }}
          >
            {subject.title}
          </span>
          {/* Rendered only when the caller actually has one — never a placeholder line (§13). */}
          {subject.meta ? (
            <span
              className="truncate font-mono text-[11px]"
              style={{ color: "var(--earn-muted)" }}
              data-testid="which-event-subject-meta"
            >
              {subject.meta}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Which event?">
        {choices.map((choice) => (
          <WhichEventRow
            key={choice.key}
            choice={choice}
            selected={selectedKey === choice.key}
            onSelect={() => setSelectedKey(choice.key)}
          />
        ))}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
        style={{ borderColor: "var(--earn-border)" }}
      >
        <span className="font-mono text-[11px]" style={{ color: "var(--earn-faint)" }}>
          {WHICH_EVENT_FOOTNOTE}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="min-h-[40px] rounded-[10px] text-[13px] font-semibold"
            onClick={onCancel}
            disabled={submitting}
            data-testid="which-event-cancel"
          >
            Cancel
          </Button>
          <Button
            className="min-h-[40px] rounded-[10px] bg-[var(--earn-coral-ink)] hover:bg-[var(--earn-coral-ink)]/90 text-white text-[13px] font-semibold"
            // Disabled until a row is chosen: with nothing pre-selected there is no default to
            // fire, and defaulting to the implicit event would answer for the traveler.
            disabled={!selected || !!submitting}
            onClick={() => selected && onConfirm(selected.value)}
            data-testid="which-event-confirm"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {whichEventCtaLabel(selected)}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One selectable row. Its visible text is the event's own title, its date-when-set and its
 * place-when-set, and NOTHING else — an event that has told us nothing renders bare rather than
 * borrowing a name or a time from somewhere (§13).
 */
function WhichEventRow({
  choice,
  selected,
  onSelect,
}: {
  choice: WhichEventChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const bare = !choice.label && !choice.meta;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      // A bare row gets a DESCRIPTION of the control, not a fabricated name for the event.
      aria-label={bare ? UNLABELLED_EVENT_DESCRIPTION : undefined}
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-3 text-left"
      style={{
        borderColor: selected ? "var(--earn-coral-ink)" : "var(--earn-border)",
        background: "var(--earn-card)",
      }}
      data-testid={`which-event-option-${choice.key}`}
    >
      <span
        aria-hidden="true"
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: selected ? "var(--earn-coral-ink)" : "var(--earn-border-dash)" }}
      >
        {selected ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--earn-coral-ink)" }}
          />
        ) : null}
      </span>
      {choice.label ? (
        <span className="text-[14px] font-medium" style={{ color: "var(--earn-ink)" }}>
          {choice.label}
        </span>
      ) : null}
      {choice.meta ? (
        <span
          className="ml-auto font-mono text-[11px]"
          style={{ color: "var(--earn-muted)" }}
          data-testid={`which-event-meta-${choice.key}`}
        >
          {choice.meta}
        </span>
      ) : null}
    </button>
  );
}

export interface WhichEventDialogProps extends WhichEventPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The modal wrapper. All behaviour lives in `WhichEventPicker`. */
export function WhichEventDialog({ open, onOpenChange, ...picker }: WhichEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle style={{ color: "var(--earn-navy)" }}>Which event?</DialogTitle>
          <DialogDescription>
            Choose the event on your plan this belongs to.
          </DialogDescription>
        </DialogHeader>
        <WhichEventPicker {...picker} />
      </DialogContent>
    </Dialog>
  );
}
