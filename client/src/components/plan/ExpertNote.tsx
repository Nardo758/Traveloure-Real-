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
import { usePlanRowLook } from "./row-look";

export interface ExpertNoteProps {
  note: string;
  author: string | null;
  neighbourhood?: string | null;
  /** The follow-up control ("Ask a follow-up" → `ItemComments`), mounted by the caller when there is someone to ask. */
  followUp?: ReactNode;
}

export function ExpertNote({ note, author, neighbourhood = null, followUp = null }: ExpertNoteProps) {
  // The Main board's note (ledger `2026-10-08-slip-main-rows`): a gold rule and wash, the same words.
  if (usePlanRowLook() === "board") {
    return (
      <div
        className="mt-1 flex flex-col gap-1 rounded-r-[10px] border-l-[3px] border-[color:var(--slip-gold)] bg-[color:var(--slip-note-wash)] px-3 py-2.5"
        data-testid="slip-expert-note"
      >
        <p className="text-xs font-semibold text-[color:var(--slip-gold-ink)]">
          Note from {author || "your expert"}
          {neighbourhood ? <span className="font-normal"> · {neighbourhood}</span> : null}
        </p>
        <p className="whitespace-pre-wrap text-[13px] leading-[1.45] text-[color:var(--slip-ink)]">{note}</p>
        {followUp}
      </div>
    );
  }
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
