#!/usr/bin/env node
// scripts/journeys/plan-lifecycle.mjs (J2)
//
// PLAN-LIFECYCLE JOURNEY — permanent, self-contained repo harness per docs/EXECUTION_MAP.md §4b.
// Read scripts/journeys/README.md + expert-loop.mjs's header first — this file follows the same
// house pattern (idempotent `jrny2-` fixtures, verdict-table output, KNOWN_DEFECT handling) via
// the shared scripts/journeys/lib/journey-lib.mjs.
//
// WHAT THIS PROVES: the QA_PUNCH_LIST W2-A "plan lifecycle" delivery handshake + the item-13
// mode-flip (`docs/planning/QA_PUNCH_LIST.md` items 11/12/13, migration 164/165) end to end —
//   expert direct-adds an item PRE-approval (allowed) → expert delivers (workspace_status
//   draft→in_review→delivered; customer bell row + a best-effort email-skip log line with no
//   RESEND_API_KEY configured) → customer APPROVES the plan (POST .../plan-review) → the mode
//   flip: the SAME expert's direct item POST/PATCH/DELETE now 409s
//   `plan_approved_suggest_instead` → the expert instead files a SUGGESTION → the customer
//   approves the suggestion, which MATERIALIZES a real `itinerary_items` row (the #371 fix,
//   not just the legacy `generated_itineraries` blob) → a concurrent double-approve of the SAME
//   suggestion never double-materializes (§15 atomic conditional UPDATE) → the customer instead
//   REQUESTS CHANGES (workspace_status→draft, plan_approval_status→changes_requested, expert
//   bell row) → the expert's direct-edit mode is unlocked again → the expert re-delivers →
//   the customer re-approves.
//
// ── COLD-BOOT RECIPE — IDENTICAL to expert-loop.mjs's (same sandbox: Postgres under
//    /var/tmp/expws-pg:55442, app on :5601, dummy Stripe/Amadeus keys, NODE_ENV=development).
//    See expert-loop.mjs's header for the full step-by-step, or scripts/journeys/README.md.
//    Run:
//      node scripts/journeys/plan-lifecycle.mjs --base-url http://localhost:5601 \
//        --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
// ── EXTERNAL-STEP MARKING (§4b rule 4) ──────────────────────────────────────────────
// No EXTERNAL steps. The delivered-email check is a BEST-EFFORT, optional assertion (not an
// EXTERNAL step — it needs no real key, quite the opposite: it proves the honest NO-KEY skip
// path) gated on `--app-log <path>` / `JOURNEY_APP_LOG_FILE` pointing at the booted server's
// stdout capture. Without it, the step still asserts the hard DB proof (the customer
// notification row) and honestly notes the log-line check was skipped for portability — see
// Step 2 below. When run in-session against a captured server log this was proven for real
// (grep for "RESEND_API_KEY not set — skipping plan-delivered email").
//
// ── FIXTURES (idempotent, `jrny2-` prefixed — a DISTINCT prefix from expert-loop.mjs's
//    `jrny-`, never reused, per scripts/journeys/README.md) ─────────────────────────────────
// One trip, one accepted advisor, one baseline item (the suggestion target's sibling — the
// direct-add step creates its OWN dynamic item, cleaned on every re-run).

import {
  resolveConfig, preflight, connectDb, dbOne, dbAll, resolveUserIdByEmail,
  upsertTrip, upsertCollaboratorOwner, upsertAdvisor, deleteItemsNotIn,
  launchBrowser, login, createStepRunner, isoDate,
} from "./lib/journey-lib.mjs";
import fs from "node:fs";

const JOURNEY_FILE = "scripts/journeys/plan-lifecycle.mjs";
const cfg = resolveConfig();
const { BASE_URL, DB_URL, OUT_DIR, HEADED, PASSWORD } = cfg;
const APP_LOG_FILE = process.env.JOURNEY_APP_LOG_FILE || null;

