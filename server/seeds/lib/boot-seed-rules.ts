/**
 * Boot seeding rules (ledger `2026-10-18-boot-reference-seeding`; decision-maker, Oct 18, 2026):
 *   - boot writes REFERENCE data only, insert-if-missing, and never updates a row that existed before
 *     this boot; everything else is an explicit `scripts/seed-*.ts` run on purpose;
 *   - one instance at a time (`withAdvisoryXactLock(BOOT_SEED_LOCK, …)`);
 *   - a table an admin can delete rows from is seeded only while NONE of the rows that ONLY its seeder
 *     creates are present ("seeder-only keys" — keys no migration creates). A fresh database gets every
 *     row; a database that has been seeded never gets a deleted row back.
 *
 * `SEEDER_ONLY_KEYS` is the one list of those keys; `server/__tests__/boot-seed-rules.test.ts` proves no
 * registered migration creates any of them.
 */
import { inArray } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "../../db";

/** True when none of `keys` is present in `column` — the seeder may run. Empty `keys` never runs. */
export async function noSeederOnlyKeyPresent(table: PgTable, column: AnyPgColumn, keys: readonly string[]): Promise<boolean> {
  if (keys.length === 0) return false;
  const rows = await db.select({ k: column }).from(table).where(inArray(column, [...keys])).limit(1);
  return rows.length === 0;
}

/**
 * Rows a boot seeder CREATED in this process. An updater that sets a seeded row's remaining fields after
 * its insert may touch these rows and no others, so a row that existed before this boot is never rewritten.
 */
const createdThisBoot = new Map<string, Set<string>>();
export function recordCreated(table: string, id: string): void {
  if (!createdThisBoot.has(table)) createdThisBoot.set(table, new Set());
  createdThisBoot.get(table)!.add(id);
}
export function createdIds(table: string): string[] {
  return Array.from(createdThisBoot.get(table) ?? []);
}
export function wasCreatedThisBoot(table: string, id: string): boolean {
  return createdThisBoot.get(table)?.has(id) ?? false;
}
