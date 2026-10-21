/**
 * Fever title filter (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 * A traveler-facing Fever event whose TITLE hits the shared refusal list is dropped.
 * The phrases #1607 named (geisha, hidden gem(s), back alley, trending, illuminations)
 * are entries on `SURFACE_COPY_REFUSALS`, not a second spelling of those patterns.
 * Descriptions are not read. Hero and seasonal copy that says "illuminations" is a
 * different surface and is not this filter.
 */
import { SURFACE_COPY_REFUSALS } from "./banned-copy";

const FEVER_TITLE_WORDS = ["geisha", "hidden gem(s)", "back alley", "trending", "illuminations"] as const;

/** True when this title must not be shown to a traveler. A missing title is not a match. */
export function feverTitleBlocked(title: string | null | undefined): boolean {
  if (!title) return false;
  return FEVER_TITLE_WORDS.some((words) => {
    const entry = SURFACE_COPY_REFUSALS.find((e) => e.words === words);
    if (!entry) throw new Error(`fever title filter: "${words}" is not on SURFACE_COPY_REFUSALS`);
    return new RegExp(entry.source, "i").test(title);
  });
}
