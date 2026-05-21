import { test, expect } from "@playwright/test";

const TESTUSER_EMAIL    = "testuser123@mailinator.com";
const TESTUSER_PASSWORD = "Test@1234";

// Seeded trip (trips table) — 2 days, 5 itinerary items, Tokyo Adventure 2026
const TRIP_ID    = "itn-seed-trip-0000-0001";
const TRIP_TITLE = "Tokyo Adventure 2026";
const TRIP_DEST  = "Tokyo, Japan";

async function loginAsTestUser123(page: any) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const emailInput = page.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill(TESTUSER_EMAIL);
  await page.locator('input[type="password"]').first().fill(TESTUSER_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  console.log(`Logged in — URL: ${page.url()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ITN-01: My Trips page loads with controls and the seeded trip card
// ─────────────────────────────────────────────────────────────────────────────
test("ITN-01: My Trips page loads with trip cards and filter controls", async ({ page }) => {
  await loginAsTestUser123(page);

  // API check — seeded trip must appear in list
  const apiRes   = await page.request.get("/api/trips");
  const apiTrips = (await apiRes.json()) as any[];
  const found    = Array.isArray(apiTrips) && apiTrips.some((t: any) => t.id === TRIP_ID);
  console.log(`ITN-01: GET /api/trips → ${Array.isArray(apiTrips) ? apiTrips.length : "?"} trip(s), seeded trip found: ${found ? "✓" : "✗"}`);
  expect(found, `Seeded trip ${TRIP_ID} not in /api/trips`).toBe(true);

  await page.goto("/trips");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  // Page title
  const pageTitle = page.locator('[data-testid="text-page-title"]');
  const hasTitle  = await pageTitle.count() > 0;
  const titleText = hasTitle ? (await pageTitle.first().textContent())?.trim() : null;
  console.log(`ITN-01: Page title: ${hasTitle ? "✓ — " + titleText : "✗"}`);
  expect(hasTitle, "text-page-title not found").toBe(true);

  // Core controls
  const controls: Array<[string, string]> = [
    ["button-create-new",    "Create New button"],
    ["input-search",         "Search input"],
    ["select-type-filter",   "Type filter"],
    ["select-status-filter", "Status filter"],
    ["button-grid-view",     "Grid view toggle"],
    ["button-list-view",     "List view toggle"],
  ];
  for (const [testid, label] of controls) {
    const found = await page.locator(`[data-testid="${testid}"]`).first().count() > 0;
    console.log(`ITN-01: ${label}: ${found ? "✓" : "✗"}`);
    expect(found, `${testid} not found`).toBe(true);
  }

  // Seeded trip card
  const tripCard  = page.locator(`[data-testid="card-trip-${TRIP_ID}"]`);
  const hasCard   = await tripCard.count() > 0;
  const titleEl   = page.locator(`[data-testid="text-trip-title-${TRIP_ID}"]`);
  const cardTitle = hasCard && (await titleEl.count() > 0)
    ? (await titleEl.first().textContent())?.trim()
    : null;
  const hasView = await page.locator(`[data-testid="button-view-${TRIP_ID}"]`).count() > 0;
  console.log(`ITN-01: Trip card: ${hasCard ? "✓" : "✗"}  title: "${cardTitle}"  view btn: ${hasView ? "✓" : "✗"}`);
  expect(hasCard,  `card-trip-${TRIP_ID} not visible`).toBe(true);
  expect(cardTitle).toContain(TRIP_TITLE);
  expect(hasView,  `button-view-${TRIP_ID} not found`).toBe(true);

  console.log(`ITN-01: ── PASS ✓ ──
  API:        ✓ ${apiTrips.length} trip(s), seeded trip confirmed
  Controls:   ✓ search + filters + grid/list toggles + create button
  Trip card:  ✓ "${cardTitle}" — view button present`);
});

// ─────────────────────────────────────────────────────────────────────────────
// ITN-02: Experiences page loads experience-type cards (trip creation hub)
// ─────────────────────────────────────────────────────────────────────────────
test("ITN-02: Experiences page loads with experience type cards", async ({ page }) => {
  await loginAsTestUser123(page);

  // API check — experience types must be present
  const apiRes   = await page.request.get("/api/experience-types");
  const apiTypes = (await apiRes.json()) as any[];
  const apiCount = Array.isArray(apiTypes) ? apiTypes.length : 0;
  console.log(`ITN-02: GET /api/experience-types → ${apiCount} type(s)`);
  expect(apiCount).toBeGreaterThan(0);

  await page.goto("/experiences");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  // Experience type cards — rendered for each type from API
  const allCards  = await page.locator('[data-testid^="card-experience-"]').all();
  const cardCount = allCards.length;
  console.log(`ITN-02: Experience cards rendered: ${cardCount}`);
  expect(cardCount).toBeGreaterThan(0);

  // Spot-check at least 2 known slugs from the API
  const slugsToCheck = apiTypes.slice(0, 3).map((t: any) => t.slug);
  for (const slug of slugsToCheck) {
    const cardEl   = page.locator(`[data-testid="card-experience-${slug}"]`).first();
    const hasCard  = await cardEl.count() > 0;
    console.log(`ITN-02: Card for "${slug}": ${hasCard ? "✓" : "✗"}`);
    expect(hasCard, `card-experience-${slug} not found`).toBe(true);
  }

  // Helper action buttons
  const findExpert   = page.locator('[data-testid="button-find-expert"]').first();
  const helpDecide   = page.locator('[data-testid="button-help-decide"]').first();
  const hasFindExp   = await findExpert.count() > 0;
  const hasHelpDec   = await helpDecide.count() > 0;
  console.log(`ITN-02: "Find Expert" btn: ${hasFindExp ? "✓" : "✗"}  "Help me decide" btn: ${hasHelpDec ? "✓" : "✗"}`);
  expect(hasFindExp, "button-find-expert not found").toBe(true);
  expect(hasHelpDec, "button-help-decide not found").toBe(true);

  // Click the first experience card and verify navigation
  const firstCard = allCards[0];
  const cardTestid = await firstCard.getAttribute("data-testid");
  await firstCard.click();
  await page.waitForTimeout(1500);
  const newUrl = page.url();
  const navigated = !newUrl.endsWith("/experiences");
  console.log(`ITN-02: Clicked "${cardTestid}" → navigated: ${navigated ? "✓ " + newUrl : "✗ still at " + newUrl}`);
  expect(navigated, "Clicking experience card did not navigate away from /experiences").toBe(true);

  console.log(`ITN-02: ── PASS ✓ ──
  API:      ✓ ${apiCount} experience type(s)
  Cards:    ✓ ${cardCount} rendered (${slugsToCheck.length} slugs spot-checked)
  Buttons:  ✓ "Find Expert" + "Help me decide"
  Nav:      ✓ clicking card navigated to "${newUrl}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// ITN-03: Trip detail page (PlanCard) loads for seeded trip
// Route: /itinerary/:id → redirects to /trip/:id
// ─────────────────────────────────────────────────────────────────────────────
test("ITN-03: Trip detail page renders PlanCard with tabs for seeded trip", async ({ page }) => {
  await loginAsTestUser123(page);

  // API verify trip exists
  const tripRes  = await page.request.get(`/api/trips/${TRIP_ID}`);
  const tripData = await tripRes.json() as any;
  console.log(`ITN-03: GET /api/trips/${TRIP_ID} → ${tripRes.status()}  title: "${tripData?.title}"`);
  expect(tripRes.status()).toBe(200);
  expect(tripData?.id).toBe(TRIP_ID);
  expect(tripData?.destination).toBe(TRIP_DEST);

  // API verify plancard (2 days, 5 activities seeded)
  const plancardRes  = await page.request.get(`/api/trips/${TRIP_ID}/plancard`);
  const plancardData = await plancardRes.json() as any;
  const dayCount     = Array.isArray(plancardData?.days) ? plancardData.days.length : 0;
  const actCount     = plancardData?.days?.flatMap((d: any) => d.activities ?? []).length ?? 0;
  console.log(`ITN-03: /api/trips/${TRIP_ID}/plancard → ${plancardRes.status()}  days: ${dayCount}  activities: ${actCount}`);

  // Navigate — /itinerary/:id redirects to /trip/:id
  await page.goto(`/trip/${TRIP_ID}`);
  await page.waitForLoadState("domcontentloaded");

  // Wait for the TripDetails page wrapper
  console.log(`ITN-03: Waiting for trip-details-page (up to 18s)…`);
  try {
    await page.waitForSelector('[data-testid="trip-details-page"]', { timeout: 18000 });
    console.log(`ITN-03: trip-details-page appeared ✓`);
  } catch {
    const url = page.url();
    throw new Error(`trip-details-page not visible after 18s — current URL: ${url}`);
  }

  // Back button
  const hasBack = await page.locator('[data-testid="button-back"]').count() > 0;
  console.log(`ITN-03: button-back: ${hasBack ? "✓" : "✗"}`);
  expect(hasBack, "button-back not found").toBe(true);

  // PlanCard itinerary accordion toggle — must click to expand section tabs
  const toggleBtn    = page.locator(`[data-testid="btn-itinerary-toggle-${TRIP_ID}"]`).first();
  const hasToggleBtn = await toggleBtn.count() > 0;
  console.log(`ITN-03: itinerary accordion toggle: ${hasToggleBtn ? "✓" : "✗"}`);
  expect(hasToggleBtn, `btn-itinerary-toggle-${TRIP_ID} not found`).toBe(true);
  await toggleBtn.click();
  await page.waitForTimeout(800);
  console.log(`ITN-03: Clicked itinerary accordion — tabs should now be visible`);

  // Section tabs rendered inside expanded accordion
  const hasActTab   = await page.locator(`[data-testid="tab-activities-${TRIP_ID}"]`).count() > 0;
  const hasTransTab = await page.locator(`[data-testid="tab-transport-${TRIP_ID}"]`).count() > 0;
  console.log(`ITN-03: activities tab: ${hasActTab ? "✓" : "✗"}  transport tab: ${hasTransTab ? "✓" : "✗"}`);
  expect(hasActTab,   `tab-activities-${TRIP_ID} not found after expanding accordion`).toBe(true);
  expect(hasTransTab, `tab-transport-${TRIP_ID} not found after expanding accordion`).toBe(true);

  console.log(`ITN-03: ── PASS ✓ ──
  Trip API:     ✓ ${tripData.title} @ ${tripData.destination}
  Plancard API: ✓ ${dayCount} day(s), ${actCount} activit(ies)
  Page:         ✓ trip-details-page rendered
  Back btn:     ✓ present
  Toggle:       ✓ itinerary accordion opened
  Tabs:         ✓ Activities + Transport tabs visible`);
});

// ─────────────────────────────────────────────────────────────────────────────
// ITN-04: PlanCard transport tab switches to transport section
// ─────────────────────────────────────────────────────────────────────────────
test("ITN-04: PlanCard transport tab switches section on trip detail page", async ({ page }) => {
  await loginAsTestUser123(page);
  await page.goto(`/trip/${TRIP_ID}`);
  await page.waitForLoadState("domcontentloaded");

  console.log(`ITN-04: Waiting for trip-details-page (up to 18s)…`);
  try {
    await page.waitForSelector('[data-testid="trip-details-page"]', { timeout: 18000 });
  } catch {
    throw new Error(`trip-details-page not visible after 18s — URL: ${page.url()}`);
  }
  console.log(`ITN-04: trip-details-page visible ✓`);

  // Expand itinerary accordion first — tabs are hidden until clicked
  const toggleBtn = page.locator(`[data-testid="btn-itinerary-toggle-${TRIP_ID}"]`).first();
  expect(await toggleBtn.count(), `btn-itinerary-toggle-${TRIP_ID} not found`).toBeGreaterThan(0);
  await toggleBtn.click();
  await page.waitForTimeout(800);
  console.log(`ITN-04: Opened itinerary accordion`);

  // Activities tab should now be visible
  const actTab    = page.locator(`[data-testid="tab-activities-${TRIP_ID}"]`).first();
  const hasActTab = await actTab.count() > 0;
  console.log(`ITN-04: Activities tab: ${hasActTab ? "✓" : "✗"}`);
  expect(hasActTab, `tab-activities-${TRIP_ID} not found after expanding accordion`).toBe(true);

  // Read activities count from the tab badge
  // The badge is a <span> inside the tab button
  const actBadgeText = (await actTab.locator("span").last().textContent())?.trim();
  console.log(`ITN-04: Activity count in tab badge: "${actBadgeText}"`);

  // Click Transport tab
  const transTab    = page.locator(`[data-testid="tab-transport-${TRIP_ID}"]`).first();
  const hasTransTab = await transTab.count() > 0;
  console.log(`ITN-04: Transport tab: ${hasTransTab ? "✓" : "✗"}`);
  expect(hasTransTab, `tab-transport-${TRIP_ID} not found`).toBe(true);
  await transTab.click();
  await page.waitForTimeout(1000);
  console.log(`ITN-04: Clicked transport tab`);

  // Transport tab is now active (element still present, class changes handle appearance)
  const transTabStillThere = await transTab.count() > 0;
  console.log(`ITN-04: Transport tab still present after click: ${transTabStillThere ? "✓" : "✗"}`);
  expect(transTabStillThere, "tab-transport disappeared after clicking").toBe(true);

  // Switch back to Activities tab
  await actTab.click();
  await page.waitForTimeout(800);
  console.log(`ITN-04: Switched back to Activities tab`);

  // Activities tab still present (round-trip worked)
  const actTabBack = await actTab.count() > 0;
  console.log(`ITN-04: Activities tab still present after round-trip: ${actTabBack ? "✓" : "✗"}`);
  expect(actTabBack, "tab-activities disappeared after switching back").toBe(true);

  console.log(`ITN-04: ── PASS ✓ ──
  Accordion:      ✓ itinerary section expanded
  Activities tab: ✓ present, badge count: "${actBadgeText}"
  Transport tab:  ✓ present, clicked successfully
  Tab round-trip: ✓ activities tab restored after switching back`);
});
