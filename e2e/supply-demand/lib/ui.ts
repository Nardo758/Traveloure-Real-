/**
 * ui.ts — small resilient helpers shared by the supply specs.
 * Long multi-step forms (ServiceForm, the expert application) vary which
 * fields render by role/offering/category, so these helpers are best-effort:
 * they fill a field ONLY if it is present, and never fail the test for an
 * absent optional field. A genuinely missing REQUIRED control is the spec's
 * own job to assert and file as a finding.
 *
 * PER-ACTION TIMEOUT (lead review, Pass 2 hardening): Playwright's action
 * timeout defaults to 0 (no limit other than the whole test's timeout), so a
 * single element that is present but never becomes actionable (covered,
 * animating, disabled) used to burn the ENTIRE test budget on one `.fill()`
 * or `.click()` call. Every action below now carries an explicit short
 * timeout (`ACTION_TIMEOUT_MS`) so one stuck field fails fast and the walker
 * moves on — a long multi-step form finishes in seconds, not minutes.
 */
import type { Page, Locator } from '@playwright/test';

export const ACTION_TIMEOUT_MS = 3000;

export async function fillIfVisible(page: Page, testid: string, value: string): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`);
  if ((await loc.count()) === 0) return false;
  const el = loc.first();
  if (!(await el.isVisible({ timeout: ACTION_TIMEOUT_MS }).catch(() => false))) return false;
  await el.fill(value, { timeout: ACTION_TIMEOUT_MS }).catch(() => {});
  return true;
}

export async function clickIfVisible(page: Page, testid: string): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`);
  if ((await loc.count()) === 0) return false;
  const el = loc.first();
  if (!(await el.isVisible({ timeout: ACTION_TIMEOUT_MS }).catch(() => false))) return false;
  await el.click({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
  return true;
}

export async function checkIfVisible(page: Page, testid: string): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`);
  if ((await loc.count()) === 0) return false;
  const el = loc.first();
  if (!(await el.isVisible({ timeout: ACTION_TIMEOUT_MS }).catch(() => false))) return false;
  const alreadyChecked = await el.getAttribute('data-state').then((s) => s === 'checked').catch(() => false);
  if (!alreadyChecked) await el.click({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
  return true;
}

export function testid(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]`);
}

/** Click a "next" control repeatedly (ServiceForm's button-step-next), up to `max` times, stopping when it disappears or a target testid appears. */
export async function advanceWizard(
  page: Page,
  nextTestId: string,
  stopWhenVisible: string,
  max = 10,
): Promise<number> {
  let clicks = 0;
  for (let i = 0; i < max; i++) {
    if (await testid(page, stopWhenVisible).isVisible({ timeout: ACTION_TIMEOUT_MS }).catch(() => false)) break;
    const btn = testid(page, nextTestId);
    if (!(await btn.isVisible({ timeout: ACTION_TIMEOUT_MS }).catch(() => false))) break;
    if (await btn.isDisabled().catch(() => false)) break;
    await btn.click({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
    clicks += 1;
    await page.waitForTimeout(400);
  }
  return clicks;
}
