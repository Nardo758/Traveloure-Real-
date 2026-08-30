#!/usr/bin/env node
/**
 * Omit→pick schema ratchet guard (#PS18, CLAUDE.md §19 / DECISIONS.md ruling 46).
 *
 * WHAT THIS IS FOR.
 * Ruling 46 named the structural fix for the privileged-field mass-assignment class
 * (§14 amount/identity, §18 rate, §19 the standing class itself): a client-reachable
 * insert schema must be an ALLOWLIST (`.pick()`) rather than a DENYLIST (`.omit()`),
 * because nobody edits an omit list for a column that did not exist when it was
 * written. Ruling 46 also recorded the posture as of its own audit: all 186
 * `createInsertSchema(...)` calls in `shared/schema.ts` were `.omit()`-based and ZERO
 * were `.pick()`-based, and filed the conversion as `#PS18` — NOT executed there.
 *
 * Converting 190 call sites (186 in shared/schema.ts + 4 in
 * shared/guest-invites-schema.ts — both drizzle-kit schema entry points per
 * CLAUDE.md's "Drizzle push has TWO schema entry points" note) is necessarily
 * incremental. This guard's ONE job is to stop the denylist count from GROWING
 * while that conversion proceeds — a ratchet, not a fixer, mirroring the tsc
 * baseline gate in .github/workflows/build.yml: the number only ever moves down,
 * and coming in UNDER the recorded baseline fails too (with the instruction to
 * lower the baseline in the same PR), so an improvement can never be spent as
 * silent headroom by a later, unrelated change.
 *
 * WHAT COUNTS.
 * For each `export const X = createInsertSchema(Table)...;` call site in the two
 * entry files, the FIRST chained modifier after `createInsertSchema(Table)`
 * determines its shape:
 *   - `.omit({...})`  → denylist  (the class this guard exists to stop growing)
 *   - `.pick({...})`  → allowlist (the #PS18 target shape — never restricted)
 *   - anything else (no modifier at all, or a chain that opens with `.extend(`,
 *     `.refine(`, etc. before ever narrowing the shape) → BARE. A bare call
 *     exposes every column with no omission at all — strictly worse than an
 *     `.omit()` that at least hides something — so it is folded into the
 *     denylist bucket for ratchet purposes, never treated as ambiguous or safe.
 * A schema derived by calling `.pick()`/`.omit()` on an ALREADY-DEFINED insert
 * schema (e.g. `createBookingRequestSchema = insertServiceBookingSchema.pick({...})`,
 * the ruling-46 example) is a DIFFERENT shape — it does not match
 * `= createInsertSchema(...)` at all — and is out of this guard's scope by design
 * (see NEGATIVE SPACE below).
 *
 * RATCHET SEMANTICS (mirrors the tsc-baseline job in build.yml):
 *   denylist count > OMIT_BASELINE  → FAIL: net-new omit/bare schema, must be .pick()
 *   denylist count < OMIT_BASELINE  → FAIL: improvement not locked in, lower the baseline
 *   denylist count == OMIT_BASELINE → PASS
 *
 * OMIT_BASELINE measured 2026-08-07 against shared/schema.ts (186 denylist calls,
 * matching ruling 46's own count exactly — no drift since that audit) +
 * shared/guest-invites-schema.ts (4 denylist calls, 0 bare) = 190. Zero .pick()-based
 * createInsertSchema calls exist anywhere yet; the first #PS18 conversion PR lowers
 * this number and must edit OMIT_BASELINE in the same PR (see the FAIL message).
 *
 * Node built-ins only — no npm ci needed. Self-test: --self-test
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Both drizzle-kit schema entry points (drizzle.config.ts `schema` array) — see
// CLAUDE.md "Drizzle push has TWO schema entry points — do not collapse to one".
const ENTRY_FILES = ['shared/schema.ts', 'shared/guest-invites-schema.ts'];

// 2026-08-07: 186 (shared/schema.ts) + 4 (shared/guest-invites-schema.ts) = 190,
// all .omit()-based, 0 bare, 0 .pick()-based. Matches ruling 46's own count on
// shared/schema.ts exactly (186/186 omit, 0 pick) — no drift since that audit.
const OMIT_BASELINE = 190;

// ─── Parser ───────────────────────────────────────────────────────────────────
// Same non-greedy call-to-semicolon shape as scripts/check-money-endpoints.cjs's
// insert-schema pass, so this guard parses the real file the same way the money
// guard already proves works on it (chained calls, multiline object literals).
const SCHEMA_CALL_RE = /export const (\w+)\s*=\s*createInsertSchema\((\w+)\)([\s\S]*?);\n/g;

/**
 * @param {string} text file contents
 * @returns {{name:string, table:string, kind:'omit'|'pick'|'bare'}[]}
 */
