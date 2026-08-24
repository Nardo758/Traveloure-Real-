/**
 * Migration chain-integrity gate.
 *
 * Asserts every entry in MIGRATION_FILES resolves to a real file on disk.
 * Catches the class of bug where a merge resolution adds an array entry but
 * loses the SQL file — runMigrations() would otherwise crash with ENOENT
 * at server startup against any environment (sandbox, staging, prod) that
 * tries to apply the chain.
 *
 * Run: npx tsx server/migrations/__tests__/chain-integrity.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { MIGRATION_FILES } from "../migration-files";

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname_local, "..");

describe("migration chain integrity", () => {
  it("every MIGRATION_FILES entry exists on disk", () => {
    const missing = MIGRATION_FILES.filter(
      (f) => !existsSync(join(migrationsDir, f)),
    );
    assert.deepEqual(
      missing,
      [],
      `Dangling MIGRATION_FILES entries (no SQL file on disk): ${missing.join(", ")}`,
    );
  });

  it("entries are unique (no accidental duplicate registration)", () => {
    const counts = new Map<string, number>();
    for (const f of MIGRATION_FILES) counts.set(f, (counts.get(f) ?? 0) + 1);
    const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([f]) => f);
    assert.deepEqual(dups, [], `Duplicate MIGRATION_FILES entries: ${dups.join(", ")}`);
  });
});
