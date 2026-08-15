/**
 * WebKit (Safari-engine) smoke check — 5 areas, quick regression gate.
 *
 * Areas: 1) Stripe PaymentElement  2) date pickers  3) flexbox/grid layout
 *        4) session/local storage  5) backdrop-filter & modern CSS
 *
 * Run via:  bash scripts/webkit-smoke.sh   (sets required NixOS env — LD path,
 * GIO TLS modules, gst stubs; see .agents/memory/webkit-testing-setup.md)
 *
 * Requires the `Start application` workflow serving on port 5000.
 * Exits 0 only if all 5 checks pass; prints "smoke check: X/5 passing".
 */
import { webkit } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

// Guard: the Stripe check registers wk-smoke-* accounts and submits a real
// checkout (PaymentIntent + booking state). Only ever run against a local dev
// server unless explicitly overridden.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(BASE) && process.env.WEBKIT_SMOKE_ALLOW !== '1') {
  console.error(`Refusing to run against non-local BASE_URL=${BASE} (set WEBKIT_SMOKE_ALLOW=1 to override).`);
  process.exit(1);
}
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

let browser;
try {
  browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // ---- 5) Modern CSS support + homepage renders ----
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const css = await page.evaluate(() => ({
    backdrop: CSS.supports('backdrop-filter', 'blur(4px)') || CSS.supports('-webkit-backdrop-filter', 'blur(4px)'),
    gap: CSS.supports('gap', '1rem'),
    grid: CSS.supports('display', 'grid'),
    aspect: CSS.supports('aspect-ratio', '1'),
    inset: CSS.supports('inset', '0'),
    rendered: document.body.innerText.length > 200,
  }));
  check('backdrop-filter & modern CSS', css.backdrop && css.gap && css.grid && css.aspect && css.inset && css.rendered);

  // ---- 4) Storage behavior ----
  const storage = await page.evaluate(() => {
    try {
      sessionStorage.setItem('__wk_smoke', 'ss');
      localStorage.setItem('__wk_smoke', 'ls');
      return sessionStorage.getItem('__wk_smoke') === 'ss' && localStorage.getItem('__wk_smoke') === 'ls';
    } catch { return false; }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const survived = await page.evaluate(() => {
    const ok = sessionStorage.getItem('__wk_smoke') === 'ss' && localStorage.getItem('__wk_smoke') === 'ls';
    sessionStorage.removeItem('__wk_smoke'); localStorage.removeItem('__wk_smoke');
    return ok;
  });
  check('session/local storage + reload survival', storage && survived);

  // ---- 3) Flexbox/grid layout: discover tabs no overlap, no horizontal overflow ----
  await page.goto(BASE + '/discover', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  const tabIds = ['tab-travelpulse', 'tab-packages', 'tab-events', 'tab-services'];
  const boxes = [];
  for (const id of tabIds) {
    const el = page.locator(`[data-testid="${id}"]`).first();
    if (await el.count()) boxes.push(await el.boundingBox());
  }
  const visible = boxes.filter(b => b && b.width > 10 && b.height > 10);
  const overlap = visible.some((a, i) => visible.some((b, j) => j > i &&
    a.x < b.x + b.width - 2 && b.x < a.x + a.width - 2 && a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2));
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check('flexbox/grid layout (discover tabs)', visible.length >= 3 && !overlap && noOverflow,
    `tabs=${visible.length}, overlap=${overlap}, overflow=${!noOverflow}`);

  // ---- Fresh account (no saved card) so the PaymentElement path is exercised ----
  const email = `wk-smoke-${Math.random().toString(36).slice(2, 8)}@traveloure.test`;
  const reg = await page.request.post(BASE + '/api/auth/register', {
    data: { email, password: 'TestPass123!', firstName: 'Wk', lastName: 'Smoke' },
  });
  if (!reg.ok()) throw new Error('register failed: ' + reg.status());
  await page.request.post(BASE + '/api/auth/accept-terms', { data: { acceptTerms: true, acceptPrivacy: true } });
  const raw = await (await page.request.get(BASE + '/api/provider-services?limit=5')).json();
  // Must be a priced service — a $0 cart never creates a payment intent, so
  // Stripe Elements would (correctly) never mount and the check would false-fail.
  const svcList = Array.isArray(raw) ? raw : raw.services || [];
  const svc = svcList.find(s => s.id && Number(s.price ?? s.basePrice ?? 0) > 0);
  if (!svc) throw new Error('no priced provider services available to seed cart');
  const add = await page.request.post(BASE + '/api/cart', { data: { serviceId: svc.id, quantity: 1 } });
  if (!add.ok()) throw new Error('cart seed failed: ' + add.status());

  // ---- 2) Date picker: trip date editor on /cart (native input[type=date]) ----
  await page.goto(BASE + '/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  let dateOk = false, dateDetail = 'no date input reachable';
  const editTrip = page.locator('button:has-text("Edit trip"), [data-testid*="edit-trip"]').first();
  if (await editTrip.count()) { await editTrip.click().catch(() => {}); await page.waitForTimeout(1500); }
  // Prefer the trip editor's own testid; fall back to any native date input.
  let nativeDate = page.locator('[data-testid="input-etp-start-date"]').first();
  if (!(await nativeDate.count())) nativeDate = page.locator('input[type="date"]').first();
  if (await nativeDate.count()) {
    await nativeDate.fill('2026-09-15');
    dateOk = (await nativeDate.inputValue()) === '2026-09-15';
    dateDetail = 'native date input round-trip';
    await page.keyboard.press('Escape');
  }
  check('date picker (trip date editor)', dateOk, dateDetail);

  // ---- 1) Stripe PaymentElement mounts and accepts input ----
  const proceed = page.locator('[data-testid="button-proceed-payment"], [data-testid="button-skip-to-payment"]').first();
  await proceed.waitFor({ state: 'visible', timeout: 15000 });
  await proceed.scrollIntoViewIfNeeded();
  await proceed.click();
  const complete = page.locator('button:has-text("Complete Booking")').first();
  await complete.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  if (await complete.count()) await complete.click().catch(() => {});
  // Wait until a Stripe frame actually contains the card-number field —
  // the controller frame appears first, the input frames mount later.
  let frames = [];
  let cardOk = false;
  for (let i = 0; i < 20 && !cardOk; i++) {
    await page.waitForTimeout(2000);
    frames = page.frames().filter(f => f.url().includes('stripe.com') || f.name().startsWith('__privateStripeFrame'));
    for (const f of frames) {
      const num = f.locator('input[name="number"], #Field-numberInput');
      if (await num.count().catch(() => 0)) {
        await num.first().fill('4242424242424242');
        cardOk = (await num.first().inputValue().catch(() => '')).replace(/\s/g, '') === '4242424242424242';
        break;
      }
    }
  }
  check('Stripe PaymentElement renders & accepts card', frames.length > 0 && cardOk, `iframes=${frames.length}`);
  // Smoke level: do NOT submit the payment — mounting + input is the regression signal.
} catch (err) {
  console.error('smoke run error:', err.message);
  // mark any un-run checks as failed
  const names = ['backdrop-filter & modern CSS', 'session/local storage + reload survival',
    'flexbox/grid layout (discover tabs)', 'date picker (trip date editor)', 'Stripe PaymentElement renders & accepts card'];
  for (const n of names) if (!results.find(r => r.name === n)) results.push({ name: n, ok: false });
} finally {
  if (browser) await browser.close();
}

const passed = results.filter(r => r.ok).length;
console.log(`smoke check: ${passed}/${results.length} passing`);
process.exit(passed === results.length && results.length === 5 ? 0 : 1);
