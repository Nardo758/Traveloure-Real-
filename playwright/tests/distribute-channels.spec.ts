/**
 * distribute-channels.spec.ts
 *
 * Catalog+Distribute ruling 74/77 lanes D2 · D3 · D4, updated by lane S6 (ruling-74-disposition-6
 * clarification — "Distribute is the ONE home for outward-facing distribution surfaces").
 *
 * Asserts (negatives first, per ruling 43):
 *   - D2 (Direct-link): the selected listing gets a REAL trackable link (get-link if none) + a
 *     Copy affordance, and the channel carries NO fee-waiver wording (caption hold) — the whole
 *     Direct card contains none of "skip" / "waive" / "service fee".
 *   - D4 (state strip + analytics deep-link): the four honest chips render, a "View link
 *     performance" DEEP-LINK is present, and — the key negative — NO analytics panel/numbers are
 *     rendered inline on Distribute (measurement stays on Analytics/Earnings; this is a link, not
 *     a panel). Asserts the LinkAnalyticsPanel card + its stat tiles are ABSENT here.
 *   - D3 (Social-kit, S6 reuse): the shared <OfferingShareDetail/> renders inline — the three
 *     format previews (feed/story/route), a populated caption AND the Instagram-publish
 *     affordance per format (the feature that used to live ONLY in Catalog's per-card share
 *     dialog). NEGATIVE: no "Open share studio in Catalog" deep-link — Catalog carries no share
 *     surface to send anyone to anymore.
 *   - S6 (Catalog's ONE outward pointer): every listing card on /provider/services carries a
 *     "Distribute this →" button that lands on Distribute with THAT listing preselected
 *     (`?listing=<id>`); the old section-level Promote/share-kit/storefront surfaces are ABSENT
 *     from Catalog.
 *   - S6 (Promote section moved): /provider/distribute renders its own Promote section with the
 *     real posting-opportunities card, inline share actions (no self-referential "Promote in
 *     Distribute" link — that mode was retired with its only caller).
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123! (handle = kyoto-interpreter;
 * "Business Meeting Interpretation (Full Day)" is approved + active).
 *
 * Relevant source:
 *   client/src/pages/provider/distribute.tsx           (D2/D3/D4 channels + state strip + S6 Promote section)
 *   client/src/components/backoffice/share-tools.tsx    (OfferingShareDetail, PostingOpportunitiesCard)
 *   client/src/pages/provider/services.tsx              (S6: per-card "Distribute this →" pointer only)
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

test.describe('/provider/distribute — Direct · Social · state strip · Promote (D2/D3/D4, S6)', () => {
  test('per-listing channels are honest, reuse-backed, and hold the caption', async ({ page }) => {
    await loginProvider(page);
    const liveId = await serviceIdByName(page, LIVE_SERVICE);

    await page.goto(`${BASE_URL}/provider/distribute`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByTestId('text-distribute-title')).toContainText('Distribute');

    // Select the approved+active listing so the Social kit (approved+active gated) renders.
    // The workspace's Distribute rework made this a NATIVE <select> — Playwright drives those
    // with selectOption, not option clicks (the intent — "pick the live listing" — is unchanged).
    const selector = page.getByTestId('select-listing');
    await expect(selector).toBeVisible({ timeout: 15_000 });
    await selector.selectOption(liveId);

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
    // D-4 (ledger row 119): minting is NOT a step of its own any more — the separate "Get link"
    // button is gone and the first ACTION mints inline. Its absence is the ruling, so assert it.
    await expect(page.getByTestId('button-direct-get-link')).toHaveCount(0);
    await expect(page.getByTestId('button-direct-copy')).toBeVisible();
    // Clicking Copy mints the tracked /r/ link, then copies it. (A headless clipboard denial is
    // caught by the component and does not block the mint — the URL still renders.)
    await page.getByTestId('button-direct-copy').click();
    // §13 holds: the URL text appears only once a real code exists.
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

    // ── D3 (S6 reuse): Social-kit — the SAME <OfferingShareDetail/> Catalog's dialog used to
    // open, now mounted inline. Three format previews + populated caption + Instagram-publish
    // per format (the feature Catalog's dialog carried and a hand-rolled Distribute preview
    // would have dropped) — NO deep-link back to Catalog (there is nothing there to send anyone
    // to anymore). ────────────────────────────────────────────────────────────────────────────
    const socialCard = page.getByTestId('card-channel-social');
    await expect(socialCard).toBeVisible();
    // The workspace's tap-to-select gallery renders every format as a picker thumbnail
    // (img-social-frame-<format>) instead of the old per-listing img-share-<format>-<id> grid —
    // same contract (all formats previewed, unlocked only for approved+active), new vocabulary.
    await expect(page.getByTestId('img-social-frame-feed')).toBeVisible();
    await expect(page.getByTestId('img-social-frame-story')).toBeVisible();
    // Route frame is honestly conditional (404 collapses it) — present or absent, never broken.
    const caption = page.getByTestId('textarea-social-caption');
    await expect(caption).toBeVisible();
    expect(((await caption.inputValue()) ?? '').length, 'social caption populated').toBeGreaterThan(0);
    // Instagram-publish affordance survives the move (one of connect / publish / checking / disabled).
    const igButtons = socialCard.locator('[data-testid*="-publish-ig"], [data-testid*="-connect-ig"]');
    expect(await igButtons.count(), 'Instagram-publish affordance present on Distribute').toBeGreaterThan(0);
    // NEGATIVE (S6): no deep-link back to Catalog for share authoring — Distribute is the home now.
    await expect(page.getByTestId('link-social-studio')).toHaveCount(0);
    // Caption hold in the Social channel too.
    const socialText = ((await socialCard.textContent()) ?? '').toLowerCase();
    expect(socialText).not.toContain('skip');
    expect(socialText).not.toContain('waive');
    expect(socialText).not.toContain('service fee');

    // ── S6: Promote section — moved here from Catalog, real inline actions, no self-link ───────
    const promoteSection = page.getByTestId('section-channel-promote');
    await expect(promoteSection).toBeVisible();
    await expect(promoteSection.getByTestId('card-posting-opportunities')).toBeVisible();
    // NEGATIVE: the promoteHref on-ramp mode is retired — no "Promote in Distribute" self-link.
    await expect(page.locator('[data-testid*="-promote-distribute"]')).toHaveCount(0);
  });
});

test.describe('/provider/services — Catalog is slim; "Distribute this →" is the one pointer (S6)', () => {
  test('every card points at Distribute with itself preselected; no other outward chrome remains', async ({ page }) => {
    await loginProvider(page);
    const liveId = await serviceIdByName(page, LIVE_SERVICE);

    await page.goto(`${BASE_URL}/provider/services`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByTestId('text-services-title')).toBeVisible({ timeout: 15_000 });

    // NEGATIVE (S6): the storefront header, the share-kit dialog and the Promote section are
    // GONE from Catalog — Distribute is the only mount for all three now.
    await expect(page.getByTestId('card-storefront-header')).toHaveCount(0);
    await expect(page.getByTestId('dialog-share-kit')).toHaveCount(0);
    await expect(page.getByTestId('section-catalog-promote')).toHaveCount(0);
    await expect(page.getByTestId('card-posting-opportunities')).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-share-"]')).toHaveCount(0);

    // The per-card pointer lands on Distribute with the listing preselected.
    const pointer = page.getByTestId(`button-distribute-${liveId}`);
    await pointer.scrollIntoViewIfNeeded();
    await expect(pointer).toBeVisible({ timeout: 15_000 });
    await pointer.click();
    await expect(page).toHaveURL(/\/provider\/distribute\?listing=/, { timeout: 10_000 });
    await expect(page.getByTestId('select-listing')).toContainText(LIVE_SERVICE, { timeout: 15_000 });
  });
});
