/**
 * `ExpertNote` — the ONE expert-note renderer (surface spec v1.2 §3 / §10; step 1, ledger
 * `2026-10-03-surface-step1-item-row`). Replaces the slip's `ExpertNoteBlock`; the Trip Card's inline
 * block in `ActivitiesSection` moves onto it in step 6.
 *
 * Under the item it concerns: the author (and their neighbourhood, when known), the note in full —
 * never truncated — and an optional follow-up slot (the existing per-item thread, `ItemComments`).
 * §13: no author name ⇒ "your expert", never an invented name.
 */
import type { ReactNode } from "react";
import { EXPERT_NOTE_TINT } from "@/components/plancard/slip-tokens";

export interface ExpertNoteProps {
  note: string;
  author: string | null;
  neighbourhood?: string | null;
  /** The follow-up control ("Ask a follow-up" → `ItemComments`), mounted by the caller when there is someone to ask. */
  followUp?: ReactNode;
}

export function ExpertNote({ note, author, neighbourhood = null, followUp = null }: ExpertNoteProps) {
  return (
    <div
      className="mt-2 rounded-md border-l-2 bg-muted/30 px-3 py-2"
      style={{ borderLeftColor: EXPERT_NOTE_TINT.border }}
      data-testid="slip-expert-note"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: EXPERT_NOTE_TINT.fg }}>
        Note from {author || "your expert"}
        {neighbourhood ? <span className="normal-case font-normal"> · {neighbourhood}</span> : null}
      </p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{note}</p>
      {followUp}
    </div>
  );
}
