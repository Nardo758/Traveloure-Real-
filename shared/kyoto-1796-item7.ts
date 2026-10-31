/**
 * #1796 follow-up, item 7 (ledger `2026-10-31-kyoto-1796-item7`): the Kyoto copy #1804 left.
 *
 * Removals only, except one approved rewording: Yoshida Sanso's "Imperial guesthouse" now reads
 * "villa of the Higashi-Fushimi imperial family". A removed phrase is not replaced. When a whole
 * field was the phrase, the field is cleared (null).
 *
 * The popular-cities seed writes `next` on a fresh boot. Migration 426 writes the same value onto
 * a stored row, and only while that row still holds one of the `priors` (421's output, or the text
 * before 421). Ginkaku-ji is not here: #1804 already writes the approved admission and autumn lines
 * through the GINKAKU_* constants in kyoto-seed-cleanup.ts.
 */
import {
  FUSHIMI_DAWN_WHY,
  FUSHIMI_DAWN_WHY_PRIOR,
  PHILOSOPHER_DESCRIPTION,
  PHILOSOPHER_DESCRIPTION_PRIOR,
  PRE_DAWN_DESCRIPTION,
  PRE_DAWN_DESCRIPTION_PRIOR,
} from "./kyoto-seed-cleanup";

/** The approved rewording plus the removals of "Nine suites" and "kaiseki dinner served in your room". */
export const YOSHIDA_SANSO_DESCRIPTION =
  "A converted 1932 villa of the Higashi-Fushimi imperial family on the forested slopes of Mount Yoshida.";
export const YOSHIDA_SANSO_DESCRIPTION_PRIOR =
  "A converted 1932 Imperial guesthouse on the forested slopes of Mount Yoshida. Nine suites, a private garden, and multi-course kaiseki dinner served in your room.";

/** "no-one under 18" removed. */
export const YOSHIDA_SANSO_WHY = "The Japanese imperial hospitality tradition is alive here. No-one rushes you, pure Kyoto.";
export const YOSHIDA_SANSO_WHY_PRIOR =
  "The Japanese imperial hospitality tradition is alive here. No-one rushes you, no-one under 18, pure Kyoto.";

/** "arguably more beautiful than sakura season" removed with its sentence. */
export const PHILOSOPHER_DESCRIPTION_ITEM7 = "The canal-side path connecting Nanzen-ji to Ginkaku-ji.";

/**
 * "yours alone and lit like a film set" was the whole value, so the field is cleared. The seed
 * writes an empty string here and stores it as null (its `whyText === "" ? null` rule).
 */
export const FUSHIMI_DAWN_WHY_ITEM7 = "";

/** "magical" removed with its sentence; "and candlelight" removed. */
export const PRE_DAWN_DESCRIPTION_ITEM7 = "Arriving at 4:30am means walking the full summit trail in mist.";

export interface KyotoItem7Fix {
  placeName: string;
  column: "description" | "why_locals_love_it";
  /** Stored values this fix may replace: 421's output first, then the text before 421. */
  priors: readonly string[];
  /** Null clears the column: the removed phrase was the whole value. */
  next: string | null;
}

export const KYOTO_ITEM7_FIXES: readonly KyotoItem7Fix[] = [
  {
    placeName: "Yoshida Sanso Ryokan",
    column: "description",
    priors: [YOSHIDA_SANSO_DESCRIPTION_PRIOR],
    next: YOSHIDA_SANSO_DESCRIPTION,
  },
  {
    placeName: "Yoshida Sanso Ryokan",
    column: "why_locals_love_it",
    priors: [YOSHIDA_SANSO_WHY_PRIOR],
    next: YOSHIDA_SANSO_WHY,
  },
  {
    placeName: "Philosopher's Path Canal in Autumn",
    column: "description",
    priors: [PHILOSOPHER_DESCRIPTION, PHILOSOPHER_DESCRIPTION_PRIOR],
    next: PHILOSOPHER_DESCRIPTION_ITEM7,
  },
  {
    placeName: "Fushimi Inari Pre-Dawn Hike",
    column: "description",
    priors: [PRE_DAWN_DESCRIPTION, PRE_DAWN_DESCRIPTION_PRIOR],
    next: PRE_DAWN_DESCRIPTION_ITEM7,
  },
  {
    placeName: "Fushimi Inari Torii Tunnel at Dawn",
    column: "why_locals_love_it",
    priors: [FUSHIMI_DAWN_WHY, FUSHIMI_DAWN_WHY_PRIOR],
    next: null,
  },
];

/** The phrases item 7 removes; none may remain in the Kyoto seed, the cleanup copy or a stored row. */
export const KYOTO_ITEM7_REMOVED_PHRASES = [
  /nine suites/i,
  /under 18/i,
  /served in your room/i,
  /\barguably\b/i,
  /candlelight/i,
  /film set/i,
  /\bmagical\b/i,
  /school\s*¥\s*500/i,
  /imperial guesthouse/i,
] as const;
