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
 * deprecated or renamed route.  If a future refactor removes a redirect *without*
 * wiring a proper Route for the old path, old bookmarks/links silently 404.
 *
 * Strategy:
 *   - Static checks (no browser needed): confirm each redirect still appears in
 *     App.tsx with the correct destination.
 *   - Browser smoke tests: visit a representative set of non-auth-required
 *     deprecated routes and confirm the browser lands on the redirect target,
 *     not the 404 "Lost at Sea" page.
 *
 * Excluded from this spec:
 *   - Dev-only redirects guarded by `process.env.NODE_ENV === "development"`
 *     (/landing-mockups, /architecture, /booking-demo, /layout-mock) — they are
 *     intentionally not live in production builds.
 *   - /admin/fee-config → /admin/fee-bands is covered by a dedicated existing spec.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertRedirectPresent(
  src: string,
  fromPath: string,
  toTarget: string,
  description: string
) {
  // Escape special regex characters in the toTarget string for matching
  const escapedTarget = toTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`Redirect\\s+to="${escapedTarget}"`);
  expect(
    pattern.test(src),
    `[MISSING REDIRECT] ${description}: expected App.tsx to contain ` +
      `<Redirect to="${toTarget}"> for the deprecated path "${fromPath}". ` +
      "If the route was intentionally removed, add a proper <Route> for the " +
      "old path or update this test."
  ).toBe(true);
}

function assertRoutePresent(src: string, routePath: string) {
  const escapedPath = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`path="${escapedPath}"`);
  expect(
    pattern.test(src),
    `App.tsx is missing <Route path="${routePath}"> — the deprecated route ` +
      "guard has been lost."
  ).toBe(true);
}

// ---------------------------------------------------------------------------
// Static analysis: every deprecated redirect must still be in App.tsx
// ---------------------------------------------------------------------------

