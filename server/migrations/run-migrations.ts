/**
 * SQL Migration Runner
 * Applies numbered SQL migration files in order, idempotent safe (uses IF NOT EXISTS).
 * Called at startup BEFORE seeding. Throws on failure so the server never starts with
 * a partially migrated schema — this prevents silent runtime failures in ESO write/read paths.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename);

const MIGRATION_FILES = [
  "006_eso_canonicalization.sql",
  "007_eso_workflow_columns.sql",
  "008_content_affinity_tags.sql",
  "009_cross_sell_events.sql",
  "009_curated_by_expert.sql",
];

export async function runMigrations(): Promise<void> {
  for (const file of MIGRATION_FILES) {
    const filePath = join(__dirname_local, file);
    const content = readFileSync(filePath, "utf-8");
    try {
      await db.execute(sql.raw(content));
      console.log(`[Migrations] Applied: ${file}`);
    } catch (err: any) {
      // IF NOT EXISTS / IF EXISTS guards in our SQL files mean the only expected
      // "error" for already-applied migrations is a silent no-op, not an exception.
      // Any real error here (missing column, syntax error, DB unreachable) must be
      // surfaced immediately — do not swallow it.
      console.error(`[Migrations] FATAL: ${file} failed:`, err?.message ?? err);
      throw err; // Fail-fast: prevents server from starting with a bad schema
    }
  }
}
