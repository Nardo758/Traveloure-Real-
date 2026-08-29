/**
 * Regression coverage for the two guest-facing discover 500s traced to
 * server/services/upsell-query.service.ts:
 *
 *   1. `WHERE offering_type_key = ANY(${ids})` (rankAndLog) — a bare JS array
 *      interpolated into drizzle's `sql` tag is expanded into a parenthesized,
 *      comma-separated PARAMETER LIST (`ANY(($1, $2, $3))`), not a single
 *      array-typed parameter — Postgres: "op ANY/ALL (array) requires array
 *      on right side".
 *   2. `AND e.neighborhood_id = ANY(${neighborhoodIds})` (loadEndorsementsForContext)
 *      — the same malformed-ANY bug, compounding a real column-resolution
 *      failure in the surrounding JOIN when the request carried no
 *      neighborhoodIds.
 *
 * The file's OWN correct pattern (used at lines 57/69/71/72/107) is
 * `ANY(${pgTextArray(values)}::text[])` — pgTextArray renders a real
 * Postgres array-literal STRING, so the whole thing binds as ONE scalar
 * parameter that casts cleanly to `text[]`.
 *
 * This suite has no DB — it proves the SQL-STRING SHAPE the fixed lines
 * produce (via drizzle's own `sql` tag, which does no I/O), and locks the
 * source against reintroducing a bare `${array}` inside `ANY(...)`.
 *
 * Run with: npx tsx --test server/services/__tests__/upsell-query-any-array.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sql } from "drizzle-orm";

// upsell-query.service.ts imports `../db`, which throws at import time when
// DATABASE_URL is unset (server/db.ts:7-11). node-pg's Pool is lazy — it
// never actually connects until a query runs — so a dummy connection string
// is enough to import the module and reach its pure, DB-free exports
// (pgTextArray, resolveTemplateKey) without touching a real database.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/upsell_query_test_unused";

const { pgTextArray } = await import("../upsell-query.service.ts");

const SERVICE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "upsell-query.service.ts",
);

/** Minimal stand-in for the config drizzle's SQL#toQuery needs — mirrors the
 *  real escaping rules closely enough to prove parameter SHAPE (count/order),
 *  which is what these bugs are about. No DB involved. */
const QUERY_CONFIG = {
  escapeName: (n: string) => `"${n}"`,
  escapeParam: (i: number) => `$${i + 1}`,
  escapeString: (s: string) => `'${s.replace(/'/g, "''")}'`,
};

describe("upsell-query.service — ANY(array) parameter shape", () => {
  it("pgTextArray renders a single Postgres array-literal string", () => {
    assert.equal(pgTextArray(["a", "b", "c"]), '{"a","b","c"}');
    assert.equal(pgTextArray([]), "{}");
  });

  it("bare array interpolation (the ORIGINAL bug) explodes into a parameter TUPLE, not an array", () => {
    // This is the shape line ~347 and ~388 had BEFORE the fix — proving why
    // Postgres rejected it with "op ANY/ALL (array) requires array on right side".
    const ids = ["off1", "off2", "off3"];
    const broken = sql`WHERE offering_type_key = ANY(${ids})`;
    const built = broken.toQuery(QUERY_CONFIG as any);
    assert.equal(built.sql, "WHERE offering_type_key = ANY(($1, $2, $3))");
    assert.equal(built.params.length, 3, "tuple-exploded into one param per element, not one array param");
  });

  it("pgTextArray(...)::text[] (the FIXED shape) binds as exactly ONE array-typed parameter", () => {
    const ids = ["off1", "off2", "off3"];
    const fixed = sql`WHERE offering_type_key = ANY(${pgTextArray(ids)}::text[])`;
    const built = fixed.toQuery(QUERY_CONFIG as any);
    assert.equal(built.sql, "WHERE offering_type_key = ANY($1::text[])");
    assert.equal(built.params.length, 1, "must bind as ONE array-typed parameter");
    assert.equal(built.params[0], '{"off1","off2","off3"}');
  });

  it("an appended ::text[] cast on a BARE array does NOT fix it — still tuple-exploded", () => {
    // This is the shape the sibling at line 541 (getExpertEndorsements) had
    // before this fix: `ANY(${arr}::TEXT[])`. The cast is applied to the SQL
    // TEXT of whatever the array expanded into — since the array already
    // exploded into "($1, $2, $3)" (a row expression, not an array), the
    // trailing cast produces `ANY(($1, $2, $3)::TEXT[])`, which Postgres
    // cannot evaluate as an array either. Only wrapping the VALUE with
    // pgTextArray (proven above) produces valid SQL.
    const neighborhoodIds = ["n1", "n2"];
    const stillBroken = sql`ANY(${neighborhoodIds}::TEXT[])`;
    const built = stillBroken.toQuery(QUERY_CONFIG as any);
    assert.equal(built.sql, "ANY(($1, $2)::TEXT[])");
    assert.equal(built.params.length, 2, "the cast does not collapse the exploded tuple back into an array");
  });

  it("empty neighborhoodIds produces a valid empty array literal, not '()'", () => {
    const fixed = sql`neighborhood_id = ANY(${pgTextArray([])}::text[])`;
    const built = fixed.toQuery(QUERY_CONFIG as any);
    assert.equal(built.sql, "neighborhood_id = ANY($1::text[])");
    assert.equal(built.params[0], "{}");
  });
});

