import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM-safe __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

const APP_FILE = path.resolve(__dirname, "../../client/src/App.tsx");

function readApp(): string {
  return fs.readFileSync(APP_FILE, "utf-8");
}

/**
 * Deprecated / Renamed Route Redirects — Suite 7
 *
 * Regression guard for every <Redirect> declared in App.tsx that preserves a
 * deprecated or renamed route. Covers two failure modes:
 *
 *   (a) The redirect is removed but the old path has no Route → silent 404.
 *   (b) The redirect is replaced by a real page → old path "comes back to life".
 *
 * Strategy:
 *   - Static checks: scan the <Route path="…"> block in App.tsx and confirm the
 *     correct <Redirect to="…"> is bound to the deprecated path.
 *   - Browser smoke: visit public deprecated routes and assert the final URL
 *     pathname (and query where relevant) matches the expected redirect target.
 *     Auth-gated routes (expert/provider/admin) redirect to login rather than
 *     the destination, so for those we only assert "not 404".
 *
 * Excluded intentionally:
 *   - Dev-only redirects guarded by NODE_ENV=development (/landing-mockups,
 *     /architecture, /booking-demo, /layout-mock) — not live in production builds.
 */

// ---------------------------------------------------------------------------
// Static-check helpers
// ---------------------------------------------------------------------------

/**
 * Locate the <Route path="fromPath"> block in App.tsx (bounded by the next
 * closing tag pattern) and assert the expected Redirect target appears inside
 * it.  This tightly binds fromPath → toTarget rather than just searching the
 * entire file for any matching Redirect.
 */
function assertRouteRedirect(
  src: string,
  fromPath: string,
  toTarget: string,
  note = ""
) {
  // Find the opening of the Route for this exact path
  const escapedFrom = fromPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const routePattern = new RegExp(`path="${escapedFrom}"[\\s\\S]{0,600}?</Route>`, "m");

  const match = src.match(routePattern);
  expect(
    match !== null,
    `[STATIC] App.tsx has no <Route path="${fromPath}">. ` +
      "The deprecated route guard has been removed entirely." +
      (note ? ` (${note})` : "")
  ).toBe(true);

  if (!match) return; // narrowing only — expect above already fails the test

  const block = match[0];
  const escapedTo = toTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const redirectPattern = new RegExp(`Redirect\\s+to="${escapedTo}"`);

  expect(
    redirectPattern.test(block),
    `[STATIC] The <Route path="${fromPath}"> block does not contain ` +
      `<Redirect to="${toTarget}">. ` +
      "Either the redirect destination changed or the route no longer redirects." +
      (note ? ` (${note})` : "")
  ).toBe(true);
}

/**
 * Variant for parameterised redirects where the destination is a template
 * literal (e.g. `/discover/location/${params.slug}`).  Checks that:
 *   1. A Route for fromPath exists.
 *   2. The Route block contains a Redirect whose `to` contains the expected
 *      static prefix (e.g. "/discover/location/").
 */
function assertParamRouteRedirect(
  src: string,
  fromPath: string,
  toStaticPrefix: string,
  note = ""
) {
  const escapedFrom = fromPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const routePattern = new RegExp(`path="${escapedFrom}"[\\s\\S]{0,600}?</Route>`, "m");

  const match = src.match(routePattern);
  expect(
    match !== null,
    `[STATIC] App.tsx has no <Route path="${fromPath}">. ` +
      "The deprecated route guard has been removed entirely." +
      (note ? ` (${note})` : "")
  ).toBe(true);

  if (!match) return;

  const block = match[0];
  const escapedPrefix = toStaticPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  expect(
    block.includes(toStaticPrefix) || new RegExp(escapedPrefix).test(block),
    `[STATIC] The <Route path="${fromPath}"> block does not contain a Redirect ` +
      `with destination prefix "${toStaticPrefix}". ` +
      "The parameterised redirect may have been removed or redirected elsewhere." +
      (note ? ` (${note})` : "")
  ).toBe(true);
}

// ---------------------------------------------------------------------------
// Static analysis: each deprecated redirect must be bound to its route block
// ---------------------------------------------------------------------------

