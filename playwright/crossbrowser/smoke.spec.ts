/**
 * playwright/crossbrowser/smoke.spec.ts — Task #1147 cross-browser QA smoke suite.
 *
 * Runs the same smoke checks across 5 browser projects (see playwright.crossbrowser.config.ts):
 *   1. Homepage — layout renders, hero/nav visible, no severe console errors.
 *   2. Navbar — desktop: dropdown triggers work; mobile profiles: hamburger menu opens/closes.
 *   3. Discover page — all 4 tabs visible, client-side tab switching works.
 *   4. Sign-in modal — opens with email/password fields.
 *   5. Full booking checkout — fresh user + catalog item seeded via app APIs, then the REAL
 *      UI payment sheet with Stripe test card 4242 4242 4242 4242 filled in the Elements iframe.
 *   6. Admin panel load — desktop projects only.
 *
 * Console errors are captured per test and attached; known benign noise is filtered
 * (Vite HMR websocket, Partnerize 404, Stripe Identity warning, favicon).
 */
import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const PASSWORD = 'TestPassword123!';
const ADMIN_EMAIL = 'test-admin@traveloure.test';
const ADMIN_PASSWORD = 'TestPass123!';

const BENIGN_CONSOLE = [
  /websocket/i, // Vite HMR socket noise behind the Replit proxy
  /partnerize/i,
  /stripe.*identity/i,
  /favicon/i,
  /third-party cookie/i,
  /\[vite\]/i,
  /Failed to send error to Vite server/i, // Vite HMR client noise behind the Replit proxy
  /@vite\/client/,
  /Content Security Policy/i, // firefox reports CSP report-only notices as errors
  /downloadable font/i,
];

// 40x resource errors are only benign when the REQUEST URL is a known noisy endpoint —
// unauthenticated session probes and third-party tags. Anything else stays a real error.
const BENIGN_40X_URLS = [
  /\/api\/auth\/user/, // unauth session probe returns 401 while logged out
  /\/api\/auth\/session/,
  /\/api\/notifications/, // polled while logged out → 401
  /\/api\/cart(\?|$)/, // cart probe while logged out → 401
  /\/api\/trip-context/, // trip-context probe while logged out → 401
  /partnerize|prf\.hn/i,
  /fonts\.(googleapis|gstatic)\.com/,
];

function isMobileProject(projectName: string): boolean {
  return projectName.includes('emulated');
}
function isDesktopProject(projectName: string): boolean {
  return !isMobileProject(projectName);
}

/** Collect non-benign console errors + page crashes for the lifetime of a page. */
function trackConsole(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN_CONSOLE.some((re) => re.test(text))) return;
    if (/Failed to load resource/i.test(text)) {
      // These console lines often carry no URL (Chromium). The response listener below
      // reports the actual offending URL for any non-benign 40x instead.
      const url = msg.location()?.url || '';
      if (!url || BENIGN_40X_URLS.some((re) => re.test(url))) return;
    }
    errors.push(text.slice(0, 500));
  });
  // Authoritative 40x tracking by URL: any 401/403/404 to a non-benign endpoint is an error.
  page.on('response', (res) => {
    const status = res.status();
    if (![401, 403, 404].includes(status)) return;
    const url = res.url();
    if (BENIGN_40X_URLS.some((re) => re.test(url))) return;
    errors.push(`HTTP ${status} ${url.slice(0, 300)}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${String(err).slice(0, 500)}`));
  return { errors };
}

async function reportConsole(page: Page, errors: string[], label: string) {
  if (errors.length) {
    console.log(`[console-errors][${test.info().project.name}][${label}] ${errors.length}:`);
    for (const e of errors) console.log(`  - ${e}`);
    await test.info().attach(`console-errors-${label}`, { body: errors.join('\n'), contentType: 'text/plain' });
  }
}

async function settle(page: Page, ms = 2000) {
  await page.waitForTimeout(ms);
}

