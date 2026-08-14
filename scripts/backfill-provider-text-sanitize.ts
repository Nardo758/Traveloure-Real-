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
 * Design:
 *   • Keyset-paginated reads (BATCH_SIZE rows at a time) — never loads a full table.
 *   • Bounded parallel updates within each batch (UPDATE_CONCURRENCY).
 *   • Idempotent: rows where sanitizing produces no change are never updated.
 *   • Any fetch or update error is counted and printed; the process exits non-zero
 *     when any errors occurred so callers / CI know the run was incomplete.
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
import { gt, eq, sql } from "drizzle-orm";

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

/** Return true when at least one key in `patch` differs from `row`. */
function hasChanges(
  row: Record<string, unknown>,
  patch: Record<string, string | null | undefined>,
): boolean {
  return Object.entries(patch).some(([k, v]) => row[k] !== v);
}

interface TableResult {
  inspected: number;
  changed: number;
  errors: number;
}

// ── provider_services ─────────────────────────────────────────────────────────

async function backfillProviderServices(): Promise<TableResult> {
  console.log("\n[backfill] ── provider_services ──");

  let cursor = "";
  let inspected = 0;
  let changed = 0;
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
        const patch = {
          serviceName: sanitizeText(row.serviceName) ?? row.serviceName,
          shortDescription: sanitizeText(row.shortDescription),
          description: sanitizeText(row.description),
          meetingPoint: sanitizeText(row.meetingPoint),
          pickupAddress: sanitizeText(row.pickupAddress),
          dropOffPoint: sanitizeText(row.dropOffPoint),
          scopeStatement: sanitizeText(row.scopeStatement),
        };
        if (!hasChanges(row as Record<string, unknown>, patch)) return null;
        return async () => {
          try {
            await db
              .update(providerServices)
              .set({ ...patch, updatedAt: new Date() })
              .where(eq(providerServices.id, row.id));
            changed += 1;
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
    `[backfill]   done — ${inspected} inspected, ${changed} changed, ${errors} error(s)`,
  );
  return { inspected, changed, errors };
}

// ── service_translations ──────────────────────────────────────────────────────

async function backfillServiceTranslations(): Promise<TableResult> {
  console.log("\n[backfill] ── service_translations ──");

  let cursor = "";
  let inspected = 0;
  let changed = 0;
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
        const patch = {
          serviceName: sanitizeText(row.serviceName),
          shortDescription: sanitizeText(row.shortDescription),
          description: sanitizeText(row.description),
          meetingPoint: sanitizeText(row.meetingPoint),
        };
        if (!hasChanges(row as Record<string, unknown>, patch)) return null;
        return async () => {
          try {
            await db
              .update(serviceTranslations)
              .set({ ...patch, updatedAt: new Date() })
              .where(eq(serviceTranslations.id, row.id));
            changed += 1;
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
    `[backfill]   done — ${inspected} inspected, ${changed} changed, ${errors} error(s)`,
  );
  return { inspected, changed, errors };
}

// ── user_and_expert_chats (messages) ─────────────────────────────────────────

async function backfillMessages(): Promise<TableResult> {
  console.log("\n[backfill] ── user_and_expert_chats (messages) ──");

  let cursor = "";
  let inspected = 0;
  let changed = 0;
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
        const patch = { message: sanitizeText(row.message) };
        if (!hasChanges(row as Record<string, unknown>, patch)) return null;
        return async () => {
          try {
            await db
              .update(userAndExpertChats)
              .set(patch)
              .where(eq(userAndExpertChats.id, row.id));
            changed += 1;
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
    `[backfill]   done — ${inspected} inspected, ${changed} changed, ${errors} error(s)`,
  );
  return { inspected, changed, errors };
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
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `\n[backfill] Finished in ${elapsed}s — ${totalChanged} row(s) changed across all tables`,
  );

  if (totalErrors > 0) {
    console.error(
      `[backfill] FAILED: ${totalErrors} update error(s) — some rows may still hold unsanitized content. Re-run to retry.`,
    );
    process.exit(1);
  }

  console.log("[backfill] All tables clean.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
