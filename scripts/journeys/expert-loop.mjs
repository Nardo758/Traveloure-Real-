#!/usr/bin/env node
// scripts/journeys/expert-loop.mjs
//
// EXPERT-LOOP JOURNEY — a permanent, self-contained repo harness per
// docs/EXECUTION_MAP.md §4b ("Testing protocol — Fable-minimized"). Read §4b before
// changing this file's shape; it is the spec this script implements. See also
// scripts/journeys/README.md for the report contract and how to add a new journey.
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
//        STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY] \
//        AMADEUS_API_KEY=x \
//        AMADEUS_API_SECRET=x \
//        SESSION_SECRET=expws-secret \
//        PORT=5601 \
//        NODE_ENV=development \
//        npx tsx server/index.ts
//
//      `runMigrations()` applies the full migration chain at startup, and the E2E
//      test-account seed (server/seeds/e2e-test-accounts.seed.ts) auto-seeds on boot
//      — the 5 role accounts this journey logs in as already exist once the server
//      is up (password: TestPass123!, or $E2E_TEST_PASSWORD if you set one).
//
//   3. Run this journey against the booted app:
//
//        node scripts/journeys/expert-loop.mjs \
//          --base-url http://localhost:5601 \
//          --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
//      (Both flags default to exactly those values — see CONFIG below — so a bare
//      `node scripts/journeys/expert-loop.mjs` is enough once the app is up on the
//      default port/DB. `--out <dir>` overrides the screenshot directory, default
//      ./journey-out relative to cwd, gitignored.)
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
// created. Verified directly against `insertItineraryItemSchema.safeParse(...)` as
// part of building this journey (number → fails, string → passes). Checked at the
// time this script was authored (Aug 1, 2026): branch `claude/journey-ui-fixes` is
// byte-identical to `main` (zero unique commits — `git log main..claude/journey-ui-fixes`
// is empty), so the fix has NOT landed. The "Custom add" step below therefore EXPECTS
// the 400 and reports verdict `KNOWN_DEFECT` (not `FAIL`) when it reproduces — this
// keeps the journey green on a clean checkout instead of permanently red on a bug
// everyone already knows about. The moment the fix lands (client coerces to a string,
// or the schema accepts a number), the step's own logic flips it to `PASS` on the next
// run with no edit required — re-read the step body ("Step 3") before assuming this
// needs updating.
//
// ── EXTERNAL-STEP MARKING CONVENTION (§4b rule 4) ───────────────────────────────────
// This journey has NO `EXTERNAL` steps — every mutation here is structural (routing
// states, notes, notifications, cart projections) and runs on dummy Stripe/Amadeus
// keys with zero real external calls. A future journey that needs a REAL external
// service (a live Stripe test-mode confirm, a real Maps/AI call) should wrap that one
// step in `runStep(..., { external: true })` — see scripts/journeys/README.md for the
// exact pattern; `runStep` already understands the flag and reports `EXTERNAL` +
// skips execution when `--skip-external` is passed (this journey never needs it, but
// the machinery is shared across journeys so it lives here once).
//
// ── FIXTURES (idempotent, `jrny-` prefixed — never collides with other fixtures;
//    proven Aug 1 2026 against a DB that already held unrelated `sim-*` fixtures and
//    journey history) ─────────────────────────────────────────────────────────────
// Every run RESETS these rows to a known baseline before driving the journey (not
// just insert-if-absent) — a prior run's mutations (routed items, cart projections,
// custom-added items, delivered status) must not leak into the next run. See
// `resetAndSeedFixtures()` below for the exact statements.

import { chromium } from "@playwright/test";
import { Client as PgClient } from "pg";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────────
// CONFIG — every value is a CLI flag or env var override; defaults match the live
// sandbox this script was authored and proven against (Aug 1, 2026).
// ─────────────────────────────────────────────────────────────────────────────────

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hasFlag = (flag) => process.argv.includes(flag);

