#!/usr/bin/env node
/**
 * taxonomy-registry.cjs — the REGISTRY of migrations that assign `service_categories.category_key`.
 *
 * Ledger `2026-09-04-venue-category`; CLAUDE.md Locked Decision 31 (as amended).
 *
 * WHY THIS MODULE EXISTS
 * ──────────────────────
 * Locked Decision 31 originally named migration 034 as "the sole taxonomy authority", and BOTH
 * taxonomy guards — `check-category-reachability.cjs` and `check-roles-needed-reachability.cjs` —
 * hardcoded that one filename. That was true for exactly as long as no second migration ever
 * assigned a `category_key`, and 285 (`venue`) is the second one. Two guards each carrying their
 * own copy of "which files are the authority" is the derivation-drift class §18 rule 1 names: the
 * next category would have to be added to two lists, and forgetting either produces a guard that
 * reports PASS while looking at half the taxonomy.
 *
 * So the authority is ONE committed list, required by both guards and by
 * `shared/__tests__/roles-needed.test.ts` (R3). Adding a category is a REGISTRY ENTRY plus a
 * migration — never an ad-hoc INSERT somewhere the guards cannot see.
 *
 * WHAT A REGISTRY MIGRATION MUST LOOK LIKE
 * ────────────────────────────────────────
 * An `INSERT INTO service_categories (…columns…) VALUES (…), (…)` whose column list names both
 * `slug` and `category_key`. The parser below is COLUMN-AWARE (it reads the statement's own column
 * list rather than counting fields positionally), so a registry migration is free to use a
 * different column order from 034's.
 *
 * NEGATIVE SPACE — what this module does NOT do (§18d)
 * ───────────────────────────────────────────────────
 *   • It never opens a database. A `category_key` assigned by a hand-run statement, an admin route
 *     or an unregistered migration is invisible here — deliberately: the deploy-push durability
 *     rules make a committed, registered migration the only durable author.
 *   • It does not check that a registry file is REGISTERED in `migration-files.ts`. That is the
 *     chain-integrity test's job (`server/migrations/__tests__/chain-integrity.test.ts`).
 *   • It says nothing about whether a category has offerings, providers, or supply in any market.
 *     Supply is a §13 honesty question for the reader, not a taxonomy question.
 *   • It parses SQL as TEXT. `UPDATE service_categories SET category_key = …` backfills are NOT
 *     read (migrations 189/208 do that for Custom / Other; the seeder literals already carry
 *     those keys, so the category-reachability guard covers them from the other side).
 */
"use strict";

/**
 * THE REGISTRY. Every migration that ASSIGNS `service_categories.category_key`, in apply order.
 *
 * Adding a row to this list is a taxonomy decision (CLAUDE.md "Coordination Prevention"): the keys
 * a file here introduces become legal `OCCASION_ROLE_KEYS` members and legal `roles_needed` values
 * everywhere. Do not add a file that merely READS or reshapes categories.
 */
const TAXONOMY_MIGRATIONS = [
  // The original 24 rows (ledger `2026-09-04-taxonomy-reconcile`; 20 disciplines + 4 `aff_*`).
  "server/migrations/034_phase1_reconcile_service_categories.sql",
  // `venue` — the 21st discipline (ledger `2026-09-04-venue-category`).
  "server/migrations/285_venue_service_category.sql",
];

// ── SQL text helpers ──────────────────────────────────────────────────────────────────────────

/**
 * Strip `--` line comments WITHOUT touching a `--` that sits inside a string literal.
 * 034's header carries prose that mentions INSERT/ON CONFLICT, so a naive parse would read the
 * commentary as statements.
 */
function stripLineComments(sql) {
  let out = "";
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += sql[++i];
        } else {
          inStr = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inStr = true;
      out += ch;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Split a VALUES tuple body on TOP-LEVEL commas, respecting quotes and nested parens. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (body[i + 1] === "'") cur += body[++i];
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === "(") { depth++; cur += ch; continue; }
    if (ch === ")") { depth--; cur += ch; continue; }
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur.trim());
  return parts;
}

/** `'foo'` → `foo`; `NULL` → null; anything else → the raw token. */
function literal(token) {
  const t = String(token ?? "").trim();
  if (t === "" || /^null$/i.test(t)) return null;
  const m = t.match(/^'([\s\S]*)'$/);
  return m ? m[1].replace(/''/g, "'") : t;
}

/**
 * Every `(slug, category_key)` pair a SQL text INSERTs into `service_categories`.
 * Column-aware: the statement's own column list decides which field is which.
 *
 * @returns {Array<{slug: string|null, key: string|null}>}
 */
