#!/usr/bin/env node
/**
 * check-unlimited-runs.cjs — traveler-facing copy never calls optimizer runs "unlimited"
 * (ledger `2026-10-08-trip-pass-five-runs`; decision-maker, Oct 8, 2026 — B2).
 *
 * A Trip Pass covers a CAPPED number of full Optimize runs on its trip (R-ac,
 * `TRIP_PASS_RUNS_PER_TRIP`, default 5); AI tasks are what stays unlimited. So a CLIENT STRING or a
 * LOCALE VALUE fails when "unlimited" is FOLLOWED, within 20 characters, by "run" ("Unlimited AI runs",
 * "unlimited optimizer runs", "Trip Pass for unlimited runs"). The order is the point: the correct
 * line "5 optimizer runs + unlimited AI tasks" has "run" BEFORE "unlimited" and passes.
 *
 *   node scripts/check-unlimited-runs.cjs             — scan client/src (*.ts, *.tsx) and client/src/locales/**.json
 *   node scripts/check-unlimited-runs.cjs --self-test — committed fixtures (§18d)
 *
 * WHAT IS A "CLIENT STRING": a string literal, a template literal's text, or JSX text, read through the
 * TypeScript parser — COMMENTS, identifiers and import paths are never read (comments are corrected by
 * hand). A no-whitespace identifier-shaped literal is a code value, not copy.
 *
 * STATED NEGATIVE SPACE (§18d): it cannot see copy assembled at runtime from parts that are each clean
 * ("Unlimited" + `${noun}`), server or database copy, `shared/`, emails and PDFs, test files, or a claim
 * worded without "unlimited" ("as many runs as you like"). It checks the ORDER unlimited→run only.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const ROOT = path.join(REPO, "client", "src");
/** "unlimited", then within 20 characters, "run" (runs, run's, …). */
const UNLIMITED_RUNS = /\bunlimited\b[\s\S]{0,20}?\brun/i;

const CODE_VALUE = /^[A-Za-z0-9_\-\/.:@?=&#*${}]+$/;
const isCodeValue = (s) => !/\s/.test(s) && CODE_VALUE.test(s) && !/^[A-Z]/.test(s);

/** Pure. Offending copy strings in one TS/TSX source text. */
function sourceHits(text, fileName) {
  const ts = require("typescript");
  const tsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const visit = (n) => {
    let s = null;
    let literal = false;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      s = n.text;
      literal = true;
      if (n.parent && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent))) s = null;
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      s = n.text;
      literal = true;
    } else if (ts.isJsxText(n)) s = n.text;
    if (s != null) {
      const t = s.trim();
      if (UNLIMITED_RUNS.test(t) && !(literal && isCodeValue(t))) {
        hits.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: t });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/** Pure. Offending VALUES in one locale JSON text. */
function localeHits(text) {
  const hits = [];
  const rec = (o, key) => {
    if (typeof o === "string") {
      if (UNLIMITED_RUNS.test(o)) hits.push({ key, text: o });
    } else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) rec(v, key ? `${key}.${k}` : k);
  };
  rec(JSON.parse(text), "");
  return hits;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

function selfTest() {
  const cases = [
    ["the pricing line is caught", `const a = ["Unlimited AI runs & tasks on that trip"];`, 1],
    ["the card line is caught", `const x = <span> · unlimited optimizer runs + AI tasks</span>;`, 1],
    ["the meta description is caught", `const d = "get a Trip Pass for unlimited runs, or hand it to a local expert.";`, 1],
    ["template text", "const a = `${name}: unlimited re-runs`;", 1],
    ["the ruled copy passes: run BEFORE unlimited", `const a = "5 optimizer runs + unlimited AI tasks on that trip";`, 0],
    ["unlimited without a run nearby passes", `const a = "Unlimited exports";`, 0],
    ["a run more than 20 characters later passes", `const a = "Unlimited exports for every plan you make, and runs";`, 0],
    ["comments are not read", `// unlimited optimizer runs\nconst a = 1;`, 0],
    ["code values are not copy", `if (k === "unlimited-runs") f();`, 0],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = sourceHits(src, "fixture.tsx").length;
    if (got !== want) { failed++; console.error(`SELF-TEST FAIL: ${name} — expected ${want}, got ${got}`); }
  }
  const loc = localeHits(JSON.stringify({ a: { b: "Unlimited runs" }, c: "5 runs + unlimited AI tasks" }));
  if (loc.length !== 1 || loc[0].key !== "a.b") { failed++; console.error(`SELF-TEST FAIL: locale values — got ${JSON.stringify(loc)}`); }
  if (failed) { console.error(`unlimited-runs self-test: ${failed} failure(s)`); process.exit(1); }
  console.log(`unlimited-runs self-test: OK (${cases.length + 1} fixtures)`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = walk(ROOT, []);
  const out = [];
  for (const f of files) {
    const rel = path.relative(REPO, f);
    if (/\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f)) {
      for (const h of sourceHits(fs.readFileSync(f, "utf8"), f)) out.push(`${rel}:${h.line} ${JSON.stringify(h.text.slice(0, 120))}`);
    } else if (f.endsWith(".json") && rel.includes(`${path.sep}locales${path.sep}`)) {
      for (const h of localeHits(fs.readFileSync(f, "utf8"))) out.push(`${rel} [${h.key}] ${JSON.stringify(h.text.slice(0, 120))}`);
    }
  }
  if (out.length) {
    console.error(`unlimited-runs: ${out.length} string(s) call optimizer runs "unlimited" — a Trip Pass covers a capped number of runs (ledger 2026-10-08-trip-pass-five-runs):`);
    for (const l of out) console.error(`  ${l}`);
    process.exit(1);
  }
  console.log(`unlimited-runs: OK — ${files.length} files under client/src, no "unlimited … run" in client copy or locale values.`);
}

if (require.main === module) main();
module.exports = { sourceHits, localeHits };
