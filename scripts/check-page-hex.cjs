#!/usr/bin/env node
/**
 * check-page-hex — no hardcoded hex colour in client/src/pages (footer-pages ruling, Sep 28, 2026;
 * ledger `2026-09-28-footer-pages-one-layout`).
 *
 * A page states colour through brand tokens (`--earn-*`, or a shadcn semantic that resolves to
 * one). A `#E85D55`, `bg-[#F6F5F1]` or `color: "#111827"` in a page file is how a second red, a
 * cool grey and a white page crept onto the public site.
 *
 * RULES
 *   1. Every page a footer link opens (FOOTER_PAGE_FILES) holds ZERO hex literals.
 *   2. Every other file under client/src/pages may hold no MORE hex literals than
 *      scripts/page-hex-baseline.json records for it; a file absent from the baseline holds none.
 *      The baseline only shrinks: a file that drops below its count is reported so the number can
 *      be lowered, never raised. (The ~950 literals in the console pages predate this ruling; they
 *      are debt with a count, not a licence.)
 *
 * WHAT COUNTS: `#rgb`, `#rrggbb`, `#rrggbbaa` in code or strings. Comments are stripped first, so
 * an issue reference such as `// #323` is not a colour.
 *
 * NEGATIVE SPACE (§18d) — what this cannot see:
 *   - Files outside client/src/pages. Components render page content too; a hex in a component is
 *     not caught here.
 *   - Colours written without a hex: `rgb(…)`, `hsl(…)`, named colours (`white`, `black`), and
 *     Tailwind palette classes (`bg-gray-50`, `text-rose-500`). Those are reviewed, not grepped.
 *   - A three-letter hex word used as text (`#add`, `#bad`) counts as a colour; it is rare and
 *     the fix is to write it differently.
 *
 * Usage: node scripts/check-page-hex.cjs            (lint)
 *        node scripts/check-page-hex.cjs --self-test (fixtures; run in CI immediately before)
 *        node scripts/check-page-hex.cjs --write-baseline (maintainers only, after removing debt)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PAGES_DIR = path.join(ROOT, "client/src/pages");
const BASELINE_PATH = path.join(__dirname, "page-hex-baseline.json");

/** The files behind every footer destination (client/src/lib/nav-config.ts footerSectionsConfig). */
const FOOTER_PAGE_FILES = [
  "experiences.tsx",
  "discover.tsx",
  "how-it-works.tsx",
  "pricing.tsx",
  "experts.tsx",
  "providers-directory.tsx",
  "earn.tsx",
  "about.tsx",
  "press.tsx",
  "careers.tsx",
  "help.tsx",
  "contact.tsx",
  "visa-help.tsx",
  "privacy.tsx",
  "terms.tsx",
];

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;

/** Removes // and /* *\/ comments, leaving string and template contents intact. */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += n ?? ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
      i += 2;
      continue;
    }
    // JSX comments {/* … */} are handled by the block branch above.
    out += c;
    i++;
  }
  return out;
}

function hexHits(src) {
  const code = stripComments(src);
  const hits = [];
  code.split("\n").forEach((line, idx) => {
    for (const m of line.matchAll(HEX)) hits.push({ line: idx + 1, hex: m[0] });
  });
  return hits;
}

function listPageFiles(dir = PAGES_DIR) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") out.push(...listPageFiles(p)); continue; }
    if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Pure decision: returns { failures, shrunk } for a map of relPath -> source. */
