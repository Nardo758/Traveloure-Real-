/**
 * FB-1 step 4 (ledger `2026-10-19-fb1-fixed-by-tap`; decision-maker, Oct 19, 2026): the checker only flags. No code
 * path adopts a version's day without a traveler's request — `applyDays` and the tap's `applyDaysUnchangedSinceRun`
 * are called from the authenticated, write-gated apply-days route and nowhere else (the tap's own service calls
 * `applyDays` once, inside itself). A job, scheduler, run or read that started calling either would fail here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === "node_modules" || name === "__tests__") continue;
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const CALL = /\b(applyDays|applyDaysUnchangedSinceRun)\s*\(/g;

test("AC1 applyDays and the tap are called only from the apply-days route (and the tap from inside itself)", () => {
  const calls: string[] = [];
  for (const f of [...tsFiles(path.join(repo, "server")), ...tsFiles(path.join(repo, "shared"))]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(CALL)) {
      const line = src.slice(0, m.index).split("\n").length;
      const text = src.split("\n")[line - 1];
      if (/^\s*(export\s+)?async\s+function\s/.test(text)) continue; // the definitions
      calls.push(`${path.relative(repo, f)}:${m[1]}`);
    }
  }
  assert.deepEqual(calls.sort(), [
    "server/routes/versions.routes.ts:applyDays",
    "server/routes/versions.routes.ts:applyDaysUnchangedSinceRun",
    "server/services/fixed-plan.service.ts:applyDays",
  ]);
});

test("AC2 the route calls them inside the authenticated, write-gated apply-days handler", () => {
  const src = readFileSync(path.join(repo, "server/routes/versions.routes.ts"), "utf8");
  const start = src.indexOf('router.post("/api/trips/:tripId/versions/apply-days", isAuthenticated,');
  assert.ok(start >= 0, "the route is authenticated");
  const end = src.indexOf("router.", start + 10);
  const handler = src.slice(start, end);
  assert.match(handler, /await gate\(req, res, true\)/, "behind the write gate");
  assert.match(handler, /applyDaysUnchangedSinceRun\(/);
  assert.match(handler, /applyDays\(/);
  const outside = src.slice(0, start) + src.slice(end);
  assert.doesNotMatch(outside, /\bapplyDays(UnchangedSinceRun)?\s*\(/, "no other handler in the file calls them");
});

test("AC3 the tap's service calls applyDays only inside applyDaysUnchangedSinceRun", () => {
  const src = readFileSync(path.join(repo, "server/services/fixed-plan.service.ts"), "utf8");
  const start = src.indexOf("export async function applyDaysUnchangedSinceRun(");
  assert.ok(start >= 0);
  const before = src.slice(0, start);
  assert.doesNotMatch(before.replace(/import[^;]+;/g, "").replace(/\/\*[\s\S]*?\*\//g, ""), /\bapplyDays\s*\(/);
});
