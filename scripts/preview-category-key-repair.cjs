#!/usr/bin/env node
/**
 * preview-category-key-repair.cjs — a READ-ONLY dry run of migration 289, per key.
 * Ledger `2026-09-06-category-key-repair`; CLAUDE.md Locked Decision 31.
 *
 * WHY THIS EXISTS
 * ---------------
 * Migration 289 repairs `service_categories.category_key` on databases that applied migration
 * 034's ORIGINAL, pre-UPSERT form — a stamped migration never re-runs, so every such database
 * still carries the pre-repair outcome. 289 matches an existing row by SLUG, then by lower-cased
 * NAME, and INSERTs 034's canonical row only where neither identifier is on the table.
 *
 * The author of 289 CANNOT SEE PRODUCTION. Which of those three things happens for a given key is
 * therefore a fact about a database, not about the file — and the one shape 289 cannot repair (a
 * row whose slug AND name have both drifted away from 034's) is invisible in the SQL and obvious
 * here: it shows up as `would-insert` for a category the operator knows perfectly well exists.
 * So this script is run against the real database BEFORE 289 is published, and its output is read
 * by a human.
 *
 * IT NEVER WRITES. `SET TRANSACTION READ ONLY` is issued before any query, and there is no INSERT,
 * UPDATE or DELETE in the file. It runs the same slug-then-name resolution 289 runs and REPORTS.
 *
 * WHAT IT REPORTS, PER KEY
 * ------------------------
 *   already-keyed     a row already carries this `category_key` — 289 will do nothing for it.
 *   matched-by-slug   PASS A will assign the key to the row with 034's slug.
 *   matched-by-name   PASS B will assign the key to the row with 034's name (its slug drifted).
 *   would-insert      neither identifier is on the table — PASS C creates 034's canonical row.
 *                     READ THESE ONES. For a category the operator knows exists under some other
 *                     name, this is the both-identifiers-drifted case, and applying 289 would put
 *                     a second row beside it rather than repair it.
 *   CONFLICT          the two identifiers resolve to DIFFERENT unkeyed rows, or the key is already
 *                     carried by a row that is neither of them. 289 is still deterministic here
 *                     (slug wins), but which row SHOULD carry the key is a human's call.
 *
 * EXIT CODES. 0 = no CONFLICT (the repair is unambiguous as far as this database can tell).
 *             1 = at least one CONFLICT — stop and read it. 2 = could not connect or query.
 * A `would-insert` is NOT an error exit: on a database that never had 034's rows at all it is the
 * correct and expected answer, and failing on it would make the script useless where it matters.
 *
 * NEGATIVE SPACE (§18d) — what this preview does NOT tell you
 * -----------------------------------------------------------
 *   • It cannot tell a category that is genuinely ABSENT from one whose slug and name have BOTH
 *     drifted. Both read `would-insert`. Distinguishing them needs a human who knows the catalog;
 *     that is the whole reason the output is pasted into the PR rather than gated in CI.
 *   • It does no fuzzy matching and offers no suggestions. A near-miss name is not reported as a
 *     near miss, deliberately: a guess presented as a finding is how the wrong row gets keyed.
 *   • It says nothing about whether a keyed category has offerings, providers or supply in any
 *     market — supply is a §13 honesty question for the reader, not a taxonomy question.
 *   • It reads only `service_categories`. It does not check `service_offering_types`,
 *     `experience_types.roles_needed`, or anything the keys are joined to.
 *
 * USAGE
 * -----
 *   node scripts/preview-category-key-repair.cjs "<DATABASE_URL>"
 *   # or: DATABASE_URL=... node scripts/preview-category-key-repair.cjs
 *   #     --json    (machine-readable; the same findings)
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { parseCategoryRows } = require("./lib/taxonomy-registry.cjs");

const ROOT = path.resolve(__dirname, "..");
const MIGRATION = "server/migrations/289_reconcile_service_category_keys.sql";

/**
 * The (slug, key) map is READ OUT OF THE MIGRATION ITSELF, through the SAME shared parser the
 * taxonomy guards use — never re-typed here. A second copy of the map is the derivation-drift
 * class §18 rule 1 names, and it would drift the moment a key moved.
 *
 * The NAME half is not in the parsed pairs (the parser returns slug + key only), so it is read
 * from the same INSERT's tuples by column name below.
 */
