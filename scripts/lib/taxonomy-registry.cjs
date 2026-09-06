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
 * REPAIR ENTRIES — A FILE THAT RE-ASSIGNS ANOTHER'S KEYS, AND CLAIMS NONE OF ITS OWN
 * ──────────────────────────────────────────────────────────────────────────────────
 * Ledger `2026-09-06-category-key-repair`. A stamped migration NEVER RE-RUNS, so a migration that
 * was WRONG when a database applied it stays wrong on that database forever — even after the file
 * on disk is corrected. Migration 034 is exactly that case: its original UPDATE-WHERE-slug form
 * assigned nothing where slugs did not match, it was later repaired to an UPSERT, and production
 * still carries the pre-repair outcome. Fixing that needs a NEW migration that assigns 034's OWN
 * keys again — which under the duplicate rule below would read as a second file claiming them, i.e.
 * as a taxonomy FORK.
 *
 * It is not a fork, and the registry says so explicitly rather than by exception: a file listed in
 * `TAXONOMY_REPAIRS` names the file it REPAIRS, and
 *
 *   • its `(slug, category_key)` pairs must ALL already be claimed by that target file — a repair
 *     may never introduce a key, rename a slug, or re-point a key at a different slug. A pair the
 *     target does not carry is a `REGISTRY REPAIR SCOPE` failure, which is the thing that stops a
 *     "repair" from quietly becoming a second authority;
 *   • it therefore CLAIMS nothing: its rows do not enter the key/slug ownership maps and do not
 *     widen the taxonomy union. The union is still 034 ∪ 285, and the guards that read it are
 *     unchanged in what they conclude;
 *   • it is still PARSED, and still fails `REGISTRY PARSE` if nothing comes out of it — a repair
 *     that has gone blind must fail loudly, not pass vacuously (the phase2-fee-gate lesson, §18d).
 *
 * A duplicate that is NOT declared as a repair still fails, exactly as before. The declaration is
 * the deliberate, committed act; being a repair is not something a file can assert about itself.
 *
 * NEGATIVE SPACE — what this module does NOT do (§18d)
 * ───────────────────────────────────────────────────
 *   • It never opens a database. A `category_key` assigned by a hand-run statement, an admin route
 *     or an unregistered migration is invisible here — deliberately: the deploy-push durability
 *     rules make a committed, registered migration the only durable author.
 *   • It does not check that a registry file is REGISTERED in `migration-files.ts`. That is the
 *     chain-integrity test's job (`server/migrations/__tests__/chain-integrity.test.ts`).
 *   • For a REPAIR entry it checks the SCOPE of the keys the file re-assigns — never whether the
 *     repair actually works. Whether 289's slug-then-name match finds the drifted row on a given
 *     database is a question about that database's data, and this module never opens one; that is
 *     `scripts/preview-category-key-repair.cjs`'s job, run by a human against the real database.
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
  // REPAIR of 034 for databases that applied its pre-UPSERT form — claims NO key of its own; see
  // TAXONOMY_REPAIRS below and the header's "REPAIR ENTRIES" section
  // (ledger `2026-09-06-category-key-repair`).
  "server/migrations/289_reconcile_service_category_keys.sql",
];

/**
 * REPAIR entries: `<repairing file>` → `<the file whose keys it re-assigns>`.
 *
 * Both sides must also appear in TAXONOMY_MIGRATIONS. A repair claims nothing and may only
 * re-assign `(slug, category_key)` pairs its target already carries — see the header. Adding an
 * entry here is a taxonomy decision like any other registry change: it declares that a file which
 * LOOKS like a second claim on a key is deliberately a second WRITE of the same claim, because the
 * first write did not land on every database.
 */
const TAXONOMY_REPAIRS = {
  "server/migrations/289_reconcile_service_category_keys.sql":
    "server/migrations/034_phase1_reconcile_service_categories.sql",
};

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

