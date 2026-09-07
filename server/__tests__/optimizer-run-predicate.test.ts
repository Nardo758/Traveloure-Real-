/**
 * THE OPTIMIZER RUN IS AUTHORIZED BY THE ITEM-MUTATION PREDICATE — CLAUDE.md Locked Decision 42
 * D17 (decision-maker ratified Sep 5 2026; ledger `2026-09-06-optimizer-run-predicate`).
 *
 * An optimizer run — paid, free re-run, or Trip Pass — REWRITES the plan's items. It is the
 * largest item write on the platform, and it was gated by the wrong one of the two predicates:
 * `authorizeTripLogistics`, a READ-shaped tier that grants `pending` advisors (correctly, for
 * reading) and audit-logged cross-trip admin (which item mutations never grant). Ruling 12 drew
 * this line for every other item write path. ONE predicate, one more caller — a second "may this
 * person rewrite the plan?" test is the drift class §18 rule 1 names.
 *
 * THE FOUR RUN GATES (plus the mount-order-dead twin, WHENEVER ONE EXISTS):
 *   1. POST /api/itinerary-comparisons                    (routes.ts, tripId branch)
 *   2. POST /api/itinerary-comparisons/:id/generate       (routes.ts — the paid/free-rerun/pass run)
 *   3. POST /api/itinerary-comparisons/:id/apply-to-trip  (plancard.routes.ts — the rewrite itself)
 *   4. POST /api/trips/:tripId/itinerary/optimize-order   (routes.ts live; declared a trip-item
 *      mutation path by its own D1 comment). The trips.routes.ts twin was DELETED as
 *      mount-order-dead by ledger `2026-09-07-shadowed-twins`, so this pin covers it
 *      CONDITIONALLY: a twin that does not exist cannot drift, and a twin that comes back is
 *      held to the same predicate as the live copy (R6). Resurrection is independently refused
 *      by `scripts/check-trip-route-shadows.cjs`; this pin is the second half of that rule, not
 *      a restatement of it.
 *
 * What these hold:
 *   R1  every run gate resolves `getTripWriteRole` and admits via `canMutateTrip`, with the
 *       mutation handlers' parallel `isTripAuthor` branch — the mutation rail's exact shape.
 *   R2  no run gate calls `authorizeTripLogistics(` any more (prose naming it is not a call).
 *   R3  the predicate excludes pending BY CONSTRUCTION: `getTripWriteRole`'s advisor branch is
 *       `isTripAdvisorWithWriteAccess` (accepted/assigned), and `canMutateTrip` admits only
 *       owner/expert — pinned at the predicate, so no call site can re-admit pending.
 *   R4  ONE predicate: no new optimizer-run authorization module or symbol exists anywhere
 *       under server/ — the lane adds callers, never a second test.
 *   R5  scope discipline: `authorizeTripLogistics` keeps its logistics call sites (the reorder
 *       rail's `requireWriteAccess` is D1 lineage, NOT this ruling), and the READ-shaped
 *       optimization preview stays on the read tier.
 *
 * Pure + static source pins: no DB, no server, no network.
 * Run: npx tsx --test server/__tests__/optimizer-run-predicate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = join(ROOT, "server");
const routesSrc = readFileSync(join(SERVER, "routes.ts"), "utf8");
const plancardSrc = readFileSync(join(SERVER, "routes", "plancard.routes.ts"), "utf8");
const tripsRoutesSrc = readFileSync(join(SERVER, "routes", "trips.routes.ts"), "utf8");
const tripRoleSrc = readFileSync(join(SERVER, "utils", "trip-role.ts"), "utf8");
const optimizationRoutesSrc = readFileSync(join(SERVER, "routes", "optimization.routes.ts"), "utf8");

/** The text of one handler: from its registration marker to the next registered route. */
function handlerSlice(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  assert.ok(start > -1, `handler start not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `handler end not found after ${startMarker}: ${endMarker}`);
  return src.slice(start, end);
}

/**
 * The text of one handler when it is registered at all, else null. Used ONLY for a copy whose
 * absence is itself correct — today the optimize-order twin. The strict `handlerSlice` stays the
 * default everywhere else: a live gate that vanishes must still fail loudly.
 */
function optionalHandlerSlice(src: string, startMarker: string, endMarker: string): string | null {
  const start = src.indexOf(startMarker);
  if (start === -1) return null;
  const end = src.indexOf(endMarker, start + startMarker.length);
  return src.slice(start, end > start ? end : undefined);
}

const OPTIMIZE_ORDER_TWIN = optionalHandlerSlice(
  tripsRoutesSrc,
  'router.post("/api/trips/:tripId/itinerary/optimize-order"',
  'router.post("/api/itinerary/estimate-travel"',
);

const RUN_GATES: Array<[name: string, slice: string]> = [
  [
    "POST /api/itinerary-comparisons (create)",
    handlerSlice(routesSrc, 'app.post("/api/itinerary-comparisons", isAuthenticated', 'app.get("/api/itinerary-comparisons"'),
  ],
  [
    "POST /api/itinerary-comparisons/:id/generate",
    handlerSlice(routesSrc, 'app.post("/api/itinerary-comparisons/:id/generate"', 'app.post("/api/itinerary-comparisons/:id/select"'),
  ],
  [
    "POST /api/itinerary-comparisons/:id/apply-to-trip",
    handlerSlice(plancardSrc, 'router.post("/api/itinerary-comparisons/:id/apply-to-trip"', "// ──"),
  ],
  [
    "POST /api/trips/:tripId/itinerary/optimize-order (live)",
    handlerSlice(routesSrc, 'app.post("/api/trips/:tripId/itinerary/optimize-order"', 'app.post("/api/itinerary/estimate-travel"'),
  ],
  ...(OPTIMIZE_ORDER_TWIN
    ? ([["POST /api/trips/:tripId/itinerary/optimize-order (mount-order-dead twin)", OPTIMIZE_ORDER_TWIN]] as Array<
        [name: string, slice: string]
      >)
    : []),
];

/** Every .ts under server/, tests excluded. */
function serverFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      serverFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("R6 — the deleted twin is covered by its absence, not by silence", () => {
  it("either trips.routes.ts registers no optimize-order twin, or the twin is pinned above", () => {
    // The failure this closes: a pin that REQUIRED the twin's text turned a correct deletion into
    // a red gate, which invites deleting the pin (OPERATING_PROCEDURE §3 forbids that — a pin is
    // repaired to assert the invariant). The invariant is "no copy of this route rewrites a plan
    // without the mutation predicate", and a copy that does not exist satisfies it.
    if (OPTIMIZE_ORDER_TWIN === null) {
      assert.doesNotMatch(
        tripsRoutesSrc,
        /router\.post\(\s*["']\/api\/trips\/:tripId\/itinerary\/optimize-order["']/,
        "no twin was sliced, so none may be registered under a different spelling either",
      );
      return;
    }
    assert.ok(
      RUN_GATES.some(([name]) => name.includes("mount-order-dead twin")),
      "a registered twin must be in RUN_GATES and held to R1-R3",
    );
  });
});

describe("R1 — every run gate uses the item-mutation predicate, in the mutation rail's shape", () => {
  for (const [name, slice] of RUN_GATES) {
    it(`${name}`, () => {
      assert.match(slice, /getTripWriteRole\(/, "write-role resolution missing");
      assert.match(slice, /canMutateTrip\(tripRole\)/, "mutation predicate missing");
      assert.match(slice, /isTripAuthor\(/, "the parallel author branch is missing");
      assert.match(slice, /403/, "the refusal is missing");
    });
  }
});

describe("R2 — no run gate calls the logistics predicate", () => {
  for (const [name, slice] of RUN_GATES) {
    it(`${name}`, () => {
      assert.ok(!slice.includes("authorizeTripLogistics("), "still calls authorizeTripLogistics(");
    });
  }
});

describe("R3 — pending is excluded BY CONSTRUCTION, at the predicate", () => {
  it("getTripWriteRole resolves the advisor branch through the WRITE allow-list", () => {
    const fn = tripRoleSrc.match(/export async function getTripWriteRole[\s\S]*?\n\}/);
    assert.ok(fn, "getTripWriteRole not found");
    assert.match(fn[0], /isTripAdvisorWithWriteAccess/);
    assert.ok(!fn[0].includes("isTripAdvisor("), "read-tier advisor predicate leaked into the write resolver");
  });
  it("canMutateTrip admits owner and expert ONLY (friend and null are false) — pinned at the source", () => {
    const fn = tripRoleSrc.match(/export function canMutateTrip\(role: TripRole\): boolean \{[\s\S]*?\n\}/);
    assert.ok(fn, "canMutateTrip not found");
    assert.match(fn[0], /return role === "owner" \|\| role === "expert";/);
  });
});

describe("R4 — ONE predicate: no second optimizer-run authorization exists", () => {
  it("no optimizer-run authorization symbol is invented anywhere under server/", () => {
    const offenders = serverFiles(SERVER).filter((f) =>
      /authorizeOptimizerRun|authorizeTripRun|authorizeOptimizerTrip/.test(readFileSync(f, "utf8")),
    );
    assert.deepEqual(offenders, []);
  });
});

describe("R5 — scope discipline", () => {
  it("the reorder rail keeps its D1-lineage logistics gate (NOT this ruling's surface)", () => {
    const reorder = handlerSlice(
      routesSrc,
      'app.post("/api/trips/:tripId/itinerary/reorder"',
      'app.post("/api/trips/:tripId/itinerary/optimize-order"',
    );
    assert.match(reorder, /authorizeTripLogistics\([\s\S]*requireWriteAccess: true/);
  });
  it("the READ-shaped optimization preview stays on the logistics read tier", () => {
    assert.match(optimizationRoutesSrc, /authorizeTripLogistics\(/);
  });
});
