/**
 * d5-guest-to-auth.spec.ts — Pass 2, Part 2, D5.
 *
 * A signed-out visitor (T-guest) opens Provider A's service page and presses "Add to plan"
 * (button-add-to-cart), then signs up through the sign-in modal's own switch-to-signup mode.
 * Verifies whether the add survives into the new account's plan. Expected behaviour is
 * KNOWN:RC-8 (guest state dropped on auth) / KNOWN:RC-2 ("Add to Plan" silently becomes "add to
 * cart") — this spec tags the observation with those ids rather than re-filing them, UNLESS the
 * actual behaviour differs from what those gaps describe, in which case it is filed fresh.
 */
import { test } from '@playwright/test';
import { E2E_PASSWORD, e2eEmail } from './lib/run-id';
import { shot, netLogger } from './lib/evidence';
import { fileFinding } from './lib/findings';
import { q } from './lib/db';
import { readState, writeState } from './lib/state';
import { testid } from './lib/ui';

test.describe.configure({ mode: 'serial' });

test('D5: guest add-to-plan, then sign up — does the item survive?', async ({ page }) => {
  const state = readState();
  const providerA = state.listings.providerA;
  if (!providerA?.providerServiceId) {
    fileFinding({
      journey: 'D5',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P2',
      known: null,
      title: 'No Provider A listing id in harness state — cannot run D5',
      expected: 'S1 ran first and persisted providerA',
      actual: 'missing',
      where: 'e2e/supply-demand/d5-guest-to-auth.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'no supply fixture in state');
    return;
  }

  const net = netLogger(page, 'D5');
  const guestEmail = e2eEmail('tguest');

  // Ensure signed out (fresh context — no explicit login was ever done).
  await page.goto(`/services/${providerA.providerServiceId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D5', '01', 'guest-service-detail');

  const addBtn = testid(page, 'button-add-to-cart');
  const addVisible = await addBtn.isVisible({ timeout: 6000 }).catch(() => false);
  if (!addVisible) {
    fileFinding({
      journey: 'D5',
      step: 'guest:add-button',
      class: 'DEAD_TRIGGER',
      severity: 'P2',
      known: null,
      title: `button-add-to-cart not visible for a signed-out visitor on /services/${providerA.providerServiceId}`,
      expected: 'A guest sees the same Add-to-plan control as a signed-in traveler',
      actual: 'Not visible within 6s',
      where: 'client/src/pages/service-detail.tsx',
      evidence: { shot: 'shots/D5-01-guest-service-detail.png' },
      behavioural: true,
    });
    net.flush();
    return;
  }
  await addBtn.click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, 'D5', '02', 'after-guest-add-click');

  const signInModal = testid(page, 'modal-sign-in');
  const modalOpened = await signInModal.isVisible({ timeout: 4000 }).catch(() => false);
  fileFinding({
    journey: 'D5',
    step: 'guest:add-opens-signin',
    class: modalOpened ? 'SPEC_DIVERGENCE' : 'SILENT_SUCCESS',
    severity: 'P3',
    known: modalOpened ? 'KNOWN:RC-8' : null,
    title: `A guest's Add-to-plan press ${modalOpened ? 'opened the sign-in modal' : 'did NOT open a sign-in gate'} (no queued guest-cart write observed here)`,
    expected: 'service-detail.tsx beginAdd(): !user -> openSignInModal() with no guest-side queue',
    actual: `modal-sign-in visible=${modalOpened}`,
    where: 'client/src/pages/service-detail.tsx (beginAdd)',
    evidence: { shot: 'shots/D5-02-after-guest-add-click.png' },
    behavioural: true,
  });

  if (!modalOpened) {
    net.flush();
    return;
  }

  // Switch to signup mode inside the modal and create the account.
  const switchLink = testid(page, 'link-switch-signup');
  if (await switchLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await switchLink.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await testid(page, 'input-first-name').fill('E2E').catch(() => {});
  await testid(page, 'input-last-name').fill('TGuest').catch(() => {});
  await testid(page, 'input-email').fill(guestEmail).catch(() => {});
  await testid(page, 'input-password').fill(E2E_PASSWORD).catch(() => {});
  await testid(page, 'checkbox-signup-terms').click({ timeout: 3000 }).catch(() => {});
  await testid(page, 'checkbox-signup-privacy').click({ timeout: 3000 }).catch(() => {});
  await shot(page, 'D5', '03', 'signin-modal-signup-filled');
  await testid(page, 'button-auth-submit').click().catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot(page, 'D5', '04', 'after-signup-submit');
  writeState((s) => {
    s.accounts.tguest = { email: guestEmail };
  });

  // Did the add survive? Check DB for any itinerary_items/cart_items row referencing A under the
  // new account, and check the UI on a reload of the same service page (does it now show "in your
  // plan"/"added" state?).
  const newUser = await q(`SELECT id FROM users WHERE email = $1`, [guestEmail]);
  const userId = newUser[0]?.id;
  const survivedItems = userId
    ? await q(
        `SELECT ii.id FROM itinerary_items ii JOIN trips t ON t.id = ii.trip_id
          WHERE t.user_id = $1 AND ii.provider_service_id = $2`,
        [userId, providerA.providerServiceId],
      )
    : [];
  const survivedCart = userId
    ? await q(`SELECT id FROM cart_items WHERE user_id = $1 AND provider_service_id = $2`, [userId, providerA.providerServiceId]).catch(
        () => [] as any[],
      )
    : [];
  const survived = survivedItems.length > 0 || survivedCart.length > 0;

  await page.goto(`/services/${providerA.providerServiceId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D5', '05', 'post-signup-service-detail');

  fileFinding({
    journey: 'D5',
    step: 'guest:item-survives-signup',
    class: survived ? 'SPEC_DIVERGENCE' : 'LOST_STATE',
    severity: survived ? 'P3' : 'P2',
    known: survived ? null : 'KNOWN:RC-8',
    title: `The item the guest tried to add ${survived ? 'DID' : 'did NOT'} survive into the account created moments later`,
    expected: 'RC-8: guest state is dropped on auth — the pre-signup intent is expected to be lost, not silently recovered',
    actual: `itinerary_items match=${survivedItems.length}, cart_items match=${survivedCart.length}`,
    where: 'client/src/pages/Signup.tsx; client/src/components/SignInModal.tsx',
    evidence: { shot: 'shots/D5-05-post-signup-service-detail.png' },
    behavioural: true,
  });

  net.flush();
});
