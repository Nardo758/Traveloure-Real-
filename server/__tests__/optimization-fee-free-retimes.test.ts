/**
 * Row 266 PR 1 — GET /api/optimization-fee carries freeRetimesPerVersion from
 * optimizerFreeRetimes(), and OptimizationFeeQuote names the same nullable field.
 *
 * No database, no network, no git. The default inside optimizerFreeRetimes is
 * deliberately not asserted here, and this file never expects that default of the route.
 *
 *   npx tsx --test server/__tests__/optimization-fee-free-retimes.test.ts
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimizerFreeRetimes } from "../config/optimizer-retimes.config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV_KEY = "OPTIMIZER_FREE_RETIMES";
const saved = process.env[ENV_KEY];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

afterEach(() => {
  if (saved === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = saved;
});

test("F1 the fee handler returns freeRetimesPerVersion from optimizerFreeRetimes", () => {
  const src = read("server/routes/optimization.routes.ts");
  const marker = 'router.get("/api/optimization-fee"';
  const start = src.indexOf(marker);
  assert.ok(start >= 0, "GET /api/optimization-fee exists");
  const next = src.indexOf("router.", start + marker.length);
  assert.ok(next > start, "the handler ends at the next router.");
  const handler = src.slice(start, next);
  assert.ok(
    handler.includes("freeRetimesPerVersion: optimizerFreeRetimes()"),
    "the quote property is the function call, inside this handler",
  );
  assert.ok(
    src.includes('from "../config/optimizer-retimes.config"'),
    "the route imports optimizerFreeRetimes from the one config module",
  );
});

test("F2 OptimizationFeeQuote declares the nullable field", () => {
  const src = read("client/src/lib/optimization-preview.ts");
  const marker = "export interface OptimizationFeeQuote";
  const start = src.indexOf(marker);
  assert.ok(start >= 0, "OptimizationFeeQuote exists");
  const open = src.indexOf("{", start);
  assert.ok(open > start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end > open, "the interface has a closing brace");
  const block = src.slice(start, end + 1);
  assert.match(block, /freeRetimesPerVersion\?:\s*number\s*\|\s*null/);
});

test("F3 the value follows optimizerFreeRetimes", () => {
  process.env[ENV_KEY] = "5";
  assert.equal(optimizerFreeRetimes(), 5);
  process.env[ENV_KEY] = "0";
  assert.equal(optimizerFreeRetimes(), 0);
});

test("F4 no client file reads the optimizer retime env", () => {
  const files = [
    "client/src/lib/optimization-preview.ts",
    "client/src/components/plan/OptimizerLead.tsx",
    "client/src/pages/cart.tsx",
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.equal(src.includes("process.env"), false, rel);
    assert.equal(src.includes("OPTIMIZER_FREE_RETIMES"), false, rel);
    assert.equal(src.includes("import.meta.env.VITE_OPTIMIZER"), false, rel);
  }
});

test("F5 the versions board still reads optimizerFreeRetimes for its limit", () => {
  const src = read("server/services/version-board.service.ts");
  const needle = "const limit = optimizerFreeRetimes();";
  const hits = src.split(needle).length - 1;
  assert.ok(hits >= 2, `the board reads the same function at least twice (saw ${hits})`);
});
