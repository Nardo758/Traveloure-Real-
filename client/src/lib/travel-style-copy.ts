/**
 * Row 306 (CS-3 brief 10, E), client: the words of the "Your travel style" card and the /privacy line.
 *
 *   · "Your travel style" and the pattern "Built around: [traits]." — quoted in the row 306 brief.
 *   · the /privacy sentence — approved by Leon, Oct 31, 2026, 8:51 PM ET, used verbatim.
 *   · "Reset my preferences" — HELD for Leon; the placeholder the decision-maker gave (Nov 1, 2026).
 * Anything else is HELD for Leon and is a placeholder.
 */
import type { SelectionTrait } from "@shared/selection-profile";

export const TRAVEL_STYLE_COPY = {
  heading: "Your travel style",
  builtAround: (traits: string) => `Built around: ${traits}.`,
  /** HELD for Leon (placeholder given by the decision-maker, Nov 1, 2026). */
  reset: "Reset my preferences",
  /** Shown when the profile is on but no pattern has formed yet. HELD for Leon. */
  noPattern: "[HELD for Leon]",
  /** Toast after a reset. HELD for Leon. */
  resetDone: "[HELD for Leon]",
  /** Toast when a reset fails. HELD for Leon. */
  resetFailed: "[HELD for Leon]",
} as const;

/** The approved /privacy profiling sentence, verbatim (Leon, Oct 31, 2026, 8:51 PM ET). */
export const PRIVACY_SELECTIONS_LINE = "we use your selections to build and improve your plans";

/** A trait's value as the traveler reads it: a neighbourhood slug becomes its name ("gion-shirakawa" → "Gion Shirakawa"). */
export function travelStyleTraitText(trait: SelectionTrait): string {
  const words = trait.value.split("-").filter(Boolean);
  if (trait.field === "neighbourhood") return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return words.join(" ").replace(/_/g, " ");
}

/** "Built around: Gion, evening, meal." — null when there is no trait, so the card says so instead. */
export function travelStyleLine(traits: readonly SelectionTrait[]): string | null {
  if (traits.length === 0) return null;
  return TRAVEL_STYLE_COPY.builtAround(traits.map(travelStyleTraitText).join(", "));
}
