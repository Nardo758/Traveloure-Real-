/**
 * planning-entry.spec.ts — the single planning entry (ruling 2026-08-28-single-planning-entry), which
 * since E2 (ledger `2026-10-09-e2-plan-entry`) opens PlanEntry for a NEW plan and the edit-only
 * window for the bound one (decision-maker rulings 1–7; sanctioned rewrite of this spec).
 *
 * Proves:
 *  1. Every re-pointed CTA opens the SAME PlanEntry pop-up (landing hero, about, features,
 *     how-it-works, the marketplace surfaces, /start/events).
 *  2. PlanEntry asks "Plan around…" a place · a date · an event, then the occasion, then Start a
 *     plan — and nothing before the plan asks When, Who, a plan name or a way to build.
 *  3. Place → Kyoto → Start a plan is three clicks and zero typed fields; signed out it lands on the
 *     guest map carrying the sign-in record; signed in it lands on the plan's map.
 *  4. A typed city we do not plan in says so and suggests the same country first, else all eight.
 *  5. A door that already chose a way to build continues on the plan: `ai` lands with Draft it with
 *     AI started (`?view=map&draft=ai`).
 *  6. The EDIT window (the slip's Edit) edits the bound plan only: no Occasion step, no build
 *     chooser, no Clear, no plan name — and its steps still follow the plan's own occasion (stops
 *     under a many-stop occasion, the accessibility note under a guest-list occasion).
 *  7. TripStrip's Continue/Edit routes to the PLANNING surface for an in-planning trip and to
 *     /trip/:id only for a past trip (date-derived per ruling 2).
 *
 * Runs against a local server (BASE_URL, default localhost:5000), no fixtures beyond a freshly
 * registered user (the cart-checkout-redirect.spec.ts pattern).
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);

/** Nothing before the plan exists may ask these (brief "Removed from the pop-up"). */
const NEVER_BEFORE_THE_PLAN = [/When is it\?/, /Who is traveling/, /Plan name/, /Build it myself/, /Plan with AI/];

async function openEntryFromHero(page: Page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  // The hero's planning CTA (landing-hero.tsx, data-testid="button-plan-trip").
  const cta = page.getByTestId("button-plan-trip").first();
  await cta.waitFor({ state: "visible", timeout: 20_000 });
  await cta.click();
  await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
}

async function registerUser(page: Page) {
  const email = `e2e-planning-${uid()}@example.com`;
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: "TestPlanning123!", firstName: "Plan", lastName: "Tester", userType: "user" },
  });
  expect(res.status(), `registration failed: ${await res.text()}`).toBe(201);
}

/** Place → a city → Start a plan; optionally a "More specific" occasion first. */
async function startPlanIn(page: Page, marketKey: string, occasionSlug?: string) {
  await page.getByTestId("plan-entry-around-place").click();
  await page.getByTestId(`plan-entry-city-${marketKey}`).click();
  if (occasionSlug) {
    await page.getByTestId("plan-entry-more-specific").click();
    await page.getByTestId("occasion-see-all").click();
    await page.getByTestId(`option-occasion-${occasionSlug}`).click();
  }
  await page.getByTestId("button-plan-entry-start").click();
}

