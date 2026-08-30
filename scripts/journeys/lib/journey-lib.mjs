// scripts/journeys/lib/journey-lib.mjs
//
// Shared mechanics for the journey suite (docs/EXECUTION_MAP.md §4b), EXTRACTED from
// expert-loop.mjs's proven implementation (Aug 1, 2026) — do not duplicate any of this logic in
// a new journey file; import it from here instead. expert-loop.mjs itself was refactored to
// consume this module (same behavior, proven via a before/after re-run — see its own header).
//
// Provides: CLI/env config resolution, Postgres connection helper, a Playwright launcher
// (executablePath /opt/pw-browsers, --no-sandbox), the login pattern (page.request.post
// /api/auth/login — this app has no /login page; auth is the SignInModal, which POSTs the same
// endpoint), a step-runner with verdict-table collection + JSON/table/summary report + exit
// code + screenshot-on-FAIL, small DOM wait helpers, and generic idempotent upsert helpers for
// the fixture shapes every journey in this suite reuses (trip, trip_collaborators owner row,
// trip_expert_advisors row, itinerary_items).
//
// ENVIRONMENT CONTRACT (identical across every journey in this suite — see each journey's own
// header for its exact cold-boot recipe): DATABASE_URL, BASE_URL, dummy external-service keys
// (STRIPE_SECRET_KEY=sk_test_x, AMADEUS_API_KEY=x, AMADEUS_API_SECRET=x). Every journey is a
// SANDBOX/structural journey (§4b rule 4) unless a specific step is marked `{ external: true }`.

import { chromium } from "@playwright/test";
import { Client as PgClient } from "pg";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────────
// CONFIG — CLI flags / env vars, with expert-loop.mjs's exact defaults (the shared sandbox
// this whole suite is authored and proven against). A journey may override individual
// defaults (e.g. a different --out subdirectory) by passing its own fallback into
// `resolveConfig()`.
// ─────────────────────────────────────────────────────────────────────────────────

export function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export const hasFlag = (flag) => process.argv.includes(flag);

export const DEFAULT_BASE_URL = "http://localhost:5601";
export const DEFAULT_DB_URL = "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg";

export function resolveConfig(overrides = {}) {
  const BASE_URL = argValue("--base-url", process.env.JOURNEY_BASE_URL || overrides.baseUrl || DEFAULT_BASE_URL);
  const DB_URL = argValue(
    "--db-url",
    process.env.DATABASE_URL || overrides.dbUrl || DEFAULT_DB_URL,
  );
  const OUT_DIR = argValue(
    "--out",
    process.env.JOURNEY_OUT_DIR || overrides.outDir || path.join(process.cwd(), "journey-out"),
  );
  const HEADED = hasFlag("--headed");
  const SKIP_EXTERNAL = hasFlag("--skip-external");
  const PASSWORD = process.env.E2E_TEST_PASSWORD || "TestPass123!";
  return { BASE_URL, DB_URL, OUT_DIR, HEADED, SKIP_EXTERNAL, PASSWORD };
}

export const CHROMIUM_EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export function bootRecipe({ baseUrl, dbUrl, journeyFile, journeyLabel = "" }) {
  return `
  App is not reachable at ${baseUrl} (or the DB at the configured URL is not
  answering). Cold-boot recipe:

    PGDIR=/var/tmp/expws-pg
    mkdir -p "$PGDIR"
    /usr/lib/postgresql/16/bin/initdb -D "$PGDIR/data" -U postgres --auth=trust
    /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDIR/data" -o "-p 55442 -k $PGDIR" -l "$PGDIR/log" start
    /usr/lib/postgresql/16/bin/createdb -h "$PGDIR" -p 55442 -U postgres expws

    DATABASE_URL="postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg" \\
    STRIPE_SECRET_KEY=sk_test_x AMADEUS_API_KEY=x AMADEUS_API_SECRET=x \\
    RATE_LIMIT_LOOPBACK_SKIP=1 \\
    SESSION_SECRET=expws-secret PORT=5601 NODE_ENV=development \\
    npx tsx server/index.ts

  Then re-run:
    node ${journeyFile}${journeyLabel ? ` (${journeyLabel})` : ""} --base-url ${baseUrl} --db-url "<db url>"

  (Adjust the postgres bin path / version to whatever \`pg_ctl --version\` finds on the box. Use a
  FRESH, UNIQUE db name + port per lane if you are NOT reusing the shared sandbox — see
  docs/EXECUTION_MAP.md L25 "Verification-integrity landmine": reusePort:true in dev means two
  lanes on the same PORT round-robin between servers/DBs silently. RATE_LIMIT_LOOPBACK_SKIP=1
  exempts loopback from the per-IP \`generalRateLimiter\` — server/infrastructure/rate-limiter.ts's
  own documented escape hatch for "CI Playwright gates drive hundreds of same-IP localhost
  requests per minute." Running several journeys back to back (run-all.mjs) WILL 429 on
  /api/auth/login without it — proven live while building this suite. NEVER set it in production.)
`;
}

