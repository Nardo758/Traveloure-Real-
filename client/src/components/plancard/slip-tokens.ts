/**
 * Slip status-tint token layer — the ONE home of the routing-status tint values
 * (SLIP_EXPERIENCE_DISPATCH §4 global rules: "define them ONCE in the token layer,
 * no literals in components"). Every surface that renders a routing-status pill —
 * the PlanCard full stage's RoutingBadge, the Slip view (Spec A/B), the proposal
 * columns (Spec C) — reads these tokens, so one canonical trip renders the SAME
 * status pill everywhere (ruling 8's mockup invariant).
 *
 * Tint values (ratified mapping):
 *   in_planning        → neutral outline pill, muted text (no tint hex — theme tokens)
 *   with_expert        → teal
 *   ready_for_checkout → gold
 *   purchased / booked → green
 *   logistics rows     → muted outline pill labeled "logistics", never a routing pill
 *
 * Rendering mechanism: inline `style` built from these constants (NOT Tailwind
 * arbitrary-value classes — the JIT purge cannot see classes assembled from
 * constants, and scattering the hexes into literal class strings is exactly what
 * this module exists to prevent).
 */
import type { CSSProperties } from "react";
import type { RoutingStatus } from "@shared/schema";

// The three tinted states' hues — the ONLY place these hex values may appear.
const TEAL = "#2E8B8B"; // with_expert
const GOLD = "#E8B339"; // ready_for_checkout
const GREEN = "#5DCAA5"; // purchased / booked

/** 8-digit hex alpha suffixes (00–FF). Kept as named constants so the tint styles below stay readable. */
const BG_ALPHA = "26"; // ~15% — pill background
const BORDER_ALPHA = "59"; // ~35% — inset/border accents

export interface StatusTint {
  /** Foreground/text color. */
  fg: string;
  /** Pill background (translucent — works on light and dark themes). */
  bg: string;
  /** Border accent (e.g. the ExpertNoteBlock inset). */
  border: string;
  /** Human pill label. */
  label: string;
}

export const ROUTING_TINTS: Record<RoutingStatus, StatusTint> = {
  // Neutral outline pill: theme-variable driven, so it follows light/dark like every
  // other outline element. Empty bg/border strings mean "use the theme classes".
  in_planning: { fg: "", bg: "", border: "", label: "Planning" },
  with_expert: { fg: TEAL, bg: `${TEAL}${BG_ALPHA}`, border: `${TEAL}${BORDER_ALPHA}`, label: "With your expert" },
  ready_for_checkout: { fg: GOLD, bg: `${GOLD}${BG_ALPHA}`, border: `${GOLD}${BORDER_ALPHA}`, label: "In checkout" },
  purchased: { fg: GREEN, bg: `${GREEN}${BG_ALPHA}`, border: `${GREEN}${BORDER_ALPHA}`, label: "Purchased" },
};

/** The booked pill (booking-row presence — the contract's "presence is the booked state")
 *  shares the purchased tint: bought is bought, whichever signal proves it. */
export const BOOKED_TINT: StatusTint = { ...ROUTING_TINTS.purchased, label: "Booked" };

/** Spec B additions ride the same green (OptimizedBadge). */
export const OPTIMIZED_TINT: StatusTint = { ...ROUTING_TINTS.purchased, label: "Optimized" };

/** The teal expert-note accent (ExpertNoteBlock label + inset border). */
export const EXPERT_NOTE_TINT = ROUTING_TINTS.with_expert;

/** Inline style for a tinted pill. Returns undefined for the neutral (in_planning) tint,
 *  whose pill renders via theme classes instead. */
export function tintPillStyle(tint: StatusTint): CSSProperties | undefined {
  if (!tint.fg) return undefined;
  return { backgroundColor: tint.bg, color: tint.fg };
}

/**
 * Slip title typography (dispatch: "Fraunces for the slip title"). Fraunces is NOT in the
 * app's loaded Google-Fonts set (client/index.html), and the dispatch build rule says use
 * the app's existing display font rather than adding a font dependency — so the slip title
 * rides the existing `--font-display` token (Tailwind `font-display`).
 */
export const SLIP_TITLE_FONT_CLASS = "font-display";
