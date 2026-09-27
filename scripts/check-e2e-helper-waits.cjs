#!/usr/bin/env node
/**
 * check-e2e-helper-waits.cjs — an e2e helper returns only after it has CONFIRMED the effect it was
 * called for (ledger `2026-09-27-e2e-helpers-confirm-effect`).
 *
 * Three silent helpers in one weekend — a fixed wait (R159's approval queue), a fixed count
 * (`enterWizardFromListingHome`), an unverified submit (`loginViaUi`, `2026-09-27-s1-login-must-land`)
 * — each made a slow runner read as a product failure two steps later. The rule: a helper returns
 * only after a response is received, an element is present, a state is set or a session is valid;
 * a helper that returns on a timer is a DEFECT, not a style choice.
 *
 * What this gate checks, in every e2e HELPER module (every `.ts` under `e2e/` that is not a
 * `*.spec.ts`):
 *   - every `waitForTimeout(` carries `settle-ok: <reason>` on the same line or the line above —
 *     a fixed wait is a stated decision (a polling loop, a step transition the next pass confirms),
 *     never a way to return;
 *   - every one-shot `.count()` carries `count-ok: <reason>` the same way — "how many are there"
 *     is only an answer after the list is known to have rendered.
 * Every annotation is PRINTED on every run (ruling 32 / §18d: an exemption is never a silent
 * baseline).
 *
 * STATED NEGATIVE SPACE (§18d): this is a TEXT gate. It cannot tell that an action's effect was
 * confirmed — only that no helper waits or counts without saying why. It does not scan spec
 * bodies (`*.spec.ts`), whose waits are the test's own pacing; it does not police
 * `.catch(() => {})` on actions or `isVisible()` (which does not wait); and an annotation whose
 * reason is false passes. `actAndAwait` / `appears` in `e2e/supply-demand/lib/ui.ts` are the
 * primitives that make the rule easy to follow; this gate only stops it being skipped silently.
 *
 * `--self-test` runs committed inline fixtures and exits nonzero if the predicate stops catching an
 * unannotated wait or count, or starts flagging an annotated one.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const E2E_DIR = path.join(REPO, "e2e");
const WAIT_RE = /\bwaitForTimeout\s*\(/;
const COUNT_RE = /\.count\s*\(\s*\)/;
const WAIT_OK = /settle-ok:\s*\S/;
const COUNT_OK = /count-ok:\s*\S/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/** One file's text → { violations[], exemptions[] }. */
function scanText(rel, text) {
  const lines = text.split("\n");
  const violations = [];
  const exemptions = [];
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    const prev = i > 0 ? lines[i - 1] : "";
    for (const [re, ok, kind] of [
      [WAIT_RE, WAIT_OK, "waitForTimeout"],
      [COUNT_RE, COUNT_OK, ".count()"],
    ]) {
      if (!re.test(line)) continue;
      const note = ok.test(line) ? line : ok.test(prev) ? prev : null;
      if (note) {
        exemptions.push(`${rel}:${i + 1} [${kind}] ${note.slice(note.search(ok)).trim()}`);
      } else {
        violations.push(`${rel}:${i + 1} [${kind}] ${line.trim()}`);
      }
    }
  });
  return { violations, exemptions };
}

function selfTest() {
  const cases = [
    ["unannotated fixed wait FAILS", "await page.waitForTimeout(500);\nreturn true;", 1],
    ["annotated wait on the same line passes", "await page.waitForTimeout(300); // settle-ok: polling aria-pressed", 0],
    ["annotation on the line above passes", "// settle-ok: step transition, next pass confirms\nawait page.waitForTimeout(400);", 0],
    ["an empty settle-ok reason does not count", "await page.waitForTimeout(400); // settle-ok:", 1],
    ["unannotated one-shot count FAILS", "if ((await card.count()) === 0) return false;", 1],
    ["annotated count passes", "const n = await rows.count(); // count-ok: the list rendered above", 0],
    ["a mention inside a comment is not a call", "// never use waitForTimeout(500) or .count() to decide\n * waitForTimeout(1) in a doc comment", 0],
    ["both in one line need both notes", "await page.waitForTimeout(1); const n = await x.count(); // settle-ok: pacing", 1],
  ];
  let failed = 0;
  for (const [name, text, want] of cases) {
    const got = scanText("fixture.ts", text).violations.length;
    const ok = got === want;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : ` (want ${want} violation(s), got ${got})`}`);
  }
  console.log(`\ne2e-helper-waits guard self-test: ${cases.length - failed}/${cases.length} fixture cases pass.`);
  process.exit(failed ? 1 : 0);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = walk(E2E_DIR, []);
  const violations = [];
  const exemptions = [];
  for (const f of files) {
    const r = scanText(path.relative(REPO, f), fs.readFileSync(f, "utf8"));
    violations.push(...r.violations);
    exemptions.push(...r.exemptions);
  }
  if (exemptions.length) {
    console.log("ANNOTATED WAITS AND COUNTS (printed on every run — a stated decision, never a silent baseline):");
    for (const e of exemptions) console.log(`  • ${e}`);
    console.log("");
  }
  if (violations.length) {
    console.error("❌ e2e helper acts or decides on a timer / one-shot count without saying why:");
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      "\nA helper returns only after CONFIRMING its effect (ledger 2026-09-27-e2e-helpers-confirm-effect): use actAndAwait()/appears() from e2e/supply-demand/lib/ui.ts, or add `settle-ok: <why this is not a confirmation>` / `count-ok: <why the list has rendered>`.",
    );
    process.exit(1);
  }
  console.log(`e2e-helper-waits guard: OK — ${files.length} helper module(s) scanned, ${exemptions.length} annotated wait(s)/count(s).`);
}

main();
