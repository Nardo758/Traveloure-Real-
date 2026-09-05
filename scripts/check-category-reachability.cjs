#!/usr/bin/env node
/**
 * check-category-reachability.cjs — every SEEDED service category must be REACHABLE.
 *
 * Ledger 2026-09-04-taxonomy-reconcile. Node built-ins only — no npm ci, no DB.
 *
 * WHY THIS EXISTS
 * ───────────────
 * There are THREE writers of `service_categories` rows and the code assumes two:
 *
 *   1. THE TAXONOMY REGISTRY — `TAXONOMY_MIGRATIONS` in `scripts/lib/taxonomy-registry.cjs`
 *      (migration 034's 24 rows, plus migration 285's `venue`). These are the only migrations that
 *      assign `category_key`, the join key every offering-driven reader uses
 *      (service_offering_types.category_key → the provider offering picker's group headers in
 *      client/src/components/ServiceForm.tsx, /api/service-categories/provider-counts, and the
 *      /earn role partition in client/src/lib/earn-roles.ts). Until ledger
 *      `2026-09-04-venue-category` this guard hardcoded 034's filename; the registry replaced that
 *      so the two taxonomy guards cannot drift apart on which files are authoritative.
 *   2. server/seed-categories.ts — runs at BOOT, after runMigrations().
 *   3. POST /api/admin/seed-categories (server/routes/admin.routes.ts) — an admin-triggered
 *      second copy of the same shape.
 *
 * Both TS seeders create a row when its slug is absent, and neither emitted a `category_key`.
 * On a fresh database that produced rows that only a raw category <Select> can reach and that no
 * offering, picker group, provider count or /earn card can — a dead taxonomy that looks live.
 * It has bitten twice already: `custom-other` (migrations 189 + 208 had to repair it on disk, and
 * the wizard's Publish button was permanently disabled until they did), and the ten
 * "services-*" experience-bundle rows (ledger 2026-09-04-taxonomy-reconcile).
 *
 * THE TWO RULES
 * ─────────────
 *  R0 REGISTRY INTEGRITY. Every file in `TAXONOMY_MIGRATIONS` parses, and no `category_key` (nor
 *     category slug) is claimed by two of them. The registry is a UNION, not an override chain:
 *     two files claiming one key means the last-applied one silently wins.
 *  R1 KEYED-OR-DECLARED. Every slug a seeder can create must end up carrying a `category_key` —
 *     either from the seeder literal itself or from a registry migration's upsert — UNLESS it is named in
 *     KEYLESS_BY_DECISION below with a reason. That list is migration 034's own documented
 *     "outside brief taxonomy" set; adding to it is a deliberate act, which is the point.
 *  R2 NAMESPACE. A seeded category slug may never collide with a BUNDLE key in
 *     `servicesCategoryMapping` (shared/constants/providerCategories.ts). Those keys name a
 *     fan-out to several real discipline slugs (`primarySlugs`), not a category — seeding a row
 *     behind one is what created the orphans. R2 fails even if the slug were also allowlisted.
 *  R3 OFFERING JOIN. Every `category_key` a `service_offering_types` seed row points at must be
 *     assigned to some category by migration 034 or a seeder literal — the source-level mirror of
 *     migration 040's DB gate, which only runs once and so never sees later offering seeds.
 *
 * USAGE
 * ─────
 *   node scripts/check-category-reachability.cjs
 *   node scripts/check-category-reachability.cjs --self-test    # predicate fixtures (§18d)
 *
 * Exit 0 = every seeded category is reachable. Exit 1 = a rule failed.
 *
 * NEGATIVE SPACE — what this guard does NOT cover (§18d; green means green-within-these-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • Rows already ON DISK. This is a source guard; it never opens a database. A key-less row an
 *     admin created through POST /api/service-categories, or one seeded before this guard landed,
 *     is invisible to it. Drift on disk is the DB-side gate's job (migration 040) and the
 *     service-offering-types-gate workflow's HTTP count check.
 *   • `expert_offering_types` / `expert_neighborhoods` — a different catalog entirely, and
 *     CLAUDE.md §4 forbids merging the two. This guard is only about `service_categories`.
 *   • Whether a category with a key has any OFFERINGS. A keyed category with zero offering rows is
 *     legal (the affiliate aff_* rows work that way) and silently absent from the picker.
 *   • A migration that assigns a `category_key` but is NOT listed in `TAXONOMY_MIGRATIONS`. The
 *     registry is a deliberate, committed act; an unregistered assigner is invisible here on
 *     purpose — and `check-roles-needed-reachability.cjs` fails the moment a role names one of its
 *     keys, which is the pressure that keeps the registry honest.
 *   • Migration-side `UPDATE service_categories SET category_key = …` backfills keyed by NAME
 *     (189/208 do this for Custom / Other). Both seeder literals already carry that key, so the
 *     row is covered by R1 without parsing them.
 *   • Anything about a row's BAND, sort order, or copy.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { TAXONOMY_MIGRATIONS, collectTaxonomy } = require("./lib/taxonomy-registry.cjs");

const REPO = path.resolve(__dirname, "..");

const BUNDLE_KEYS_FILE = "shared/constants/providerCategories.ts";
const MIGRATIONS_DIR = "server/migrations";

/** Files whose `{ name: …, slug: … }` category literals create rows. */
/**
 * Drift alarm: the two seeders carry ~16 and ~28 category literals. A parse that suddenly matches
 * far fewer means the literal shape changed and the guard has gone blind — fail rather than pass.
 */
