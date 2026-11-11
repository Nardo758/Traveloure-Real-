/**
 * Cut-list #1 slice B: pick a date range on THE range calendar (`PlanDatesCalendar`).
 *
 * The two-field date inputs are gone everywhere a plan's dates are chosen (the slip's dates panel,
 * the header chip popover, PlanEntry), so specs that used to `fill()` them pick days here instead.
 * It works inside any container that holds one calendar: it walks the month caption to each day's
 * month with the picker's own previous/next buttons, then taps that month's day (never an outside
 * day from the neighbouring month). A same-day trip is the same day tapped twice.
 *
 * QA round 3 option A (Leon, Nov 11, 2026): on a calendar that already holds an arrive day, a tap before it is the
 * LEAVE day and the pair is refused; a second tap there, while the refusal shows, starts a new range. So on a
 * prefilled calendar `pickPlanDates` taps the new arrive day twice when the first tap was refused. STATED LIMIT: a new
 * arrive day AFTER a prefilled one is read as a leave day (option A never moves the arrive day forward on one tap) —
 * pick on an empty calendar, or an earlier arrive day, from this helper.
 */
import type { Locator } from "@playwright/test";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseDay(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m: m - 1, d };
}

async function showMonth(root: Locator, y: number, m: number): Promise<void> {
  const caption = root.locator('[aria-live="polite"]').first();
  for (let i = 0; i < 36; i++) {
    const shown = ((await caption.textContent()) ?? "").trim();
    const [name, yearText] = shown.split(/\s+/);
    const sm = MONTHS.indexOf(name);
    const sy = Number(yearText);
    if (sm === m && sy === y) return;
    const ahead = sy * 12 + sm < y * 12 + m;
    await root.getByRole("button", { name: ahead ? /next month/i : /previous month/i }).click();
  }
  throw new Error(`calendar never showed ${MONTHS[m]} ${y}`);
}

/** Tap one day (`YYYY-MM-DD`) on the one calendar inside `root`. */
export async function tapPlanDay(root: Locator, day: string): Promise<void> {
  const { y, m, d } = parseDay(day);
  await showMonth(root, y, m);
  await root
    .locator('button[name="day"]:not(.day-outside)')
    .filter({ hasText: new RegExp(`^${d}$`) })
    .first()
    .click();
}

/** Pick `start`..`end` (`YYYY-MM-DD`) on the one calendar inside `root`. */
export async function pickPlanDates(root: Locator, start: string, end: string): Promise<void> {
  await tapPlanDay(root, start);
  // A prefilled calendar: an earlier arrive day was read as a refused leave day; tap it again to start there.
  if (await root.locator('[role="alert"]').isVisible()) await tapPlanDay(root, start);
  await tapPlanDay(root, end);
}
