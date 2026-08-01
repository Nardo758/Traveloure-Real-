#!/usr/bin/env node
// scripts/journeys/expert-loop.mjs
//
// EXPERT-LOOP JOURNEY (J1) — a permanent, self-contained repo harness per
// docs/EXECUTION_MAP.md §4b ("Testing protocol — Fable-minimized"). Read §4b before
// changing this file's shape; it is the spec this script implements. See also
// scripts/journeys/README.md for the report contract and how to add a new journey.
//
// REFACTOR NOTE (Aug 1, 2026): this journey's shared mechanics (DB pool helper, login,
// idempotent fixture upserts, step runner + report, Playwright launcher, DOM waits) were
// EXTRACTED into scripts/journeys/lib/journey-lib.mjs so the rest of the journey suite
// (plan-lifecycle.mjs, workstation-build.mjs, store-lifecycle.mjs, traveler-comms.mjs,
// partner-gate.mjs) can reuse them instead of re-deriving the same patterns. This file was
// re-proven green against a live server immediately after the refactor — see the diffstat in
// the commit that introduced journey-lib.mjs; behavior here is UNCHANGED (same steps, same
// fixture ids, same verdicts).
//
// WHAT THIS PROVES: the traveler↔expert item-routing loop (Trip-Canon Lane 1 /
// docs/briefs/ROUTING_STATE_CONTRACT.md) end to end —
//   traveler sends an item to their expert → expert workspace lands on the trip →
//   expert adds a custom item (asserts the KNOWN estimatedCost type-mismatch defect,
//   see "KNOWN DEFECTS" below) → expert leaves a per-item note → expert advances
//   delivery status draft→in_review→delivered → the expert-return edge is driven via
//   API (no UI control exists for it yet — RoutingActions is owner-only by design,
//   server/routes/routing.routes.ts) → traveler sees the delivered signal → traveler
//   routes a second item to checkout → a cart projection row materializes → the cart
//   page renders it → the expert Distribute panel reflects the delivered state.
//
// ── COLD-BOOT RECIPE (§4b rule 6 — every driver embeds this so any model or human
//    can run it from nothing) ──────────────────────────────────────────────────────
//
//   1. Local Postgres under /var/tmp (dedicated port/socket — never the shared
//      default 5432, per docs/EXECUTION_MAP.md L25 "Verification-integrity landmine"):
//
//        PGDIR=/var/tmp/expws-pg
//        mkdir -p "$PGDIR"
//        /usr/lib/postgresql/16/bin/initdb -D "$PGDIR/data" -U postgres --auth=trust
//        /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDIR/data" -o "-p 55442 -k $PGDIR" \
//          -l "$PGDIR/log" start
//        /usr/lib/postgresql/16/bin/createdb -h "$PGDIR" -p 55442 -U postgres expws
//
//      (Adjust the postgres bin path / version to whatever `pg_ctl --version` finds
//      on the box. Use a FRESH, UNIQUE db name + port per lane — never reuse another
//      lane's port, per the L25 landmine: `reusePort: true` in dev means two lanes on
//      the same PORT round-robin between servers/DBs silently.)
//
//   2. App boot, dummy external-service env (no real Stripe/Amadeus/AI keys — this
//      journey is a SANDBOX/structural journey, §4b rule 4; it asserts nothing that
//      needs a real external call):
//
//        cd /path/to/repo
//        DATABASE_URL="postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg" \
//        STRIPE_SECRET_KEY=sk_test_x \
//        AMADEUS_API_KEY=x \
//        AMADEUS_API_SECRET=x \
//        RATE_LIMIT_LOOPBACK_SKIP=1 \
//        SESSION_SECRET=expws-secret \
//        PORT=5601 \
//        NODE_ENV=development \
//        npx tsx server/index.ts
//
//      `runMigrations()` applies the full migration chain at startup, and the E2E
//      test-account seed (server/seeds/e2e-test-accounts.seed.ts) auto-seeds on boot
//      — the 5 role accounts this journey logs in as already exist once the server
//      is up (password: TestPass123!, or $E2E_TEST_PASSWORD if you set one).
//      RATE_LIMIT_LOOPBACK_SKIP=1 exempts loopback from the per-IP `generalRateLimiter`
//      (server/infrastructure/rate-limiter.ts's own documented CI escape hatch) — running
//      several journeys back to back (run-all.mjs) WILL 429 on /api/auth/login without it,
//      proven live while building this suite. NEVER set it in production.
//
//   3. Run this journey against the booted app:
//
//        node scripts/journeys/expert-loop.mjs \
//          --base-url http://localhost:5601 \
//          --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
//      (Both flags default to exactly those values — see journey-lib.mjs's
//      `resolveConfig()` — so a bare `node scripts/journeys/expert-loop.mjs` is enough
//      once the app is up on the default port/DB. `--out <dir>` overrides the
//      screenshot directory, default ./journey-out relative to cwd, gitignored.)
//
// THE SCRIPT DOES NOT BOOT THE APP ITSELF — by design (§4b rule 6 says the recipe is
// embedded so *something else* can run it; a script that silently tries to boot a
// whole app/DB stack on failure is not deterministic). It CHECKS reachability first
// and fails fast with this exact recipe printed if the app or DB isn't answering.
//
// ── KNOWN DEFECTS THIS JOURNEY ASSERTS, NOT WORKS AROUND ────────────────────────────
// `estimatedCost` type mismatch (InlineAddItemForm, client/src/pages/expert/
// workspace.tsx): the form sends `estimatedCost: parseFloat(...)` — a JS number — but
// `insertItineraryItemSchema` (shared/schema.ts, drizzle-zod over a `decimal` column)
// requires a STRING. Every "Custom" add that includes a cost 400s server-side
// ("Invalid data", zod `expected string, received number`) and the item is never
// created. The "Custom add" step below EXPECTS the 400 and reports verdict
// `KNOWN_DEFECT` when it reproduces, PASS when the fix has landed and the create
// succeeds instead — the step self-detects which world it's running in (see Step 3),
// so it keeps the journey green either way with no edit required.
//
// ── EXTERNAL-STEP MARKING CONVENTION (§4b rule 4) ───────────────────────────────────
// This journey has NO `EXTERNAL` steps — every mutation here is structural (routing
// states, notes, notifications, cart projections) and runs on dummy Stripe/Amadeus
// keys with zero real external calls. See journey-lib.mjs's `createStepRunner` /
// scripts/journeys/README.md for the `{ external: true }` pattern a future journey
// step should use if it needs a real external service.
//
// ── FIXTURES (idempotent, `jrny-` prefixed — never collides with other journeys'
//    fixtures, which each use their own prefix) ─────────────────────────────────────
// Every run RESETS these rows to a known baseline before driving the journey (not
// just insert-if-absent) — a prior run's mutations (routed items, cart projections,
// custom-added items, delivered status) must not leak into the next run. See
// `resetAndSeedFixtures()` below for the exact statements.