test.describe("Single planning entry — PlanEntry", () => {
  test("landing hero opens PlanEntry at 'Plan around…', and nothing asks When/Who/name/how", async ({ page }) => {
    await openEntryFromHero(page);
    const entry = page.getByTestId("plan-entry");
    await expect(entry.getByRole("heading", { name: "Plan around…" })).toBeVisible();
    for (const k of ["place", "date", "event"]) await expect(page.getByTestId(`plan-entry-around-${k}`)).toBeVisible();
    await page.getByTestId("plan-entry-around-place").click();
    await page.getByTestId("plan-entry-city-kyoto").click();
    // Step 2: the five groups, "A trip" pre-selected.
    await expect(entry.getByRole("heading", { name: "What's the occasion?" })).toBeVisible();
    await expect(page.getByTestId("plan-entry-group-trips")).toHaveAttribute("aria-pressed", "true");
    for (const re of NEVER_BEFORE_THE_PLAN) await expect(entry.getByText(re)).toHaveCount(0);
    for (const id of ["plan-step-when", "plan-step-who", "input-etp-title", "button-etp-clear", "button-etp-save"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.locator('[data-testid^="planning-option-"]')).toHaveCount(0);
  });

  test("signed out: Place → Kyoto → Start a plan = 3 clicks, 0 fields, lands on the guest map", async ({ page }) => {
    await openEntryFromHero(page);
    await page.getByTestId("plan-entry-around-place").click();
    await page.getByTestId("plan-entry-city-kyoto").click();
    await page.getByTestId("button-plan-entry-start").click();
    await expect(page).toHaveURL(/\/plans\/new\?view=map$/, { timeout: 10_000 });
    await expect(page.getByTestId("guest-map-answers")).toContainText("Kyoto");
    const record = JSON.parse((await page.evaluate(() => sessionStorage.getItem("traveloure_pending_plan"))) ?? "null");
    expect(record?.branch).toBe("myself");
    expect(record.source.experienceSlug).toBe("travel");
    expect(record.expiresAt - record.savedAt).toBe(60 * 60 * 1000);
  });

  test("a typed city we do not plan in says so and suggests the same country first, else all eight", async ({ page }) => {
    await openEntryFromHero(page);
    await page.getByTestId("plan-entry-around-place").click();
    await page.getByTestId("plan-entry-city-input").fill("Delhi, India");
    const notYet = page.getByTestId("plan-entry-not-yet");
    await expect(notYet).toContainText("We're not planning in Delhi yet");
    await expect(notYet.locator('[data-testid^="plan-entry-city-"]')).toHaveCount(3);
    await page.getByTestId("plan-entry-city-input").fill("Paris");
    await expect(notYet).toContainText("We're not planning in Paris yet");
    await expect(notYet.locator('[data-testid^="plan-entry-city-"]')).toHaveCount(8);
  });

  test("a date: Next month shows what's on and the eight cities, then the occasion", async ({ page }) => {
    await openEntryFromHero(page);
    await page.getByTestId("plan-entry-around-date").click();
    await page.getByTestId("plan-entry-date-next-month").click();
    await expect(page.getByTestId("plan-entry-whats-on")).toBeVisible();
    await page.getByTestId("plan-entry-city-porto").click();
    await page.getByTestId("button-plan-entry-next").click();
    await expect(page.getByTestId("plan-entry-step-occasion")).toBeVisible();
    await expect(page.getByTestId("plan-entry-summary")).toContainText("Porto");
  });

  for (const entry of [
    { path: "/about", testid: "button-start-planning" },
    { path: "/features", testid: "button-start-planning" },
    { path: "/how-it-works", testid: "button-create-trip-cta" },
  ]) {
    test(`${entry.path} CTA opens PlanEntry`, async ({ page }) => {
      await page.goto(`${BASE_URL}${entry.path}`, { waitUntil: "domcontentloaded" });
      const btn = page.getByTestId(entry.testid);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
    });
  }
});

test.describe("Marketplace surfaces offer a plan entry (2026-09-04-entry-unification)", () => {
  // The four marketplace routes are ONE component (pages/discover.tsx, `surface` prop) and
  // carried NO plan entry: they rendered perfectly, every link resolved, and a traveler standing
  // on any of them could not start a plan. Rendering is not reachability of the next step, which
  // is why the existing route gates never caught it.
  for (const path of ["/destinations", "/ready-made", "/events", "/services"]) {
    test(`${path} offers the plan entry, and it opens the modal`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
      const btn = page.getByTestId("button-plan-entry-marketplace");
      await btn.scrollIntoViewIfNeeded();
      await expect(btn).toBeVisible({ timeout: 10_000 });
      await btn.click();
      await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
    });
  }

  // §13: the entry passes only context the page HOLDS. A bare surface with no ?city= must still
  // open the modal — passing nothing is the honest answer, not a reason to withhold the entry.
  test("the entry works with no city context at all", async ({ page }) => {
    await page.goto(`${BASE_URL}/services`, { waitUntil: "domcontentloaded" });
    const btn = page.getByTestId("button-plan-entry-marketplace");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("The Event Planner fork's third door (2026-09-04-wedding-entry-doors)", () => {
  // `/start/events` forked only between two SUPPLY signups: a couple following any "Event Planner"
  // link was offered nothing but two ways to sell. The host door is the traveler's, and it opens
  // PlanEntry rather than a third form.
  test("/start/events offers the host door, and it opens the modal", async ({ page }) => {
    await page.goto(`${BASE_URL}/start/events`, { waitUntil: "domcontentloaded" });
    const btn = page.getByTestId("button-start-events-plan");
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    // The page holds NO occasion and passes none, so PlanEntry opens at "Plan around…" (§13).
    await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("plan-entry-step-around")).toBeVisible();
  });

  // The two supply doors are untouched by the third — they still route to their own signups.
  test("the two supply doors still route to their signup forms", async ({ page }) => {
    await page.goto(`${BASE_URL}/start/events`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("option-vendor")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("option-planner")).toBeVisible();
    await page.getByTestId("option-vendor").click();
    await expect(page).toHaveURL(/\/become-provider/, { timeout: 10_000 });
  });
});

test.describe("/experiences is the start state, and no route auto-opens (walkthrough F-T1; step 8a; E3)", () => {
  // Ruling 2026-08-28-single-planning-entry extended: a ROUTE never auto-opens the planning modal.
  // E3 (ledger `2026-10-09-e3-experiences-inline`; sanctioned rewrite of :183-223): /experiences mounts
  // PlanEntry INLINE — Step 1 opens on "A place" with the page's map and cards, a city moves to the
  // occasion, and Start a plan is the one action. There is no Continue and no pop-up over the page.
  test("/experiences loads with nothing open, and Start a plan waits for a city", async ({ page }) => {
    await page.goto(`${BASE_URL}/experiences`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Plan around…/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("intake-panel")).toHaveCount(0);
    await expect(page.getByTestId("plan-entry")).toHaveCount(0);
    await expect(page.getByTestId("plan-entry-inline")).toBeVisible();
    await expect(page.getByTestId("experiences-map-credit")).toHaveText("Map: Natural Earth");
    const start = page.getByTestId("button-plan-entry-start");
    await expect(start).toBeDisabled();
    await page.getByTestId("city-card-kyoto").click();
    await expect(page.getByTestId("plan-entry-step-occasion")).toBeVisible();
    await expect(page.getByTestId("plan-entry-group-trips")).toHaveAttribute("aria-pressed", "true");
    await expect(start).toBeEnabled();
  });

  // E3 ruling 1: signed out, Start a plan writes PlanEntry's sign-in record and opens the guest map.
  test("Start a plan opens no pop-up: signed out, it lands on the guest map with the city", async ({ page }) => {
    await page.goto(`${BASE_URL}/experiences`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("map-pin-kyoto").click({ timeout: 15_000 });
    await page.getByTestId("plan-entry-group-hosted_events").click();
    await page.getByTestId("button-plan-entry-start").click();
    await expect(page).toHaveURL(/\/plans\/new\?view=map$/, { timeout: 10_000 });
    await expect(page.getByTestId("plan-entry")).toHaveCount(0);
    await expect(page.getByTestId("plan-modal")).toHaveCount(0);
    await expect(page.getByTestId("guest-map-answers")).toContainText("Kyoto");
  });

  test("?destination= pre-picks only an exact match of the eight", async ({ page }) => {
    await page.goto(`${BASE_URL}/experiences?destination=Porto`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("plan-entry-summary")).toContainText("Porto", { timeout: 15_000 });
    await page.goto(`${BASE_URL}/experiences?destination=Lisbon`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("city-card-porto")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="city-card-"][aria-pressed="true"]')).toHaveCount(0);
  });

  // E3: Start a plan stays in view at phone width (a sticky footer on the inline mount).
  test("at 390px Start a plan is sticky and in view", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/experiences?destination=Kyoto`, { waitUntil: "domcontentloaded" });
    const footer = page.getByTestId("plan-entry-footer");
    await expect(footer).toBeVisible({ timeout: 15_000 });
    expect(await footer.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
    await page.getByTestId("plan-entry-more-specific").click();
    await page.mouse.wheel(0, 600);
    await expect(page.getByTestId("button-plan-entry-start")).toBeInViewport();
    const box = await page.getByTestId("button-plan-entry-start").boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390, "no horizontal overflow").toBe(true);
  });
});

test.describe("Single planning entry — authed", () => {
  test("Start a plan mints and lands on the plan's map (a trip), with placeholder dates", async ({ page }) => {
    await registerUser(page);
    await openEntryFromHero(page);
    await startPlanIn(page, "kyoto");
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}\?view=map/, { timeout: 15_000 });
    const tripId = page.url().match(/\/plans\/([0-9a-f-]{36})/)![1];
    const trip = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}`)).json();
    expect(trip.destination).toBe("Kyoto, Japan");
    expect(trip.datesConfirmedAt ?? null, "no date was chosen, so none is certified").toBeNull();
  });

  test("a date pick creates the plan with REAL dates", async ({ page }) => {
    await registerUser(page);
    await openEntryFromHero(page);
    const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
    await page.getByTestId("plan-entry-around-date").click();
    await page.getByTestId("plan-entry-date-pick").click();
    await page.getByTestId("plan-entry-date-start").fill(start);
    await page.getByTestId("plan-entry-date-end").fill(end);
    await page.getByTestId("plan-entry-city-kyoto").click();
    await page.getByTestId("button-plan-entry-next").click();
    await page.getByTestId("button-plan-entry-start").click();
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const tripId = page.url().match(/\/plans\/([0-9a-f-]{36})/)![1];
    const trip = await (await page.request.get(`${BASE_URL}/api/trips/${tripId}`)).json();
    expect(String(trip.startDate).slice(0, 10)).toBe(start);
    expect(String(trip.endDate).slice(0, 10)).toBe(end);
    expect(trip.datesConfirmedAt, "a date pick is a chosen date").toBeTruthy();
  });

  test("the pricing ladder's AI row lands on the map with Draft it with AI started", async ({ page }) => {
    await registerUser(page);
    await page.goto(`${BASE_URL}/pricing`, { waitUntil: "domcontentloaded" });
    const ai = page.getByTestId("button-plan-ai");
    await ai.scrollIntoViewIfNeeded();
    await ai.click();
    await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
    await startPlanIn(page, "kyoto");
    // The request is consumed once and removed from the address; the draft asks for dates first (E1).
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}\?view=map$/, { timeout: 15_000 });
    await expect(page.getByTestId("slip-draft-dates-gate")).toBeVisible({ timeout: 15_000 });
  });

  test("the edit window edits the bound plan: no Occasion step, chooser, Clear or name — and follows its occasion", async ({ page }) => {
    await registerUser(page);
    await openEntryFromHero(page);
    await startPlanIn(page, "kyoto", "wedding");
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await page.getByTestId("slip-meta-stops-edit").click();
    await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("plan-entry")).toHaveCount(0);
    for (const id of ["plan-step-occasion", "plan-modal-occasion-pill", "button-etp-clear", "input-etp-title", "button-plan-city-new"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.locator('[data-testid^="planning-option-"]')).toHaveCount(0);
    // A wedding (one stop, a guest list): no stop list; Who asks the accessibility note, not an approver.
    await expect(page.getByTestId("button-plan-add-stop")).toHaveCount(0);
    await page.getByTestId("plan-step-who").click();
    await expect(page.getByTestId("plan-step-who-accessibility")).toBeVisible();
    await expect(page.getByTestId("plan-step-who-approver")).toHaveCount(0);
    await expect(page.getByTestId("button-etp-save")).toBeVisible();
  });

  // H1 + E2 (E2 landed second and wires the header button): with a plan BOUND, the nav's "Start a plan"
  // still starts a NEW plan — PlanEntry, never the bound plan's edit window.
  test("with a plan bound, the header's Start a plan opens PlanEntry, not the edit window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await registerUser(page);
    await openEntryFromHero(page);
    await startPlanIn(page, "kyoto", "wedding");
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/, { timeout: 15_000 });
    // The plan page is a console page; the public header (and its button) is on the site's pages.
    await page.goto(`${BASE_URL}/about`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("button-nav-start-plan").click({ timeout: 15_000 });
    await expect(page.getByTestId("plan-entry")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("plan-modal")).toHaveCount(0);
  });

  test("the edit window under a many-stop trip offers stops and no accessibility note", async ({ page }) => {
    await registerUser(page);
    await openEntryFromHero(page);
    await startPlanIn(page, "kyoto");
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await page.getByTestId("slip-meta-stops-edit").click();
    await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("button-plan-add-stop")).toBeVisible();
    await page.getByTestId("plan-step-who").click();
    await expect(page.getByTestId("plan-step-who-accessibility")).toHaveCount(0);
  });
});

test.describe("TripStrip continue routing (date-derived phase, ruling 2)", () => {
  async function seedAndReadHref(page: Page, endDate: string) {
    await page.addInitScript((end) => {
      sessionStorage.setItem(
        "experienceContext",
        JSON.stringify({ tripId: "11111111-1111-4111-8111-111111111111", destination: "Kyoto, Japan", endDate: end }),
      );
    }, endDate);
    await page.goto(`${BASE_URL}/destinations`, { waitUntil: "domcontentloaded" });
    const edit = page.getByTestId("trip-strip-edit");
    await expect(edit).toBeVisible({ timeout: 15_000 });
    return edit.getAttribute("href");
  }

  test("in-planning trip (future end date) continues on the slip", async ({ page }) => {
    const future = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10);
    const href = await seedAndReadHref(page, future);
    expect(href).toBe("/plans/11111111-1111-4111-8111-111111111111");
  });

  test("past trip lands on the summary card (/trip/:id)", async ({ page }) => {
    const past = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);
    const href = await seedAndReadHref(page, past);
    expect(href).toBe("/trip/11111111-1111-4111-8111-111111111111");
  });
});
