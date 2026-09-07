/**
 * home-gate.spec.ts — HOME IS THE TIME AXIS, AND THE PLAN CARD IS NOT ON IT.
 *
 * Ledger `2026-09-07-home-gate`, closing register defect **D1**: lane L10 landed Home's time axis
 * (CLAUDE.md Locked Decision 45 (8), ledger `2026-09-07-home-time-axis`) with PURE tests only —
 * the greeting sentence, the relative-day label and the server's row builder. Nothing anywhere
 * opened `/dashboard` in a browser, so every assertion the brief asked for about the PAGE existed
 * nowhere: a panel left mounted, a section dropped in a merge, a start tile whose handler moved
 * are all invisible to a pure test and to `tsc`.
 *
 * Runs against a LOCAL server (BASE_URL), on the workflow's own PR artifact — never a deployment.
 * The harness (register → mint a plan → open the page) is `slip-rail-actions.spec.ts`'s, followed
 * rather than reinvented.
 *
 * ── WHAT IT ASSERTS, AND WHY EACH ONE IS HONEST AND STABLE ────────────────────────────────────
 *  H1  The plan card is NOT on Home. Ruling 8 moved it to My plans and the slip. The plan is
 *      MINTED FIRST, so the card would have had something to render — asserting its absence on an
 *      empty account would prove nothing. The removed panels (`PlanSlipStrip`, `TodaysMove`,
 *      `ActionItemsPanel`, `ActiveExpertsPanel`, `TopExpertsPanel`, `RecommendedServices`,
 *      `TravelPulsePanel`) are asserted absent by their own root testids: the component FILES were
 *      deliberately kept (recorded as later §18c candidates), so only the DOM can say they are
 *      unmounted.
 *  H2  Coming up renders EITHER its rows OR its honest empty state — never neither, and never
 *      both. §13: a fresh plan dated in 2027 is outside the window, so the empty state is the
 *      truthful answer here and it must SAY the window rather than draw an empty box. The count
 *      line must not be left at "loading…".
 *  H3  The start strip's two tiles. **The brief and the code disagree, and the code is what is
 *      asserted (reported in the lane's PR):** the brief says both tiles open the ONE planning
 *      modal, but `cta-new-experience` opens `IntakePanel` — whose collapse into the one modal is
 *      LD 42 D11, an explicitly later lane — and `cta-start-with-ai` is a LINK to `/ai-assistant`,
 *      the door lane L5 landed. Asserting the brief's wording would fail on a correct tree.
 *
 * ── WHAT IT DELIBERATELY DOES NOT ASSERT (§13 — stated, never skipped silently) ────────────────
 *  · No `coming-up-row-*` content is required. Which kinds appear depends on dated fixtures this
 *    suite does not seed (a booking, a balance, an occasion draft), and seeding them is another
 *    lane's harness. The row SHAPE is proven purely in `server/services/__tests__/upcoming.test.ts`.
 *  · The greeting SENTENCE is not pinned — `greetingSentence` is proven purely, and pinning its
 *    words here would be a second copy of that rule.
 *  · The home-city block is not asserted: it renders only when `users.home_city` is set, and a
 *    freshly registered traveler has none. Its absence here is correct, not evidence.
 *
 * Run: npx playwright test home-gate --project=chromium
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);

/** A signed-in traveler with a plan of their own — `slip-rail-actions.spec.ts`'s pattern. */
async function registerAndCreateTrip(page: Page, tag: string): Promise<string> {
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email: `e2e-home-${tag}-${uid()}@example.com`,
      password: "HomeGate123!",
      firstName: "Home",
      lastName: "Gate",
      userType: "user",
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: {
      title: "Home gate e2e plan",
      destination: "Kyoto, Japan",
      startDate: "2027-04-01",
      endDate: "2027-04-05",
    },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  return (await trip.json()).id as string;
}

