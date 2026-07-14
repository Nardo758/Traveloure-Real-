#!/usr/bin/env node
/**
 * Money-endpoint guard (CLAUDE.md §14).
 *
 * The cheapest durable catch for the client-trusted amount/identity class: fail if a
 * payment/ownership route sources `amount` / `price` / `userId` from `req.body`. Those must be
 * derived server-side (amount from the catalog/record, user from the session) — never the body.
 *
 * Scope: the money/booking/payout route files. To exempt a genuinely-safe read (e.g. a discount
 * PREVIEW amount that never becomes a charge), add a `money-derive-ok` comment on the same line.
 *
 * Wire into CI alongside lockfile-purity; run locally with: node scripts/check-money-endpoints.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Files that carry payment / refund / booking / payout / checkout / fee handlers.
const TARGET_DIRS = ['server/routes', 'server/services'];
const NAME_RE = /(payment|booking|checkout|refund|payout|cart|fee|promo|expert-request|stripe)/i;
// A req.body-sourced amount/price/userId on one line (direct access or destructure).
const BODY_RE = /req\.body/;
const FIELD_RE = /\b(amount|price|userId)\b/;
const ALLOW = 'money-derive-ok';

function walk(dir, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.ts') && NAME_RE.test(entry.name)) out.push(rel);
  }
}

const files = [];
for (const d of TARGET_DIRS) walk(d, files);

const violations = [];
for (const rel of files) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes(ALLOW)) return;
    // Strip line comments (but not the // in a URL scheme) so explanatory prose about the
    // fixed pattern doesn't self-trip the guard — only real code is matched.
    const code = line.split(/(?<!:)\/\//)[0];
    if (BODY_RE.test(code) && FIELD_RE.test(code)) {
      violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error('❌ Money-endpoint guard: `amount`/`price`/`userId` sourced from req.body in a money route.');
  console.error('   Derive the amount server-side and the user from the session (CLAUDE.md §14).');
  console.error('   If this read is genuinely safe (e.g. a preview that never becomes a charge), add a');
  console.error('   `money-derive-ok` comment on the line.\n');
  for (const v of violations) console.error('   ' + v);
  process.exit(1);
}

console.log(`✅ Money-endpoint guard: ${files.length} money-route files clean (no client-trusted amount/identity).`);
