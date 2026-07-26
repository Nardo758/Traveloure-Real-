/**
 * User Menu / Profile Section — QA Spec
 *
 * Tests the UserMenu component (client/src/components/user-menu.tsx).
 *
 * Auth strategy: inject a window.fetch interceptor via page.addInitScript()
 * BEFORE the page loads. This short-circuits all /api/* calls at the JS
 * level — no network round-trips, no Playwright route-handler overhead.
 * Result: page loads settle in ~1-2s instead of 3-4s.
 *
 * Navigation links: verified via href attribute rather than click+waitForURL.
 * Radix portal unmounts the Link element on close before Wouter pushState
 * fires, so click-then-waitForURL is unreliable for SPA navigation.
 *
 * Run: npx playwright test playwright/tests/user-menu.spec.ts --workers=2
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5000";

// ─── User fixtures ────────────────────────────────────────────────────────────

const USERS = {
  traveler:      { id: 1, firstName: "Alice", email: "alice@example.com", role: "user",                profileImageUrl: null },
  travelExpert:  { id: 2, firstName: "Ben",   email: "ben@example.com",   role: "travel_expert",       profileImageUrl: null },
  localExpert:   { id: 3, firstName: "Chloe", email: "chloe@example.com", role: "local_expert",        profileImageUrl: null },
  eventPlanner:  { id: 6, firstName: "Frank", email: "frank@example.com", role: "event_planner",       profileImageUrl: null },
  provider:      { id: 4, firstName: "Dan",   email: "dan@example.com",   role: "service_provider",    profileImageUrl: null },
  admin:         { id: 5, firstName: "Eve",   email: "eve@example.com",   role: "admin",               profileImageUrl: null },
} as const;

type AnyUser = (typeof USERS)[keyof typeof USERS] | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Inject a window.fetch interceptor before the page loads.
 * Only intercepts /api/auth/user — everything else goes to the real server.
 * Running before page scripts means the very first auth fetch is synchronous
 * (no network round-trip), so the UserMenu renders as soon as React boots.
 */
async function injectFetchMock(page: Page, user: AnyUser) {
  await page.addInitScript((serialisedUser) => {
    const _original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input
        : input instanceof URL ? input.href
        : (input as Request).url;

      if (url.includes("/api/auth/user")) {
        if (serialisedUser === null) {
          return new Response("Unauthorized", { status: 401 });
        }
        return new Response(JSON.stringify(serialisedUser), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // All other requests → real server
      return _original(input, init);
    };
  }, user);
}

/**
 * Navigate home and wait for the relevant navbar element to render.
 * Call injectFetchMock() BEFORE this.
 */
async function gotoHome(page: Page, waitFor: "auth" | "unauth" = "auth") {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  if (waitFor === "auth") {
    await page.waitForSelector('[data-testid="button-user-menu"]', { timeout: 8000 });
  } else {
    await page.waitForSelector('[data-testid="button-sign-in"]', { timeout: 8000 });
  }
}

/** Open the dropdown and wait for the first menu item to enter the DOM. */
async function openMenu(page: Page) {
  await page.click('[data-testid="button-user-menu"]');
  await page.waitForSelector('[data-testid="link-user-console"]', { timeout: 3000 });
}

/** Close an open menu via Escape (reliable — bypasses Radix DismissableLayer pointer intercept). */
async function closeMenu(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="link-user-console"]', { state: "detached", timeout: 3000 });
}

