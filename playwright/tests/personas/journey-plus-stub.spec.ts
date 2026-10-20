/**
 * The Plus occasion-draft delivery proof. Runs only where `E2E_AI_STUB=1` AND `NODE_ENV` is not
 * `production` (dev-server-gates, `DRAFT_STUB_SERVER=1`). A production bundle ignores the flag;
 * `journey-plus.spec.ts` asserts that failure: the runner answers 200, promotes nothing, and
 * leaves the claim unpromoted. This file is the path that used to live there — one drafted trip,
 * origin='ai' items, the My Plans chip, one reminder, and a second run that does not draft again.
 *
 * The occasion runner never opens a slip, so this file does not look for `ai-draft-failure`.
 */
import { test, expect } from "@playwright/test";
import { BASE_URL, rows, scalar, closePool, PERSONAS, KYOTO, loginAs, JourneyReport } from "./_persona-helpers";

test.beforeEach(() => {
  test.skip(
    process.env.DRAFT_STUB_SERVER !== "1",
    "Successful-draft proofs run only where DRAFT_STUB_SERVER=1 (a non-production server with E2E_AI_STUB=1).",
  );
});

test.setTimeout(180_000);

test.afterAll(async () => {
  await closePool();
});

test("stub — Plus occasion draft promotes one trip, then a second run does not", async ({ page }) => {
  const report = new JourneyReport("journey-plus-stub");
  const request = page.request;
  const secret = process.env.INTERNAL_JOB_SECRET;
  expect(secret, "the stand-in server and this process share INTERNAL_JOB_SECRET").toBeTruthy();

  const actor = await loginAs(request, PERSONAS.plusMember);
  const homeCity = await scalar<string>(`SELECT home_city FROM users WHERE id = $1`, [actor.id]);
  expect(homeCity).toBe(KYOTO);

  const occasionDate = new Date();
  occasionDate.setUTCDate(occasionDate.getUTCDate() + 14);
  const occasionDateStr = occasionDate.toISOString().slice(0, 10);

  await page.goto(`${BASE_URL}/plus/occasions`);
  await page.waitForLoadState("networkidle");
  const existing = await scalar<string>(
    `SELECT id FROM occasions WHERE user_id = $1 AND template_key = 'birthday' AND occasion_date = $2`,
    [actor.id, occasionDateStr],
  );
  if (!existing) {
    await page.getByTestId("select-occasion-template").selectOption("birthday");
    await page.getByTestId("input-occasion-date").fill(occasionDateStr);
    await page.getByTestId("select-occasion-recurrence").selectOption("none").catch(() => {});
    await page.getByTestId("input-occasion-label").fill("Persona stand-in draft-delivery fixture");
    await page.getByTestId("button-add-occasion").click();
    await page.waitForTimeout(1_000);
  }

  const [occasionRow] = await rows<{ id: string }>(
    `SELECT id FROM occasions WHERE user_id = $1 AND template_key = 'birthday' AND occasion_date = $2 AND active = true`,
    [actor.id, occasionDateStr],
  );
  expect(occasionRow, "occasion row must exist before the draft run").toBeTruthy();

  const runRes1 = await request.post(`${BASE_URL}/internal/run-occasion-drafts`, {
    headers: { "x-internal-secret": secret! },
    data: {},
  });
  expect(runRes1.status(), await runRes1.text()).toBe(200);

  const [draftRow] = await rows<{ id: string; trip_id: string | null; generated_at: string | null }>(
    `SELECT id, trip_id, generated_at FROM occasion_drafts WHERE occasion_id = $1`,
    [occasionRow.id],
  );
  expect(draftRow?.trip_id, "the stand-in promotes the claim").toBeTruthy();
  expect(draftRow?.generated_at).toBeTruthy();
  const draftTripId = draftRow.trip_id!;

  const [itemCounts] = await rows<{ total: string; ai_origin: string }>(
    `SELECT count(*)::text AS total, count(*) FILTER (WHERE origin = 'ai')::text AS ai_origin
     FROM itinerary_items WHERE trip_id = $1`,
    [draftTripId],
  );
  expect(Number(itemCounts.total)).toBeGreaterThan(0);
  expect(itemCounts.total).toBe(itemCounts.ai_origin);

  const [tripRow] = await rows<{ destination: string; user_id: string }>(
    `SELECT destination, user_id FROM trips WHERE id = $1`,
    [draftTripId],
  );
  expect(tripRow.user_id).toBe(actor.id);
  expect(tripRow.destination).toBe(KYOTO);

  await page.goto(`${BASE_URL}/my-trips`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId(`chip-occasion-${draftTripId}`)).toBeVisible({ timeout: 10_000 });

  const [notification] = await rows<{ id: string }>(
    `SELECT id FROM email_outbox WHERE email_type = 'occasion_reminder' AND metadata->>'draftId' = $1`,
    [draftRow.id],
  );
  expect(notification, "one reminder row").toBeTruthy();

  const runRes2 = await request.post(`${BASE_URL}/internal/run-occasion-drafts`, {
    headers: { "x-internal-secret": secret! },
    data: {},
  });
  expect(runRes2.status(), await runRes2.text()).toBe(200);
  const ledgerCountAfter = await scalar<string>(
    `SELECT count(*)::int FROM occasion_drafts WHERE occasion_id = $1`,
    [occasionRow.id],
  );
  const distinctTripCountAfter = await scalar<string>(
    `SELECT count(DISTINCT trip_id)::int FROM occasion_drafts WHERE occasion_id = $1 AND trip_id IS NOT NULL`,
    [occasionRow.id],
  );
  expect(Number(ledgerCountAfter)).toBe(1);
  expect(Number(distinctTripCountAfter)).toBe(1);

  report.record({
    action: "stand-in occasion draft promoted one trip and the second run did not draft again",
    ui: `chip-occasion-${draftTripId}`,
    db: `trip=${draftTripId} items=${itemCounts.total} ledger=${ledgerCountAfter}`,
    verdict: "PASS",
  });
  report.write();
});
