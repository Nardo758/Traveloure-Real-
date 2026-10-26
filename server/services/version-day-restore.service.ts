/**
 * THE REPLACED DAY — save it inside apply-days, and put it back (ledger
 * `2026-10-25-d3-restore-day`; migration 412, HELD — 411 is PR #1696).
 *
 * apply-days calls `readDayBefore` before it deletes or moves, then
 * `writeAppliedDaySnapshot` in the SAME transaction after the day's writes (and after
 * where-you-stay). A dry run never calls either. Restore is one transaction under the
 * plan row's lock: the inserted stops are removed with apply's own guard, moved rows go
 * back, deleted rows and their comments are re-inserted with their original ids.
 *
 * Retention (Architect, 2026-10-25): 14 days (`DAY_RESTORE_RETENTION_MS`); only the newest
 * snapshot per day is live; expired rows are purged lazily at the next apply on that trip.
 * A day edited after apply is refused (`day_changed_since_apply`) and nothing is written.
 * Restore does not charge, does not record a toll, and does not retime a day.
 */
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  DAY_RESTORE_RETENTION_MS,
  dayAfterSignature,
  dayRestoreState,
  daySnapshotExpired,
  type DayRestoreState,
} from "@shared/version-board";
import { itineraryItems } from "@shared/schema";
import { db } from "../db";
import { itineraryItemNotMachineProtected } from "./itinerary-rebuild-guard";

export class DayRestoreError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/** The rows apply-days may rewrite: in planning, not booked, not machine-protected. */
export function dayRewriteWhere(tripId: string, id: string) {
  return and(
    eq(itineraryItems.id, id),
    eq(itineraryItems.tripId, tripId),
    eq(itineraryItems.routingStatus, "in_planning"),
    sql`${itineraryItems.bookingId} IS NULL`,
    itineraryItemNotMachineProtected(),
  );
}

function asJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value ?? fallback) as T;
}