const BASE_URL = argValue("--base-url", process.env.JOURNEY_BASE_URL || "http://localhost:5601");
const DB_URL = argValue(
  "--db-url",
  process.env.DATABASE_URL ||
    "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg",
);
const OUT_DIR = argValue("--out", process.env.JOURNEY_OUT_DIR || path.join(process.cwd(), "journey-out"));
const HEADED = hasFlag("--headed");
const SKIP_EXTERNAL = hasFlag("--skip-external");

const PASSWORD = process.env.E2E_TEST_PASSWORD || "TestPass123!";
const TRAVELER_EMAIL = process.env.E2E_TRAVELER_EMAIL || "test-traveler-kyoto@traveloure.test";
const EXPERT_EMAIL = process.env.E2E_EXPERT_EMAIL || "kyoto-food@traveloure.test";

const CHROMIUM_EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BOOT_RECIPE = `
  App is not reachable at ${BASE_URL} (or the DB at the configured URL is not
  answering). Cold-boot recipe:

    PGDIR=/var/tmp/expws-pg
    mkdir -p "$PGDIR"
    /usr/lib/postgresql/16/bin/initdb -D "$PGDIR/data" -U postgres --auth=trust
    /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDIR/data" -o "-p 55442 -k $PGDIR" -l "$PGDIR/log" start
    /usr/lib/postgresql/16/bin/createdb -h "$PGDIR" -p 55442 -U postgres expws

    DATABASE_URL="postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg" \\
    STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY] AMADEUS_API_KEY=x AMADEUS_API_SECRET=x \\
    SESSION_SECRET=expws-secret PORT=5601 NODE_ENV=development \\
    npx tsx server/index.ts

  Then re-run:
    node scripts/journeys/expert-loop.mjs --base-url ${BASE_URL} --db-url "<db url>"

  (Full explanation + rationale in this file's header comment.)
`;

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

function isoDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────────
// PRE-FLIGHT — reachability. Fails fast with the recipe; never attempts to boot
// anything itself (§4b rule 6: the recipe is embedded for a human/model to run, not
// executed implicitly — a script that silently spins up Postgres/the app on failure
// is not a deterministic journey driver).
// ─────────────────────────────────────────────────────────────────────────────────
async function preflight() {
  let appOk = false;
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    appOk = res.status < 500;
  } catch {
    appOk = false;
  }
  if (!appOk) {
    console.error(`\n[preflight] App not reachable at ${BASE_URL}.\n${BOOT_RECIPE}`);
    process.exit(1);
  }

  const probe = new PgClient({ connectionString: DB_URL });
  try {
    await probe.connect();
    await probe.query("SELECT 1");
  } catch (err) {
    console.error(`\n[preflight] DB not reachable at ${DB_URL}: ${err.message}\n${BOOT_RECIPE}`);
    process.exit(1);
  } finally {
    await probe.end().catch(() => {});
  }
  console.log(`[preflight] app OK (${BASE_URL}), db OK.`);
}