import {
  resolveConfig, preflight, connectDb, dbOne, resolveUserIdByEmail,
  upsertTrip, upsertCollaboratorOwner, upsertAdvisor, upsertItem, deleteItemsNotIn,
  launchBrowser, login, waitVisible, createStepRunner, isoDate,
} from "./lib/journey-lib.mjs";

const JOURNEY_FILE = "scripts/journeys/expert-loop.mjs";
const cfg = resolveConfig();
const { BASE_URL, DB_URL, OUT_DIR, HEADED, PASSWORD } = cfg;

const TRAVELER_EMAIL = process.env.E2E_TRAVELER_EMAIL || "test-traveler-kyoto@traveloure.test";
const EXPERT_EMAIL = process.env.E2E_EXPERT_EMAIL || "kyoto-food@traveloure.test";

// ─────────────────────────────────────────────────────────────────────────────────
// FIXTURE IDS — jrny- prefixed, fixed, never regenerated. Four items seeded in
// MIXED routing states at baseline (in_planning ×2, with_expert ×1,
// ready_for_checkout ×1) so the fixture itself proves mixed-state handling before
// the journey mutates anything.
// ─────────────────────────────────────────────────────────────────────────────────
const TRIP_ID = "jrny-trip-1";
const COLLAB_ID = "jrny-collab-owner-1";
const ADVISOR_ID = "jrny-advisor-1";
// item A: in_planning -> (traveler UI) with_expert -> (expert API, no UI control) in_planning
const ITEM_A = "jrny-item-a";
// item B: in_planning -> (traveler UI) ready_for_checkout -> cart projection
const ITEM_B = "jrny-item-b";
// item C: with_expert baseline, untouched by routing — target of the expert-note step
const ITEM_C = "jrny-item-c";
// item D: ready_for_checkout baseline, untouched — proves the fixture's mixed-state
// seed independently of anything the journey itself mutates
const ITEM_D = "jrny-item-d";

