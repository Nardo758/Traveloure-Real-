/**
 * playwright/tier4/helpers.ts
 *
 * Shared helpers for the Tier 4 audit harness.
 *
 * - Deterministic seed-based selection (TIER4_SEED, default "2026-08-22")
 * - Evidence file writer (docs/audits/tier4-evidence/)
 * - Console message collector
 * - Account registration helper (always uses page.request)
 * - Stripe iframe card-fill helper
 * - Non-production assertion (fail-closed; .replit.app/.repl.co are NOT auto-allowed)
 */

import { type Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// ── Constants ──────────────────────────────────────────────────────────────────

export const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
export const TIER4_SEED = process.env.TIER4_SEED || '2026-08-22';
export const PASSWORD = 'Tier4Audit!22';

// ── Seeded deterministic selection ────────────────────────────────────────────

/**
 * Generates a deterministic integer [0, max) from a seed string + step label.
 * Uses a simple FNV-1a-inspired hash so results are reproducible across engines.
 */
export function seededIndex(step: string, max: number): number {
  const input = `${TIER4_SEED}::${step}`;
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep 32-bit
  }
  return hash % max;
}

/**
 * Pick a deterministic item from an array using the seed + step label.
 * Varies reproducibly by project when project name is included in the step string.
 */
export function seededPick<T>(arr: T[], step: string): T {
  if (arr.length === 0) throw new Error(`seededPick: empty array for step="${step}"`);
  return arr[seededIndex(step, arr.length)];
}

// ── Evidence file writer ───────────────────────────────────────────────────────

const EVIDENCE_DIR = path.resolve(_dirname, '../../docs/audits/tier4-evidence');

export function ensureEvidenceDir(): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

/** Returns a path relative to the evidence directory for use in JSON evidence files. */
export function relativeEvidence(absPath: string): string {
  return path.relative(EVIDENCE_DIR, absPath);
}

export interface EvidenceMeta {
  seed: string;
  chosenStep: string;
  engine: string;
  project: string;
  result: string;
  lastReachedStep?: string;
  errorDetail?: string;
  limitations?: string;
  layoutOverflow?: boolean;
  documentDimensions?: { scrollWidth: number; scrollHeight: number; innerWidth: number; innerHeight: number };
  viewport?: { width: number; height: number };
  consoleMessages?: { type: string; text: string }[];
  timings?: Record<string, number>;
  [key: string]: unknown;
}

export function writeEvidence(filename: string, data: EvidenceMeta): void {
  ensureEvidenceDir();
  const filePath = path.join(EVIDENCE_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** Save a screenshot and return its evidence-relative path. */
export async function saveScreenshot(page: Page, name: string): Promise<string> {
  ensureEvidenceDir();
  const absPath = path.join(EVIDENCE_DIR, name);
  const buf = await page.screenshot({ fullPage: false });
  fs.writeFileSync(absPath, buf);
  return relativeEvidence(absPath);
}

// ── Console collector ──────────────────────────────────────────────────────────

export interface ConsoleMsg {
  type: string;
  text: string;
}

export function collectConsole(page: Page): ConsoleMsg[] {
  const msgs: ConsoleMsg[] = [];
  page.on('console', msg => msgs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => msgs.push({ type: 'pageerror', text: err.message }));
  return msgs;
}

/**
 * Return a frame label without query parameters or fragments. Stripe frame URLs
 * may include the configured publishable key and session identifiers, neither
 * of which belongs in committed audit evidence.
 */
export function safeFrameLabel(rawUrl: string, fallbackName = 'unnamed-frame'): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return fallbackName;
  }
}

// ── Viewport / overflow / document dimensions ──────────────────────────────────

/** Returns true if there is NO horizontal overflow. */
export async function checkOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 4,
  );
}

export async function getDocumentDimensions(page: Page): Promise<{
  scrollWidth: number; scrollHeight: number; innerWidth: number; innerHeight: number;
}> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
}

// ── Non-production assertion ───────────────────────────────────────────────────