async function openHome(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dashboard-content")).toBeVisible({ timeout: 30_000 });
}

// ── H1 · the plan card left Home ──────────────────────────────────────────────────────────────

test("H1: Home carries NO plan card and none of the panels ruling 8 moved off it", async ({ page }) => {
  // An unbundled dev server compiles this page on first hit; only the budget is raised.
  test.slow();
  const tripId = await registerAndCreateTrip(page, "nocard");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openHome(page);

  // The traveler HAS a plan — so a plan card would have had something to draw.
  await expect(page.getByTestId("text-welcome")).toBeVisible();
  expect(await page.locator(`[data-testid="dashboard-plan-card-${tripId}"]`).count()).toBe(0);
  expect(await page.locator('[data-testid^="dashboard-plan-card-"]').count()).toBe(0);

  for (const gone of [
    "plan-slip-strip-counts",
    "todays-move-section",
    "action-items-panel",
    "active-experts-panel",
    "top-experts-panel",
    "recommended-services-section",
    "travelpulse-panel",
  ]) {
    expect(await page.getByTestId(gone).count(), `${gone} moved off Home under ruling 8`).toBe(0);
  }

  // And the plan is genuinely reachable from where the ruling put it.
  await page.goto(`${BASE_URL}/my-trips`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId(`trip-card-${tripId}`)).toBeVisible({ timeout: 30_000 });
});

// ── H2 · the time axis ────────────────────────────────────────────────────────────────────────

test("H2: Coming up renders its rows OR its honest empty state — one of the two, never neither", async ({
  page,
}) => {
  test.slow();
  await registerAndCreateTrip(page, "comingup");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openHome(page);

  const section = page.getByTestId("coming-up-section");
  await expect(section).toBeVisible();

  // The count line resolves — "loading…" left on screen would mean the one reader never answered.
  const count = page.getByTestId("coming-up-count");
  await expect(count).not.toHaveText(/loading/i, { timeout: 30_000 });

  const empty = section.getByTestId("coming-up-empty");
  const rows = section.locator('[data-testid^="coming-up-row-"]');
  const emptyCount = await empty.count();
  const rowCount = await rows.count();
  expect(
    (emptyCount === 1 && rowCount === 0) || (emptyCount === 0 && rowCount > 0),
    `exactly one of the two states: empty=${emptyCount} rows=${rowCount}`,
  ).toBe(true);

  if (emptyCount === 1) {
    // §13 — the empty state SAYS the window rather than drawing a blank box, and claims no count.
    await expect(empty).toContainText(/dated in the next \d+ days/);
    await expect(count).toContainText(/nothing dated in the next \d+ days/);
  } else {
    await expect(count).toContainText(/dated row/);
  }
});

// ── H3 · the start strip ──────────────────────────────────────────────────────────────────────

test("H3: the two start tiles open the doors the CODE wires — the panel, and /ai-assistant", async ({
  page,
}) => {
  test.slow();
  await registerAndCreateTrip(page, "start");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openHome(page);

  // The wide-screen rail strip is the one pressed; the lg:hidden mobile copy renders the same
  // two tiles from the same component and is not pressed twice.
  const strip = page.getByTestId("start-strip");
  await expect(strip).toBeVisible();

  // Tile 1 — "New plan" opens the intake panel IN PLACE (LD 42 D11: its collapse into the one
  // planning modal is a later lane, so this is what a correct tree does today).
  await strip.getByTestId("cta-new-experience").click();
  await expect(page.getByTestId("intake-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("input-intake-destination")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("intake-panel")).toBeHidden({ timeout: 15_000 });

  // Tile 2 — "Start with AI" is the door lane L5 landed. It NAVIGATES; the page it opens is that
  // lane's to prove, so only the destination is asserted here.
  await strip.getByTestId("cta-start-with-ai").click();
  await expect(page).toHaveURL(/\/ai-assistant/, { timeout: 30_000 });
});
