/**
 * One-time backfill: sanitize provider free-text columns that were written
 * before the write-path guard (task 1135) was deployed.
 *
 * Applies `sanitizeText` from server/utils/text-sanitizer.ts to:
 *   • provider_services  — serviceName, shortDescription, description,
 *                          meetingPoint, pickupAddress, dropOffPoint, scopeStatement
 *   • service_translations — serviceName, shortDescription, description, meetingPoint
 *   • user_and_expert_chats — message
 *
 * Idempotent: rows where sanitizing produces no change are skipped (no UPDATE issued).
 * Running the script a second time will report 0 rows changed per table.
 *
 * Usage:
 *   npx tsx scripts/backfill-provider-text-sanitize.ts
 *
 * For production, set DATABASE_URL to the production connection string and run
 * the same command; all other env vars are not required.
 */

import { db } from "../server/db";
import {
  providerServices,
  serviceTranslations,
  userAndExpertChats,
} from "@shared/schema";
import { sanitizeText } from "../server/utils/text-sanitizer";
import { sql, eq } from "drizzle-orm";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return true when at least one key in `patch` differs from `row`. */
function hasChanges(
  row: Record<string, unknown>,
  patch: Record<string, string | null | undefined>,
): boolean {
  return Object.entries(patch).some(([k, v]) => row[k] !== v);
}

/** Process a table in batches of `batchSize` rows, applying `sanitizeFn` to each. */
async function backfillTable<T extends { id: string | number }>(opts: {
  label: string;
  fetchAll: () => Promise<T[]>;
  sanitize: (row: T) => Record<string, string | null | undefined>;
  update: (id: string | number, patch: Record<string, string | null | undefined>) => Promise<void>;
}): Promise<void> {
  const { label, fetchAll, sanitize, update } = opts;

  console.log(`\n[backfill] ── ${label} ──`);

  let rows: T[];
  try {
    rows = await fetchAll();
  } catch (err: unknown) {
    console.error(`[backfill]   FETCH failed:`, (err as Error)?.message ?? err);
    return;
  }

  console.log(`[backfill]   ${rows.length} row(s) to inspect`);

  let changed = 0;
  let errors = 0;

  for (const row of rows) {
    const patch = sanitize(row);
    if (!hasChanges(row as unknown as Record<string, unknown>, patch)) continue;

    try {
      await update(row.id, patch);
      changed += 1;
      if (changed <= 10) {
        console.log(`[backfill]   updated ${row.id}`);
      } else if (changed === 11) {
        console.log(`[backfill]   (further individual IDs suppressed)`);
      }
    } catch (err: unknown) {
      errors += 1;
      console.error(
        `[backfill]   ERROR updating ${row.id}:`,
        (err as Error)?.message ?? err,
      );
    }
  }

  console.log(
    `[backfill]   done — ${changed} row(s) changed, ${errors} error(s)`,
  );
}

// ── provider_services ─────────────────────────────────────────────────────────

async function backfillProviderServices(): Promise<void> {
  await backfillTable({
    label: "provider_services",

    fetchAll: () =>
      db
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
        .from(providerServices),

    sanitize: (row) => ({
      serviceName: sanitizeText(row.serviceName) ?? row.serviceName,
      shortDescription: sanitizeText(row.shortDescription),
      description: sanitizeText(row.description),
      meetingPoint: sanitizeText(row.meetingPoint),
      pickupAddress: sanitizeText(row.pickupAddress),
      dropOffPoint: sanitizeText(row.dropOffPoint),
      scopeStatement: sanitizeText(row.scopeStatement),
    }),

    update: async (id, patch) => {
      await db
        .update(providerServices)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(providerServices.id, id as string));
    },
  });
}

// ── service_translations ──────────────────────────────────────────────────────

async function backfillServiceTranslations(): Promise<void> {
  await backfillTable({
    label: "service_translations",

    fetchAll: () =>
      db
        .select({
          id: serviceTranslations.id,
          serviceName: serviceTranslations.serviceName,
          shortDescription: serviceTranslations.shortDescription,
          description: serviceTranslations.description,
          meetingPoint: serviceTranslations.meetingPoint,
        })
        .from(serviceTranslations),

    sanitize: (row) => ({
      serviceName: sanitizeText(row.serviceName),
      shortDescription: sanitizeText(row.shortDescription),
      description: sanitizeText(row.description),
      meetingPoint: sanitizeText(row.meetingPoint),
    }),

    update: async (id, patch) => {
      await db
        .update(serviceTranslations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(serviceTranslations.id, id as string));
    },
  });
}

// ── user_and_expert_chats (messages) ─────────────────────────────────────────

async function backfillMessages(): Promise<void> {
  await backfillTable({
    label: "user_and_expert_chats (messages)",

    fetchAll: () =>
      db
        .select({
          id: userAndExpertChats.id,
          message: userAndExpertChats.message,
        })
        .from(userAndExpertChats),

    sanitize: (row) => ({
      message: sanitizeText(row.message),
    }),

    update: async (id, patch) => {
      await db
        .update(userAndExpertChats)
        .set(patch)
        .where(eq(userAndExpertChats.id, id as string));
    },
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[backfill] Starting provider free-text sanitization backfill…");
  const start = Date.now();

  await backfillProviderServices();
  await backfillServiceTranslations();
  await backfillMessages();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[backfill] Finished in ${elapsed}s`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