/**
 * Asserts the running server is NOT a production instance. Fail-closed.
 *
 * Auto-allow ONLY: localhost, 127.0.0.1, ::1, *.replit.dev
 * Everything else — including *.replit.app and *.repl.co (which are published
 * deployment URLs) — must explicitly pass /api/ready returning
 * { environment: "development" } or { env: "development" }. Any other response
 * or an unreachable endpoint causes an immediate hard failure.
 */
export async function assertNotProduction(page: Page): Promise<void> {
  const url = new URL(BASE_URL);
  const h = url.hostname;

  const definitelySafe =
    h === '127.0.0.1' ||
    h === 'localhost' ||
    h === '::1' ||
    h.endsWith('.replit.dev'); // preview deployments (non-production)

  if (definitelySafe) return;

  // For everything else — including *.replit.app, *.repl.co, any custom domain —
  // require /api/ready to explicitly confirm development mode.
  let body: Record<string, unknown> = {};
  let reachable = false;

  try {
    const res = await page.request.get(`${BASE_URL}/api/ready`);
    if (res.ok()) {
      body = await res.json().catch(() => ({}));
      reachable = true;
    }
  } catch {
    // not reachable
  }

  if (!reachable) {
    throw new Error(
      `TIER4 assertNotProduction: BASE_URL "${BASE_URL}" is not a trusted local address ` +
        'and /api/ready is unreachable. Failing closed to protect data. ' +
        'Set BASE_URL=http://127.0.0.1:5000 to target the local dev server.',
    );
  }

  const env = (body.environment ?? body.env ?? '') as string;
  if (env !== 'development') {
    throw new Error(
      `TIER4 assertNotProduction: /api/ready returned environment="${env}" for BASE_URL "${BASE_URL}". ` +
        'Refusing to run destructive tests. Expected environment="development". ' +
        'Note: *.replit.app and *.repl.co are treated as published/production URLs.',
    );
  }
}

// ── Fresh account registration (always uses page.request) ─────────────────────

/**
 * Registers a unique @traveloure.test user, accepts terms, and logs in via
 * the browser UI. Always uses page.request so the cookie jar is shared with
 * subsequent page navigations. Returns the email + API-provided user ID.
 */
export async function registerAndLogin(
  page: Page,
  label: string,
): Promise<{ email: string; id?: string }> {
  const suffix = crypto.randomBytes(5).toString('hex');
  const email = `tier4-${label}-${suffix}@traveloure.test`;

  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email,
      password: PASSWORD,
      firstName: 'Tier4',
      lastName: label,
      userType: 'user',
    },
  });
  expect(reg.ok(), `register failed: ${reg.status()} ${await reg.text()}`).toBe(true);
  const body = await reg.json().catch(() => ({}));

  // Accept terms — uses page.request so it shares the same authenticated session
  await page.request.post(`${BASE_URL}/api/auth/accept-terms`, {
    data: { acceptTerms: true, acceptPrivacy: true },
  });

  // Log in via the UI so the browser cookie jar is populated for page navigations
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const signInBtn = page.locator('[data-testid="button-sign-in"]');
  if (await signInBtn.isVisible().catch(() => false)) {
    await signInBtn.click();
    const modal = page.locator('[data-testid="modal-sign-in"]');
    await modal.waitFor({ state: 'visible', timeout: 8000 });
    await modal.locator('input[type="email"], input[name="email"]').first().fill(email);
    await modal.locator('input[type="password"]').first().fill(PASSWORD);
    await modal
      .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
      .first()
      .click();
    await modal.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  return { email, id: body?.user?.id };
}

// ── Discover a real priced service ────────────────────────────────────────────

export interface ServiceInfo {
  id: string;
  price: number;
  name: string;
}

/**
 * Fetches approved+active priced services and picks one deterministically.
 * Uses page.request so the cookie jar is shared.
 */
