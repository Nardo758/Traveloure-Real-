#!/usr/bin/env node
/**
 * check-roles-needed-reachability.cjs — every role an occasion NAMES must be REACHABLE.
 *
 * Ledger `2026-09-04-roles-needed`, CLAUDE.md Locked Decision 31. Node built-ins only — no npm ci,
 * no DB, so it runs as a fast standalone CI job.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `experience_types.roles_needed` names disciplines as `service_categories.category_key` values.
 * Migration 034 is the SOLE assigner of `category_key` (24 rows) and therefore the only authority
 * on which keys exist. A `roles_needed` entry naming a key no category carries would render a hire
 * prompt that resolves to no provider — a dead path that LOOKS live.
 *
 * That is the same failure `check-category-reachability.cjs` exists for (ledger
 * `2026-09-04-taxonomy-reconcile`), reached from the other direction: there, a category row without
 * a key could not be the target of an offering; here, a key without a category row cannot be the
 * target of a hire. It has already bitten twice on the other side — `custom-other` (migrations 189
 * + 208 had to repair it on disk, and the wizard's Publish button stayed disabled until they did)
 * and the ten `services-*` experience-bundle rows.
 *
 * THE RULES
 * ─────────
 *   1. Every key in `OCCASION_ROLE_KEYS` (shared/schema.ts) is assigned by migration 034.
 *   2. Every key seeded in `rolesNeeded:` (server/seeds/experience-template-tabs.seed.ts) is in
 *      `OCCASION_ROLE_KEYS` — so the enum cannot be bypassed by editing the seeder alone.
 *
 * NEGATIVE SPACE — what this guard does NOT check (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • It checks that a key is REACHABLE, never that any provider has actually LISTED in that
 *     category — still less in a given market. A market with no florist is a §13 honesty problem
 *     for the reader ("no florists listed here yet"), not a taxonomy error, and this guard is
 *     deliberately silent about it.
 *   • It does not judge whether the roles chosen for an occasion are the RIGHT ones. That is
 *     editorial content, ratified with the ledger row, not something a grep can hold.
 *   • It reads migration 034 as text. If 034 is ever superseded by a later migration that assigns
 *     `category_key`, this guard must be taught about it — a superseding migration is exactly the
 *     kind of change that should update the AUTHORITY list below.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const AUTHORITY = path.join(ROOT, "server/migrations/034_phase1_reconcile_service_categories.sql");
const SCHEMA = path.join(ROOT, "shared/schema.ts");
const SEED = path.join(ROOT, "server/seeds/experience-template-tabs.seed.ts");

/** Every `category_key` migration 034 assigns. Field 8 of each VALUES tuple, first item on its line. */
function authorityKeys(sql) {
  const keys = new Set();
  const lines = sql.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s{2}\('/.test(lines[i])) continue; // tuple opener
    const keyLine = lines[i + 3];
    if (!keyLine) continue;
    const m = keyLine.match(/^\s*'([a-z_]+)'\s*,/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/** The OCCASION_ROLE_KEYS array literal in shared/schema.ts. */
function enumKeys(ts) {
  const m = ts.match(/export const OCCASION_ROLE_KEYS = \[([\s\S]*?)\] as const;/);
  if (!m) return null;
  return new Set([...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
}

/** Every key appearing in a `rolesNeeded: [...]` literal in the seeder. */
function seededKeys(ts) {
  const keys = new Set();
  for (const m of ts.matchAll(/rolesNeeded:\s*\[([^\]]*)\]/g)) {
    for (const k of m[1].matchAll(/"([a-z_]+)"/g)) keys.add(k[1]);
  }
  return keys;
}

function check(sql, schemaTs, seedTs) {
  const errors = [];
  const authority = authorityKeys(sql);
  if (authority.size === 0) {
    errors.push("Parsed ZERO category_key values from migration 034 — the parser is broken, not the data. Refusing to pass vacuously.");
    return errors;
  }
  const declared = enumKeys(schemaTs);
  if (declared === null) {
    errors.push("Could not find `export const OCCASION_ROLE_KEYS = [...] as const;` in shared/schema.ts.");
    return errors;
  }
  if (declared.size === 0) {
    errors.push("OCCASION_ROLE_KEYS is empty — refusing to pass vacuously.");
    return errors;
  }
  for (const k of declared) {
    if (!authority.has(k)) {
      errors.push(`OCCASION_ROLE_KEYS names "${k}", which migration 034 does not assign as a category_key. A hire prompt for it would resolve to no provider.`);
    }
  }
  for (const k of seededKeys(seedTs)) {
    if (!declared.has(k)) {
      errors.push(`The seeder's rolesNeeded names "${k}", which is not in OCCASION_ROLE_KEYS. Editing the seeder alone cannot widen the value set.`);
    }
  }
  return errors;
}

// ── committed self-test fixtures (§18d: a predicate change ships with fixtures) ─────────────────
const FIX_SQL = [
  "INSERT INTO service_categories",
  "  (name, slug, description, category_type, verification_required, is_active, sort_order,",
  "   category_key, source_type, launch_tier, commission_band_key, insurance_band,",
  "   risk_profile, requires_background_check)",
  "VALUES",
  "  ('Floral & Decoration',  'floral-decoration',",
  "   'Florists',",
  "   'service_provider', true, true, 12,",
  "   'florist', 'platform_provider', 'core', 'commercial', 2, 'low', false),",
  "",
  "  ('Caterer',              'caterer',",
  "   'Caterers',",
  "   'service_provider', true, true, 13,",
  "   'caterer', 'platform_provider', 'core', 'commercial', 2, 'low', false);",
].join("\n");

function selfTest() {
  const okSchema = 'export const OCCASION_ROLE_KEYS = [\n  "florist",\n  "caterer",\n] as const;';
  const okSeed = 'rolesNeeded: ["florist", "caterer"],';
  const failSchema = 'export const OCCASION_ROLE_KEYS = [\n  "florist",\n  "wedding_planner",\n] as const;';
  const failSeed = 'rolesNeeded: ["florist", "dj"],';

  const cases = [
    ["clean case passes", () => check(FIX_SQL, okSchema, okSeed).length === 0],
    ["unreachable enum key is caught", () => check(FIX_SQL, failSchema, okSeed).some((e) => e.includes("wedding_planner"))],
    ["seeded key outside the enum is caught", () => check(FIX_SQL, okSchema, failSeed).some((e) => e.includes('"dj"'))],
    ["broken 034 parse fails loudly, not vacuously", () => check("-- no tuples here", okSchema, okSeed).some((e) => e.includes("ZERO category_key"))],
    ["missing enum declaration is caught", () => check(FIX_SQL, "// no enum", okSeed).some((e) => e.includes("OCCASION_ROLE_KEYS"))],
    ["empty enum fails vacuity check", () => check(FIX_SQL, "export const OCCASION_ROLE_KEYS = [\n] as const;", okSeed).some((e) => e.includes("empty"))],
    ["034 parser finds both fixture keys", () => { const k = authorityKeys(FIX_SQL); return k.has("florist") && k.has("caterer") && k.size === 2; }],
  ];
  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch (e) { ok = false; }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`\nroles-needed guard SELF-TEST FAILED — ${failed} fixture case(s). The predicate is wrong; fix it before trusting a green run.`);
    process.exit(1);
  }
  console.log(`\nroles-needed guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  for (const f of [AUTHORITY, SCHEMA, SEED]) {
    if (!fs.existsSync(f)) {
      console.error(`roles-needed guard: required file missing — ${path.relative(ROOT, f)}`);
      process.exit(1);
    }
  }
  const errors = check(
    fs.readFileSync(AUTHORITY, "utf8"),
    fs.readFileSync(SCHEMA, "utf8"),
    fs.readFileSync(SEED, "utf8"),
  );
  if (errors.length > 0) {
    console.error("roles-needed reachability guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error("\nEvery role an occasion names must be a category_key migration 034 assigns.");
    console.error("See CLAUDE.md Locked Decision 31 / ledger 2026-09-04-roles-needed.");
    process.exit(1);
  }
  console.log("roles-needed reachability guard: OK — every named role resolves to a migration-034 category_key.");
}

main();
