/**
 * The city page's spine chip rail (Phase 2c) — the chip list and two pure TB2.7 rules.
 *
 * TB2.7 (round 2, Leon Nov 10, 2026): a spine chip with nothing behind it is NOT drawn — the same rule the tray applies
 * to coming-soon tools. "Stay", "Services", "Experts" and "Vibe" answered zero results with no empty state; a chip
 * nobody can use is hidden until there is supply. "All gems" always draws. An active chip that is no longer drawn
 * reads as "all" (`effectiveSpineFilter`), so the feed never filters to a chip the rail does not show.
 */
export const SPINE_CHIPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "all", label: "All gems" },
  { id: "eat", label: "Eat" },
  { id: "do", label: "Do" },
  { id: "stay", label: "Stay" },
  { id: "services", label: "Services" },
  { id: "experts", label: "Experts" },
  { id: "events", label: "Events" },
  { id: "photo_spots", label: "Photo spots" },
  { id: "vibe", label: "Vibe" },
];

export function shownSpineChips(counts: Record<string, number>): ReadonlyArray<{ id: string; label: string }> {
  return SPINE_CHIPS.filter((c) => c.id === "all" || (counts[c.id] ?? 0) > 0);
}

export function effectiveSpineFilter(active: string, counts: Record<string, number>): string {
  return shownSpineChips(counts).some((c) => c.id === active) ? active : "all";
}