export async function findPricedService(page: Page): Promise<ServiceInfo> {
  const res = await page.request.get(`${BASE_URL}/api/provider-services?limit=50`);
  expect(res.ok(), `provider-services fetch failed: ${res.status()}`).toBe(true);
  const body = await res.json().catch(() => ({}));
  const list: any[] = Array.isArray(body) ? body : (body.services ?? body.data ?? []);
  const priced = list.filter(
    (s: any) => s.id && Number(s.price ?? s.basePrice ?? 0) > 0,
  );
  expect(priced.length, 'no priced provider services found').toBeGreaterThan(0);
  const picked = seededPick(priced, 'service-selection');
  return {
    id: picked.id,
    price: Number(picked.price ?? picked.basePrice ?? 0),
    name: picked.serviceName ?? picked.service_name ?? picked.name ?? picked.id,
  };
}

// ── Add service to cart via page.request ──────────────────────────────────────

export async function addToCartApi(page: Page, serviceId: string): Promise<void> {
  const res = await page.request.post(`${BASE_URL}/api/cart`, {
    data: { serviceId, quantity: 1 },
  });
  expect(res.ok(), `add-to-cart (API) failed: ${res.status()} ${await res.text()}`).toBe(true);
}

// ── Stripe test card helpers ───────────────────────────────────────────────────

const STRIPE_CARD = '4242424242424242';
const STRIPE_EXP  = '1228';
const STRIPE_CVC  = '123';
const STRIPE_ZIP  = '10001';

/**
 * Fills the Stripe PaymentElement (in iframe) with test card 4242.
 * Uses fill() which simulates user input — NOT programmatic value injection.
 * Returns evidence about what succeeded / what was blocked.
 *
 * If no Stripe iframe can be found after `maxWaitMs` ms, returns filled:false
 * with explicit blocker text. The caller MUST fail, not skip.
 */
export async function fillStripeTestCard(
  page: Page,
  maxWaitMs = 60_000,
): Promise<{ filled: boolean; blocker?: string }> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);

    const stripeFrames = page
      .frames()
      .filter(
        f =>
          f.url().includes('stripe.com') ||
          f.name().startsWith('__privateStripeFrame'),
      );

    for (const frame of stripeFrames) {
      const numInput = frame.locator(
        'input[name="number"], #Field-numberInput, input[data-elements-stable-field-name="cardNumber"]',
      );
      if ((await numInput.count().catch(() => 0)) === 0) continue;

      await numInput.first().fill(STRIPE_CARD).catch(() => {});
      const val = (await numInput.first().inputValue().catch(() => '')).replace(/\s/g, '');
      if (val !== STRIPE_CARD) continue;

      const expInput = frame.locator(
        'input[name="expiry"], #Field-expiryInput, input[data-elements-stable-field-name="cardExpiry"]',
      );
      if ((await expInput.count().catch(() => 0)) > 0) {
        await expInput.first().fill(STRIPE_EXP).catch(() => {});
      }

      const cvcInput = frame.locator(
        'input[name="cvc"], #Field-cvcInput, input[data-elements-stable-field-name="cardCvc"]',
      );
      if ((await cvcInput.count().catch(() => 0)) > 0) {
        await cvcInput.first().fill(STRIPE_CVC).catch(() => {});
      }

      const zipInput = frame.locator(
        'input[name="postalCode"], #Field-postalCodeInput',
      );
      if ((await zipInput.count().catch(() => 0)) > 0) {
        await zipInput.first().fill(STRIPE_ZIP).catch(() => {});
      }

      return { filled: true };
    }
  }

  return {
    filled: false,
    blocker:
      `Stripe iframe with card-number input not found within ${maxWaitMs}ms. ` +
      'Possible causes: TLS missing for WebKit, Stripe JS blocked by CSP, ' +
      'payment step was not reached, or Stripe publishable key is missing. ' +
      'Frames observed at timeout: ' +
      page.frames().map(f => safeFrameLabel(f.url(), f.name())).join(', '),
  };
}

// ── Timing helper ──────────────────────────────────────────────────────────────

export function now(): number {
  return Date.now();
}

export function elapsed(start: number): number {
  return Date.now() - start;
}
