/**
 * Static contract for migration 319.
 *
 * This deliberately reads the SQL rather than connecting to a database: the migration
 * is data-only, and the contract must prove its scope without touching any environment.
 *
 * Run: npx tsx --test server/migrations/__tests__/319-background-check-required-categories.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATION_FILES } from "../migration-files";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "319_background_check_required_categories.sql";
const sql = readFileSync(join(migrationsDir, migrationName), "utf8");
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("migration 319 background-check category correction", () => {
  it("is registered and contains exactly the approved four-key update", () => {
    assert.ok(
      (MIGRATION_FILES as readonly string[]).includes(migrationName),
      `${migrationName} must be registered`,
    );
    assert.match(executableSql, /^\s*UPDATE\s+service_categories\s+SET\s+requires_background_check\s*=\s*TRUE\s+WHERE/s);
    const approvedKeys = [
      "tour_guide",
      "private_chef",
      "childcare_family",
      "private_transportation",
    ];
    const keyList = executableSql.match(/category_key\s+IN\s*\(([\s\S]*?)\)/i)?.[1] ?? "";
    const targetedKeys = [...keyList.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(targetedKeys, approvedKeys, "migration 319 must target exactly the approved four keys");
    for (const key of approvedKeys) {
      assert.equal(
        (executableSql.match(new RegExp(`'${key}'`, "g")) ?? []).length,
        1,
        `migration 319 must target ${key} exactly once`,
      );
    }
    assert.match(executableSql, /requires_background_check\s+IS\s+DISTINCT\s+FROM\s+TRUE/i);
  });

  it("does not alter schema or any category field outside the approved flag", () => {
    for (const forbidden of [
      /\bALTER\s+TABLE\b/i,
      /\bINSERT\b/i,
      /\bDELETE\b/i,
      /\bDROP\b/i,
      /\brisk_profile\b/i,
      /\binsurance_band\b/i,
    ]) {
      assert.doesNotMatch(executableSql, forbidden);
    }
    assert.equal(
      (executableSql.match(/\bSET\b/gi) ?? []).length,
      1,
      "migration 319 must set only requires_background_check",
    );
  });
});