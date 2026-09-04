/**
 * test-seed-endpoint-gate.test.ts — audit finding 11 (ledger `2026-09-03-security-9-11-13`).
 *
 * `POST /api/transport-booking-options/seed/test-variant` called itself "CI/test-only" and was
 * mounted and live on the production boot behind `isAuthenticated` alone: any account could insert
 * unbounded junk rows into the traveler-facing `transport_booking_options` table, and nothing in
 * the repo could clean them up. It is not deletable under §18c because it HAS a consumer
 * (`e2e/specs/journey-6.spec.ts`), so it is gated instead.
 *
 *   S1 — a real production boot refuses (503) and `next` is never called, so no row can be written.
 *   S2 — the belt-and-suspenders production signal (ENVIRONMENT=PROD) refuses too.
 *   S3 — the CI/e2e shape (production BUNDLE + ALLOW_TEST_ACCOUNTS=1) is allowed, and so is dev.
 *        This is the whole reason the predicate is not a bare `NODE_ENV !== "production"`.
 *   S4 — the gate is the SHARED `isProdStrictEnv`, not a second copy of production-detection.
 *   S5 — the route registration carries the gate, and it runs BEFORE the session guard.
 *   S6 — the sibling `/seed/:variantId` is deliberately NOT env-gated (it is a real capability
 *        authorized by the owning trip); this pins the difference so a future sweep does not
 *        "tidy" one into the other.
 *
 * STATED NEGATIVE SPACE (§18d): this proves the ENV gate. It says nothing about authorization —
 * environment is not an authorization boundary, and the endpoint keeps its session guard. It also
 * knows only about this one endpoint: another test-only endpoint added elsewhere is invisible to it.
 *
 * Run: npx tsx --test server/__tests__/test-seed-endpoint-gate.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { isTestSeedEnabled, requireTestSeedEnabled } from "../middleware/test-only-endpoint";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const TRANSPORT_HUB = path.join(ROOT, "server", "routes", "transport-hub.routes.ts");

/** Minimal express double: records the status/body written and whether `next` ran. */
function runGate(env: Record<string, string | undefined>) {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    ENVIRONMENT: process.env.ENVIRONMENT,
    ALLOW_TEST_ACCOUNTS: process.env.ALLOW_TEST_ACCOUNTS,
  };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete (process.env as any)[k];
    else (process.env as any)[k] = v;
  }
  let status: number | null = null;
  let body: any = null;
  let nexted = false;
  const res: any = {
    status(code: number) {
      status = code;
      return res;
    },
    json(payload: any) {
      body = payload;
      return res;
    },
  };
  try {
    requireTestSeedEnabled({} as any, res, () => {
      nexted = true;
    });
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete (process.env as any)[k];
      else (process.env as any)[k] = v;
    }
  }
  return { status, body, nexted };
}

test("S1: a production boot refuses with 503 and never reaches the handler", () => {
  const r = runGate({ NODE_ENV: "production", ENVIRONMENT: undefined, ALLOW_TEST_ACCOUNTS: undefined });
  assert.equal(r.status, 503, "production must refuse the test-seed endpoint");
  assert.equal(r.nexted, false, "next() must not run — the insert must be unreachable, not merely discouraged");
  assert.match(String(r.body?.error ?? ""), /disabled in production/i);
});

test("S2: ENVIRONMENT=PROD refuses too (the belt-and-suspenders production signal)", () => {
  const r = runGate({ NODE_ENV: "development", ENVIRONMENT: "PROD", ALLOW_TEST_ACCOUNTS: undefined });
  assert.equal(r.status, 503);
  assert.equal(r.nexted, false);
});

test("S3: the CI/e2e boot (production bundle + ALLOW_TEST_ACCOUNTS=1) and dev are allowed", () => {
  const ci = runGate({ NODE_ENV: "production", ENVIRONMENT: undefined, ALLOW_TEST_ACCOUNTS: "1" });
  assert.equal(ci.nexted, true, "the CI boot is exactly what this endpoint exists for");
  assert.equal(ci.status, null);

  const prodEnvWithHatch = runGate({ NODE_ENV: "development", ENVIRONMENT: "PROD", ALLOW_TEST_ACCOUNTS: "1" });
  assert.equal(prodEnvWithHatch.nexted, true);

  const dev = runGate({ NODE_ENV: "development", ENVIRONMENT: undefined, ALLOW_TEST_ACCOUNTS: undefined });
  assert.equal(dev.nexted, true);
});

test("S4: the predicate delegates to the shared isProdStrictEnv — one implementation", () => {
  const middleware = fs.readFileSync(
    path.join(ROOT, "server", "middleware", "test-only-endpoint.ts"),
    "utf8",
  );
  assert.match(
    middleware,
    /import\s*\{\s*isProdStrictEnv\s*\}\s*from\s*["']\.\.\/utils\/stripe-key-policy["']/,
    "production detection must come from the single shared predicate, never a local copy",
  );
  assert.equal(
    /NODE_ENV\s*[!=]==?\s*["']production["']/.test(middleware.replace(/\/\*[\s\S]*?\*\//g, "")),
    false,
    "a hand-rolled NODE_ENV check in the gate body would be the second implementation §18 rule 1 forbids",
  );
  // The pure predicate answers each combination directly, independent of the express wrapper.
  assert.equal(isTestSeedEnabled({ NODE_ENV: "production" } as any), false);
  assert.equal(isTestSeedEnabled({ NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1" } as any), true);
  assert.equal(isTestSeedEnabled({ ENVIRONMENT: "PROD" } as any), false);
  assert.equal(isTestSeedEnabled({} as any), true);
});

test("S5: the seed/test-variant registration carries the gate, ahead of the session guard", () => {
  const source = fs.readFileSync(TRANSPORT_HUB, "utf8");
  const line = source
    .split("\n")
    .find((l) => l.includes('router.post("/api/transport-booking-options/seed/test-variant"'));
  assert.ok(line, "the test-variant seed route is no longer registered — move this pin with it");
  assert.match(line!, /requireTestSeedEnabled/, "audit finding 11 regrown: the seed endpoint lost its production gate");
  assert.ok(
    line!.indexOf("requireTestSeedEnabled") < line!.indexOf("isAuthenticated"),
    "the env gate must run before the session guard, so a production refusal costs no session lookup",
  );
});

test("S6: the sibling /seed/:variantId stays authorization-gated, NOT env-gated", () => {
  const source = fs.readFileSync(TRANSPORT_HUB, "utf8");
  const line = source
    .split("\n")
    .find((l) => l.includes('router.post("/api/transport-booking-options/seed/:variantId"'));
  assert.ok(line, "the per-variant seed route is no longer registered");
  assert.equal(
    /requireTestSeedEnabled/.test(line!),
    false,
    "the per-variant seed route is a real capability authorized by the owning trip — env is the wrong boundary there",
  );
  assert.match(source, /authorizeTransportScope\(/, "the per-variant seed route must keep its trip authorization");
});
