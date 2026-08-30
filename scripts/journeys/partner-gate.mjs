#!/usr/bin/env node
// scripts/journeys/partner-gate.mjs (J6)
//
// PARTNER-GATE JOURNEY — permanent, self-contained repo harness per docs/EXECUTION_MAP.md §4b.
// Read scripts/journeys/README.md + expert-loop.mjs's header first — same house pattern via
// scripts/journeys/lib/journey-lib.mjs (idempotent `jrny6-` fixtures, verdict-table output).
//
// WHAT THIS PROVES: the QA_PUNCH_LIST item 10 tier-(c) customer-approval gate on partner-catalog
// content, on an ASSIGNMENT trip (not an authored build — the tier this gate actually exists
// for) — the expert adding a partner item does NOT write an itinerary_items row directly; it
// files a `trip_suggestions` row instead (the same rail an "AI-guessed" suggestion uses), so the
// item is genuinely LOCKED (absent from the plan, and therefore from the Booking Brief flow that
// reads the plan) until the customer approves it. Approval then MATERIALIZES the real item
// carrying the "Partner: <Network>" marker (the same #371 real-row fix J2 proves generally).
// Finally, the §16 sweep: every value written to title/description/notes across BOTH the
// suggestion and the materialized item is scanned for a raw `https?://` substring — the
// affiliate URL must never reach a stored column, only the honest "Partner: <Network>" marker
// (mirrors workstation-build.mjs's write-path proof, on the suggestion rail this time).
//
// ── COLD-BOOT RECIPE — IDENTICAL to expert-loop.mjs's (see its header, or README.md).
//      node scripts/journeys/partner-gate.mjs --base-url http://localhost:5601 \
//        --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
// ── EXTERNAL-STEP MARKING (§4b rule 4) ──────────────────────────────────────────────
// No EXTERNAL steps. Same rationale as workstation-build.mjs's partner-catalog step: the write
// SHAPE (title/description with the "Partner: <Network>" marker, no bookingUrl/affiliateUrl
// ever read onto it) is what's under test, and it's identical regardless of whether the raw
// feed data came from a live Travelpayouts call (needs a real TRAVELPAYOUTS_TOKEN, unavailable
// locally) or this fixture — the picker's own write path never reads the affiliate URL either
// way (see partner-catalog-picker.tsx's §16 comment).
//
// ── FIXTURES (idempotent, `jrny6-` prefixed) ────────────────────────────────────────
// One assignment trip (owner=traveler, ACCEPTED advisor=expert), reset every run.

import {
  resolveConfig, preflight, connectDb, dbOne, dbAll, resolveUserIdByEmail,
  upsertTrip, upsertCollaboratorOwner, upsertAdvisor,
  launchBrowser, login, createStepRunner, isoDate,
} from "./lib/journey-lib.mjs";

const JOURNEY_FILE = "scripts/journeys/partner-gate.mjs";
const cfg = resolveConfig();
const { BASE_URL, DB_URL, OUT_DIR, HEADED, PASSWORD } = cfg;

const TRAVELER_EMAIL = process.env.E2E_TRAVELER_EMAIL || "test-traveler-kyoto@traveloure.test";
const EXPERT_EMAIL = process.env.E2E_EXPERT_EMAIL || "kyoto-food@traveloure.test";

const TRIP_ID = "jrny6-trip-1";
const COLLAB_ID = "jrny6-collab-owner-1";
const ADVISOR_ID = "jrny6-advisor-1";
const PARTNER_TITLE = "Journey Gion District Food Tour";
const PARTNER_DESCRIPTION = "Partner: Klook — Evening food-tasting walk through Gion, 6 stops.";

async function resetAndSeedFixtures(pg) {
  const travelerId = await resolveUserIdByEmail(pg, TRAVELER_EMAIL);
  const expertId = await resolveUserIdByEmail(pg, EXPERT_EMAIL);

  await pg.query("DELETE FROM trip_suggestions WHERE trip_id = $1", [TRIP_ID]);
  await pg.query("DELETE FROM itinerary_items WHERE trip_id = $1", [TRIP_ID]);

  await upsertTrip(pg, {
    id: TRIP_ID, userId: travelerId, title: "Journey: Partner Gate", destination: "Kyoto, Japan",
    startDate: isoDate(60), endDate: isoDate(65), status: "planning",
  });
  await upsertCollaboratorOwner(pg, { id: COLLAB_ID, tripId: TRIP_ID, userId: travelerId });
  await upsertAdvisor(pg, { id: ADVISOR_ID, tripId: TRIP_ID, expertId, status: "accepted", workspaceStatus: "draft" });

  return { travelerId, expertId };
}

