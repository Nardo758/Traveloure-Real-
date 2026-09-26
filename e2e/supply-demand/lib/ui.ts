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
 *
 * `appears()` (lead review, isVisible sweep): `Locator.isVisible({ timeout })`
 * does NOT poll or wait for the element to appear — it checks the DOM's
 * CURRENT state and returns immediately; the `timeout` option has no effect
 * on that behaviour (confirmed live: a chat composer that was genuinely on
 * screen by the time a screenshot fired, moments after an `isVisible({timeout:
 * 5000})` check on the SAME locator had already returned false). Every
 * gating check in this harness — "is this control here yet" — must use
 * `appears()` (backed by `Locator.waitFor`, which DOES poll) instead of a
 * bare `isVisible()` call with a timeout that was silently doing nothing.
 */
import type { Page, Locator } from '@playwright/test';

export const ACTION_TIMEOUT_MS = 3000;

/**
 * Waits up to `timeoutMs` for `locator` to become visible, returning true/false rather than
 * throwing. Use this everywhere a gating decision depends on "has this control appeared yet" —
 * never a bare `locator.isVisible({ timeout })`, which does not wait.
 */
export async function appears(locator: Locator, timeoutMs: number = ACTION_TIMEOUT_MS): Promise<boolean> {
  return locator
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}

export async function fillIfVisible(page: Page, testid: string, value: string): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`);
  if ((await loc.count()) === 0) return false;
  const el = loc.first();
  if (!(await appears(el, ACTION_TIMEOUT_MS))) return false;
  await el.fill(value, { timeout: ACTION_TIMEOUT_MS }).catch(() => {});
  return true;
}

export async function clickIfVisible(page: Page, testid: string): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`);
  if ((await loc.count()) === 0) return false;
  const el = loc.first();
  if (!(await appears(el, ACTION_TIMEOUT_MS))) return false;
  await el.click({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
  return true;
}

export async function checkIfVisible(page: Page, testid: string): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testid}"]`);
  if ((await loc.count()) === 0) return false;
  const el = loc.first();
  if (!(await appears(el, ACTION_TIMEOUT_MS))) return false;
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
    if (await appears(testid(page, stopWhenVisible), ACTION_TIMEOUT_MS)) break;
    const btn = testid(page, nextTestId);
    if (!(await appears(btn, ACTION_TIMEOUT_MS))) break;
    if (await btn.isDisabled().catch(() => false)) break;
    await btn.click({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
    clicks += 1;
    await page.waitForTimeout(400);
  }
  return clicks;
}