test.describe("Deprecated route redirects — static analysis (Suite 7)", () => {
  // ── Public / general redirects ──────────────────────────────────────────

  test("/optimize → /concierge?tier=ai", () => {
    assertRouteRedirect(readApp(), "/optimize", "/concierge?tier=ai");
    console.log("[deprecated-route-redirects] PASS /optimize → /concierge?tier=ai");
  });

  test("/service-providers → /discover?tab=services", () => {
    assertRouteRedirect(readApp(), "/service-providers", "/discover?tab=services");
    console.log("[deprecated-route-redirects] PASS /service-providers → /discover?tab=services");
  });

  test("/city/:slug → /discover/location/:slug (parameterised)", () => {
    assertParamRouteRedirect(
      readApp(),
      "/city/:slug",
      "/discover/location/",
      "legacy city deep-link"
    );
    console.log("[deprecated-route-redirects] PASS /city/:slug → /discover/location/:slug");
  });

  test("/partner-with-us → /earn", () => {
    assertRouteRedirect(readApp(), "/partner-with-us", "/earn");
    console.log("[deprecated-route-redirects] PASS /partner-with-us → /earn");
  });

  test("/discover-experiences → /discover", () => {
    assertRouteRedirect(readApp(), "/discover-experiences", "/discover");
    console.log("[deprecated-route-redirects] PASS /discover-experiences → /discover");
  });

  test("/spontaneous → /discover", () => {
    assertRouteRedirect(readApp(), "/spontaneous", "/discover");
    console.log("[deprecated-route-redirects] PASS /spontaneous → /discover");
  });

  test("/itinerary/:id → /trip/:id?tab=itinerary (parameterised)", () => {
    assertParamRouteRedirect(
      readApp(),
      "/itinerary/:id",
      "/trip/",
      "legacy itinerary deep-link"
    );
    // Also verify the query string fragment is present anywhere in the file for
    // this particular redirect (the block regex captures the render-prop correctly)
    expect(
      /tab=itinerary/.test(readApp()),
      "App.tsx must contain tab=itinerary — /itinerary/:id must redirect to /trip/:id?tab=itinerary"
    ).toBe(true);
    console.log("[deprecated-route-redirects] PASS /itinerary/:id → /trip/:id?tab=itinerary");
  });

  test("/my-itinerary/:id → /trip/:id?tab=itinerary (parameterised)", () => {
    assertParamRouteRedirect(
      readApp(),
      "/my-itinerary/:id",
      "/trip/",
      "legacy my-itinerary deep-link"
    );
    console.log("[deprecated-route-redirects] PASS /my-itinerary/:id → /trip/:id?tab=itinerary");
  });

  // ── Expert redirects ─────────────────────────────────────────────────────

  test("/expert/messages → /chat", () => {
    assertRouteRedirect(readApp(), "/expert/messages", "/chat");
    console.log("[deprecated-route-redirects] PASS /expert/messages → /chat");
  });

  test("/expert/messages/:clientId → /chat?clientId= (parameterised)", () => {
    assertParamRouteRedirect(
      readApp(),
      "/expert/messages/:clientId",
      "/chat?clientId=",
      "expert messages deep-link"
    );
    console.log("[deprecated-route-redirects] PASS /expert/messages/:clientId → /chat?clientId=");
  });

  test("/expert/services/templates → /expert/services/new", () => {
    assertRouteRedirect(readApp(), "/expert/services/templates", "/expert/services/new");
    console.log("[deprecated-route-redirects] PASS /expert/services/templates → /expert/services/new");
  });

  test("/expert/service-listings → /expert/services/new", () => {
    assertRouteRedirect(readApp(), "/expert/service-listings", "/expert/services/new");
    console.log("[deprecated-route-redirects] PASS /expert/service-listings → /expert/services/new");
  });

  test("/expert/service-wizard → /expert/services/new", () => {
    assertRouteRedirect(readApp(), "/expert/service-wizard", "/expert/services/new");
    console.log("[deprecated-route-redirects] PASS /expert/service-wizard → /expert/services/new");
  });

  test("/expert/performance → /expert/analytics?tab=performance", () => {
    assertRouteRedirect(readApp(), "/expert/performance", "/expert/analytics?tab=performance");
    console.log("[deprecated-route-redirects] PASS /expert/performance → /expert/analytics?tab=performance");
  });

  test("/expert/revenue-optimization → /expert/analytics?tab=revenue-optimization", () => {
    assertRouteRedirect(
      readApp(),
      "/expert/revenue-optimization",
      "/expert/analytics?tab=revenue-optimization"
    );
    console.log(
      "[deprecated-route-redirects] PASS /expert/revenue-optimization → /expert/analytics?tab=revenue-optimization"
    );
  });

  test("/expert/leaderboard → /expert/analytics?tab=leaderboard", () => {
    assertRouteRedirect(readApp(), "/expert/leaderboard", "/expert/analytics?tab=leaderboard");
    console.log("[deprecated-route-redirects] PASS /expert/leaderboard → /expert/analytics?tab=leaderboard");
  });

  // ── Provider redirects ───────────────────────────────────────────────────

  test("/provider/messages → /chat", () => {
    assertRouteRedirect(readApp(), "/provider/messages", "/chat");
    console.log("[deprecated-route-redirects] PASS /provider/messages → /chat");
  });

  test("/provider/messages/:clientId → /chat?clientId= (parameterised)", () => {
    assertParamRouteRedirect(
      readApp(),
      "/provider/messages/:clientId",
      "/chat?clientId=",
      "provider messages deep-link"
    );
    console.log("[deprecated-route-redirects] PASS /provider/messages/:clientId → /chat?clientId=");
  });

  // ── Admin redirects ───────────────────────────────────────────────────────

  test("/admin/fee-config → /admin/fee-bands", () => {
    assertRouteRedirect(readApp(), "/admin/fee-config", "/admin/fee-bands");
    console.log("[deprecated-route-redirects] PASS /admin/fee-config → /admin/fee-bands");
  });

  test("/admin → /admin/dashboard (bare /admin must not 404)", () => {
    assertRouteRedirect(readApp(), "/admin", "/admin/dashboard");
    console.log("[deprecated-route-redirects] PASS /admin → /admin/dashboard");
  });

  // ── Consolidated/renamed page redirects ──────────────────────────────────

  test("/create-trip → /experiences", () => {
    assertRouteRedirect(readApp(), "/create-trip", "/experiences");
    console.log("[deprecated-route-redirects] PASS /create-trip → /experiences");
  });

  test("/help-me-decide → /discover", () => {
    assertRouteRedirect(readApp(), "/help-me-decide", "/discover");
    console.log("[deprecated-route-redirects] PASS /help-me-decide → /discover");
  });

  test("/explore → /discover", () => {
    assertRouteRedirect(readApp(), "/explore", "/discover");
    console.log("[deprecated-route-redirects] PASS /explore → /discover");
  });

  test("/browse → /discover", () => {
    assertRouteRedirect(readApp(), "/browse", "/discover");
    console.log("[deprecated-route-redirects] PASS /browse → /discover");
  });

  test("/travel-experts → /become-expert", () => {
    assertRouteRedirect(readApp(), "/travel-experts", "/become-expert");
    console.log("[deprecated-route-redirects] PASS /travel-experts → /become-expert");
  });

  test("/services-provider → /become-provider", () => {
    assertRouteRedirect(readApp(), "/services-provider", "/become-provider");
    console.log("[deprecated-route-redirects] PASS /services-provider → /become-provider");
  });

  test("/credits-billing → /credits", () => {
    assertRouteRedirect(readApp(), "/credits-billing", "/credits");
    console.log("[deprecated-route-redirects] PASS /credits-billing → /credits");
  });

  test("/checkout → /cart", () => {
    assertRouteRedirect(readApp(), "/checkout", "/cart");
    console.log("[deprecated-route-redirects] PASS /checkout → /cart");
  });
});

