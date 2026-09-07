#!/usr/bin/env node
/**
 * check-trip-route-shadows.cjs — S4 sweep guard (ledger `2026-09-07-shadowed-trip-twins`).
 *
 * THE CLASS. tripsRoutes (server/routes/trips.routes.ts) is mounted LAST, after the inline
 * registrations in server/routes.ts, and Express serves the FIRST match — so any method+path
 * registered in BOTH files is served by the inline copy while the router copy runs never.
 * Those twins once won instead (the mount-order incident noted at routes.ts's mount site):
 * a stale copy of a mutation handler silently served production traffic.
 *
 * THE SWEEP. On 2026-09-07 the fourteen POST mutation twins were proven unreachable (every
 * inline twin responds and never calls next() — the reachability probe is recorded in the
 * ledger row) and deleted from trips.routes.ts.
 *
 * THIS GUARD. Both halves of the invariant, so the class cannot regrow in either direction:
 *   1. FORBIDDEN — none of the fourteen swept paths is registered in trips.routes.ts again.
 *      (Resurrecting one resurrects the shadow, and the resurrected copy would lack the
 *      allowlists the live handler carries — the port-forward warning in the tombstone.)
 *   2. REQUIRED — every one of the fourteen still has its canonical inline registration in
 *      routes.ts. Deleting the inline half would silently un-serve a live route; this half
 *      makes that a build failure instead of a 404 in production.
 *
 * NEGATIVE SPACE. Other duplicate registrations between the two files remain (27 at sweep
 * time — GETs and non-trips paths, the filed full sweep). This guard is a DENYLIST of the
 * swept fourteen, not a zero-duplicate rule; a brand-new duplication not on the list is
 * NOT caught here. Adding to the list is a deliberate act: prove the inline twin always
 * terminates the response first, then sweep, then list.
 *
 * §18d: `--self-test` runs the committed fixtures below FIRST in CI; a guard that cannot
 * fail on a known-bad shape reports PASS for its whole life.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIVE_FILE = "server/routes.ts";
const ROUTER_FILE = "server/routes/trips.routes.ts";

/** The fourteen swept mutation twins (method PATH), in tombstone order. */
const SWEPT = [
  "post /api/trips/:id/claim",
  "post /api/trips/:tripId/participants",
  "post /api/trips/:tripId/participants/bulk-invite",
  "post /api/trips/:tripId/contracts",
  "post /api/trips/:tripId/transactions",
  "post /api/trips/:tripId/transactions/split",
  "post /api/trips/:tripId/budget/calculate-split",
  "post /api/trips/:tripId/itinerary-items",
  "post /api/trips/:tripId/itinerary/reorder",
  "post /api/trips/:tripId/itinerary/optimize-order",
  "post /api/trips/:tripId/activate-transport",
  "post /api/trips/:tripId/emergency-contacts",
  "post /api/trips/:tripId/emergency/initialize",
  "post /api/trips/:tripId/alerts",
];

/** Registrations of `method "path"` found in a source file (both quote styles). */
function registrations(src) {
  const found = new Set();
  const re = /(?:app|router)\.(get|post|patch|put|delete)\(\s*["'](\/api\/[^"']+)["']/g;
  for (const m of src.matchAll(re)) found.add(`${m[1]} ${m[2]}`);
  return found;
}

function check(liveSrc, routerSrc) {
  const errors = [];
  const live = registrations(liveSrc);
  const router = registrations(routerSrc);
  for (const key of SWEPT) {
    if (router.has(key)) {
      errors.push(
        `${ROUTER_FILE} registers \`${key}\` again — the §9 shadow is back. The live handler is ` +
          `the inline copy in ${LIVE_FILE}; delete the twin (and NEVER resurrect it without the ` +
          `allowlists recorded in the S4 tombstone).`,
      );
    }
    if (!live.has(key)) {
      errors.push(
        `${LIVE_FILE} no longer registers \`${key}\` — the canonical inline handler is gone and the ` +
          `route is now un-served. If the route is deliberately retired, remove it from SWEPT in ` +
          `scripts/check-trip-route-shadows.cjs in the same change.`,
      );
    }
  }
  return errors;
}

// ── committed self-test fixtures (§18d) ─────────────────────────────────────────────
function selfTest() {
  const liveAll = SWEPT.map((k) => {
    const [method, p] = k.split(" ");
    return `app.${method}("${p}", isAuthenticated, async (req, res) => { res.json({}); });`;
  }).join("\n");
  const cleanRouter = 'router.post("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => { res.json({}); });';
  const shadowedRouter = cleanRouter + '\nrouter.post("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => { res.json({}); });';
  const liveMissingOne = liveAll.replace('app.post("/api/trips/:id/claim"', 'app.post("/api/trips/:id/claim-REMOVED"');

  const cases = [
    ["clean pair passes", () => check(liveAll, cleanRouter).length === 0],
    ["a resurrected shadow FAILS", () => check(liveAll, shadowedRouter).some((e) => e.includes("shadow is back"))],
    ["a missing canonical registration FAILS", () => check(liveMissingOne, cleanRouter).some((e) => e.includes("un-served"))],
    ["single-quoted registrations are seen", () => check(liveAll.replace(/"/g, "'"), cleanRouter).length === 0],
    ["both failures report at once", () => check(liveMissingOne, shadowedRouter).length === 2],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch { ok = false; }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`\ntrip-route-shadows guard SELF-TEST FAILED — ${failed} fixture case(s). Fix the predicate before trusting a green run.`);
    process.exit(1);
  }
  console.log(`\ntrip-route-shadows guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const liveSrc = fs.readFileSync(path.join(ROOT, LIVE_FILE), "utf8");
  const routerSrc = fs.readFileSync(path.join(ROOT, ROUTER_FILE), "utf8");
  const errors = check(liveSrc, routerSrc);
  if (errors.length > 0) {
    console.error("trip-route-shadows guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  console.log(`trip-route-shadows guard: OK — ${SWEPT.length} swept twins stay deleted; all canonical inline handlers present.`);
}

main();
