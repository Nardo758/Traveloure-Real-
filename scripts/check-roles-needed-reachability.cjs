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
 * The migrations that ASSIGN `category_key` are therefore the only authority on which keys exist.
 * A `roles_needed` entry naming a key no category carries would render a hire prompt that resolves
 * to no provider — a dead path that LOOKS live.
 *
 * That is the same failure `check-category-reachability.cjs` exists for (ledger
 * `2026-09-04-taxonomy-reconcile`), reached from the other direction: there, a category row without
 * a key could not be the target of an offering; here, a key without a category row cannot be the
 * target of a hire. It has already bitten twice on the other side — `custom-other` (migrations 189
 * + 208 had to repair it on disk, and the wizard's Publish button stayed disabled until they did)
 * and the ten `services-*` experience-bundle rows.
 *
 * THE AUTHORITY IS A REGISTRY, NOT ONE FILENAME (ledger `2026-09-04-venue-category`)
 * ──────────────────────────────────────────────────────────────────────────────────
 * This guard used to hardcode `034_phase1_reconcile_service_categories.sql`, which was correct for
 * exactly as long as 034 was the only migration assigning a `category_key`. Migration 285
 * (`venue`) is the second. Both taxonomy guards now read ONE committed list —
 * `TAXONOMY_MIGRATIONS` in `scripts/lib/taxonomy-registry.cjs` — so "which files are the
 * authority" has a single home. A second copy of that list is the derivation-drift class §18
 * rule 1 names: the next category would have to be added twice, and forgetting either copy leaves
 * a guard reporting PASS while looking at half the taxonomy.
 *
 * THE RULES
 * ─────────
 *   1. Every key in `OCCASION_ROLE_KEYS` (shared/schema.ts) is assigned by SOME registry migration.
 *   2. Every key seeded in `rolesNeeded:` (server/seeds/experience-template-tabs.seed.ts) is in
 *      `OCCASION_ROLE_KEYS` — so the enum cannot be bypassed by editing the seeder alone.
 *   3. No `category_key` (or category slug) is claimed by two registry migrations. The registry is
 *      a UNION, not an override chain — enforced in the shared module, surfaced here. The ONE
 *      declared exception is a REPAIR entry (`TAXONOMY_REPAIRS`, ledger
 *      `2026-09-06-category-key-repair`): a file that re-writes another's pairs on databases where
 *      the first write never landed. It claims nothing, may not introduce or re-point a key, and is
 *      legal only because the registry DECLARES it — never because the file says so about itself.
 *
 * NEGATIVE SPACE — what this guard does NOT check (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • It checks that a key is REACHABLE, never that any provider has actually LISTED in that
 *     category — still less in a given market. A market with no florist is a §13 honesty problem
 *     for the reader ("no florists listed here yet"), not a taxonomy error, and this guard is
 *     deliberately silent about it.
 *   • It does not judge whether the roles chosen for an occasion are the RIGHT ones. That is
 *     editorial content, ratified with the ledger row, not something a grep can hold.
 *   • It reads the registry files as TEXT and never opens a database. A migration that assigns a
 *     `category_key` but is NOT listed in `TAXONOMY_MIGRATIONS` is invisible to it — which is the
 *     whole point of the registry being a deliberate, committed act.
 */

const fs = require("fs");
const path = require("path");
const { TAXONOMY_MIGRATIONS, collectTaxonomy } = require("./lib/taxonomy-registry.cjs");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA = path.join(ROOT, "shared/schema.ts");
const SEED = path.join(ROOT, "server/seeds/experience-template-tabs.seed.ts");

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

/**
 * @param {Array<{file: string, sql: string}>} sources — the registry files, in apply order.
 * @param {{ repairs?: Record<string, string> }} [options] — REPAIR declarations, passed straight
 *        through to `collectTaxonomy`; the real run uses the registry's own `TAXONOMY_REPAIRS`.
 */
function check(sources, schemaTs, seedTs, options = {}) {
  const errors = [];
  const taxonomy = collectTaxonomy(sources, options);
  // Registry-level failures (rule 3: duplicate key/slug across files; an unparseable registry
  // file) are reported first and are fatal — every rule below reads the union they describe.
  errors.push(...taxonomy.errors);
  const authority = taxonomy.keys;
  if (authority.size === 0) {
    errors.push("Parsed ZERO category_key values from the taxonomy registry — the parser is broken, not the data. Refusing to pass vacuously.");
    return errors;
  }
  if (errors.length > 0) return errors;
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
      errors.push(`OCCASION_ROLE_KEYS names "${k}", which no taxonomy-registry migration assigns as a category_key. A hire prompt for it would resolve to no provider.`);
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
//
// Two fixture FILES, because the authority is now a REGISTRY: `FIX_SQL_A` stands in for 034 and
// `FIX_SQL_B` for a later taxonomy migration such as 285. The cases below cover the three shapes
// the registry adds — a key present only in the SECOND file (must pass), a key in NEITHER file
// (must fail), and one key claimed by BOTH files (must fail).
const FIX_SQL_A = [
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

/** A SECOND registry migration — the 285 shape: one new category, ON CONFLICT DO NOTHING. */
const FIX_SQL_B = [
  "INSERT INTO service_categories",
  "  (name, slug, description, category_type, verification_required, is_active, sort_order,",
  "   category_key, source_type, launch_tier, commission_band_key, insurance_band,",
  "   risk_profile, requires_background_check)",
  "VALUES",
  "  ('Venues',               'venues',",
  "   'Event venues',",
  "   'service_provider', true, true, 105,",
  "   'venue', 'platform_provider', 'segment', 'moderate', 2, 'moderate', false)",
  "ON CONFLICT (slug) DO NOTHING;",
].join("\n");

/** The same key claimed twice across the registry — a taxonomy fork, and a hard failure. */
const FIX_SQL_B_DUP = FIX_SQL_B.replace("'venues'", "'venues-2'").replace("'Venues'", "'Venues (again)'");

const REGISTRY_AB = [
  { file: "fixture/034.sql", sql: FIX_SQL_A },
  { file: "fixture/285.sql", sql: FIX_SQL_B },
];

/**
 * A REPAIR of fixture A (ledger `2026-09-06-category-key-repair`): it re-assigns A's OWN pairs and
 * introduces nothing. Registered as a repair it must pass; registered as a plain authority the SAME
 * text must fail as a duplicate — that contrast is the fixture that proves the declaration, not the
 * file, is what makes a repair legal.
 */
const FIX_SQL_A_REPAIR = [
  "-- repair of fixture/034.sql: same pairs, written again for databases that missed them",
  "INSERT INTO service_categories",
  "  (name, slug, description, category_type, verification_required, is_active, sort_order,",
  "   category_key, source_type, launch_tier, commission_band_key, insurance_band,",
  "   risk_profile, requires_background_check)",
  "VALUES",
  "  ('Floral & Decoration',  'floral-decoration',",
  "   'Florists',",
  "   'service_provider', true, true, 12,",
  "   'florist', 'platform_provider', 'core', 'commercial', 2, 'low', false),",
  "  ('Caterer',              'caterer',",
  "   'Caterers',",
  "   'service_provider', true, true, 13,",
  "   'caterer', 'platform_provider', 'core', 'commercial', 2, 'low', false)",
  "ON CONFLICT DO NOTHING;",
].join("\n");

/** The same repair, but naming a key its target never carried — a second authority in disguise. */
const FIX_SQL_A_REPAIR_OUT_OF_SCOPE = FIX_SQL_A_REPAIR
  .replace("'Caterer'", "'Officiant'")
  .replace("'caterer',\n", "'officiant',\n")
  .replace("'caterer', 'platform_provider'", "'officiant', 'platform_provider'");

const REGISTRY_AB_REPAIR = [
  { file: "fixture/034.sql", sql: FIX_SQL_A },
  { file: "fixture/285.sql", sql: FIX_SQL_B },
  { file: "fixture/289.sql", sql: FIX_SQL_A_REPAIR },
];
const REPAIR_DECL = { "fixture/289.sql": "fixture/034.sql" };

function selfTest() {
  const okSchema = 'export const OCCASION_ROLE_KEYS = [\n  "florist",\n  "caterer",\n] as const;';
  const okSeed = 'rolesNeeded: ["florist", "caterer"],';
  const failSchema = 'export const OCCASION_ROLE_KEYS = [\n  "florist",\n  "wedding_planner",\n] as const;';
  const failSeed = 'rolesNeeded: ["florist", "dj"],';
  // A key that exists ONLY in the second registry migration — the whole point of the registry.
  const venueSchema = 'export const OCCASION_ROLE_KEYS = [\n  "florist",\n  "caterer",\n  "venue",\n] as const;';
  const venueSeed = 'rolesNeeded: ["florist", "venue"],';
  const onlyA = [{ file: "fixture/034.sql", sql: FIX_SQL_A }];

  const cases = [
    ["clean case passes", () => check(REGISTRY_AB, okSchema, okSeed).length === 0],
    ["unreachable enum key is caught", () => check(REGISTRY_AB, failSchema, okSeed).some((e) => e.includes("wedding_planner"))],
    ["seeded key outside the enum is caught", () => check(REGISTRY_AB, okSchema, failSeed).some((e) => e.includes('"dj"'))],
    ["broken registry parse fails loudly, not vacuously", () => check([{ file: "fixture/none.sql", sql: "-- no tuples here" }], okSchema, okSeed).some((e) => e.includes("REGISTRY PARSE"))],
    ["missing enum declaration is caught", () => check(REGISTRY_AB, "// no enum", okSeed).some((e) => e.includes("OCCASION_ROLE_KEYS"))],
    ["empty enum fails vacuity check", () => check(REGISTRY_AB, "export const OCCASION_ROLE_KEYS = [\n] as const;", okSeed).some((e) => e.includes("empty"))],
    ["registry parser finds both fixture files' keys", () => { const k = collectTaxonomy(REGISTRY_AB).keys; return k.has("florist") && k.has("caterer") && k.has("venue") && k.size === 3; }],
    // ── the three registry shapes (ledger `2026-09-04-venue-category`) ────────────────────────
    ["REGISTRY — a key present only in the SECOND migration is reachable", () => check(REGISTRY_AB, venueSchema, venueSeed).length === 0],
    ["REGISTRY — that same key is UNREACHABLE when the second migration is not registered", () => check(onlyA, venueSchema, venueSeed).some((e) => e.includes('"venue"'))],
    ["REGISTRY — a key in NEITHER migration is caught", () => check(REGISTRY_AB, 'export const OCCASION_ROLE_KEYS = [\n  "florist",\n  "ballroom",\n] as const;', okSeed).some((e) => e.includes("ballroom"))],
    ["REGISTRY — the SAME key claimed by BOTH migrations FAILS (a fork, not a union)", () => check([{ file: "fixture/034.sql", sql: FIX_SQL_A + "\n" + FIX_SQL_B }, { file: "fixture/285.sql", sql: FIX_SQL_B_DUP }], venueSchema, venueSeed).some((e) => e.includes("REGISTRY DUPLICATE") && e.includes('"venue"'))],
    // ── REPAIR entries (ledger `2026-09-06-category-key-repair`) ──────────────────────────────
    ["REPAIR — a declared repair re-assigning its target's own pairs PASSES", () => check(REGISTRY_AB_REPAIR, venueSchema, venueSeed, { repairs: REPAIR_DECL }).length === 0],
    ["REPAIR — the SAME file UNDECLARED is still a duplicate (the declaration is what makes it legal)", () => check(REGISTRY_AB_REPAIR, venueSchema, venueSeed, { repairs: {} }).some((e) => e.includes("REGISTRY DUPLICATE"))],
    ["REPAIR — a repair naming a key its target does not carry FAILS as out of scope", () => check([{ file: "fixture/034.sql", sql: FIX_SQL_A }, { file: "fixture/285.sql", sql: FIX_SQL_B }, { file: "fixture/289.sql", sql: FIX_SQL_A_REPAIR_OUT_OF_SCOPE }], venueSchema, venueSeed, { repairs: REPAIR_DECL }).some((e) => e.includes("REGISTRY REPAIR SCOPE") && e.includes("officiant"))],
    ["REPAIR — a repair whose TARGET is not registered FAILS", () => check([{ file: "fixture/285.sql", sql: FIX_SQL_B }, { file: "fixture/289.sql", sql: FIX_SQL_A_REPAIR }], venueSchema, venueSeed, { repairs: REPAIR_DECL }).some((e) => e.includes("REGISTRY REPAIR TARGET"))],
    ["REPAIR — a repair CLAIMS nothing: the union is unchanged by adding one", () => { const a = collectTaxonomy(REGISTRY_AB); const b = collectTaxonomy(REGISTRY_AB_REPAIR, { repairs: REPAIR_DECL }); return b.errors.length === 0 && a.keys.size === b.keys.size && [...a.keys].every((k) => b.keys.has(k)); }],
    ["REPAIR — an EMPTY repair file still fails REGISTRY PARSE, never passes vacuously", () => check([{ file: "fixture/034.sql", sql: FIX_SQL_A }, { file: "fixture/285.sql", sql: FIX_SQL_B }, { file: "fixture/289.sql", sql: "-- nothing here" }], venueSchema, venueSeed, { repairs: REPAIR_DECL }).some((e) => e.includes("REGISTRY PARSE"))],
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

  const registry = TAXONOMY_MIGRATIONS.map((rel) => path.join(ROOT, rel));
  for (const f of [...registry, SCHEMA, SEED]) {
    if (!fs.existsSync(f)) {
      console.error(`roles-needed guard: required file missing — ${path.relative(ROOT, f)}`);
      console.error("Every entry in TAXONOMY_MIGRATIONS (scripts/lib/taxonomy-registry.cjs) must exist on disk.");
      process.exit(1);
    }
  }
  const errors = check(
    TAXONOMY_MIGRATIONS.map((rel) => ({ file: rel, sql: fs.readFileSync(path.join(ROOT, rel), "utf8") })),
    fs.readFileSync(SCHEMA, "utf8"),
    fs.readFileSync(SEED, "utf8"),
  );
  if (errors.length > 0) {
    console.error("roles-needed reachability guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error("\nEvery role an occasion names must be a category_key some TAXONOMY_MIGRATIONS entry assigns.");
    console.error("See CLAUDE.md Locked Decision 31 / ledger 2026-09-04-roles-needed, 2026-09-04-venue-category.");
    process.exit(1);
  }
  console.log(
    `roles-needed reachability guard: OK — every named role resolves to a category_key assigned by ` +
      `one of ${TAXONOMY_MIGRATIONS.length} taxonomy-registry migration(s).`
  );
}

main();
