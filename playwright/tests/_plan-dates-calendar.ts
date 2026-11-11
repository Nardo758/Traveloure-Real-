/**
 * Cut-list #1 slice B: pick a date range on THE range calendar (`PlanDatesCalendar`).
 *
 * The two-field date inputs are gone everywhere a plan's dates are chosen (the slip's dates panel,
 * the header chip popover, PlanEntry), so specs that used to `fill()` them pick days here instead.
 * It works inside any container that holds one calendar: it walks the month caption to each day's
 * month with the picker's own previous/next buttons, then taps that month's day (never an outside
 * day from the neighbouring month). A same-day trip is the same day tapped twice.
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

async function tapDay(root: Locator, day: string): Promise<void> {
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
  await tapDay(root, start);
  await tapDay(root, end);
}
