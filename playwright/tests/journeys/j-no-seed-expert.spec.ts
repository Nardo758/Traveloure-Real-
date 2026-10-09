import { test, expect } from "@playwright/test";
import { assertDisposableDb, closePool, createTrip, pool, registerUser, rows, uid } from "./_journey-helpers";

/**
 * B3 — /plans/:id NEVER NAMES A SEED ACCOUNT (ledger `2026-10-09-b3-expert-routability`; Replit's
 * confirmed case: "Maria Santos", `@example.com`, application pending, rendered as the plan's expert).
 *
 * The fixture reproduces exactly that row: a seed-domain expert with a PENDING application, written
 * straight into `trip_expert_advisors` as an ACCEPTED advisor on the traveler's plan (the way
 * `scripts/seed-california-full.ts` wrote it — around the one author, which now refuses it). The plan
 * page, list and map, must not show the name anywhere.
 *
 * The application is PENDING on purpose: CI runs the app with SHOW_DEMO_EXPERTS=1, which relaxes only
 * the seed-domain clause; an unapproved application is never shown under any flag.
 *
 * Run solo: npx playwright test playwright/tests/journeys/j-no-seed-expert.spec.ts --project=chromium
 * Needs: DATABASE_URL (the fixture rows), the app on BASE_URL.
 */

test.afterAll(async () => {
  await closePool();
});

test("B3 — a seed account on the plan's advisor rows is never named on /plans/:id", async ({ page }) => {
  test.setTimeout(60_000);
  await registerUser(page.request, "no-seed", "Seed", "Check");
  const tripId = await createTrip(page.request, `No seed expert ${uid()}`);

  await assertDisposableDb(pool());
  const surname = `Santos${uid()}`;
  const expertId = `b3-seed-${uid()}`;
  await rows(
    `INSERT INTO users (id, email, first_name, last_name, role) VALUES ($1, $2, 'Maria', $3, 'local_expert')`,
    [expertId, `maria.${surname.toLowerCase()}@example.com`, surname],
  );
  await rows(
    `INSERT INTO local_expert_forms (id, user_id, first_name, last_name, status, identity_verification_status, stripe_connect_status)
     VALUES (gen_random_uuid()::text, $1, 'Maria', $2, 'pending', 'verified', 'complete')`,
    [expertId, surname],
  );
  await rows(
    `INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, workspace_status, assigned_at)
     VALUES (gen_random_uuid()::text, $1, $2, 'accepted', 'draft', NOW())`,
    [tripId, expertId],
  );

  for (const view of ["", "?view=map"]) {
    await page.goto(`/plans/${tripId}${view}`);
    await expect(page.getByTestId("slip-header")).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body"), `the plan page${view} must not name the seed account`).not.toContainText(surname);
  }

  // The advisor read the rail and the event header draw from answers without the seed row too.
  const res = await page.request.get(`/api/trips/${tripId}/expert-advisor`);
  expect(res.ok()).toBeTruthy();
  expect(JSON.stringify(await res.json())).not.toContain(surname);
});
