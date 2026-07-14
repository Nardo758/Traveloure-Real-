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
 * To exempt a genuinely-safe read (e.g. a discount PREVIEW amount that never becomes a charge), add
 * a `money-derive-ok` comment on the same line.
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

  lines.forEach((line, i) => {
    if (line.includes(ALLOW)) return;
    const code = stripComment(line);
    if (!(BODY_RE.test(code) && FIELD_RE.test(code))) return;

    if (fileMoneyNamed) {
      violations.push({ where: `${rel}:${i + 1}`, line: line.trim(), why: 'money-named file' });
      return;
    }
    // operation-scope: only if the enclosing handler performs a money op.
    const r = ranges.find((rg) => i >= rg.start && i < rg.end);
    if (r && r.money) {
      violations.push({ where: `${rel}:${i + 1}`, line: line.trim(), why: 'money-operation handler' });
    }
  });
}

if (violations.length) {
  console.error('❌ Money-endpoint guard: `amount`/`price`/`userId` sourced from req.body in a money context.');
  console.error('   Derive the amount server-side and the user from the session (CLAUDE.md §14).');
  console.error('   If this read is genuinely safe (e.g. a preview that never becomes a charge), add a');
  console.error('   `money-derive-ok` comment on the line.\n');
  for (const v of violations) console.error(`   ${v.where}  [${v.why}]: ${v.line}`);
  process.exit(1);
}

console.log(
  `✅ Money-endpoint guard (operation-scoped): scanned ${files.length} files ` +
  `(${moneyNamedCount} money-named + ${files.length - moneyNamedCount} scanned for money-operation handlers) ` +
  `— no client-trusted amount/identity.`
);