function readMigrationMap() {
  const sql = fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
  const pairs = parseCategoryRows(sql);
  if (pairs.length === 0) {
    throw new Error(
      `no category rows parsed out of ${MIGRATION} — the migration's INSERT shape changed and this ` +
        "preview would report on nothing. Fix the parser or the migration; do not ignore this.",
    );
  }
  // Names come from the same statement, matched to slugs by position in the parsed list.
  const names = parseInsertNames(sql);
  return pairs.map((p) => ({ slug: p.slug, key: p.key, name: names.get(p.slug) ?? null }));
}

/** `slug` → `name`, read off the same `INSERT INTO service_categories (…) VALUES …` statement. */
function parseInsertNames(sqlText) {
  const out = new Map();
  // Reuse the shared tuple walker indirectly: the INSERT's tuples are `('<name>', '<slug>', …`
  // in 034's column order, which 289 copies verbatim. Match that leading pair only.
  for (const m of sqlText.matchAll(/\(\s*'((?:[^']|'')+)'\s*,\s*'([a-z0-9-]+)'\s*,/g)) {
    out.set(m[2], m[1].replace(/''/g, "'"));
  }
  return out;
}

const CATEGORIES_SQL = `
  SELECT id, name, slug, category_key
  FROM service_categories
`;

/**
 * The resolution 289 performs, run against rows already in memory — so the preview and the
 * migration cannot disagree about which row a key lands on.
 */
function resolve(rows, map) {
  const bySlug = new Map();
  const byName = new Map();
  const byKey = new Map();
  for (const r of rows) {
    if (r.slug) bySlug.set(r.slug, r);
    if (r.name) byName.set(String(r.name).trim().toLowerCase(), r);
    if (r.category_key) byKey.set(r.category_key, r);
  }

  const findings = [];
  for (const entry of map) {
    const keyed = byKey.get(entry.key) ?? null;
    const slugRow = entry.slug ? bySlug.get(entry.slug) ?? null : null;
    const nameRow = entry.name ? byName.get(entry.name.trim().toLowerCase()) ?? null : null;

    if (keyed) {
      // Already carried. A CONFLICT only if the row carrying it is NEITHER of the rows 289 would
      // otherwise have picked — i.e. the key sits somewhere the map does not point.
      const expected = (slugRow && slugRow.id === keyed.id) || (nameRow && nameRow.id === keyed.id);
      findings.push({
        key: entry.key,
        slug: entry.slug,
        name: entry.name,
        status: expected || (!slugRow && !nameRow) ? "already-keyed" : "CONFLICT",
        detail: expected || (!slugRow && !nameRow)
          ? `carried by "${keyed.name}" (slug ${keyed.slug ?? "<null>"})`
          : `key already on "${keyed.name}" (slug ${keyed.slug ?? "<null>"}), but 034's identifiers ` +
            `point at "${(slugRow ?? nameRow).name}" (slug ${(slugRow ?? nameRow).slug ?? "<null>"})`,
      });
      continue;
    }

    const slugCandidate = slugRow && slugRow.category_key === null ? slugRow : null;
    const nameCandidate = nameRow && nameRow.category_key === null ? nameRow : null;

    if (slugCandidate && nameCandidate && slugCandidate.id !== nameCandidate.id) {
      findings.push({
        key: entry.key,
        slug: entry.slug,
        name: entry.name,
        status: "CONFLICT",
        detail:
          `slug matches "${slugCandidate.name}" (id ${slugCandidate.id}) but name matches ` +
          `"${nameCandidate.name}" (slug ${nameCandidate.slug ?? "<null>"}, id ${nameCandidate.id}). ` +
          "289 assigns the key to the SLUG row and leaves the other unkeyed — decide whether that " +
          "is right before publishing.",
      });
      continue;
    }
    if (slugCandidate) {
      findings.push({ key: entry.key, slug: entry.slug, name: entry.name, status: "matched-by-slug",
        detail: `will key "${slugCandidate.name}" (id ${slugCandidate.id})` });
      continue;
    }
    if (nameCandidate) {
      findings.push({ key: entry.key, slug: entry.slug, name: entry.name, status: "matched-by-name",
        detail: `slug drifted to "${nameCandidate.slug ?? "<null>"}"; will key it by name (id ${nameCandidate.id})` });
      continue;
    }
    // A row exists under one of the identifiers but ALREADY carries a DIFFERENT key: 289 will not
    // touch it (its guard is `category_key IS NULL`) and will insert beside it.
    const blocked = (slugRow && slugRow.category_key) ? slugRow : (nameRow && nameRow.category_key) ? nameRow : null;
    if (blocked) {
      findings.push({
        key: entry.key,
        slug: entry.slug,
        name: entry.name,
        status: "CONFLICT",
        detail:
          `"${blocked.name}" (slug ${blocked.slug ?? "<null>"}) matches 034's identifiers but already ` +
          `carries category_key "${blocked.category_key}". 289 never overwrites a non-null key, so it ` +
          "would INSERT a second row for this category.",
      });
      continue;
    }
    findings.push({ key: entry.key, slug: entry.slug, name: entry.name, status: "would-insert",
      detail: "neither slug nor name is on the table — 289 inserts 034's canonical row" });
  }
  return findings;
}