function classifySchemas(text) {
  const out = [];
  let m;
  // Reset lastIndex in case a regex literal with /g state leaked across calls.
  SCHEMA_CALL_RE.lastIndex = 0;
  while ((m = SCHEMA_CALL_RE.exec(text))) {
    const [, name, table, chain] = m;
    const trimmed = chain.replace(/^\s+/, '');
    let kind = 'bare';
    if (trimmed.startsWith('.omit(')) kind = 'omit';
    else if (trimmed.startsWith('.pick(')) kind = 'pick';
    out.push({ name, table, kind });
  }
  return out;
}

/**
 * Ratchet verdict, factored out so the self-test can drive it directly with
 * synthetic counts instead of real files.
 * @param {number} denylistCount
 * @param {number} baseline
 */
function ratchetVerdict(denylistCount, baseline) {
  if (denylistCount > baseline) {
    return {
      status: 'fail',
      message:
        `net-new omit-based insert schema — new schemas must be .pick()-based ` +
        `allowlists (§19): denylist count ${denylistCount} > OMIT_BASELINE ${baseline}.`,
    };
  }
  if (denylistCount < baseline) {
    return {
      status: 'fail',
      message:
        `denylist count improved to ${denylistCount} (baseline ${baseline}) — lock it in: ` +
        `lower OMIT_BASELINE to ${denylistCount} in scripts/check-omit-schema-ratchet.cjs ` +
        `in this same PR. The baseline only ever moves down; leftover headroom is how it ` +
        `creeps back up (mirrors the tsc-baseline gate in .github/workflows/build.yml).`,
    };
  }
  return { status: 'pass', message: `denylist count holds at ${denylistCount}.` };
}