function idList(ids: string[]) {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

/** Full `to_jsonb` rows. `dayAfterSignature` drops the excluded columns; this reader does not pick a column list. */
export async function readDaySignatureRows(exec: { execute: typeof db.execute }, tripId: string, day: number): Promise<Record<string, unknown>[]> {
  const res = await exec.execute(sql`
    SELECT to_jsonb(i) AS row
    FROM itinerary_items i
    WHERE i.trip_id = ${tripId} AND i.day_number = ${day}
  `);
  return ((res.rows ?? []) as Array<{ row: unknown }>).map((r) => asJson<Record<string, unknown>>(r.row, {}));
}

/** Full rows apply is about to delete or move, plus the comments of the rows it will delete. */
export async function readDayBefore(
  tx: { execute: typeof db.execute },
  tripId: string,
  deleteIds: string[],
  moveIds: string[],
): Promise<{ beforeItems: unknown[]; beforeComments: unknown[] }> {
  const ids = Array.from(new Set(deleteIds.concat(moveIds)));
  if (!ids.length) return { beforeItems: [], beforeComments: [] };
  const items = await tx.execute(sql`
    SELECT to_jsonb(i) AS row
    FROM itinerary_items i
    WHERE i.trip_id = ${tripId} AND i.id IN (${idList(ids)})
  `);
  const beforeItems = ((items.rows ?? []) as Array<{ row: unknown }>)
    .map((r) => asJson<Record<string, unknown>>(r.row, {}))
    .filter((r) => r && typeof r.id === "string")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let beforeComments: unknown[] = [];
  if (deleteIds.length) {
    const comments = await tx.execute(sql`
      SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) AS rows
      FROM trip_item_comments c
      WHERE c.item_id IN (${idList(deleteIds)})
    `);
    const raw = asJson<unknown>((comments.rows?.[0] as { rows?: unknown } | undefined)?.rows, []);
    beforeComments = Array.isArray(raw) ? raw : [];
  }
  return { beforeItems, beforeComments };
}

/** Expired snapshots for this plan. Called from apply-days only, inside its transaction, never on a dry run. */
export async function purgeExpiredDaySnapshots(tx: { execute: typeof db.execute }, tripId: string, now: Date): Promise<void> {
  await tx.execute(sql`
    DELETE FROM plan_day_restore_snapshots
    WHERE trip_id = ${tripId} AND expires_at <= ${now}
  `);
}

export interface AppliedDaySnapshotInput {
  tripId: string;
  applyId: string;
  day: number;
  runId: string | null;
  variantId: string;
  appliedBy: string;
  appliedAt: Date;
  beforeItems: unknown[];
  beforeComments: unknown[];
  insertedItemIds: string[];
}

/** Supersede the day's older snapshots and insert this apply's row. Returns the new id. */
export async function writeAppliedDaySnapshot(tx: { execute: typeof db.execute }, input: AppliedDaySnapshotInput): Promise<string> {
  await tx.execute(sql`
    UPDATE plan_day_restore_snapshots
    SET superseded_at = ${input.appliedAt}
    WHERE trip_id = ${input.tripId}
      AND day_number = ${input.day}
      AND superseded_at IS NULL
  `);
  const signature = dayAfterSignature(await readDaySignatureRows(tx, input.tripId, input.day));
  const id = crypto.randomUUID();
  const expiresAt = new Date(input.appliedAt.getTime() + DAY_RESTORE_RETENTION_MS);
  await tx.execute(sql`
    INSERT INTO plan_day_restore_snapshots (
      id, trip_id, apply_id, day_number, run_id, variant_id, applied_by,
      applied_at, expires_at, before_items, before_comments, inserted_item_ids, after_signature
    ) VALUES (
      ${id}, ${input.tripId}, ${input.applyId}, ${input.day}, ${input.runId}, ${input.variantId}, ${input.appliedBy},
      ${input.appliedAt}, ${expiresAt},
      CAST(${JSON.stringify(input.beforeItems)} AS jsonb),
      CAST(${JSON.stringify(input.beforeComments)} AS jsonb),
      CAST(${JSON.stringify(input.insertedItemIds)} AS jsonb),
      ${signature}
    )
  `);
  return id;
}

export interface RestorableDay {
  day: number;
  snapshotId: string;
  appliedAt: string;
  state: DayRestoreState;
}

/** Newest unrestored, unsuperseded snapshot per day. No row, no entry. */
export async function listRestorableDays(tripId: string, now = new Date()): Promise<{ days: RestorableDay[] }> {
  const trip = await db.execute(sql`SELECT finalized_at FROM trips WHERE id = ${tripId} LIMIT 1`);
  const finalized = !!(trip.rows?.[0] as { finalized_at?: Date | null } | undefined)?.finalized_at;
  const snaps = await db.execute(sql`
    SELECT DISTINCT ON (day_number)
      id, day_number, applied_at, expires_at, after_signature
    FROM plan_day_restore_snapshots
    WHERE trip_id = ${tripId}
      AND restored_at IS NULL
      AND superseded_at IS NULL
    ORDER BY day_number, applied_at DESC
  `);
  const days: RestorableDay[] = [];
  for (const row of (snaps.rows ?? []) as Array<Record<string, unknown>>) {
    const day = Number(row.day_number);
    const current = dayAfterSignature(await readDaySignatureRows(db, tripId, day));
    const applied = row.applied_at instanceof Date ? row.applied_at : new Date(String(row.applied_at));
    days.push({
      day,
      snapshotId: String(row.id),
      appliedAt: applied.toISOString(),
      state: dayRestoreState({
        finalized,
        expiresAt: (row.expires_at as Date | string | null) ?? null,
        now,
        afterSignature: String(row.after_signature),
        currentSignature: current,
      }),
    });
  }
  days.sort((a, b) => a.day - b.day);
  return { days };
}

export type RestoreDayResult =
  | { restored: true; alreadyRestored: false; day: number; snapshotId: string }
  | { restored: false; alreadyRestored: true };

/**
 * Put one day back. Idempotent once restored. A finalized plan, a superseded or expired
 * snapshot, and a day that has changed since apply are refused with nothing written.
 */
export async function restoreDay(input: {
  tripId: string;
  userId: string;
  day: number;
  snapshotId: string;
  now?: Date;
}): Promise<RestoreDayResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT finalized_at FROM trips WHERE id = ${input.tripId} FOR UPDATE`);
    if ((locked.rows?.[0] as { finalized_at?: Date | null } | undefined)?.finalized_at) {
      throw new DayRestoreError(409, "plan_finalized", "Reopen the plan first");
    }
    const snapRes = await tx.execute(sql`
      SELECT * FROM plan_day_restore_snapshots WHERE id = ${input.snapshotId} FOR UPDATE
    `);
    const snap = snapRes.rows?.[0] as Record<string, unknown> | undefined;
    if (!snap || snap.trip_id !== input.tripId || Number(snap.day_number) !== input.day) {
      throw new DayRestoreError(404, "not_found", "No such saved day");
    }
    if (snap.restored_at) return { restored: false, alreadyRestored: true };
    if (snap.superseded_at || daySnapshotExpired(snap.expires_at as Date | string | null, now)) {
      throw new DayRestoreError(409, "restore_expired", "This saved day has expired");
    }
    const current = dayAfterSignature(await readDaySignatureRows(tx, input.tripId, input.day));
    if (current !== String(snap.after_signature)) {
      throw new DayRestoreError(409, "day_changed_since_apply", "This day changed since it was adopted");
    }

    const insertedIds = asJson<unknown[]>(snap.inserted_item_ids, []).filter((x): x is string => typeof x === "string");
    for (const itemId of insertedIds) {
      // item-removed:replace — restoring a day removes the stops apply-days inserted for it.
      await tx.delete(itineraryItems).where(dayRewriteWhere(input.tripId, itemId));
    }

    const beforeItems = asJson<Array<Record<string, unknown>>>(snap.before_items, []).filter((r) => r && typeof r.id === "string");
    const existing = new Set<string>();
    if (beforeItems.length) {
      const found = await tx.execute(sql`
        SELECT id FROM itinerary_items
        WHERE trip_id = ${input.tripId} AND id IN (${idList(beforeItems.map((r) => String(r.id)))})
      `);
      for (const row of (found.rows ?? []) as Array<{ id: string }>) existing.add(row.id);
    }

    for (const row of beforeItems) {
      if (!existing.has(String(row.id))) continue;
      const upd = await tx
        .update(itineraryItems)
        .set({
          dayNumber: row.day_number as number,
          startTime: (row.start_time as string | null) ?? null,
          endTime: (row.end_time as string | null) ?? null,
          sortOrder: row.sort_order as number | null,
          sourceRunId: (row.source_run_id as string | null) ?? null,
          sourceVariantId: (row.source_variant_id as string | null) ?? null,
          updatedAt: row.updated_at ? new Date(String(row.updated_at)) : now,
        } as any)
        .where(dayRewriteWhere(input.tripId, String(row.id)))
        .returning({ id: itineraryItems.id });
      if (!upd.length) throw new DayRestoreError(409, "day_changed_since_apply", "This day changed since it was adopted");
    }

    for (const row of beforeItems) {
      if (existing.has(String(row.id))) continue;
      await tx.execute(sql`
        INSERT INTO itinerary_items
        SELECT rec.* FROM jsonb_populate_record(NULL::itinerary_items, CAST(${JSON.stringify(row)} AS jsonb)) AS rec
      `);
    }

    const comments = asJson<unknown[]>(snap.before_comments, []);
    if (comments.length) {
      await tx.execute(sql`
        INSERT INTO trip_item_comments
        SELECT rec.* FROM jsonb_populate_recordset(NULL::trip_item_comments, CAST(${JSON.stringify(comments)} AS jsonb)) AS rec
      `);
    }

    await tx.execute(sql`
      UPDATE plan_day_restore_snapshots
      SET restored_at = ${now}, restored_by = ${input.userId}
      WHERE id = ${input.snapshotId} AND restored_at IS NULL
    `);
    return { restored: true, alreadyRestored: false, day: input.day, snapshotId: input.snapshotId };
  });
}
