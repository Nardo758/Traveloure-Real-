/**
 * matrix-lane: Persona Lane B — supply-provider
 *
 * Kyoto provider persona (`persona-kyoto-provider@traveloure.test`) — creates and publishes the
 * two named provider services the demand journeys purchase BY NAME:
 *   - "Kyoto Portrait Route Planning Call" ($75)
 *   - "Gion Photo Session Preparation Call" ($95)
 *
 * Governing docs: docs/testing/PERSONA_LANE_B_HANDOFF.md ("supply-provider.spec.ts"),
 * docs/testing/PERSONA_JOURNEYS.md. Must run BEFORE journey-traveler.spec.ts (supply before
 * demand — see persona-nightly.yml ordering).
 *
 * Verification wall: the persona's `service_provider_forms` row is pre-verified by
 * scripts/seed-personas.ts (identity + business, since Stripe Identity/KYB cannot run in CI and
 * the wizard's Submit button is flatly disabled without it — see that script's header). This
 * spec asserts the seeded state rather than re-submitting the application (POST
 * /api/provider-application 400s on an existing form; there is no resubmission branch for
 * providers, unlike experts), then exercises the REAL edit endpoint
 * (PATCH /api/provider-application officeLocation) on top of it.
 *
 * Delivery method: both services use "call" (phone call) — no meeting pin, no deliverable file,
 * so the two extra gated flows (in_person/hybrid meeting point, pdf deliverable) stay out of
 * scope for this fixture.
 *
 * Admin approval is driven via the real, admin-gated endpoint
 * (POST /api/admin/provider-services/:id/approve) logged in as the CI-seeded admin
 * (ci-admin@traveloure.test — scripts/seed-ci-test-users.ts) rather than a new admin rail.
 */
import { test, expect, request as pwRequest } from "@playwright/test";
import {
  BASE_URL,
  rows,
  scalar,
  closePool,
  PERSONAS,
  CI_ADMIN_EMAIL,
  CI_ADMIN_PASSWORD,
  KYOTO,
  loginAs,
  driveServiceFormToSubmit,
  checkpoint,
  JourneyReport,
} from "./_persona-helpers";

test.setTimeout(180_000);

const SERVICES = [
  {
    name: "Kyoto Portrait Route Planning Call",
    description: "A planning call to route your Kyoto portrait session around light and crowds.",
    price: 75,
    duration: "45 minutes",
    offeringSearchTerm: "photo",
  },
  {
    name: "Gion Photo Session Preparation Call",
    description: "A prep call for a Gion photo session — timing, permissions, and wardrobe notes.",
    price: 95,
    duration: "30 minutes",
    offeringSearchTerm: "photo",
  },
] as const;

test.afterAll(async () => {
  await closePool();
});

