/**
 * One-time backfill: sanitize provider free-text columns that were written
 * before the write-path guard (task 1135) was deployed.
 *
 * Applies `sanitizeText` from server/utils/text-sanitizer.ts to:
 *   • provider_services     — serviceName, shortDescription, description,
 *                             meetingPoint, pickupAddress, dropOffPoint, scopeStatement
 *   • service_translations  — serviceName, shortDescription, description, meetingPoint
 *   • user_and_expert_chats — message
 *
 * Safety / correctness design:
 *   • Keyset-paginated reads (BATCH_SIZE rows at a time) — never loads a full table.
 *   • Concurrency-safe writes: each UPDATE conditions on the row's original column values
 *     using IS NOT DISTINCT FROM so a concurrent provider edit is never overwritten.
 *     Rows changed since we read them are skipped and logged (re-run the script to retry).
 *   • Only touched columns are included in each SET — unrelated columns are not written.
 *   • Bounded parallel updates within each batch (UPDATE_CONCURRENCY).
 *   • Idempotent: rows where sanitizing produces no change are never updated.
 *   • Any fetch or update error is counted; the process exits non-zero when any errors
 *     occurred so callers know the run was incomplete.
 *
 * Usage:
 *   npx tsx scripts/backfill-provider-text-sanitize.ts
 *
 * For production, set DATABASE_URL to the production connection string.
 */

import { db } from "../server/db";
import {
  providerServices,
  serviceTranslations,
  userAndExpertChats,
} from "@shared/schema";
import { sanitizeText } from "../server/utils/text-sanitizer";
import { gt, eq, and, sql } from "drizzle-orm";

const BATCH_SIZE = 200;
const UPDATE_CONCURRENCY = 10;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Run `tasks` with at most `concurrency` in flight at once. */
async function pool(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const task = tasks[i++];
      await task();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  );
}

/**
 * Build a SQL fragment `col IS NOT DISTINCT FROM $value` that is safe for
 * both NULL and non-null values, using Drizzle's raw sql helper.
 */
function notDistinctFrom(
  colExpr: string,
  value: string | null | undefined,
): ReturnType<typeof sql> {
  return value == null
    ? sql`${sql.raw(colExpr)} IS NULL`
    : sql`${sql.raw(colExpr)} = ${value}`;
}

interface TableResult {
  inspected: number;
  changed: number;
  skipped: number; // rows changed since read (concurrent edit)
  errors: number;
}

// ── provider_services ─────────────────────────────────────────────────────────