function parseCategoryRows(sqlText) {
  const sql = stripLineComments(sqlText);
  const rows = [];
  const stmt = /INSERT\s+INTO\s+service_categories\s*\(([^)]*)\)\s*VALUES/gi;
  let m;
  while ((m = stmt.exec(sql)) !== null) {
    const cols = m[1].split(",").map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
    const slugIdx = cols.indexOf("slug");
    const keyIdx = cols.indexOf("category_key");
    // Walk tuples from the end of `VALUES`, stopping at a depth-0 `ON CONFLICT` or `;`.
    let i = stmt.lastIndex;
    while (i < sql.length) {
      const rest = sql.slice(i);
      const open = rest.search(/\(/);
      const stop = rest.search(/;|ON\s+CONFLICT/i);
      if (open === -1 || (stop !== -1 && stop < open)) break;
      let depth = 0;
      let inStr = false;
      const start = i + open;
      let j = start;
      for (; j < sql.length; j++) {
        const ch = sql[j];
        if (inStr) {
          if (ch === "'") {
            if (sql[j + 1] === "'") j++;
            else inStr = false;
          }
          continue;
        }
        if (ch === "'") { inStr = true; continue; }
        if (ch === "(") depth++;
        else if (ch === ")") { depth--; if (depth === 0) break; }
      }
      if (depth !== 0) break;
      const fields = splitTopLevel(sql.slice(start + 1, j));
      rows.push({
        slug: slugIdx === -1 ? null : literal(fields[slugIdx]),
        key: keyIdx === -1 ? null : literal(fields[keyIdx]),
      });
      i = j + 1;
    }
  }
  return rows;
}

/**
 * Fold the whole registry into one taxonomy view.
 *
 * @param {Array<{file: string, sql: string}>} sources — registry files, in apply order.
 * @returns {{ slugs: Set<string>, keys: Set<string>,
 *             rows: Array<{file: string, slug: string|null, key: string|null}>,
 *             errors: string[] }}
 */
function collectTaxonomy(sources) {
  const errors = [];
  const rows = [];
  /** @type {Map<string, string[]>} */
  const keyOwners = new Map();
  /** @type {Map<string, string[]>} */
  const slugOwners = new Map();

  for (const { file, sql } of sources) {
    const parsed = parseCategoryRows(sql);
    if (parsed.length === 0) {
      errors.push(
        `REGISTRY PARSE — ${file} is listed in TAXONOMY_MIGRATIONS but no ` +
          "`INSERT INTO service_categories (…) VALUES …` was parsed out of it. A guard that " +
          "silently matches nothing reports PASS forever (the phase2-fee-gate lesson, §18d). " +
          "Fix the parser or remove the file from the registry — do not leave it half-read."
      );
      continue;
    }
    for (const r of parsed) {
      rows.push({ file, ...r });
      if (r.key) keyOwners.set(r.key, [...(keyOwners.get(r.key) ?? []), file]);
      if (r.slug) slugOwners.set(r.slug, [...(slugOwners.get(r.slug) ?? []), file]);
    }
  }

  // A key claimed by two registry migrations is a taxonomy fork: whichever runs last wins on
  // disk, and the two files disagree about what the key MEANS. Refuse it here, where it is cheap.
  for (const [key, owners] of keyOwners) {
    const distinct = [...new Set(owners)];
    if (owners.length > 1) {
      errors.push(
        `REGISTRY DUPLICATE — category_key "${key}" is assigned by more than one taxonomy ` +
          `migration row (${distinct.join(", ")}). The registry is a UNION, not an override ` +
          "chain: two files claiming one key means the last-applied one silently wins and the " +
          "other file's row copy, band and risk profile are dead text."
      );
    }
  }
  for (const [slug, owners] of slugOwners) {
    const distinct = [...new Set(owners)];
    if (owners.length > 1) {
      errors.push(
        `REGISTRY DUPLICATE — category slug "${slug}" is inserted by more than one taxonomy ` +
          `migration row (${distinct.join(", ")}). Same reason as a duplicate key: the ` +
          "ON CONFLICT (slug) target would be rewritten by whichever migration runs last."
      );
    }
  }

  return {
    slugs: new Set(rows.map((r) => r.slug).filter(Boolean)),
    keys: new Set(rows.map((r) => r.key).filter(Boolean)),
    rows,
    errors,
  };
}

module.exports = {
  TAXONOMY_MIGRATIONS,
  stripLineComments,
  splitTopLevel,
  parseCategoryRows,
  collectTaxonomy,
};
