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
 * THE FOUR RUN GATES (plus the one mount-order-dead twin, kept in sync):
 *   1. POST /api/itinerary-comparisons                    (routes.ts, tripId branch)
 *   2. POST /api/itinerary-comparisons/:id/generate       (routes.ts — the paid/free-rerun/pass run)
 *   3. POST /api/itinerary-comparisons/:id/apply-to-trip  (plancard.routes.ts — the rewrite itself)
 *   4. POST /api/trips/:tripId/itinerary/optimize-order   (routes.ts live + trips.routes.ts twin —
 *      declared a trip-item mutation path by its own D1 comment)
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
  [
    "POST /api/trips/:tripId/itinerary/optimize-order (dead twin)",
    handlerSlice(tripsRoutesSrc, 'router.post("/api/trips/:tripId/itinerary/optimize-order"', 'router.post("/api/itinerary/estimate-travel"'),
  ],
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
