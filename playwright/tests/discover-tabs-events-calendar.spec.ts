/**
 * /events — the year-ahead calendar (ledger `2026-10-06-events-calendar`, events-page brief 2a).
 * Runs in the discover-tabs gate (`npx playwright test discover-tabs`), fully route-mocked: the
 * one calendar read is answered with a fixture built around TODAY, so no seed is needed.
 *
 *   P1 at a phone width the calendar is on the page, and a day can be picked
 *   P2 Month, then Week, then Day narrows "What's on"
 *   P3 an event already under way is listed and reads "On now"
 *   P4 "Plan around it" opens the planning pop-up
 *   P5 a month-level season shows in the band and in "In season all month", never on a day
 *   P6 "Where to go" lists all eight cities; one with no rating says "Not rated yet"
 *   P7 (2b, ledger `2026-10-06-event-page`) from a row, "Event details" opens the event's own page
 *   P8 on the page, "Plan around it" opens the pop-up with the event's dates and venue filled in
 *   P9 an address with no live event is the "not on our calendar" page, not an empty shell
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
function localKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function plus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localKey(d);
}

const today = localKey(new Date());
const ym = today.slice(0, 7);
const months: string[] = [];
{
  const [y, m] = ym.split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    const idx = m - 1 + i;
    months.push(`${y + Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`);
  }
}
// Two events inside the current month's first or last week, whichever keeps them in-month.
const dayOfMonth = Number(today.slice(8));
const near = dayOfMonth <= 20 ? 3 : -3;
const soonDay = plus(near);

function card(id: string, firstDate: string, lastDate: string, over: Record<string, unknown> = {}) {
  const nights = Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000) + 1;
  return {
    id, series: null, title: `Fixture ${id}`, city: 'Kyoto', marketKey: 'kyoto', neighbourhood: null,
    venue: 'Fixture Hall', startsAt: `${firstDate}T10:00:00.000Z`, endsAt: null, nights,
    daysUntil: Math.round((Date.parse(firstDate) - Date.parse(today)) / 86_400_000),
    firstDate, lastDate, startTime: null, ticketUrl: null, blurb: null, imagePath: null,
    vertical: 'music', venueLocality: null, sourceId: `fixture-${id}`, ...over,
  };
}

const PAYLOAD = {
  months,
  events: [
    card('underway', plus(-1), plus(1), { venue: 'Kyocera Dome Osaka', venueLocality: 'Osaka', vertical: 'other' }),
    card('soon', soonDay, soonDay, { city: 'Porto', marketKey: 'porto', startTime: '21:00' }),
  ],
  bands: [
    { id: 'band-1', title: 'Fixture season', place: 'Japan', country: 'Japan', marketKeys: ['kyoto'], months: [ym], span: 'All year' },
  ],
  places: [
    { marketKey: 'kyoto', city: 'Kyoto', country: 'Japan', vibeTags: ['cultural'], seasons: { [String(Number(ym.slice(5)))]: { group: 'best', averageTemp: '16-22°C', crowdLevel: 'High', scope: 'country' } } },
    ...['goa', 'mumbai', 'jaipur', 'edinburgh', 'porto', 'bogota', 'cartagena'].map((k) => ({
      marketKey: k, city: k.charAt(0).toUpperCase() + k.slice(1), country: 'X', vibeTags: [], seasons: {},
    })),
  ],
};

const EVENT_PAGE = {
  event: PAYLOAD.events[0],
  countdown: 'On now',
  organizer: null,
  goodToKnow: [{ factType: 'hours', text: 'Gates open at 11:00.', label: 'from Fixture Official', sourceUrl: 'https://fixture.example/hours', checked: 'checked 2 Oct 2026' }],
  moreInCity: [],
  verifiedLocals: null,
};

async function mockEventPage(page: Page) {
  await page.route('**/api/city-events/fixture-*', (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    if (id === 'fixture-underway') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENT_PAGE) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'This event is not on our calendar.' }) });
  });
}

async function openEvents(page: Page) {
  await page.route('**/api/city-events/calendar', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
  );
  await page.goto(`${BASE_URL}/events`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page.getByTestId('events-whats-on')).toBeVisible({ timeout: 20_000 });
}