// ── 1. Homepage ──────────────────────────────────────────────────────────────
test('homepage renders: title, nav, hero, no severe console errors', async ({ page }) => {
  const { errors } = trackConsole(page);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settle(page);

  await expect(page).toHaveTitle(/Traveloure|Home/i);
  // Navbar rendered (mobile: hamburger; desktop: nav links region)
  if (isMobileProject(test.info().project.name)) {
    await expect(page.getByTestId('button-mobile-menu')).toBeVisible();
  } else {
    await expect(page.getByTestId('button-sign-in')).toBeVisible();
  }
  // Some real content below the nav (hero) — assert the body isn't blank/crashed
  const bodyText = await page.locator('body').innerText();
  expect(bodyText.length, 'homepage body should have substantial text').toBeGreaterThan(200);

  await reportConsole(page, errors, 'homepage');
  expect(errors, `severe console errors on homepage: ${errors.join(' | ')}`).toHaveLength(0);
});

// ── 2. Navbar ────────────────────────────────────────────────────────────────
test('navbar works (dropdowns on desktop / hamburger on mobile)', async ({ page }) => {
  const { errors } = trackConsole(page);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settle(page);

  if (isMobileProject(test.info().project.name)) {
    const btn = page.getByTestId('button-mobile-menu');
    await expect(btn).toBeVisible();
    await btn.click();
    await settle(page, 800);
    // Mobile panel shows sign-in CTA (unauthenticated) and at least one nav link
    await expect(page.getByTestId('button-mobile-sign-in')).toBeVisible();
    // close again
    await btn.click();
    await settle(page, 800);
    await expect(page.getByTestId('button-mobile-sign-in')).not.toBeVisible();
  } else {
    // Desktop: at least one dropdown trigger visible and opens on click
    const dropdowns = page.locator('[data-testid^="button-nav-dropdown-"]');
    const n = await dropdowns.count();
    expect(n, 'expected desktop nav dropdown triggers').toBeGreaterThan(0);
    await dropdowns.first().click();
    await settle(page, 700);
    // A menu/popover should now be visible
    const menu = page.locator('[role="menu"], [data-radix-popper-content-wrapper]');
    await expect(menu.first()).toBeVisible();
    await page.keyboard.press('Escape');
  }

  await reportConsole(page, errors, 'navbar');
  expect(errors, `severe console errors in navbar test: ${errors.join(' | ')}`).toHaveLength(0);
});

// ── 3. Discover tabs ─────────────────────────────────────────────────────────
test('discover page: 4 tabs visible, tab switching works client-side', async ({ page }) => {
  const { errors } = trackConsole(page);
  await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settle(page, 2500);

  for (const t of ['travelpulse', 'packages', 'events', 'services']) {
    await expect(page.getByTestId(`tab-${t}`)).toBeVisible();
  }
  await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'true');

  const urlBefore = page.url();
  await page.getByTestId('tab-services').click();
  await settle(page, 1200);
  await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('services-filter-bar')).toBeVisible();
  expect(page.url(), 'tab switch must not change URL').toBe(urlBefore);

  await reportConsole(page, errors, 'discover');
  expect(errors, `severe console errors on discover: ${errors.join(' | ')}`).toHaveLength(0);
});

// ── 4. Sign-in modal ─────────────────────────────────────────────────────────
test('sign-in modal opens with email + password fields', async ({ page }) => {
  const { errors } = trackConsole(page);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settle(page);

  if (isMobileProject(test.info().project.name)) {
    await page.getByTestId('button-mobile-menu').click();
    await settle(page, 800);
    await page.getByTestId('button-mobile-sign-in').click();
  } else {
    await page.getByTestId('button-sign-in').click();
  }
  await settle(page, 1000);

  await expect(page.getByTestId('input-email')).toBeVisible();
  await expect(page.getByTestId('input-password')).toBeVisible();

  await reportConsole(page, errors, 'signin-modal');
  expect(errors, `severe console errors opening sign-in modal: ${errors.join(' | ')}`).toHaveLength(0);
});

