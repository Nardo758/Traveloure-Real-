/**
 * w1-kyoto-authoring.spec.ts — R322 (step 7a, R-bh): an expert builds a 3-day Kyoto authoring trip
 * on the remounted Workstation (MapControlCenter + DayBlock / ItemRow role expert / LegRow).
 *
 *   1. the seeded CI expert mints an authoring build and ships it to the store (the routes the
 *      Workstation's own "New build" and "Ship to store" buttons call)
 *   2. THREE stops are added FROM THE MAP: the Platform-services drawer publishes its located
 *      results as map candidates, and the map's "Add to day N" adds through that drawer — two on
 *      day 1, one on day 2. Day 3 gets a stop of the expert's own from its "+ Add a stop of your own"
 *      (the folded-in InlineAddItemForm); the publish gate needs a stop on every day.
 *   3. every leg between located stops is picked, tipped and CONFIRMED on its LegRow
 *   4. GET …/readiness reports no blocking line, and the listing's Submit succeeds
 *   (L2-5) while legs are open, Submit is disabled and the checklist's "Show" lands on a leg/gap row
 *
 * STATED DIVERGENCES (R-1, each filed as a finding): this CI has no Google key, so the real
 * `transport-legs/generate` routes nothing — the PROPOSED leg is seeded (never a confirmed one: the
 * author's pick, tip and confirm are the UI's); and no Unsplash key, so the hero is seeded.
 */
import { test, expect } from '@playwright/test';
import { e2eTitle } from './lib/run-id';
import { loginViaUi } from './lib/accounts';
import { fileFinding } from './lib/findings';
import { q, seedReadyMadeHero, seedReadyMadeProposedLegs } from './lib/db';

const EXPERT = { email: 'ci-expert@traveloure.test', password: 'CITestExpert!99' };
const TIP = 'Walk the Shirakawa canal, not the main road';

const rowSel = '[data-testid="workstation-days"] [data-item-mode]';

test.describe.configure({ mode: 'serial' });