async function backfillProviderServices(): Promise<TableResult> {
  console.log("\n[backfill] ── provider_services ──");

  let cursor = "";
  let inspected = 0;
  let changed = 0;
  let skipped = 0;
  let errors = 0;

  while (true) {
    const rows = await db
      .select({
        id: providerServices.id,
        serviceName: providerServices.serviceName,
        shortDescription: providerServices.shortDescription,
        description: providerServices.description,
        meetingPoint: providerServices.meetingPoint,
        pickupAddress: providerServices.pickupAddress,
        dropOffPoint: providerServices.dropOffPoint,
        scopeStatement: providerServices.scopeStatement,
        updatedAt: providerServices.updatedAt,
      })
      .from(providerServices)
      .where(cursor ? gt(providerServices.id, cursor) : sql`true`)
      .orderBy(providerServices.id)
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    inspected += rows.length;
    cursor = rows[rows.length - 1].id;

    const tasks = rows
      .map((row) => {
        const patch: Record<string, string | null | undefined> = {};
        const s = (v: string | null | undefined) => sanitizeText(v);

        if (s(row.serviceName) !== row.serviceName) patch.serviceName = s(row.serviceName) ?? row.serviceName;
        if (s(row.shortDescription) !== row.shortDescription) patch.shortDescription = s(row.shortDescription);
        if (s(row.description) !== row.description) patch.description = s(row.description);
        if (s(row.meetingPoint) !== row.meetingPoint) patch.meetingPoint = s(row.meetingPoint);
        if (s(row.pickupAddress) !== row.pickupAddress) patch.pickupAddress = s(row.pickupAddress);
        if (s(row.dropOffPoint) !== row.dropOffPoint) patch.dropOffPoint = s(row.dropOffPoint);
        if (s(row.scopeStatement) !== row.scopeStatement) patch.scopeStatement = s(row.scopeStatement);

        if (Object.keys(patch).length === 0) return null;

        return async () => {
          try {
            // Condition on every originally-read sanitizable column so a concurrent
            // provider edit (any of those columns) causes 0 rows affected → we skip.
            const result = await db
              .update(providerServices)
              .set({ ...patch, updatedAt: new Date() })
              .where(
                and(
                  eq(providerServices.id, row.id),
                  notDistinctFrom("service_name", row.serviceName),
                  notDistinctFrom("short_description", row.shortDescription),
                  notDistinctFrom("description", row.description),
                  notDistinctFrom("meeting_point", row.meetingPoint),
                  notDistinctFrom("pickup_address", row.pickupAddress),
                  notDistinctFrom("drop_off_point", row.dropOffPoint),
                  notDistinctFrom("scope_statement", row.scopeStatement),
                ),
              );
            const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
            if (rowCount === 0) {
              skipped += 1;
              console.warn(`[backfill]   SKIPPED provider_services ${row.id} (concurrently modified)`);
            } else {
              changed += 1;
            }
          } catch (err: unknown) {
            errors += 1;
            console.error(
              `[backfill]   ERROR updating provider_services ${row.id}:`,
              (err as Error)?.message ?? err,
            );
          }
        };
      })
      .filter((t): t is () => Promise<void> => t !== null);

    await pool(tasks, UPDATE_CONCURRENCY);
    console.log(
      `[backfill]   batch up to ${cursor}: ${rows.length} inspected, ${tasks.length} to update`,
    );

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(
    `[backfill]   done — ${inspected} inspected, ${changed} changed, ${skipped} skipped (concurrent), ${errors} error(s)`,
  );
  return { inspected, changed, skipped, errors };
}

// ── service_translations ──────────────────────────────────────────────────────

async function backfillServiceTranslations(): Promise<TableResult> {
  console.log("\n[backfill] ── service_translations ──");

  let cursor = "";
  let inspected = 0;
  let changed = 0;
  let skipped = 0;
  let errors = 0;

  while (true) {
    const rows = await db
      .select({
        id: serviceTranslations.id,
        serviceName: serviceTranslations.serviceName,
        shortDescription: serviceTranslations.shortDescription,
        description: serviceTranslations.description,
        meetingPoint: serviceTranslations.meetingPoint,
      })
      .from(serviceTranslations)
      .where(cursor ? gt(serviceTranslations.id, cursor) : sql`true`)
      .orderBy(serviceTranslations.id)
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    inspected += rows.length;
    cursor = rows[rows.length - 1].id;

    const tasks = rows
      .map((row) => {
        const patch: Record<string, string | null | undefined> = {};
        const s = (v: string | null | undefined) => sanitizeText(v);

        if (s(row.serviceName) !== row.serviceName) patch.serviceName = s(row.serviceName);
        if (s(row.shortDescription) !== row.shortDescription) patch.shortDescription = s(row.shortDescription);
        if (s(row.description) !== row.description) patch.description = s(row.description);
        if (s(row.meetingPoint) !== row.meetingPoint) patch.meetingPoint = s(row.meetingPoint);

        if (Object.keys(patch).length === 0) return null;

        return async () => {
          try {
            const result = await db
              .update(serviceTranslations)
              .set({ ...patch, updatedAt: new Date() })
              .where(
                and(
                  eq(serviceTranslations.id, row.id),
                  notDistinctFrom("service_name", row.serviceName),
                  notDistinctFrom("short_description", row.shortDescription),
                  notDistinctFrom("description", row.description),
                  notDistinctFrom("meeting_point", row.meetingPoint),
                ),
              );
            const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
            if (rowCount === 0) {
              skipped += 1;
              console.warn(`[backfill]   SKIPPED service_translations ${row.id} (concurrently modified)`);
            } else {
              changed += 1;
            }
          } catch (err: unknown) {
            errors += 1;
            console.error(
              `[backfill]   ERROR updating service_translations ${row.id}:`,
              (err as Error)?.message ?? err,
            );
          }
        };
      })
      .filter((t): t is () => Promise<void> => t !== null);

    await pool(tasks, UPDATE_CONCURRENCY);

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(
    `[backfill]   done — ${inspected} inspected, ${changed} changed, ${skipped} skipped (concurrent), ${errors} error(s)`,
  );
  return { inspected, changed, skipped, errors };
}

// ── user_and_expert_chats (messages) ─────────────────────────────────────────

async function backfillMessages(): Promise<TableResult> {
  console.log("\n[backfill] ── user_and_expert_chats (messages) ──");

  let cursor = "";
  let inspected = 0;
  let changed = 0;
  let skipped = 0;
  let errors = 0;

  while (true) {
    const rows = await db
      .select({
        id: userAndExpertChats.id,
        message: userAndExpertChats.message,
      })
      .from(userAndExpertChats)
      .where(cursor ? gt(userAndExpertChats.id, cursor) : sql`true`)
      .orderBy(userAndExpertChats.id)
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    inspected += rows.length;
    cursor = rows[rows.length - 1].id;

    const tasks = rows
      .map((row) => {
        const sanitized = sanitizeText(row.message);
        if (sanitized === row.message) return null;

        return async () => {
          try {
            // Condition on original message value — if concurrently edited, skip.
            const result = await db
              .update(userAndExpertChats)
              .set({ message: sanitized })
              .where(
                and(
                  eq(userAndExpertChats.id, row.id),
                  notDistinctFrom("message", row.message),
                ),
              );
            const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
            if (rowCount === 0) {
              skipped += 1;
              console.warn(`[backfill]   SKIPPED user_and_expert_chats ${row.id} (concurrently modified)`);
            } else {
              changed += 1;
            }
          } catch (err: unknown) {
            errors += 1;
            console.error(
              `[backfill]   ERROR updating user_and_expert_chats ${row.id}:`,
              (err as Error)?.message ?? err,
            );
          }
        };
      })
      .filter((t): t is () => Promise<void> => t !== null);

    await pool(tasks, UPDATE_CONCURRENCY);

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(
    `[backfill]   done — ${inspected} inspected, ${changed} changed, ${skipped} skipped (concurrent), ${errors} error(s)`,
  );
  return { inspected, changed, skipped, errors };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[backfill] Starting provider free-text sanitization backfill…");
  const start = Date.now();

  const results = [
    await backfillProviderServices(),
    await backfillServiceTranslations(),
    await backfillMessages(),
  ];

  const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);
  const totalChanged = results.reduce((acc, r) => acc + r.changed, 0);
  const totalSkipped = results.reduce((acc, r) => acc + r.skipped, 0);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `\n[backfill] Finished in ${elapsed}s — ${totalChanged} row(s) changed, ${totalSkipped} skipped`,
  );

  if (totalErrors > 0) {
    console.error(
      `[backfill] FAILED: ${totalErrors} update error(s) — some rows may still hold unsanitized content. Re-run to retry.`,
    );
    process.exit(1);
  }

  if (totalSkipped > 0) {
    console.warn(
      `[backfill] ${totalSkipped} row(s) were concurrently modified and skipped. Re-run to retry.`,
    );
    // Exit 0: skips are expected during live traffic; the operator can re-run.
  }

  console.log("[backfill] All tables clean.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
