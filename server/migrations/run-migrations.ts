/**
 * SQL Migration Runner
 * Applies numbered SQL migration files in order, idempotent safe (uses IF NOT EXISTS / IF EXISTS).
 * Called at startup before seeding so the schema is always up-to-date.
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
];

export async function runMigrations(): Promise<void> {
  for (const file of MIGRATION_FILES) {
    const filePath = join(__dirname_local, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      await db.execute(sql.raw(content));
      console.log(`[Migrations] Applied ${file}`);
    } catch (err: any) {
      if (err?.message?.includes("already exists")) {
        console.log(`[Migrations] ${file} already applied (skipping)`);
      } else {
        console.warn(`[Migrations] ${file} failed (non-fatal):`, err?.message ?? err);
      }
    }
  }
}
