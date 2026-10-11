/**
 * `liteapi-booking-sync` — S1-d-3a (ledger `2026-10-10-s1-d3a-liteapi-booking`). DETECTS, NEVER BOOKS (ruling;
 * the §17 posture): for every live LiteAPI booking that carries LiteAPI's booking id it reads
 * `GET /bookings/{id}` and records `last_synced_at` + `last_sync_status`. It never changes a row's `status`,
 * never books, never cancels and never moves money. Rows it cannot read — a `booking` claim with no LiteAPI id
 * (the crash between payment and book) and `prebooked` rows older than a day — are REPORTED by count, for a
 * person to resolve. Sandbox only (`liteapiBookingEnabled`); off ⇒ `skipped: booking_disabled`.
 */
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { liteapiBookings } from "@shared/schema";
import { bookingStatusOf } from "@shared/liteapi-booking";
import { liteapiBookingEnabled, liteapiConfig, type LiteapiConfig } from "../config/liteapi.config";
import { createLiteapiClient, type LiteapiClient } from "../services/liteapi-client";
import { logger } from "../infrastructure/logger";

export const LITEAPI_BOOKING_SYNC_BATCH = 50;

export interface LiteapiBookingSyncResult {
  at: string;
  skipped?: "booking_disabled";
  read: number;
  readFailed: number;
  /** LiteAPI's status differs from ours — reported, never applied. */
  disagree: Array<{ id: string; ours: string; theirs: string }>;
  strandedBooking: number;
  stalePrebooked: number;
  error?: string;
}

export async function runLiteapiBookingSync(opts: { now?: Date; config?: () => LiteapiConfig | null; client?: (cfg: LiteapiConfig) => LiteapiClient } = {}): Promise<LiteapiBookingSyncResult> {
  const now = opts.now ?? new Date();
  const out: LiteapiBookingSyncResult = { at: now.toISOString(), read: 0, readFailed: 0, disagree: [], strandedBooking: 0, stalePrebooked: 0 };
  const cfg = (opts.config ?? (() => liteapiConfig()))();
  if (!liteapiBookingEnabled(cfg)) {
    out.skipped = "booking_disabled";
    return out;
  }
  try {
    const client = (opts.client ?? createLiteapiClient)(cfg);
    const rows = await db
      .select({ id: liteapiBookings.id, status: liteapiBookings.status, liteapiBookingId: liteapiBookings.liteapiBookingId })
      .from(liteapiBookings)
      .where(and(eq(liteapiBookings.env, cfg.env), inArray(liteapiBookings.status, ["booking", "confirmed", "cancelling"]), isNotNull(liteapiBookings.liteapiBookingId)))
      .orderBy(sql`last_synced_at ASC NULLS FIRST`)
      .limit(LITEAPI_BOOKING_SYNC_BATCH);
    for (const r of rows) {
      let theirs: string | null = null;
      try {
        theirs = bookingStatusOf(await client.getBooking(r.liteapiBookingId!));
        out.read++;
      } catch (err: any) {
        out.readFailed++;
        logger.warn({ job: "liteapi-booking-sync", id: r.id, err: String(err?.message ?? err).slice(0, 200) }, "[liteapi-booking-sync] read failed");
        continue;
      }
      // Facts only: when we read it and what LiteAPI said. The row's own status is never written here.
      await db.update(liteapiBookings).set({ lastSyncedAt: now, lastSyncStatus: theirs }).where(eq(liteapiBookings.id, r.id));
      const expected = r.status === "confirmed" ? "CONFIRMED" : r.status === "cancelling" ? "CANCELLED" : null;
      if (theirs && expected && theirs !== expected) out.disagree.push({ id: r.id, ours: r.status, theirs });
      if (theirs && r.status === "booking") out.disagree.push({ id: r.id, ours: r.status, theirs });
    }
    const [stranded] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(liteapiBookings)
      .where(and(eq(liteapiBookings.env, cfg.env), eq(liteapiBookings.status, "booking"), isNull(liteapiBookings.liteapiBookingId)));
    out.strandedBooking = Number(stranded?.n ?? 0);
    const [stale] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(liteapiBookings)
      .where(and(eq(liteapiBookings.env, cfg.env), eq(liteapiBookings.status, "prebooked"), lt(liteapiBookings.createdAt, new Date(now.getTime() - 86_400_000))));
    out.stalePrebooked = Number(stale?.n ?? 0);
  } catch (err: any) {
    out.error = String(err?.message ?? err).slice(0, 300);
  }
  logger.info({ job: "liteapi-booking-sync", ...out }, "[liteapi-booking-sync] pass");
  return out;
}