const MIN_EXPECTED_SEEDED = 35;

const SEEDER_FILES = [
  "server/seed-categories.ts",
  "server/routes/admin.routes.ts",
];

/**
 * Slugs a seeder may create WITHOUT a `category_key`, each with the reason.
 *
 * This is migration 034's own documented "14 legacy rows UNTOUCHED (categoryKey stays NULL —
 * outside brief taxonomy)" set, plus `visa-assistance` (same posture, seeded later). They are
 * reachable as DISCIPLINE slugs: the raw category <Select>, `getServiceCategoryBySlug`, and the
 * `primarySlugs` fan-out in shared/constants/providerCategories.ts all address them by slug. They
 * are NOT reachable from the offering picker, and that is the accepted trade — they carry no
 * offerings by design.
 *
 * ADDING TO THIS LIST IS A TAXONOMY DECISION (CLAUDE.md "Coordination Prevention"): a new key-less
 * category is invisible to the provider offering picker, /earn and provider-counts. If you want the
 * row to be reachable there, give it a `category_key` and seed its offering types instead.
 */
const KEYLESS_BY_DECISION = new Map([
  ["taskrabbit-services", "034: outside brief taxonomy; reachable by slug (providerCategories primarySlugs)"],
  ["health-wellness", "034: outside brief taxonomy; reachable by slug (providerCategories primarySlugs)"],
  ["pets-animals", "034: outside brief taxonomy; discipline slug only"],
  ["technology-connectivity", "034: outside brief taxonomy; reachable by slug (providerCategories primarySlugs)"],
  ["language-translation", "034: outside brief taxonomy; reachable by slug (providerCategories primarySlugs)"],
  ["specialty-services", "034: outside brief taxonomy; reachable by slug (providerCategories primarySlugs)"],
  ["music-performance", "034: outside brief taxonomy; admin-seeder only. DJ/band supply is sold via the `entertainer` offering under category_key `entertainment` (migration 038), so this row needs no key"],
  ["cultural-educational", "034: outside brief taxonomy; admin-seeder only"],
  ["companionship-assistance", "034: outside brief taxonomy; admin-seeder only"],
  ["attire-fashion", "034: outside brief taxonomy; admin-seeder only"],
  ["safety-security", "034: outside brief taxonomy; admin-seeder only"],
  ["business-professional", "034: outside brief taxonomy; admin-seeder only"],
  ["visa-assistance", "boot-seeder only; same posture as the 034 legacy set — discipline slug, no offerings"],
]);