test.describe('/events — the year ahead (2026-10-06-events-calendar)', () => {
  test('P1 at 375px the calendar is on the page and a day can be picked', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openEvents(page);
    await expect(page.getByTestId('global-calendar')).toBeVisible();
    await expect(page.getByTestId('events-year-strip')).toBeVisible();
    await page.getByTestId('events-mode-day').click();
    await page.getByTestId(`events-day-m-${soonDay}`).click();
    await expect(page.getByTestId('events-row-soon')).toBeVisible();
    await expect(page.getByTestId('events-row-underway')).toHaveCount(0);
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 4);
    expect(noOverflow, '/events has no horizontal scroll at 375px').toBe(true);
  });

  test('P2 Month, then Week, then Day narrows What\'s on', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEvents(page);
    await expect(page.getByTestId('events-row-underway')).toBeVisible();
    await expect(page.getByTestId('events-row-soon')).toBeVisible();
    await page.getByTestId('events-mode-week').click();
    await page.getByTestId(`events-day-${today}`).click();
    await expect(page.getByTestId('events-row-underway')).toBeVisible();
    await page.getByTestId('events-mode-day').click();
    await page.getByTestId(`events-day-${soonDay}`).click();
    await expect(page.getByTestId('events-row-soon')).toBeVisible();
    await expect(page.getByTestId('events-row-underway')).toHaveCount(0);
    await expect(page.getByTestId('events-whats-on-count')).toHaveText('1 event · 1 city');
  });

  test('P3 an event under way reads On now, and its real city is said', async ({ page }) => {
    await openEvents(page);
    await expect(page.getByTestId('events-row-countdown-underway')).toContainText(/On now/i);
    await expect(page.getByTestId('events-row-place-underway')).toHaveText('Kyocera Dome Osaka, Osaka · outside the city, planned from Kyoto');
    await expect(page.getByTestId('events-row-when-soon')).toContainText('21:00');
  });

  test('P4 Plan around it opens the planning pop-up', async ({ page }) => {
    await openEvents(page);
    await page.getByTestId('events-plan-underway').click();
    await expect(page.getByTestId('plan-modal')).toBeVisible({ timeout: 10_000 });
  });

  test('P5 a month-level season is a band, never a day', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openEvents(page);
    await expect(page.getByTestId(`events-month-band-${ym}`)).toContainText('Fixture season · Japan');
    await expect(page.getByTestId('events-band-band-1')).toBeVisible();
    // A day with no dated event carries no mark, whatever the band says.
    const quiet = dayOfMonth <= 20 ? `${ym}-28` : `${ym}-01`;
    await expect(page.getByTestId(`events-day-${quiet}`)).toHaveAttribute('data-marks', '0');
  });

  test('P6 Where to go lists all eight cities; unrated ones say so', async ({ page }) => {
    await openEvents(page);
    await expect(page.locator('[data-testid^="events-where-group-"]')).toHaveCount(8);
    await expect(page.getByTestId('events-where-group-kyoto')).toHaveText(/Best time/i);
    await expect(page.getByTestId('events-where-group-goa')).toHaveText(/Not rated yet/i);
    await expect(page.getByTestId('events-where-scope-kyoto')).toContainText('Japan');
  });

  test('P7 from a row, Event details opens the event page', async ({ page }) => {
    await mockEventPage(page);
    await openEvents(page);
    await page.getByTestId('events-details-underway').click();
    await expect(page).toHaveURL(/\/events\/fixture-underway$/);
    await expect(page.getByTestId('event-detail-title')).toHaveText('Fixture underway');
    await expect(page.getByTestId('event-detail-place')).toHaveText('Kyocera Dome Osaka, Osaka · outside the city, planned from Kyoto');
    await expect(page.getByTestId('event-detail-countdown')).toHaveText(/On now/i);
    await expect(page.getByTestId('event-detail-fact')).toContainText('from Fixture Official');
    // 2c is not armed: no notes and no comments, not even an empty section.
    await expect(page.getByText(/comment/i)).toHaveCount(0);
  });

  test('P8 on the page, Plan around it opens the pop-up with the event filled in', async ({ page }) => {
    await mockEventPage(page);
    await page.goto(`${BASE_URL}/events/fixture-underway`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByTestId('event-detail-plan').click();
    await expect(page.getByTestId('plan-modal')).toBeVisible({ timeout: 10_000 });
    const pens = await page.evaluate(() => Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k) ?? ''));
    const pen = pens.map((v) => { try { return JSON.parse(v); } catch { return null; } }).find((v) => v && v.startDate);
    expect(pen?.startDate).toBe(plus(-1));
    expect(pen?.endDate).toBe(plus(1));
    expect(pen?.destination).toBe('Kyoto');
    expect(JSON.stringify(pen?.pendingEvents ?? [])).toContain('Kyocera Dome Osaka');
  });

  test('P9 an unknown address is the not-on-our-calendar page', async ({ page }) => {
    await mockEventPage(page);
    await page.goto(`${BASE_URL}/events/fixture-missing`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByTestId('event-detail-missing')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'This event is not on our calendar' })).toBeVisible();
  });
});
