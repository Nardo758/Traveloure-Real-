import { test, expect, request as playwrightRequest } from "@playwright/test";
import { testid } from "../../../e2e/supply-demand/lib/ui";
import { BASE_URL, PASSWORD, assertDisposableDb, closePool, pool, registerUser, rows } from "./_journey-helpers";

/**
 * QA round 3 PR 3 (Leon, Nov 11, 2026) — TB2's path, end to end, in ONE tab:
 *
 *   guest save → email sign-in → lands on that plan → sign out → guest save → sign in as the SAME account
 *   → lands on the NEW plan (/plans/{id}).
 *
 * Before the fix the second sign-in claimed nothing: the tab's claim memo still named the account after signing out,
 * so the claim answered [] without asking the server; and the sign-in modal's full page load could drop the landing.
 *
 * Guest plans exist only in waitlist mode, so the account is created first and the mode is switched for this file only
 * (restored after, the server's 15s settings cache waited out on both sides — the j-add-actions pattern). Run it on its
 * own (CI: its own step in the Kyoto slice gate).
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-claim-signin.spec.ts --project=chromium --workers=1
 */

const SETTINGS_CACHE_MS = 15_500;
let priorMode: string | null = null;
let account: { id: string; email: string };

async function setMode(mode: string | null) {
  if (mode == null) await rows(`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else
    await rows(
      `INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1`,
      [mode],
    );
}

test.beforeAll(async () => {
  test.setTimeout(90_000);
  await assertDisposableDb(pool());
  const r = await rows<{ setting_value: string }>(`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = r[0]?.setting_value ?? null;
  // The account exists before the switch (waitlist mode refuses a traveler sign-up). Its own request context, so the
  // page itself starts signed out.
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  account = await registerUser(ctx, "claim-signin", "Claim", "Traveler");
  await ctx.dispose();
  await rows(`UPDATE users SET email_verified = NOW() WHERE id = $1 AND email_verified IS NULL`, [account.id]);
  await setMode("waitlist");
  await new Promise((res) => setTimeout(res, SETTINGS_CACHE_MS));
});

test.afterAll(async () => {
  test.setTimeout(60_000);
  await setMode(priorMode);
  await new Promise((res) => setTimeout(res, SETTINGS_CACHE_MS));
  await closePool();
});

test.use({ viewport: { width: 1440, height: 900 } });

test("TB2: guest save → sign in → sign out → guest save → sign in again lands on the new plan", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const guestSave = async (title: string): Promise<string> => {
    const res = await page.request.post("/api/guest-plans", { data: { destination: "Kyoto, Japan", title } });
    expect(res.ok(), `guest plan create answered ${res.status()}`).toBe(true);
    return (await res.json()).plan.id as string;
  };
  const signIn = async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await testid(page, "button-sign-in").click({ timeout: 20_000 });
    await expect(testid(page, "modal-sign-in")).toBeVisible({ timeout: 10_000 });
    await testid(page, "input-email").fill(account.email);
    await testid(page, "input-password").fill(PASSWORD);
    await testid(page, "button-auth-submit").click();
  };
  const owner = async (planId: string) =>
    (await rows<{ user_id: string | null }>(`SELECT user_id FROM trips WHERE id = $1`, [planId]))[0]?.user_id ?? null;

  // 1. A guest save, then an email sign-in: the plan is claimed and the sign-in lands on it.
  const first = await guestSave("Kyoto trip A");
  await signIn();
  await expect(page).toHaveURL(new RegExp(`/plans/${first}(\\?|$)`), { timeout: 30_000 });
  expect(await owner(first), "the first guest plan is the account's").toBe(account.id);

  // 2. Sign out from the console sidebar: the tab's claim memo is forgotten.
  await testid(page, "button-sidebar-logout").click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  expect(await page.evaluate(() => sessionStorage.getItem("traveloure_guest_claimed_for")), "memo cleared on sign-out").toBeNull();

  // 3. A second guest save in the same tab, then sign in as the SAME account: the new plan is claimed and landed on.
  const second = await guestSave("Kyoto trip B");
  expect(second).not.toBe(first);
  await signIn();
  await expect(page).toHaveURL(new RegExp(`/plans/${second}(\\?|$)`), { timeout: 30_000 });
  expect(await owner(second), "the second guest plan is the account's too").toBe(account.id);
});
