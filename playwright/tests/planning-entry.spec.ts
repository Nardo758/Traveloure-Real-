/**
 * planning-entry.spec.ts — the single planning entry (ruling 2026-08-28-single-planning-entry)
 * opening the single planning MODAL (ledger 2026-09-04-one-modal-many-doors).
 *
 * Proves:
 *  1. Every re-pointed CTA opens the SAME global modal (landing hero + final CTA,
 *     about, features, how-it-works) — no entry keeps a divergent behavior.
 *  2. The modal is the five ratified STEPS, and the three ways to build are the
 *     FINISH of the last visible step, not its first screen: a door that carries no
 *     occasion opens on step 1 (the real `experience_types` tile grid), and the
 *     finish CTAs are unreachable until the traveler is on the last step.
 *  2b. Step 2's shape follows the occasion's `default_stops`: the ordered-stop control appears
 *     for a many-stop occasion and is ABSENT (not disabled) for a one-stop one
 *     (ledger 2026-09-04-plan-stops-ui).
 *  3. The branches, unchanged downstream: AI opens the existing EnhancedPlanningModal;
 *     "local" navigates to /experts; "myself" gates a GUEST at sign-in (the slip
 *     route's existing identity gate) and, for an AUTHED user, mints the draft trip
 *     from the modal's own Where/When answers and lands on /plans/:tripId.
 *  4. The AI branch reaches the comparison: with /api/ai/generate-itinerary
 *     intercepted (the response contract Phase 0 verified — a 200 always carries
 *     comparisonId), generate navigates to /itinerary-comparison/:id.
 *  5. TripStrip's Continue/Edit routes to the PLANNING surface for an in-planning
 *     trip and to /trip/:id only for a past trip (date-derived per ruling 2).
 *  6. The Event Planner fork's third door (`/start/events`) opens the SAME modal,
 *     and the two supply doors beside it still route to their own signups
 *     (ledger 2026-09-04-wedding-entry-doors).
 *
 * The occasion row is asserted ABSENT while PLUS_SALES_ENABLED is off (default) —
 * hidden, never teased.
 *
 * Runs against a local server (BASE_URL, default localhost:5000), no fixtures
 * beyond a freshly registered user (the cart-checkout-redirect.spec.ts pattern).
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const uid = () => Math.random().toString(36).slice(2, 10);

async function openModalFromHero(page: Page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  // The hero's Plan-my-trip CTA (landing-hero.tsx, data-testid="button-plan-trip").
  const cta = page.getByTestId("button-plan-trip").first();
  await cta.waitFor({ state: "visible", timeout: 20_000 });
  await cta.click();
  await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 10_000 });
}

/**
 * Walk to the last visible step, where the finish lives. A door carrying no occasion shows the
 * four always-visible steps (Occasion / Where / When / Who) — step 5 belongs to occasions whose
 * row says they have an internal schedule — and every visible step is reachable from the rail,
 * which is what makes this one modal for a new plan and for an edit of an existing one.
 */
async function gotoFinish(page: Page) {
  await page.getByTestId("plan-step-who").click();
  await expect(page.getByTestId("planning-option-myself")).toBeVisible({ timeout: 10_000 });
}

async function registerUser(page: Page) {
  const email = `e2e-planning-${uid()}@example.com`;
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: "TestPlanning123!", firstName: "Plan", lastName: "Tester", userType: "user" },
  });
  expect(res.status(), `registration failed: ${await res.text()}`).toBe(201);
}

