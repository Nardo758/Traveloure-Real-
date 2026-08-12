/**
 * distribute-channels.spec.ts
 *
 * Catalog+Distribute ruling 74/77, lanes D2 · D3 · D4 · C6 proof — the per-listing channels that
 * slot into D1's `channels-container` seam, plus the Catalog Promote → Distribute on-ramp.
 *
 * Asserts (negatives first, per ruling 43):
 *   - D2 (Direct-link): the selected listing gets a REAL trackable link (get-link if none) + a
 *     Copy affordance, and the channel carries NO fee-waiver wording (caption hold) — the whole
 *     Direct card contains none of "skip" / "waive" / "service fee".
 *   - D4 (state strip + analytics deep-link): the four honest chips render, a "View link
 *     performance" DEEP-LINK is present, and — the key negative — NO analytics panel/numbers are
 *     rendered inline on Distribute (measurement stays on Analytics/Earnings; this is a link, not
 *     a panel). Asserts the LinkAnalyticsPanel card + its stat tiles are ABSENT here.
 *   - D3 (Social-kit): the three format previews (feed/story/route) render for the approved+active
 *     listing, a caption is populated, and the "Open share studio in Catalog" deep-link is present
 *     (per-listing share authoring stays on Catalog, ruling 22b).
 *   - C6 (Promote → Distribute): on /provider/services the Promote block deep-links into the
 *     Distribute hub (no second share surface on Catalog).
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123! (handle = kyoto-interpreter;
 * "Business Meeting Interpretation (Full Day)" is approved + active).
 *
 * Relevant source:
 *   client/src/pages/provider/distribute.tsx                (D2/D3/D4 channels + state strip)
 *   client/src/components/backoffice/share-tools.tsx         (C6 promoteHref on the opportunity cards)
 *   client/src/pages/provider/services.tsx                  (C6 Promote on-ramp section)
 *   client/src/lib/qrcode.ts                                (D2 QR generator, dependency-free)
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';
const LIVE_SERVICE = 'Business Meeting Interpretation (Full Day)';

async function loginProvider(page: Page) {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD },
  });
  expect(resp.ok(), `login failed: ${resp.status()}`).toBeTruthy();
}

async function serviceIdByName(page: Page, name: string): Promise<string> {
  const resp = await page.request.get(`${BASE_URL}/api/provider/services`);
  expect(resp.ok(), `owner services read failed: ${resp.status()}`).toBeTruthy();
  const rows = (await resp.json()) as { id: string; serviceName: string }[];
  const row = rows.find((r) => r.serviceName === name);
  expect(row, `seeded listing "${name}" not found`).toBeTruthy();
  return row!.id;
}

test.describe('/provider/distribute — Direct · Social · state strip (lanes D2/D3/D4)', () => {
  test('per-listing channels are honest, reuse-backed, and hold the caption', async ({ page }) => {
    await loginProvider(page);
    const liveId = await serviceIdByName(page, LIVE_SERVICE);

    await page.goto(`${BASE_URL}/provider/distribute`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByTestId('text-distribute-title')).toContainText('Distribute');

    // Select the approved+active listing so the Social kit (approved+active gated) renders.
    const selector = page.getByTestId('select-listing');
    await expect(selector).toBeVisible({ timeout: 15_000 });
    await selector.click();
    await page.getByTestId(`option-listing-${liveId}`).click();

    // ── D4: channel-state strip — real chips + analytics DEEP-LINK, no inline analytics ─────────
    const strip = page.getByTestId('channel-state-strip');
    await expect(strip).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chip-storefront')).toBeVisible();
    await expect(page.getByTestId('chip-marketplace')).toBeVisible();
    await expect(page.getByTestId('chip-direct')).toBeVisible();
    await expect(page.getByTestId('chip-social')).toBeVisible();
    // The marketplace chip reads "live" for the approved+active listing (real state, §13).
    await expect(page.getByTestId('chip-marketplace')).toContainText(/live/i);
    // Analytics is a DEEP-LINK, not a mounted panel.
    await expect(page.getByTestId('button-view-link-performance')).toBeVisible();
    // NEGATIVE (ruling 22d/74): NO analytics panel or numbers are rendered inline on Distribute.
    await expect(page.getByTestId('card-link-analytics')).toHaveCount(0);
    await expect(page.getByTestId('stat-total-clicks')).toHaveCount(0);
    await expect(page.getByTestId('stat-total-revenue')).toHaveCount(0);
    await expect(page.getByTestId('stat-total-bookings')).toHaveCount(0);

    // ── D2: Direct-link — a real link + copy affordance, caption hold ───────────────────────────
    const directCard = page.getByTestId('card-channel-direct');
    await expect(directCard).toBeVisible();
    const getLinkBtn = page.getByTestId('button-direct-get-link');
    if (await getLinkBtn.isVisible().catch(() => false)) {
      await getLinkBtn.click();
    }
    // The link and its Copy affordance are shown once a code exists (minted now or already present).
    await expect(page.getByTestId('text-direct-url')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('text-direct-url')).toContainText('/r/');
    await expect(page.getByTestId('button-direct-copy')).toBeVisible();
    await expect(page.getByTestId('button-direct-qr-toggle')).toBeVisible();
    // Caption hold — NO fee-waiver wording anywhere in the Direct channel.
    const directText = ((await directCard.textContent()) ?? '').toLowerCase();
    expect(directText).not.toContain('skip');
    expect(directText).not.toContain('waive');
    expect(directText).not.toContain('service fee');

    // QR is a real, dependency-free render (data: URL), toggles into view.
    await page.getByTestId('button-direct-qr-toggle').click();
    await expect(page.getByTestId('img-direct-qr')).toBeVisible();
    const qrSrc = await page.getByTestId('img-direct-qr').getAttribute('src');
    expect(qrSrc ?? '').toContain('data:image/svg+xml');

    // ── D3: Social-kit — three format previews + caption + Catalog studio deep-link ─────────────
    const socialCard = page.getByTestId('card-channel-social');
    await expect(socialCard).toBeVisible();
    await expect(page.getByTestId('tile-social-feed')).toBeVisible();
    await expect(page.getByTestId('tile-social-story')).toBeVisible();
    await expect(page.getByTestId('tile-social-route')).toBeVisible();
    await expect(page.getByTestId('img-social-feed')).toBeVisible();
    const caption = page.getByTestId('textarea-social-caption');
    await expect(caption).toBeVisible();
    expect(((await caption.inputValue()) ?? '').length, 'social caption populated').toBeGreaterThan(0);
    // Full share authoring stays on Catalog (ruling 22b) — this is a deep-link, not a second studio.
    await expect(page.getByTestId('link-social-studio')).toBeVisible();
    // Caption hold in the Social channel too.
    const socialText = ((await socialCard.textContent()) ?? '').toLowerCase();
    expect(socialText).not.toContain('skip');
    expect(socialText).not.toContain('waive');
    expect(socialText).not.toContain('service fee');
  });
});

test.describe('/provider/services — Promote → Distribute on-ramp (lane C6)', () => {
  test('the Promote block deep-links into the Distribute hub', async ({ page }) => {
    await loginProvider(page);
    await page.goto(`${BASE_URL}/provider/services`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const onramp = page.getByTestId('link-promote-distribute');
    await onramp.scrollIntoViewIfNeeded();
    await expect(onramp).toBeVisible({ timeout: 15_000 });
    await onramp.click();
    await expect(page).toHaveURL(/\/provider\/distribute/, { timeout: 10_000 });
  });
});
