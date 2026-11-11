import { test, expect } from "@playwright/test";
import { testid } from "../../../e2e/supply-demand/lib/ui";
import { registerAndSignIn } from "../../utils/auth";
import { guestPlanNotice } from "../../../shared/guest-plan-copy";
import { assertDisposableDb, closePool, PASSWORD, pool, rows, uid } from "./_journey-helpers";

/**
 * CUT-LIST #1 SLICE D — sign-in claims the guest plan in place, and its bookable item becomes a cart line
 * (ledger `2026-11-11-cutlist1-slice-d-claim-notice`).
 *
 *   D1 the guest page shows the ONE notice the server's retention calls for ("Saved on this device for 30 days" at 30)
 *   D2 a guest saves a priced instant listing; the traveler signs up; the claim lands on /plans/{id} — the SAME plan
 *      (claimed in place, never minted)
 *   D3 the plan's status strip reads "1 in checkout" with "Go to checkout (1)", and the cart holds exactly one line, keyed on the saved item, owned by the new
 *      account
 *
 * Guest saves need waitlist mode and sign-up needs open mode, so the mode is set per phase (the platform setting,
 * restored in afterAll) and the server's 15s settings cache is waited out each time. Run it on its own.
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-claim-cart-lines.spec.ts --project=chromium --workers=1
 * Needs: DATABASE_URL (the fixture, the mode and the read-back), the app on BASE_URL.
 */

const SETTINGS_CACHE_MS = 15_500;
let priorMode: string | null = null;

async function setMode(mode: string | null) {
  if (mode == null) await rows(`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else
    await rows(
      `INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1`,
      [mode],
    );
  await new Promise((res) => setTimeout(res, SETTINGS_CACHE_MS));
}

test.beforeAll(async () => {
  test.setTimeout(60_000);
  await assertDisposableDb(pool());
  const r = await rows<{ setting_value: string }>(`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = r[0]?.setting_value ?? null;
  await setMode("waitlist");
});

test.afterAll(async () => {
  test.setTimeout(60_000);
  await setMode(priorMode);
  await closePool();
});

async function instantListing() {
  // Written behind the disposable-database guard: waitlist mode refuses a sign-up, so the owner cannot register.
  const [owner] = await rows<{ id: string }>(
    `INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, $1, 'service_provider') RETURNING id`,
    [`claim-cart-owner-${uid()}@traveloure.test`],
  );
  const [listing] = await rows<{ id: string }>(
    `INSERT INTO provider_services
       (id, user_id, service_name, category_id, city, location, price, price_type, show_price,
        latitude, longitude, status, approval_status, booking_mode)
     SELECT gen_random_uuid()::text, $1, $2, sc.id, 'Kyoto', 'Kyoto, Japan', '45', 'fixed', true, '35.0037', '135.7788',
            'active', 'approved', 'instant'
       FROM service_categories sc WHERE sc.category_key = 'activity_provider' LIMIT 1
     RETURNING id`,
    [owner.id, `Claim cart tea ceremony ${uid()}`],
  );
  return listing.id;
}

test("slice D — guest saves an instant listing, signs up, lands on the same plan, the cart holds its line", async ({ page }) => {
  test.setTimeout(150_000);
  const listingId = await instantListing();

  // The guest plan and the save, on the page's own guest cookie.
  const made = await page.request.post("/api/guest-plans", { data: { destination: "Kyoto, Japan", title: "Kyoto trip" } });
  expect(made.ok(), `guest plan create answered ${made.status()}`).toBe(true);
  const planId: string = (await made.json()).plan.id;
  const saved = await page.request.post("/api/guest-plans/current/items", { data: { kind: "listing", source_id: listingId, city: "Kyoto" } });
  expect(saved.ok(), `guest save answered ${saved.status()} ${await saved.text()}`).toBe(true);
  const itemId: string = (await saved.json()).id;

  // D1: the notice is the one the server's retention calls for — never both lines, never another number.
  const view = await (await page.request.get("/api/guest-plans/current")).json();
  await page.goto("/plans/new?view=map");
  await expect(testid(page, "guest-plan-kept")).toHaveText(guestPlanNotice(view.retentionDays ?? null), { timeout: 20_000 });

  // D2: sign-up opens; the account is made and signed in on the same browser context (the guest cookie rides along).
  await setMode("open");
  const { id: userId } = await registerAndSignIn(page.request, {
    email: `claim-cart-${uid()}@traveloure.test`,
    password: PASSWORD,
    extra: { userType: "user" },
  });
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`/plans/${planId}(\\?|$)`), { timeout: 30_000 });
  const owned = await rows<{ user_id: string | null; n: string }>(
    `SELECT user_id, (SELECT count(*)::text FROM trips WHERE user_id = $2) AS n FROM trips WHERE id = $1`,
    [planId, userId],
  );
  expect(owned[0]?.user_id, "the guest plan is claimed in place").toBe(userId);
  expect(owned[0]?.n, "nothing minted beside it").toBe("1");

  // D3: one cart line keyed on the saved item, and the strip reads it.
  const lines = await rows<{ itinerary_item_id: string }>(`SELECT itinerary_item_id FROM cart_items WHERE user_id = $1`, [userId]);
  expect(lines.map((l) => l.itinerary_item_id)).toEqual([itemId]);
  await expect(testid(page, "slip-count-ready_for_checkout")).toHaveText("1 in checkout", { timeout: 20_000 });
  await expect(testid(page, "slip-action-go-to-checkout")).toHaveText("Go to checkout (1)");
});
