/**
 * Every field a client form submits is ADMITTED by its route or EXPLICITLY REJECTED
 * (ledger `2026-09-27-form-fields-admitted`). Precedents: `2026-09-26-occasion-read-only` (a
 * field sent on a rail that must not take it) and `2026-09-27-property-cancel-tier` (a tier and
 * five stay terms the create route's plain z.object stripped without a word).
 *
 * Part 1 proves the predicate on committed fixtures (§18d) — it runs first, so a scanner that
 * cannot see the class cannot report the repo green. Part 2 runs it over the real client and the
 * real mounted route graph and requires ZERO findings. The unchecked and unmatched counts are
 * PRINTED on every run — the scanner's stated negative space, never a silent pass (see scan.ts).
 *
 * Run: npx tsx --test scripts/form-field-allowlist/scan.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadProgram, scan } from "./scan";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const FIX = path.join(HERE, "fixtures");
const ROOT = path.resolve(HERE, "../..");

test("self-test: the predicate decides each fixture case", () => {
  const files = [path.join(FIX, "server/routes.ts"), path.join(FIX, "client/src/forms.ts")];
  const r = scan(loadProgram(FIX, files), FIX, { entry: "server/routes.ts", clientDirs: ["client/src"] });
  const found = r.findings.map((f) => `${f.call.url} [${f.missing.join(",")}]`).sort();
  assert.deepEqual(found, ["/api/alias-missing [y]", "/api/strips [y]"], "F1 and F8 are the only findings");
  const unchecked = r.unchecked.map((u) => u.call.url).sort();
  assert.deepEqual(unchecked, ["/api/spread", "/api/strips"], "F4 (open route) and F9 (any body) are counted unchecked");
  assert.deepEqual(r.unmatched.map((c) => c.url), ["/api/nowhere"], "F10 matches no route");
  assert.equal(r.checked, 7, "F1–F3 and F5–F8 are checked");
});

test("repo: every form field is admitted or explicitly rejected by its route", () => {
  const r = scan(loadProgram(ROOT), ROOT);
  const reasons = new Map<string, number>();
  for (const u of r.unchecked) {
    const k = u.reason.replace(/^route .* is open: /, "route open: ").replace(/`.*$/, "").trim();
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }
  console.log(`[form-fields] routes=${r.routes.length} checked=${r.checked} unchecked=${r.unchecked.length} unmatched=${r.unmatched.length}`);
  for (const [k, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`[form-fields]   unchecked ${n} × ${k}`);
  for (const c of r.unmatched) console.log(`[form-fields]   unmatched ${c.source}:${c.line} ${c.method} ${c.url?.replace(/\u0000/g, "${…}")}`);
  // A scanner that checks nothing is green by construction; this floor is ~90% of today's count.
  assert.ok(r.checked >= 240, `expected the scanner to check a real set of form calls, got ${r.checked}`);
  const lines = r.findings.map((f) => `${f.call.source}:${f.call.line} ${f.call.method} ${f.call.url?.replace(/\u0000/g, "${…}")} sends [${f.missing.join(", ")}] that ${f.route} neither admits nor rejects`);
  assert.deepEqual(lines, [], `form fields silently dropped by their route:\n  ${lines.join("\n  ")}`);
  assert.ok(fs.existsSync(path.join(ROOT, "server/routes.ts")));
});