// ─── Self-test (`--self-test`) — committed fixtures, ledger-lint precedent (§18d) ───
// A guard whose predicate is wrong passes truthfully forever. These are synthetic
// strings, never files on disk the real scan would see.
function selfTest() {
  let failures = 0;
  const check = (desc, cond) => {
    if (!cond) {
      failures++;
      console.error(`SELF-TEST FAIL: ${desc}`);
    }
  };

  // ── Shape classification ──────────────────────────────────────────────────
  const omitSingleLine =
    'export const insertFooSchema = createInsertSchema(foo).omit({ id: true, createdAt: true });\n';
  const pickSingleLine =
    'export const insertBarSchema = createInsertSchema(bar).pick({ id: true, name: true });\n';
  const bareNoModifier = 'export const insertBazSchema = createInsertSchema(baz);\n';
  const omitMultiline = [
    'export const insertQuxSchema = createInsertSchema(qux).omit({',
    '  id: true,',
    '  createdAt: true,',
    '  updatedAt: true,',
    '});',
    '',
  ].join('\n');
  const pickMultiline = [
    'export const createQuxRequestSchema = createInsertSchema(qux).pick({',
    '  serviceId: true,',
    '  tripId: true,',
    '});',
    '',
  ].join('\n');
  // Chained beyond the first modifier — the FIRST modifier still governs the shape
  // (the ruling-46 insertProviderServiceSchema real-file shape: .omit({...}).extend({...})).
  const omitThenExtend =
    'export const insertQuux = createInsertSchema(quux).omit({ id: true }).extend({ extra: z.string() });\n';
  // A chain that opens with something other than omit/pick before ever narrowing —
  // must be classified bare, not silently treated as safe.
  const bareThenRefine =
    'export const insertCorge = createInsertSchema(corge).refine((v) => v.ok, "bad");\n';

  const r1 = classifySchemas(omitSingleLine);
  check('single-line .omit() classified omit', r1.length === 1 && r1[0].kind === 'omit' && r1[0].table === 'foo');

  const r2 = classifySchemas(pickSingleLine);
  check('single-line .pick() classified pick', r2.length === 1 && r2[0].kind === 'pick' && r2[0].table === 'bar');

  const r3 = classifySchemas(bareNoModifier);
  check('bare call (no modifier) classified bare', r3.length === 1 && r3[0].kind === 'bare' && r3[0].table === 'baz');

  const r4 = classifySchemas(omitMultiline);
  check('multiline chained .omit() classified omit', r4.length === 1 && r4[0].kind === 'omit');

  const r5 = classifySchemas(pickMultiline);
  check('multiline chained .pick() classified pick', r5.length === 1 && r5[0].kind === 'pick');

  const r6 = classifySchemas(omitThenExtend);
  check('.omit().extend() still classified omit (first modifier governs)', r6.length === 1 && r6[0].kind === 'omit');

  const r7 = classifySchemas(bareThenRefine);
  check('.refine()-first (no omit/pick) classified bare', r7.length === 1 && r7[0].kind === 'bare');

  // A schema DERIVED from another insert schema (ruling 46's createBookingRequestSchema
  // shape: `X = insertFooSchema.pick({...})`) must NOT match at all — it isn't a
  // `createInsertSchema(...)` call site, and is explicitly out of this guard's scope.
  const derivedPick =
    'export const createFooRequestSchema = insertFooSchema.pick({ id: true, tripId: true });\n';
  const r8 = classifySchemas(derivedPick);
  check('schema derived via .pick() on another insert schema is NOT counted here', r8.length === 0);

  // Multiple call sites in one file, mixed shapes, parsed independently.
  const mixed = omitSingleLine + pickSingleLine + bareNoModifier + omitMultiline;
  const r9 = classifySchemas(mixed);
  check(
    'mixed multi-schema file parses all four independently',
    r9.length === 4 &&
      r9.filter((x) => x.kind === 'omit').length === 2 &&
      r9.filter((x) => x.kind === 'pick').length === 1 &&
      r9.filter((x) => x.kind === 'bare').length === 1,
  );

  // ── Ratchet verdict — both FAIL directions plus the PASS case ────────────
  const up = ratchetVerdict(191, 190);
  check('count > baseline FAILs as net-new', up.status === 'fail' && up.message.includes('net-new'));

  const down = ratchetVerdict(189, 190);
  check('count < baseline FAILs as unlocked improvement', down.status === 'fail' && down.message.includes('lower OMIT_BASELINE'));

  const level = ratchetVerdict(190, 190);
  check('count == baseline PASSes', level.status === 'pass');

  if (failures) {
    console.error(`${failures} self-test failure(s).`);
    process.exit(1);
  }
  console.log(
    `self-test OK (9 parser fixtures: omit/pick/bare single-line + multiline, chained-modifier ` +
    `precedence, derived-schema exclusion, mixed-file independence; 3 ratchet-verdict fixtures: ` +
    `net-new FAIL, unlocked-improvement FAIL, holds-at-baseline PASS)`,
  );
  process.exit(0);
}
if (process.argv.includes('--self-test')) selfTest();

