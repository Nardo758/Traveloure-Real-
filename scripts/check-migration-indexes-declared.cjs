#!/usr/bin/env node
/**
 * check-migration-indexes-declared.cjs — an index a migration creates must be declared in shared/.
 *
 * WHY THIS EXISTS (ledger 2026-09-27-migration-indexes-declared)
 * ─────────────────────────────────────────────────────────────
 * The publish-time drizzle-kit push is authoritative over the live database: an index present
 * in the DB but not declared in a drizzle schema file is planned as `DROP INDEX`, and the
 * migration that created it is already stamped, so it is NEVER recreated (CLAUDE.md, "SECOND
 * VARIANT OF THE SAME TRAP"). Migration 089's five funnel_events indexes were that case — proven
 * on a scratch database: main's schema planned `DROP INDEX` for all five, the declared schema
 * planned nothing for them and they survived. check-undeclared-tables.cjs covers TABLES and needs
 * a live DB; this is the static INDEX half, runnable anywhere.
 *
 * PREDICATE
 * ─────────
 * Walk server/migrations/migration-files.ts in REGISTRY order (the authoritative order). A
 * `CREATE [UNIQUE] INDEX <name>` makes <name> live; a later `DROP INDEX <name>` makes it dead;
 * a later re-create makes it live again. Every name live at the end must appear as
 * `index("<name>")` / `uniqueIndex("<name>")` in a non-test .ts file under shared/, or be listed
 * in scripts/migration-indexes-undeclared-baseline.txt.
 *
 * RATCHET: the baseline only shrinks. A live undeclared index NOT in the baseline fails (declare
 * it in shared/schema.ts — and for a UNIQUE index, check prod for duplicates first). A baseline
 * entry that is now declared or dropped ALSO fails, with the instruction to delete the line in
 * the same PR, so an improvement is never spent as silent headroom.
 *
 * NEGATIVE SPACE (what this does NOT cover)
 * ─────────────────────────────────────────
 *   • It matches NAMES only. A declaration whose columns, order, DESC/NULLS or WHERE differ from
 *     the migration is still planned as DROP + CREATE by the push; only a real push shows that
 *     (see the `.desc().nullsFirst()` note on ai_cost_tracking in CLAUDE.md).
 *   • Indexes created inside DO $$ … $$ blocks with a dynamic (EXECUTE format(...)) name, and
 *     indexes whose name is omitted (Postgres-generated), are invisible to it.
 *   • UNIQUE / PRIMARY KEY *constraints* (ALTER TABLE … ADD CONSTRAINT) are not indexes to this
 *     predicate; nor are tables (check-undeclared-tables.cjs).
 *   • Migration files not registered in migration-files.ts are ignored — the registry is what runs.
 *   • It cannot see the live database: an index created by hand outside a migration is unseen.
 *
 * USAGE
 *   node scripts/check-migration-indexes-declared.cjs
 *   node scripts/check-migration-indexes-declared.cjs --self-test
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY = path.join(ROOT, "server/migrations/migration-files.ts");
const MIGRATIONS_DIR = path.join(ROOT, "server/migrations");
const SHARED_DIR = path.join(ROOT, "shared");
const BASELINE = path.join(__dirname, "migration-indexes-undeclared-baseline.txt");

const CREATE_RE = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s+ON\b/gi;
const DROP_RE = /\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
const DECL_RE = /\b(?:index|uniqueIndex)\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g;

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Registry-ordered migration file names. */
function parseRegistry(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  return [...code.matchAll(/["'`]([0-9][^"'`]*\.sql)["'`]/g)].map((m) => m[1]);
}

/** Replay CREATE/DROP INDEX over ordered [name, sql] pairs; returns Map<index, file>. */
function liveIndexes(ordered) {
  const live = new Map();
  for (const [file, raw] of ordered) {
    const sql = stripSqlComments(raw);
    const events = [];
    for (const m of sql.matchAll(CREATE_RE)) events.push([m.index, "create", m[1].toLowerCase()]);
    for (const m of sql.matchAll(DROP_RE)) events.push([m.index, "drop", m[1].toLowerCase()]);
    events.sort((a, b) => a[0] - b[0]);
    for (const [, kind, name] of events) {
      if (kind === "create") live.set(name, file);
      else live.delete(name);
    }
  }
  return live;
}

function declaredNames(sources) {
  const names = new Set();
  for (const src of sources) for (const m of src.matchAll(DECL_RE)) names.add(m[1].toLowerCase());
  return names;
}

function parseBaseline(text) {
  return new Set(
    text.split("\n").map((l) => l.replace(/#.*/, "").trim().toLowerCase()).filter(Boolean),
  );
}

/** Pure decision. Returns { missing: [[name,file]], stale: [name] }. */
function evaluate({ ordered, declSources, baseline }) {
  const live = liveIndexes(ordered);
  const declared = declaredNames(declSources);
  const undeclared = [...live].filter(([n]) => !declared.has(n));
  const undeclaredSet = new Set(undeclared.map(([n]) => n));
  const missing = undeclared.filter(([n]) => !baseline.has(n)).sort();
  const stale = [...baseline].filter((n) => !undeclaredSet.has(n)).sort();
  return { missing, stale, undeclaredCount: undeclared.length };
}

function listSharedTs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "__tests__") continue;
      out.push(...listSharedTs(p));
    } else if (/\.ts$/.test(ent.name) && !/\.test\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function selfTest() {
  const assert = require("assert");
  const decl = [`export const t = pgTable("t", {}, (x) => ({ a: index("t_a_idx").on(x.a), b: uniqueIndex("t_b_uq").on(x.b) }));`];
  const run = (ordered, baseline = []) =>
    evaluate({ ordered, declSources: decl, baseline: new Set(baseline) });

  // F1 declared index passes.
  let r = run([["001.sql", `CREATE INDEX IF NOT EXISTS t_a_idx ON t (a);`]]);
  assert.deepStrictEqual(r.missing, []);
  // F2 undeclared index fails (the funnel_events shape: DESC, IF NOT EXISTS, quoted).
  r = run([["089.sql", `CREATE INDEX IF NOT EXISTS "fe_created_idx" ON funnel_events (created_at DESC);`]]);
  assert.deepStrictEqual(r.missing.map((x) => x[0]), ["fe_created_idx"]);
  // F3 unique + public-qualified name is still seen.
  r = run([["002.sql", `CREATE UNIQUE INDEX public.u_x ON t (x);`]]);
  assert.deepStrictEqual(r.missing.map((x) => x[0]), ["u_x"]);
  // F4 a later DROP retires it; a commented-out CREATE is ignored.
  r = run([["003.sql", `CREATE INDEX gone_idx ON t (a);`], ["004.sql", `-- CREATE INDEX c_idx ON t(a);\nDROP INDEX IF EXISTS gone_idx;`]]);
  assert.deepStrictEqual(r.missing, []);
  // F5 drop then re-create in REGISTRY order is live again.
  r = run([["005.sql", `DROP INDEX IF EXISTS back_idx;`], ["006.sql", `CREATE INDEX back_idx ON t (a);`]]);
  assert.deepStrictEqual(r.missing.map((x) => x[0]), ["back_idx"]);
  // F6 baseline absorbs a known undeclared index.
  r = run([["007.sql", `CREATE INDEX legacy_idx ON t (a);`]], ["legacy_idx"]);
  assert.deepStrictEqual([r.missing, r.stale], [[], []]);
  // F7 a baseline entry that is now declared is STALE (ratchet only shrinks).
  r = run([["008.sql", `CREATE INDEX t_a_idx ON t (a);`]], ["t_a_idx"]);
  assert.deepStrictEqual(r.stale, ["t_a_idx"]);
  // F8 a baseline entry nothing creates is STALE.
  r = run([], ["never_idx"]);
  assert.deepStrictEqual(r.stale, ["never_idx"]);
  // F9 registry parse keeps order.
  assert.deepStrictEqual(
    parseRegistry(`/* 051 \`051_old.sql\` renamed */\n["010_a.sql", // "099_c.sql"\n "002_b.sql"]`),
    ["010_a.sql", "002_b.sql"],
  );
  console.log("check-migration-indexes-declared self-test: 9/9 fixtures pass");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = parseRegistry(fs.readFileSync(REGISTRY, "utf8"));
  const ordered = [];
  for (const f of files) {
    const p = path.join(MIGRATIONS_DIR, f);
    if (!fs.existsSync(p)) {
      console.error(`✗ registered migration not found on disk: ${f}`);
      process.exit(1);
    }
    ordered.push([f, fs.readFileSync(p, "utf8")]);
  }
  const declSources = listSharedTs(SHARED_DIR).map((p) => fs.readFileSync(p, "utf8"));
  const baseline = fs.existsSync(BASELINE) ? parseBaseline(fs.readFileSync(BASELINE, "utf8")) : new Set();
  const { missing, stale, undeclaredCount } = evaluate({ ordered, declSources, baseline });

  let failed = false;
  if (missing.length) {
    failed = true;
    console.error(`✗ ${missing.length} index(es) created by a registered migration are not declared in shared/:`);
    for (const [n, f] of missing) console.error(`    ${n}   (created by ${f})`);
    console.error("  The publish push will DROP these and the stamped migration never recreates them.");
    console.error("  Declare each in shared/schema.ts (index()/uniqueIndex() with the SAME columns, order,");
    console.error("  DESC/NULLS and WHERE). For a UNIQUE index, check prod for duplicates first.");
  }
  if (stale.length) {
    failed = true;
    console.error(`✗ ${stale.length} baseline entr(ies) are no longer undeclared — delete them from`);
    console.error(`  scripts/migration-indexes-undeclared-baseline.txt in this PR (the ratchet only shrinks):`);
    for (const n of stale) console.error(`    ${n}`);
  }
  if (failed) process.exit(1);
  console.log(
    `✓ every index a registered migration leaves live is declared in shared/ ` +
      `(${undeclaredCount} baselined legacy exception(s) remain — the list only shrinks)`,
  );
}

module.exports = { evaluate, liveIndexes, parseRegistry, declaredNames };
if (require.main === module) main();
