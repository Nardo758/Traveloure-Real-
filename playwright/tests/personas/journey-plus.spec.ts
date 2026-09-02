/**
 * journey-plus.spec.ts — Lane 2 of the persona-coverage dispatch: Plus occasion-draft delivery
 * (ledger 2026-08-27-plus-is-delivery; "Plus is DELIVERY, and does not go on sale until it
 * delivers").
 *
 * Uses the seeded Plus member (persona-kyoto-plus@traveloure.test — scripts/seed-personas.ts:
 * active manual plus_annual membership, home city Kyoto). Exercises the full occasion → draft-run
 * → delivered-trip spine:
 *   1. log in, add ONE occasion 14 days out through the real UI (client/src/pages/plus-occasions.tsx)
 *   2. trigger the draft-run scheduler via POST /internal/run-occasion-drafts (the AUTHORITATIVE
 *      runner, server/routes/internal.routes.ts) using INTERNAL_JOB_SECRET from THIS test
 *      process's own env — the same secret the server checks, both sourced from the CI workflow's
 *      env block
 *   3. assert exactly ONE draft trip on My Plans carrying the occasion chip
 *      (chip-occasion-<tripId>, client/src/pages/my-trips.tsx), origin:'ai' items sourced from the
 *      Kyoto draft, and one email_outbox reminder row
 *   4. invoke the endpoint again — the CLAIM→generate→PROMOTE ledger (occasion_drafts,
 *      UNIQUE(occasion_id, cycle_key)) holds: no second draft, no second ledger row
 *
 * STRIPE POSTURE (unlike every other persona suite): this journey never reaches a payment
 * surface. Ruling 2026-08-27-plus-is-delivery is explicit that "Checkout (Stripe annual) is a
 * SEPARATE lane: this one delivers, that one collects" — the member's entitlement here is the
 * seeded manual plan_memberships row, not a Stripe purchase. There is deliberately no
 * Stripe-test-mode branch in this file; STRIPE_UNAVAILABLE is intentionally unused.
 *
 * INTERNAL_JOB_SECRET HONESTY: if the secret is unset (in either this test process's env or the
 * server's), POST /internal/run-occasion-drafts is DECLARED 503 by design
 * (server/routes/internal.routes.ts) — asserted as the honest negative rather than failing, the
 * same posture every money/service-availability gate in this dispatch uses.
 *
 * AI-GENERATION HONESTY: persona-nightly.yml explicitly enables E2E_AI_STUB=1 while retaining
 * the test-account opt-in. The explicitly provisioned staging deployment must set the same
 * E2E_AI_STUB=1 flag alongside ALLOW_TEST_ACCOUNTS=1; the server keeps the stub disabled for
 * production environments. This deterministic result bypasses the external LLM call while every
 * downstream step still uses real application code. This suite looks up the ledger row's ACTUAL
 * promoted state after triggering the run (never a guessed env flag) and fails if the positive
 * delivery path did not execute.
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  rows,
  scalar,
  closePool,
  PERSONAS,
  KYOTO,
  loginAs,
  checkpoint,
  JourneyReport,
} from "./_persona-helpers";

test.setTimeout(180_000);

test.afterAll(async () => {
  await closePool();
});

test.describe("journey-plus — Plus member occasion draft delivery", () => {
  test.describe.configure({ mode: "serial" });

  test("Plus member: add an occasion, trigger the draft run, assert the delivered draft (or the honest negative), idempotent on re-run", async ({ page }) => {
    const report = new JourneyReport("journey-plus");
    const request = page.request;

    const actor = await loginAs(request, PERSONAS.plusMember);
    const [membership] = await rows<{ status: string; plan_key: string; source: string }>(
      `SELECT status, plan_key, source FROM plan_memberships WHERE user_id = $1 AND plan_key = 'plus_annual'`,
      [actor.id],
    );
    const homeCity = await scalar<string>(`SELECT home_city FROM users WHERE id = $1`, [actor.id]);
    report.record({
      action: "login as persona-kyoto-plus + assert active Plus membership and seeded Kyoto home city",
      ui: "POST /api/auth/login 200",
      db: `plan_memberships=${JSON.stringify(membership)} users.home_city=${homeCity}`,
      verdict: membership?.status === "active" && homeCity === KYOTO ? "PASS" : "FAIL",
    });

    // ── 1. Add ONE occasion 14 days out (OCCASION_LEAD_DAYS) through the real UI ───────────
    const occasionDate = new Date();
    occasionDate.setUTCDate(occasionDate.getUTCDate() + 14);
    const occasionDateStr = occasionDate.toISOString().slice(0, 10);

    await page.goto(`${BASE_URL}/plus/occasions`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-plus-occasions-page");

    // Look-first, idempotent on re-run: POST /api/occasions has no server-side dedupe (the same
    // finding journey-traveler.spec.ts's own Plus block already records) — this suite enforces
    // idempotence the same way, rather than inventing a server-side guard the product lacks.
    const existing = await scalar<string>(
      `SELECT id FROM occasions WHERE user_id = $1 AND template_key = 'birthday' AND occasion_date = $2`,
      [actor.id, occasionDateStr],
    );
    if (!existing) {
      await page.getByTestId("select-occasion-template").selectOption("birthday");
      await page.getByTestId("input-occasion-date").fill(occasionDateStr);
      await page.getByTestId("select-occasion-recurrence").selectOption("none").catch(() => {});
      await page.getByTestId("input-occasion-label").fill("Persona Lane 2 draft-delivery fixture");
      await page.getByTestId("button-add-occasion").click();
      await page.waitForTimeout(1_000);
    }

    const [occasionRow] = await rows<{ id: string; template_key: string; occasion_date: string; active: boolean }>(
      `SELECT id, template_key, occasion_date, active FROM occasions WHERE user_id = $1 AND template_key = 'birthday' AND occasion_date = $2`,
      [actor.id, occasionDateStr],
    );
    report.record({
      action: "add one occasion 14 days out through the UI (or reuse an existing idempotent row)",
      ui: existing ? "reused an existing occasion (idempotent re-run)" : "filled the Add-occasion form and submitted",
      db: JSON.stringify(occasionRow),
      verdict: occasionRow?.template_key === "birthday" && occasionRow?.active ? "PASS" : "FAIL",
    });
    expect(occasionRow, "occasion row must exist before triggering the draft run").toBeTruthy();

    // ── 2. Trigger the draft run via the authoritative internal endpoint ──────────────────
    const secret = process.env.INTERNAL_JOB_SECRET;
    if (!secret) {
      const runRes = await request.post(`${BASE_URL}/internal/run-occasion-drafts`, {
        headers: { "x-internal-secret": "no-secret-configured-in-this-run" },
        data: {},
      });
      report.record({
        action: "draft run attempted without INTERNAL_JOB_SECRET configured in this test process's env",
        ui: `POST /internal/run-occasion-drafts status ${runRes.status()}`,
        db: "n/a — the endpoint is declared 503-disabled server-side when the secret is unset (server/routes/internal.routes.ts); a 401 means the server DOES have a secret this test process wasn't given, which is also an honest miswiring to surface, not a silent pass",
        verdict: runRes.status() === 503 || runRes.status() === 401 ? "EXTERNAL" : "FAIL",
        note:
          "INTERNAL_JOB_SECRET is not set in this run's test-process env — asserting the endpoint's own honest-unavailable contract rather than fabricating a pass.",
      });
      report.write();
      expect(report.hasFailures, `journey-plus had failing steps: ${JSON.stringify(report)}`).toBe(false);
      return;
    }

    const runRes1 = await request.post(`${BASE_URL}/internal/run-occasion-drafts`, {
      headers: { "x-internal-secret": secret },
      data: {},
    });
    expect(runRes1.status(), `draft run failed: ${await runRes1.text().catch(() => "")}`).toBe(200);
    const runBody1 = await runRes1.json().catch(() => null);
    report.record({
      action: "trigger the draft run (first invocation)",
      ui: `POST /internal/run-occasion-drafts status ${runRes1.status()}, result=${JSON.stringify(runBody1?.result)}`,
      db: "n/a (the ledger row is asserted below, independent of this call's own counters)",
      verdict: runRes1.status() === 200 ? "PASS" : "FAIL",
    });

    // Look up the ledger row's ACTUAL state rather than trusting this call's own "created"
    // counter — a prior pass (this workflow runs every suite twice for idempotence) may have
    // already promoted it, which is equally a genuine delivered draft.
    const [draftRow] = await rows<{ id: string; trip_id: string | null; generated_at: string | null; notified_at: string | null }>(
      `SELECT id, trip_id, generated_at, notified_at FROM occasion_drafts WHERE occasion_id = $1`,
      [occasionRow.id],
    );

    if (!draftRow?.trip_id || !draftRow?.generated_at) {
      // FAIL LOUDLY — do NOT swallow this as an "honest negative" (the prior behaviour, which
      // green-passed whether or not the positive path ran, so the delivery proof could rot
      // unnoticed). The occasion draft's generation is served by grokService.generateAutonomousItinerary,
      // which returns a deterministic canned itinerary when E2E_AI_STUB=1. Production-mode staging
      // also needs ALLOW_TEST_ACCOUNTS=1; the server refuses the stub for ENVIRONMENT=PROD. The
      // draft-run fires SERVER-SIDE via POST /internal/run-occasion-drafts, so E2E_AI_STUB=1 must be
      // set in the target server environment for the positive promote path to run. A CLAIM row with
      // a null trip_id/generated_at means generation produced nothing — the stub is almost certainly
      // off in the target env.
      report.record({
        action: "draft run did not promote a trip — occasion draft produced no items",
        ui: "n/a",
        db: `occasion_drafts row=${JSON.stringify(draftRow)}, run result=${JSON.stringify(runBody1?.result)}`,
        verdict: "FAIL",
        note:
          "Occasion draft produced no items — is E2E_AI_STUB=1 set in the STAGING env the draft-run " +
          "targets? Without it, grokService.generateAutonomousItinerary makes a real LLM call that fails " +
          "in staging, the CLAIM stays un-promoted, and the positive delivery path is never exercised.",
      });
      report.write();
      expect(
        draftRow?.trip_id && draftRow?.generated_at,
        "occasion draft produced no items — is E2E_AI_STUB=1 set in staging? " +
          `occasion_drafts row=${JSON.stringify(draftRow)}, run result=${JSON.stringify(runBody1?.result)}`,
      ).toBeTruthy();
      return;
    }

    const draftTripId = draftRow.trip_id;

    // ── 3. Positive path: the delivered trip, its items, the My Plans chip, the notification ─
    const [itemCounts] = await rows<{ total: string; ai_origin: string }>(
      `SELECT count(*)::text AS total, count(*) FILTER (WHERE origin = 'ai')::text AS ai_origin
       FROM itinerary_items WHERE trip_id = $1`,
      [draftTripId],
    );
    report.record({
      action: "delivered draft trip's items are all origin:'ai' (server-stamped, never client-supplied)",
      ui: "n/a",
      db: `itinerary_items total=${itemCounts?.total} origin_ai=${itemCounts?.ai_origin} for trip=${draftTripId}`,
      verdict: Boolean(itemCounts) && Number(itemCounts.total) > 0 && itemCounts.total === itemCounts.ai_origin ? "PASS" : "FAIL",
    });

    const [tripRow] = await rows<{ destination: string; user_id: string }>(
      `SELECT destination, user_id FROM trips WHERE id = $1`,
      [draftTripId],
    );
    report.record({
      action: "delivered draft trip is owned by the member and built from their Kyoto home city",
      ui: "n/a",
      db: JSON.stringify(tripRow),
      verdict: tripRow?.user_id === actor.id && tripRow?.destination === KYOTO ? "PASS" : "FAIL",
    });

    await page.goto(`${BASE_URL}/my-trips`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-plus-my-plans");
    const chip = page.getByTestId(`chip-occasion-${draftTripId}`);
    const chipVisible = await chip.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
    const chipText = chipVisible ? await chip.textContent().catch(() => "") : "";
    report.record({
      action: "My Plans shows the occasion chip on the delivered draft (client/src/pages/my-trips.tsx, chip-occasion-<tripId>)",
      ui: `chip-occasion-${draftTripId} visible=${chipVisible} text="${chipText?.trim()}"`,
      db: `trips.id=${draftTripId}`,
      verdict: chipVisible ? "PASS" : "FAIL",
    });

    const [notification] = await rows<{ id: string; email_type: string; to_email: string }>(
      `SELECT id, email_type, to_email FROM email_outbox WHERE email_type = 'occasion_reminder' AND metadata->>'draftId' = $1`,
      [draftRow.id],
    );
    report.record({
      action: "one reminder notification row recorded (email_outbox, email_type='occasion_reminder')",
      ui: "n/a",
      db: JSON.stringify(notification),
      verdict: Boolean(notification) ? "PASS" : "FAIL",
    });

    // ── 4. Re-invoke: CLAIM→generate→PROMOTE idempotency — no second draft, no second row ───
    const runRes2 = await request.post(`${BASE_URL}/internal/run-occasion-drafts`, {
      headers: { "x-internal-secret": secret },
      data: {},
    });
    expect(runRes2.status(), `second draft run failed: ${await runRes2.text().catch(() => "")}`).toBe(200);
    const ledgerCountAfter = await scalar<string>(
      `SELECT count(*)::int FROM occasion_drafts WHERE occasion_id = $1`,
      [occasionRow.id],
    );
    const distinctTripCountAfter = await scalar<string>(
      `SELECT count(DISTINCT trip_id)::int FROM occasion_drafts WHERE occasion_id = $1 AND trip_id IS NOT NULL`,
      [occasionRow.id],
    );
    report.record({
      action: "re-run is idempotent — exactly one ledger row and one trip, never two (UNIQUE(occasion_id, cycle_key))",
      ui: `second POST /internal/run-occasion-drafts status ${runRes2.status()}`,
      db: `occasion_drafts count=${ledgerCountAfter}, distinct trip_id count=${distinctTripCountAfter}`,
      verdict: Number(ledgerCountAfter) === 1 && Number(distinctTripCountAfter) === 1 ? "PASS" : "FAIL",
    });

    report.write();
    expect(report.hasFailures, `journey-plus had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });

  // Non-member / no-home-city negatives, per the dispatch: skipped, not errored — the seed
  // provides exactly ONE Plus persona (persona-kyoto-plus@traveloure.test), and it always carries
  // an active membership and a seeded Kyoto home city, so there is no non-member/no-home-city
  // persona fixture in this dispatch to exercise honestly without fabricating one. The
  // scheduler's own skip branches (skipped_not_plus / skipped_no_home_city,
  // server/services/occasion-drafts.service.ts) are unit-proven elsewhere
  // (server/__tests__/occasion-drafts.db.test.ts), not re-proven here.
  test.skip("non-member: no draft scheduled — no non-member persona fixture exists in this dispatch", async () => {});
  test.skip("no-home-city: no draft scheduled — the seeded Plus persona always carries a Kyoto home city", async () => {});
});
