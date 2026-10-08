#!/usr/bin/env node
/**
 * check-us-spelling.cjs — client copy is US English (ledger `2026-10-08-us-spelling-guard`;
 * decision-maker, Oct 8, 2026).
 *
 * Fails on a British spelling in a CLIENT STRING or a LOCALE VALUE:
 *   neighbourhood · travelling · licence · colour · organis(e/ation/er…) · favourite · centre ·
 *   cancelled · catalogue
 * matched case-insensitively from a word boundary, so suffixed forms ("neighbourhoods", "colours",
 * "centred") are caught too. A proper noun that must keep its own spelling is allowlisted by its
 * EXACT string in `ALLOWED_STRINGS` below — never by a word, a file or a pattern.
 *
 *   node scripts/check-us-spelling.cjs             — scan client/src (*.ts, *.tsx) and client/src/locales/**.json
 *   node scripts/check-us-spelling.cjs --self-test — committed fixtures (§18d)
 *
 * WHAT IS A "CLIENT STRING": a string literal, a template literal's text, or JSX text, read through the
 * TypeScript parser — so COMMENTS, identifiers and import paths are never read. A string literal with
 * no whitespace that is entirely an identifier shape (`"cancelled"`, `"neighbourhoodIds"`,
 * `"input-nugget-neighbourhood"`, or a template part such as the testid prefix in
 * `badge-neighbourhood-${id}`) is a CODE VALUE — a status, a field name, a testid — and is not
 * copy; a data value the server stores cannot be respelled from the client. Locale files: every
 * string VALUE is read; keys are identifiers and are not.
 *
 * STATED NEGATIVE SPACE (§18d): it cannot see copy assembled at runtime from parts that are each
 * clean, copy that arrives from the server or the database, server-side strings (emails, PDFs), test
 * files (`__tests__` is skipped), or a single lowercase British word used as display copy in a string
 * literal (it reads as a code value). A word outside the nine above (e.g. "traveller") is not checked.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const ROOT = path.join(REPO, "client", "src");
const BRITISH = /\b(neighbourhood|travelling|licence|colour|organis|favourite|centre|cancelled|catalogue)/i;
/** Proper nouns that keep their spelling, by EXACT string. Empty today. */
const ALLOWED_STRINGS = new Set([]);

const CODE_VALUE = /^[A-Za-z0-9_\-\/.:@?=&#*${}]+$/;
const isCodeValue = (s) => !/\s/.test(s) && CODE_VALUE.test(s) && !/^[A-Z]/.test(s);

/** Pure. British-spelled copy strings in one TS/TSX source text. */
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
    }
    else if (ts.isJsxText(n)) s = n.text;
    if (s != null) {
      const t = s.trim();
      // A template part is judged untrimmed: " neighbourhoods" (after a `${n}`) is copy, while
      // "badge-neighbourhood-" (a testid prefix) is a code value.
      const codeValue = literal && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? isCodeValue(t) : isCodeValue(s));
      if (BRITISH.test(t) && !ALLOWED_STRINGS.has(t) && !codeValue) {
        hits.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: t });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/** Pure. British-spelled VALUES in one locale JSON text. */
function localeHits(text) {
  const hits = [];
  const rec = (o, key) => {
    if (typeof o === "string") {
      if (BRITISH.test(o) && !ALLOWED_STRINGS.has(o.trim())) hits.push({ key, text: o });
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
    ["copy is caught", `const a = "Jump to neighbourhood";`, 1],
    ["suffixed and capitalised forms", `const a = { label: "Cancelled" }; const b = "Neighbourhoods covered";`, 2],
    ["JSX text", `const x = <p>Logo, one colour</p>;`, 1],
    ["template text", "const a = `All ${n} neighbourhoods`;", 1],
    ["organis stem", `const a = "Your organiser";`, 1],
    ["comments are not read", `// the neighbourhood is cancelled\n/* centre */ const a = 1;`, 0],
    ["code values are not copy", `if (s === "cancelled") f("neighbourhoodIds", "input-nugget-neighbourhood");`, 0],
    ["US spelling passes", `const a = "Canceled · neighborhood · center · color · favorite";`, 0],
    ["word boundary: no false hit inside a word", `const a = "recentre? no: decentred";`, 0],
    ["a testid template part is a code value", "const t = `badge-neighbourhood-${id}`;", 0],
    ["import paths are not copy", `import x from "./colour-utils";`, 0],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = sourceHits(src, "fixture.tsx").length;
    if (got !== want) { failed++; console.error(`SELF-TEST FAIL: ${name} — expected ${want}, got ${got}`); }
  }
  const loc = localeHits(JSON.stringify({ a: { b: "Favourite places" }, neighbourhood_key: "Neighborhood" }));
  if (loc.length !== 1 || loc[0].key !== "a.b") { failed++; console.error(`SELF-TEST FAIL: locale values only — got ${JSON.stringify(loc)}`); }
  const prev = [...ALLOWED_STRINGS];
  ALLOWED_STRINGS.add("Centre Pompidou");
  if (sourceHits(`const a = "Centre Pompidou"; const b = "Centre Pompidou tour";`, "f.ts").length !== 1) {
    failed++; console.error("SELF-TEST FAIL: the allowlist is by exact string");
  }
  ALLOWED_STRINGS.clear(); for (const p of prev) ALLOWED_STRINGS.add(p);
  if (failed) { console.error(`us-spelling self-test: ${failed} failure(s)`); process.exit(1); }
  console.log(`us-spelling self-test: OK (${cases.length + 2} fixtures)`);
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
    console.error(`us-spelling: ${out.length} British spelling(s) in client copy — use US English (ledger 2026-10-08-us-spelling-guard):`);
    for (const l of out) console.error(`  ${l}`);
    process.exit(1);
  }
  console.log(`us-spelling: OK — ${files.length} files under client/src, no British spelling in client copy or locale values.`);
}

if (require.main === module) main();
module.exports = { sourceHits, localeHits, isCodeValue };