/** `slug`+`key` as one comparable token (NUL-joined so no real value can forge a pair). */
function pairToken(row) {
  return `${row.key ?? ""}\u0000${row.slug ?? ""}`;
}

/**
 * Fold the whole registry into one taxonomy view.
 *
 * @param {Array<{file: string, sql: string}>} sources — registry files, in apply order.
 * @param {{ repairs?: Record<string, string> }} [options] — REPAIR declarations
 *        (`<repairing file>` → `<repaired file>`); defaults to `TAXONOMY_REPAIRS`. A repair claims
 *        no key of its own and may only re-assign pairs its target already carries.
 * @returns {{ slugs: Set<string>, keys: Set<string>,
 *             rows: Array<{file: string, slug: string|null, key: string|null, repairOf?: string}>,
 *             errors: string[] }}
 */
function collectTaxonomy(sources, options = {}) {
  const repairs = options.repairs ?? TAXONOMY_REPAIRS;
  const errors = [];
  const rows = [];
  /** @type {Map<string, string[]>} */
  const keyOwners = new Map();
  /** @type {Map<string, string[]>} */
  const slugOwners = new Map();

  // ── Pass 1: parse every file. A repair is parsed exactly as strictly as an authority — a repair
  // that has gone blind must FAIL, not pass vacuously (§18d).
  /** @type {Map<string, Array<{slug: string|null, key: string|null}>>} */
  const parsedByFile = new Map();
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
    parsedByFile.set(file, parsed);
  }

  // ── Pass 2: authorities CLAIM; repairs are checked against what they repair and claim nothing.
  for (const { file } of sources) {
    const parsed = parsedByFile.get(file);
    if (!parsed) continue;

    const repairOf = Object.prototype.hasOwnProperty.call(repairs, file) ? repairs[file] : undefined;
    if (repairOf === undefined) {
      for (const r of parsed) {
        rows.push({ file, ...r });
        if (r.key) keyOwners.set(r.key, [...(keyOwners.get(r.key) ?? []), file]);
        if (r.slug) slugOwners.set(r.slug, [...(slugOwners.get(r.slug) ?? []), file]);
      }
      continue;
    }

    const target = parsedByFile.get(repairOf);
    if (!target) {
      errors.push(
        `REGISTRY REPAIR TARGET — ${file} is declared in TAXONOMY_REPAIRS as a repair of ` +
          `${repairOf}, which is not a parsed registry file. A repair is meaningful only against ` +
          "the file whose keys it re-writes; add the target to TAXONOMY_MIGRATIONS or drop the " +
          "repair declaration."
      );
      continue;
    }
    const targetPairs = new Set(target.map(pairToken));
    for (const r of parsed) {
      rows.push({ file, repairOf, ...r });
      if (!targetPairs.has(pairToken(r))) {
        errors.push(
          `REGISTRY REPAIR SCOPE — ${file} repairs ${repairOf}, but assigns category_key ` +
            `"${r.key ?? "<none>"}" to slug "${r.slug ?? "<none>"}", a pairing ${repairOf} does ` +
            "not carry. A repair re-writes an existing claim; it may not introduce a key, rename " +
            "a slug, or re-point a key — that is a new taxonomy authority and belongs in " +
            "TAXONOMY_MIGRATIONS on its own terms."
        );
      }
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

  // The union is built from CLAIMS only. A repair row is deliberately excluded even though it is
  // (by the scope rule above) a subset of its target's claims — so a scope violation can never
  // widen the taxonomy while it is being reported as an error.
  const claims = rows.filter((r) => r.repairOf === undefined);
  return {
    slugs: new Set(claims.map((r) => r.slug).filter(Boolean)),
    keys: new Set(claims.map((r) => r.key).filter(Boolean)),
    rows,
    errors,
  };
}

module.exports = {
  TAXONOMY_MIGRATIONS,
  TAXONOMY_REPAIRS,
  stripLineComments,
  splitTopLevel,
  parseCategoryRows,
  collectTaxonomy,
};