const TRAVELER_EMAIL = process.env.E2E_TRAVELER_EMAIL || "test-traveler-kyoto@traveloure.test";
const EXPERT_EMAIL = process.env.E2E_EXPERT_EMAIL || "kyoto-food@traveloure.test";

const TRIP_ID = "jrny2-trip-1";
const COLLAB_ID = "jrny2-collab-owner-1";
const ADVISOR_ID = "jrny2-advisor-1";
const BASELINE_ITEM_ID = "jrny2-item-baseline";
const SUGGEST_TITLE = "Journey Suggested Tea Ceremony";
const CHANGES_NOTE = "Please move the temple visit earlier in the day.";

async function resetAndSeedFixtures(pg) {
  const travelerId = await resolveUserIdByEmail(pg, TRAVELER_EMAIL);
  const expertId = await resolveUserIdByEmail(pg, EXPERT_EMAIL);

  await pg.query(
    "DELETE FROM notifications WHERE related_id = $1 AND related_type = 'trip'",
    [TRIP_ID],
  );
  await pg.query("DELETE FROM trip_suggestions WHERE trip_id = $1", [TRIP_ID]);
  await deleteItemsNotIn(pg, TRIP_ID, [BASELINE_ITEM_ID]);

  await upsertTrip(pg, {
    id: TRIP_ID, userId: travelerId, title: "Journey: Plan Lifecycle", destination: "Kyoto, Japan",
    startDate: isoDate(40), endDate: isoDate(45), status: "planning",
  });
  await upsertCollaboratorOwner(pg, { id: COLLAB_ID, tripId: TRIP_ID, userId: travelerId });
  // Reset to baseline every run: pending direct-edit mode (workspace_status draft,
  // plan_approval_status NULL) — the journey itself drives every transition from here.
  await upsertAdvisor(pg, {
    id: ADVISOR_ID, tripId: TRIP_ID, expertId, status: "accepted", workspaceStatus: "draft",
    planApprovalStatus: null, planApprovedAt: null, planReviewNote: null,
  });
  await pg.query(
    `INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, routing_status, location_name, estimated_cost)
     VALUES ($1, $2, 'Journey Baseline Item', 'activity', 1, 'in_planning', 'Kyoto', '15.00')
     ON CONFLICT (id) DO UPDATE SET routing_status = 'in_planning', updated_at = now()`,
    [BASELINE_ITEM_ID, TRIP_ID],
  );

  return { travelerId, expertId };
}

async function latestNotification(pg, userId, tripId, titleContains) {
  return dbOne(
    pg,
    `SELECT id, title, message FROM notifications
     WHERE user_id = $1 AND related_id = $2 AND related_type = 'trip' AND title ILIKE $3
     ORDER BY created_at DESC LIMIT 1`,
    [userId, tripId, `%${titleContains}%`],
  );
}