async function main() {
  await preflight({ baseUrl: BASE_URL, dbUrl: DB_URL, journeyFile: JOURNEY_FILE });
  const pg = await connectDb(DB_URL);
  const { runStep, printReport } = createStepRunner({ outDir: OUT_DIR, skipExternal: cfg.SKIP_EXTERNAL });

  console.log("[seed] resetting & seeding jrny6- fixtures (idempotent)...");
  const seeded = await resetAndSeedFixtures(pg);
  console.log(`[seed] trip=${TRIP_ID} traveler=${seeded.travelerId} expert=${seeded.expertId}`);

  const browser = await launchBrowser({ headed: HEADED });
  const travelerCtx = await browser.newContext({ baseURL: BASE_URL });
  const expertCtx = await browser.newContext({ baseURL: BASE_URL });
  let travelerPage, expertPage;
  let suggestionId, materializedItemId;

  try {
    travelerPage = await login(travelerCtx, TRAVELER_EMAIL, PASSWORD);
    expertPage = await login(expertCtx, EXPERT_EMAIL, PASSWORD);
    console.log("[auth] traveler + expert both authenticated.");

    // ═══ Step 1 — expert adds a partner-catalog item as a SUGGESTION (assignment trip, tier-c) ═══
    await runStep(
      "Expert: add a partner-catalog item on an ASSIGNMENT trip -> files a SUGGESTION, zero items created",
      async () => {
        // Mirrors partner-catalog-picker.tsx's addMutation EXACTLY on the isAuthoring=false
        // branch: POST /trips/:id/suggestions (never itinerary-items directly) — the
        // customer-approval gate this journey exists to prove.
        const resp = await expertPage.request.post(`/api/trips/${TRIP_ID}/suggestions`, {
          data: { type: "activity", dayNumber: 1, title: PARTNER_TITLE, description: PARTNER_DESCRIPTION, estimatedCost: "38.00" },
        });
        if (resp.status() !== 200) throw new Error(`expected 200, got ${resp.status()}: ${await resp.text()}`);
        const body = await resp.json();
        suggestionId = body.suggestionId;
        if (!suggestionId) throw new Error(`no suggestionId in response: ${JSON.stringify(body)}`);

        const suggRow = await dbOne(pg, "SELECT status, title, description FROM trip_suggestions WHERE id = $1", [suggestionId]);
        if (suggRow?.status !== "pending" || suggRow?.title !== PARTNER_TITLE) {
          throw new Error(`unexpected trip_suggestions row: ${JSON.stringify(suggRow)}`);
        }
        const itemRows = await dbAll(pg, "SELECT id FROM itinerary_items WHERE trip_id = $1", [TRIP_ID]);
        if (itemRows.length !== 0) {
          throw new Error(`expected ZERO itinerary_items before approval, found ${itemRows.length}`);
        }
        return {
          ui: "N/A (API-driven, mirrors partner-catalog-picker.tsx's isAuthoring=false write path)",
          db: `trip_suggestions row ${suggestionId} created (status='pending'); itinerary_items count for this trip = 0 (item genuinely LOCKED pre-approval — the Booking Brief flow, which reads the materialized plan, sees nothing yet)`,
        };
      },
    );

    // ═══ Step 2 — customer approves -> item materialized with the Partner: marker (unlocked) ═══
    await runStep(
      "Traveler: approve the suggestion -> item materializes with the 'Partner:' marker (unlocked)",
      async () => {
        const resp = await travelerPage.request.patch(`/api/trips/${TRIP_ID}/suggestions/${suggestionId}`, {
          data: { status: "approved" },
        });
        if (!resp.ok()) throw new Error(`suggestion approve failed: ${resp.status()} ${await resp.text()}`);
        const body = await resp.json();
        materializedItemId = body.itemId;
        if (!materializedItemId) throw new Error(`no itemId in response: ${JSON.stringify(body)}`);

        const row = await dbOne(pg, "SELECT id, title, description FROM itinerary_items WHERE id = $1", [materializedItemId]);
        if (!row || row.title !== PARTNER_TITLE) throw new Error(`unexpected materialized item: ${JSON.stringify(row)}`);
        if (!(row.description ?? "").startsWith("Partner: Klook")) {
          throw new Error(`materialized item missing the 'Partner: <Network>' marker: '${row.description}'`);
        }
        const suggRow = await dbOne(pg, "SELECT status FROM trip_suggestions WHERE id = $1", [suggestionId]);
        if (suggRow?.status !== "approved") throw new Error(`suggestion status not 'approved': ${JSON.stringify(suggRow)}`);

        return {
          ui: "N/A (API-driven)",
          db: `itinerary_items row ${materializedItemId} materialized, description carries the "Partner: Klook" marker — item present = UNLOCKED (was absent = locked in Step 1)`,
        };
      },
    );

    // ═══ Step 3 — the §16 sweep: no https?:// substring anywhere in the created rows ═══
    await runStep(
      "§16 sweep: no https?:// substring in the created rows' title/description/notes",
      async () => {
        const urlPattern = /https?:\/\//i;
        const suggRow = await dbOne(
          pg,
          "SELECT title, description FROM trip_suggestions WHERE id = $1",
          [suggestionId],
        );
        const itemRow = await dbOne(
          pg,
          "SELECT title, description, notes, private_notes, expert_note FROM itinerary_items WHERE id = $1",
          [materializedItemId],
        );
        const checked = {
          "trip_suggestions.title": suggRow.title,
          "trip_suggestions.description": suggRow.description,
          "itinerary_items.title": itemRow.title,
          "itinerary_items.description": itemRow.description,
          "itinerary_items.notes": itemRow.notes,
          "itinerary_items.private_notes": itemRow.private_notes,
          "itinerary_items.expert_note": itemRow.expert_note,
        };
        const violations = Object.entries(checked).filter(([, v]) => v != null && urlPattern.test(v));
        if (violations.length > 0) {
          throw new Error(`§16 violation — URL-like string found in: ${JSON.stringify(violations)}`);
        }
        return {
          ui: "N/A (API-driven)",
          db: `${Object.keys(checked).length} columns scanned across trip_suggestions + itinerary_items — zero contain an https?:// substring`,
        };
      },
    );
  } finally {
    await browser.close().catch(() => {});
    await pg.end().catch(() => {});
  }

  const exitCode = printReport("partner-gate");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
