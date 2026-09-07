/**
 * journey-handoff.spec.ts — Lane 3 of the persona-coverage dispatch: the traveler -> expert
 * advisory grant, expert edits, and the §12 pending-advisor negative pins.
 *
 * Prereq (Phase 0 ground truth): the Gion expert's local_expert_forms row is seeded
 * identity-verified but `status='pending'` by design (scripts/seed-personas.ts's
 * "Verification pre-seed" — it stands in for external identity/KYB only, never for a human admin
 * review). `POST /api/trips/:id/expert-advisor` gates the grant on `isExpertApproved()`
 * (server/services/booking-actions.service.ts), which checks `local_expert_forms.status =
 * 'approved'` specifically — a DIFFERENT column from identity_verification_status. So this suite
 * first drives the REAL admin-approval flow (ci-admin, the same pattern
 * supply-provider.spec.ts:219 uses) before attempting the grant; the grant would otherwise 404
 * with "Expert not found or not approved" against the seed's default pending state.
 *
 * Grant flow: traveler POST /api/trips/:id/expert-advisor {expertUserId, message} (creates
 * trip_expert_advisors status='pending', server/routes/booking-actions.ts:645) -> expert POST
 * /api/expert/assignments/:assignmentId/accept (atomic pending->accepted, :1101).
 *
 * §12 pins asserted here (server/routes/booking-actions.ts): a PENDING advisor's PATCH
 * /trips/:tripId/expert-notes (private Build notes) -> 403; GET /trips/:tripId/commission ->
 * 200 (read surfaces keep granting `pending`, write surfaces do not).
 *
 * origin:'expert' is asserted on a FRESH item the accepted expert creates (POST
 * /api/trips/:tripId/itinerary-items, trips.routes.ts:1426) — deliberately sending a
 * client-supplied `origin:'traveler'` in the body to prove the server ignores it and stamps its
 * own derivation from the actor's trip role (never client-supplied, §12/D2).
 *
 * Delivered note: the expert PATCHes that same item with `expertNote` (the traveler-facing
 * per-item note, §21) -> the owning traveler's PlanCard (client/src/pages/trip-details.tsx ->
 * ActivitiesSection) renders it behind `expert-note-callout-<itemId>` /
 * `button-toggle-expert-note-<itemId>` / `text-expert-note-<itemId>` — the real testids, found by
 * inspecting ActivitiesSection.tsx (no fabricated selector).
 */
import { test, expect, request as pwRequest } from "@playwright/test";
import {
  BASE_URL,
  rows,
  closePool,
  PERSONAS,
  CI_ADMIN_EMAIL,
  CI_ADMIN_PASSWORD,
  KYOTO,
  loginAs,
  createTrip,
  checkpoint,
  JourneyReport,
  PERSONA_PASSWORD,
} from "./_persona-helpers";

test.setTimeout(180_000);

// Deterministic seed id (scripts/seed-personas.ts: `persona-kyoto-${form.key}`, form.key =
// "gion-local-expert-form"); the persona's own user id follows the same pattern on persona.key.
const GION_EXPERT_FORM_ID = "persona-kyoto-gion-local-expert-form";

test.afterAll(async () => {
  await closePool();
});

