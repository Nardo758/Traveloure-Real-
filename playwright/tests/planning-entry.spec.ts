/**
 * planning-entry.spec.ts — the single planning entry (ruling 2026-08-28-single-planning-entry).
 *
 * Proves:
 *  1. Every re-pointed CTA opens the SAME global chooser (landing hero + final CTA,
 *     about, features, how-it-works) — no entry keeps a divergent behavior.
 *  2. The chooser's branches: AI opens the existing EnhancedPlanningModal; "local"
 *     navigates to /experts; "myself" gates a GUEST at sign-in (the slip route's
 *     existing identity gate) and, for an AUTHED user, creates a draft trip and
 *     lands on /plans/:tripId (the canonical slip).
 *  3. The AI branch reaches the comparison: with /api/ai/generate-itinerary
 *     intercepted (the response contract Phase 0 verified — a 200 always carries
 *     comparisonId), generate navigates to /itinerary-comparison/:id.
 *  4. TripStrip's Continue/Edit routes to the PLANNING surface for an in-planning
 *     trip and to /trip/:id only for a past trip (date-derived per ruling 2).
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

async function openChooserFromHero(page: Page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  // The hero's Plan-my-trip CTA (landing-hero.tsx, data-testid="button-plan-trip").
  const cta = page.getByTestId("button-plan-trip").first();
  await cta.waitFor({ state: "visible", timeout: 20_000 });
  await cta.click();
  await expect(page.getByTestId("dialog-planning-chooser")).toBeVisible({ timeout: 10_000 });
}

async function registerUser(page: Page) {
  const email = `e2e-planning-${uid()}@example.com`;
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: "TestPlanning123!", firstName: "Plan", lastName: "Tester", userType: "user" },
  });
  expect(res.status(), `registration failed: ${await res.text()}`).toBe(201);
}

test.describe("Single planning entry — chooser", () => {
  test("landing hero opens the chooser; occasion row hidden while Plus sales are off", async ({ page }) => {
    await openChooserFromHero(page);
    await expect(page.getByTestId("planning-option-myself")).toBeVisible();
    await expect(page.getByTestId("planning-option-ai")).toBeVisible();
    await expect(page.getByTestId("planning-option-local")).toBeVisible();
    // PLUS_SALES_ENABLED defaults off — the occasion branch is hidden, never teased.
    await expect(page.getByTestId("planning-option-occasion")).toHaveCount(0);
  });

  test("AI branch opens the existing planning modal (guest sees its own sign-in gate)", async ({ page }) => {
    await openChooserFromHero(page);
    await page.getByTestId("planning-option-ai").click();
    // For a GUEST the modal renders its own preserved auth prompt (the existing
    // gate, unchanged) — the form and its close button only exist when authed.
    await expect(page.getByTestId("button-signin-from-modal")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("button-cancel-signin-prompt")).toBeVisible();
  });

  test("local branch navigates to /experts", async ({ page }) => {
    await openChooserFromHero(page);
    await page.getByTestId("planning-option-local").click();
    await expect(page).toHaveURL(/\/experts/, { timeout: 10_000 });
  });

  test("myself branch gates a guest at sign-in (the slip's existing identity gate)", async ({ page }) => {
    await openChooserFromHero(page);
    await page.getByTestId("planning-option-myself").click();
    await expect(page.getByTestId("modal-sign-in")).toBeVisible({ timeout: 10_000 });
  });

  for (const entry of [
    { path: "/about", testid: "button-start-planning" },
    { path: "/features", testid: "button-start-planning" },
    { path: "/how-it-works", testid: "button-create-trip-cta" },
  ]) {
    test(`${entry.path} CTA opens the chooser`, async ({ page }) => {
      await page.goto(`${BASE_URL}${entry.path}`, { waitUntil: "domcontentloaded" });
      const btn = page.getByTestId(entry.testid);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await expect(page.getByTestId("dialog-planning-chooser")).toBeVisible({ timeout: 10_000 });
    });
  }
});

test.describe("Marketplace surfaces offer a plan entry (2026-09-04-entry-unification)", () => {
  // The four marketplace routes are ONE component (pages/discover.tsx, `surface` prop) and
  // carried NO plan entry: they rendered perfectly, every link resolved, and a traveler standing
  // on any of them could not start a plan. Rendering is not reachability of the next step, which
  // is why the existing route gates never caught it.
  for (const path of ["/destinations", "/ready-made", "/events", "/services"]) {
    test(`${path} offers the plan entry, and it opens the chooser`, async ({ page }) => {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
      const btn = page.getByTestId("button-plan-entry-marketplace");
      await btn.scrollIntoViewIfNeeded();
      await expect(btn).toBeVisible({ timeout: 10_000 });
      await btn.click();
      await expect(page.getByTestId("dialog-planning-chooser")).toBeVisible({ timeout: 10_000 });
    });
  }

  // §13: the entry passes only context the page HOLDS. A bare surface with no ?city= must still
  // open the chooser — passing nothing is the honest answer, not a reason to withhold the entry.
  test("the entry works with no city context at all", async ({ page }) => {
    await page.goto(`${BASE_URL}/services`, { waitUntil: "domcontentloaded" });
    const btn = page.getByTestId("button-plan-entry-marketplace");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(page.getByTestId("dialog-planning-chooser")).toBeVisible({ timeout: 10_000 });
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
  test("myself branch creates a draft trip and lands on the slip (/plans/:tripId)", async ({ page }) => {
    await registerUser(page);
    await openChooserFromHero(page);
    await page.getByTestId("planning-option-myself").click();
    const input = page.getByTestId("input-planning-destination");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("Kyoto, Japan");
    const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
    await page.getByTestId("input-planning-start-date").fill(start);
    await page.getByTestId("input-planning-end-date").fill(end);
    await page.getByTestId("button-planning-create-trip").click();
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/, { timeout: 15_000 });
    // The slip renders content, not the 404 page.
    await expect(page.locator("text=Page Not Found")).toHaveCount(0);
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
    await openChooserFromHero(page);
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