function evaluate(sources, baseline, footerFiles = FOOTER_PAGE_FILES) {
  const failures = [];
  const shrunk = [];
  for (const [rel, src] of Object.entries(sources)) {
    const hits = hexHits(src);
    const isFooter = footerFiles.includes(rel);
    const allowed = isFooter ? 0 : baseline[rel] ?? 0;
    if (hits.length > allowed) {
      const where = hits.slice(0, 5).map((h) => `${rel}:${h.line} ${h.hex}`).join(", ");
      failures.push(
        isFooter
          ? `${rel} is a footer page and must use tokens only — ${hits.length} hex literal(s): ${where}`
          : `${rel} has ${hits.length} hex literal(s), baseline allows ${allowed}: ${where}`,
      );
    } else if (!isFooter && hits.length < allowed) {
      shrunk.push(`${rel}: ${allowed} → ${hits.length} (lower the baseline)`);
    }
  }
  for (const rel of footerFiles) {
    if (baseline[rel]) failures.push(`${rel} is a footer page and may not appear in the baseline`);
  }
  return { failures, shrunk };
}

function selfTest() {
  const cases = [
    ["a footer page with a hex fails", () => evaluate({ "about.tsx": 'const x = "bg-[#FF385C]";' }, {}).failures.length === 1],
    ["a footer page with a token passes", () => evaluate({ "about.tsx": 'const x = "bg-[color:var(--earn-coral-ink)]";' }, {}).failures.length === 0],
    ["a comment issue ref is not a colour", () => evaluate({ "about.tsx": "// #323: tracked\n/* see #abc */ const a = 1;" }, {}).failures.length === 0],
    ["a hex inside a string after // in the same line still counts", () => evaluate({ "about.tsx": 'const u = "http://x"; const c = "#123456";' }, {}).failures.length === 1],
    ["8-digit and 3-digit hexes count", () => hexHits('a("#fff"); b("#11223344");').length === 2],
    ["an id like #main-content is not a colour", () => hexHits('href="#main-content"').length === 0],
    ["a non-footer file within its baseline passes", () => evaluate({ "admin/x.tsx": 'a("#fff"); b("#000");' }, { "admin/x.tsx": 2 }).failures.length === 0],
    ["a non-footer file above its baseline fails", () => evaluate({ "admin/x.tsx": 'a("#fff"); b("#000"); c("#111");' }, { "admin/x.tsx": 2 }).failures.length === 1],
    ["a new file with a hex fails", () => evaluate({ "new-page.tsx": 'a("#fff");' }, {}).failures.length === 1],
    ["a shrunk file is reported, not failed", () => { const r = evaluate({ "admin/x.tsx": 'a("#fff");' }, { "admin/x.tsx": 2 }); return r.failures.length === 0 && r.shrunk.length === 1; }],
    ["a footer page listed in the baseline fails", () => evaluate({}, { "about.tsx": 1 }).failures.length === 1],
  ];
  let ok = true;
  for (const [name, fn] of cases) {
    const pass = !!fn();
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = listPageFiles();
  const sources = Object.fromEntries(files.map((f) => [path.relative(PAGES_DIR, f).split(path.sep).join("/"), fs.readFileSync(f, "utf8")]));
  if (process.argv.includes("--write-baseline")) {
    const baseline = {};
    for (const [rel, src] of Object.entries(sources)) {
      const n = hexHits(src).length;
      if (n > 0 && !FOOTER_PAGE_FILES.includes(rel)) baseline[rel] = n;
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(Object.fromEntries(Object.entries(baseline).sort()), null, 2) + "\n");
    console.log(`wrote ${Object.keys(baseline).length} entries to ${path.relative(ROOT, BASELINE_PATH)}`);
    return;
  }
  const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : {};
  const { failures, shrunk } = evaluate(sources, baseline);
  for (const s of shrunk) console.log(`note: ${s}`);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL: ${f}`);
    console.error(`\ncheck-page-hex: ${failures.length} failure(s). Use a brand token (var(--earn-*) or a shadcn semantic) instead of a hex.`);
    process.exit(1);
  }
  const debt = Object.values(baseline).reduce((a, b) => a + b, 0);
  console.log(`check-page-hex: OK — ${FOOTER_PAGE_FILES.length} footer pages hold no hex; ${Object.keys(baseline).length} other page files carry ${debt} baselined literal(s), none added.`);
}

module.exports = { hexHits, stripComments, evaluate, FOOTER_PAGE_FILES };
if (require.main === module) main();