describe("upsell-query.service.ts — source-level regression guard", () => {
  const source = readFileSync(SERVICE_FILE, "utf8");

  it("has no bare `= ANY(${identifier})` left unwrapped by pgTextArray(...)", () => {
    // Matches `ANY(${...}` where the interpolated expression is NOT wrapped
    // in pgTextArray(...) and is not a plain column/member-expression cast
    // target already known-safe (e.g. `${x}::text = ANY(realArrayColumn)`,
    // which has no interpolated array on the ANY side at all).
    const anyCalls = [...source.matchAll(/ANY\(\$\{([^}]*)\}/g)].map((m) => m[1].trim());
    // Locals that are themselves assigned `pgTextArray(...)` output before being
    // interpolated (loadCoveringInventory: citiesArr/adjArr/slugsArr, all built
    // from `const X = pgTextArray(...)` a few lines above their ANY() use) are
    // already-wrapped array-literal strings, same as calling pgTextArray inline.
    const PREWRAPPED_LOCALS = new Set(["citiesArr", "adjArr", "slugsArr"]);
    for (const expr of anyCalls) {
      const isWrapped = /^pgTextArray\(/.test(expr);
      const isPrewrappedLocal = PREWRAPPED_LOCALS.has(expr);
      const isRealArrayColumn = /^sot\.market_scoped$/.test(expr); // ANY(sot.market_scoped) — a real array column, not this class
      assert.ok(
        isWrapped || isPrewrappedLocal || isRealArrayColumn,
        `ANY(\${${expr}}) is not wrapped in pgTextArray(...) — same bug class as the guest-discover 500s`,
      );
    }
    // Prove PREWRAPPED_LOCALS itself isn't rubber-stamping a regression: each
    // named local really is assigned straight from pgTextArray(...) in the source.
    for (const local of PREWRAPPED_LOCALS) {
      assert.match(
        source,
        new RegExp(`const ${local} = pgTextArray\\(`),
        `expected "${local}" to be assigned from pgTextArray(...) — if this no longer holds, it must not stay in PREWRAPPED_LOCALS`,
      );
    }
    // Sanity: make sure the regex actually found the fixed call sites (guards
    // against a silent zero-match false pass).
    assert.ok(anyCalls.some((e) => e.includes("ids")), "expected to find the offering_type_key ANY(...) call");
    assert.ok(anyCalls.some((e) => e.includes("neighborhoodIds")), "expected to find the neighborhood_id ANY(...) call(s)");
  });

  it("loadEndorsementsForContext's neighborhood query still joins on e.neighborhood_id (a real column per shared/schema.ts's upsellExpertEndorsements)", () => {
    assert.match(
      source,
      /JOIN expert_neighborhoods en\s*\n\s*ON en\.expert_id = e\.expert_id\s*\n\s*AND en\.neighborhood_id = e\.neighborhood_id/,
      "the join correlating an expert's lead-neighborhood row to the endorsement's own neighborhood_id must be intact",
    );
  });
});