test.describe("Deprecated route redirects — static analysis (Suite 7)", () => {
  // ── Public / general redirects ──────────────────────────────────────────

  test("/optimize → /concierge?tier=ai", () => {
    const src = readApp();
    assertRoutePresent(src, "/optimize");
    assertRedirectPresent(
      src,
      "/optimize",
      "/concierge?tier=ai",
      "/optimize (old AI itinerary entry) must redirect to /concierge?tier=ai"
    );
    console.log("[deprecated-route-redirects] PASS /optimize → /concierge?tier=ai");
  });

  test("/service-providers → /discover?tab=services", () => {
    const src = readApp();
    assertRoutePresent(src, "/service-providers");
    assertRedirectPresent(
      src,
      "/service-providers",
      "/discover?tab=services",
      "/service-providers must redirect to /discover?tab=services"
    );
    console.log(
      "[deprecated-route-redirects] PASS /service-providers → /discover?tab=services"
    );
  });

  test("/city/:slug → /discover/location/:slug (parameterised redirect)", () => {
    const src = readApp();
    assertRoutePresent(src, "/city/:slug");
    // The redirect uses a render-prop: `<Redirect to={\`/discover/location/${params.slug}\`} />`
    expect(
      /path="\/city\/:slug"/.test(src) &&
        /discover\/location\/\$\{/.test(src),
      'App.tsx must contain path="/city/:slug" with a parameterised Redirect to /discover/location/:slug'
    ).toBe(true);
    console.log(
      "[deprecated-route-redirects] PASS /city/:slug → /discover/location/:slug"
    );
  });

  test("/partner-with-us → /earn", () => {
    const src = readApp();
    assertRoutePresent(src, "/partner-with-us");
    assertRedirectPresent(
      src,
      "/partner-with-us",
      "/earn",
      "/partner-with-us must redirect to /earn"
    );
    console.log("[deprecated-route-redirects] PASS /partner-with-us → /earn");
  });

  test("/discover-experiences → /discover", () => {
    const src = readApp();
    assertRoutePresent(src, "/discover-experiences");
    assertRedirectPresent(
      src,
      "/discover-experiences",
      "/discover",
      "/discover-experiences must redirect to /discover"
    );
    console.log(
      "[deprecated-route-redirects] PASS /discover-experiences → /discover"
    );
  });

  test("/spontaneous → /discover", () => {
    const src = readApp();
    assertRoutePresent(src, "/spontaneous");
    assertRedirectPresent(
      src,
      "/spontaneous",
      "/discover",
      "/spontaneous must redirect to /discover"
    );
    console.log("[deprecated-route-redirects] PASS /spontaneous → /discover");
  });

  test("/itinerary/:id → /trip/:id?tab=itinerary (parameterised redirect)", () => {
    const src = readApp();
    assertRoutePresent(src, "/itinerary/:id");
    expect(
      /path="\/itinerary\/:id"/.test(src) &&
        /\/trip\/\$\{.*\}\?tab=itinerary/.test(src),
      'App.tsx must contain path="/itinerary/:id" with a parameterised Redirect to /trip/:id?tab=itinerary'
    ).toBe(true);
    console.log(
      "[deprecated-route-redirects] PASS /itinerary/:id → /trip/:id?tab=itinerary"
    );
  });

  test("/my-itinerary/:id → /trip/:id?tab=itinerary (parameterised redirect)", () => {
    const src = readApp();
    assertRoutePresent(src, "/my-itinerary/:id");
    expect(
      /path="\/my-itinerary\/:id"/.test(src),
      'App.tsx must contain path="/my-itinerary/:id" — the legacy deep-link redirect has been removed.'
    ).toBe(true);
    console.log(
      "[deprecated-route-redirects] PASS /my-itinerary/:id retained in App.tsx"
    );
  });

  // ── Expert redirects ─────────────────────────────────────────────────────

  test("/expert/messages → /chat", () => {
    const src = readApp();
    assertRoutePresent(src, "/expert/messages");
    assertRedirectPresent(
      src,
      "/expert/messages",
      "/chat",
      "/expert/messages must redirect to /chat"
    );
    console.log("[deprecated-route-redirects] PASS /expert/messages → /chat");
  });

  test("/expert/messages/:clientId → /chat (parameterised)", () => {
    const src = readApp();
    assertRoutePresent(src, "/expert/messages/:clientId");
    expect(
      /path="\/expert\/messages\/:clientId"/.test(src) &&
        /chat\?clientId=\$\{/.test(src),
      'App.tsx must contain path="/expert/messages/:clientId" with parameterised Redirect to /chat?clientId='
    ).toBe(true);
    console.log(
      "[deprecated-route-redirects] PASS /expert/messages/:clientId → /chat?clientId="
    );
  });

  test("/expert/services/templates → /expert/services/new", () => {
    const src = readApp();
    assertRoutePresent(src, "/expert/services/templates");
    assertRedirectPresent(
      src,
      "/expert/services/templates",
      "/expert/services/new",
      "/expert/services/templates must redirect to /expert/services/new"
    );
    console.log(
      "[deprecated-route-redirects] PASS /expert/services/templates → /expert/services/new"
    );
  });

  test("/expert/service-listings → /expert/services/new", () => {
    const src = readApp();
    assertRoutePresent(src, "/expert/service-listings");
    assertRedirectPresent(
      src,
      "/expert/service-listings",
      "/expert/services/new",
      "/expert/service-listings must redirect to /expert/services/new"
    );
    console.log(
      "[deprecated-route-redirects] PASS /expert/service-listings → /expert/services/new"
    );
  });

  test("/expert/service-wizard → /expert/services/new", () => {
    const src = readApp();
    assertRoutePresent(src, "/expert/service-wizard");
    assertRedirectPresent(
      src,
      "/expert/service-wizard",
      "/expert/services/new",
      "/expert/service-wizard must redirect to /expert/services/new"
    );
    console.log(
      "[deprecated-route-redirects] PASS /expert/service-wizard → /expert/services/new"
    );
  });

  test("/expert/performance → /expert/analytics?tab=performance", () => {
    const src = readApp();
    assertRoutePresent(src, "/expert/performance");
    assertRedirectPresent(
      src,
      "/expert/performance",
      "/expert/analytics?tab=performance",
      "/expert/performance must redirect to /expert/analytics?tab=performance"
    );
    console.log(
      "[deprecated-route-redirects] PASS /expert/performance → /expert/analytics?tab=performance"
    );
  });

  test(
    "/expert/revenue-optimization → /expert/analytics?tab=revenue-optimization",
    () => {
      const src = readApp();
      assertRoutePresent(src, "/expert/revenue-optimization");
      assertRedirectPresent(
        src,
        "/expert/revenue-optimization",
        "/expert/analytics?tab=revenue-optimization",
        "/expert/revenue-optimization must redirect to /expert/analytics?tab=revenue-optimization"
      );
      console.log(
        "[deprecated-route-redirects] PASS /expert/revenue-optimization → /expert/analytics?tab=revenue-optimization"
      );
    }
  );

  test("/expert/leaderboard → /expert/analytics?tab=leaderboard", () => {
    const src = readApp();
    assertRoutePresent(src, "/expert/leaderboard");
    assertRedirectPresent(
      src,
      "/expert/leaderboard",
      "/expert/analytics?tab=leaderboard",
      "/expert/leaderboard must redirect to /expert/analytics?tab=leaderboard"
    );
    console.log(
      "[deprecated-route-redirects] PASS /expert/leaderboard → /expert/analytics?tab=leaderboard"
    );
  });

  // ── Provider redirects ───────────────────────────────────────────────────

  test("/provider/messages → /chat", () => {
    const src = readApp();
    assertRoutePresent(src, "/provider/messages");
    assertRedirectPresent(
      src,
      "/provider/messages",
      "/chat",
      "/provider/messages must redirect to /chat"
    );
    console.log("[deprecated-route-redirects] PASS /provider/messages → /chat");
  });

  test("/provider/messages/:clientId → /chat (parameterised)", () => {
    const src = readApp();
    assertRoutePresent(src, "/provider/messages/:clientId");
    expect(
      /path="\/provider\/messages\/:clientId"/.test(src) &&
        /chat\?clientId=\$\{/.test(src),
      'App.tsx must contain path="/provider/messages/:clientId" with parameterised Redirect to /chat?clientId='
    ).toBe(true);
    console.log(
      "[deprecated-route-redirects] PASS /provider/messages/:clientId → /chat?clientId="
    );
  });

  // ── Admin redirect ───────────────────────────────────────────────────────

  test('/admin → /admin/dashboard (bare /admin must not 404)', () => {
    const src = readApp();
    // Use a narrow pattern: standalone path="/admin" (not /admin/something)
    expect(
      /path="\/admin"/.test(src),
      'App.tsx must contain path="/admin" with a Redirect to /admin/dashboard'
    ).toBe(true);
    assertRedirectPresent(
      src,
      "/admin",
      "/admin/dashboard",
      "/admin must redirect to /admin/dashboard"
    );
    console.log(
      "[deprecated-route-redirects] PASS /admin → /admin/dashboard"
    );
  });

  // ── Consolidated/renamed page redirects ──────────────────────────────────

  test("/create-trip → /experiences", () => {
    const src = readApp();
    assertRoutePresent(src, "/create-trip");
    assertRedirectPresent(
      src,
      "/create-trip",
      "/experiences",
      "/create-trip must redirect to /experiences"
    );
    console.log("[deprecated-route-redirects] PASS /create-trip → /experiences");
  });

  test("/help-me-decide → /discover", () => {
    const src = readApp();
    assertRoutePresent(src, "/help-me-decide");
    assertRedirectPresent(
      src,
      "/help-me-decide",
      "/discover",
      "/help-me-decide must redirect to /discover"
    );
    console.log("[deprecated-route-redirects] PASS /help-me-decide → /discover");
  });

  test("/explore → /discover", () => {
    const src = readApp();
    assertRoutePresent(src, "/explore");
    assertRedirectPresent(src, "/explore", "/discover", "/explore must redirect to /discover");
    console.log("[deprecated-route-redirects] PASS /explore → /discover");
  });

  test("/browse → /discover", () => {
    const src = readApp();
    assertRoutePresent(src, "/browse");
    assertRedirectPresent(src, "/browse", "/discover", "/browse must redirect to /discover");
    console.log("[deprecated-route-redirects] PASS /browse → /discover");
  });

  test("/travel-experts → /become-expert", () => {
    const src = readApp();
    assertRoutePresent(src, "/travel-experts");
    assertRedirectPresent(
      src,
      "/travel-experts",
      "/become-expert",
      "/travel-experts must redirect to /become-expert"
    );
    console.log(
      "[deprecated-route-redirects] PASS /travel-experts → /become-expert"
    );
  });

  test("/services-provider → /become-provider", () => {
    const src = readApp();
    assertRoutePresent(src, "/services-provider");
    assertRedirectPresent(
      src,
      "/services-provider",
      "/become-provider",
      "/services-provider must redirect to /become-provider"
    );
    console.log(
      "[deprecated-route-redirects] PASS /services-provider → /become-provider"
    );
  });

  test("/credits-billing → /credits", () => {
    const src = readApp();
    assertRoutePresent(src, "/credits-billing");
    assertRedirectPresent(
      src,
      "/credits-billing",
      "/credits",
      "/credits-billing must redirect to /credits"
    );
    console.log(
      "[deprecated-route-redirects] PASS /credits-billing → /credits"
    );
  });

  test("/checkout → /cart", () => {
    const src = readApp();
    assertRoutePresent(src, "/checkout");
    assertRedirectPresent(src, "/checkout", "/cart", "/checkout must redirect to /cart");
    console.log("[deprecated-route-redirects] PASS /checkout → /cart");
  });
});

// ---------------------------------------------------------------------------
// Browser smoke tests — a representative sample of public deprecated routes
// (Auth-required routes redirect to / or /login rather than 404, which is
//  acceptable; we only need to confirm they don't land on the 404 page.)
// ---------------------------------------------------------------------------

test.describe("Deprecated route redirects — browser smoke (Suite 7)", () => {
  async function visitAndCheckNot404(
    page: import("@playwright/test").Page,
    fromPath: string,
    label: string
  ) {
    await page.goto(`${BASE_URL}${fromPath}`);
    await page.waitForLoadState("networkidle");

    // The 404 page has an h1 starting with "404" or visible "Lost at Sea" text
    await expect(
      page.locator("h1").filter({ hasText: /^404/ }),
      `${label}: browser must NOT land on a 404 page when visiting ${fromPath}`
    ).not.toBeVisible();

    await expect(
      page.locator('text="Lost at Sea"'),
      `${label}: browser must NOT show the "Lost at Sea" 404 message`
    ).not.toBeVisible();

    const finalUrl = new URL(page.url());
    console.log(
      `[deprecated-route-redirects] PASS ${fromPath} → ${finalUrl.pathname}${finalUrl.search}`
    );
  }

  test("/optimize redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/optimize", "/optimize");
  });

  test("/service-providers redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/service-providers", "/service-providers");
  });

  test("/partner-with-us redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/partner-with-us", "/partner-with-us");
  });

  test("/discover-experiences redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(
      page,
      "/discover-experiences",
      "/discover-experiences"
    );
  });

  test("/spontaneous redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/spontaneous", "/spontaneous");
  });

  test("/create-trip redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/create-trip", "/create-trip");
  });

  test("/help-me-decide redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/help-me-decide", "/help-me-decide");
  });

  test("/explore redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/explore", "/explore");
  });

  test("/browse redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/browse", "/browse");
  });

  test("/travel-experts redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/travel-experts", "/travel-experts");
  });

  test("/services-provider redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/services-provider", "/services-provider");
  });

  test("/checkout redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/checkout", "/checkout");
  });

  test("/admin redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/admin", "/admin");
  });

  test("/expert/messages redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/expert/messages", "/expert/messages");
  });

  test("/expert/service-wizard redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(
      page,
      "/expert/service-wizard",
      "/expert/service-wizard"
    );
  });

  test("/expert/performance redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/expert/performance", "/expert/performance");
  });

  test("/expert/leaderboard redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/expert/leaderboard", "/expert/leaderboard");
  });

  test("/provider/messages redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/provider/messages", "/provider/messages");
  });

  test("/city/tokyo redirects away without 404", async ({ page }) => {
    await visitAndCheckNot404(page, "/city/tokyo", "/city/:slug");
  });
});