// ── 5. Full booking checkout with Stripe test card ───────────────────────────
// DB pool for the post-payment booking fact + fixture cleanup. Writes are limited to
// deleting THIS spec's fresh xbrowser-* user (cascades trips/items/cart/bookings), and
// only against a local/dev DB (guarded like the journey suite).
function localDbPool(): Pool | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    const host = new URL(cs).hostname.toLowerCase();
    const local = ['localhost', '127.0.0.1', '::1', ''].includes(host);
    if (!local && process.env.JOURNEY_DB_WRITES_OK !== '1') return null;
  } catch {
    return null;
  }
  return new Pool({ connectionString: cs, max: 2 });
}

test('full booking checkout with Stripe test card 4242', async ({ page }) => {
  test.setTimeout(240_000);
  const { errors } = trackConsole(page);
  const db = localDbPool();

  // Seed via the app's own APIs through the PAGE's cookie jar so the browser session is logged in.
  const uid = Math.random().toString(36).slice(2, 10);
  const email = `xbrowser-${uid}@traveloure.test`;
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, firstName: 'XBrowser', lastName: 'Smoke', userType: 'user' },
  });
  expect(reg.status(), `register failed: ${await reg.text()}`).toBe(201);
  const userId = (await reg.json()).user?.id as string | undefined;

  try {

  const start = new Date(); start.setDate(start.getDate() + 30);
  const end = new Date(start); end.setDate(end.getDate() + 5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const tripRes = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: `XBrowser Smoke ${uid}`, destination: 'Kyoto, Japan', startDate: fmt(start), endDate: fmt(end) },
  });
  expect(tripRes.status(), `create trip failed: ${await tripRes.text()}`).toBe(201);
  const tripId = (await tripRes.json()).id as string;

  // A real approved+active priced catalog service, via public services API? We read it from the
  // trip-side: use the services listing endpoint (public) and pick the first priced one.
  const svcRes = await page.request.get(`${BASE_URL}/api/services?limit=20`);
  expect(svcRes.ok(), `services list failed: ${svcRes.status()}`).toBeTruthy();
  const svcBody = await svcRes.json();
  const svcList: any[] = Array.isArray(svcBody) ? svcBody : svcBody.services || svcBody.data || [];
  const svc = svcList.find((s) => s && s.id && Number(s.price) > 0);
  expect(svc, 'expected at least one priced service from /api/services').toBeTruthy();

  const itemRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title: svc.serviceName || svc.name || 'Smoke service', dayNumber: 1, providerServiceId: svc.id, estimatedCost: String(svc.price) },
  });
  expect(itemRes.status(), `create item failed: ${await itemRes.text()}`).toBe(201);
  const itemId = (await itemRes.json()).id as string;

  const routeRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, {
    data: { to: 'ready_for_checkout' },
  });
  expect(routeRes.status(), `route failed: ${await routeRes.text()}`).toBe(200);

  // UI: open the cart and pay.
  await page.goto(`${BASE_URL}/cart?tripId=${tripId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settle(page, 3000);

  // Two cart-step sidebar variants: "button-proceed-payment" (plain sidebar) and
  // "button-skip-to-payment" (optimize-preview sidebar). Accept either.
  const proceed = page
    .locator('[data-testid="button-proceed-payment"], [data-testid="button-skip-to-payment"]')
    .first();
  await proceed.waitFor({ state: 'attached', timeout: 45_000 });
  await proceed.scrollIntoViewIfNeeded();
  await proceed.click();

  // Payment step: "Complete Booking" fires POST /api/checkout and opens the Stripe payment sheet.
  const completeBooking = page.getByTestId('button-complete-booking');
  await completeBooking.waitFor({ state: 'attached', timeout: 30_000 });
  await completeBooking.scrollIntoViewIfNeeded();
  await completeBooking.click();

  // Stripe PaymentElement iframe: wait for it and fill the 4242 card.
  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"], iframe[src*="js.stripe.com"]').first();
  const cardNumber = stripeFrame.locator('input[name="number"], input[autocomplete="cc-number"]');
  await cardNumber.waitFor({ state: 'visible', timeout: 60_000 });
  await cardNumber.fill('4242 4242 4242 4242');
  await stripeFrame.locator('input[name="expiry"], input[autocomplete="cc-exp"]').fill('12 / 30');
  await stripeFrame.locator('input[name="cvc"], input[autocomplete="cc-csc"]').fill('123');
  const zip = stripeFrame.locator('input[name="postalCode"], input[autocomplete="postal-code"]');
  if (await zip.count()) { try { await zip.fill('10001'); } catch { /* optional */ } }
  const country = stripeFrame.locator('select[name="country"]');
  if (await country.count()) { try { await country.selectOption('US'); } catch { /* optional */ } }

  // Submit the Stripe form — scoped to the form that actually CONTAINS the payment element,
  // so a stray form elsewhere on the page can never be clicked instead.
  const payForm = page.locator('form').filter({ has: page.locator('iframe[name^="__privateStripeFrame"], iframe[src*="js.stripe.com"]') });
  const paySubmit = payForm.locator('button[type="submit"]');
  await paySubmit.scrollIntoViewIfNeeded();
  await expect(paySubmit).toBeEnabled({ timeout: 30_000 });
  await paySubmit.click();

  // Success = the app leaves the payment sheet and lands on a confirmation surface,
  // or shows explicit success copy.
  await page.waitForURL(/confirm|confirmation|bookings|success/i, { timeout: 90_000 }).catch(() => {});
  const url = page.url();
  const success =
    /confirm|confirmation|bookings|success/i.test(url) ||
    (await page.getByText(/booking confirmed|payment successful|thank you/i).count()) > 0;
  if (!success) {
    await test.info().attach('checkout-final-url', { body: url, contentType: 'text/plain' });
  }
  expect(success, `checkout did not reach a success surface (url=${url})`).toBeTruthy();

  // DB FACT: the checkout must have written a service_bookings row for this fresh user —
  // a confirmation URL alone could be a false positive.
  if (db && userId) {
    const r = await db.query(`SELECT count(*)::int AS n FROM service_bookings WHERE traveler_id = $1`, [userId]);
    expect(r.rows[0].n, 'checkout must write a service_bookings row for the fresh user').toBeGreaterThan(0);
  }

  await reportConsole(page, errors, 'checkout');
  } finally {
    // Fixture hygiene: remove this spec's fresh user (cascades trips/items/cart/bookings).
    // Local/dev DB only — localDbPool() refuses non-local hosts without explicit opt-in.
    if (db) {
      try {
        if (userId) await db.query(`DELETE FROM users WHERE id = $1 AND email LIKE 'xbrowser-%'`, [userId]);
      } catch (e) {
        console.log(`[cleanup] failed to delete fixture user: ${String(e).slice(0, 200)}`);
      }
      await db.end().catch(() => {});
    }
  }
});

// ── 6. Admin panel (desktop only) ────────────────────────────────────────────
test('admin panel loads (desktop only)', async ({ page }) => {
  test.skip(isMobileProject(test.info().project.name), 'admin on mobile is out of scope');
  const { errors } = trackConsole(page);

  const login = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(login.ok(), `admin login failed (${login.status()}): ${await login.text()}`).toBeTruthy();

  await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settle(page, 3000);

  // Must not bounce to home/sign-in and must render a concrete authorized dashboard element.
  expect(page.url()).toContain('/admin');
  await expect(
    page.locator('[data-testid^="card-stat-"]').first(),
    'admin dashboard must render its stat cards (authorized content, not an access-denied shell)',
  ).toBeVisible({ timeout: 20_000 });
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/404|not found|access denied|unauthorized/i);

  await reportConsole(page, errors, 'admin');
  expect(errors, `severe console errors on admin dashboard: ${errors.join(' | ')}`).toHaveLength(0);
});