// ─────────────────────────────────────────────────────────────────────────────────
// PRE-FLIGHT — reachability only. Never attempts to boot anything itself (§4b rule 6: the
// recipe is embedded for a human/model to run, not executed implicitly).
// ─────────────────────────────────────────────────────────────────────────────────
export async function preflight({ baseUrl, dbUrl, journeyFile, journeyLabel }) {
  let appOk = false;
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    appOk = res.status < 500;
  } catch {
    appOk = false;
  }
  const recipe = bootRecipe({ baseUrl, dbUrl, journeyFile, journeyLabel });
  if (!appOk) {
    console.error(`\n[preflight] App not reachable at ${baseUrl}.\n${recipe}`);
    process.exit(1);
  }

  const probe = new PgClient({ connectionString: dbUrl });
  try {
    await probe.connect();
    await probe.query("SELECT 1");
  } catch (err) {
    console.error(`\n[preflight] DB not reachable at ${dbUrl}: ${err.message}\n${recipe}`);
    process.exit(1);
  } finally {
    await probe.end().catch(() => {});
  }
  console.log(`[preflight] app OK (${baseUrl}), db OK.`);
}

// ─────────────────────────────────────────────────────────────────────────────────
// DB POOL HELPER
// ─────────────────────────────────────────────────────────────────────────────────
export async function connectDb(dbUrl) {
  const pg = new PgClient({ connectionString: dbUrl });
  await pg.connect();
  return pg;
}

export async function dbOne(pg, sql, params) {
  const res = await pg.query(sql, params);
  return res.rows[0] ?? null;
}

export async function dbAll(pg, sql, params) {
  const res = await pg.query(sql, params);
  return res.rows;
}

export async function resolveUserIdByEmail(pg, email) {
  const row = await dbOne(pg, "SELECT id FROM users WHERE email = $1", [email]);
  if (!row) {
    throw new Error(
      `E2E account ${email} not found — the app must have booted at least once for ` +
        `server/seeds/e2e-test-accounts.seed.ts to auto-seed it. See the cold-boot recipe.`,
    );
  }
  return row.id;
}

// ─────────────────────────────────────────────────────────────────────────────────
// FIXTURE HELPERS — idempotent upserts for the shapes every journey in this suite reuses
// (trip, trip_collaborators owner row, trip_expert_advisors row, itinerary_items). Each
// journey picks its OWN `jrny-<name>-` id prefix (never reuse another journey's prefix — see
// scripts/journeys/README.md "Idempotent fixtures") and passes fully-qualified ids in.
// ─────────────────────────────────────────────────────────────────────────────────

export function isoDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * Upsert a trip row. Pass `userId` for a normal traveler-owned trip, or `authorId` (with
 * `userId: null`) for an AUTHORED build (ready-made brief §2a: NULL owner = excluded from every
 * traveler surface). Both may be set is never valid product state; callers pick one mode.
 */
export async function upsertTrip(pg, {
  id, userId = null, authorId = null, title, destination,
  startDate, endDate, status = "planning", eventType = "vacation",
  numberOfTravelers = 2, adults = 2, kids = 0,
}) {
  await pg.query(
    `INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status,
                         event_type, number_of_travelers, adults, kids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id, author_id = EXCLUDED.author_id, status = EXCLUDED.status,
       title = EXCLUDED.title, destination = EXCLUDED.destination,
       start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, updated_at = now()`,
    [id, userId, authorId, title, destination, startDate, endDate, status, eventType, numberOfTravelers, adults, kids],
  );
}

/** trip_collaborators owner row — see the L10 owner under-grant note in CLAUDE.md §13: several
 *  mutation paths (getTripRole-backed) need this explicit row even though trips.userId already
 *  makes the traveler the owner for verifyTripOwnership-style checks. */
