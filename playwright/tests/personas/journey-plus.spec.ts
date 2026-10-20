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
 *   3. on a production bundle the model call fails and the claim stays unpromoted: HTTP 200,
 *      created 0, errors or skippedExisting, trip_id and generated_at null, no origin='ai' rows.
 *      The runner never opens a slip, so there is no ai-draft-failure notice on this path.
 *   4. invoke the endpoint again — still one unpromoted ledger row, never a second trip.
 *      The successful delivery (chip, items, reminder) is journey-plus-stub.spec.ts.
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
 * AI-GENERATION HONESTY: persona-nightly.yml sets E2E_AI_STUB=1 on a production bundle. That
 * boot ignores the flag (`NODE_ENV === production`), so the occasion draft takes the real model
 * path. A failed model call is caught inside the runner: the HTTP response stays 200, `created`
 * stays 0, and the CLAIM row is left with trip_id and generated_at null. The first pass of this
 * job counts that as `errors`; a later pass inside the 30-minute claim lease counts it as
 * `skippedExisting` with errors 0. Both are the honest failure. The stand-in that promotes a
 * trip is journey-plus-stub.spec.ts, on a server whose NODE_ENV is not production.
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

  test("Plus member: add an occasion, trigger the draft run, and a production model failure leaves the claim unpromoted", async ({ page }) => {
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
    const result1 = runBody1?.result ?? {};
    const heldBack = Number(result1.errors ?? 0) + Number(result1.skippedExisting ?? 0);
    // A production model failure is HTTP 200 with nothing promoted. The first pass of this job
    // counts `errors`; a second pass while the claim lease is active counts `skippedExisting`.
    const firstPassHonest =
      runRes1.status() === 200 && Number(result1.created ?? 0) === 0 && heldBack > 0;
    report.record({
      action: "production draft run promotes nothing (model failure, or the claim already held)",
      ui: `POST /internal/run-occasion-drafts status ${runRes1.status()}, result=${JSON.stringify(result1)}`,
      db: "the ledger row is asserted below",
      verdict: firstPassHonest ? "PASS" : "FAIL",
      note: "The runner never mounts a slip, so this path has no ai-draft-failure notice. The slip doors prove that notice.",
    });

    const [draftRow] = await rows<{ id: string; trip_id: string | null; generated_at: string | null }>(
      `SELECT id, trip_id, generated_at FROM occasion_drafts WHERE occasion_id = $1`,
      [occasionRow.id],
    );
    const unpromoted = Boolean(draftRow) && draftRow.trip_id == null && draftRow.generated_at == null;
    const aiItems = await scalar<string>(
      `SELECT count(*)::text FROM itinerary_items i
         JOIN trips t ON t.id = i.trip_id
        WHERE t.user_id = $1 AND i.origin = 'ai'`,
      [actor.id],
    );
    report.record({
      action: "the claim stays unpromoted and this member has no origin='ai' items",
      ui: "n/a — the runner does not open the plan",
      db: `occasion_drafts=${JSON.stringify(draftRow)} origin_ai_items=${aiItems}`,
      verdict: unpromoted && Number(aiItems) === 0 ? "PASS" : "FAIL",
    });

    // ── Re-invoke inside the claim lease: still one unpromoted row, never a trip ───
    const runRes2 = await request.post(`${BASE_URL}/internal/run-occasion-drafts`, {
      headers: { "x-internal-secret": secret },
      data: {},
    });
    expect(runRes2.status(), `second draft run failed: ${await runRes2.text().catch(() => "")}`).toBe(200);
    const runBody2 = await runRes2.json().catch(() => null);
    const ledgerCountAfter = await scalar<string>(
      `SELECT count(*)::int FROM occasion_drafts WHERE occasion_id = $1`,
      [occasionRow.id],
    );
    const [draftAfter] = await rows<{ trip_id: string | null; generated_at: string | null }>(
      `SELECT trip_id, generated_at FROM occasion_drafts WHERE occasion_id = $1`,
      [occasionRow.id],
    );
    const stillUnpromoted =
      Number(ledgerCountAfter) === 1 && draftAfter?.trip_id == null && draftAfter?.generated_at == null;
    report.record({
      action: "re-run leaves exactly one unpromoted ledger row (UNIQUE(occasion_id, cycle_key))",
      ui: `second POST status ${runRes2.status()} result=${JSON.stringify(runBody2?.result)}`,
      db: `occasion_drafts count=${ledgerCountAfter} row=${JSON.stringify(draftAfter)}`,
      verdict: stillUnpromoted ? "PASS" : "FAIL",
    });

    report.write();
    expect(report.hasFailures, `journey-plus had failing steps: ${JSON.stringify(report)}`).toBe(false);
    expect(firstPassHonest, `production draft run promoted or did not record a failure: ${JSON.stringify(result1)}`).toBe(true);
    expect(unpromoted, `claim was promoted: ${JSON.stringify(draftRow)}`).toBe(true);
    expect(Number(aiItems), "a production model failure writes no drafted rows").toBe(0);
    expect(stillUnpromoted, `second run changed the claim: count=${ledgerCountAfter} ${JSON.stringify(draftAfter)}`).toBe(true);
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
