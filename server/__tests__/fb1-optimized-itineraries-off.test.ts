/**
 * FB-1 step 0 (ledger `2026-10-17-fb1-optimized-itineraries-off`): POST /api/ai/generate-optimized-itineraries
 * is switched off behind a flag.
 *   O1  unset, empty or any value other than "1" ⇒ 410 with the retired body; "1" ⇒ the route runs
 *   O2  the gate is the handler's FIRST statement, before the body is read or a model is called
 *   O3  the handler is kept (no deletion), and no client file under client/src calls the endpoint
 *
 * Run: npx tsx --test server/__tests__/fb1-optimized-itineraries-off.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  OPTIMIZED_ITINERARIES_ENABLED_ENV,
  OPTIMIZED_ITINERARIES_RETIRED_BODY,
  optimizedItinerariesGate,
} from "../config/optimized-itineraries.config";

test("O1 off unless the flag is exactly 1", () => {
  for (const env of [{}, { [OPTIMIZED_ITINERARIES_ENABLED_ENV]: "" }, { [OPTIMIZED_ITINERARIES_ENABLED_ENV]: "0" }, { [OPTIMIZED_ITINERARIES_ENABLED_ENV]: "true" }]) {
    assert.deepEqual(optimizedItinerariesGate(env), { status: 410, body: OPTIMIZED_ITINERARIES_RETIRED_BODY });
  }
  assert.equal(optimizedItinerariesGate({ [OPTIMIZED_ITINERARIES_ENABLED_ENV]: "1" }), null);
  assert.equal(optimizedItinerariesGate({ [OPTIMIZED_ITINERARIES_ENABLED_ENV]: " 1 " }), null);
  assert.equal(OPTIMIZED_ITINERARIES_RETIRED_BODY.code, "endpoint_retired");
});

test("O2 the gate runs before anything else in the handler", () => {
  const src = readFileSync("server/routes/content.routes.ts", "utf8");
  const start = src.indexOf('router.post("/api/ai/generate-optimized-itineraries"');
  assert.ok(start > 0, "the handler is still registered");
  const head = src.slice(start, start + 600);
  const gate = head.indexOf("optimizedItinerariesGate()");
  const ret = head.indexOf("if (retired) return res.status(retired.status).json(retired.body);");
  assert.ok(gate > 0 && ret > gate, "the gate and its early return");
  for (const later of ["req.body", "getUserId(req)", "tripOptimizationService", "insertAiGeneratedItinerary"]) {
    const at = head.indexOf(later);
    assert.ok(at === -1 || at > ret, `${later} comes after the gate`);
  }
});

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__") files(p, out); }
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

test("O3 kept on the server; no client caller", () => {
  assert.match(readFileSync("server/routes/content.routes.ts", "utf8"), /tripOptimizationService\.generateOptimizedItineraries\(/);
  const callers = files("client/src").filter((f) => readFileSync(f, "utf8").includes("/api/ai/generate-optimized-itineraries"));
  assert.deepEqual(callers, []);
});
