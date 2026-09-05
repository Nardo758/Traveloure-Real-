/**
 * optimizer-run-authorization.test.ts — CLAUDE.md Locked Decision 41, lane 1
 * (ledger `2026-09-05-trip-pass-run-gate`).
 *
 * THE BUG THIS PINS PRODUCED NO ERROR ANYWHERE. Trip Pass coverage was read at the CHARGE point
 * only (`POST /api/optimization-payments`), never at the RUN gate. A pass holder outside the 24h
 * free-rerun window was answered `{coveredByTripPass:true}`, the client created the comparison
 * with no PaymentIntent — correctly, because a covered run has none — and the run gate then saw
 * no recent run and no PI and refused: the comparison was born `pending_payment` with zero
 * variants. Nothing threw, nothing logged, and the page rendered a perfectly ordinary
 * "payment required" state. That is exactly the failure shape a test has to hold, because
 * nothing else will.
 *
 * No DB, no HTTP, no Stripe: the predicate takes its three server reads as injected functions
 * (the `pending-events.pure.ts` precedent), so P* run anywhere. A* read the SHIPPED
 * `server/routes.ts` — a pure rule a call site can reach past is not a rule.
 *
 * Run: npx tsx --test server/__tests__/optimizer-run-authorization.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveOptimizerRunAuthorization,
  logOptimizerRunBasis,
  OPTIMIZATION_FREE_RERUN_MS,
  type OptimizerRunAuthorizationDeps,
} from "../services/optimizer-run-authorization";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const routesSrc = readFileSync(join(ROOT, "server", "routes.ts"), "utf-8");
const optimizationRoutesSrc = readFileSync(
  join(ROOT, "server", "routes", "optimization.routes.ts"),
  "utf-8",
);
const predicateSrc = readFileSync(
  join(ROOT, "server", "services", "optimizer-run-authorization.ts"),
  "utf-8",
);

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

interface Calls {
  passChecks: string[];
  recentRunChecks: Array<{ userId: string; cutoff: Date }>;
  verifications: Array<Record<string, unknown>>;
}

function deps(
  over: Partial<{
    passTrips: string[];
    recentRun: boolean;
    verify: { ok: true } | { ok: false; status: number; body: Record<string, unknown> };
  }> = {},
): { deps: OptimizerRunAuthorizationDeps; calls: Calls } {
  const calls: Calls = { passChecks: [], recentRunChecks: [], verifications: [] };
  const passTrips = over.passTrips ?? [];
  return {
    calls,
    deps: {
      tripPassCoversRun: async (tripId) => {
        calls.passChecks.push(tripId);
        return passTrips.includes(tripId);
      },
      hasRecentOptimizationRun: async (userId, cutoff) => {
        calls.recentRunChecks.push({ userId, cutoff });
        return over.recentRun === true;
      },
      verifyPayment: async (params) => {
        calls.verifications.push(params);
        return over.verify ?? { ok: true };
      },
      now: () => NOW,
    },
  };
}

// ── P: the predicate ─────────────────────────────────────────────────────────────────────────────

test("P1: an active Trip Pass on THIS trip authorizes the run, basis trip_pass", async () => {
  const { deps: d } = deps({ passTrips: ["trip-a"] });
  const auth = await resolveOptimizerRunAuthorization({ userId: "u-1", tripId: "trip-a" }, d);
  assert.deepEqual(auth, { authorized: true, basis: "trip_pass" });
});

test("P2 (NEGATIVE): a pass on a DIFFERENT trip authorizes nothing", async () => {
  const { deps: d, calls } = deps({ passTrips: ["trip-with-pass"] });
  const auth = await resolveOptimizerRunAuthorization({ userId: "u-1", tripId: "trip-b" }, d);
  assert.deepEqual(auth, { authorized: false, reason: "payment_required" });
  // The entitlement was asked about the trip actually being run, never about "any trip of mine".
  assert.deepEqual(calls.passChecks, ["trip-b"]);
});

test("P3 (NEGATIVE): no pass, no run in the window, no PaymentIntent ⇒ refused", async () => {
  const { deps: d } = deps();
  const auth = await resolveOptimizerRunAuthorization({ userId: "u-1", tripId: "trip-a" }, d);
  assert.deepEqual(auth, { authorized: false, reason: "payment_required" });
});

test("P4: a completed run inside the 24h window is the free re-run, and the clock is that window", async () => {
  const { deps: d, calls } = deps({ recentRun: true });
  const auth = await resolveOptimizerRunAuthorization({ userId: "u-1", tripId: "trip-a" }, d);
  assert.deepEqual(auth, { authorized: true, basis: "free_rerun" });
  assert.equal(calls.recentRunChecks[0].userId, "u-1");
  assert.equal(calls.recentRunChecks[0].cutoff.getTime(), NOW - OPTIMIZATION_FREE_RERUN_MS);
});

test("P5: a covered trip reports trip_pass even when the free re-run would also be true (§13: the honest reason)", async () => {
  const { deps: d, calls } = deps({ passTrips: ["trip-a"], recentRun: true });
  const auth = await resolveOptimizerRunAuthorization({ userId: "u-1", tripId: "trip-a" }, d);
  assert.deepEqual(auth, { authorized: true, basis: "trip_pass" });
  assert.equal(calls.recentRunChecks.length, 0, "the pass short-circuits before the clock is read");
});

test("P6: the payment already recorded on the comparison, inside the window, authorizes and needs NO second claim", async () => {
  const { deps: d, calls } = deps();
  const auth = await resolveOptimizerRunAuthorization(
    {
      userId: "u-1",
      tripId: "trip-a",
      recordedPaymentId: "pi_recorded",
      recordedPaymentAt: new Date(NOW - 60_000),
    },
    d,
  );
  assert.deepEqual(auth, {
    authorized: true,
    basis: "paid",
    optimizationPaymentId: "pi_recorded",
    claimRequired: false,
  });
  assert.equal(calls.verifications.length, 0, "a PI verified at create is not re-verified here");
});

test("P7 (NEGATIVE): a recorded payment OUTSIDE the window authorizes nothing on its own", async () => {
  const { deps: d } = deps();
  const auth = await resolveOptimizerRunAuthorization(
    {
      userId: "u-1",
      tripId: "trip-a",
      recordedPaymentId: "pi_recorded",
      recordedPaymentAt: new Date(NOW - OPTIMIZATION_FREE_RERUN_MS - 1),
    },
    d,
  );
  assert.deepEqual(auth, { authorized: false, reason: "payment_required" });
});

test("P8: a freshly supplied PaymentIntent authorizes only after verification, and the caller must claim it", async () => {
  const { deps: d, calls } = deps();
  const auth = await resolveOptimizerRunAuthorization(
    { userId: "u-1", tripId: "trip-a", userExperienceId: "ux-1", optimizationPaymentId: "pi_new" },
    d,
  );
  assert.deepEqual(auth, {
    authorized: true,
    basis: "paid",
    optimizationPaymentId: "pi_new",
    claimRequired: true,
  });
  assert.deepEqual(calls.verifications, [
    { userId: "u-1", optimizationPaymentId: "pi_new", tripId: "trip-a", userExperienceId: "ux-1" },
  ]);
});

test("P9 (NEGATIVE): a rejected PaymentIntent carries the verifier's own status and body verbatim", async () => {
  const { deps: d } = deps({
    verify: { ok: false, status: 409, body: { error: "payment_already_used" } },
  });
  const auth = await resolveOptimizerRunAuthorization(
    { userId: "u-1", tripId: "trip-a", optimizationPaymentId: "pi_reused" },
    d,
  );
  assert.deepEqual(auth, {
    authorized: false,
    reason: "payment_rejected",
    status: 409,
    body: { error: "payment_already_used" },
  });
});

test("P10: a run with NO trip never consults the entitlement table (there is no trip to be covered)", async () => {
  const { deps: d, calls } = deps({ passTrips: ["trip-a"] });
  const auth = await resolveOptimizerRunAuthorization(
    { userId: "u-1", userExperienceId: "ux-1" },
    d,
  );
  assert.deepEqual(auth, { authorized: false, reason: "payment_required" });
  assert.deepEqual(calls.passChecks, []);
});

test("P11: an empty-string id is ABSENT, never an id — it reaches no entitlement or Stripe lookup", async () => {
  const { deps: d, calls } = deps({ passTrips: [""] });
  const auth = await resolveOptimizerRunAuthorization(
    { userId: "u-1", tripId: "   ", optimizationPaymentId: "" },
    d,
  );
  assert.deepEqual(auth, { authorized: false, reason: "payment_required" });
  assert.deepEqual(calls.passChecks, []);
  assert.deepEqual(calls.verifications, []);
});

test("P12: a pass-covered run neither verifies nor spends a supplied PaymentIntent", async () => {
  const { deps: d, calls } = deps({ passTrips: ["trip-a"] });
  const auth = await resolveOptimizerRunAuthorization(
    { userId: "u-1", tripId: "trip-a", optimizationPaymentId: "pi_new" },
    d,
  );
  assert.equal(auth.authorized, true);
  assert.deepEqual(calls.verifications, [], "a covered run must not consume a payment");
});

test("P13: the basis log fires for trip_pass ONLY — every other basis is silent", () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    logOptimizerRunBasis("trip_pass", { tripId: "trip-a", comparisonId: "cmp-1" });
    logOptimizerRunBasis("free_rerun", { tripId: "trip-a", comparisonId: "cmp-1" });
    logOptimizerRunBasis("paid", { tripId: "trip-a", comparisonId: "cmp-1" });
  } finally {
    console.log = original;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /covered_by:trip_pass/);
  assert.match(lines[0], /trip=trip-a/);
  assert.match(lines[0], /comparison=cmp-1/);
});

// ── A: the shipped call sites ────────────────────────────────────────────────────────────────────

test("A1: BOTH run gates call the shared predicate — exactly two call sites, no third copy", () => {
  const calls = routesSrc.match(/await resolveOptimizerRunAuthorization\(/g) ?? [];
  assert.equal(calls.length, 2, "create + regenerate, and nothing else");
});

test("A2: `verifyOptimizationPayment` has exactly ONE caller — the shared deps object", () => {
  // Its definition plus the single wiring line. A third occurrence would be a route re-deciding
  // authorization for itself, which is the drift class §18 rule 1 names.
  const uses = routesSrc.match(/verifyOptimizationPayment/g) ?? [];
  assert.equal(uses.length, 2, `expected definition + deps wiring, found ${uses.length}`);
  assert.match(routesSrc, /verifyPayment: verifyOptimizationPayment,/);
});

test("A3: the entitlement read is the SAME call the charge point makes, wired once", () => {
  const uses = routesSrc.match(/coversAction\(/g) ?? [];
  assert.equal(uses.length, 1, "one wiring line in the deps object");
  assert.match(routesSrc, /tripPassCoversRun: \(tripId\) => coversAction\(tripId, "optimizer_run"\)/);
  // The charge endpoint is UNTOUCHED by this lane — it still short-circuits with coveredByTripPass.
  assert.match(optimizationRoutesSrc, /coversAction\(String\(tripId\), "optimizer_run"\)/);
  assert.match(optimizationRoutesSrc, /coveredByTripPass: true/);
});

test("A4 (§15): the regenerate PaymentIntent claim is still the atomic conditional, and it stays at the route", () => {
  assert.match(
    routesSrc,
    /\.set\(\{ optimizationPaymentId: runAuth\.optimizationPaymentId \}\)\s*\n\s*\.where\(and\(eq\(itineraryComparisons\.id, comparisonId\), isNull\(itineraryComparisons\.optimizationPaymentId\)\)\)/,
  );
  assert.match(routesSrc, /payment_already_recorded/);
  // The predicate decides; it never writes. It imports NOTHING — no db, no storage, no Stripe —
  // which is both why it can be proven here without a database and why it cannot write a row.
  const imports = predicateSrc.match(/^\s*import .*$/gm) ?? [];
  assert.deepEqual(imports, [], `the predicate must stay dependency-free, found: ${imports.join(" | ")}`);
});

test("A5: the run gate no longer carries its own copy of the free-re-run clock", () => {
  assert.doesNotMatch(routesSrc, /const OPTIMIZATION_FREE_RERUN_MS/);
  const declarations = predicateSrc.match(/const OPTIMIZATION_FREE_RERUN_MS/g) ?? [];
  assert.equal(declarations.length, 1);
});

test("A6: a refused run still refuses — create is born pending_payment, regenerate answers 402", () => {
  assert.match(routesSrc, /status: canRunOptimizer \? "generating" : "pending_payment"/);
  assert.match(
    routesSrc,
    /return res\.status\(402\)\.json\(\{\s*\n\s*error: "payment_required",/,
  );
});

test("A7 (§13): the basis is never faked into the payment-identity column", () => {
  // `optimization_payment_id` is a Stripe PaymentIntent id (§19a). A sentinel like "trip_pass"
  // written there would be a fabricated payment identity AND would poison the reuse lookup that
  // reads it, so the basis is reported and logged instead — never stored as a payment.
  assert.doesNotMatch(routesSrc, /optimizationPaymentId: ["']trip_pass["']/);
  assert.match(routesSrc, /runBasis/);
});
