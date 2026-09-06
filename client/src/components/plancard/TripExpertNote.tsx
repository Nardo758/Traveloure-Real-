/**
 * TripExpertNote — the trip-level "Expert Notes", DELIVERED to the traveler.
 *
 * CLAUDE.md Locked Decision 21 (ratified Aug 9, 2026; migration 187); ledger
 * `2026-09-06-slip-small-additions` (Locked Decision 42 build-order row 1.3, S5), which is what
 * put it on the slip beside the Trip Card that already had it.
 *
 * ── THREE FIELDS, AND THIS COMPONENT RENDERS EXACTLY ONE OF THEM ─────────────────────────────
 * Locked Decision 21 names three and forbids merging them:
 *   · `itinerary_items.expert_note`     — PER ITEM, traveler-facing (the slip's `ExpertNoteBlock`).
 *   · `trips.expert_traveler_note`      — PER PLAN, traveler-facing. **THIS ONE.**
 *   · `trips.expert_notes`              — PER PLAN, the Workstation's PRIVATE build notes
 *                                         (`PATCH /api/trips/:id/expert-notes`). It must NEVER
 *                                         reach a traveler surface, and the plancard payload
 *                                         deliberately does not carry it.
 * The prop is named for the column it renders so a caller cannot pass the wrong one by accident,
 * and the component takes a STRING rather than the trip object precisely so it can never reach
 * for the private sibling itself.
 *
 * ── WHY IT IS A COMPONENT AND NOT A COPIED BLOCK ─────────────────────────────────────────────
 * PlanCard has rendered this note since §21 landed; the slip had the field on its DTO and drew
 * nothing. Mirroring PlanCard's markup into `SlipView` would have been a second statement of "how
 * a note from your expert looks", which is the drift class §18 rule 1 names — the two surfaces
 * would answer the same question in two typefaces the first time either was restyled. So the
 * treatment moved HERE verbatim (amber inset, 💡, "From your expert") and BOTH surfaces call it.
 * `testId` is a prop because the two surfaces keep their own existing pins.
 *
 * §13 — ABSENT IS ABSENT. A null, undefined or whitespace-only note renders NOTHING: no empty
 * callout, no "your expert hasn't left a note", which is a claim about the expert's work rather
 * than about what we hold.
 */
export function TripExpertNote({
  expertTravelerNote,
  testId,
  className,
}: {
  /** `trips.expert_traveler_note` — the TRAVELER-FACING plan note, never `trips.expert_notes`. */
  expertTravelerNote?: string | null;
  testId: string;
  className?: string;
}) {
  const note = typeof expertTravelerNote === "string" ? expertTravelerNote.trim() : "";
  if (note.length === 0) return null;

  return (
    <div
      className={`rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5${className ? ` ${className}` : ""}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[12px]">💡</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          From your expert
        </span>
      </div>
      <p className="text-[12.5px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">
        {expertTravelerNote}
      </p>
    </div>
  );
}
