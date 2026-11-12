/**
 * QA round 3 PR 1 (Leon, Nov 11, 2026): which day the slip's list opens on.
 *
 * A confirmed plan draws every day of its window, empty days included (major 8), so "the first day" can be an empty
 * Day 1 while the plan's stops sit on Day 2. The default open day is therefore the FIRST DAY HOLDING AN ITEM, else
 * Day 1 (the first slot). A highlighted item still opens its own day as well, and a day the traveler opened or closed
 * keeps their choice — both are applied by the caller around this rule, unchanged. Pure.
 */

/** The index of the first slot holding at least one item; 0 when none does (an empty plan opens on Day 1). */
export function defaultOpenDayIndex(slotItemCounts: readonly number[]): number {
  const first = slotItemCounts.findIndex((n) => n > 0);
  return first >= 0 ? first : 0;
}

/**
 * Is this day open, before the traveler has toggled it? Open when it is the default open day, or when it holds the
 * highlighted item.
 */
export function slipDayOpenByDefault(input: {
  index: number;
  defaultIndex: number;
  items: readonly { id: string }[];
  highlightItemId?: string | null;
}): boolean {
  if (input.index === input.defaultIndex) return true;
  return !!input.highlightItemId && input.items.some((a) => a.id === input.highlightItemId);
}