test('W1: an expert builds a 3-day Kyoto trip on the Workstation and submits it', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await loginViaUi(page, EXPERT.email, EXPERT.password);

  // ── 1 · the build and its listing ───────────────────────────────────────────────────────────
  const title = e2eTitle('W1 three days in Kyoto');
  const created = await page.request.post('/api/expert/ready-made', { data: { title, destination: 'Kyoto', durationDays: 3 } });
  expect(created.status(), await created.text()).toBe(201);
  const { tripId } = await created.json();
  const shipped = await page.request.post(`/api/expert/ready-made/from-trip/${tripId}`, { data: { title, market: 'Kyoto' } });
  expect(shipped.ok(), await shipped.text()).toBeTruthy();
  const { listingId } = await shipped.json();
  const patched = await page.request.patch(`/api/expert/ready-made/${listingId}`, {
    data: { title, planType: 'city_itinerary', priceCents: 24900 },
  });
  expect(patched.ok(), await patched.text()).toBeTruthy();
  await seedReadyMadeHero(listingId);
  fileFinding({
    journey: 'W1', step: 'hero', class: 'SPEC_DIVERGENCE', severity: 'P3', known: 'HELD:unsplash',
    title: 'seeded ready-made hero (HELD:unsplash)', expected: 'the Unsplash picker supplies the hero',
    actual: 'no UNSPLASH_ACCESS_KEY in CI; hero seeded on the run-tagged listing', where: `ready_made_trips ${listingId}`,
    behavioural: false,
  });

  // ── 2 · three stops from the map ────────────────────────────────────────────────────────────
  await page.goto(`/expert/workspace/${tripId}`);
  await expect(page.getByTestId('workstation-canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-right-add').click();
  await page.getByTestId('pill-add-platform').click();
  const candidates = page.locator('[data-testid^="map-browse-row-candidate-"]');
  await expect(candidates.nth(2)).toBeVisible({ timeout: 30_000 });
  const ids = await candidates.evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute('data-testid')!));

  // A Kyoto build opens on the format registry's Structure view; the day rows are its "Day list".
  const showDayList = async () => {
    const toggle = page.getByTestId('toggle-format-day-list');
    await expect(page.getByTestId('workstation-days').or(toggle).first()).toBeVisible({ timeout: 20_000 });
    if (!(await page.getByTestId('workstation-days').isVisible()) && (await toggle.isVisible())) await toggle.click();
  };
  const addFromMap = async (candidateTestId: string, day: number, expectRows: number) => {
    // The map's own day pill: it draws every day of the build and sets the day "Add to day N" adds to.
    await page.getByTestId(`map-day-btn-${day}-${tripId}`).click();
    await page.getByTestId(candidateTestId).click();
    await expect(page.getByTestId('map-browse-add')).toContainText(`Add to day ${day}`);
    const posted = page.waitForResponse((r) => r.url().endsWith(`/api/trips/${tripId}/itinerary-items`) && r.request().method() === 'POST');
    await page.getByTestId('map-browse-add').click();
    expect((await posted).ok()).toBeTruthy();
    await showDayList();
    await expect(page.locator(rowSel)).toHaveCount(expectRows, { timeout: 20_000 });
  };
  await addFromMap(ids[0], 1, 1);
  await addFromMap(ids[1], 1, 2);
  await addFromMap(ids[2], 2, 3);

  // Day 3: a stop of the expert's own, from the day itself.
  await page.getByTestId('workstation-add-stop-day-3').click();
  await page.getByTestId('input-inline-add-title').fill('Evening at the hotel ryokan bath');
  const own = page.waitForResponse((r) => r.url().endsWith(`/api/trips/${tripId}/itinerary-items`) && r.request().method() === 'POST');
  await page.getByTestId('button-inline-add-confirm').click();
  expect((await own).ok()).toBeTruthy();
  await expect(page.locator(rowSel)).toHaveCount(4, { timeout: 20_000 });

  const items = await q<{ day_number: number; latitude: string | null }>(
    `SELECT day_number, latitude FROM itinerary_items WHERE trip_id = $1 ORDER BY day_number, sort_order`,
    [tripId],
  );
  expect(items.map((i) => i.day_number)).toEqual([1, 1, 2, 3]);
  expect(items.slice(0, 3).every((i) => i.latitude != null), 'the three map stops carry their coordinates').toBeTruthy();

  // ── 3 · every leg picked, tipped and confirmed ──────────────────────────────────────────────
  const generated = page.waitForResponse((r) => r.url().endsWith(`/api/trips/${tripId}/transport-legs/generate`));
  await page.getByTestId('button-generate-transport').click();
  const gen = await (await generated).json();
  if ((gen?.created ?? 0) === 0) {
    const seeded = await seedReadyMadeProposedLegs(tripId);
    fileFinding({
      journey: 'W1', step: 'legs', class: 'SPEC_DIVERGENCE', severity: 'P3', known: 'HELD:google-routes',
      title: `seeded ${seeded} PROPOSED leg(s) (no routing in CI)`,
      expected: 'generate proposes a leg for each located pair', actual: `generate created 0 (skipped ${gen?.skipped?.length ?? 0})`,
      where: `transport_legs trip ${tripId}`, behavioural: false,
    });
    await page.reload();
  }
  const readinessBefore = await (await page.request.get(`/api/expert/ready-made/${listingId}/readiness`)).json();
  expect(readinessBefore.blocking.map((l: any) => l.requirement)).toContain('legs');

  await showDayList();
  const legRows = page.locator('[data-testid^="leg-row-"]');
  await expect(legRows.first()).toBeVisible({ timeout: 30_000 });
  const legIds = (await legRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!))).map((t) => t.replace('leg-row-', ''));
  expect(legIds.length).toBeGreaterThan(0);

  // L2-5 (ledger `2026-10-05-readiness-checklist-ui`): with the legs still open, the checklist's "Show"
  // on the legs line lands on this surface's own leg or gap row (step 7a's `@shared/plan-jump-targets`
  // ids), outlined — no second jump resolution, no legacy panel.
  await page.getByTestId('tab-right-distribute').click();
  const jumpLegs = page.getByTestId('button-readiness-jump-legs').first();
  await expect(jumpLegs).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('button-submit-listing')).toBeDisabled();
  await jumpLegs.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('[id^="plan-leg-"], [id^="plan-gap-"]')).some((e) => (e as HTMLElement).style.outline.includes('2px')),
      ),
    )
    .toBeTruthy();

  for (const legId of legIds) {
    const patch = () =>
      page.waitForResponse((r) => r.url().endsWith(`/api/trips/${tripId}/transport-legs/${legId}`) && r.request().method() === 'PATCH');
    // Pick a mode other than the current one, so the pick is the author's own.
    const select = page.getByTestId(`leg-mode-select-${legId}`);
    const current = await select.inputValue();
    const options = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const pick = options.includes('train') && current !== 'train' ? 'train' : options.find((o) => o !== current)!;
    let p = patch();
    await select.selectOption(pick);
    expect((await p).ok()).toBeTruthy();
    await expect(page.getByTestId(`leg-mode-select-${legId}`)).toHaveValue(pick);

    await page.getByTestId(`leg-tip-input-${legId}`).fill(TIP);
    p = patch();
    await page.getByTestId(`leg-tip-save-${legId}`).click();
    expect((await p).ok()).toBeTruthy();

    p = patch();
    await page.getByTestId(`leg-confirm-${legId}`).click();
    expect((await p).ok()).toBeTruthy();
    await expect(page.getByTestId(`leg-status-${legId}`)).toHaveText('Confirmed');
    await expect(page.getByTestId(`leg-checked-${legId}`)).toBeVisible();
    await expect(page.getByTestId(`leg-author-pick-${legId}`)).toContainText(TIP);
  }
  const legs = await q<{ proposal_status: string; user_selected_mode: string | null; author_tip: string | null; checked_at: Date | null; checked_by: string | null }>(
    `SELECT proposal_status, user_selected_mode, author_tip, checked_at, checked_by FROM transport_legs WHERE trip_id = $1 AND variant_id IS NULL`,
    [tripId],
  );
  for (const l of legs) {
    expect(l.proposal_status).toBe('confirmed');
    expect(l.user_selected_mode).toBeTruthy();
    expect(l.author_tip).toBe(TIP);
    expect(l.checked_at, 'R-bf: Confirm stamps checked_at').not.toBeNull();
    expect(l.checked_by, 'R-bf: Confirm stamps checked_by').not.toBeNull();
  }

  // ── 4 · readiness, then Submit ──────────────────────────────────────────────────────────────
  const readiness = await (await page.request.get(`/api/expert/ready-made/${listingId}/readiness`)).json();
  expect(readiness.blocking, JSON.stringify(readiness.blocking)).toEqual([]);

  await page.getByTestId('tab-right-distribute').click();
  const submitted = page.waitForResponse((r) => r.url().endsWith(`/api/expert/ready-made/${listingId}/submit`));
  await page.getByTestId('button-submit-listing').click();
  const res = await submitted;
  expect(res.status(), await res.text()).toBe(200);
  const [row] = await q<{ status: string }>(`SELECT status FROM ready_made_trips WHERE id = $1`, [listingId]);
  expect(row.status).toBe('submitted');
});