export async function upsertCollaboratorOwner(pg, { id, tripId, userId, role = "owner" }) {
  await pg.query(
    `INSERT INTO trip_collaborators (id, trip_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (trip_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [id, tripId, userId, role],
  );
}

/** trip_expert_advisors row. Column is `local_expert_id`, not `expert_id` (shared/schema.ts).
 *  `status` must pass the canonical TRIP_ADVISOR_ACCESS_STATUSES allow-list
 *  (pending|accepted|assigned — server/utils/trip-advisor.ts); 'rejected' denies. */
export async function upsertAdvisor(pg, {
  id, tripId, expertId, status = "accepted", workspaceStatus = "draft",
  planApprovalStatus = null, planApprovedAt = null, planReviewNote = null,
}) {
  await pg.query(
    `INSERT INTO trip_expert_advisors
       (id, trip_id, local_expert_id, status, workspace_status, plan_approval_status, plan_approved_at, plan_review_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (trip_id, local_expert_id) DO UPDATE SET
       status = EXCLUDED.status, workspace_status = EXCLUDED.workspace_status,
       plan_approval_status = EXCLUDED.plan_approval_status, plan_approved_at = EXCLUDED.plan_approved_at,
       plan_review_note = EXCLUDED.plan_review_note, expert_response = NULL`,
    [id, tripId, expertId, status, workspaceStatus, planApprovalStatus, planApprovedAt, planReviewNote],
  );
}

/** itinerary_items row — the fields the journeys in this suite actually vary. Every other
 *  column keeps its table default. `estimatedCost` is a decimal(10,2) column
 *  (insertItineraryItemSchema/drizzle-zod requires a STRING at the API boundary — this raw-SQL
 *  path is unaffected, but keep the convention for readability). */
export async function upsertItem(pg, {
  id, tripId, title, itemType = "activity", dayNumber = 1,
  routingStatus = "in_planning", locationName = "Kyoto", estimatedCost = "20.00",
  expertNote = null, providerServiceId = null, latitude = null, longitude = null,
  durationMinutes = null, transportProvided = null, pickupPoint = null, startTime = null,
  description = null,
}) {
  await pg.query(
    `INSERT INTO itinerary_items
       (id, trip_id, title, item_type, day_number, routing_status, location_name, estimated_cost,
        expert_note, provider_service_id, latitude, longitude, duration_minutes,
        transport_provided, pickup_point, start_time, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (id) DO UPDATE SET
       trip_id = EXCLUDED.trip_id, title = EXCLUDED.title, item_type = EXCLUDED.item_type,
       day_number = EXCLUDED.day_number, routing_status = EXCLUDED.routing_status,
       location_name = EXCLUDED.location_name, estimated_cost = EXCLUDED.estimated_cost,
       expert_note = EXCLUDED.expert_note, provider_service_id = EXCLUDED.provider_service_id,
       latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
       duration_minutes = EXCLUDED.duration_minutes, transport_provided = EXCLUDED.transport_provided,
       pickup_point = EXCLUDED.pickup_point, start_time = EXCLUDED.start_time,
       description = EXCLUDED.description, updated_at = now()`,
    [id, tripId, title, itemType, dayNumber, routingStatus, locationName, estimatedCost,
      expertNote, providerServiceId, latitude, longitude, durationMinutes, transportProvided,
      pickupPoint, startTime, description],
  );
}

/** Delete every itinerary_items row for a trip NOT in `keepIds` — the reset half of a
 *  reset-and-seed cycle, for dynamically-created items (e.g. a prior run's "Custom add"). */
export async function deleteItemsNotIn(pg, tripId, keepIds) {
  if (keepIds.length === 0) {
    await pg.query("DELETE FROM itinerary_items WHERE trip_id = $1", [tripId]);
    return;
  }
  const placeholders = keepIds.map((_, i) => `$${i + 2}`).join(", ");
  await pg.query(
    `DELETE FROM itinerary_items WHERE trip_id = $1 AND id NOT IN (${placeholders})`,
    [tripId, ...keepIds],
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// PLAYWRIGHT LAUNCHER
// ─────────────────────────────────────────────────────────────────────────────────
export async function launchBrowser({ headed = false } = {}) {
  return chromium.launch({
    headless: !headed,
    executablePath: fs.existsSync(CHROMIUM_EXECUTABLE) ? CHROMIUM_EXECUTABLE : undefined,
    args: ["--no-sandbox"],
  });
}

// ─────────────────────────────────────────────────────────────────────────────────
// LOGIN — page.request.post against /api/auth/login (the pattern proven in
// e2e/global-setup.ts and expert-loop.mjs: this app has no /login page; auth is the
// SignInModal dialog, which POSTs the same endpoint). Returns a `page` whose `page.request`
// (and the underlying BrowserContext's `context.request`) both carry the authenticated
// session cookie — so a step that needs ONLY an API call can use `page.request.*` without
// any navigation, and a step that needs a real UI assertion can `page.goto(...)` on the
// same page.
// ─────────────────────────────────────────────────────────────────────────────────
export async function login(context, email, password, { baseUrl } = {}) {
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { email, password } });
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
// DOM WAIT HELPERS
// ─────────────────────────────────────────────────────────────────────────────────
export async function waitVisible(page, testId, timeout = 10000) {
  const sel = `[data-testid="${testId}"]`;
  await page.waitForSelector(sel, { state: "visible", timeout });
  return sel;
}

export async function notVisible(page, testId, timeout = 5000) {
  const sel = `[data-testid="${testId}"]`;
  await page.waitForSelector(sel, { state: "detached", timeout }).catch(async () => {
    // Some rows render `display:none`/removed differently — fall back to a hidden-state wait
    // so a badge that flips off is still honestly checked.
    await page.waitForSelector(sel, { state: "hidden", timeout: 1000 });
  });
}

export function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

// ─────────────────────────────────────────────────────────────────────────────────
// STEP RUNNER — verdict-table collector + JSON/table/summary report + exit code +
// screenshot-on-FAIL to gitignored journey-out/. Every mutation step pairs a UI assertion
// with a direct DB assertion (§4b rule 5: "a screenshot alone never counts as PASS"). `fn`
// returns `{ ui, db, verdict?, note? }`; verdict defaults to PASS on return, FAIL on throw.
// `KNOWN_DEFECT` is an explicit verdict a step can return itself (see expert-loop.mjs Step 3
// for the canonical self-detecting shape) — it does NOT fail the overall run.
// `{ external: true }` reports verdict EXTERNAL and skips execution when `skipExternal` is set
// on the runner (§4b rule 4 / the EXTERNAL-skip marker — never faked, always said in the table).
// ─────────────────────────────────────────────────────────────────────────────────
export function createStepRunner({ outDir, skipExternal = false }) {
  let stepCounter = 0;
  const results = [];

  async function runStep(action, fn, opts = {}) {
    stepCounter += 1;
    const n = stepCounter;
    const startedAt = Date.now();

    if (opts.external && skipExternal) {
      results.push({ n, action, ui: "skipped (--skip-external)", db: "skipped (--skip-external)", verdict: "EXTERNAL" });
      console.log(`[EXTERNAL] ${n}. ${action} — skipped (--skip-external)`);
      return;
    }

    try {
      const out = await fn();
      const verdict = out.verdict || "PASS";
      results.push({
        n, action, ui: out.ui, db: out.db, verdict, note: out.note, ms: Date.now() - startedAt,
      });
      console.log(`[${verdict}] ${n}. ${action}${out.note ? ` — ${out.note}` : ""}`);
    } catch (err) {
      let screenshot = null;
      if (opts.page) {
        try {
          fs.mkdirSync(outDir, { recursive: true });
          screenshot = path.join(outDir, `step-${n}-${slugify(action)}.png`);
          await opts.page.screenshot({ path: screenshot, fullPage: true });
        } catch {
          screenshot = null;
        }
      }
      results.push({
        n, action, ui: err.uiProof ?? null, db: err.dbProof ?? null, verdict: "FAIL",
        note: err.message, screenshot, ms: Date.now() - startedAt,
      });
      console.log(`[FAIL] ${n}. ${action} — ${err.message}${screenshot ? ` (screenshot: ${screenshot})` : ""}`);
    }
  }

  function summary() {
    const failures = results.filter((r) => r.verdict === "FAIL");
    return {
      failures,
      counts: {
        pass: results.filter((r) => r.verdict === "PASS").length,
        knownDefect: results.filter((r) => r.verdict === "KNOWN_DEFECT").length,
        external: results.filter((r) => r.verdict === "EXTERNAL").length,
        fail: failures.length,
      },
    };
  }

  /** Prints the full §4b report contract (JSON verdict object, human table, one-line summary)
   *  and returns the process exit code (0 = clean, 1 = any FAIL). Does NOT call process.exit —
   *  callers (a standalone journey's `main()`, or run-all.mjs collecting several journeys)
   *  decide when/whether to exit. */
  function printReport(journeyName) {
    const { failures, counts } = summary();
    const verdictObj = { journey: journeyName, steps: results, failures };
    // Markers bound the JSON block so a wrapper (run-all.mjs) can extract it programmatically
    // without re-deriving a parser for the human-readable table below it — the JSON stays the
    // single source of truth; the markers are purely a machine-convenience seam.
    console.log("\n##JOURNEY_JSON_START##");
    console.log(JSON.stringify(verdictObj, null, 2));
    console.log("##JOURNEY_JSON_END##");
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
      `${results.length} steps: ${counts.pass} PASS, ${counts.knownDefect} KNOWN_DEFECT, ` +
        `${counts.external} EXTERNAL, ${counts.fail} FAIL`,
    );
    return counts.fail > 0 ? 1 : 0;
  }

  return { runStep, results, summary, printReport };
}