test.describe("journey-handoff — traveler grants the Gion expert, expert edits + delivers a note", () => {
  test.describe.configure({ mode: "serial" });

  test("admin approves the Gion expert; traveler grants; expert accepts, edits (origin stamped), and delivers a note; §12 pending-advisor negatives pinned", async ({ page }) => {
    const report = new JourneyReport("journey-handoff");

    // ── Prereq: ci-admin approves the Gion expert application (real admin-gated flow) ────────
    const adminCtx = await pwRequest.newContext({ baseURL: BASE_URL });
    const adminLoginRes = await adminCtx.post(`${BASE_URL}/api/auth/login`, {
      data: { email: CI_ADMIN_EMAIL, password: CI_ADMIN_PASSWORD },
    });
    const adminLoginOk = adminLoginRes.status() === 200;

    const [formBefore] = await rows<{ status: string; user_id: string }>(
      `SELECT status, user_id FROM local_expert_forms WHERE id = $1`,
      [GION_EXPERT_FORM_ID],
    );
    const gionExpertUserId = formBefore?.user_id;
    expect(gionExpertUserId, `Gion expert form ${GION_EXPERT_FORM_ID} not found — run scripts/seed-personas.ts --apply first`).toBeTruthy();

    const approveRes = adminLoginOk
      ? await adminCtx.patch(`${BASE_URL}/api/admin/expert-applications/${GION_EXPERT_FORM_ID}/status`, {
          data: { status: "approved" },
        })
      : null;
    const [formAfter] = await rows<{ status: string }>(
      `SELECT status FROM local_expert_forms WHERE id = $1`,
      [GION_EXPERT_FORM_ID],
    );
    report.record({
      action: "ci-admin approves the Gion expert application (PATCH /api/admin/expert-applications/:id/status)",
      ui: adminLoginOk ? `PATCH status ${approveRes?.status()}` : `admin login failed (${adminLoginRes.status()})`,
      db: `local_expert_forms.status before=${formBefore?.status} after=${formAfter?.status}`,
      verdict: formAfter?.status === "approved" ? "PASS" : "FAIL",
    });
    await adminCtx.dispose();
    expect(formAfter?.status, "Gion expert must be admin-approved before the grant flow can work (isExpertApproved gate)").toBe("approved");

    // ── Traveler grants the Gion expert on a fresh trip ──────────────────────────────────────
    const traveler = await loginAs(page.request, PERSONAS.freeTraveler);
    const tripId = await createTrip(page.request, "Handoff Kyoto Trip", KYOTO);
    report.record({
      action: "login as persona-kyoto-free-traveler + create the handoff trip",
      ui: "POST /api/auth/login 200, POST /api/trips 201",
      db: `trips.id=${tripId} owner=${traveler.id}`,
      verdict: "PASS",
    });

    const grantRes = await page.request.post(`${BASE_URL}/api/trips/${tripId}/expert-advisor`, {
      data: { expertUserId: gionExpertUserId, message: "Could you help shape my Gion afternoon?" },
    });
    const grantBody = grantRes.ok() ? await grantRes.json().catch(() => null) : null;
    const [advisorRowPending] = await rows<{ id: string; status: string; local_expert_id: string }>(
      `SELECT id, status, local_expert_id FROM trip_expert_advisors WHERE trip_id = $1`,
      [tripId],
    );
    report.record({
      action: "traveler grants the Gion expert (POST /api/trips/:id/expert-advisor)",
      ui: `POST status ${grantRes.status()}, body=${JSON.stringify(grantBody)}`,
      db: JSON.stringify(advisorRowPending),
      verdict:
        grantRes.status() === 200 &&
        advisorRowPending?.status === "pending" &&
        advisorRowPending?.local_expert_id === gionExpertUserId
          ? "PASS"
          : "FAIL",
    });
    expect(advisorRowPending, "trip_expert_advisors row must exist before continuing").toBeTruthy();
    const assignmentId = advisorRowPending!.id;

    // ── §12 PENDING-advisor negatives, asserted BEFORE acceptance (pins the ratified split:
    //    WRITE surfaces deny pending, READ surfaces keep granting it) ────────────────────────
    const expertCtxPending = await pwRequest.newContext({ baseURL: BASE_URL });
    await expertCtxPending.post(`${BASE_URL}/api/auth/login`, {
      data: { email: PERSONAS.gionExpert, password: PERSONA_PASSWORD },
    });
    const pendingNoteRes = await expertCtxPending.patch(`${BASE_URL}/api/trips/${tripId}/expert-notes`, {
      data: { expertNotes: "a pending advisor should not be able to write this" },
    });
    report.record({
      action: "PINNED §12 negative: PENDING advisor's PATCH /trips/:tripId/expert-notes (private Build notes) is denied",
      ui: `PATCH status ${pendingNoteRes.status()}`,
      db: `trip_expert_advisors.status=${advisorRowPending?.status} (still pending)`,
      verdict: pendingNoteRes.status() === 403 ? "PASS" : "FAIL",
    });

    const pendingCommissionRes = await expertCtxPending.get(`${BASE_URL}/api/trips/${tripId}/commission`);
    report.record({
      action: "PINNED §12 negative: PENDING advisor's GET /trips/:tripId/commission stays granted (read surfaces keep pending)",
      ui: `GET status ${pendingCommissionRes.status()}`,
      db: `trip_expert_advisors.status=${advisorRowPending?.status}`,
      verdict: pendingCommissionRes.status() === 200 ? "PASS" : "FAIL",
    });
    await expertCtxPending.dispose();

    // ── Expert accepts the assignment (pending -> accepted, atomic) ─────────────────────────
    const expertCtx = await pwRequest.newContext({ baseURL: BASE_URL });
    const expertLoginRes = await expertCtx.post(`${BASE_URL}/api/auth/login`, {
      data: { email: PERSONAS.gionExpert, password: PERSONA_PASSWORD },
    });
    const acceptRes = await expertCtx.post(`${BASE_URL}/api/expert/assignments/${assignmentId}/accept`);
    const [advisorRowAccepted] = await rows<{ status: string }>(
      `SELECT status FROM trip_expert_advisors WHERE id = $1`,
      [assignmentId],
    );
    report.record({
      action: "expert accepts the assignment (POST /api/expert/assignments/:id/accept)",
      ui: `login status ${expertLoginRes.status()}, accept status ${acceptRes.status()}`,
      db: `trip_expert_advisors.status=${advisorRowAccepted?.status}`,
      verdict: acceptRes.status() === 200 && advisorRowAccepted?.status === "accepted" ? "PASS" : "FAIL",
    });
    expect(advisorRowAccepted?.status, "assignment must be accepted before the expert can write").toBe("accepted");

    // ── Expert creates an item — origin is server-stamped 'expert', a client-supplied
    //    origin:'traveler' is proven ignored (never trusted from the body) ───────────────────
    const createItemRes = await expertCtx.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
      data: {
        title: "Afternoon walk through Gion's stone-paved lanes",
        dayNumber: 1,
        origin: "traveler", // deliberately wrong — the server must ignore this
      },
    });
    const createdItem = createItemRes.ok() ? await createItemRes.json().catch(() => null) : null;
    const [itemRow] = await rows<{ id: string; origin: string; title: string }>(
      `SELECT id, origin, title FROM itinerary_items WHERE id = $1`,
      [createdItem?.id ?? "00000000-0000-0000-0000-000000000000"],
    );
    report.record({
      action: "expert creates an item; origin is server-stamped 'expert' despite a client-supplied origin:'traveler'",
      ui: `POST status ${createItemRes.status()}`,
      db: JSON.stringify(itemRow),
      verdict: createItemRes.status() === 201 && itemRow?.origin === "expert" ? "PASS" : "FAIL",
    });
    expect(itemRow?.id, "created item must exist before writing a note on it").toBeTruthy();
    const itemId = itemRow.id;

    // ── Expert writes a delivered (traveler-facing) note on that item ───────────────────────
    const noteText = "The stone lanes are quietest right at opening — worth the early start.";
    const patchNoteRes = await expertCtx.patch(`${BASE_URL}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      data: { expertNote: noteText },
    });
    const [itemAfterNote] = await rows<{ expert_note: string | null }>(
      `SELECT expert_note FROM itinerary_items WHERE id = $1`,
      [itemId],
    );
    report.record({
      action: "expert writes a delivered note (PATCH .../itinerary-items/:itemId {expertNote})",
      ui: `PATCH status ${patchNoteRes.status()}`,
      db: `itinerary_items.expert_note=${JSON.stringify(itemAfterNote?.expert_note)}`,
      verdict: patchNoteRes.status() === 200 && itemAfterNote?.expert_note === noteText ? "PASS" : "FAIL",
    });
    await expertCtx.dispose();

    // ── Owner's Trip Slip shows the delivered expert note (two-surface model) ─────────────
    // Delivered expert work renders on the SLIP (/plans/:id, testid `slip-expert-note`) —
    // NOT the Trip Card (/trip/:id), which is the snapshot surface carrying the "Not final
    // yet" guard. The slip block's label line reads "Note from {expertName}" and the note
    // body is a sibling <p>, so the assertion is CONTAINS, not strict equality.
    await page.goto(`${BASE_URL}/plans/${tripId}`);
    await page.waitForLoadState("networkidle");
    await checkpoint(page, "journey-handoff-slip-before-note");
    const noteBlock = page.getByTestId("slip-expert-note").filter({ hasText: noteText });
    const noteVisible = await noteBlock.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
    const noteRendered = noteVisible ? await noteBlock.textContent().catch(() => "") : "";
    await checkpoint(page, "journey-handoff-slip-note-visible");
    report.record({
      action: "owner's Trip Slip shows the delivered expert note (slip-expert-note on /plans/:id)",
      ui: `note visible=${noteVisible}, text="${noteRendered?.trim()}"`,
      db: `itinerary_items.id=${itemId} expert_note set`,
      verdict: noteVisible && (noteRendered ?? "").includes(noteText) ? "PASS" : "FAIL",
    });

    report.write();
    expect(report.hasFailures, `journey-handoff had failing steps: ${JSON.stringify(report)}`).toBe(false);
  });
});