test.describe("supply-provider — Kyoto provider persona", () => {
  test.describe.configure({ mode: "serial" });

  test("provider profile is seed-verified, two named services publish, availability persists", async ({ page }) => {
    const report = new JourneyReport("supply-provider");
    const request = page.request;

    // ── Step 1-2: log in, open the provider console ────────────────────────────────────────
    const actor = await loginAs(request, PERSONAS.kyotoProvider);
    report.record({
      action: "login as persona-kyoto-provider",
      ui: "POST /api/auth/login 200",
      db: `users.id=${actor.id} role=${actor.role}`,
      verdict: actor.role === "service_provider" ? "PASS" : "FAIL",
    });

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("networkidle");
    const consoleLink = page.getByTestId("link-provider-console");
    const consoleLinkVisible = await consoleLink.isVisible().catch(() => false);
    if (consoleLinkVisible) await consoleLink.click();
    else await page.goto(`${BASE_URL}/provider/dashboard`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "supply-provider-console");
    report.record({
      action: "open provider console",
      ui: consoleLinkVisible ? "clicked link-provider-console" : "navigated to /provider/dashboard",
      db: "n/a (navigation)",
      verdict: "PASS",
    });

    // ── Step 3: seed-verified profile — assert, then exercise a REAL edit on top ────────────
    const formRow = await scalar<string>(
      `SELECT identity_verification_status FROM service_provider_forms WHERE user_id = $1`,
      [actor.id],
    );
    const bizVerified = await scalar<string>(
      `SELECT business_verification_status FROM service_provider_forms WHERE user_id = $1`,
      [actor.id],
    );
    const cityRow = await scalar<string>(`SELECT city FROM service_provider_forms WHERE user_id = $1`, [actor.id]);
    const statusRes = await request.get(`${BASE_URL}/api/provider-application`);
    expect(statusRes.status()).toBe(200);
    const statusBody = await statusRes.json();
    report.record({
      action: "assert seed-verified provider profile (identity + business)",
      ui: `GET /api/provider-application 200, identityVerificationStatus=${statusBody?.identityVerificationStatus}`,
      db: `service_provider_forms.identity_verification_status=${formRow} business_verification_status=${bizVerified} city=${cityRow}`,
      verdict: formRow === "verified" && bizVerified === "verified" && cityRow === KYOTO ? "PASS" : "FAIL",
    });

    // Real edit path: PATCH officeLocation (Kyoto Station coordinates) — proves a live write on
    // top of the seeded base, per the allowlist rail (§14/§18/§19 do not apply — provider config).
    const patchRes = await request.patch(`${BASE_URL}/api/provider-application`, {
      data: { officeLocation: { address: "Kyoto Station, Kyoto", lat: 34.9858, lng: 135.7588 } },
    });
    const officeLocationAfter = await scalar<string>(
      `SELECT office_location::text FROM service_provider_forms WHERE user_id = $1`,
      [actor.id],
    );
    report.record({
      action: "PATCH /api/provider-application officeLocation (real edit on the seeded form)",
      ui: `PATCH status ${patchRes.status()}`,
      db: `service_provider_forms.office_location=${officeLocationAfter}`,
      verdict: patchRes.status() === 200 && officeLocationAfter?.includes("34.9858") ? "PASS" : "FAIL",
    });

    // ── Steps 4-5: create the two named services through the live wizard ────────────────────
    const serviceIds: Record<string, string> = {};
    for (const svc of SERVICES) {
      await page.goto(`${BASE_URL}/provider/services/new`);
      await page.waitForLoadState("networkidle");
      const clicked = await driveServiceFormToSubmit(
        page,
        { name: svc.name, description: svc.description, price: svc.price, duration: svc.duration, offeringSearchTerm: svc.offeringSearchTerm, deliveryMethod: "call" },
        "submit",
      );
      await page.waitForTimeout(1_500);
      await checkpoint(page, `supply-provider-service-${svc.name.replace(/\s+/g, "-")}`);

      const svcRow = await scalar<string>(
        `SELECT id FROM provider_services WHERE user_id = $1 AND service_name = $2 ORDER BY created_at DESC LIMIT 1`,
        [actor.id, svc.name],
      );
      if (svcRow) serviceIds[svc.name] = svcRow;
      report.record({
        action: `create service "${svc.name}" via ServiceForm wizard`,
        ui: `wizard submit button clicked: ${clicked ?? "NONE FOUND"}`,
        db: svcRow ? `provider_services.id=${svcRow}` : "no matching provider_services row",
        verdict: svcRow ? "PASS" : "FAIL",
        note: clicked ? undefined : "wizard never reached a submit/publish button within the step guard",
      });
    }

    // ── Step 5b: both named services owned by the provider, in the product's normal approval
    //     state. Name-scoped, retry-safe (not a blanket count) — same reasoning as
    //     supply-expert.spec.ts: a Playwright retry re-runs this whole test without deleting a
    //     prior failed attempt's rows, so the raw row count for this user can legitimately exceed
    //     2 without either named service actually being missing. ─────────────────────────────
    const ownedByName = await rows<{ service_name: string; cnt: string }>(
      `SELECT service_name, count(*)::int AS cnt FROM provider_services
       WHERE user_id = $1 AND service_name = ANY($2::text[]) GROUP BY service_name`,
      [actor.id, SERVICES.map((s) => s.name)],
    );
    const namesFound = new Set(ownedByName.map((r) => r.service_name));
    const allNamesPresent = SERVICES.every((s) => namesFound.has(s.name));
    report.record({
      action: "assert both named services are owned by the provider (name-scoped, retry-safe)",
      ui: "n/a",
      db: JSON.stringify(ownedByName),
      verdict: allNamesPresent ? "PASS" : "FAIL",
    });

    // ── Step 6: save availability via the calendar UI's real endpoint, materializing slots ──
    for (const [name, id] of Object.entries(serviceIds)) {
      const patRes = await request.put(`${BASE_URL}/api/provider/services/${id}/availability-patterns`, {
        data: { patterns: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", capacity: 3 }] },
      });
      const slotCount = await scalar<string>(
        `SELECT count(*)::int FROM vendor_availability_slots WHERE service_id = $1`,
        [id],
      );
      report.record({
        action: `save weekly availability pattern for "${name}"`,
        ui: `PUT availability-patterns status ${patRes.status()}`,
        db: `vendor_availability_slots count=${slotCount}`,
        verdict: patRes.status() === 200 && Number(slotCount) > 0 ? "PASS" : "FAIL",
      });
    }

    // ── Step 7: admin approves both listings via the real admin-gated endpoint ───────────────
    const adminCtx = await pwRequest.newContext({ baseURL: BASE_URL });
    const adminRes = await adminCtx.post(`${BASE_URL}/api/auth/login`, {
      data: { email: CI_ADMIN_EMAIL, password: CI_ADMIN_PASSWORD },
    });
    const adminLoginOk = adminRes.status() === 200;
    for (const [name, id] of Object.entries(serviceIds)) {
      const approveRes = adminLoginOk
        ? await adminCtx.post(`${BASE_URL}/api/admin/provider-services/${id}/approve`)
        : null;
      const finalRow = await rows<{ approval_status: string; status: string }>(
        `SELECT approval_status, status FROM provider_services WHERE id = $1`,
        [id],
      );
      report.record({
        action: `admin approves "${name}"`,
        ui: adminLoginOk ? `POST approve status ${approveRes?.status()}` : `admin login failed (${adminRes.status()})`,
        db: JSON.stringify(finalRow[0]),
        verdict: finalRow[0]?.approval_status === "approved" ? "PASS" : "FAIL",
      });
    }
    await adminCtx.dispose();

    // ── Step 7b: public service-detail route renders once approved ──────────────────────────
    for (const [name, id] of Object.entries(serviceIds)) {
      const pubCtx = await pwRequest.newContext({ baseURL: BASE_URL });
      const pubRes = await pubCtx.get(`${BASE_URL}/services/${id}`);
      report.record({
        action: `public route renders "${name}"`,
        ui: `GET /services/${id} status ${pubRes.status()}`,
        db: "n/a (public read)",
        verdict: pubRes.status() === 200 ? "PASS" : "FAIL",
      });
      await pubCtx.dispose();
    }

    report.write();
    expect(report.hasFailures, `supply-provider had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });

  test("re-run is idempotent — no duplicate services or availability slots", async ({ page }) => {
    const report = new JourneyReport("supply-provider-idempotence");
    const request = page.request;
    const actor = await loginAs(request, PERSONAS.kyotoProvider);

    for (const svc of SERVICES) {
      const dupeCount = await scalar<string>(
        `SELECT count(*)::int FROM provider_services WHERE user_id = $1 AND service_name = $2`,
        [actor.id, svc.name],
      );
      report.record({
        action: `no duplicate "${svc.name}" row`,
        ui: "n/a",
        db: `count=${dupeCount}`,
        verdict: Number(dupeCount) === 1 ? "PASS" : "FAIL",
      });

      const svcId = await scalar<string>(
        `SELECT id FROM provider_services WHERE user_id = $1 AND service_name = $2 LIMIT 1`,
        [actor.id, svc.name],
      );
      if (svcId) {
        // Add-only materializer (server/services/availability-materializer.service.ts):
        // re-PUTting the SAME pattern must never clobber or duplicate slots.
        const before = await scalar<string>(
          `SELECT count(*)::int FROM vendor_availability_slots WHERE service_id = $1`,
          [svcId],
        );
        await request.put(`${BASE_URL}/api/provider/services/${svcId}/availability-patterns`, {
          data: { patterns: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", capacity: 3 }] },
        });
        const after = await scalar<string>(
          `SELECT count(*)::int FROM vendor_availability_slots WHERE service_id = $1`,
          [svcId],
        );
        report.record({
          action: `re-save the identical availability pattern for "${svc.name}"`,
          ui: "n/a",
          db: `slot count before=${before} after=${after}`,
          verdict: before === after ? "PASS" : "FAIL",
        });
      }
    }

    report.write();
    expect(report.hasFailures, `supply-provider idempotence had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });
});
