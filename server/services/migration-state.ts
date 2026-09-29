/**
 * WHICH MIGRATIONS HAS THIS DATABASE APPLIED? — read for `GET /api/health` (ledger
 * `2026-09-29-health-last-migration`).
 *
 * §20 says production's migration state is READ, never inferred: the refused `a912ebe49`
 * dispatch reasoned from an older publish report and named six pending migrations when one was.
 * This answers the question from the database itself, on the endpoint an operator already hits.
 *
 * "Last applied" follows the REGISTRY ORDER (`MIGRATION_FILES`, which `run-migrations.ts` says is
 * authoritative), not `applied_at`: a bootstrap stamps many rows in one instant, so a timestamp
 * sort cannot name the last one. It is the last registry entry the ledger records.
 *
 * §13: no ledger table ⇒ `lastApplied: null` and every registered file pending — never a guessed
 * name. A read that fails is reported by the caller as `migrations: null`, never as "current".
 */
import { sql } from "drizzle-orm";
import { MIGRATION_FILES } from "../migrations/migration-files";

export interface MigrationState {
  /** The last registry entry the ledger records; null when none is. */
  lastApplied: string | null;
  /** The last entry in the registry this build ships. */
  latestRegistered: string | null;
  /** Registered files the ledger does not record, in registry order. */
  pending: string[];
  /** True only when nothing registered is pending. */
  current: boolean;
}

/** Pure: the registry and the recorded names (null = no ledger table) → the state. */
export function summarizeMigrationState(
  registry: readonly string[],
  recorded: ReadonlySet<string> | null,
): MigrationState {
  const seen = recorded ?? new Set<string>();
  let lastApplied: string | null = null;
  const pending: string[] = [];
  for (const file of registry) {
    if (seen.has(file)) lastApplied = file;
    else pending.push(file);
  }
  return {
    lastApplied,
    latestRegistered: registry.length > 0 ? registry[registry.length - 1] : null,
    pending,
    current: pending.length === 0,
  };
}

type Executor = { execute: (q: ReturnType<typeof sql>) => Promise<{ rows?: unknown[] }> };

/** Reads the ledger through the given executor. Throws on a failed read (the caller reports null). */
export async function readMigrationState(executor: Executor): Promise<MigrationState> {
  const exists = await executor.execute(sql`SELECT to_regclass('schema_migrations') IS NOT NULL AS "exists"`);
  const hasLedger = Boolean((exists.rows?.[0] as { exists?: boolean } | undefined)?.exists);
  if (!hasLedger) return summarizeMigrationState(MIGRATION_FILES, null);
  const recorded = await executor.execute(sql`SELECT migration_name FROM schema_migrations`);
  const names = new Set<string>((recorded.rows ?? []).map((r) => String((r as { migration_name: unknown }).migration_name)));
  return summarizeMigrationState(MIGRATION_FILES, names);
}
