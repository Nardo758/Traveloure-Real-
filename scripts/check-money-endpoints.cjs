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
const MONEY_OP_RE = /(stripe|payment[_]?intent|\btransfers?\.create|createTransfer|\brefunds?\.create|createRefund|\bcharges?\.create|createCharge|\bpayouts?\b|createExpertEarning|createProviderEarning|createAffiliateEarning|platform_revenue|providerEarnings|expertEarnings|affiliateEarnings|\.capture\(|capturePayment|confirmPayment|checkout\.sessions?|processPayment|recordPromoUsage)/i;
// the client-trusted read we forbid in a money context.
const BODY_RE = /req\.body/;
// The client-trusted FIELD set. `amount|price|userId` is §14's original wording — the AMOUNT and the
// IDENTITY. `rate|share|commission|split` is the ruling-42 widening: the provider-sigma audit (MI-1)
// found `provider_services.revenueShareRate` — a client-settable COMMISSION SPLIT — reaching the real
// Stripe charge as "the final override" over the fee_bands-resolved rate, and this guard passed
// truthfully the whole time because a RATE is not an amount, a price or an identity. A rate multiplies
// the amount; letting the client pick it is the same defect one derivative up.
//
// Matching is camelCase/snake_case SEGMENT-aware, not substring: `revenueShareRate` and
// `commission_rate` hit, while `separate` (contains "rate") and `shared` (contains "share") do not.
const FIELD_RE = /\b(amount|price|userId)\b|(?:^|[^A-Za-z])(rate|share|commission|split)s?(?![a-z])|(?:[a-z0-9_])(Rate|Share|Commission|Split)s?(?![a-z])|_(RATE|SHARE|COMMISSION|SPLIT)S?(?![A-Z])/;
const HANDLER_RE = /\b(app|router)\.(get|post|put|patch|delete)\s*\(/;
const ALLOW = 'money-derive-ok';
// Rate-bearing COLUMN predicate for the schema-side mass-assignment pass below (declared here so
// the self-test can reach it). Segment-aware, same vocabulary as FIELD_RE.
const RATE_COL_RE = /(?:^|[^A-Za-z])(rate|share|commission|split)s?(?![a-z])|(?:[a-z0-9_])(Rate|Share|Commission|Split)s?(?![a-z])/;
// PAYMENT-IDENTITY column predicate (PS15, ruling 46) — the same schema-mediated pass, one class
// wider. `revenueShareRate` taught that a privileged column reachable through a `.parse(req.body)`
// spread is invisible to any line-level grep; PS15 was the same shape on a field that is not a rate
// at all. `service_bookings.stripePaymentIntentId` is a SERVER_VERIFIED_ACTORS-only field (rulings
// 39/40/41: the gate is the PROVENANCE of the id) and was exposed by `insertServiceBookingSchema`,
// parsed off the body at POST /api/bookings and spread into the insert — so a client could BIRTH a
// booking already carrying its own PaymentIntent. Matches the Stripe-object linkage family
// (`stripePaymentIntentId`, `stripeChargeId`, `stripeAccountId`, `stripe_transfer_id`, …) and the
// generic `paymentIntentId`. Admin/server-by-design setters carry `money-derive-ok` on the COLUMN
// line, exactly as the rate pass does. Deliberately anchored and narrow: it matches Stripe-object
// IDENTIFIERS only, not `stripeAccountStatus` or `stripeConnectStatus` (privileged too, and already
// stripped by ruling 42 — but a status is not a linkage id and widening this to every `stripe*`
// column would make the predicate unusable rather than more truthful).
const PAYMENT_ID_COL_RE = /^(stripe[A-Z]\w*Id|paymentIntentId)$/;

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

// ─── Self-test (`--self-test`) — COMMITTED fixtures, ledger-lint precedent ───────────
// A guard whose predicate is wrong passes truthfully forever (MI-3, AC-2, the PR #435 near-miss).
// These fixtures are the standing proof that the ruling-42 widening does what it claims and that it
// did not buy coverage with false positives. Run in CI next to the guard itself.
function selfTest() {
  const cases = [
    // [subject, regex, expected, why]
    ['const rate = req.body.revenueShareRate;', FIELD_RE, true, 'camelCase rate field (the MI-1 shape)'],
    ['const r = req.body.commission_rate;', FIELD_RE, true, 'snake_case rate field'],
    ['const s = req.body.expertShare;', FIELD_RE, true, 'camelCase share field'],
    ['const s = req.body.split;', FIELD_RE, true, 'bare split field'],
    ['const c = req.body.commission;', FIELD_RE, true, 'bare commission field'],
    ['const a = req.body.amount;', FIELD_RE, true, 'original §14 amount coverage — no regression'],
    ['const u = req.body.userId;', FIELD_RE, true, 'original §14 identity coverage — no regression'],
    // Negatives: substring collisions that must NOT be flagged, or the widening is unusable.
    ['const x = req.body.separateInvoices;', FIELD_RE, false, '"separate" contains "rate"'],
    ['const x = req.body.sharedWithUserIds;', FIELD_RE, false, '"shared" contains "share" (and userIds is plural, not the §14 field)'],
    ['const x = req.body.itinerary;', FIELD_RE, false, 'unrelated field'],
    // Rate-COLUMN predicate (the schema-side pass).
    ['revenueShareRate', RATE_COL_RE, true, 'the MI-1 column'],
    ['commissionBandKey', RATE_COL_RE, true, 'a band selector'],
    ['platformFeeRate', RATE_COL_RE, true, 'trailing Rate segment'],
    ['shareToken', RATE_COL_RE, true, 'name-matched; adjudicated by annotation, not by the regex'],
    ['separateAddress', RATE_COL_RE, false, '"separate" must not match'],
    ['sharedByUserId', RATE_COL_RE, false, '"shared" must not match'],
    ['totalAmount', RATE_COL_RE, false, 'an amount is not a rate'],
    // PAYMENT-IDENTITY column predicate (PS15, ruling 46) — the pass that would have caught PS15.
    // A rate is not the only privileged thing a schema-mediated spread can hand to a client.
    ['stripePaymentIntentId', PAYMENT_ID_COL_RE, true, 'THE PS15 column — a server-verified-only PaymentIntent id'],
    ['stripeChargeId', PAYMENT_ID_COL_RE, true, 'Stripe charge linkage'],
    ['stripeAccountId', PAYMENT_ID_COL_RE, true, 'Connect account linkage (the ruling-42 dormant family)'],
    ['stripeRefundId', PAYMENT_ID_COL_RE, true, 'refund linkage — the reconciliation job keys on it'],
    ['paymentIntentId', PAYMENT_ID_COL_RE, true, 'the un-prefixed spelling'],
    // Negatives: over-matching here would make the pass unusable, so pin what it must NOT claim.
    ['stripeAccountStatus', PAYMENT_ID_COL_RE, false, 'a status is not a linkage id (privileged, but ruling 42 stripped it by name)'],
    ['stripeConnectStatus', PAYMENT_ID_COL_RE, false, 'likewise a status'],
    ['canReceivePayments', PAYMENT_ID_COL_RE, false, 'a payments-adjacent boolean is not an id'],
    ['tripId', PAYMENT_ID_COL_RE, false, 'an ordinary FK must not be flagged'],
    ['travelerId', PAYMENT_ID_COL_RE, false, 'an ordinary identity column — §14 handles it, not this pass'],
  ];
  let bad = 0;
  for (const [subject, re, expected, why] of cases) {
    const got = re.test(subject);
    if (got !== expected) {
      bad++;
      console.error(`SELF-TEST FAIL: ${JSON.stringify(subject)} → ${got}, expected ${expected} (${why})`);
    }
  }
  if (bad) process.exit(1);
  console.log(
    `self-test OK (${cases.length} predicate fixtures: rate/share/commission/split positives, ` +
    `payment-identity positives (stripe<Thing>Id / paymentIntentId — ruling 46), ` +
    `substring-collision + status/grant/FK negatives, §14 no-regression)`,
  );
  process.exit(0);
}
if (process.argv.includes('--self-test')) selfTest();

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

// ─── Rate-bearing mass-assignment guard (ruling 42, MI-1's actual shape) ─────────────
// WHY THIS EXISTS AND THE req.body PREDICATE ABOVE IS NOT ENOUGH.
// MI-1 was `provider_services.revenueShareRate`: a commission split the client could set, which
// then beat the fee_bands-resolved rate at the real Stripe charge. Widening FIELD_RE to include
// rate/share/commission/split does NOT catch it — and that is not a bug in the widening, it is the
// finding. The route never writes `req.body.revenueShareRate`; it writes
// `insertProviderServiceSchema.parse(req.body)` and SPREADS the result. The privileged field enters
// through the SCHEMA, so no line ever contains both `req.body` and the field name, and a line-level
// grep is structurally blind to it.
//
// So this check works the other way round: find every zod insert schema that (a) EXPOSES a
// rate-bearing column — i.e. does not `.omit()` it — and (b) is `.parse()`d from a request body
// anywhere in server/. That intersection IS the class "a client can set a rate".
//
// Escape hatch: a genuinely intentional privileged setter (an ADMIN band editor, say) carries
// `money-derive-ok` on the COLUMN's own line in shared/schema.ts, next to the reason.
const SCHEMA_FILE = 'shared/schema.ts';
const rateAssignViolations = [];

if (fs.existsSync(path.join(ROOT, SCHEMA_FILE))) {
  const schemaSrc = fs.readFileSync(path.join(ROOT, SCHEMA_FILE), 'utf8');
  const schemaLines = schemaSrc.split('\n');

  // table name -> [{col, line, why}] of PRIVILEGED, non-exempt columns.
  // Two predicates, one pass: rate-bearing (ruling 42) and payment-identity (ruling 46). Both are
  // the same class — a privileged column a client can set because a denylist schema forgot it.
  const tableRateCols = {};
  let curTable = null;
  schemaLines.forEach((l, i) => {
    const t = l.match(/^export const (\w+)\s*=\s*pgTable\(/);
    if (t) { curTable = t[1]; tableRateCols[curTable] = []; return; }
    if (!curTable) return;
    if (/^\}\)/.test(l)) { curTable = null; return; }
    const c = l.match(/^\s{2}(\w+):\s*(?:decimal|numeric|integer|real|doublePrecision|varchar|text|jsonb)\(/);
    if (!c || l.includes(ALLOW)) return;
    if (RATE_COL_RE.test(c[1])) {
      tableRateCols[curTable].push({ col: c[1], line: i + 1, why: 'rate-bearing (ruling 42)' });
    } else if (PAYMENT_ID_COL_RE.test(c[1])) {
      tableRateCols[curTable].push({ col: c[1], line: i + 1, why: 'payment-identity, server-verified actors only (ruling 46)' });
    }
  });

  // insert schemas + what they omit
  const insertSchemas = [];
  const schemaRe = /export const (\w+)\s*=\s*createInsertSchema\((\w+)\)([\s\S]*?);\n/g;
  let m;
  while ((m = schemaRe.exec(schemaSrc))) {
    const omitBlock = m[3].match(/\.omit\(\{([\s\S]*?)\}\)/);
    insertSchemas.push({
      name: m[1],
      table: m[2],
      omitted: omitBlock ? [...omitBlock[1].matchAll(/(\w+):\s*true/g)].map((x) => x[1]) : [],
    });
  }

  // which of them are parsed from a request body anywhere under server/
  const serverFiles = [];
  walk('server', serverFiles);
  const parsedFromBody = new Set();
  const parseSites = {};
  for (const rel of serverFiles) {
    if (/[/\\]__tests__[/\\]|\.test\.ts$/.test(rel)) continue;
    const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    txt.split('\n').forEach((line, i) => {
      const mm = line.match(/\b(insert\w+Schema)\s*(?:\.partial\(\))?\s*\.parse\s*\(([^)]*)\)/);
      if (mm && /req\.body|body\b/.test(mm[2])) {
        parsedFromBody.add(mm[1]);
        (parseSites[mm[1]] = parseSites[mm[1]] || []).push(`${rel}:${i + 1}`);
      }
    });
  }

  for (const s of insertSchemas) {
    if (!parsedFromBody.has(s.name)) continue;
    for (const c of tableRateCols[s.table] || []) {
      if (s.omitted.includes(c.col)) continue;
      rateAssignViolations.push({
        schema: s.name,
        table: s.table,
        col: c.col,
        why: c.why,
        where: `${SCHEMA_FILE}:${c.line}`,
        sites: (parseSites[s.name] || []).join(', '),
      });
    }
  }
}

let failed = false;

if (rateAssignViolations.length) {
  failed = true;
  console.error('❌ Privileged-field mass-assignment guard: a client-parsed insert schema EXPOSES a privileged column.');
  console.error('   Rates resolve from fee_bands ONLY and are never client-settable (ruling 42); a PaymentIntent/');
  console.error('   Stripe-object id is written only by a SERVER-VERIFIED actor (rulings 41/46).');
  console.error('   Fix: add `<column>: true` to that schema\'s .omit({…}) and derive/strip server-side —');
  console.error('   and prefer a pick-based ALLOWLIST schema at the route, so the next privileged column is');
  console.error('   unreachable by default rather than reachable until someone remembers to omit it.');
  console.error('   If the setter is genuinely privileged-by-design (an admin band editor), put a');
  console.error('   `money-derive-ok` comment on the COLUMN line in shared/schema.ts with the reason.\n');
  for (const v of rateAssignViolations) {
    console.error(`   ${v.where}  ${v.table}.${v.col} [${v.why}] exposed by ${v.schema}, parsed from a request body at: ${v.sites}`);
  }
}

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
  `— no client-trusted amount/identity/rate, no bare commission literals, no rate-bearing mass assignment.`
);
console.log(
  '   NEGATIVE SPACE (ruling 43 — what this guard does NOT cover):\n' +
  '   · req.body check is LINE-LOCAL — a body value read on one line and used on another is invisible,\n' +
  '     and destructuring (`const { amount } = req.body`) only trips it because both words share a line.\n' +
  '   · Only server/routes + server/services + server/routes.ts are scanned; server/jobs, server/utils,\n' +
  '     server/storage.ts and any client code are OUT of scope.\n' +
  '   · MONEY_OP_RE is a NAME heuristic. A handler that moves money through an indirectly-named helper\n' +
  '     is not recognised as a money handler, so body reads inside it are not flagged.\n' +
  '   · Handler ranges are delimited by the NEXT app./router. registration, so a body read in a helper\n' +
  '     declared between two routes is attributed to the preceding route, not to its real caller.\n' +
  '   · The commission-literal pass only knows the values 0.9/0.1/0.75/0.25 in commission/payment/fee/\n' +
  '     payout/checkout-NAMED files — any other rate value, or the same value elsewhere, is invisible.\n' +
  '   · The privileged-field mass-assignment pass reads shared/schema.ts only: a privileged field on a\n' +
  '     HAND-WRITTEN zod object (not createInsertSchema) or in another schema file is out of scope, as is\n' +
  '     any rate column whose name contains none of rate/share/commission/split and any payment-identity\n' +
  '     column not spelled stripe<Thing>Id / paymentIntentId (a `status`, a boolean grant, or an amount\n' +
  '     column is NOT covered — ruling 42 stripped that family by NAME, not by predicate).\n' +
  '   · It only knows the RATE and PAYMENT-IDENTITY classes. Every other privileged column an\n' +
  '     .omit()-based schema forgets — an amount, a status, an authorization grant (#PS16) — is still\n' +
  '     reachable and still invisible here. That is the standing class ruling 46 records, and the\n' +
  '     structural answer is a pick-based ALLOWLIST schema, which no grep can substitute for.\n' +
  '   · Nothing here proves the resolved rate is CORRECT — only that the client did not choose it.'
);