test.describe("Single planning entry — the one modal", () => {
  test("landing hero opens the modal at STEP 1, on the real occasion catalog", async ({ page }) => {
    await openModalFromHero(page);
    // A door with no occasion opens at step 1 (`resolvePlanSteps`), and its tiles are the
    // `experience_types` rows — not a hardcoded list. `travel` is a seeded slug.
    await expect(page.getByTestId("plan-step-occasion")).toBeVisible();
    await expect(page.getByTestId("option-occasion-travel")).toBeVisible({ timeout: 10_000 });
    // "Next: Where" is disabled until a tile is picked — the artboard's "Pick one to continue."
    await expect(page.getByTestId("button-planning-next")).toBeDisabled();
    // The finish belongs to the LAST step, never the first screen.
    await expect(page.getByTestId("planning-option-myself")).toHaveCount(0);
  });

  test("the finish offers the three ways to build; occasion row hidden while Plus sales are off", async ({ page }) => {
    await openModalFromHero(page);
    await gotoFinish(page);
    await expect(page.getByTestId("planning-option-ai")).toBeVisible();
    await expect(page.getByTestId("planning-option-local")).toBeVisible();
    // PLUS_SALES_ENABLED defaults off — the occasion branch is hidden, never teased.
    await expect(page.getByTestId("planning-option-occasion")).toHaveCount(0);
  });

  /**
   * Step 2's shape is the occasion's own `default_stops` (ledger `2026-09-04-plan-stops-ui`,
   * migration 276 read for the first time). Both tiles here are seeded rows with opposite values:
   * `travel` is "many", `wedding` is "one" (server/seeds/experience-template-tabs.seed.ts). The
   * control is OMITTED under "one", never rendered disabled — a disabled affordance still promises
   * a capability the occasion does not have.
   */
  test("step 2 offers stops for a many-stop occasion and NOT for a one-stop one", async ({ page }) => {
    await openModalFromHero(page);
    await page.getByTestId("option-occasion-travel").click();
    await page.getByTestId("plan-step-where").click();
    await expect(page.getByTestId("input-etp-destination")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("button-plan-add-stop")).toBeVisible();

    // Back to step 1 through the occasion pill, and onto an occasion whose row says ONE stop.
    await page.getByTestId("plan-modal-occasion-pill").click();
    await page.getByTestId("option-occasion-wedding").click();
    await page.getByTestId("plan-step-where").click();
    await expect(page.getByTestId("input-etp-destination")).toBeVisible();
    await expect(page.getByTestId("button-plan-add-stop")).toHaveCount(0);
    await expect(page.getByTestId("plan-stops-list")).toHaveCount(0);
  });

  test("AI branch opens the existing planning modal (guest sees its own sign-in gate)", async ({ page }) => {
    await openModalFromHero(page);
    await gotoFinish(page);
    await page.getByTestId("planning-option-ai").click();
    // For a GUEST the modal renders its own preserved auth prompt (the existing
    // gate, unchanged) — the form and its close button only exist when authed.
    await expect(page.getByTestId("button-signin-from-modal")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("button-cancel-signin-prompt")).toBeVisible();
  });

  test("local branch navigates to /experts", async ({ page }) => {
    await openModalFromHero(page);
    await gotoFinish(page);
    await page.getByTestId("planning-option-local").click();
    await expect(page).toHaveURL(/\/experts/, { timeout: 10_000 });
  });

  test("myself branch gates a guest at sign-in (the slip's existing identity gate)", async ({ page }) => {
    await openModalFromHero(page);
    await gotoFinish(page);
    await page.getByTestId("planning-option-myself").click();
    await expect(page.getByTestId("modal-sign-in")).toBeVisible({ timeout: 10_000 });
  });

  for (const entry of [
    { path: "/about", testid: "button-start-planning" },
    { path: "/features", testid: "button-start-planning" },
    { path: "/how-it-works", testid: "button-create-trip-cta" },
  ]) {
    test(`${entry.path} CTA opens the modal`, async ({ page }) => {
      await page.goto(`${BASE_URL}${entry.path}`, { waitUntil: "domcontentloaded" });
      const btn = page.getByTestId(entry.testid);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 10_000 });
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
      await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 10_000 });
    });
  }

  // §13: the entry passes only context the page HOLDS. A bare surface with no ?city= must still
  // open the modal — passing nothing is the honest answer, not a reason to withhold the entry.
  test("the entry works with no city context at all", async ({ page }) => {
    await page.goto(`${BASE_URL}/services`, { waitUntil: "domcontentloaded" });
    const btn = page.getByTestId("button-plan-entry-marketplace");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("The Event Planner fork's third door (2026-09-04-wedding-entry-doors)", () => {
  // `/start/events` forked only between two SUPPLY signups: a couple following any "Event Planner"
  // link was offered nothing but two ways to sell. The host door is the traveler's, and it opens
  // THE chooser rather than a third form.
  test("/start/events offers the host door, and it opens the modal", async ({ page }) => {
    await page.goto(`${BASE_URL}/start/events`, { waitUntil: "domcontentloaded" });
    const btn = page.getByTestId("button-start-events-plan");
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    // The page holds NO occasion and passes none, so the modal opens at step 1 (§13).
    await expect(page.getByTestId("plan-modal")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("plan-step-occasion")).toBeVisible();
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

test.describe("No route auto-opens the intake (walkthrough F-T1, 2026-08-30)", () => {
  // Ruling 2026-08-28-single-planning-entry extended: a ROUTE never auto-opens the
  // planning chooser/intake. /experiences is a browse surface first; the intake panel
  // opens only from its CTA or an explicit ?plan=1 deep-link, never on bare arrival.
  test("/experiences loads with NO intake panel open", async ({ page }) => {
    await page.goto(`${BASE_URL}/experiences`, { waitUntil: "domcontentloaded" });
    // The page's own browse content renders...
    await expect(page.getByRole("heading", { name: /Plan Your Perfect Experience/i })).toBeVisible({
      timeout: 15_000,
    });
    // ...and the intake modal is NOT blocking it.
    await expect(page.getByTestId("intake-panel")).toHaveCount(0);
  });

  test("the page CTA opens the intake panel", async ({ page }) => {
    await page.goto(`${BASE_URL}/experiences`, { waitUntil: "domcontentloaded" });
    const cta = page.getByTestId("button-experiences-start-plan");
    await cta.waitFor({ state: "visible", timeout: 15_000 });
    await cta.click();
    await expect(page.getByTestId("intake-panel")).toBeVisible({ timeout: 10_000 });
  });

  test("?plan=1 deep-link opens the intake panel on arrival", async ({ page }) => {
    await page.goto(`${BASE_URL}/experiences?plan=1`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("intake-panel")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Single planning entry — authed branches", () => {
  test("myself branch mints from the modal's OWN answers and lands on the slip (/plans/:tripId)", async ({ page }) => {
    await registerUser(page);
    await openModalFromHero(page);
    // The destination and the dates are asked ONCE, on steps 2 and 3 — the branch no longer
    // re-asks for them (ledger 2026-09-04-one-modal-many-doors).
    await page.getByTestId("plan-step-where").click();
    await page.getByTestId("input-etp-destination").fill("Kyoto, Japan");
    await page.getByTestId("plan-step-when").click();
    const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
    await page.getByTestId("input-etp-start-date").fill(start);
    await page.getByTestId("input-etp-end-date").fill(end);
    await gotoFinish(page);
    await page.getByTestId("planning-option-myself").click();
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/, { timeout: 15_000 });
    // The slip renders content, not the 404 page.
    await expect(page.locator("text=Page Not Found")).toHaveCount(0);
  });

  test("myself branch REFUSES rather than inventing dates (§13)", async ({ page }) => {
    await registerUser(page);
    await openModalFromHero(page);
    await page.getByTestId("plan-step-where").click();
    await page.getByTestId("input-etp-destination").fill("Kyoto, Japan");
    await gotoFinish(page);
    await page.getByTestId("planning-option-myself").click();
    // `mintTripSlip` refuses before it calls the server; the traveler is ASKED for the dates.
    await expect(page.getByTestId("text-planning-create-error")).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/plans\//);
  });

  test("AI branch reaches the comparison (generate → /itinerary-comparison/:id)", async ({ page }) => {
    await registerUser(page);
    // Intercept the generate call with the contract Phase 0 verified: a 200 always
    // carries comparisonId (created inside the snapshot transaction server-side).
    await page.route("**/api/ai/generate-itinerary", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ comparisonId: "e2e-cmp-1", tripId: "e2e-trip-1", message: "ok" }),
      }),
    );
    await openModalFromHero(page);
    await gotoFinish(page);
    await page.getByTestId("planning-option-ai").click();
    const dest = page.getByTestId("input-destination");
    await expect(dest).toBeVisible({ timeout: 10_000 });
    await dest.fill("Kyoto");
    await page.getByTestId("button-add-destination").click();
    const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
    await page.getByTestId("input-start-date").fill(start);
    await page.getByTestId("input-end-date").fill(end);
    await page.getByTestId("button-generate-itinerary").click();
    await expect(page).toHaveURL(/\/itinerary-comparison\/e2e-cmp-1/, { timeout: 15_000 });
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
