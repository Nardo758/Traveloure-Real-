#!/usr/bin/env node
/**
 * Money-endpoint guard (CLAUDE.md §14) — operation-scoped.
 *
 * The cheapest durable catch for the client-trusted amount/identity class: fail if a
 * payment/ownership route sources `amount` / `price` / `userId` from `req.body`. Those must be
 * derived server-side (amount from the catalog/record, user from the session) — never the body.
 *
 * SCOPE (hardened Jul 2026 — was filename-scoped, which missed a money op in an off-name file):
 * every `.ts` under server/routes + server/services, PLUS the server/routes.ts monolith, is
 * scanned. A `req.body`-sourced amount/price/userId is a violation when EITHER
 *   (a) the file is money-named (payment/booking/checkout/refund/payout/cart/fee/promo/stripe/…) —
 *       preserves the original coverage; OR
 *   (b) the ENCLOSING route handler performs a money operation (a Stripe call, a transfer/refund/
 *       charge/payout, an earning/revenue write, a payment capture/confirm) — the operation-scope
 *       catch, so a charge in a blandly-named file is no longer invisible.
 * Handler-scoping (b) keeps the huge routes.ts monolith from flagging every unrelated req.body read
 * — only reads inside a money-operation handler count.
 *
 * COMMISSION LITERAL GUARD (added Jul 2026 — CLAUDE.md §15):
 * Fails if a numeric commission literal (0.9, 0.1, 0.75, 0.25) appears in source code outside
 * fee_bands seed files and test files. All commission rates must live in fee_bands / platform_settings
 * and be resolved via resolveCommissionRates(). To exempt a genuinely safe occurrence (e.g. an
 * explanatory constant already backed by a fee_bands lookup), add a `fee-literal-ok` comment on
 * the same line.
 *
 * To exempt a genuinely-safe req.body read (e.g. a discount PREVIEW amount that never becomes a
 * charge), add a `money-derive-ok` comment on the same line.
 *
 * Wire into CI alongside lockfile-purity; run locally with: node scripts/check-money-endpoints.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['server/routes', 'server/services'];
const EXTRA_FILES = ['server/routes.ts']; // the monolith — not under server/routes/, still full of money handlers

// (a) filename heuristic — money-named files are scanned wholesale (original behavior, no regression).
const NAME_RE = /(payment|booking|checkout|refund|payout|cart|fee|promo|expert-request|stripe)/i;
// (b) operation heuristic — a handler that does any of these MOVES MONEY or records an earning.
const MONEY_OP_RE = /(stripe|payment[_]?intent|\btransfers?\.create|createTransfer|\brefunds?\.create|createRefund|\bcharges?\.create|createCharge|\bpayouts?\b|createExpertEarning|createProviderEarning|platform_revenue|providerEarnings|expertEarnings|\.capture\(|capturePayment|confirmPayment|checkout\.sessions?|processPayment|recordPromoUsage)/i;
// the client-trusted read we forbid in a money context.
const BODY_RE = /req\.body/;
const FIELD_RE = /\b(amount|price|userId)\b/;
const HANDLER_RE = /\b(app|router)\.(get|post|put|patch|delete)\s*\(/;
const ALLOW = 'money-derive-ok';

// ─── Commission literal guard ────────────────────────────────────────────────
// Numeric literals that express the 90/10 or 75/25 commission split must only
// appear in commission/payment/fee-named source files where they are explicitly
// annotated fee-literal-ok, or in seed/migration/test files (ground truth).
// In those files without an exemption, a bare 0.9/0.1/0.75/0.25 literal is a defect:
// the rate must come from resolveCommissionRates() / fee_bands at runtime.
const COMMISSION_LITERAL_RE = /\b0\.(9|1|75|25)\b/;
const COMMISSION_ALLOW = 'fee-literal-ok';
// Only commission/payment/fee/payout/checkout-named files are in scope.
// Broad service files (cache, scoring, HTTP headers, etc.) produce too many false positives.
const COMMISSION_FILE_RE = /(commission|payment|payout|checkout|fee)/i;
// Seed, migration, and test files are always exempt (ground-truth literals).
const COMMISSION_EXEMPT_RE = /(server[/\\]seeds[/\\]|[/\\]migrations[/\\]|\.spec\.|\.test\.|__tests__)/;

const commissionViolations = [];

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
for (const d of TARGET_DIRS) walk(d, files);
for (const f of EXTRA_FILES) if (fs.existsSync(path.join(ROOT, f))) files.push(f);

// Strip a line comment (but not the // in a URL scheme) so prose about the fixed pattern
// doesn't self-trip the guard.
const stripComment = (line) => line.split(/(?<!:)\/\//)[0];

// Build handler ranges [start,end) for a file and whether each range performs a money op.
function handlerRanges(lines) {
  const starts = [];
  lines.forEach((l, i) => { if (HANDLER_RE.test(l)) starts.push(i); });
  const ranges = [];
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k];
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const text = lines.slice(start, end).map(stripComment).join('\n');
    ranges.push({ start, end, money: MONEY_OP_RE.test(text) });
  }
  return ranges;
}

const violations = [];
let moneyNamedCount = 0;

for (const rel of files) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  const fileMoneyNamed = NAME_RE.test(path.basename(rel));
  if (fileMoneyNamed) moneyNamedCount++;
  const ranges = fileMoneyNamed ? null : handlerRanges(lines);
  const exemptCommission = COMMISSION_EXEMPT_RE.test(rel.replace(/\\/g, '/'));

  lines.forEach((line, i) => {
    // ── req.body guard ──────────────────────────────────────────────────────
    if (!line.includes(ALLOW)) {
      const code = stripComment(line);
      if (BODY_RE.test(code) && FIELD_RE.test(code)) {
        if (fileMoneyNamed) {
          violations.push({ where: `${rel}:${i + 1}`, line: line.trim(), why: 'money-named file' });
        } else {
          const r = ranges.find((rg) => i >= rg.start && i < rg.end);
          if (r && r.money) {
            violations.push({ where: `${rel}:${i + 1}`, line: line.trim(), why: 'money-operation handler' });
          }
        }
      }
    }

    // ── commission literal guard ─────────────────────────────────────────────
    // Only scan commission/payment/fee/payout/checkout-named files to avoid false
    // positives from scoring weights, HTTP headers, percentile SQL, etc.
    const inCommissionScope = COMMISSION_FILE_RE.test(path.basename(rel));
    if (inCommissionScope && !exemptCommission && !line.includes(COMMISSION_ALLOW)) {
      // Strip inline // comments, then skip pure block-comment lines (JSDoc `* ...`)
      const code = stripComment(line);
      const trimmed = code.trim();
      const isBlockCommentLine = trimmed.startsWith('*') || trimmed.startsWith('/*');
      if (!isBlockCommentLine && COMMISSION_LITERAL_RE.test(code)) {
        commissionViolations.push({ where: `${rel}:${i + 1}`, line: line.trim() });
      }
    }
  });
}

let failed = false;

if (violations.length) {
  failed = true;
  console.error('❌ Money-endpoint guard: `amount`/`price`/`userId` sourced from req.body in a money context.');
  console.error('   Derive the amount server-side and the user from the session (CLAUDE.md §14).');
  console.error('   If this read is genuinely safe (e.g. a preview that never becomes a charge), add a');
  console.error('   `money-derive-ok` comment on the line.\n');
  for (const v of violations) console.error(`   ${v.where}  [money-named file / money-operation handler]: ${v.line}`);
}

if (commissionViolations.length) {
  failed = true;
  console.error('\n❌ Commission literal guard: numeric commission split (0.9/0.1/0.75/0.25) found outside seed/test files.');
  console.error('   All commission rates must be resolved via resolveCommissionRates() from fee_bands (CLAUDE.md §15).');
  console.error('   If this occurrence is genuinely backed by a fee_bands lookup, add a `fee-literal-ok` comment.\n');
  for (const v of commissionViolations) console.error(`   ${v.where}: ${v.line}`);
}

if (failed) process.exit(1);

console.log(
  `✅ Money-endpoint guard (operation-scoped): scanned ${files.length} files ` +
  `(${moneyNamedCount} money-named + ${files.length - moneyNamedCount} scanned for money-operation handlers) ` +
  `— no client-trusted amount/identity, no bare commission literals.`
);