const CUSTOM_ITEM_TITLE = "Journey Custom Add Test";
const EXPERT_NOTE_TEXT = "Arrive 15 minutes early — the gate line moves slowly at peak season.";

// ─────────────────────────────────────────────────────────────────────────────────
// FIXTURE SEEDING — idempotent RESET-AND-SEED (§4b + house convention). A bare
// insert-if-absent is not enough for a *routing* journey: the prior run leaves items
// mid-transition, a custom item created, a cart row projected, delivery status
// advanced. This returns every fixture row to a known baseline on EVERY run.
// ─────────────────────────────────────────────────────────────────────────────────
async function resetAndSeedFixtures(pg) {
  const travelerId = await resolveUserIdByEmail(pg, TRAVELER_EMAIL);
  const expertId = await resolveUserIdByEmail(pg, EXPERT_EMAIL);

  // ── Cleanup: prior-run artifacts that are NOT part of the fixed fixture set ──
  await pg.query("DELETE FROM cart_items WHERE trip_id = $1", [TRIP_ID]);
  await pg.query(
    "DELETE FROM notifications WHERE related_id = $1 AND related_type = 'trip'",
    [TRIP_ID],
  );
  await deleteItemsNotIn(pg, TRIP_ID, [ITEM_A, ITEM_B, ITEM_C, ITEM_D]);

  await upsertTrip(pg, {
    id: TRIP_ID, userId: travelerId, title: "Journey: Expert Loop", destination: "Kyoto, Japan",
    startDate: isoDate(30), endDate: isoDate(35), status: "planning",
  });
  await upsertCollaboratorOwner(pg, { id: COLLAB_ID, tripId: TRIP_ID, userId: travelerId });
  await upsertAdvisor(pg, { id: ADVISOR_ID, tripId: TRIP_ID, expertId, status: "accepted", workspaceStatus: "draft" });

  const items = [
    { id: ITEM_A, title: "Fushimi Inari Sunrise Hike", type: "activity", routing: "in_planning" },
    { id: ITEM_B, title: "Gion Kaiseki Dinner", type: "dining", routing: "in_planning" },
    { id: ITEM_C, title: "Arashiyama Bamboo Grove Walk", type: "activity", routing: "with_expert" },
    { id: ITEM_D, title: "Nishiki Market Food Tour", type: "activity", routing: "ready_for_checkout" },
  ];
  for (const it of items) {
    await upsertItem(pg, {
      id: it.id, tripId: TRIP_ID, title: it.title, itemType: it.type, dayNumber: 1,
      routingStatus: it.routing, locationName: "Kyoto", estimatedCost: "20.00",
    });
  }

  return { travelerId, expertId, itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])) };
}

