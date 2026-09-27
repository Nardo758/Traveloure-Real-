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
 *
 * THE RULE FOR EVERY HELPER (ledger `2026-09-27-e2e-helpers-confirm-effect`): a helper returns
 * only after it has CONFIRMED the effect it was called for — a response received, an element
 * present, a state set, a session valid. A helper that returns on a timer is a defect, not a
 * style choice (R159, `2026-09-27-s1-login-must-land`). `actAndAwait` is the one way to perform an
 * action that has a server effect; `appears` is the one way to decide an element is (or is not)
 * there. A `waitForTimeout` in a helper module carries a `settle-ok:` note saying why it is not a
 * confirmation — `scripts/check-e2e-helper-waits.cjs` fails on one that does not.
 */
import type { Page, Locator } from '@playwright/test';

export const ACTION_TIMEOUT_MS = 3000;
/** How long an async LIST (an admin queue, a checklist) may take to render before "absent" is believed. */
export const LIST_LOAD_MS = 15_000;
/** How long an action's own server response may take. */
export const RESPONSE_MS = 20_000;

export type ApiMatch = { method: string | string[]; path: RegExp };

/**
 * Perform `act` and return the HTTP status of the first response matching `match`, with the wait
 * registered BEFORE the action (so a fast response is never missed). `null` = the action produced
 * no such request — the silent case every helper used to report as success.
 */
export async function actAndAwait(
  page: Page,
  act: () => Promise<unknown>,
  match: ApiMatch,
  timeoutMs: number = RESPONSE_MS,
): Promise<number | null> {
  const methods = Array.isArray(match.method) ? match.method : [match.method];
  const answered = page
    .waitForResponse(
      (r) => methods.includes(r.request().method()) && match.path.test(new URL(r.url()).pathname),
      { timeout: timeoutMs },
    )
    .then((r) => r.status())
    .catch(() => null);
  await act().catch(() => {});
  return answered;
}

export const ok2xx = (status: number | null): boolean => status !== null && status >= 200 && status < 300;

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

/** Fill a field that may legitimately be absent. true ONLY when the field now holds `value`. */
export async function fillIfVisible(page: Page, testid: string, value: string, probeMs: number = ACTION_TIMEOUT_MS): Promise<boolean> {
  const el = page.locator(`[data-testid="${testid}"]`).first();
  if (!(await appears(el, probeMs))) return false;
  await el.fill(value, { timeout: ACTION_TIMEOUT_MS }).catch(() => {});
  return (await el.inputValue().catch(() => null)) === value;
}

/** Click a control that may legitimately be absent. true ONLY when the click itself succeeded. */
export async function clickIfVisible(page: Page, testid: string, probeMs: number = ACTION_TIMEOUT_MS): Promise<boolean> {
  const el = page.locator(`[data-testid="${testid}"]`).first();
  if (!(await appears(el, probeMs))) return false;
  return el.click({ timeout: ACTION_TIMEOUT_MS }).then(() => true, () => false);
}

async function isChecked(el: Locator): Promise<boolean> {
  const state = await el.getAttribute('data-state').catch(() => null);
  if (state === 'checked') return true;
  if ((await el.getAttribute('aria-checked').catch(() => null)) === 'true') return true;
  return el.isChecked().catch(() => false);
}

/** Tick a checkbox that may legitimately be absent. true ONLY when it is now checked. */
export async function checkIfVisible(page: Page, testid: string, probeMs: number = ACTION_TIMEOUT_MS): Promise<boolean> {
  const el = page.locator(`[data-testid="${testid}"]`).first();
  if (!(await appears(el, probeMs))) return false;
  if (await isChecked(el)) return true;
  await el.click({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    if (await isChecked(el)) return true;
    await page.waitForTimeout(100); // settle-ok: polling the checkbox's own state — the loop IS the confirmation
  }
  return false;
}

export function testid(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]`);
}