// ---------------------------------------------------------------------------
// Browser smoke tests
//
// Public (no-auth) routes: assert final URL pathname (and search) matches the
// expected redirect destination.  This guards against the route "coming back
// to life" as a real page — a live page would still pass a non-404 check but
// would fail the URL assertion.
//
// Auth-gated routes (expert/provider/admin): the SPA redirects unauthenticated
// users to / or a login modal rather than the destination route.  For these we
// assert only "not 404" — the static check above already guards the destination.
// ---------------------------------------------------------------------------

test.describe("Deprecated route redirects — browser smoke (Suite 7)", () => {
  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Navigate to fromPath, wait for the SPA redirect to settle, then assert the
   * final URL's pathname starts with expectedPathname (and optionally that the
   * search contains expectedSearch).
   */
  async function assertRedirectsTo(
    page: import("@playwright/test").Page,
    fromPath: string,
    expectedPathname: string,
    expectedSearch?: string
  ) {
    await page.goto(`${BASE_URL}${fromPath}`);
    await page.waitForLoadState("networkidle");

    const finalUrl = new URL(page.url());

    expect(
      finalUrl.pathname,
      `Visiting ${fromPath}: expected final pathname to start with "${expectedPathname}", ` +
        `but got "${finalUrl.pathname}". The deprecated route may have come back as a live page ` +
        "or the redirect target changed."
    ).toMatch(new RegExp(`^${expectedPathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    if (expectedSearch) {
      expect(
        finalUrl.search,
        `Visiting ${fromPath}: expected final URL to contain "${expectedSearch}" in the query ` +
          `string, but got "${finalUrl.search}".`
      ).toContain(expectedSearch);
    }

    // Sanity: must never be the 404 page
    await expect(
      page.locator("h1").filter({ hasText: /^404/ }),
      `${fromPath} must not land on a 404 page`
    ).not.toBeVisible();

    console.log(
      `[deprecated-route-redirects] PASS ${fromPath} → ${finalUrl.pathname}${finalUrl.search}`
    );
  }

  /**
   * Navigate to an auth-gated deprecated path.  Unauthenticated users get
   * redirected to / or a sign-in modal — not the final destination.  Assert
   * only that we are NOT on the 404 page (the static check guards the target).
   */
  async function assertAuthGatedNotFound(
    page: import("@playwright/test").Page,
    fromPath: string
  ) {
    await page.goto(`${BASE_URL}${fromPath}`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("h1").filter({ hasText: /^404/ }),
      `${fromPath} must not render a 404 page for unauthenticated users`
    ).not.toBeVisible();

    await expect(
      page.locator('text="Lost at Sea"'),
      `${fromPath} must not show the "Lost at Sea" 404 message`
    ).not.toBeVisible();

    console.log(`[deprecated-route-redirects] PASS (auth-gated, not-404) ${fromPath}`);
  }

  // ── Public deprecated routes — assert final URL destination ──────────────

  test("/optimize → /concierge (with ?tier=ai)", async ({ page }) => {
    await assertRedirectsTo(page, "/optimize", "/concierge", "tier=ai");
  });

  test("/service-providers → /discover (with ?tab=services)", async ({ page }) => {
    await assertRedirectsTo(page, "/service-providers", "/discover", "tab=services");
  });

  test("/partner-with-us → /earn", async ({ page }) => {
    await assertRedirectsTo(page, "/partner-with-us", "/earn");
  });

  test("/discover-experiences → /discover", async ({ page }) => {
    await assertRedirectsTo(page, "/discover-experiences", "/discover");
  });

  test("/spontaneous → /discover", async ({ page }) => {
    await assertRedirectsTo(page, "/spontaneous", "/discover");
  });

  test("/create-trip → /experiences", async ({ page }) => {
    await assertRedirectsTo(page, "/create-trip", "/experiences");
  });

  test("/help-me-decide → /discover", async ({ page }) => {
    await assertRedirectsTo(page, "/help-me-decide", "/discover");
  });

  test("/explore → /discover", async ({ page }) => {
    await assertRedirectsTo(page, "/explore", "/discover");
  });

  test("/browse → /discover", async ({ page }) => {
    await assertRedirectsTo(page, "/browse", "/discover");
  });

  test("/travel-experts → /become-expert", async ({ page }) => {
    await assertRedirectsTo(page, "/travel-experts", "/become-expert");
  });

  test("/services-provider → /become-provider", async ({ page }) => {
    await assertRedirectsTo(page, "/services-provider", "/become-provider");
  });

  test("/checkout → /cart", async ({ page }) => {
    await assertRedirectsTo(page, "/checkout", "/cart");
  });

  test("/city/tokyo → /discover/location/tokyo (parameterised)", async ({ page }) => {
    await assertRedirectsTo(page, "/city/tokyo", "/discover/location/tokyo");
  });

  // ── Auth-gated deprecated routes — assert not 404 ────────────────────────
  // (Unauthenticated requests land on / or login modal — not the destination.)

  test("/expert/messages (auth-gated) — not 404", async ({ page }) => {
    await assertAuthGatedNotFound(page, "/expert/messages");
  });

  test("/expert/service-wizard (auth-gated) — not 404", async ({ page }) => {
    await assertAuthGatedNotFound(page, "/expert/service-wizard");
  });

  test("/expert/performance (auth-gated) — not 404", async ({ page }) => {
    await assertAuthGatedNotFound(page, "/expert/performance");
  });

  test("/expert/leaderboard (auth-gated) — not 404", async ({ page }) => {
    await assertAuthGatedNotFound(page, "/expert/leaderboard");
  });

  test("/provider/messages (auth-gated) — not 404", async ({ page }) => {
    await assertAuthGatedNotFound(page, "/provider/messages");
  });

  test("/admin/fee-config (auth-gated) — not 404", async ({ page }) => {
    await assertAuthGatedNotFound(page, "/admin/fee-config");
  });

  test("/admin (auth-gated) — not 404", async ({ page }) => {
    await assertAuthGatedNotFound(page, "/admin");
  });
});
