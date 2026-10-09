#!/usr/bin/env node
/**
 * check-us-spelling.cjs — client copy is US English (ledger `2026-10-08-us-spelling-guard`;
 * decision-maker, Oct 8, 2026).
 *
 * Fails on a British spelling in a CLIENT STRING or a LOCALE VALUE:
 *   neighbourhood · travelling · traveller · licence · colour · organis(e/ation/er…) · favourite ·
 *   centre · cancelled · catalogue · speciality
 * and one product name, spelled ONE way: "Ready-Made" (as in "Ready-Made Trips"). Any other casing
 * or spacing of ready-made ("Ready Made", "ready-made", "Ready-made", "Readymade") fails (H1, ledger
 * `2026-10-08-h1-home-copy`). Strings on pages the H1 sweep has not reached yet sit in
 * `READY_MADE_SWEEP_PENDING` by EXACT string; the sweep PR empties it and nothing is ever added.
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
const BRITISH = /\b(neighbourhood|travelling|traveller|licence|colour|organis|favourite|centre|cancelled|catalogue|speciality)/i;
/** Every spelling of the product name; only the exact "Ready-Made" passes. */
const READY_MADE = /\bready[\s-]?made\b/gi;
const readyMadeVariant = (t) => (t.match(READY_MADE) ?? []).some((m) => m !== "Ready-Made");
/** Proper nouns that keep their spelling, by EXACT string. Empty today. */
const ALLOWED_STRINGS = new Set([]);
/**
 * TEMPORARY (H1, ledger `2026-10-08-h1-home-copy`): ready-made variants on pages outside the home page,
 * by EXACT string, until the one sweep PR fixes them and empties this set. Never grows.
 */
const READY_MADE_SWEEP_PENDING = new Set([
  // client/src/components/admin-sidebar.tsx
  "Ready Made Trips",
  // client/src/components/backoffice/link-analytics-panel.tsx
  "Ready Made Trip",
  // client/src/components/backoffice/my-offerings-table.tsx
  "No offerings yet — create a service or a Ready Made Trip to start selling.",
  "Ready Made Trip",
  // client/src/components/expert/dmo-picker-modal.tsx
  "Refine the raw content below so it's ready to build into a Ready Made Trip or a\n                      client itinerary.",
  // client/src/components/expert/ready-made-listing-panel.tsx
  "An admin reviews it before it appears in Ready Made Trips.",
  // client/src/components/feed/ready-made-card.tsx
  "Ready-made",
  "Ready-made trip",
  // client/src/lib/checkout-headings.ts
  "Pay for this ready-made trip",
  // client/src/lib/role-routes-config.ts
  "Ready Made Trips approval + curation queue",
  // client/src/lib/trip-card.ts
  "'s Ready Made Trip",
  "from a Ready Made Trip",
  // client/src/pages/admin/expert-templates.tsx
  "Ready Made Trips",
  // client/src/pages/admin/reconciliation.tsx
  "delivered ready-made purchase(s) handed back to the announcement sender",
  "ready-made purchase(s)",
  "ready-made rail: not tallied on this run",
  // client/src/pages/admin/template-approvals.tsx
  "Cloneable trips built in the expert Workstation. Approval snapshots the \"what's inside\"\n            counts and puts the listing on the Ready Made Trips shelf feed.",
  "Editorial badges on live Ready Made Trips. Badged listings lead the store shelf.",
  "Ready Made Trips awaiting review, and editorial badges on the live shelf.",
  // client/src/pages/discover.tsx
  "Local experts publish ready-made itinerary packages and offer services to\n              travelers on Traveloure. Turn what you know into income.",
  // client/src/pages/expert/dmo-library.tsx
  "Build Ready Made Trip",
  "Ready Made Trip",
  "Ready Made Trips",
  "Refine the raw content below so it's ready to build into a Ready Made Trip or a client\n                  itinerary.",
  // client/src/pages/expert/inbox.tsx
  "From your Ready Made Trip",
  "When a traveler asks a local about a stop in your market — or on a copy of your Ready Made Trip — it appears here.",
  // client/src/pages/expert/ready-made.tsx
  "Build a complete trip once, then sell it in the Ready Made Trips store as many times as you\n            like. A buyer gets their own editable copy — you keep authoring the original.",
  "Could not start a new ready-made trip",
  // client/src/pages/expert/workspace.tsx
  "Create a store listing from this build — price it, submit for admin review, sell it in Ready Made Trips.",
  // client/src/pages/my-bookings.tsx
  "1 ready-made plan you bought isn't shown here — it's on the Trips tab.",
  "Ready Made Trips you bought",
  "Ready-made plan:",
  "ready-made plans you bought aren't shown here — they're on the Trips tab.",
  // client/src/pages/provider/earnings.tsx
  "Ready Made Trip",
  // client/src/pages/ready-made-detail.tsx
  "Browse Ready Made Trips",
  "Ready Made Trips",
  // client/src/pages/ready-made-preview.tsx
  "See Ready Made Trips",
]);

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
      if ((BRITISH.test(t) || (readyMadeVariant(t) && !READY_MADE_SWEEP_PENDING.has(t))) && !ALLOWED_STRINGS.has(t) && !codeValue) {
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
      if ((BRITISH.test(o) || (readyMadeVariant(o) && !READY_MADE_SWEEP_PENDING.has(o.trim()))) && !ALLOWED_STRINGS.has(o.trim())) hits.push({ key, text: o });
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
    ["traveller and speciality", `const a = "Help travellers"; const b = "speciality services";`, 2],
    ["the product name passes", `const a = "Ready-Made Trips"; const b = "Browse Ready-Made Trips";`, 0],
    ["ready-made variants fail", `const a = "Fixture: Ready Made Trips"; const b = "fixture: a ready-made trip"; const c = <p>Fixture Ready-made</p>;`, 3],
    ["a ready-made route is a code value", `const h = "/ready-made"; const t = "storefront-lane-readymade";`, 0],
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