// ─────────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────────
async function main() {
  await preflight({ baseUrl: BASE_URL, dbUrl: DB_URL, journeyFile: JOURNEY_FILE });

  const pg = await connectDb(DB_URL);
  const { runStep, printReport } = createStepRunner({ outDir: OUT_DIR, skipExternal: cfg.SKIP_EXTERNAL });

  console.log("[seed] resetting & seeding jrny- fixtures (idempotent)...");
  const seeded = await resetAndSeedFixtures(pg);
  console.log(`[seed] trip=${TRIP_ID} traveler=${seeded.travelerId} expert=${seeded.expertId}`);

  const browser = await launchBrowser({ headed: HEADED });
  const travelerCtx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 1000 } });
  const expertCtx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 1000 } });

  let travelerPage, expertPage;

  try {
    travelerPage = await login(travelerCtx, TRAVELER_EMAIL, PASSWORD);
    expertPage = await login(expertCtx, EXPERT_EMAIL, PASSWORD);
    console.log("[auth] traveler + expert both authenticated.");

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1 — traveler sends item A to their expert
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // ROUTE-FINDING NOTE (discovered building this journey, Aug 1 2026): the
    // obvious candidate — `/itinerary/:id` — is a pure client-side REDIRECT to
    // `/trip/:id?tab=itinerary` (client/src/App.tsx), which renders `trip-details.tsx`.
    // That page passes PlanCard an explicit `days` prop built from the LEGACY
    // `generated_itineraries.itineraryData` JSON blob (client/src/pages/trip-details.tsx
    // ~line 728) — never from the canonical `itinerary_items` rows — so `routingStatus`
    // is never populated on an activity there and the RoutingActions buttons/badges
    // this journey needs can NEVER render on that page, for ANY trip, with or without a
    // `generated_itineraries` row. This is a real, load-bearing product gap (the exact
    // "TripPlan fragmentation" docs/EXECUTION_MAP.md §3 describes), confirmed live while
    // authoring this script — not a script bug, not worked around here.
    //
    // The one traveler-reachable surface that actually calls `<PlanCard>` WITHOUT a
    // `days` prop (so it self-fetches `/api/trips/:tripId/plancard` — the real TripPlan
    // assembler, which DOES carry `routingStatus`) is `/dashboard`
    // (client/src/pages/dashboard.tsx ~line 295). It picks the soonest-upcoming trip by
    // default and offers a `trip-chip-<tripId>` picker when the traveler has 2+ active
    // trips — so this step selects our fixture trip explicitly rather than relying on
    // it happening to be soonest (proven live: it currently *is* soonest, but the click
    // makes the journey correct regardless of what other trips exist in a shared DB).
    await runStep(
      "Traveler: send item to expert (in_planning -> with_expert)",
      async () => {
        await travelerPage.goto("/dashboard");
        await waitVisible(travelerPage, "active-plans-section");
        const chip = `[data-testid="trip-chip-${TRIP_ID}"]`;
        if (await travelerPage.isVisible(chip)) {
          await travelerPage.click(chip);
        }
        const btn = await waitVisible(travelerPage, `button-route-send-expert-${ITEM_A}`);
        await travelerPage.click(btn);
        await waitVisible(travelerPage, `badge-routing-with-expert-${ITEM_A}`);

        const row = await dbOne(
          pg,
          "SELECT routing_status FROM itinerary_items WHERE id = $1 AND trip_id = $2",
          [ITEM_A, TRIP_ID],
        );
        if (row?.routing_status !== "with_expert") {
          throw new Error(`expected routing_status='with_expert', got '${row?.routing_status}'`);
        }
        return {
          ui: `badge-routing-with-expert-${ITEM_A} visible on /dashboard (PlanCard self-fetched plancard for ${TRIP_ID})`,
          db: `itinerary_items.routing_status = 'with_expert' for ${ITEM_A}`,
        };
      },
      { page: travelerPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2 — expert workspace lands on the trip
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Expert: workspace lands on the assigned trip",
      async () => {
        await expertPage.goto(`/expert/workspace/${TRIP_ID}`);
        await waitVisible(expertPage, "tab-right-add");
        // Kyoto-market client trips default the canvas to the "Structure"
        // (neighborhood-grouped) format view, not the day list — the embedded
        // PlanCard (and its `activities-section-*` / `activity-row-*` testids) only
        // renders under the quiet "Day list" toggle
        // (client/src/components/build-formats/ClientFormatView.tsx). Proven live
        // while authoring this journey: "Structure" is genuinely the default for this
        // trip's resolved format, not a flake — switch to Day list explicitly.
        const dayListToggle = `[data-testid="toggle-format-day-list"]`;
        if (await expertPage.isVisible(dayListToggle)) {
          await expertPage.click(dayListToggle);
        }
        await waitVisible(expertPage, `activities-section-${TRIP_ID}`);
        // The item we just routed with_expert must be visible on the expert's own
        // read of the plan (proves the trip_expert_advisors fixture row actually
        // grants access, not just that some page rendered).
        await waitVisible(expertPage, `activity-row-${ITEM_A}`);

        const row = await dbOne(
          pg,
          `SELECT status, workspace_status FROM trip_expert_advisors
           WHERE trip_id = $1 AND local_expert_id = $2`,
          [TRIP_ID, seeded.expertId],
        );
        if (!row || !["pending", "accepted", "assigned"].includes(row.status)) {
          throw new Error(`advisor row missing or non-access status: ${JSON.stringify(row)}`);
        }
        return {
          ui: `tab-right-add + activities-section-${TRIP_ID} + activity-row-${ITEM_A} all visible on /expert/workspace/${TRIP_ID}`,
          db: `trip_expert_advisors.status='${row.status}' for (trip=${TRIP_ID}, expert=${seeded.expertId})`,
        };
      },
      { page: expertPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3 — Custom add WITH a cost (asserts the known estimatedCost defect)
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Expert: Custom add with a cost (KNOWN estimatedCost type-mismatch defect)",
      async () => {
        await waitVisible(expertPage, "tab-right-add");
        await expertPage.click(`[data-testid="tab-right-add"]`);
        await waitVisible(expertPage, "pill-add-custom");
        await expertPage.click(`[data-testid="pill-add-custom"]`);
        await waitVisible(expertPage, "input-inline-add-title");
        await expertPage.fill(`[data-testid="input-inline-add-title"]`, CUSTOM_ITEM_TITLE);
        await expertPage.fill(`[data-testid="input-inline-add-cost"]`, "42.50");

        const [resp] = await Promise.all([
          expertPage.waitForResponse(
            (r) => r.url().includes(`/api/trips/${TRIP_ID}/itinerary-items`) && r.request().method() === "POST",
            { timeout: 10000 },
          ),
          expertPage.click(`[data-testid="button-inline-add-confirm"]`),
        ]);
        const status = resp.status();

        const dbRow = await dbOne(
          pg,
          "SELECT id, estimated_cost FROM itinerary_items WHERE trip_id = $1 AND title = $2",
          [TRIP_ID, CUSTOM_ITEM_TITLE],
        );

        if (status === 201 && dbRow) {
          return {
            ui: `POST /api/trips/${TRIP_ID}/itinerary-items -> 201 (form submitted via button-inline-add-confirm)`,
            db: `itinerary_items row created, estimated_cost=${dbRow.estimated_cost}`,
            verdict: "PASS",
            note: "estimatedCost defect appears FIXED — number now accepted (re-check this file's header comment)",
          };
        }

        if (status === 400 && !dbRow) {
          const body = await resp.json().catch(() => ({}));
          return {
            ui: `POST /api/trips/${TRIP_ID}/itinerary-items -> 400 (form submitted via button-inline-add-confirm)`,
            db: `no itinerary_items row created for title='${CUSTOM_ITEM_TITLE}' (confirmed absent)`,
            verdict: "KNOWN_DEFECT",
            note: `estimatedCost type mismatch reproduced as expected: ${JSON.stringify(body).slice(0, 150)}`,
          };
        }

        throw new Error(
          `unexpected outcome: HTTP ${status}, db row ${dbRow ? "present" : "absent"} — ` +
            `neither the known-defect shape (400 + no row) nor the fixed shape (201 + row)`,
        );
      },
      { page: expertPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4 — expert note on item C
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Expert: leave a per-item note (traveler-visible)",
      async () => {
        await waitVisible(expertPage, "button-toggle-item-editor");
        await expertPage.click(`[data-testid="button-toggle-item-editor"]`);
        const expandBtn = await waitVisible(expertPage, `button-expand-item-${ITEM_C}`);
        await expertPage.click(expandBtn);
        const noteField = await waitVisible(expertPage, `textarea-expert-note-${ITEM_C}`);
        await expertPage.fill(noteField, EXPERT_NOTE_TEXT);

        const [resp] = await Promise.all([
          expertPage.waitForResponse(
            (r) => r.url().includes(`/api/trips/${TRIP_ID}/itinerary-items/${ITEM_C}`) && r.request().method() === "PATCH",
            { timeout: 10000 },
          ),
          expertPage.click(`[data-testid="button-save-expert-note-${ITEM_C}"]`),
        ]);
        if (!resp.ok()) throw new Error(`PATCH expert note failed: ${resp.status()}`);

        const row = await dbOne(pg, "SELECT expert_note FROM itinerary_items WHERE id = $1", [ITEM_C]);
        if (row?.expert_note !== EXPERT_NOTE_TEXT) {
          throw new Error(`expected expert_note='${EXPERT_NOTE_TEXT}', got '${row?.expert_note}'`);
        }
        return {
          ui: `textarea-expert-note-${ITEM_C} filled + button-save-expert-note-${ITEM_C} clicked, PATCH 200`,
          db: `itinerary_items.expert_note set on ${ITEM_C}`,
        };
      },
      { page: expertPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5 — status advance draft -> in_review -> delivered
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Expert: advance delivery status draft -> in_review -> delivered",
      async () => {
        await waitVisible(expertPage, "tab-right-distribute");
        await expertPage.click(`[data-testid="tab-right-distribute"]`);
        await waitVisible(expertPage, "button-send-edits");

        await Promise.all([
          expertPage.waitForResponse(
            (r) => r.url().includes("/workspace-status") && r.request().method() === "PATCH",
            { timeout: 10000 },
          ),
          expertPage.click(`[data-testid="button-send-edits"]`),
        ]);
        await expertPage.waitForFunction(
          () => document.querySelector('[data-testid="button-send-edits"]')?.textContent?.includes("Mark delivered"),
          { timeout: 10000 },
        );

        await Promise.all([
          expertPage.waitForResponse(
            (r) => r.url().includes("/workspace-status") && r.request().method() === "PATCH",
            { timeout: 10000 },
          ),
          expertPage.click(`[data-testid="button-send-edits"]`),
        ]);
        await waitVisible(expertPage, "chip-dist-delivery");
        const chipText = await expertPage.textContent(`[data-testid="chip-dist-delivery"]`);
        if (!chipText || !chipText.includes("Delivered")) {
          throw new Error(`chip-dist-delivery does not read "Delivered": '${chipText}'`);
        }

        const row = await dbOne(
          pg,
          "SELECT workspace_status FROM trip_expert_advisors WHERE id = $1",
          [ADVISOR_ID],
        );
        if (row?.workspace_status !== "delivered") {
          throw new Error(`expected workspace_status='delivered', got '${row?.workspace_status}'`);
        }
        return {
          ui: `chip-dist-delivery reads "${chipText.trim()}" on the Distribute tab`,
          db: `trip_expert_advisors.workspace_status = 'delivered' for ${ADVISOR_ID}`,
        };
      },
      { page: expertPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6 — expert-return edge, driven via API (documented: no UI control exists)
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Expert: return item A to the traveler (with_expert -> in_planning) via API — NO UI CONTROL EXISTS FOR THIS EDGE",
      async () => {
        const resp = await expertPage.request.post(`/api/trips/${TRIP_ID}/items/${ITEM_A}/route`, {
          data: { to: "in_planning" },
        });
        if (!resp.ok()) throw new Error(`route API call failed: ${resp.status()} ${await resp.text()}`);
        const body = await resp.json();
        if (body.actor !== "expert" || body.to !== "in_planning" || !body.changed) {
          throw new Error(`unexpected response shape: ${JSON.stringify(body)}`);
        }

        const row = await dbOne(pg, "SELECT routing_status FROM itinerary_items WHERE id = $1", [ITEM_A]);
        if (row?.routing_status !== "in_planning") {
          throw new Error(`expected routing_status='in_planning', got '${row?.routing_status}'`);
        }
        return {
          ui: "N/A by design — no UI control exists for the expert-return edge (RoutingActions is owner-only client-side); driven via authenticated API call instead",
          db: `itinerary_items.routing_status = 'in_planning' for ${ITEM_A} (actor='expert' per API response)`,
        };
      },
      { page: expertPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 7 — traveler sees the delivered plan
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Traveler: sees the delivered plan (notification + trip read-side signal)",
      async () => {
        // GAP 5 (docs/audits/expert-loop-object-flow-jul30.md): the trip itself
        // carries no persistent "delivered" badge on the traveler's plan view — the
        // signal is (a) a one-shot notification and (b) GET /api/trips/:id's
        // additive `expertWorkspaceStatus` field (server/routes.ts, the GAP-5 fix).
        // This step checks both, honestly, rather than asserting a UI element that
        // does not exist.
        await travelerPage.goto("/notifications");
        await travelerPage.waitForSelector(`[data-testid^="notification-"]`, { timeout: 10000 });
        const bodyText = await travelerPage.textContent("body");
        if (!bodyText || !bodyText.toLowerCase().includes("delivered")) {
          throw new Error(`"/notifications" page does not mention "delivered": no matching text found`);
        }

        const tripReadJson = await travelerPage.evaluate(async (tripId) => {
          const r = await fetch(`/api/trips/${tripId}`, { credentials: "include" });
          return r.ok ? r.json() : { __error: r.status };
        }, TRIP_ID);
        if (tripReadJson.expertWorkspaceStatus !== "delivered") {
          throw new Error(
            `GET /api/trips/${TRIP_ID} expertWorkspaceStatus='${tripReadJson.expertWorkspaceStatus}', expected 'delivered'`,
          );
        }

        const notifRow = await dbOne(
          pg,
          `SELECT title, message FROM notifications
           WHERE user_id = $1 AND related_id = $2 AND related_type = 'trip'
           ORDER BY created_at DESC LIMIT 1`,
          [seeded.travelerId, TRIP_ID],
        );
        if (!notifRow || !notifRow.title.toLowerCase().includes("delivered")) {
          throw new Error(`no "delivered" notification row found: ${JSON.stringify(notifRow)}`);
        }
        return {
          ui: `/notifications page renders "${notifRow.title}"; GET /api/trips/${TRIP_ID} expertWorkspaceStatus='delivered' (fetched from the loaded traveler page)`,
          db: `notifications row: title='${notifRow.title}'`,
        };
      },
      { page: travelerPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 8 — add-to-checkout -> cart projection row
    // ═══════════════════════════════════════════════════════════════════════════
    let cartItemId = null;
    await runStep(
      "Traveler: add item B to checkout (in_planning -> ready_for_checkout) -> cart projection",
      async () => {
        await travelerPage.goto("/dashboard");
        await waitVisible(travelerPage, "active-plans-section");
        const chip = `[data-testid="trip-chip-${TRIP_ID}"]`;
        if (await travelerPage.isVisible(chip)) {
          await travelerPage.click(chip);
        }
        const btn = await waitVisible(travelerPage, `button-route-add-checkout-${ITEM_B}`);
        await travelerPage.click(btn);
        await waitVisible(travelerPage, `badge-routing-checkout-${ITEM_B}`);

        const itemRow = await dbOne(
          pg,
          "SELECT routing_status FROM itinerary_items WHERE id = $1",
          [ITEM_B],
        );
        if (itemRow?.routing_status !== "ready_for_checkout") {
          throw new Error(`expected routing_status='ready_for_checkout', got '${itemRow?.routing_status}'`);
        }
        const cartRow = await dbOne(
          pg,
          "SELECT id, content_meta FROM cart_items WHERE itinerary_item_id = $1",
          [ITEM_B],
        );
        if (!cartRow) throw new Error("no cart_items projection row found for item B");
        cartItemId = cartRow.id;

        return {
          ui: `badge-routing-checkout-${ITEM_B} visible on /dashboard (PlanCard self-fetched plancard for ${TRIP_ID})`,
          db: `itinerary_items.routing_status='ready_for_checkout' + cart_items row (id=${cartItemId}) projected via itinerary_item_id`,
        };
      },
      { page: travelerPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 9 — cart renders
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Traveler: cart page renders the projected item",
      async () => {
        if (!cartItemId) throw new Error("no cartItemId from the previous step — cannot verify rendering");
        await travelerPage.goto("/cart");
        const sel = await waitVisible(travelerPage, `cart-item-${cartItemId}`);
        const cardText = await travelerPage.textContent(sel);
        if (!cardText || !cardText.includes(seeded.itemTitles[ITEM_B])) {
          throw new Error(`cart-item-${cartItemId} does not render the item's title ('${seeded.itemTitles[ITEM_B]}')`);
        }

        const row = await dbOne(pg, "SELECT id FROM cart_items WHERE id = $1", [cartItemId]);
        if (!row) throw new Error("cart_items row vanished between step 8 and step 9 — real regression, not flake");
        return {
          ui: `cart-item-${cartItemId} visible on /cart, contains "${seeded.itemTitles[ITEM_B]}"`,
          db: `cart_items row ${cartItemId} still present`,
        };
      },
      { page: travelerPage },
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 10 — Distribute panel state (expert side, end of the loop)
    // ═══════════════════════════════════════════════════════════════════════════
    await runStep(
      "Expert: Distribute panel reflects the final delivered + client-attached state",
      async () => {
        await expertPage.goto(`/expert/workspace/${TRIP_ID}`);
        await waitVisible(expertPage, "tab-right-distribute");
        await expertPage.click(`[data-testid="tab-right-distribute"]`);
        await waitVisible(expertPage, "chip-dist-delivery");
        const deliveryText = await expertPage.textContent(`[data-testid="chip-dist-delivery"]`);
        await waitVisible(expertPage, "text-distribute-client-name");
        const openChatVisible = await expertPage.isVisible(`[data-testid="button-open-chat"]`);

        if (!deliveryText?.includes("Delivered")) {
          throw new Error(`chip-dist-delivery does not read "Delivered" on reload: '${deliveryText}'`);
        }
        if (!openChatVisible) throw new Error("button-open-chat not visible — Client channel card did not render");

        const row = await dbOne(
          pg,
          "SELECT workspace_status FROM trip_expert_advisors WHERE id = $1",
          [ADVISOR_ID],
        );
        return {
          ui: `Distribute tab: chip-dist-delivery="${deliveryText.trim()}", text-distribute-client-name + button-open-chat visible`,
          db: `trip_expert_advisors.workspace_status='${row?.workspace_status}' (persists across reload)`,
        };
      },
      { page: expertPage },
    );
  } finally {
    await browser.close().catch(() => {});
    await pg.end().catch(() => {});
  }

  const exitCode = printReport("expert-loop");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