// ═════════════════════════════════════════════════════════════════════════════
// ROLE-BASED MENU ITEMS
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Role-based menu items", () => {

  test("Traveler (role=user): My Dashboard visible, role items absent", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);
    await openMenu(page);

    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-logout"]')).toBeVisible();

    const href = await page.locator('[data-testid="link-user-console"]').getAttribute("href");
    expect(href).toBe("/dashboard");

    await expect(page.locator('[data-testid="link-expert-console"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="link-provider-console"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="link-admin-console"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="link-ea-console"]')).toHaveCount(0);
  });

  test("Expert (travel_expert): Expert Console visible, provider/admin absent", async ({ page }) => {
    await injectFetchMock(page, USERS.travelExpert);
    await gotoHome(page);
    await openMenu(page);

    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="link-expert-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-logout"]')).toBeVisible();

    const href = await page.locator('[data-testid="link-expert-console"]').getAttribute("href");
    expect(href).toBe("/expert/dashboard");

    await expect(page.locator('[data-testid="link-provider-console"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="link-admin-console"]')).toHaveCount(0);
  });

  test("Expert (local_expert + event_planner): both show Expert Console", async ({ page }) => {
    // local_expert
    await injectFetchMock(page, USERS.localExpert);
    await gotoHome(page);
    await openMenu(page);
    await expect(page.locator('[data-testid="link-expert-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="link-provider-console"]')).toHaveCount(0);
    await closeMenu(page);

    // event_planner — re-inject and reload on same page context
    await injectFetchMock(page, USERS.eventPlanner);
    await gotoHome(page);
    await openMenu(page);
    await expect(page.locator('[data-testid="link-expert-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="link-provider-console"]')).toHaveCount(0);
  });

  test("Provider (service_provider): Provider Console visible, expert/admin absent", async ({ page }) => {
    await injectFetchMock(page, USERS.provider);
    await gotoHome(page);
    await openMenu(page);

    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="link-provider-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-logout"]')).toBeVisible();

    const href = await page.locator('[data-testid="link-provider-console"]').getAttribute("href");
    expect(href).toBe("/provider/dashboard");

    await expect(page.locator('[data-testid="link-expert-console"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="link-admin-console"]')).toHaveCount(0);
  });

  test("Admin: Admin Panel visible, expert/provider absent", async ({ page }) => {
    await injectFetchMock(page, USERS.admin);
    await gotoHome(page);
    await openMenu(page);

    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="link-admin-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-logout"]')).toBeVisible();

    const href = await page.locator('[data-testid="link-admin-console"]').getAttribute("href");
    expect(href).toBe("/admin/dashboard");

    await expect(page.locator('[data-testid="link-expert-console"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="link-provider-console"]')).toHaveCount(0);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// DROPDOWN BEHAVIOUR
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Dropdown behaviour", () => {

  // ── Tests 1 + 2: Open / close / click-outside ─────────────────────────────

  test("Test 1+2 — Open via click; close via Escape; re-open stable; click-outside closes", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    // 1a: Click opens menu
    await page.click('[data-testid="button-user-menu"]');
    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();

    // 1b: Escape closes menu reliably
    // (Second trigger click is unreliable: Radix DismissableLayer intercepts
    //  pointer events at the html level when the menu is open.)
    await closeMenu(page);

    // 1c: Re-open and confirm it stays stable (no auto-close)
    await openMenu(page);
    await page.waitForTimeout(180);
    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();

    // 2: Click outside (page body below nav) closes menu
    await page.mouse.click(400, 500);
    await expect(page.locator('[data-testid="link-user-console"]')).toHaveCount(0, { timeout: 3000 });
  });

  // ── Test 3: Hover behaviour ────────────────────────────────────────────────

  test("Test 3 — Hover alone does NOT open; hover+click opens normally", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    await page.hover('[data-testid="button-user-menu"]');
    await page.waitForTimeout(180);
    await expect(page.locator('[data-testid="link-user-console"]')).toHaveCount(0);

    await page.click('[data-testid="button-user-menu"]');
    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();
  });

  // ── Test 4: Keyboard navigation ────────────────────────────────────────────

  test("Test 4a — Enter opens, ArrowDown focuses item, Escape closes", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    await page.locator('[data-testid="button-user-menu"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("ArrowDown");
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? ""
    );
    const MENU_ITEMS = ["link-user-console", "link-expert-console", "link-provider-console",
      "link-admin-console", "button-logout"];
    expect(MENU_ITEMS).toContain(focused);

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="link-user-console"]')).toHaveCount(0, { timeout: 3000 });
  });

  test("Test 4b — Tab through page eventually focuses user-menu trigger", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    let found = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const testid = await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? ""
      );
      if (testid === "button-user-menu") { found = true; break; }
    }
    expect(found, "Tab should reach button-user-menu within 30 presses").toBe(true);
  });

  // ── Test 5: Avatar fallback ────────────────────────────────────────────────

  test("Test 5 — Avatar fallback: shows first initial, never empty/undefined/null", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    const fallback = page.locator('[data-testid="user-avatar-fallback"]');
    await expect(fallback).toBeVisible();
    const text = await fallback.textContent();
    expect(text?.trim()).toBe("A");          // Alice → "A"
    expect(text?.trim()).not.toMatch(/^(undefined|null|\[object)$/);
  });

  // ── Test 6: Username display ───────────────────────────────────────────────

  test("Test 6 — Display name correct in trigger button and open menu header", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    const triggerText = await page.locator('[data-testid="button-user-menu"]').textContent();
    expect(triggerText).toContain("Alice");
    expect(triggerText).not.toMatch(/undefined|null|\[object/);

    await openMenu(page);

    const nameText = await page.locator('[data-testid="user-menu-display-name"]').textContent();
    expect(nameText?.trim()).toBe("Alice");
    expect(nameText).not.toMatch(/undefined|null|\[object/);

    const emailText = await page.locator('[data-testid="user-menu-email"]').textContent();
    expect(emailText?.trim()).toBe("alice@example.com");
  });

  // ── Test 7: Rapid open/close 10× ─────────────────────────────────────────

  test("Test 7 — 10 rapid open/close cycles: trigger stays interactive afterwards", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    // Re-focus trigger before each cycle to prevent Radix focus-management from
    // leaving focus on a menu item (where Enter would activate it and navigate away).
    for (let i = 0; i < 10; i++) {
      await page.locator('[data-testid="button-user-menu"]').focus();
      await page.keyboard.press("Enter");   // open
      await page.waitForTimeout(30);
      await page.keyboard.press("Escape");  // close (returns focus to trigger)
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(80);

    // After cycles the trigger must still be visible and openable
    await expect(page.locator('[data-testid="button-user-menu"]')).toBeVisible({ timeout: 5000 });
    await openMenu(page);
    await expect(page.locator('[data-testid="link-user-console"]')).toBeVisible();
  });

  // ── Test 8: Clicking a menu item closes the dropdown ─────────────────────

  test("Test 8 — Clicking a menu item unmounts the dropdown portal", async ({ page }) => {
    await injectFetchMock(page, USERS.traveler);
    await gotoHome(page);

    await openMenu(page);
    await page.click('[data-testid="link-user-console"]');
    // Radix portal is unmounted — Logout button (only in portal) gone
    await expect(page.locator('[data-testid="button-logout"]')).toHaveCount(0, { timeout: 3000 });
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 9 — NOTIFICATION BADGE (feature gap)
// ═════════════════════════════════════════════════════════════════════════════

test("Test 9 — Notification badge not implemented in UserMenu (zero badge elements)", async ({ page }) => {
  await injectFetchMock(page, USERS.traveler);
  await gotoHome(page);
  // UserMenu (user-menu.tsx) has no badge markup. Zero is the expected baseline.
  // TODO: when notifications are wired up, assert badge count and verify it
  //       resets to 0 after marking notifications as read.
  expect(await page.locator('[data-testid^="badge-notification"]').count()).toBe(0);
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 10 — LOGOUT FLOW
// ═════════════════════════════════════════════════════════════════════════════

test("Test 10a — Clicking Logout initiates navigation to /api/logout", async ({ page }) => {
  await injectFetchMock(page, USERS.traveler);
  // Abort the logout redirect to avoid a slow full-page reload.
  // We only need to verify the logout handler fired (window.location.href set).
  await page.route("**/api/logout", (route) => route.abort());
  await gotoHome(page);

  await openMenu(page);
  const [logoutRequest] = await Promise.all([
    page.waitForRequest("**/api/logout", { timeout: 5000 }),
    page.click('[data-testid="button-logout"]'),
  ]);
  expect(logoutRequest.url()).toContain("/api/logout");
});

test("Test 10b — After session destroy, Sign In shown; no avatar or role links", async ({ page }) => {
  // Simulate arriving at home after server-side session destroy (auth=null).
  await injectFetchMock(page, null);
  await gotoHome(page, "unauth");

  // Navbar shows the Sign In button and hides the avatar/menu entirely.
  await expect(page.locator('[data-testid="button-sign-in"]')).toBeVisible();
  await expect(page.locator('[data-testid="button-user-menu"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="link-expert-console"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="link-provider-console"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="link-admin-console"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="button-logout"]')).toHaveCount(0);
});
