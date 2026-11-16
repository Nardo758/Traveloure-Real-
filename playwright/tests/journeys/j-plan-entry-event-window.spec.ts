/**
 * E8 (lane 7, variant A) — the event window on the DETAILS step, driven the way the passing /experiences
 * spec does it: `page.goto("/experiences")` -> `plan-entry-around-event` -> `plan-entry-events` ->
 * `plan-entry-event-<id>`. No hero, no place/city dance.
 *
 * The event list is ROUTE-MOCKED (`/api/city-events/upcoming`), as the discover-tabs calendar spec does, so
 * nothing depends on seeded data: one Kyoto event, today+10 .. today+12, a known id and title.
 *
 * "Today" is the MARKET's: computed in Asia/Tokyo, not `toISOString()` — a UTC date would flake for nine
 * hours a day.
 */
import { test, expect, type Page } from "@playwright/test";

const tid = (p: Page, id: string) => p.locator(`[data-testid="${id}"]`);

/** The market's today (Asia/Tokyo), YYYY-MM-DD. */
const marketToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const FIRST = plusDays(marketToday, 10);
const LAST = plusDays(marketToday, 12);
const TITLE = "Fixture Kyoto Festival";
const ID = "fixture-e8";

const fixtureEvent = {
  id: ID,
  series: null,
  title: TITLE,
  city: "Kyoto",
  marketKey: "kyoto",
  neighbourhood: null,
  venue: "Fixture Hall",
  startsAt: `${FIRST}T10:00:00.000Z`,
  endsAt: null,
  nights: 3,
  daysUntil: 10,
  firstDate: FIRST,
  lastDate: LAST,
  startTime: null,
  ticketUrl: null,
  blurb: null,
  imagePath: null,
};

/** The selected day cell for one ISO date — the day's own testid lives inside the picker's button. */
const selectedDay = (page: Page, iso: string) =>
  page.locator(`button[name="day"][aria-selected="true"]:has([data-testid="plan-entry-dates-day-${iso}"])`);

async function openEventDetails(page: Page) {
  await page.route("**/api/city-events/upcoming**", (route) =>
    route.fulfill({ json: { windowDays: 60, total: 1, events: [fixtureEvent] } }),
  );
  await page.goto("/experiences");
  await tid(page, "plan-entry-around-event").click({ timeout: 20_000 });
  const events = tid(page, "plan-entry-events");
  await expect(events).toBeVisible();
  await tid(page, `plan-entry-event-${ID}`).click({ timeout: 20_000 });
  await expect(tid(page, "plan-entry-event-window")).toBeVisible({ timeout: 20_000 });
}

test("E8: the default window is the event's own days, with both numbers 0", async ({ page }) => {
  test.setTimeout(120_000);
  await openEventDetails(page);

  await expect(tid(page, "plan-entry-days-before")).toHaveValue("0");
  await expect(tid(page, "plan-entry-days-after")).toHaveValue("0");
  await expect(tid(page, "plan-entry-event-anchor")).toContainText(TITLE);
  await expect(selectedDay(page, FIRST)).toBeVisible();
  await expect(selectedDay(page, LAST)).toBeVisible();
  await expect(selectedDay(page, plusDays(FIRST, -1))).toHaveCount(0);
  await expect(selectedDay(page, plusDays(LAST, 1))).toHaveCount(0);
});

test("E8: before 1 / after 2 widens the same range the calendar shows", async ({ page }) => {
  test.setTimeout(120_000);
  await openEventDetails(page);

  await tid(page, "plan-entry-days-before").fill("1");
  await tid(page, "plan-entry-days-after").fill("2");

  await expect(tid(page, "plan-entry-days-before")).toHaveValue("1");
  await expect(tid(page, "plan-entry-days-after")).toHaveValue("2");
  await expect(tid(page, "plan-entry-event-anchor")).toContainText(`Built around ${TITLE}`);
  await expect(selectedDay(page, plusDays(FIRST, -1))).toBeVisible();
  await expect(selectedDay(page, plusDays(LAST, 2))).toBeVisible();
});

test("E8: a before value past today is clamped to today, not honoured", async ({ page }) => {
  test.setTimeout(120_000);
  await openEventDetails(page);

  await tid(page, "plan-entry-days-before").fill("14");
  // The market's today is exactly where the clamp stops: the start cannot precede it.
  await expect(selectedDay(page, marketToday)).toBeVisible();
  await expect(selectedDay(page, plusDays(marketToday, -1))).toHaveCount(0);
});