// ─── Real scan ────────────────────────────────────────────────────────────────
const perFile = [];
let allSchemas = [];
for (const rel of ENTRY_FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`❌ omit-schema-ratchet guard: expected entry file missing: ${rel}`);
    process.exit(1);
  }
  const text = fs.readFileSync(abs, 'utf8');
  const schemas = classifySchemas(text);
  perFile.push({ rel, schemas });
  allSchemas = allSchemas.concat(schemas);
}

const omitCount = allSchemas.filter((s) => s.kind === 'omit').length;
const bareCount = allSchemas.filter((s) => s.kind === 'bare').length;
const pickCount = allSchemas.filter((s) => s.kind === 'pick').length;
const denylistCount = omitCount + bareCount; // bare folds into the denylist bucket — see header.

const verdict = ratchetVerdict(denylistCount, OMIT_BASELINE);

console.log(
  `omit-schema-ratchet: scanned ${ENTRY_FILES.length} entry file(s), ${allSchemas.length} ` +
  `createInsertSchema(...) call site(s) — ${omitCount} .omit(), ${bareCount} bare (no modifier), ` +
  `${pickCount} .pick(). Denylist total (omit+bare) = ${denylistCount}; OMIT_BASELINE = ${OMIT_BASELINE}.`,
);
for (const f of perFile) {
  const o = f.schemas.filter((s) => s.kind === 'omit').length;
  const b = f.schemas.filter((s) => s.kind === 'bare').length;
  const p = f.schemas.filter((s) => s.kind === 'pick').length;
  console.log(`   ${f.rel}: ${f.schemas.length} call site(s) — ${o} omit, ${b} bare, ${p} pick`);
}
if (bareCount) {
  console.log('   BARE call sites (no .omit()/.pick() at all — exposes every column, worst case):');
  for (const s of allSchemas.filter((x) => x.kind === 'bare')) console.log(`     ${s.name} (table ${s.table})`);
}

if (verdict.status === 'fail') {
  console.error(`❌ omit-schema-ratchet guard FAILED: ${verdict.message}`);
  process.exit(1);
}

console.log(`✅ omit-schema-ratchet guard: ${verdict.message}`);
console.log(
  '   NEGATIVE SPACE (§18d — what this predicate does NOT cover):\n' +
  '   · Only counts SHAPES (.omit() vs .pick() vs bare) at the createInsertSchema(...) call site —\n' +
  '     it never checks whether the OMITTED FIELD LIST is correct, or whether a .pick()\'s field list\n' +
  '     is the right allowlist. A schema can be .pick()-based and still leak a privileged column if\n' +
  '     that column is deliberately (or mistakenly) picked; this guard only proves the SHAPE moved.\n' +
  '   · Scoped to the two drizzle-kit schema entry files only (shared/schema.ts,\n' +
  '     shared/guest-invites-schema.ts). A hand-written zod object, or an insert schema defined in\n' +
  '     any other file, is entirely outside it — the same blind spot check-money-endpoints.cjs\n' +
  '     already states for its own schema-mediated pass.\n' +
  '   · A schema DERIVED from an existing insert schema via `.pick()`/`.omit()` on the SCHEMA VARIABLE\n' +
  '     (not on `createInsertSchema(...)` directly — e.g. ruling 46\'s `createBookingRequestSchema =\n' +
  '     insertServiceBookingSchema.pick({...})`) does not match this guard\'s call-site pattern and is\n' +
  '     not counted at all, in either direction.\n' +
  '   · This guard does not know whether a schema is ever `.parse()`d from a request body — that\n' +
  '     reachability judgment stays with check-money-endpoints.cjs\'s schema-mediated pass. A schema\n' +
  '     that is never client-reachable ratchets identically to one that is.\n' +
  '   · It is a COUNT ratchet, not an identity ratchet: converting one omit schema to pick while adding\n' +
  '     a new bare one nets to the same total and PASSES — it proves the AGGREGATE never grows, not\n' +
  '     that any specific named schema was the one converted.',
);
