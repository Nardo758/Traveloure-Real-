#!/usr/bin/env node
/**
 * Linkage-preservation guard (Trip-Canon Lane G) — the Tier-0 static check that would have made
 * holes H1 and H5 impossible to write (docs/E2E_ITEM_LIFECYCLE.md §3).
 *
 * THE INVARIANT: an itinerary item born from a sellable service (cart item, provider-service, or
 * AI-optimizer variant) must carry `providerServiceId` on write. Nothing in the codebase enforced
 * this, so two independent authors dropped the link at two independent write sites:
 *   - H1: `POST /api/cart/convert-to-itinerary` (server/routes.ts) reads `cartItem` — which HAS a
 *     `serviceId` — but writes only `title`/`description`/`estimatedCost` to the new itinerary item,
 *     then deletes the cart row. The link is destroyed; the item becomes permanently unbuyable text.
 *   - H5: `POST /api/itinerary-comparisons/:id/apply-to-trip` (server/routes/plancard.routes.ts)
 *     reads `variantItems` — whose rows carry `providerServiceId` — but maps them into itinerary-item
 *     values that omit the field. Same class of bug, second instance, because no invariant existed to
 *     stop it either time.
 *
 * WHAT THIS GUARD DOES (static, grep-class — fast, no DB):
 *   1. Scans every `server/**\/*.ts` file for itinerary-item WRITE SITES: calls to
 *      `.createItineraryItem(`, `db.insert(itineraryItems)`, and `.bulkInsertItineraryItems(` (the
 *      third path — the exact call H5 uses; it wraps `db.insert(itineraryItems)` one level down in
 *      storage.ts, so a literal-text scan for the insert alone would miss the H5 call site).
 *   2. For each site, looks at the nearest ENCLOSING BRACE BLOCK (the handler/loop/try-block the call
 *      lives in — found by a backward/forward brace-balance walk, not a fixed line count, so a write
 *      site three methods away in storage.ts never leaks tokens from an unrelated method). If that
 *      block references a service-bearing SOURCE — any of `cartItem`, `providerServiceId`,
 *      `item.serviceId`, `variantItems`, `getCartItemById`, `getItineraryVariantItems` — the write is
 *      presumed to have a service link available and MUST carry `providerServiceId` as a key in the
 *      values object being written (checked in the call's own statement, via a forward paren-balance
 *      walk to the statement's closing paren).
 *   3. A site that fails this check is a violation UNLESS annotated with an explicit
 *      `// linkage-none-ok: <reason>` comment near the call (same line, or within a few lines either
 *      side, e.g. above the call or inside the values object) — the same escape-hatch shape as
 *      `money-derive-ok` / `fee-literal-ok` in check-money-endpoints.cjs.
 *
 * Exit 1 and list every unannotated violation (file:line + the source token that triggered the
 * requirement) on failure; exit 0 silently (with a summary line) on success.
 *
 * Run locally: node scripts/check-linkage-preservation.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = 'server';
const ALLOW = 'linkage-none-ok';

// ─── Write-site patterns ──────────────────────────────────────────────────────
// Method-call form only (preceded by `.`) so we don't also match the storage.ts interface
// declaration / class-method DEFINITION lines (`createItineraryItem(item: any): ...`), which carry
// no literal field information to check anyway.
const WRITE_SITE_PATTERNS = [
  { re: /\.createItineraryItem\s*\(/, label: 'createItineraryItem(' },
  { re: /\bdb\.insert\(itineraryItems\)/, label: 'db.insert(itineraryItems)' },
  { re: /\.bulkInsertItineraryItems\s*\(/, label: 'bulkInsertItineraryItems(' },
];

// ─── Service-bearing source tokens ────────────────────────────────────────────
const SOURCE_TOKENS = [
  'cartItem',
  'providerServiceId',
  'item.serviceId',
  'variantItems',
  'getCartItemById',
  'getItineraryVariantItems',
];

const FIELD_KEY_RE = /\bproviderServiceId\s*:/;

function walk(dir, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.ts')) out.push(rel);
  }
}

const files = [];
walk(TARGET_DIR, files);

// Strip a line comment (but not `//` inside a URL-ish scheme) so prose about the pattern itself
// doesn't self-trip the guard, mirroring check-money-endpoints.cjs.
const stripComment = (line) => line.split(/(?<!:)\/\//)[0];

// Best-effort strip of quoted-string contents so braces/parens inside string/template literals
// don't throw off the balance walks. Not a real parser — good enough for a coarse static guard.
function stripStrings(line) {
  return line
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function braceDelta(rawLine) {
  const line = stripStrings(stripComment(rawLine));
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;
  return { opens, closes };
}

// Find the nearest enclosing brace block containing `idx` (0-based line index): walk backward
// tracking a close-minus-open balance; the line where balance first goes negative is the block's
// opening line (it contains the unmatched `{`). Then walk forward from there to find the matching
// close. This is a one-level "nearest enclosing block" — for every known write site here that block
// is the handler/loop/try-block that also holds the relevant source token, and it's narrow enough to
// not leak unrelated sibling methods' tokens (storage.ts is dense with many small adjacent methods).
function findEnclosingBlock(lines, idx) {
  let balance = 0;
  let start = 0;
  for (let i = idx; i >= 0; i--) {
    const { opens, closes } = braceDelta(lines[i]);
    balance += closes - opens;
    if (balance < 0) { start = i; break; }
    if (i === 0) start = 0;
  }
  let bal2 = 0;
  let end = lines.length - 1;
  for (let i = start; i < lines.length; i++) {
    const { opens, closes } = braceDelta(lines[i]);
    bal2 += opens - closes;
    if (bal2 <= 0 && i > start) { end = i; break; }
  }
  return { start, end };
}

// Find the end of the write-site call STATEMENT (forward paren-balance walk from the call's opening
// line) so the providerServiceId-field check only looks at the values actually being written by this
// call, not unrelated code after it. Capped so a malformed/unbalanced snippet can't hang the scan.
function findCallStatementEnd(lines, startIdx) {
  const CAP = 60;
  let balance = 0;
  let opened = false;
  const limit = Math.min(lines.length - 1, startIdx + CAP);
  for (let i = startIdx; i <= limit; i++) {
    const line = stripStrings(stripComment(lines[i]));
    const opens = (line.match(/\(/g) || []).length;
    const closes = (line.match(/\)/g) || []).length;
    balance += opens - closes;
    if (opens > 0) opened = true;
    if (opened && balance <= 0) return i;
  }
  return limit;
}

function hasAnnotationNear(lines, fromIdx, toIdx) {
  const lo = Math.max(0, fromIdx - 3);
  const hi = Math.min(lines.length - 1, toIdx + 3);
  for (let i = lo; i <= hi; i++) {
    if (lines[i].includes(ALLOW)) return true;
  }
  return false;
}

const violations = [];
let siteCount = 0;

for (const rel of files) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = raw.split('\n');

  lines.forEach((rawLine, i) => {
    const code = stripComment(rawLine);
    const matched = WRITE_SITE_PATTERNS.find((p) => p.re.test(code));
    if (!matched) return;

    siteCount++;

    const { start, end } = findEnclosingBlock(lines, i);
    const blockText = lines.slice(start, end + 1).join('\n');
    const triggeredBy = SOURCE_TOKENS.filter((tok) => blockText.includes(tok));
    if (triggeredBy.length === 0) return; // no service-bearing source in scope — nothing required

    const callEnd = findCallStatementEnd(lines, i);
    const fieldsText = lines.slice(i, callEnd + 1).join('\n');
    if (FIELD_KEY_RE.test(fieldsText)) return; // providerServiceId is written — linkage preserved

    if (hasAnnotationNear(lines, i, callEnd)) return; // explicit, reviewed exemption

    violations.push({
      where: `${rel}:${i + 1}`,
      pattern: matched.label,
      line: rawLine.trim(),
      triggeredBy,
    });
  });
}

if (violations.length) {
  console.error(
    '❌ Linkage-preservation guard: an itinerary-item write site references a service-bearing source\n' +
    '   (cartItem / providerServiceId / item.serviceId / variantItems / getCartItemById /\n' +
    '   getItineraryVariantItems) but does not write `providerServiceId` — the exact H1/H5 class\n' +
    '   (docs/E2E_ITEM_LIFECYCLE.md §3). Either write providerServiceId onto the itinerary item, or,\n' +
    '   if this write genuinely has no service to link (pure notes/DMO/free-text/AI-generated content),\n' +
    '   add a `// linkage-none-ok: <reason>` comment near the call.\n',
  );
  for (const v of violations) {
    console.error(`   ${v.where}  [${v.pattern}, source: ${v.triggeredBy.join(', ')}]: ${v.line}`);
  }
  process.exit(1);
}

console.log(
  `✅ Linkage-preservation guard: scanned ${files.length} files, ${siteCount} itinerary-item write ` +
  `site(s) — every write with a service-bearing source in scope preserves providerServiceId (or is ` +
  `explicitly annotated linkage-none-ok).`,
);
