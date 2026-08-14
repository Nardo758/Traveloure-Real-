/**
 * Stripe Connect Reminder Notification — End-to-End Verification
 *
 * Verifies that a `stripe_connect_reminder` notification seeded for a provider
 * is correctly surfaced by the notification feed API and the notification bell UI.
 *
 * Pattern: registers a real user, promotes role via SQL, seeds the notification
 * row directly, then verifies both the API contract and the UI badge.
 *
 * Mirrors the approach used in optimization-payment-gate.spec.ts and
 * concierge-phase-a.spec.ts.
 */
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// Secret required by the test-only scheduler trigger endpoint.
// Must match the RATE_LIMIT_BYPASS_KEY env var configured on the dev server.
const TEST_SECRET = process.env.RATE_LIMIT_BYPASS_KEY || "";

const REMINDER_TYPE = "stripe_connect_reminder";
const REMINDER_TITLE = "Set up payouts to get paid";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function sql(query: string): string {
  const db = process.env.DATABASE_URL;
  if (!db) throw new Error("DATABASE_URL is not set");
  const escaped = query.replace(/'/g, `'\\''`);
  return execSync(`psql '${db}' -t -A -c '${escaped}'`, {
    encoding: "utf8",
  }).trim();
}

async function registerUser(
  page: any,
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password, firstName, lastName, userType: "user" },
  });
  expect(res.status(), "Registration should succeed with 201").toBe(201);
  const body = await res.json();
  return body.user.id as string;
}

test.describe("Stripe Connect Reminder — notification feed surfacing", () => {
  test(
    "API: seeded stripe_connect_reminder row appears in GET /api/notifications and unread count",
    async ({ page }) => {
      const email = `e2e-sc-reminder-${uid()}@example.com`;
      const password = "TestPass123!";
      const notifId = crypto.randomUUID();

      // ── 1. Register a fresh user ─────────────────────────────────────────
      const userId = await registerUser(page, email, password, "Provider", "Test");

      // ── 2. Promote role to service_provider (reminder scheduler targets this role) ──
      sql(`UPDATE users SET role = 'service_provider' WHERE id = '${userId}'`);

      // ── 3. Seed a stripe_connect_reminder notification row directly ───────
      //    Mirrors exactly what stripe-connect-reminder.service.ts inserts.
      sql(`
        INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
        VALUES (
          '${notifId}',
          '${userId}',
          '${REMINDER_TYPE}',
          'Set up payouts to get paid',
          'You have been approved but haven''t connected your Stripe account yet. Complete Stripe Connect setup so you can receive payouts for your bookings.',
          false,
          NOW()
        )
      `);

      // ── 4. Verify the row is in the DB ────────────────────────────────────
      const dbType = sql(
        `SELECT type FROM notifications WHERE id = '${notifId}'`
      );
      expect(dbType).toBe(REMINDER_TYPE);

      // ── 5. GET /api/notifications — notification must appear in the feed ──
      //    The page.request context carries the session cookie from registration.
      const feedRes = await page.request.get(`${BASE_URL}/api/notifications`);
      expect(feedRes.status(), "GET /api/notifications should return 200").toBe(200);

      const feed: Array<{
        id: string;
        type: string;
        title: string;
        isRead: boolean;
      }> = await feedRes.json();

      const reminder = feed.find((n) => n.id === notifId);
      expect(
        reminder,
        `stripe_connect_reminder notification (id=${notifId}) not found in feed`
      ).toBeDefined();
      expect(reminder!.type).toBe(REMINDER_TYPE);
      expect(reminder!.title).toBe(REMINDER_TITLE);
      expect(reminder!.isRead).toBe(false);

      // ── 6. GET /api/notifications/unread-count — count must be >= 1 ───────
      const countRes = await page.request.get(
        `${BASE_URL}/api/notifications/unread-count`
      );
      expect(
        countRes.status(),
        "GET /api/notifications/unread-count should return 200"
      ).toBe(200);

      const { count } = await countRes.json();
      expect(
        count,
        "Unread notification count should be at least 1 after seeding reminder"
      ).toBeGreaterThanOrEqual(1);

      // ── 7. Cleanup ─────────────────────────────────────────────────────────
      sql(`DELETE FROM notifications WHERE id = '${notifId}'`);
      sql(`DELETE FROM users WHERE id = '${userId}'`);
    }
  );

  test(
    "UI: notification bell shows unread badge after stripe_connect_reminder is seeded",
    async ({ page }) => {
      const email = `e2e-sc-bell-${uid()}@example.com`;
      const password = "TestPass123!";
      const notifId = crypto.randomUUID();
      let userId = "";

      try {
        // ── 1. Register user ────────────────────────────────────────────────
        userId = await registerUser(page, email, password, "Bell", "Provider");

        // ── 2. Promote to service_provider ──────────────────────────────────
        sql(`UPDATE users SET role = 'service_provider' WHERE id = '${userId}'`);

        // ── 3. Seed the reminder notification ───────────────────────────────
        sql(`
          INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
          VALUES (
            '${notifId}',
            '${userId}',
            '${REMINDER_TYPE}',
            'Set up payouts to get paid',
            'You have been approved but haven''t connected your Stripe account yet. Complete Stripe Connect setup so you can receive payouts for your bookings.',
            false,
            NOW()
          )
        `);

        // ── 4. Navigate to a page that renders the authenticated layout ──────
        //    Using /trips (traveler dashboard) because it is accessible to any
        //    logged-in user regardless of role. The NotificationBell lives in
        //    the shared layout component and renders for all authenticated users.
        await page.goto(`${BASE_URL}/trips`);

        // Wait for the page to settle (JS hydration + React Query fetch).
        await page.waitForLoadState("networkidle").catch(() => null);

        // ── 5. Notification bell button must be visible ─────────────────────
        const bellBtn = page.getByTestId("button-notifications");
        await expect(bellBtn).toBeVisible({ timeout: 10_000 });

        // ── 6. Unread badge must be visible with a positive count ───────────
        //    The badge renders only when count > 0 (see notification-bell.tsx).
        const badge = page.getByTestId("badge-unread-count");
        await expect(badge).toBeVisible({ timeout: 10_000 });

        const badgeText = (await badge.textContent()) ?? "";
        const badgeCount = badgeText === "9+" ? 10 : parseInt(badgeText, 10);
        expect(
          badgeCount,
          "Bell badge count should be positive after stripe_connect_reminder is seeded"
        ).toBeGreaterThanOrEqual(1);

        // ── 7. Open the popover and verify the reminder title appears ────────
        await bellBtn.click();

        const reminderItem = page.locator(
          `[data-testid="notification-${notifId}"]`
        );
        await expect(reminderItem).toBeVisible({ timeout: 8_000 });
        await expect(reminderItem).toContainText(REMINDER_TITLE);
      } finally {
        // ── 8. Cleanup ──────────────────────────────────────────────────────
        if (notifId) sql(`DELETE FROM notifications WHERE id = '${notifId}'`);
        if (userId) sql(`DELETE FROM users WHERE id = '${userId}'`);
      }
    }
  );

  test(
    "Scheduler: provider with stripeAccountStatus='complete' receives no reminder after scheduler runs",
    async ({ page }) => {
      const email = `e2e-sc-complete-${uid()}@example.com`;
      const password = "TestPass123!";
      let userId = "";

      try {
        // ── 1. Register a fresh user ──────────────────────────────────────────
        userId = await registerUser(page, email, password, "Complete", "Provider");

        // ── 2. Promote to service_provider and mark Stripe Connect as complete ─
        //    Setting both stripe_account_id and stripe_account_status = 'complete'
        //    mirrors what the Stripe Connect onboarding flow writes on completion.
        sql(
          `UPDATE users SET role = 'service_provider', stripe_account_id = 'acct_testcomplete', stripe_account_status = 'complete' WHERE id = '${userId}'`
        );

        // ── 3. Invoke the real scheduler via the test-only endpoint ───────────
        //    POST /api/test/stripe-reminder-run calls runReminders() directly,
        //    so this exercises the actual service query + insert path —
        //    not a reimplementation of the WHERE clause.
        //    The endpoint requires X-Test-Secret matching RATE_LIMIT_BYPASS_KEY
        //    and returns 500 if the scheduler throws, so a 200 with ok:true
        //    confirms the scheduler ran successfully.
        const triggerRes = await page.request.post(
          `${BASE_URL}/api/test/stripe-reminder-run`,
          { headers: { "x-test-secret": TEST_SECRET } }
        );
        expect(
          triggerRes.status(),
          "Test trigger endpoint should return 200 — a 5xx means the scheduler threw an unexpected error"
        ).toBe(200);
        const triggerBody = await triggerRes.json();
        expect(triggerBody.ok, "Scheduler must complete without error before checking notification absence").toBe(true);

        // ── 4. Assert no stripe_connect_reminder was inserted for this user ───
        //    If the scheduler incorrectly selected the complete provider, a row
        //    would now exist in notifications.
        const notifCount = sql(
          `SELECT COUNT(*) FROM notifications WHERE user_id = '${userId}' AND type = '${REMINDER_TYPE}'`
        );
        expect(
          parseInt(notifCount, 10),
          "Scheduler must not insert a stripe_connect_reminder for a provider whose stripeAccountStatus is 'complete'"
        ).toBe(0);
      } finally {
        // ── 5. Cleanup ────────────────────────────────────────────────────────
        if (userId) {
          sql(`DELETE FROM notifications WHERE user_id = '${userId}' AND type = '${REMINDER_TYPE}'`);
          sql(`DELETE FROM users WHERE id = '${userId}'`);
        }
      }
    }
  );
});