// ── Parsers ───────────────────────────────────────────────────────────────────────────────────

/**
 * Seeder category literals → [{ slug, hasKey }].
 *
 * Both seeders write ONE category object per LINE (`{ name: "…", slug: "…", … }`), so the parse is
 * line-scoped: a multi-line object regex would have to skip the inner `priceRange: { … }` brace and
 * would silently under-match — which is exactly the kind of quiet miss this guard exists to prevent.
 * MIN_EXPECTED_SEEDED below is the drift alarm if that convention ever changes.
 */
function parseSeederCategories(tsText) {
  const out = [];
  for (const line of tsText.split("\n")) {
    const m = line.match(/\{\s*name:\s*"[^"]*"\s*,\s*slug:\s*"([a-z0-9-]+)"/);
    if (!m) continue;
    out.push({ slug: m[1], hasKey: /\bcategoryKey\s*:\s*"[a-z0-9_]+"/.test(line) });
  }
  return out;
}

/** `servicesCategoryMapping` keys → the BUNDLE-key namespace. */
function parseBundleKeys(tsText) {
  const start = tsText.indexOf("export const servicesCategoryMapping");
  if (start === -1) return new Set();
  const block = tsText.slice(start, tsText.indexOf("\n};", start));
  const keys = new Set();
  for (const m of block.matchAll(/^\s{2}"([a-z0-9-]+)"\s*:\s*\{/gm)) keys.add(m[1]);
  return keys;
}

/** Every category_key a service_offering_types seed row points at. */
function parseOfferingCategoryKeys(sqlText) {
  const keys = new Set();
  for (const block of sqlText.matchAll(/INSERT\s+INTO\s+service_offering_types[\s\S]*?VALUES([\s\S]*?);/gi)) {
    for (const row of block[1].matchAll(/\(\s*'[a-z0-9_]+'\s*,\s*'([a-z0-9_]+)'\s*,/g)) keys.add(row[1]);
  }
  return keys;
}

/** category_key values assigned by a seeder literal (a category line that carries the field). */
function parseSeederLiteralKeys(tsText) {
  const keys = new Set();
  for (const line of tsText.split("\n")) {
    if (!/\bslug:\s*"[a-z0-9-]+"/.test(line)) continue;
    const m = line.match(/\bcategoryKey\s*:\s*"([a-z0-9_]+)"/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/**
 * The taxonomy registry, read off disk → `{ slugs, keys, rows, errors }`.
 *
 * ONE implementation of "which migrations assign a `category_key`", shared with
 * `check-roles-needed-reachability.cjs` — a second copy of that list is the derivation-drift class
 * §18 rule 1 names.
 */
function readRegistry(readFn) {
  return collectTaxonomy(TAXONOMY_MIGRATIONS.map((rel) => ({ file: rel, sql: readFn(rel) })));
}

// ── Rules ─────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ seeded: Array<{file:string, slug:string, hasKey:boolean}>, keyedByMigration:Set<string>,
 *           bundleKeys:Set<string>, offeringKeys:Set<string>, assignedKeys:Set<string>,
 *           allowlist:Map<string,string> }} input
 */
function evaluate(input) {
  const errs = [];
  const allowlist = input.allowlist || KEYLESS_BY_DECISION;

  // R0 — registry integrity (parse + no key/slug claimed twice). Reported first because every
  // rule below reads the union the registry describes.
  for (const e of input.registryErrors || []) errs.push(`R0 REGISTRY — ${e}`);

  for (const row of input.seeded) {
    // R2 first — a bundle-key collision is a failure even when allowlisted.
    if (input.bundleKeys.has(row.slug)) {
      errs.push(
        `R2 NAMESPACE — ${row.file}: category slug "${row.slug}" collides with a BUNDLE key in ` +
          `${BUNDLE_KEYS_FILE} (servicesCategoryMapping). That key names a fan-out to several real ` +
          `discipline slugs, not a category; seeding a row behind it creates an unreachable orphan.`
      );
      continue;
    }
    // R1
    const keyed = row.hasKey || input.keyedByMigration.has(row.slug);
    if (!keyed && !allowlist.has(row.slug)) {
      errs.push(
        `R1 KEYED-OR-DECLARED — ${row.file}: category slug "${row.slug}" is seeded with no ` +
          `category_key (neither in the literal nor by a taxonomy-registry migration). Every offering-driven reader ` +
          `joins on that key, so the row can never appear in the provider offering picker, ` +
          `/api/service-categories/provider-counts or /earn. Give it a category_key and seed its ` +
          `service_offering_types rows, or add it to KEYLESS_BY_DECISION with a reason.`
      );
    }
  }

  // R3
  for (const key of input.offeringKeys) {
    if (!input.assignedKeys.has(key)) {
      errs.push(
        `R3 OFFERING JOIN — a service_offering_types seed row points at category_key "${key}", but ` +
          `no seeded category carries it (taxonomy-registry upserts + seeder literals). The picker would ` +
          `render a prettified key as a group header for a category that does not exist.`
      );
    }
  }
  return errs;
}

// ── Self-test (§18d) ──────────────────────────────────────────────────────────────────────────

/**
 * Two stand-in registry migrations: `A` is the 034 shape (many rows, ON CONFLICT DO UPDATE) and
 * `B` the 285 shape (one row, ON CONFLICT DO NOTHING). They are fed through the REAL shared parser,
 * so a parser that goes blind fails these fixtures instead of passing vacuously.
 */
const REGISTRY_FIXTURE_A = [
  "-- header prose that mentions INSERT INTO service_categories and ON CONFLICT (slug)",
  "INSERT INTO service_categories",
  "  (name, slug, description, category_type, verification_required, is_active, sort_order,",
  "   category_key, source_type, launch_tier, commission_band_key, insurance_band,",
  "   risk_profile, requires_background_check)",
  "VALUES",
  "  ('Floral & Decoration', 'floral-decoration',",
  "   'Florists',",
  "   'service_provider', true, true, 12,",
  "   'florist', 'platform_provider', 'core', 'commercial', 2, 'low', false),",
  "  ('Caterer', 'caterer',",
  "   'Caterers',",
  "   'service_provider', true, true, 13,",
  "   'caterer', 'platform_provider', 'core', 'commercial', 2, 'low', false)",
  "ON CONFLICT (slug) DO UPDATE SET category_key = EXCLUDED.category_key;",
].join("\n");

const REGISTRY_FIXTURE_B = [
  "INSERT INTO service_categories",
  "  (name, slug, description, category_type, verification_required, is_active, sort_order,",
  "   category_key, source_type, launch_tier, commission_band_key, insurance_band,",
  "   risk_profile, requires_background_check)",
  "VALUES",
  "  ('Venues', 'venues',",
  "   'Event venues',",
  "   'service_provider', true, true, 105,",
  "   'venue', 'platform_provider', 'segment', 'moderate', 2, 'moderate', false)",
  "ON CONFLICT (slug) DO NOTHING;",
].join("\n");

/** The same `venue` key under a DIFFERENT slug — a taxonomy fork the registry must refuse. */
const REGISTRY_FIXTURE_B_DUP = REGISTRY_FIXTURE_B.replace("'venues'", "'event-venues'");

const REGISTRY_FIXTURE_AB = [
  { file: "fixture/034.sql", sql: REGISTRY_FIXTURE_A },
  { file: "fixture/285.sql", sql: REGISTRY_FIXTURE_B },
];
const REGISTRY_FIXTURE_DUP = [
  { file: "fixture/034.sql", sql: REGISTRY_FIXTURE_A + "\n" + REGISTRY_FIXTURE_B },
  { file: "fixture/285.sql", sql: REGISTRY_FIXTURE_B_DUP },
];

function selfTest() {
  const base = {
    keyedByMigration: new Set(["entertainment", "rental-services"]),
    bundleKeys: new Set(["services-wedding", "services-corporate"]),
    offeringKeys: new Set(["entertainment"]),
    assignedKeys: new Set(["entertainment", "rentals", "custom_other"]),
    allowlist: new Map([["health-wellness", "legacy"]]),
  };
  const cases = [
    {
      name: "THE BUG — the orphan bundle row fails R2 (services-wedding, no key)",
      seeded: [{ file: "seed.ts", slug: "services-wedding", hasKey: false }],
      expect: 1,
      wantRule: "R2",
    },
    {
      name: "THE BUG — R2 fires even if the orphan were allowlisted",
      seeded: [{ file: "seed.ts", slug: "services-corporate", hasKey: false }],
      allowlist: new Map([["services-corporate", "would-be excuse"]]),
      expect: 1,
      wantRule: "R2",
    },
    {
      name: "THE FIX — the orphan rows are gone; only keyed/allowlisted rows are seeded",
      seeded: [
        { file: "seed.ts", slug: "entertainment", hasKey: false },
        { file: "seed.ts", slug: "health-wellness", hasKey: false },
        { file: "seed.ts", slug: "custom-other", hasKey: true },
      ],
      expect: 0,
    },
    {
      name: "R1 — a NEW key-less category that is neither 034-keyed nor declared fails",
      seeded: [{ file: "seed.ts", slug: "wedding-venue", hasKey: false }],
      expect: 1,
      wantRule: "R1",
    },
    {
      name: "R1 — the custom-other regression (migrations 189/208): literal key present ⇒ passes",
      seeded: [{ file: "seed.ts", slug: "custom-other", hasKey: true }],
      expect: 0,
    },
    {
      name: "R1 — a slug migration 034 keys needs no literal key",
      seeded: [{ file: "seed.ts", slug: "rental-services", hasKey: false }],
      expect: 0,
    },
    {
      name: "R3 — an offering pointing at an unassigned category_key fails",
      seeded: [],
      offeringKeys: new Set(["music_performance"]),
      expect: 1,
      wantRule: "R3",
    },
    {
      name: "R3 — an offering pointing at an assigned key passes",
      seeded: [],
      offeringKeys: new Set(["custom_other"]),
      expect: 0,
    },
    // ── R0 REGISTRY (ledger `2026-09-04-venue-category`) ──────────────────────────────────────
    // The three shapes the registry adds, driven through the REAL shared parser rather than a
    // hand-built Set — a fixture that fakes the parse cannot catch a parser that has gone blind.
    {
      name: "R0 REGISTRY — a key present ONLY in the second migration (285) is assigned",
      seeded: [],
      offeringKeys: new Set(["venue"]),
      assignedKeys: collectTaxonomy(REGISTRY_FIXTURE_AB).keys,
      expect: 0,
    },
    {
      name: "R0 REGISTRY — a key in NEITHER migration fails R3 against the same registry",
      seeded: [],
      offeringKeys: new Set(["ballroom"]),
      assignedKeys: collectTaxonomy(REGISTRY_FIXTURE_AB).keys,
      expect: 1,
      wantRule: "R3",
    },
    {
      name: "R0 REGISTRY — the SAME key claimed by BOTH migrations FAILS (a fork, not a union)",
      seeded: [],
      offeringKeys: new Set(),
      registryErrors: collectTaxonomy(REGISTRY_FIXTURE_DUP).errors,
      expect: 1, // the duplicated category_key (the slugs deliberately differ)
      wantRule: "R0",
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const errs = evaluate({ ...base, ...c, seeded: c.seeded });
    const ok = errs.length === c.expect && (!c.wantRule || errs.some((e) => e.startsWith(c.wantRule)));
    if (ok) console.log(`  ✓ ${c.name}`);
    else {
      failed++;
      console.error(`  ✗ ${c.name} — got ${errs.length} error(s), want ${c.expect}${c.wantRule ? ` (${c.wantRule})` : ""}`);
      errs.forEach((e) => console.error(`      ${e}`));
    }
  }
  if (failed) {
    console.error(`[check-category-reachability] self-test FAILED (${failed})`);
    process.exit(1);
  }
  console.log(
    `[check-category-reachability] self-test OK — ${cases.length} fixtures (bug fails, fix passes)`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────────────────────

function read(rel) {
  const full = path.join(REPO, rel);
  if (!fs.existsSync(full)) {
    console.error(`[check-category-reachability] required file missing: ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(full, "utf8");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const registry = readRegistry(read);
  const keyedByMigration = registry.slugs;
  const assignedKeys = new Set(registry.keys);
  const bundleKeys = parseBundleKeys(read(BUNDLE_KEYS_FILE));

  if (keyedByMigration.size === 0 || assignedKeys.size === 0 || bundleKeys.size === 0) {
    console.error(
      "[check-category-reachability] a parser returned nothing — the shape of a " +
        `TAXONOMY_MIGRATIONS entry (${TAXONOMY_MIGRATIONS.join(", ")}) or ${BUNDLE_KEYS_FILE} ` +
        "changed. Fix the parser; do not delete the guard."
    );
    process.exit(1);
  }

  const seeded = [];
  for (const rel of SEEDER_FILES) {
    const text = read(rel);
    for (const k of parseSeederLiteralKeys(text)) assignedKeys.add(k);
    for (const row of parseSeederCategories(text)) seeded.push({ file: rel, ...row });
  }
  if (seeded.length < MIN_EXPECTED_SEEDED) {
    console.error(
      `[check-category-reachability] parsed only ${seeded.length} seeded category literal(s), expected ` +
        `at least ${MIN_EXPECTED_SEEDED} — PARSER DRIFT. A guard that silently matches nothing reports ` +
        "PASS forever (the phase2-fee-gate lesson, §18d). Fix the parser; do not lower this floor to " +
        "make the check green."
    );
    process.exit(1);
  }

  let offeringKeys = new Set();
  for (const f of fs.readdirSync(path.join(REPO, MIGRATIONS_DIR)).filter((x) => x.endsWith(".sql"))) {
    for (const k of parseOfferingCategoryKeys(read(path.join(MIGRATIONS_DIR, f)))) offeringKeys.add(k);
  }

  const errs = evaluate({
    seeded,
    keyedByMigration,
    bundleKeys,
    offeringKeys,
    assignedKeys,
    registryErrors: registry.errors,
    allowlist: KEYLESS_BY_DECISION,
  });

  if (errs.length) {
    console.error(`category-reachability guard: ${errs.length} FAILURE(S):`);
    for (const e of errs) console.error(`  ✗ ${e}`);
    console.error("\nSee ledger 2026-09-04-taxonomy-reconcile / 2026-09-04-venue-category.");
    process.exit(1);
  }
  const uniqueSlugs = new Set(seeded.map((r) => r.slug));
  console.log(
    `category-reachability guard OK — ${uniqueSlugs.size} seeded category slug(s) across ` +
      `${SEEDER_FILES.length} seeder(s) all reachable; ${offeringKeys.size} offering category_key(s) resolve; ` +
      `${KEYLESS_BY_DECISION.size} declared key-less by decision; ` +
      `${assignedKeys.size} category_key(s) assigned across ${TAXONOMY_MIGRATIONS.length} taxonomy-registry migration(s).`
  );
}

main();