// ─────────────────────────────────────────────────────────────────────────────────
// FIXTURE SEEDING — idempotent RESET-AND-SEED (§4b + task spec rule 2). A bare
// insert-if-absent is not enough for a *routing* journey: the prior run leaves items
// mid-transition, a custom item created, a cart row projected, delivery status
// advanced. This function returns every fixture row to a known baseline on EVERY
// run, so re-running the journey twice in a row proves the same thing twice — never
// "well it depends what state the DB is already in."
// ─────────────────────────────────────────────────────────────────────────────────
async function resetAndSeedFixtures(pg) {
  // Resolve the two seeded E2E accounts this journey drives. These are NOT part of
  // this journey's own fixture set (server/seeds/e2e-test-accounts.seed.ts owns
  // them) — we only read their ids.
  const travelerRow = await pg.query("SELECT id FROM users WHERE email = $1", [TRAVELER_EMAIL]);
  const expertRow = await pg.query("SELECT id FROM users WHERE email = $1", [EXPERT_EMAIL]);
  if (travelerRow.rowCount === 0) {
    throw new Error(
      `E2E traveler account ${TRAVELER_EMAIL} not found — the app must have booted at least once ` +
        `for server/seeds/e2e-test-accounts.seed.ts to auto-seed it. See the cold-boot recipe.`,
    );
  }
  if (expertRow.rowCount === 0) {
    throw new Error(
      `E2E expert account ${EXPERT_EMAIL} not found — same cause as the traveler-account error above.`,
    );
  }
  const travelerId = travelerRow.rows[0].id;
  const expertId = expertRow.rows[0].id;

  // ── Cleanup: prior-run artifacts that are NOT part of the fixed fixture set ──
  // Cart projections for this trip (both the real projection row from a prior
  // add-to-checkout AND anything else keyed to this trip).
  await pg.query("DELETE FROM cart_items WHERE trip_id = $1", [TRIP_ID]);
  // Notifications this journey's delivery step creates each run.
  await pg.query(
    "DELETE FROM notifications WHERE related_id = $1 AND related_type = 'trip'",
    [TRIP_ID],
  );
  // Any custom-added item from a prior run (dynamic id — not in the fixed 4).
  await pg.query(
    `DELETE FROM itinerary_items WHERE trip_id = $1 AND id NOT IN ($2, $3, $4, $5)`,
    [TRIP_ID, ITEM_A, ITEM_B, ITEM_C, ITEM_D],
  );

  // ── Trip (owner = e2e traveler) ──
  const start = isoDate(30);
  const end = isoDate(35);
  await pg.query(
    `INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status,
                         event_type, number_of_travelers, adults, kids)
     VALUES ($1, $2, 'Journey: Expert Loop', 'Kyoto, Japan', $3, $4, 'planning',
             'vacation', 2, 2, 0)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id, status = 'planning',
       start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
       updated_at = now()`,
    [TRIP_ID, travelerId, start, end],
  );

  // ── trip_collaborators owner row (the L10 owner under-grant: getTripRole never
  // reads `trips`, so several mutation paths need this explicit row even though the
  // trip's own `user_id` already makes the traveler the owner for read/ownership
  // checks that DO read `trips` directly, e.g. verifyTripOwnership). ──
  await pg.query(
    `INSERT INTO trip_collaborators (id, trip_id, user_id, role)
     VALUES ($1, $2, $3, 'owner')
     ON CONFLICT (trip_id, user_id) DO NOTHING`,
    [COLLAB_ID, TRIP_ID, travelerId],
  );

  // ── trip_expert_advisors row (NOTE: the column is `local_expert_id`, not
  // `expert_id` — shared/schema.ts:142). status='accepted' passes the canonical
  // TRIP_ADVISOR_ACCESS_STATUSES allow-list (pending|accepted|assigned) in
  // server/utils/trip-advisor.ts. workspace_status resets to 'draft' every run so
  // the delivery-advance step (Step 5) exercises draft->in_review->delivered fresh. ──
  await pg.query(
    `INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, workspace_status)
     VALUES ($1, $2, $3, 'accepted', 'draft')
     ON CONFLICT (trip_id, local_expert_id) DO UPDATE SET
       status = 'accepted', workspace_status = 'draft', expert_response = NULL`,
    [ADVISOR_ID, TRIP_ID, expertId],
  );

  // ── 4 items, mixed routing states at baseline ──
  const items = [
    { id: ITEM_A, title: "Fushimi Inari Sunrise Hike", type: "activity", routing: "in_planning" },
    { id: ITEM_B, title: "Gion Kaiseki Dinner", type: "dining", routing: "in_planning" },
    { id: ITEM_C, title: "Arashiyama Bamboo Grove Walk", type: "activity", routing: "with_expert" },
    { id: ITEM_D, title: "Nishiki Market Food Tour", type: "activity", routing: "ready_for_checkout" },
  ];
  for (const it of items) {
    await pg.query(
      `INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, routing_status,
                                     location_name, estimated_cost, expert_note)
       VALUES ($1, $2, $3, $4, 1, $5, 'Kyoto', 20.00, NULL)
       ON CONFLICT (id) DO UPDATE SET
         routing_status = EXCLUDED.routing_status, expert_note = NULL,
         estimated_cost = EXCLUDED.estimated_cost, title = EXCLUDED.title,
         updated_at = now()`,
      [it.id, TRIP_ID, it.title, it.type, it.routing],
    );
  }

  return { travelerId, expertId, itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])) };
}