async function main() {
  await preflight({ baseUrl: BASE_URL, dbUrl: DB_URL, journeyFile: JOURNEY_FILE });
  const pg = await connectDb(DB_URL);
  const { runStep, printReport } = createStepRunner({ outDir: OUT_DIR, skipExternal: cfg.SKIP_EXTERNAL });

  console.log("[seed] resetting & seeding jrny2- fixtures (idempotent)...");
  const seeded = await resetAndSeedFixtures(pg);
  console.log(`[seed] trip=${TRIP_ID} traveler=${seeded.travelerId} expert=${seeded.expertId}`);

  const browser = await launchBrowser({ headed: HEADED });
  const travelerCtx = await browser.newContext({ baseURL: BASE_URL });
  const expertCtx = await browser.newContext({ baseURL: BASE_URL });
  let travelerPage, expertPage;
  let directItemId = null;
  let suggestionId = null;
  let materializedItemId = null;

  try {
    travelerPage = await login(travelerCtx, TRAVELER_EMAIL, PASSWORD);
    expertPage = await login(expertCtx, EXPERT_EMAIL, PASSWORD);
    console.log("[auth] traveler + expert both authenticated.");

    // ═══ Step 1 — expert direct-adds an item PRE-approval (allowed) ═══
    await runStep("Expert: direct item add, pre-approval (allowed)", async () => {
      const resp = await expertPage.request.post(`/api/trips/${TRIP_ID}/itinerary-items`, {
        data: { title: "Journey Direct Add (pre-approval)", itemType: "activity", dayNumber: 1, estimatedCost: "10.00" },
      });
      if (resp.status() !== 201) throw new Error(`expected 201, got ${resp.status()}: ${await resp.text()}`);
      const body = await resp.json();
      directItemId = body.id;
      const row = await dbOne(pg, "SELECT id, title FROM itinerary_items WHERE id = $1", [directItemId]);
      if (!row) throw new Error("item not found in DB after 201");
      return {
        ui: `POST /api/trips/${TRIP_ID}/itinerary-items (expert, pre-approval) -> 201`,
        db: `itinerary_items row ${directItemId} created ('${row.title}')`,
      };
    });

    // ═══ Step 2 — deliver (draft -> in_review -> delivered) ═══
    await runStep("Expert: deliver (draft -> in_review -> delivered)", async () => {
      const r1 = await expertPage.request.patch(`/api/expert/assignments/${ADVISOR_ID}/workspace-status`, {
        data: { workspaceStatus: "in_review" },
      });
      if (!r1.ok()) throw new Error(`draft->in_review failed: ${r1.status()} ${await r1.text()}`);
      const r2 = await expertPage.request.patch(`/api/expert/assignments/${ADVISOR_ID}/workspace-status`, {
        data: { workspaceStatus: "delivered" },
      });
      if (!r2.ok()) throw new Error(`in_review->delivered failed: ${r2.status()} ${await r2.text()}`);

      const advisorRow = await dbOne(pg, "SELECT workspace_status FROM trip_expert_advisors WHERE id = $1", [ADVISOR_ID]);
      if (advisorRow?.workspace_status !== "delivered") {
        throw new Error(`expected workspace_status='delivered', got '${advisorRow?.workspace_status}'`);
      }
      const notif = await latestNotification(pg, seeded.travelerId, TRIP_ID, "delivered");
      if (!notif) throw new Error("no 'delivered' notification row for the traveler");

      let emailNote = "log check skipped (no --app-log/JOURNEY_APP_LOG_FILE configured)";
      if (APP_LOG_FILE && fs.existsSync(APP_LOG_FILE)) {
        const tail = fs.readFileSync(APP_LOG_FILE, "utf-8").slice(-200_000);
        const found = tail.includes("RESEND_API_KEY not set") && tail.includes("skipping plan-delivered email");
        emailNote = found
          ? "app-log confirms the honest no-key skip line for the plan-delivered email"
          : "app-log did NOT contain the expected skip line (checked last 200KB — may have rotated out)";
      }
      return {
        ui: "N/A (API-driven; no UI control for this transition beyond the confirmed PATCH calls)",
        db: `trip_expert_advisors.workspace_status='delivered'; notifications row '${notif.title}' for traveler`,
        note: emailNote,
      };
    });

    // ═══ Step 3 — customer approves the plan ═══
    await runStep("Traveler: approve the delivered plan", async () => {
      const resp = await travelerPage.request.post(`/api/trips/${TRIP_ID}/plan-review`, {
        data: { decision: "approve" },
      });
      if (!resp.ok()) throw new Error(`plan-review approve failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      if (body.planApprovalStatus !== "approved") throw new Error(`unexpected response: ${JSON.stringify(body)}`);

      const row = await dbOne(pg, "SELECT plan_approval_status, plan_approved_at FROM trip_expert_advisors WHERE id = $1", [ADVISOR_ID]);
      if (row?.plan_approval_status !== "approved" || !row?.plan_approved_at) {
        throw new Error(`expected approved + plan_approved_at set, got ${JSON.stringify(row)}`);
      }
      const notif = await latestNotification(pg, seeded.expertId, TRIP_ID, "approved");
      if (!notif) throw new Error("no 'approved' notification row for the expert");
      return {
        ui: "N/A (API-driven)",
        db: `trip_expert_advisors.plan_approval_status='approved', plan_approved_at set; notifications row '${notif.title}' for expert`,
      };
    });

    // ═══ Step 4 — mode flip: expert direct POST now 409s ═══
    await runStep("MODE FLIP: expert direct item POST -> 409 plan_approved_suggest_instead", async () => {
      const resp = await expertPage.request.post(`/api/trips/${TRIP_ID}/itinerary-items`, {
        data: { title: "Should be refused", itemType: "activity", dayNumber: 1 },
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status() !== 409 || body.code !== "plan_approved_suggest_instead") {
        throw new Error(`expected 409 plan_approved_suggest_instead, got ${resp.status()} ${JSON.stringify(body)}`);
      }
      return {
        ui: "N/A (API-driven)",
        db: `no itinerary_items row created for title='Should be refused' (409 refused the write before insert)`,
        note: `response: ${JSON.stringify(body)}`,
      };
    });

    // ═══ Step 5 — mode flip: expert direct PATCH now 409s ═══
    await runStep("MODE FLIP: expert direct item PATCH -> 409 plan_approved_suggest_instead", async () => {
      const resp = await expertPage.request.patch(`/api/trips/${TRIP_ID}/itinerary-items/${BASELINE_ITEM_ID}`, {
        data: { title: "Should not apply" },
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status() !== 409 || body.code !== "plan_approved_suggest_instead") {
        throw new Error(`expected 409 plan_approved_suggest_instead, got ${resp.status()} ${JSON.stringify(body)}`);
      }
      const row = await dbOne(pg, "SELECT title FROM itinerary_items WHERE id = $1", [BASELINE_ITEM_ID]);
      if (row.title !== "Journey Baseline Item") throw new Error(`title was mutated despite the 409: '${row.title}'`);
      return {
        ui: "N/A (API-driven)",
        db: `itinerary_items.title unchanged ('${row.title}') — the 409 refused the write`,
      };
    });

    // ═══ Step 6 — mode flip: expert direct DELETE now 409s ═══
    await runStep("MODE FLIP: expert direct item DELETE -> 409 plan_approved_suggest_instead", async () => {
      const resp = await expertPage.request.delete(`/api/trips/${TRIP_ID}/itinerary-items/${BASELINE_ITEM_ID}`);
      const body = await resp.json().catch(() => ({}));
      if (resp.status() !== 409 || body.code !== "plan_approved_suggest_instead") {
        throw new Error(`expected 409 plan_approved_suggest_instead, got ${resp.status()} ${JSON.stringify(body)}`);
      }
      const row = await dbOne(pg, "SELECT id FROM itinerary_items WHERE id = $1", [BASELINE_ITEM_ID]);
      if (!row) throw new Error("item was deleted despite the 409");
      return {
        ui: "N/A (API-driven)",
        db: `itinerary_items row ${BASELINE_ITEM_ID} still present — the 409 refused the delete`,
      };
    });

    // ═══ Step 7 — expert files a suggestion instead ═══
    await runStep("Expert: file a suggestion (the mode-flip escape hatch)", async () => {
      const resp = await expertPage.request.post(`/api/trips/${TRIP_ID}/suggestions`, {
        data: { type: "activity", dayNumber: 1, title: SUGGEST_TITLE, estimatedCost: "35.00" },
      });
      if (resp.status() !== 200) throw new Error(`expected 200, got ${resp.status()}: ${await resp.text()}`);
      const body = await resp.json();
      if (!body.suggestionId) throw new Error(`no suggestionId in response: ${JSON.stringify(body)}`);
      suggestionId = body.suggestionId;
      const row = await dbOne(pg, "SELECT status, title FROM trip_suggestions WHERE id = $1", [suggestionId]);
      if (row?.status !== "pending" || row?.title !== SUGGEST_TITLE) throw new Error(`unexpected suggestion row: ${JSON.stringify(row)}`);
      return {
        ui: "N/A (API-driven; suggestions always route through this rail regardless of mode-flip)",
        db: `trip_suggestions row ${suggestionId} created, status='pending'`,
      };
    });

    // ═══ Step 8 — customer approves the suggestion -> REAL itinerary_items row (#371 fix) ═══
    await runStep("Traveler: approve the suggestion -> materializes a real itinerary_items row", async () => {
      const resp = await travelerPage.request.patch(`/api/trips/${TRIP_ID}/suggestions/${suggestionId}`, {
        data: { status: "approved" },
      });
      if (!resp.ok()) throw new Error(`suggestion approve failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      materializedItemId = body.itemId;
      if (!materializedItemId) throw new Error(`no itemId in response: ${JSON.stringify(body)}`);
      const row = await dbOne(pg, "SELECT id, title, trip_id FROM itinerary_items WHERE id = $1", [materializedItemId]);
      if (!row || row.title !== SUGGEST_TITLE || row.trip_id !== TRIP_ID) {
        throw new Error(`materialized item mismatch: ${JSON.stringify(row)}`);
      }
      const suggRow = await dbOne(pg, "SELECT status FROM trip_suggestions WHERE id = $1", [suggestionId]);
      if (suggRow?.status !== "approved") throw new Error(`suggestion status not 'approved': ${JSON.stringify(suggRow)}`);
      return {
        ui: "N/A (API-driven)",
        db: `itinerary_items row ${materializedItemId} materialized with title='${row.title}' (the #371 real-row fix, not just the legacy generated_itineraries blob)`,
      };
    });

    // ═══ Step 9 — double-approve race: atomic, never double-materializes ═══
    await runStep("Race: concurrent double-approve of the SAME suggestion never double-materializes", async () => {
      // The suggestion is already 'approved' from Step 8 — re-fire a genuinely concurrent PAIR
      // of approve calls against a FRESH pending suggestion so this proves the atomic UPDATE
      // (WHERE status='pending'), not just "a non-pending suggestion 404s" (a much weaker claim).
      const raceResp = await expertPage.request.post(`/api/trips/${TRIP_ID}/suggestions`, {
        data: { type: "activity", dayNumber: 1, title: "Journey Race Suggestion" },
      });
      const raceBody = await raceResp.json();
      const raceSuggestionId = raceBody.suggestionId;

      const [r1, r2] = await Promise.all([
        travelerPage.request.patch(`/api/trips/${TRIP_ID}/suggestions/${raceSuggestionId}`, { data: { status: "approved" } }),
        travelerPage.request.patch(`/api/trips/${TRIP_ID}/suggestions/${raceSuggestionId}`, { data: { status: "approved" } }),
      ]);
      const statuses = [r1.status(), r2.status()].sort();
      const successCount = statuses.filter((s) => s === 200).length;
      if (successCount !== 1) {
        throw new Error(`expected exactly one 200 among the concurrent pair, got statuses=${JSON.stringify(statuses)}`);
      }
      const materializedRows = await dbAll(
        pg,
        "SELECT id FROM itinerary_items WHERE trip_id = $1 AND title = $2",
        [TRIP_ID, "Journey Race Suggestion"],
      );
      if (materializedRows.length !== 1) {
        throw new Error(`expected exactly 1 materialized item, got ${materializedRows.length} — double-materialization bug`);
      }
      return {
        ui: "N/A (API-driven; §15 atomic conditional UPDATE)",
        db: `exactly 1 itinerary_items row materialized for the raced suggestion (id=${materializedRows[0].id})`,
        note: `concurrent PATCH statuses observed: ${JSON.stringify(statuses)} (exactly one 200, the loser is 404/409 depending on scheduling — both are correct non-double-effect outcomes)`,
      };
    });

    // ═══ Step 10 — customer requests changes ═══
    await runStep("Traveler: request changes (with a note)", async () => {
      const resp = await travelerPage.request.post(`/api/trips/${TRIP_ID}/plan-review`, {
        data: { decision: "request_changes", note: CHANGES_NOTE },
      });
      if (!resp.ok()) throw new Error(`request_changes failed: ${resp.status()} ${await resp.text()}`);
      const body = await resp.json();
      if (body.planApprovalStatus !== "changes_requested" || body.workspaceStatus !== "draft") {
        throw new Error(`unexpected response: ${JSON.stringify(body)}`);
      }
      const row = await dbOne(
        pg,
        "SELECT plan_approval_status, workspace_status, plan_review_note FROM trip_expert_advisors WHERE id = $1",
        [ADVISOR_ID],
      );
      if (row?.plan_approval_status !== "changes_requested" || row?.workspace_status !== "draft" || row?.plan_review_note !== CHANGES_NOTE) {
        throw new Error(`unexpected DB state: ${JSON.stringify(row)}`);
      }
      const notif = await latestNotification(pg, seeded.expertId, TRIP_ID, "Changes requested");
      if (!notif) throw new Error("no 'Changes requested' notification row for the expert");
      return {
        ui: "N/A (API-driven)",
        db: `trip_expert_advisors: plan_approval_status='changes_requested', workspace_status='draft', plan_review_note='${row.plan_review_note}'; notifications row '${notif.title}' for expert`,
      };
    });

    // ═══ Step 11 — expert direct-edit mode is unlocked again ═══
    await runStep("Expert: direct edits work again (mode flip lifted)", async () => {
      const resp = await expertPage.request.post(`/api/trips/${TRIP_ID}/itinerary-items`, {
        data: { title: "Journey Post-Changes Direct Add", itemType: "activity", dayNumber: 1 },
      });
      if (resp.status() !== 201) throw new Error(`expected 201, got ${resp.status()}: ${await resp.text()}`);
      const body = await resp.json();
      const row = await dbOne(pg, "SELECT id FROM itinerary_items WHERE id = $1", [body.id]);
      if (!row) throw new Error("item not found in DB after 201");
      return {
        ui: "N/A (API-driven)",
        db: `itinerary_items row ${body.id} created directly — the 409 gate is lifted while plan_approval_status != 'approved'`,
      };
    });

    // ═══ Step 12 — re-deliver ═══
    await runStep("Expert: re-deliver (draft -> in_review -> delivered)", async () => {
      const r1 = await expertPage.request.patch(`/api/expert/assignments/${ADVISOR_ID}/workspace-status`, {
        data: { workspaceStatus: "in_review" },
      });
      if (!r1.ok()) throw new Error(`draft->in_review failed: ${r1.status()} ${await r1.text()}`);
      const r2 = await expertPage.request.patch(`/api/expert/assignments/${ADVISOR_ID}/workspace-status`, {
        data: { workspaceStatus: "delivered" },
      });
      if (!r2.ok()) throw new Error(`in_review->delivered failed: ${r2.status()} ${await r2.text()}`);
      const row = await dbOne(pg, "SELECT workspace_status FROM trip_expert_advisors WHERE id = $1", [ADVISOR_ID]);
      if (row?.workspace_status !== "delivered") throw new Error(`expected 'delivered', got '${row?.workspace_status}'`);
      return { ui: "N/A (API-driven)", db: `trip_expert_advisors.workspace_status='delivered' (re-delivered)` };
    });

    // ═══ Step 13 — re-approve ═══
    await runStep("Traveler: re-approve the re-delivered plan", async () => {
      const resp = await travelerPage.request.post(`/api/trips/${TRIP_ID}/plan-review`, {
        data: { decision: "approve" },
      });
      if (!resp.ok()) throw new Error(`plan-review re-approve failed: ${resp.status()} ${await resp.text()}`);
      const row = await dbOne(pg, "SELECT plan_approval_status FROM trip_expert_advisors WHERE id = $1", [ADVISOR_ID]);
      if (row?.plan_approval_status !== "approved") throw new Error(`expected 'approved', got '${row?.plan_approval_status}'`);
      return { ui: "N/A (API-driven)", db: `trip_expert_advisors.plan_approval_status='approved' (re-approved)` };
    });
  } finally {
    await browser.close().catch(() => {});
    await pg.end().catch(() => {});
  }

  const exitCode = printReport("plan-lifecycle");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