const ORDER = ["already-keyed", "matched-by-slug", "matched-by-name", "would-insert", "CONFLICT"];

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const url = argv.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'No database URL. Usage: node scripts/preview-category-key-repair.cjs "<DATABASE_URL>"',
    );
    process.exit(2);
  }

  let map;
  try {
    map = readMigrationMap();
  } catch (err) {
    console.error(`[category-key-repair] ${err.message}`);
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  let rows;
  try {
    await client.connect();
    // Belt and braces: this session may not write, whatever a future edit above says.
    await client.query("SET TRANSACTION READ ONLY");
    rows = (await client.query(CATEGORIES_SQL)).rows;
  } catch (err) {
    console.error(`[category-key-repair] query failed: ${err.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }

  const findings = resolve(rows, map);
  const conflicts = findings.filter((f) => f.status === "CONFLICT");
  const counts = Object.fromEntries(
    ORDER.map((s) => [s, findings.filter((f) => f.status === s).length]),
  );

  if (json) {
    console.log(JSON.stringify({ totalRows: rows.length, counts, findings }, null, 2));
    process.exit(conflicts.length ? 1 : 0);
  }

  console.log(
    `[category-key-repair] DRY RUN of ${MIGRATION} — read-only, nothing was written.\n` +
      `service_categories rows on this database: ${rows.length}; ` +
      `already carrying a category_key: ${rows.filter((r) => r.category_key).length}.\n`,
  );
  for (const status of ORDER) {
    const group = findings.filter((f) => f.status === status);
    if (group.length === 0) continue;
    console.log(`${status} (${group.length}):`);
    for (const f of group) {
      console.log(`  ${f.key.padEnd(26)} slug=${String(f.slug).padEnd(26)} ${f.detail}`);
    }
    console.log("");
  }
  console.log(
    `Summary: ${ORDER.map((s) => `${s}=${counts[s]}`).join("  ")}\n` +
      "`would-insert` is expected on a database that never carried 034's rows. On one that DOES " +
      "carry the category under some other name and slug, it means 289 cannot see it and would add " +
      "a second row — that is the one case this preview exists to put in front of a human.",
  );
  if (conflicts.length) {
    console.error(
      `\n${conflicts.length} CONFLICT(S) — do not publish 289 until each is understood.`,
    );
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { readMigrationMap, resolve };

if (require.main === module) {
  main().catch((err) => {
    console.error(`[category-key-repair] ${err.message}`);
    process.exit(2);
  });
}
