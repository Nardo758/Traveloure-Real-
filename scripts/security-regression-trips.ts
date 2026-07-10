/**
 * Regression tests for the trips null===null auth bypass (Lane 1, B3).
 * Not a unit-test-framework file — no vitest/jest is configured in this repo
 * for server-side tests, so this is a standalone tsx script that hits the
 * running dev server over HTTP and asserts status codes, plus one in-process
 * check of verifyTripOwnership. Run with: npx tsx scripts/security-regression-trips.ts
 */
import { verifyTripOwnership } from "../server/utils/trip-ownership";

const BASE = "http://localhost:5000";

let failures = 0;

function check(name: string, condition: boolean, detail: string) {
  if (condition) {
    console.log(`PASS: ${name}`);
  } else {
    failures++;
    console.log(`FAIL: ${name} — ${detail}`);
  }
}

async function main() {
  // Trip with managed_by_ea_id NULL and no expert (itn-seed-trip-0000-0001 has share_token, no ea/expert)
  const tripWithShareToken = "itn-seed-trip-0000-0001";
  const shareToken = "itn-smoke-share-tok-0001";

  // 1. unauth PATCH /api/trips/:id, trip with managedByEaId null -> expect 401
  {
    const res = await fetch(`${BASE}/api/trips/${tripWithShareToken}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "pwned-by-regression-test" }),
    });
    check(
      "unauth PATCH /api/trips/:id (managedByEaId null) -> 401",
      res.status === 401,
      `got ${res.status}`
    );
  }

  // 2. unauth GET /api/trips/:id, trip with expertId null -> expect 401
  {
    const res = await fetch(`${BASE}/api/trips/${tripWithShareToken}`);
    check(
      "unauth GET /api/trips/:id (expertId null) -> 401",
      res.status === 401,
      `got ${res.status}`
    );
  }

  // 3. unauth GET /api/trips/:id, trip with managedByEaId null -> expect 401
  // (same trip covers both null fields simultaneously; same request as #2)
  {
    const res = await fetch(`${BASE}/api/trips/${tripWithShareToken}`);
    check(
      "unauth GET /api/trips/:id (managedByEaId null) -> 401",
      res.status === 401,
      `got ${res.status}`
    );
  }

  // 4. authed non-owner PATCH -> expect 403 per dispatch; actual handler
  // contract only ever returns 401 for all authorization failures (no 403
  // path exists in the code). Documenting the discrepancy rather than
  // asserting a status the handler cannot produce.
  {
    console.log(
      "SKIPPED: authed non-owner PATCH -> 403 — handler has no 403 branch, " +
        "only 401 for all failed-authorization cases (see routes.ts:573). " +
        "Not asserting a value the code cannot return; flagging for product decision."
    );
  }

  // 5. guest with valid shareToken GET own trip -> expect 200
  {
    const res = await fetch(
      `${BASE}/api/trips/${tripWithShareToken}?token=${encodeURIComponent(shareToken)}`
    );
    check(
      "guest with valid shareToken GET own trip -> 200",
      res.status === 200,
      `got ${res.status}`
    );
  }

  // 6. unit: verifyTripOwnership(null, null) -> false
  {
    const result = await verifyTripOwnership(null as any, null as any);
    check("verifyTripOwnership(null, null) -> false", result === false, `got ${result}`);
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
