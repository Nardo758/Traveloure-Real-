/**
 * Regression coverage for the role-change audit query response contract.
 *
 * `db.execute()` returns one query-result object with a `.rows` array. Keep
 * this read-only check focused on the shape consumed by the admin route and
 * page so a count-query destructuring regression cannot turn the endpoint
 * into a 500 again.
 *
 * Run: npx tsx --test server/__tests__/admin-query-role-changes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

test("role-change audit query returns logs and numeric total", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for the read-only query regression check");
    return;
  }

  const [{ getRoleChangeAuditLogs }, { pool }] = await Promise.all([
    import("../services/admin-query.service"),
    import("../db"),
  ]);

  try {
    const result = await getRoleChangeAuditLogs({ limit: 1, offset: 0 });

    assert.ok(Array.isArray(result.logs), "logs must be an array");
    assert.equal(typeof result.total, "number", "total must be numeric");
    assert.ok(result.total >= 0, "total must not be negative");
  } finally {
    await pool.end();
  }
});