// ─────────────────────────────────────────────────────────────────────────────────
// STEP RUNNER — every mutation step pairs a UI assertion with a direct DB assertion
// (§4b rule 5: "a screenshot alone never counts as PASS"). `fn` returns
// `{ ui, db, verdict?, note? }`; verdict defaults to PASS on return, FAIL on throw.
// KNOWN_DEFECT is an explicit verdict a step can return itself (see Step 3) — it is
// NOT the same as FAIL: it keeps the overall run green while still recording exactly
// what happened, with a UI + DB proof pair like every other step.
// ─────────────────────────────────────────────────────────────────────────────────
let stepCounter = 0;
const results = [];

async function runStep(action, fn, opts = {}) {
  stepCounter += 1;
  const n = stepCounter;
  const startedAt = Date.now();

  if (opts.external && SKIP_EXTERNAL) {
    results.push({ n, action, ui: "skipped (--skip-external)", db: "skipped (--skip-external)", verdict: "EXTERNAL" });
    console.log(`[EXTERNAL] ${n}. ${action} — skipped (--skip-external)`);
    return;
  }

  try {
    const out = await fn();
    const verdict = out.verdict || "PASS";
    results.push({
      n,
      action,
      ui: out.ui,
      db: out.db,
      verdict,
      note: out.note,
      ms: Date.now() - startedAt,
    });
    console.log(`[${verdict}] ${n}. ${action}${out.note ? ` — ${out.note}` : ""}`);
  } catch (err) {
    let screenshot = null;
    if (opts.page) {
      try {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        screenshot = path.join(OUT_DIR, `step-${n}-${slugify(action)}.png`);
        await opts.page.screenshot({ path: screenshot, fullPage: true });
      } catch {
        screenshot = null;
      }
    }
    results.push({
      n,
      action,
      ui: err.uiProof ?? null,
      db: err.dbProof ?? null,
      verdict: "FAIL",
      note: err.message,
      screenshot,
      ms: Date.now() - startedAt,
    });
    console.log(`[FAIL] ${n}. ${action} — ${err.message}${screenshot ? ` (screenshot: ${screenshot})` : ""}`);
  }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

async function waitVisible(page, testId, timeout = 10000) {
  const sel = `[data-testid="${testId}"]`;
  await page.waitForSelector(sel, { state: "visible", timeout });
  return sel;
}

async function notVisible(page, testId, timeout = 5000) {
  const sel = `[data-testid="${testId}"]`;
  await page.waitForSelector(sel, { state: "detached", timeout }).catch(async () => {
    // Some rows render `display:none`/removed differently — fall back to a
    // hidden-state wait so a badge that flips off is still honestly checked.
    await page.waitForSelector(sel, { state: "hidden", timeout: 1000 });
  });
}

async function dbOne(pg, sql, params) {
  const res = await pg.query(sql, params);
  return res.rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────────
// LOGIN — page.request.post against /api/auth/login, the exact pattern already
// proven in e2e/global-setup.ts (this app has no /login page; auth is the
// SignInModal dialog, which POSTs the same endpoint).
// ─────────────────────────────────────────────────────────────────────────────────
async function login(context, email) {
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  if (!res.ok()) {
    throw new Error(
      `login failed for ${email}: ${res.status()} ${res.statusText()} ` +
        `${(await res.text().catch(() => "")).slice(0, 200)}`,
    );
  }
  const me = await page.request.get("/api/auth/user");
  if (!me.ok()) throw new Error(`authed-confirmation failed for ${email}: /api/auth/user ${me.status()}`);
  return page;
}

// ─────────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────────
async function main() {
  await preflight();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();

  console.log("[seed] resetting & seeding jrny- fixtures (idempotent)...");
  const seeded = await resetAndSeedFixtures(pg);
  console.log(`[seed] trip=${TRIP_ID} traveler=${seeded.travelerId} expert=${seeded.expertId}`);

  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: fs.existsSync(CHROMIUM_EXECUTABLE) ? CHROMIUM_EXECUTABLE : undefined,
    args: ["--no-sandbox"],
  });

  const travelerCtx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 1000 } });
  const expertCtx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 1000 } });

  let travelerPage, expertPage;

  try {
    // ── login (not its own numbered step — precondition every step depends on;
    // failure here is a hard abort, not a per-step FAIL, since nothing else can run) ──
    travelerPage = await login(travelerCtx, TRAVELER_EMAIL);
    expertPage = await login(expertCtx, EXPERT_EMAIL);
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
          // The fix landed: client now sends a coercible value, or the schema now
          // accepts a number. This is the intended, healthy outcome — PASS.
          return {
            ui: `POST /api/trips/${TRIP_ID}/itinerary-items -> 201 (form submitted via button-inline-add-confirm)`,
            db: `itinerary_items row created, estimated_cost=${dbRow.estimated_cost}`,
            verdict: "PASS",
            note: "estimatedCost defect appears FIXED — number now accepted (re-check this file's header comment)",
          };
        }

        if (status === 400 && !dbRow) {
          // The known, currently-live defect: insertItineraryItemSchema requires a
          // string for the decimal `estimatedCost` column; the client sends a
          // parseFloat()'d number. Confirmed directly against the schema while this
          // journey was authored (see header comment). This is an EXPECTED failure,
          // not a script bug — verdict KNOWN_DEFECT, not FAIL.
          const body = await resp.json().catch(() => ({}));
          return {
            ui: `POST /api/trips/${TRIP_ID}/itinerary-items -> 400 (form submitted via button-inline-add-confirm)`,
            db: `no itinerary_items row created for title='${CUSTOM_ITEM_TITLE}' (confirmed absent)`,
            verdict: "KNOWN_DEFECT",
            note: `estimatedCost type mismatch reproduced as expected: ${JSON.stringify(body).slice(0, 150)}`,
          };
        }

        // Anything else (500, a 400 for a DIFFERENT reason, a 201 with no row, a
        // 400 with a row anyway) is a genuine, unanticipated FAIL — do not paper
        // over it as the known defect.
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

        // draft -> in_review
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

        // in_review -> delivered
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
        // server/routes/routing.routes.ts + client/src/components/plancard/
        // ActivitiesSection.tsx `RoutingActions` are explicit that this edge (the
        // "one cell where the expert workspace has WRITES") is granted to the
        // expert on the SERVER, but the UI component that renders these buttons is
        // gated `isOwner &&` — the expert never gets action buttons at all,
        // regardless of state. There is no PLANNED gap here to work around; this is
        // simply how the feature is built today, so the journey drives the edge the
        // only way it is reachable: a direct API call from the expert's authenticated
        // session (still real auth — same cookies the browser would use).
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
        // Same route-finding note as Step 1: /dashboard is the reachable surface
        // whose PlanCard self-fetches real routingStatus (see Step 1's comment).
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

  // ── Report ──
  const failures = results.filter((r) => r.verdict === "FAIL");
  const verdictObj = { journey: "expert-loop", steps: results, failures };

  console.log("\n" + JSON.stringify(verdictObj, null, 2));

  console.log("\n#  Verdict        Action");
  console.log("-- -------------- " + "-".repeat(60));
  for (const r of results) {
    console.log(`${String(r.n).padEnd(2)} ${r.verdict.padEnd(14)} ${r.action}`);
    if (r.ui) console.log(`     ui: ${r.ui}`);
    if (r.db) console.log(`     db: ${r.db}`);
    if (r.note) console.log(`     note: ${r.note}`);
    if (r.screenshot) console.log(`     screenshot: ${r.screenshot}`);
  }
  console.log("");
  console.log(
    `${results.length} steps: ${results.filter((r) => r.verdict === "PASS").length} PASS, ` +
      `${results.filter((r) => r.verdict === "KNOWN_DEFECT").length} KNOWN_DEFECT, ` +
      `${results.filter((r) => r.verdict === "EXTERNAL").length} EXTERNAL, ` +
      `${failures.length} FAIL`,
  );

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
